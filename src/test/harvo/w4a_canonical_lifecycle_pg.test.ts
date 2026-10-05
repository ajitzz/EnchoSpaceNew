import {createHash, randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {acquireHold} from '../../services/inventoryHoldService.js';
import {createItineraryQuote} from '../../services/itineraryQuoteService.js';
import {
  assertLifecycleWorkerRole,
  requestReservationCancellation,
  getReservationLifecycle,
  LifecycleAuthorityError,
} from '../../services/canonicalLifecycleService.js';
import {addDays, createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('W4-A Task 2: Canonical Reservation Lifecycle Authority', () => {
  let fixture: Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let stays: pg.Pool;
  let reservationWorker: pg.Pool;
  let paymentWorker: pg.Pool;
  let compositionWorker: pg.Pool;
  let lifecycleWorker: pg.Pool;
  let offerId: string;
  let nextOffset = 1;

  beforeAll(async () => {
    fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner, '041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');

    // Provision restricted payment worker role
    await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');

    // Provision restricted composition worker role
    await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

    // Provision restricted lifecycle worker role
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker', max: 8});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 8});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker', max: 8});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker', max: 8});

    await assertLifecycleWorkerRole(lifecycleWorker);

    // Establish accepted offer
    const service = new AcceptedOfferService(
      fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'),
      'LOCAL'
    );
    const draft = await service.createDraft(fixture.principal(10), {
      commandId: randomUUID(),
      listingId: 1,
      roomTypeId: 101,
      amountMinor: '550000',
      stayStart: fixture.today,
      stayEnd: addDays(fixture.today, 365),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
      maxGuests: 2,
      minNights: 1,
    });
    const submitted = await service.submit(fixture.principal(10), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: draft.version,
    });
    await fixture.grantOffer(draft.offerId);
    await service.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: submitted.version,
    });
    offerId = draft.offerId;
  }, 90000);

  afterAll(async () => {
    await Promise.all([
      stays?.end(),
      reservationWorker?.end(),
      paymentWorker?.end(),
      compositionWorker?.end(),
      lifecycleWorker?.end(),
    ]);
    await fixture?.close();
  });

  const createCommittedReservation = async (principal = 'user:10', nights = 1) => {
    const start = nextOffset;
    nextOffset += nights + 1;
    const checkIn = addDays(fixture.today, start);
    const checkOut = addDays(fixture.today, start + nights);

    const quote = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn,
        checkOut,
        guestCount: 2,
        requestId: randomUUID(),
      },
      principal
    );

    const holdResult = await acquireHold(stays, {
      roomTypeId: 101,
      checkIn,
      checkOut,
      quantity: 1,
      idempotencyKey: randomUUID(),
      quoteId: quote.id,
      holderPrincipal: principal,
      userId: 10,
    });
    expect(holdResult.success).toBe(true);

    const client = await reservationWorker.connect();
    try {
      await client.query(`SELECT set_config('app.stays_principal', $1, false)`, [principal]);
      const commandId = randomUUID();
      const {rows} = await client.query<{reservation_id: string; replayed: boolean}>(
        `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
        [holdResult.hold!.id, quote.id, commandId]
      );
      return {
        reservationId: rows[0].reservation_id,
        quoteId: quote.id,
        holdId: holdResult.hold!.id,
        holderPrincipal: principal,
        checkIn,
        checkOut,
      };
    } finally {
      client.release();
    }
  };

  it('1. no trusted transaction/session principal + caller declares reservation holder -> DENIED (GPT-6 reproduced bypass)', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    // 1a. Via service without authenticated principal
    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: randomUUID(),
          reservationId,
          actorPrincipal: holderPrincipal,
          reasonCode: 'UNAUTHENTICATED_ATTEMPT',
        }
        // no authenticatedPrincipal passed!
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_PRINCIPAL_REQUIRED',
      })
    );

    // 1b. Direct SQL execution by restricted lifecycle worker without app.stays_principal set
    const client = await lifecycleWorker.connect();
    try {
      await expect(
        client.query(
          `SELECT * FROM canonical_request_reservation_cancellation(
            $1::uuid, $2::uuid, 'GUEST', $3, 'RAW_SQL_BYPASS', NULL
          )`,
          [randomUUID(), reservationId, holderPrincipal]
        )
      ).rejects.toThrow(/LIFECYCLE_PRINCIPAL_REQUIRED/);
    } finally {
      client.release();
    }

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(0);
  });

  it('2. trusted principal = reservation holder + own ENCHO_DIRECT reservation -> CANCELLATION_REQUESTED accepted', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    const result = await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'GUEST_REQUESTED',
        reasonText: 'Schedule conflict arose',
      },
      holderPrincipal
    );

    expect(result.reservationId).toBe(reservationId);
    expect(result.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(result.sequenceNumber).toBe(1);
    expect(result.replayed).toBe(false);
    expect(result.eventId).toBeDefined();

    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(projection!.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(projection!.currentSequence).toBe(1);
    expect(projection!.latestEventId).toBe(result.eventId);
    expect(projection!.latestActorKind).toBe('GUEST');
    expect(projection!.latestActorPrincipal).toBe(holderPrincipal);
    expect(projection!.latestReasonCode).toBe('GUEST_REQUESTED');
    expect(projection!.latestReasonText).toBe('Schedule conflict arose');

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(1);
  });

  it('3. trusted principal = foreign Guest -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: randomUUID(),
          reservationId,
          reasonCode: 'ATTEMPT_HIJACK',
        },
        'user:99' // foreign authenticated principal!
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_FORBIDDEN',
      })
    );

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(0);

    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(projection!.lifecycleState).toBe('ACTIVE');
  });

  it('4. trusted principal = reservation holder but caller attempts different actor_principal text -> denied/conflict', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: randomUUID(),
          reservationId,
          actorPrincipal: 'user:99', // mismatched text!
          reasonCode: 'ATTEMPT_MISMATCH',
        },
        holderPrincipal // trusted principal is user:10
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_FORBIDDEN',
      })
    );

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(0);
  });

  it('5. Guest attempts lifecycle request for EXTERNAL_CHANNEL reservation -> denied (GPT-6 reproduced bypass)', async () => {
    const extReservationId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservations(
        id, origin_kind, listing_id, room_type_id, check_in_date, check_out_date,
        nights, guest_count, room_subtotal_paise, currency, status, command_id,
        command_fingerprint, holder_principal
      ) VALUES (
        $1, 'EXTERNAL_CHANNEL', 1, 101, $2::date, $3::date,
        2, 2, 0, 'INR', 'INVENTORY_COMMITTED', $4,
        $5, 'user:10'
      )`,
      [
        extReservationId,
        addDays(fixture.today, 80),
        addDays(fixture.today, 82),
        randomUUID(),
        createHash('sha256').update('ext-fixture-5').digest('hex'),
      ]
    );

    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: randomUUID(),
          reservationId: extReservationId,
          reasonCode: 'EXTERNAL_ATTEMPT',
        },
        'user:10'
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED',
      })
    );

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [extReservationId]
    );
    expect(rows[0].count).toBe(0);
  });

  it('6. Guest tries to submit origin_kind = EXTERNAL_CHANNEL -> denied / schema rejected', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: randomUUID(),
          reservationId,
          originKind: 'EXTERNAL_CHANNEL',
          reasonCode: 'FORGED_ORIGIN',
        },
        holderPrincipal
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED',
      })
    );
  });

  it('7. exact committed request: response lost, same authenticated principal retries -> same event ID -> replayed=true', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    const first = await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'LOST_RESPONSE_REPLAY',
        reasonText: 'First attempt commits',
      },
      holderPrincipal
    );
    expect(first.replayed).toBe(false);

    const second = await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'LOST_RESPONSE_REPLAY',
        reasonText: 'First attempt commits',
      },
      holderPrincipal
    );
    expect(second.replayed).toBe(true);
    expect(second.eventId).toBe(first.eventId);
    expect(second.reservationId).toBe(first.reservationId);
    expect(second.lifecycleState).toBe(first.lifecycleState);
    expect(second.sequenceNumber).toBe(first.sequenceNumber);

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(1);
  });

  it('8. exact command replay by foreign authenticated principal -> denied/conflict', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'LEGIT_REQUEST',
      },
      holderPrincipal
    );

    // Foreign guest tries to replay the same commandId against the same reservation
    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId,
          reasonCode: 'LEGIT_REQUEST',
        },
        'user:99' // foreign authenticated caller!
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_FORBIDDEN',
      })
    );
  });

  it('9. same command ID + changed reason semantics -> LIFECYCLE_COMMAND_CONFLICT', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'ORIGINAL_REASON',
        reasonText: 'Text 1',
      },
      holderPrincipal
    );

    // 9a. changed reason code
    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId,
          reasonCode: 'CHANGED_REASON',
          reasonText: 'Text 1',
        },
        holderPrincipal
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_COMMAND_CONFLICT',
      })
    );

    // 9b. changed reason text
    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId,
          reasonCode: 'ORIGINAL_REASON',
          reasonText: 'Text 2',
        },
        holderPrincipal
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_COMMAND_CONFLICT',
      })
    );
  });

  it('10. concurrent identical authenticated Guest requests -> one lifecycle event', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    const [res1, res2] = await Promise.all([
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId,
          reasonCode: 'CONCURRENT_IDENTICAL',
          reasonText: 'Racing same command',
        },
        holderPrincipal
      ),
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId,
          reasonCode: 'CONCURRENT_IDENTICAL',
          reasonText: 'Racing same command',
        },
        holderPrincipal
      ),
    ]);

    expect(res1.eventId).toBe(res2.eventId);
    expect(res1.reservationId).toBe(res2.reservationId);
    expect(res1.sequenceNumber).toBe(1);
    expect(res2.sequenceNumber).toBe(1);
    expect([res1.replayed, res2.replayed].sort()).toEqual([false, true]);

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(1);
  });

  it('11. concurrent different commands for same ACTIVE -> CANCELLATION_REQUESTED -> one transition only', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const cmd1 = randomUUID();
    const cmd2 = randomUUID();

    const results = await Promise.allSettled([
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: cmd1,
          reservationId,
          reasonCode: 'RACING_CMD_1',
        },
        holderPrincipal
      ),
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId: cmd2,
          reservationId,
          reasonCode: 'RACING_CMD_2',
        },
        holderPrincipal
      ),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const failure = (rejected[0] as PromiseRejectedResult).reason;
    expect(failure).toBeInstanceOf(LifecycleAuthorityError);
    expect(failure.code).toBe('LIFECYCLE_STATE_CONFLICT');

    const {rows} = await fixture.owner.query(
      `SELECT COUNT(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1`,
      [reservationId]
    );
    expect(rows[0].count).toBe(1);
  });

  it('12. canonical reservation with no events projects ACTIVE', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);

    expect(projection).not.toBeNull();
    expect(projection!.reservationId).toBe(reservationId);
    expect(projection!.lifecycleState).toBe('ACTIVE');
    expect(projection!.currentSequence).toBe(0);
    expect(projection!.latestEventId).toBeNull();
    expect(projection!.latestActorKind).toBeNull();
    expect(projection!.latestActorPrincipal).toBeNull();
    expect(projection!.latestReasonCode).toBeNull();
    expect(projection!.latestReasonText).toBeNull();
    expect(projection!.holderPrincipal).toBe(holderPrincipal);
    expect(projection!.originKind).toBe('ENCHO_DIRECT');
  });

  it('13. W3 reservation row remains unchanged: status = INVENTORY_COMMITTED', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const {rows: beforeRows} = await fixture.owner.query(
      `SELECT * FROM canonical_reservations WHERE id = $1`,
      [reservationId]
    );
    expect(beforeRows[0].status).toBe('INVENTORY_COMMITTED');

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'PLANS_CHANGED',
        reasonText: null,
      },
      holderPrincipal
    );

    const {rows: afterRows} = await fixture.owner.query(
      `SELECT * FROM canonical_reservations WHERE id = $1`,
      [reservationId]
    );
    expect(afterRows[0].status).toBe('INVENTORY_COMMITTED');
    expect(afterRows[0].created_at.toISOString()).toBe(beforeRows[0].created_at.toISOString());
    expect(afterRows[0].finalized_at.toISOString()).toBe(beforeRows[0].finalized_at.toISOString());
    expect(afterRows[0].command_id).toBe(beforeRows[0].command_id);
    expect(afterRows[0].command_fingerprint).toBe(beforeRows[0].command_fingerprint);
  });

  it('14. booked_units remains unchanged', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    const getBookedUnits = async () => {
      const {rows} = await fixture.owner.query(
        `SELECT d.id, d.calendar_date, d.held_units, d.booked_units
         FROM inventory_days d
         JOIN canonical_reservation_nights n ON n.inventory_day_id = d.id
         WHERE n.reservation_id = $1
         ORDER BY d.calendar_date`,
        [reservationId]
      );
      return rows;
    };

    const beforeDays = await getBookedUnits();
    expect(beforeDays.length).toBeGreaterThan(0);
    for (const d of beforeDays) {
      expect(d.booked_units).toBe(1);
      expect(d.held_units).toBe(0);
    }

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'FAMILY_EMERGENCY',
        reasonText: 'Urgent medical requirement',
      },
      holderPrincipal
    );

    const afterDays = await getBookedUnits();
    expect(afterDays).toEqual(beforeDays);
  });

  it('15. no refund/payment rows/effects are created', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    const countPaymentRows = async () => {
      const {rows: pAttempts} = await fixture.owner.query(`SELECT COUNT(*)::int AS count FROM canonical_payment_attempts`);
      const {rows: pReconciliations} = await fixture.owner.query(`SELECT COUNT(*)::int AS count FROM canonical_payment_reconciliations`);
      const {rows: pEvents} = await fixture.owner.query(`SELECT COUNT(*)::int AS count FROM canonical_provider_events`);
      return {
        attempts: pAttempts[0].count,
        reconciliations: pReconciliations[0].count,
        events: pEvents[0].count,
      };
    };

    const beforeCounts = await countPaymentRows();

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'GUEST_CANCELLATION',
        reasonText: 'No refund requested in W4-A',
      },
      holderPrincipal
    );

    const afterCounts = await countPaymentRows();
    expect(afterCounts).toEqual(beforeCounts);
  });

  it('16. same command ID + changed reservation -> conflict', async () => {
    const resA = await createCommittedReservation('user:10');
    const resB = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId: resA.reservationId,
        reasonCode: 'GUEST_REQUESTED',
      },
      resA.holderPrincipal
    );

    await expect(
      requestReservationCancellation(
        lifecycleWorker,
        {
          commandId,
          reservationId: resB.reservationId,
          reasonCode: 'GUEST_REQUESTED',
        },
        resB.holderPrincipal
      )
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_COMMAND_CONFLICT',
      })
    );
  });

  it('17. raw Guest/web role cannot INSERT/UPDATE lifecycle tables', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    await expect(
      stays.query(
        `INSERT INTO canonical_reservation_events(
          reservation_id, sequence_number, event_type, actor_kind, actor_principal,
          origin_kind, reason_code, command_id
        ) VALUES (
          $1, 1, 'CANCELLATION_REQUESTED', 'GUEST', 'user:10', 'ENCHO_DIRECT', 'ATTACK', gen_random_uuid()
        )`,
        [reservationId]
      )
    ).rejects.toThrow(/permission denied/i);

    await expect(
      stays.query(
        `INSERT INTO canonical_reservation_lifecycle_commands(
          command_id, reservation_id, command_type, actor_kind, actor_principal,
          origin_kind, reason_code, command_fingerprint, event_id
        ) VALUES (
          gen_random_uuid(), $1, 'REQUEST_CANCELLATION', 'GUEST', 'user:10',
          'ENCHO_DIRECT', 'ATTACK', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', gen_random_uuid()
        )`,
        [reservationId]
      )
    ).rejects.toThrow(/permission denied/i);

    await expect(
      stays.query(`UPDATE canonical_reservation_events SET reason_code = 'MALICIOUS'`)
    ).rejects.toThrow(/permission denied/i);

    await expect(
      stays.query(`UPDATE canonical_reservation_lifecycle_commands SET reason_code = 'MALICIOUS'`)
    ).rejects.toThrow(/permission denied/i);
  });

  it('18. direct UPDATE/DELETE of lifecycle event rejected', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    const result = await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId,
        reservationId,
        reasonCode: 'VALID_REASON',
      },
      holderPrincipal
    );

    // Owner tries to UPDATE event
    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_events SET reason_code = 'MODIFIED' WHERE event_id = $1`,
        [result.eventId]
      )
    ).rejects.toThrow(/CANONICAL_RESERVATION_EVENT_IMMUTABLE/);

    // Owner tries to DELETE event
    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_events WHERE event_id = $1`,
        [result.eventId]
      )
    ).rejects.toThrow(/CANONICAL_RESERVATION_EVENT_IMMUTABLE/);

    // Owner tries to UPDATE command receipt
    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_lifecycle_commands SET reason_code = 'MODIFIED' WHERE command_id = $1`,
        [commandId]
      )
    ).rejects.toThrow(/CANONICAL_LIFECYCLE_COMMAND_IMMUTABLE/);

    // Owner tries to DELETE command receipt
    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_lifecycle_commands WHERE command_id = $1`,
        [commandId]
      )
    ).rejects.toThrow(/CANONICAL_LIFECYCLE_COMMAND_IMMUTABLE/);
  });

  it('19. legacy bookings.status changes do not alter canonical lifecycle projection', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    // Insert legacy bookings row
    const {rows: bRows} = await fixture.owner.query(
      `INSERT INTO bookings(listing_id, status, start_date, end_date)
       VALUES(1, 'confirmed', '2026-11-01', '2026-11-02') RETURNING id`
    );
    const legacyBookingId = bRows[0].id;

    const before = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(before!.lifecycleState).toBe('ACTIVE');

    // Mutate legacy booking to cancelled
    await fixture.owner.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
      [legacyBookingId]
    );

    const after = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(after!.lifecycleState).toBe('ACTIVE');
    expect(after!.currentSequence).toBe(0);

    // Request canonical cancellation
    await requestReservationCancellation(
      lifecycleWorker,
      {
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'INDEPENDENT_TRUTH',
      },
      holderPrincipal
    );

    const canonicalState = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(canonicalState!.lifecycleState).toBe('CANCELLATION_REQUESTED');

    // Mutate legacy booking to completed
    await fixture.owner.query(
      `UPDATE bookings SET status = 'completed' WHERE id = $1`,
      [legacyBookingId]
    );

    const canonicalStateAfter = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(canonicalStateAfter!.lifecycleState).toBe('CANCELLATION_REQUESTED');
  });

  it('20. no public completed-cancellation API is accidentally added', async () => {
    // Assert canonical_request_reservation_cancellation only transitions to CANCELLATION_REQUESTED
    const {rows: funcRows} = await fixture.owner.query(
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_name LIKE 'canonical_%cancell%'`
    );
    const routineNames = funcRows.map(r => r.routine_name);
    expect(routineNames).toEqual(['canonical_request_reservation_cancellation']);

    // Check allowed event types in canonical_reservation_events check constraint
    const {rows: checkRows} = await fixture.owner.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'canonical_reservation_events'::regclass AND conname LIKE '%event_type%'`
    );
    expect(checkRows[0].def).toContain("'CANCELLATION_REQUESTED'");
    expect(checkRows[0].def).not.toContain("'CANCELLED'");
  });

  it('21. role boundary enforcement: web, payment, and composition roles cannot execute lifecycle transitions', async () => {
    const {reservationId, holderPrincipal} = await createCommittedReservation('user:10');

    // encho_stays_web cannot execute canonical_request_reservation_cancellation
    await expect(
      stays.query(
        `SELECT * FROM canonical_request_reservation_cancellation($1, $2, 'GUEST', $3, 'WEB_ATTEMPT', NULL)`,
        [randomUUID(), reservationId, holderPrincipal]
      )
    ).rejects.toThrow(/permission denied/i);

    // encho_payment_worker cannot execute canonical_request_reservation_cancellation
    await expect(
      paymentWorker.query(
        `SELECT * FROM canonical_request_reservation_cancellation($1, $2, 'GUEST', $3, 'PAYMENT_ATTEMPT', NULL)`,
        [randomUUID(), reservationId, holderPrincipal]
      )
    ).rejects.toThrow(/permission denied/i);

    // encho_composition_worker cannot execute canonical_request_reservation_cancellation
    await expect(
      compositionWorker.query(
        `SELECT * FROM canonical_request_reservation_cancellation($1, $2, 'GUEST', $3, 'COMPOSITION_ATTEMPT', NULL)`,
        [randomUUID(), reservationId, holderPrincipal]
      )
    ).rejects.toThrow(/permission denied/i);

    // lifecycleWorker cannot execute W3-A direct hold finalizer
    await expect(
      lifecycleWorker.query(
        `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
        [randomUUID(), randomUUID(), randomUUID()]
      )
    ).rejects.toThrow(/permission denied/i);

    // lifecycleWorker cannot execute W3-B composition
    await expect(
      lifecycleWorker.query(
        `SELECT * FROM canonical_compose_payment_reservation($1, $2)`,
        [randomUUID(), randomUUID()]
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it('22. assertLifecycleWorkerRole rejects broadened or non-restricted roles', async () => {
    // Calling assertLifecycleWorkerRole with owner pool fails
    await expect(assertLifecycleWorkerRole(fixture.owner)).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
      })
    );

    // Calling assertLifecycleWorkerRole with stays pool fails
    await expect(assertLifecycleWorkerRole(stays)).rejects.toThrow(
      expect.objectContaining({
        name: 'LifecycleAuthorityError',
        code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
      })
    );
  });
});
