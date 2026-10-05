import {createHash, randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {acquireHold} from '../../services/inventoryHoldService.js';
import {createItineraryQuote} from '../../services/itineraryQuoteService.js';
import {
  assertLifecycleWorkerRole,
  assertLifecycleIssuerRole,
  issueCancellationAuthorization,
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
  let lifecycleIssuer: pg.Pool;
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

    // Provision restricted lifecycle issuer role
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);

    // Provision restricted lifecycle worker role
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker', max: 8});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 8});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker', max: 8});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer', max: 8});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker', max: 8});

    await assertLifecycleIssuerRole(lifecycleIssuer);
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
      lifecycleIssuer?.end(),
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
        `SELECT * FROM canonical_finalize_direct_hold($1::uuid, $2::uuid, $3::uuid)`,
        [holdResult.hold!.id, quote.id, commandId]
      );
      expect(rows).toHaveLength(1);
      return {
        reservationId: rows[0].reservation_id,
        holdId: holdResult.hold!.id,
        quoteId: quote.id,
        checkIn,
        checkOut,
        principal,
      };
    } finally {
      client.release();
    }
  };

  const createAuthorizedCancellation = async (
    reservationId: string,
    principal = 'user:10',
    reasonCode = 'GUEST_CANCEL_REQUEST',
    reasonText: string | null = null,
    commandId = randomUUID()
  ) => {
    const auth = await issueCancellationAuthorization(lifecycleIssuer, {
      reservationId,
      commandId,
      reasonCode,
      reasonText,
      authenticatedPrincipal: principal,
    });
    return {auth, commandId};
  };

  // --------------------------------------------------------------------------
  // MANDATORY DIRECT ROLE FORGERY TESTS (Section 10 & 17.1 - 17.4)
  // --------------------------------------------------------------------------

  it('1. lifecycle worker direct GUC forgery -> denied (GPT-6 reproduced defect)', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    // Direct SQL execution by encho_lifecycle_worker attempting GUC self-assertion
    const client = await lifecycleWorker.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.stays_principal', 'user:10', true)`);

      // Attempting to call lifecycle mutation without an independently issued valid authority
      let error: any;
      try {
        await client.query(
          `SELECT * FROM canonical_request_reservation_cancellation(
            $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text
          )`,
          [randomUUID(), randomUUID(), reservationId, 'GUEST_CANCEL_REQUEST', 'hacked']
        );
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK');

      expect(error).toBeDefined();
      expect(error.message).toContain('LIFECYCLE_AUTHORIZATION_NOT_FOUND');
    } finally {
      client.release();
    }
  });

  it('2. lifecycle worker direct caller-principal forgery -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    // Attempting to invoke requestReservationCancellation with arbitrary caller principal
    // without a valid authorization capability
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: randomUUID(),
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'FORGED_REQUEST',
        actorPrincipal: 'user:10',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_AUTHORIZATION_NOT_FOUND'});
  });

  it('3. lifecycle worker arbitrary capability/authority ID -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: randomUUID(),
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'ARBITRARY_AUTH',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_AUTHORIZATION_NOT_FOUND'});
  });

  it('4. lifecycle worker cannot issue authority', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    // 4a. lifecycle worker cannot call canonical_issue_cancellation_authorization
    const client = await lifecycleWorker.connect();
    try {
      let functionError: any;
      try {
        await client.query(
          `SELECT * FROM canonical_issue_cancellation_authorization($1, $2, 'CANCEL', 'text', 'user:10')`,
          [reservationId, randomUUID()]
        );
      } catch (err) {
        functionError = err;
      }
      expect(functionError).toBeDefined();
      expect(functionError.code).toBe('42501'); // PostgreSQL permission_denied

      // 4b. lifecycle worker cannot INSERT into canonical_reservation_lifecycle_authorizations
      let insertError: any;
      try {
        await client.query(
          `INSERT INTO canonical_reservation_lifecycle_authorizations (
            authorization_id, reservation_id, command_id, command_type, guest_principal,
            origin_kind, reason_code, reason_text, expires_at, fingerprint
          ) VALUES ($1, $2, $3, 'REQUEST_CANCELLATION', 'user:10', 'ENCHO_DIRECT', 'CANCEL', NULL, now() + interval '1 hour', $4)`,
          [randomUUID(), reservationId, randomUUID(), '0'.repeat(64)]
        );
      } catch (err) {
        insertError = err;
      }
      expect(insertError).toBeDefined();
      expect(insertError.code).toBe('42501'); // PostgreSQL permission_denied
    } finally {
      client.release();
    }
  });

  // --------------------------------------------------------------------------
  // AUTHORIZATION ISSUANCE & CONSUMPTION TESTS (Section 11 & 17.5 - 17.9)
  // --------------------------------------------------------------------------

  it('5. valid authenticated Guest authority + own ENCHO_DIRECT reservation -> accepted', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(
      reservationId,
      'user:10',
      'GUEST_CANCEL_REQUEST',
      'Guest requested cancellation'
    );

    expect(auth.authorizationId).toBeDefined();
    expect(auth.guestPrincipal).toBe('user:10');

    const result = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });

    expect(result.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(result.sequenceNumber).toBe(1);
    expect(result.replayed).toBe(false);

    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(projection).not.toBeNull();
    expect(projection!.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(projection!.currentSequence).toBe(1);
    expect(projection!.latestActorKind).toBe('GUEST');
    expect(projection!.latestActorPrincipal).toBe('user:10');
  });

  it('6. foreign Guest authority -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    // 6a. Foreign guest attempts to issue authorization for another guest's reservation
    await expect(
      issueCancellationAuthorization(lifecycleIssuer, {
        reservationId,
        commandId: randomUUID(),
        reasonCode: 'UNAUTHORIZED_ATTEMPT',
        authenticatedPrincipal: 'user:99',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_FORBIDDEN'});

    // 6b. Foreign guest has authorization for their own reservation, attempts to use it on user:10's reservation
    const foreignRes = await createCommittedReservation('user:99');
    const {auth: foreignAuth, commandId} = await createAuthorizedCancellation(foreignRes.reservationId, 'user:99');

    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: foreignAuth.authorizationId,
        commandId,
        reservationId, // mismatch!
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});
  });

  it('7. authority/reservation mismatch -> denied', async () => {
    const resA = await createCommittedReservation('user:10');
    const resB = await createCommittedReservation('user:10');

    const {auth, commandId} = await createAuthorizedCancellation(resA.reservationId, 'user:10');

    // Present auth for resA against resB
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId,
        reservationId: resB.reservationId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});
  });

  it('8. authority/command semantic mismatch -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(
      reservationId,
      'user:10',
      'ORIGINAL_REASON',
      'original text'
    );

    // Present auth with changed reason code
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId,
        reservationId,
        reasonCode: 'CHANGED_REASON',
        reasonText: 'original text',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});

    // Present auth with changed command ID
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId: randomUUID(), // changed command ID!
        reservationId,
        reasonCode: 'ORIGINAL_REASON',
        reasonText: 'original text',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});
  });

  it('9. EXTERNAL_CHANNEL reservation -> denied (GPT-6 reproduced defect)', async () => {
    // Synthetic external channel reservation
    const externalResId = randomUUID();
    const commandId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservations (
        id, listing_id, room_type_id, origin_kind, holder_principal,
        check_in_date, check_out_date, nights, guest_count,
        room_subtotal_paise, currency, status, command_id, command_fingerprint
      ) VALUES (
        $1, 1, 101, 'EXTERNAL_CHANNEL', 'user:10',
        '2027-01-01', '2027-01-05', 4, 2,
        550000, 'INR', 'INVENTORY_COMMITTED', $2, $3
      )`,
      [externalResId, commandId, '0'.repeat(64)]
    );

    // 9a. Issuing authorization for EXTERNAL_CHANNEL is rejected fail-closed
    await expect(
      issueCancellationAuthorization(lifecycleIssuer, {
        reservationId: externalResId,
        commandId: randomUUID(),
        reasonCode: 'GUEST_CANCEL',
        authenticatedPrincipal: 'user:10',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED'});

    // 9b. Direct call against EXTERNAL_CHANNEL is rejected
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: randomUUID(),
        commandId: randomUUID(),
        reservationId: externalResId,
        reasonCode: 'GUEST_CANCEL',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED'});
  });

  it('10. Guest tries to submit origin_kind = EXTERNAL_CHANNEL -> denied / schema rejected', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: randomUUID(),
        commandId: randomUUID(),
        reservationId,
        reasonCode: 'GUEST_CANCEL',
        originKind: 'EXTERNAL_CHANNEL',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED'});
  });

  // --------------------------------------------------------------------------
  // REPLAY & IDEMPOTENCY TESTS (Section 8, 9 & 17.10 - 17.11)
  // --------------------------------------------------------------------------

  it('11. exact committed replay by same authenticated Guest -> same event ID -> replayed=true', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(
      reservationId,
      'user:10',
      'GUEST_CANCEL_REQUEST',
      'Guest requested cancellation'
    );

    const first = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });
    expect(first.replayed).toBe(false);

    // 11a. Replaying exact same request returns original event with replayed=true
    const second = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });
    expect(second.replayed).toBe(true);
    expect(second.eventId).toBe(first.eventId);

    // 11b. Re-calling issueCancellationAuthorization for same (reservation, command) recovers same authorization
    const recoveredAuth = await issueCancellationAuthorization(lifecycleIssuer, {
      reservationId,
      commandId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
      authenticatedPrincipal: 'user:10',
    });
    expect(recoveredAuth.authorizationId).toBe(auth.authorizationId);

    // 11c. Consuming recovered authorization returns replayed=true
    const third = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: recoveredAuth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });
    expect(third.replayed).toBe(true);
    expect(third.eventId).toBe(first.eventId);

    // Invariant: exactly 1 event exists
    const {rows: eventRows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_reservation_events WHERE reservation_id = $1',
      [reservationId]
    );
    expect(Number(eventRows[0].count)).toBe(1);
  });

  it('12. unauthorized presentation of another command ID -> denied', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const commandId = randomUUID();
    const {auth} = await createAuthorizedCancellation(reservationId, 'user:10', 'CANCEL', 'text', commandId);

    await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'CANCEL',
      reasonText: 'text',
    });

    // Foreign principal attempts to present commandId without valid authorization
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: randomUUID(),
        commandId,
        reservationId,
        reasonCode: 'CANCEL',
        reasonText: 'text',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_AUTHORIZATION_NOT_FOUND'});

    // Foreign principal creates an authorization for their own reservation and passes victim commandId
    const foreignRes = await createCommittedReservation('user:99');
    const {auth: foreignAuth} = await createAuthorizedCancellation(foreignRes.reservationId, 'user:99', 'CANCEL', 'text');

    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: foreignAuth.authorizationId,
        commandId, // presenting victim's command ID!
        reservationId,
        reasonCode: 'CANCEL',
        reasonText: 'text',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});
  });

  it('13. same command ID + changed reason semantics -> LIFECYCLE_COMMAND_CONFLICT', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const commandId = randomUUID();
    const {auth} = await createAuthorizedCancellation(reservationId, 'user:10', 'REASON_A', 'text A', commandId);

    await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'REASON_A',
      reasonText: 'text A',
    });

    // Attempt replay with same command ID but changed reason
    await expect(
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId,
        reservationId,
        reasonCode: 'REASON_B',
        reasonText: 'text A',
      })
    ).rejects.toMatchObject({code: 'LIFECYCLE_COMMAND_CONFLICT'});
  });

  // --------------------------------------------------------------------------
  // CONCURRENCY & ATOMICITY TESTS (Section 14 & 17.12 - 17.14)
  // --------------------------------------------------------------------------

  it('14. concurrent use of same valid authority -> one transition only', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(
      reservationId,
      'user:10',
      'GUEST_CANCEL_REQUEST',
      'Guest requested cancellation'
    );

    // Run two identical cancellations concurrently
    const [res1, res2] = await Promise.all([
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId,
        reservationId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
      }),
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId,
        reservationId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
      }),
    ]);

    expect([res1.replayed, res2.replayed].sort()).toEqual([false, true]);
    expect(res1.eventId).toBe(res2.eventId);

    const {rows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_reservation_events WHERE reservation_id = $1',
      [reservationId]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('15. concurrent different commands for same ACTIVE -> CANCELLATION_REQUESTED -> one transition only', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const auth1 = await createAuthorizedCancellation(reservationId, 'user:10', 'CANCEL_A', 'text A', randomUUID());
    const auth2 = await createAuthorizedCancellation(reservationId, 'user:10', 'CANCEL_B', 'text B', randomUUID());

    const results = await Promise.allSettled([
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth1.auth.authorizationId,
        commandId: auth1.commandId,
        reservationId,
        reasonCode: 'CANCEL_A',
        reasonText: 'text A',
      }),
      requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth2.auth.authorizationId,
        commandId: auth2.commandId,
        reservationId,
        reasonCode: 'CANCEL_B',
        reasonText: 'text B',
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'LIFECYCLE_STATE_CONFLICT',
    });

    const {rows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_reservation_events WHERE reservation_id = $1',
      [reservationId]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('16. lifecycle event, command receipt, and authorization consumption remain atomic', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(
      reservationId,
      'user:10',
      'GUEST_CANCEL_REQUEST',
      'Guest requested cancellation'
    );

    const result = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });

    // Verify all 3 tables atomically mutated
    const {rows: events} = await fixture.owner.query(
      'SELECT * FROM canonical_reservation_events WHERE event_id = $1',
      [result.eventId]
    );
    expect(events).toHaveLength(1);

    const {rows: commands} = await fixture.owner.query(
      'SELECT * FROM canonical_reservation_lifecycle_commands WHERE command_id = $1',
      [commandId]
    );
    expect(commands).toHaveLength(1);
    expect(commands[0].event_id).toBe(result.eventId);

    const {rows: auths} = await fixture.owner.query(
      'SELECT * FROM canonical_reservation_lifecycle_authorizations WHERE authorization_id = $1',
      [auth.authorizationId]
    );
    expect(auths).toHaveLength(1);
    expect(auths[0].consumed_at).not.toBeNull();
    expect(auths[0].consumed_by_event_id).toBe(result.eventId);
  });

  // --------------------------------------------------------------------------
  // IMMUTABILITY & ROLE BOUNDARY TESTS (Section 11.5, 11.6, 17.15 - 17.17)
  // --------------------------------------------------------------------------

  it('17. authorization cannot be mutated after issuance', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth} = await createAuthorizedCancellation(reservationId, 'user:10');

    // Attempting direct UPDATE on authorization fields
    await expect(
      fixture.owner.query(
        "UPDATE canonical_reservation_lifecycle_authorizations SET reason_code = 'MUTATED' WHERE authorization_id = $1",
        [auth.authorizationId]
      )
    ).rejects.toThrow('CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE');

    // Attempting direct DELETE on authorization
    await expect(
      fixture.owner.query(
        'DELETE FROM canonical_reservation_lifecycle_authorizations WHERE authorization_id = $1',
        [auth.authorizationId]
      )
    ).rejects.toThrow('CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE');
  });

  it('18. raw web/public/other worker roles cannot issue authority', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    for (const pool of [stays, paymentWorker, compositionWorker, reservationWorker]) {
      const client = await pool.connect();
      try {
        let err: any;
        try {
          await client.query(
            `SELECT * FROM canonical_issue_cancellation_authorization($1, $2, 'CANCEL', 'text', 'user:10')`,
            [reservationId, randomUUID()]
          );
        } catch (e) {
          err = e;
        }
        expect(err).toBeDefined();
        expect(err.code).toBe('42501'); // PostgreSQL permission_denied
      } finally {
        client.release();
      }
    }
  });

  it('19. canonical reservation with no events projects ACTIVE', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(projection).not.toBeNull();
    expect(projection!.lifecycleState).toBe('ACTIVE');
    expect(projection!.currentSequence).toBe(0);
    expect(projection!.latestEventId).toBeNull();
    expect(projection!.latestActorKind).toBeNull();
  });

  it('20. W3 reservation row remains unchanged: status = INVENTORY_COMMITTED', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(reservationId, 'user:10');

    await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
    });

    const {rows} = await fixture.owner.query(
      'SELECT status, origin_kind FROM canonical_reservations WHERE id = $1',
      [reservationId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('INVENTORY_COMMITTED');
    expect(rows[0].origin_kind).toBe('ENCHO_DIRECT');
  });

  it('21. booked_units remains unchanged', async () => {
    const {reservationId, checkIn, checkOut} = await createCommittedReservation('user:10', 2);

    const {rows: beforeDays} = await fixture.owner.query(
      `SELECT calendar_date, booked_units, held_units
       FROM inventory_days
       WHERE listing_id = 1 AND room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
       ORDER BY calendar_date`,
      [checkIn, checkOut]
    );
    expect(beforeDays.every(d => d.booked_units === 1 && d.held_units === 0)).toBe(true);

    const {auth, commandId} = await createAuthorizedCancellation(reservationId, 'user:10');
    await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
    });

    const {rows: afterDays} = await fixture.owner.query(
      `SELECT calendar_date, booked_units, held_units
       FROM inventory_days
       WHERE listing_id = 1 AND room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
       ORDER BY calendar_date`,
      [checkIn, checkOut]
    );
    expect(afterDays).toEqual(beforeDays);
  });

  it('22. no refund/payment rows/effects are created', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(reservationId, 'user:10');

    await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
    });

    const {rows: paymentRows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_payment_attempts'
    );
    expect(Number(paymentRows[0].count)).toBe(0);

    const {rows: reconcileRows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_payment_reconciliations'
    );
    expect(Number(reconcileRows[0].count)).toBe(0);

    const {rows: bridgeRows} = await fixture.owner.query(
      'SELECT count(*) FROM canonical_payment_reservations WHERE reservation_id = $1',
      [reservationId]
    );
    expect(Number(bridgeRows[0].count)).toBe(0);
  });

  it('23. raw Guest/web role cannot INSERT/UPDATE lifecycle tables', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    const client = await stays.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO canonical_reservation_events (
            event_id, reservation_id, sequence_number, event_type, actor_kind, actor_principal, origin_kind, reason_code, command_id
          ) VALUES ($1, $2, 1, 'CANCELLATION_REQUESTED', 'GUEST', 'user:10', 'ENCHO_DIRECT', 'HACK', $3)`,
          [randomUUID(), reservationId, randomUUID()]
        )
      ).rejects.toThrow();

      await expect(
        client.query(
          `INSERT INTO canonical_reservation_lifecycle_commands (
            command_id, reservation_id, command_type, actor_kind, actor_principal, origin_kind, reason_code, command_fingerprint, event_id
          ) VALUES ($1, $2, 'REQUEST_CANCELLATION', 'GUEST', 'user:10', 'ENCHO_DIRECT', 'HACK', $3, $4)`,
          [randomUUID(), reservationId, '0'.repeat(64), randomUUID()]
        )
      ).rejects.toThrow();

      await expect(
        client.query(
          `INSERT INTO canonical_reservation_lifecycle_authorizations (
            authorization_id, reservation_id, command_id, command_type, guest_principal, origin_kind, reason_code, expires_at, fingerprint
          ) VALUES ($1, $2, $3, 'REQUEST_CANCELLATION', 'user:10', 'ENCHO_DIRECT', 'HACK', now() + interval '1 hour', $4)`,
          [randomUUID(), reservationId, randomUUID(), '0'.repeat(64)]
        )
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it('24. direct UPDATE/DELETE of lifecycle event rejected', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const {auth, commandId} = await createAuthorizedCancellation(reservationId, 'user:10');

    const result = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
    });

    await expect(
      fixture.owner.query(
        "UPDATE canonical_reservation_events SET reason_code = 'TAMPERED' WHERE event_id = $1",
        [result.eventId]
      )
    ).rejects.toThrow('CANONICAL_RESERVATION_EVENT_IMMUTABLE');

    await expect(
      fixture.owner.query(
        'DELETE FROM canonical_reservation_events WHERE event_id = $1',
        [result.eventId]
      )
    ).rejects.toThrow('CANONICAL_RESERVATION_EVENT_IMMUTABLE');
  });

  it('25. legacy bookings.status changes do not alter canonical lifecycle projection', async () => {
    const {reservationId} = await createCommittedReservation('user:10');

    const {rows: bRows} = await fixture.owner.query(
      "INSERT INTO bookings (listing_id, status, start_date, end_date) VALUES (1, 'confirmed', '2026-11-01', '2026-11-02') RETURNING id"
    );
    const bookingId = bRows[0].id;

    await fixture.owner.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);

    const projection = await getReservationLifecycle(lifecycleWorker, reservationId);
    expect(projection!.lifecycleState).toBe('ACTIVE');
  });

  it('26. no public completed-cancellation API is accidentally added', async () => {
    const {rows} = await fixture.owner.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name LIKE 'canonical_%cancellation%'
    `);
    const routineNames = rows.map(r => r.routine_name).sort();
    expect(routineNames).toEqual([
      'canonical_issue_cancellation_authorization',
      'canonical_request_reservation_cancellation',
    ]);
  });

  it('27. role boundary enforcement: worker cannot issue, issuer cannot transition, raw web cannot do either', async () => {
    const {reservationId} = await createCommittedReservation('user:10');
    const commandId = randomUUID();

    // 27a. encho_lifecycle_issuer cannot execute canonical_request_reservation_cancellation
    const issuerClient = await lifecycleIssuer.connect();
    try {
      await expect(
        issuerClient.query(
          `SELECT * FROM canonical_request_reservation_cancellation($1, $2, $3, 'CANCEL', NULL)`,
          [randomUUID(), commandId, reservationId]
        )
      ).rejects.toThrow();
    } finally {
      issuerClient.release();
    }

    // 27b. encho_lifecycle_worker cannot execute canonical_issue_cancellation_authorization
    const workerClient = await lifecycleWorker.connect();
    try {
      await expect(
        workerClient.query(
          `SELECT * FROM canonical_issue_cancellation_authorization($1, $2, 'CANCEL', NULL, 'user:10')`,
          [reservationId, commandId]
        )
      ).rejects.toThrow();
    } finally {
      workerClient.release();
    }

    // 27c. encho_stays_web cannot execute either
    const webClient = await stays.connect();
    try {
      await expect(
        webClient.query(
          `SELECT * FROM canonical_issue_cancellation_authorization($1, $2, 'CANCEL', NULL, 'user:10')`,
          [reservationId, commandId]
        )
      ).rejects.toThrow();
      await expect(
        webClient.query(
          `SELECT * FROM canonical_request_reservation_cancellation($1, $2, $3, 'CANCEL', NULL)`,
          [randomUUID(), commandId, reservationId]
        )
      ).rejects.toThrow();
    } finally {
      webClient.release();
    }
  });

  it('28. assertLifecycleWorkerRole and assertLifecycleIssuerRole reject broadened or non-restricted roles', async () => {
    // Owner pool (superuser/owner) must be rejected by both assertions
    await expect(assertLifecycleWorkerRole(fixture.owner)).rejects.toMatchObject({
      code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
    });
    await expect(assertLifecycleIssuerRole(fixture.owner)).rejects.toMatchObject({
      code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
    });

    // Issuer pool must be rejected by worker assertion
    await expect(assertLifecycleWorkerRole(lifecycleIssuer)).rejects.toMatchObject({
      code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
    });

    // Worker pool must be rejected by issuer assertion
    await expect(assertLifecycleIssuerRole(lifecycleWorker)).rejects.toMatchObject({
      code: 'LIFECYCLE_ROLE_NOT_RESTRICTED',
    });
  });
});
