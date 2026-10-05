import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {acquireHold} from '../../services/inventoryHoldService.js';
import {createItineraryQuote} from '../../services/itineraryQuoteService.js';
import {
  createPaymentAttempt,
  ingestProviderEvent,
  getPaymentAttempt,
} from '../../services/canonicalPaymentService.js';
import {composePaymentReservation} from '../../services/canonicalCompositionService.js';
import {
  assertLifecycleWorkerRole,
  assertLifecycleIssuerRole,
  issueCancellationAuthorization,
  requestReservationCancellation,
  getReservationLifecycle,
} from '../../services/canonicalLifecycleService.js';
import {
  assertCancellationIssuerRole,
  assertCancellationExecutorRole,
  issueCancellationDecisionAuthorization,
  completeReservationCancellation,
  getCancellationRelease,
  CancellationCompletionError,
} from '../../services/canonicalCancellationCompletionService.js';
import {addDays, createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('W4-B Task 2: Canonical Cancellation Completion and Exact Booked-Inventory Release', () => {
  let fixture: Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let stays: pg.Pool;
  let reservationWorker: pg.Pool;
  let paymentWorker: pg.Pool;
  let compositionWorker: pg.Pool;
  let lifecycleIssuer: pg.Pool;
  let lifecycleWorker: pg.Pool;
  let cancellationIssuer: pg.Pool;
  let cancellationExecutor: pg.Pool;
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

    // Provision restricted lifecycle issuer and worker roles (W4-A)
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    // Provision restricted cancellation issuer and executor roles (W4-B)
    await fixture.owner.query(`CREATE ROLE encho_cancellation_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_cancellation_executor LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker', max: 8});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 8});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker', max: 8});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer', max: 8});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker', max: 8});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer', max: 8});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor', max: 8});

    await assertLifecycleIssuerRole(lifecycleIssuer);
    await assertLifecycleWorkerRole(lifecycleWorker);
    await assertCancellationIssuerRole(cancellationIssuer);
    await assertCancellationExecutorRole(cancellationExecutor);

    // Seed ample inventory days for all tests
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT CASE WHEN room_id=201 THEN 2 ELSE 1 END, room_id, $1::date + n, 1
       FROM unnest(ARRAY[101, 102, 201]) AS room_id CROSS JOIN generate_series(90, 365) AS n
       ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
      [fixture.today]
    );

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
      cancellationIssuer?.end(),
      cancellationExecutor?.end(),
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

    const payableId = randomUUID();
    const contractHash = 'a'.repeat(64);
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, quote.id, Number(quote.roomSubtotalMinor), contractHash]
    );

    const orderRef = 'order_test_' + randomUUID();
    const paymentRef = 'pay_test_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: principal,
      originKind: 'RAZORPAY',
      quoteId: quote.id,
      holdId: holdResult.hold!.id,
      providerOrderRef: orderRef,
    });

    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: Number(quote.roomSubtotalMinor),
      reportedCurrency: 'INR',
      providerPaymentRef: paymentRef,
      providerOrderRef: orderRef,
      evidencePayload: {pay_id: paymentRef, amount: Number(quote.roomSubtotalMinor)},
    });

    const compRes = await composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    });
    expect(compRes.compositionState).toBe('COMMITTED');

    return {
      reservationId: compRes.reservationId,
      holdId: holdResult.hold!.id,
      quoteId: quote.id,
      paymentAttemptId: attempt.attemptId,
      checkIn,
      checkOut,
      nights,
      principal,
    };
  };

  const createCancellationRequestedReservation = async (principal = 'user:10', nights = 1) => {
    const res = await createCommittedReservation(principal, nights);
    const cancelCmdId = randomUUID();
    const auth = await issueCancellationAuthorization(lifecycleIssuer, {
      reservationId: res.reservationId,
      commandId: cancelCmdId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
      authenticatedPrincipal: principal,
    });

    const transitionRes = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId: cancelCmdId,
      reservationId: res.reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });
    expect(transitionRes.lifecycleState).toBe('CANCELLATION_REQUESTED');

    return {
      ...res,
      cancelRequestId: cancelCmdId,
      requestEventId: transitionRes.eventId,
    };
  };

  // --------------------------------------------------------------------------
  // TESTS 1-7: BASELINE, ROLE BOUNDARIES, AND PRECONDITION GATES
  // --------------------------------------------------------------------------

  it('1. CANCELLATION_REQUESTED baseline exists', async () => {
    const res = await createCancellationRequestedReservation();
    const lifecycle = await getReservationLifecycle(lifecycleWorker, res.reservationId);
    expect(lifecycle?.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(lifecycle?.currentSequence).toBe(1);

    const inv = await fixture.owner.query<{booked_units: number; held_units: number}>(
      `SELECT booked_units, held_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
      [res.checkIn]
    );
    expect(inv.rows[0].booked_units).toBe(1);
    expect(inv.rows[0].held_units).toBe(0);
  });

  it('2. internal decision authorization can be issued only for exact CANCELLATION_REQUESTED ENCHO_DIRECT reservation', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();

    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
      reasonText: 'Approved by policy engine',
    });
    expect(decisionAuth.authorizationId).toBeDefined();
    expect(decisionAuth.reservationId).toBe(res.reservationId);
    expect(decisionAuth.requestEventId).toBe(res.requestEventId);
  });

  it('2a. request event actor_kind != GUEST is denied', async () => {
    const res = await createCommittedReservation('user:10', 1);
    const fakeCmd = randomUUID();
    const {rows: [fakeEv]} = await fixture.owner.query<{event_id: string}>(
      `INSERT INTO canonical_reservation_events (
        reservation_id, sequence_number, event_type, actor_kind, actor_principal, origin_kind, reason_code, command_id
      ) VALUES ($1, 1, 'CANCELLATION_REQUESTED', 'HOST', 'user:host_99', 'ENCHO_DIRECT', 'HOST_CANCEL', $2)
      RETURNING event_id`,
      [res.reservationId, fakeCmd]
    );

    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: fakeEv.event_id,
        commandId: randomUUID(),
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_REQUEST_ACTOR_NOT_SUPPORTED');
  });

  it('2b. request event origin_kind != ENCHO_DIRECT is denied', async () => {
    const res = await createCommittedReservation('user:10', 1);
    const fakeCmd = randomUUID();
    const {rows: [fakeEv]} = await fixture.owner.query<{event_id: string}>(
      `INSERT INTO canonical_reservation_events (
        reservation_id, sequence_number, event_type, actor_kind, actor_principal, origin_kind, reason_code, command_id
      ) VALUES ($1, 1, 'CANCELLATION_REQUESTED', 'GUEST', 'user:10', 'EXTERNAL_CHANNEL', 'GUEST_CANCEL', $2)
      RETURNING event_id`,
      [res.reservationId, fakeCmd]
    );

    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: fakeEv.event_id,
        commandId: randomUUID(),
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_ORIGIN_NOT_SUPPORTED');
  });

  it('2c. request event belongs to another reservation is denied', async () => {
    const res1 = await createCancellationRequestedReservation('user:10');
    const res2 = await createCancellationRequestedReservation('user:10');

    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res1.reservationId,
        requestEventId: res2.requestEventId,
        commandId: randomUUID(),
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_EVENT_RESERVATION_MISMATCH');
  });

  it('2d. request event is not current/latest applicable request is denied', async () => {
    const res = await createCancellationRequestedReservation('user:10');
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Complete cancellation so latest event becomes CANCELLED (seq 2)
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Now attempting to issue a new authorization for the stale CANCELLATION_REQUESTED event fails
    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: randomUUID(),
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_LIFECYCLE_STATE_CONFLICT');
  });

  it('2e. random request_event_id is denied', async () => {
    const res = await createCancellationRequestedReservation('user:10');

    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: randomUUID(),
        commandId: randomUUID(),
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_REQUEST_EVENT_NOT_FOUND');
  });

  it('2f. decision authorization immutably binds request event, command, reservation, origin, and decision provenance', async () => {
    const res = await createCancellationRequestedReservation('user:10');
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
      reasonText: 'Binding verification',
    });

    const {rows: [authRow]} = await fixture.owner.query<{
      authorization_id: string;
      reservation_id: string;
      request_event_id: string;
      command_id: string;
      command_type: string;
      origin_kind: string;
      decision_source_kind: string;
      reason_code: string;
      reason_text: string | null;
      decision_fingerprint: string;
      issued_at: string;
      expires_at: string;
      consumed_at: string | null;
      consumed_by_event_id: string | null;
    }>(
      `SELECT * FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
      [decisionAuth.authorizationId]
    );

    expect(authRow.reservation_id).toBe(res.reservationId);
    expect(authRow.request_event_id).toBe(res.requestEventId);
    expect(authRow.command_id).toBe(completionCmd);
    expect(authRow.command_type).toBe('COMPLETE_CANCELLATION');
    expect(authRow.origin_kind).toBe('ENCHO_DIRECT');
    expect(authRow.decision_source_kind).toBe('INTERNAL_AUTHORITY_PRIMITIVE');
    expect(authRow.reason_code).toBe('CANCELLATION_APPROVED');
    expect(authRow.reason_text).toBe('Binding verification');
    expect(authRow.decision_fingerprint).toBe(decisionAuth.decisionFingerprint);
    expect(authRow.consumed_at).toBeNull();
    expect(authRow.consumed_by_event_id).toBeNull();

    // Verify immutability trigger blocks unauthorized mutations and deletions
    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_authorizations SET reason_code = 'HACK' WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rejects.toThrow('CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE');

    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_authorizations SET reservation_id = $1 WHERE authorization_id = $2`,
        [randomUUID(), decisionAuth.authorizationId]
      )
    ).rejects.toThrow('CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE');

    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rejects.toThrow('CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE');
  });

  it('3. issuer negative privilege probes (all requested tables and functions)', async () => {
    const client = await cancellationIssuer.connect();
    try {
      // 1. complete function EXECUTE denied
      await expect(
        client.query(
          `SELECT * FROM canonical_complete_reservation_cancellation($1::uuid, $2::uuid, $3::uuid, 'TEST', NULL)`,
          [randomUUID(), randomUUID(), randomUUID()]
        )
      ).rejects.toThrow(/permission denied for function canonical_complete_reservation_cancellation/);

      // 2. raw UPDATE inventory_days denied
      await expect(
        client.query(`UPDATE inventory_days SET booked_units = booked_units - 1 WHERE room_type_id = 101`)
      ).rejects.toThrow(/permission denied for table inventory_days/);

      // 3. raw INSERT canonical_reservation_events denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_events (
          reservation_id, sequence_number, event_type, actor_kind, actor_principal, origin_kind, reason_code, command_id
        ) VALUES ($1, 2, 'CANCELLED', 'INTERNAL_DECISION', 'internal:test', 'ENCHO_DIRECT', 'TEST', $2)`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_events/);

      // 4. raw INSERT cancellation release fence denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_cancellation_inventory_releases (
          reservation_id, event_id, command_id, authorization_id, release_fingerprint
        ) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), randomUUID(), randomUUID(), randomUUID(), 'a'.repeat(64)])
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_inventory_releases/);

      // 5. raw UPDATE cancellation release fence denied
      await expect(
        client.query(`UPDATE canonical_reservation_cancellation_inventory_releases SET release_fingerprint = 'x'`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_inventory_releases/);

      // 6. raw INSERT per-night release evidence denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_cancellation_release_nights (
          release_id, reservation_id, inventory_day_id, stay_date, released_units
        ) VALUES ($1, $2, 1, '2026-10-06', 1)`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_release_nights/);

      // 7. raw UPDATE per-night release evidence denied
      await expect(
        client.query(`UPDATE canonical_reservation_cancellation_release_nights SET released_units = 99`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_release_nights/);

      // 8. raw UPDATE canonical_reservations denied
      await expect(
        client.query(`UPDATE canonical_reservations SET status = 'CANCELLED' WHERE id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservations/);

      // 9. raw UPDATE/DELETE canonical_reservation_nights denied
      await expect(
        client.query(`UPDATE canonical_reservation_nights SET units = 0 WHERE reservation_id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_nights/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_nights WHERE reservation_id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_nights/);

      // 10. raw mutation of canonical_payment_attempts denied
      await expect(
        client.query(`UPDATE canonical_payment_attempts SET payment_state = 'REFUNDED'`)
      ).rejects.toThrow(/permission denied for table canonical_payment_attempts/);

      // 11. raw mutation of canonical_payment_reconciliations denied
      await expect(
        client.query(`INSERT INTO canonical_payment_reconciliations (payment_attempt_id, reason) VALUES ($1, 'AMOUNT_MISMATCH')`,
        [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_payment_reconciliations/);

      // 12. raw mutation of canonical_provider_events denied
      await expect(
        client.query(`UPDATE canonical_provider_events SET status = 'QUARANTINED'`)
      ).rejects.toThrow(/permission denied for table canonical_provider_events/);

      // 13. raw mutation of canonical_payable_authorities denied
      await expect(
        client.query(`UPDATE canonical_payable_authorities SET status = 'REFUNDED'`)
      ).rejects.toThrow(/permission denied for table canonical_payable_authorities/);

      // 14. raw mutation of canonical_payment_reservations denied
      await expect(
        client.query(`UPDATE canonical_payment_reservations SET status = 'CANCELLED'`)
      ).rejects.toThrow(/permission denied for table canonical_payment_reservations/);
    } finally {
      client.release();
    }
  });

  it('4. executor negative privilege probes (all requested tables and functions)', async () => {
    const client = await cancellationExecutor.connect();
    try {
      // 1. decision issuer function EXECUTE denied
      await expect(
        client.query(
          `SELECT * FROM canonical_issue_cancellation_decision_authorization($1::uuid, $2::uuid, $3::uuid, 'TEST', NULL)`,
          [randomUUID(), randomUUID(), randomUUID()]
        )
      ).rejects.toThrow(/permission denied for function canonical_issue_cancellation_decision_authorization/);

      // 2. raw SELECT/INSERT/UPDATE/DELETE on decision authorization table denied
      await expect(
        client.query(`SELECT * FROM canonical_reservation_cancellation_authorizations`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_authorizations/);
      await expect(
        client.query(`INSERT INTO canonical_reservation_cancellation_authorizations (
          authorization_id, reservation_id, request_event_id, command_id, command_type, origin_kind, reason_code, decision_fingerprint, expires_at
        ) VALUES ($1, $2, $3, $4, 'COMPLETE_CANCELLATION', 'ENCHO_DIRECT', 'TEST', $5, statement_timestamp() + interval '1 hour')`,
        [randomUUID(), randomUUID(), randomUUID(), randomUUID(), 'a'.repeat(64)])
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_authorizations/);
      await expect(
        client.query(`UPDATE canonical_reservation_cancellation_authorizations SET reason_code = 'HACK'`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_authorizations/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_cancellation_authorizations`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_authorizations/);

      // 3. raw UPDATE inventory_days denied
      await expect(
        client.query(`UPDATE inventory_days SET booked_units = booked_units - 1 WHERE room_type_id = 101`)
      ).rejects.toThrow(/permission denied for table inventory_days/);

      // 4. raw INSERT/UPDATE/DELETE canonical_reservation_events denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_events (
          reservation_id, sequence_number, event_type, actor_kind, actor_principal, origin_kind, reason_code, command_id
        ) VALUES ($1, 2, 'CANCELLED', 'INTERNAL_DECISION', 'internal:test', 'ENCHO_DIRECT', 'TEST', $2)`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_events/);
      await expect(
        client.query(`UPDATE canonical_reservation_events SET reason_code = 'HACK'`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_events/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_events`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_events/);

      // 5. raw INSERT/UPDATE/DELETE release fence denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_cancellation_inventory_releases (
          reservation_id, event_id, command_id, authorization_id, release_fingerprint
        ) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), randomUUID(), randomUUID(), randomUUID(), 'a'.repeat(64)])
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_inventory_releases/);
      await expect(
        client.query(`UPDATE canonical_reservation_cancellation_inventory_releases SET release_fingerprint = 'x'`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_inventory_releases/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_cancellation_inventory_releases`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_inventory_releases/);

      // 6. raw INSERT/UPDATE/DELETE release-night evidence denied
      await expect(
        client.query(`INSERT INTO canonical_reservation_cancellation_release_nights (
          release_id, reservation_id, inventory_day_id, stay_date, released_units
        ) VALUES ($1, $2, 1, '2026-10-06', 1)`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_release_nights/);
      await expect(
        client.query(`UPDATE canonical_reservation_cancellation_release_nights SET released_units = 99`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_release_nights/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_cancellation_release_nights`)
      ).rejects.toThrow(/permission denied for table canonical_reservation_cancellation_release_nights/);

      // 7. raw mutation canonical_reservations denied
      await expect(
        client.query(`UPDATE canonical_reservations SET status = 'CANCELLED' WHERE id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservations/);
      await expect(
        client.query(`DELETE FROM canonical_reservations WHERE id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservations/);

      // 8. raw mutation canonical_reservation_nights denied
      await expect(
        client.query(`UPDATE canonical_reservation_nights SET units = 0 WHERE reservation_id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_nights/);
      await expect(
        client.query(`DELETE FROM canonical_reservation_nights WHERE reservation_id = $1`, [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_reservation_nights/);

      // 9. canonical_finalize_direct_hold EXECUTE denied
      await expect(
        client.query(`SELECT * FROM canonical_finalize_direct_hold($1::uuid, $2::uuid, $3::uuid)`,
        [randomUUID(), randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for function canonical_finalize_direct_hold/);

      // 10. canonical_compose_payment_reservation EXECUTE denied
      await expect(
        client.query(`SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for function canonical_compose_payment_reservation/);

      // 11. W4-A cancellation-request issuance/transition functions EXECUTE denied
      await expect(
        client.query(`SELECT * FROM canonical_issue_cancellation_authorization($1::uuid, $2::uuid, 'TEST', NULL, 'user:10')`,
        [randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for function canonical_issue_cancellation_authorization/);
      await expect(
        client.query(`SELECT * FROM canonical_request_reservation_cancellation($1::uuid, $2::uuid, $3::uuid, 'TEST', NULL)`,
        [randomUUID(), randomUUID(), randomUUID()])
      ).rejects.toThrow(/permission denied for function canonical_request_reservation_cancellation/);

      // 12. payment/refund raw table mutation denied
      await expect(
        client.query(`UPDATE canonical_payment_attempts SET payment_state = 'REFUNDED'`)
      ).rejects.toThrow(/permission denied for table canonical_payment_attempts/);
      await expect(
        client.query(`INSERT INTO canonical_payment_reconciliations (payment_attempt_id, reason) VALUES ($1, 'AMOUNT_MISMATCH')`,
        [randomUUID()])
      ).rejects.toThrow(/permission denied for table canonical_payment_reconciliations/);
      await expect(
        client.query(`UPDATE canonical_payable_authorities SET status = 'REFUNDED'`)
      ).rejects.toThrow(/permission denied for table canonical_payable_authorities/);
    } finally {
      client.release();
    }
  });

  it('7. ACTIVE reservation without request cannot complete', async () => {
    const res = await createCommittedReservation(); // Still ACTIVE
    const fakeAuthId = randomUUID();
    const completionCmd = randomUUID();

    // Direct invocation with fabricated capability
    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: fakeAuthId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_AUTHORIZATION_NOT_FOUND');

    // Attempting decision issuance on ACTIVE reservation fails lifecycle state check
    const fakeReqEventId = randomUUID();
    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: fakeReqEventId,
        commandId: completionCmd,
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_REQUEST_EVENT_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // TESTS 8-16: SUCCESSFUL COMPLETION, INVENTORY RELEASE, AND IMMUTABILITY TRUTH
  // --------------------------------------------------------------------------

  it('8. valid decision completes: CANCELLATION_REQUESTED -> CANCELLED', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    expect(completion.lifecycleState).toBe('CANCELLED');
    expect(completion.sequenceNumber).toBe(2);
    expect(completion.replayed).toBe(false);
    expect(completion.releaseId).toBeDefined();

    const lifecycle = await getReservationLifecycle(cancellationExecutor, res.reservationId);
    expect(lifecycle?.lifecycleState).toBe('CANCELLED');
    expect(lifecycle?.currentSequence).toBe(2);
  });

  it('8b. completion event provenance is separated from Guest request actor and verifiable', async () => {
    const res = await createCancellationRequestedReservation('user:10', 1);
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
      reasonText: 'Internal decision authority primitive',
    });

    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
      reasonText: 'Internal decision authority primitive',
    });

    // Fetch the CANCELLED event row directly
    const {rows: [cancelledEvent]} = await fixture.owner.query<{
      event_id: string;
      reservation_id: string;
      sequence_number: number;
      event_type: string;
      actor_kind: string;
      actor_principal: string;
      origin_kind: string;
      reason_code: string;
      reason_text: string | null;
      source_ref: string | null;
      request_event_id: string | null;
      decision_authorization_id: string | null;
      decision_source_kind: string | null;
      metadata: any;
    }>(
      `SELECT * FROM canonical_reservation_events WHERE event_id = $1`,
      [completion.eventId]
    );

    // 1. Provenance separation:
    // Event decider is NOT Guest, but INTERNAL_DECISION
    expect(cancelledEvent.event_type).toBe('CANCELLED');
    expect(cancelledEvent.actor_kind).toBe('INTERNAL_DECISION');
    expect(cancelledEvent.actor_principal).toBe('internal:cancellation_authority_primitive');
    expect(cancelledEvent.origin_kind).toBe('ENCHO_DIRECT');
    expect(cancelledEvent.decision_source_kind).toBe('INTERNAL_AUTHORITY_PRIMITIVE');

    // 2. Bound request event and decision capability are exact
    expect(cancelledEvent.request_event_id).toBe(res.requestEventId);
    expect(cancelledEvent.decision_authorization_id).toBe(decisionAuth.authorizationId);
    expect(cancelledEvent.source_ref).toBe(`event:${res.requestEventId}`);

    // 3. Requester evidence remains recoverable from bound request event and event metadata
    const {rows: [requestEvent]} = await fixture.owner.query<{
      actor_kind: string;
      actor_principal: string;
    }>(
      `SELECT actor_kind, actor_principal FROM canonical_reservation_events WHERE event_id = $1`,
      [cancelledEvent.request_event_id]
    );
    expect(requestEvent.actor_kind).toBe('GUEST');
    expect(requestEvent.actor_principal).toBe('user:10');

    expect(cancelledEvent.metadata.request_actor_kind).toBe('GUEST');
    expect(cancelledEvent.metadata.request_actor_principal).toBe('user:10');
    expect(cancelledEvent.metadata.request_event_id).toBe(res.requestEventId);
    expect(cancelledEvent.metadata.decision_authorization_id).toBe(decisionAuth.authorizationId);
    expect(cancelledEvent.metadata.decision_source_kind).toBe('INTERNAL_AUTHORITY_PRIMITIVE');

    // 4. Immutability: mutation rejected by trigger
    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_events SET actor_kind = 'GUEST' WHERE event_id = $1`,
        [cancelledEvent.event_id]
      )
    ).rejects.toThrow('CANONICAL_RESERVATION_EVENT_IMMUTABLE');

    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_events WHERE event_id = $1`,
        [cancelledEvent.event_id]
      )
    ).rejects.toThrow('CANONICAL_RESERVATION_EVENT_IMMUTABLE');
  });

  it('9. W3 reservation.status remains INVENTORY_COMMITTED', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const {rows} = await fixture.owner.query<{status: string}>(
      `SELECT status FROM canonical_reservations WHERE id = $1`,
      [res.reservationId]
    );
    expect(rows[0].status).toBe('INVENTORY_COMMITTED');
  });

  it('10. canonical reservation nights remain unchanged', async () => {
    const res = await createCancellationRequestedReservation();
    const beforeNights = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date, units FROM canonical_reservation_nights WHERE reservation_id = $1 ORDER BY stay_date`,
        [res.reservationId]
      )
    ).rows;

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const afterNights = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date, units FROM canonical_reservation_nights WHERE reservation_id = $1 ORDER BY stay_date`,
        [res.reservationId]
      )
    ).rows;
    expect(afterNights).toEqual(beforeNights);
  });

  it('11. 2-night reservation releases every exact night once', async () => {
    const res = await createCancellationRequestedReservation('user:10', 2);
    expect(res.nights).toBe(2);

    const invBefore = (
      await fixture.owner.query<{calendar_date: string; booked_units: number}>(
        `SELECT calendar_date::text, booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 ORDER BY calendar_date`,
        [res.checkIn, res.checkOut]
      )
    ).rows;
    expect(invBefore).toHaveLength(2);
    expect(invBefore.every(r => r.booked_units === 1)).toBe(true);

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    const result = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    expect(result.lifecycleState).toBe('CANCELLED');

    const invAfter = (
      await fixture.owner.query<{calendar_date: string; booked_units: number}>(
        `SELECT calendar_date::text, booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 ORDER BY calendar_date`,
        [res.checkIn, res.checkOut]
      )
    ).rows;
    expect(invAfter).toHaveLength(2);
    expect(invAfter.every(r => r.booked_units === 0)).toBe(true);
  });

  it('12. per-night release evidence exactly matches canonical allocation', async () => {
    const res = await createCancellationRequestedReservation('user:10', 2);
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const releaseRecord = await getCancellationRelease(cancellationExecutor, res.reservationId);
    expect(releaseRecord?.releaseId).toBe(completion.releaseId);
    expect(releaseRecord?.totalNightsReleased).toBe(2);
    expect(releaseRecord?.totalUnitsReleased).toBe(2);

    const releaseNights = (
      await fixture.owner.query<{stay_date: string; released_units: number}>(
        `SELECT stay_date::text, released_units FROM canonical_reservation_cancellation_release_nights WHERE release_id = $1 ORDER BY stay_date`,
        [completion.releaseId]
      )
    ).rows;
    expect(releaseNights).toHaveLength(2);
    expect(releaseNights[0].released_units).toBe(1);
    expect(releaseNights[1].released_units).toBe(1);
  });

  it('13. held_units unchanged', async () => {
    const res = await createCancellationRequestedReservation();
    const beforeHeld = (
      await fixture.owner.query<{held_units: number}>(
        `SELECT held_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].held_units;

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const afterHeld = (
      await fixture.owner.query<{held_units: number}>(
        `SELECT held_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].held_units;
    expect(afterHeld).toBe(beforeHeld);
  });

  it('14. blocked_units unchanged', async () => {
    const res = await createCancellationRequestedReservation();
    const beforeBlocked = (
      await fixture.owner.query<{blocked_units: number}>(
        `SELECT blocked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].blocked_units;

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const afterBlocked = (
      await fixture.owner.query<{blocked_units: number}>(
        `SELECT blocked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].blocked_units;
    expect(afterBlocked).toBe(beforeBlocked);
  });

  it('15. total_units unchanged', async () => {
    const res = await createCancellationRequestedReservation();
    const beforeTotal = (
      await fixture.owner.query<{total_units: number}>(
        `SELECT total_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].total_units;

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const afterTotal = (
      await fixture.owner.query<{total_units: number}>(
        `SELECT total_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0].total_units;
    expect(afterTotal).toBe(beforeTotal);
  });

  it('16. unrelated inventory day unchanged', async () => {
    const res = await createCancellationRequestedReservation();
    const unrelatedDate = addDays(fixture.today, 300);

    await fixture.owner.query(
      `INSERT INTO inventory_days (listing_id, room_type_id, calendar_date, total_units, held_units, booked_units, blocked_units)
       VALUES (1, 101, $1, 1, 0, 1, 0) ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET booked_units = 1`,
      [unrelatedDate]
    );

    try {
      const completionCmd = randomUUID();
      const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: completionCmd,
        reasonCode: 'CANCELLATION_APPROVED',
      });
      await completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth.authorizationId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      });

      const unrelatedInv = (
        await fixture.owner.query<{booked_units: number}>(
          `SELECT booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
          [unrelatedDate]
        )
      ).rows[0];
      expect(unrelatedInv.booked_units).toBe(1);
    } finally {
      await fixture.owner.query(
        `UPDATE inventory_days SET booked_units = 0 WHERE room_type_id = 101 AND calendar_date = $1`,
        [unrelatedDate]
      );
    }
  });

  // --------------------------------------------------------------------------
  // TESTS 17-21: REPLAY, EXPIRY, MISMATCH, AND CONFLICTING COMMANDS
  // --------------------------------------------------------------------------

  it('17. exact replay -> same result, no second decrement', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const first = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    expect(first.replayed).toBe(false);

    // Replay with identical parameters
    const replay = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.eventId).toBe(first.eventId);
    expect(replay.releaseId).toBe(first.releaseId);

    // Booked units remains 0 (no second decrement)
    const inv = (
      await fixture.owner.query<{booked_units: number}>(
        `SELECT booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0];
    expect(inv.booked_units).toBe(0);
  });

  it('17b. replay preserves provenance without duplicate rows', async () => {
    const res = await createCancellationRequestedReservation('user:10', 1);
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const first = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const firstAuth = (
      await fixture.owner.query<{consumed_at: string; consumed_by_event_id: string}>(
        `SELECT consumed_at, consumed_by_event_id FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rows[0];

    // Replay
    const replay = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    expect(replay.replayed).toBe(true);
    expect(replay.eventId).toBe(first.eventId);
    expect(replay.releaseId).toBe(first.releaseId);

    // Verify row counts:
    // Exactly 1 CANCELLED event
    const eventCounts = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1 AND event_type = 'CANCELLED'`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(eventCounts).toBe(1);

    // Exactly 1 release row
    const releaseCounts = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(releaseCounts).toBe(1);

    // Exactly 1 command receipt
    const cmdCounts = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_lifecycle_commands WHERE command_id = $1`,
        [completionCmd]
      )
    ).rows[0].count;
    expect(cmdCounts).toBe(1);

    // Consumed authorization timestamps unchanged
    const replayAuth = (
      await fixture.owner.query<{consumed_at: string; consumed_by_event_id: string}>(
        `SELECT consumed_at, consumed_by_event_id FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rows[0];
    expect(new Date(replayAuth.consumed_at).toISOString()).toBe(new Date(firstAuth.consumed_at).toISOString());
    expect(replayAuth.consumed_by_event_id).toBe(firstAuth.consumed_by_event_id);
  });

  it('18. replay after decision expiry still returns committed result (actual DB time > expires_at proof)', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const first = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    expect(first.replayed).toBe(false);
    expect(first.lifecycleState).toBe('CANCELLED');

    // Verify decision is consumed
    const authBefore = (
      await fixture.owner.query<{consumed_at: string | null}>(
        `SELECT consumed_at FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rows[0];
    expect(authBefore.consumed_at).not.toBeNull();

    // As disposable-owner fixture, advance authorization expiry boundary into the past
    await fixture.owner.query(
      `ALTER TABLE canonical_reservation_cancellation_authorizations DISABLE TRIGGER canonical_reservation_cancellation_authorizations_immutable`
    );
    await fixture.owner.query(
      `UPDATE canonical_reservation_cancellation_authorizations
       SET expires_at = statement_timestamp() - interval '2 hours',
           issued_at = statement_timestamp() - interval '3 hours'
       WHERE authorization_id = $1`,
      [decisionAuth.authorizationId]
    );
    await fixture.owner.query(
      `ALTER TABLE canonical_reservation_cancellation_authorizations ENABLE TRIGGER canonical_reservation_cancellation_authorizations_immutable`
    );

    // Prove that current database time is definitively after expires_at
    const {rows: timeCheck} = await fixture.owner.query<{is_expired: boolean}>(
      `SELECT statement_timestamp() > expires_at AS is_expired FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
      [decisionAuth.authorizationId]
    );
    expect(timeCheck[0].is_expired).toBe(true);

    // Exact retry with same authorization, same command, same reservation, same semantics
    const replay = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    expect(replay.replayed).toBe(true);
    expect(replay.eventId).toBe(first.eventId);
    expect(replay.releaseId).toBe(first.releaseId);
    expect(replay.lifecycleState).toBe('CANCELLED');

    // Verify zero additional booked_units decrement
    const inv = (
      await fixture.owner.query<{booked_units: number}>(
        `SELECT booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [res.checkIn]
      )
    ).rows[0];
    expect(inv.booked_units).toBe(0);
  });

  it('19. unused expired decision cannot execute', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();

    // Insert an expired decision directly as owner
    const expiredAuthId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_cancellation_authorizations (
        authorization_id, reservation_id, request_event_id, command_id, command_type, origin_kind,
        decision_source_kind, reason_code, decision_fingerprint, issued_at, expires_at
      ) VALUES ($1, $2, $3, $4, 'COMPLETE_CANCELLATION', 'ENCHO_DIRECT',
        'INTERNAL_AUTHORITY_PRIMITIVE', 'EXPIRED_TEST', $5,
        statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour')`,
      [expiredAuthId, res.reservationId, res.requestEventId, completionCmd, 'a'.repeat(64)]
    );

    // Prove current database time is definitively after expires_at
    const {rows: timeCheck} = await fixture.owner.query<{is_expired: boolean}>(
      `SELECT statement_timestamp() > expires_at AS is_expired FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
      [expiredAuthId]
    );
    expect(timeCheck[0].is_expired).toBe(true);

    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: expiredAuthId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'EXPIRED_TEST',
      })
    ).rejects.toThrow('CANCELLATION_AUTHORIZATION_EXPIRED');
  });

  it('20. wrong decision/reservation mismatch denied', async () => {
    const res1 = await createCancellationRequestedReservation('user:10');
    const res2 = await createCancellationRequestedReservation('user:10');

    const completionCmd = randomUUID();
    const decisionAuth1 = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res1.reservationId,
      requestEventId: res1.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Attempting to use auth1 on res2
    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth1.authorizationId,
        commandId: completionCmd,
        reservationId: res2.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('CANCELLATION_AUTHORIZATION_RESERVATION_MISMATCH');
  });

  it('21. changed command semantics conflict', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Same command_id with different reason_code
    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth.authorizationId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CHANGED_REASON',
      })
    ).rejects.toThrow('CANCELLATION_COMMAND_CONFLICT');
  });

  // --------------------------------------------------------------------------
  // TESTS 22-25: CONCURRENCY
  // --------------------------------------------------------------------------

  it('22. identical concurrent completion -> one release', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const [res1, res2] = await Promise.all([
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth.authorizationId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth.authorizationId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
    ]);

    expect([res1.replayed, res2.replayed]).toContain(false);
    expect([res1.replayed, res2.replayed]).toContain(true);
    expect(res1.eventId).toBe(res2.eventId);
    expect(res1.releaseId).toBe(res2.releaseId);

    const releases = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(releases).toBe(1);
  });

  it('23. different concurrent completion commands -> one release', async () => {
    const res = await createCancellationRequestedReservation();
    const cmd1 = randomUUID();
    const cmd2 = randomUUID();

    const [auth1, auth2] = await Promise.all([
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: cmd1,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: cmd2,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
    ]);

    const results = await Promise.allSettled([
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: auth1.authorizationId,
        commandId: cmd1,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: auth2.authorizationId,
        commandId: cmd2,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const releases = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(releases).toBe(1);
  });

  it('24. identical concurrent decision issuance -> same authority', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();

    const [auth1, auth2] = await Promise.all([
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: completionCmd,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: completionCmd,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
    ]);

    expect(auth1.authorizationId).toBe(auth2.authorizationId);
    expect(auth1.decisionFingerprint).toBe(auth2.decisionFingerprint);
  });

  it('25. changed-semantics concurrent decision issuance -> conflict', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();

    const results = await Promise.allSettled([
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: completionCmd,
        reasonCode: 'CANCELLATION_APPROVED',
      }),
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: res.reservationId,
        requestEventId: res.requestEventId,
        commandId: completionCmd,
        reasonCode: 'DIFFERENT_REASON',
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // TESTS 26-27: UNDERFLOW ROLLBACK AND FAILURE-INJECTION ROLLBACK
  // --------------------------------------------------------------------------

  it('26. multi-night later-night underflow -> whole-transaction rollback', async () => {
    // Create 2-night reservation in CANCELLATION_REQUESTED
    const res = await createCancellationRequestedReservation('user:10', 2);
    expect(res.nights).toBe(2);

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const checkInDate = res.checkIn;
    const night2Date = addDays(checkInDate, 1);

    // Before mutation: both nights have booked_units = 1
    const invBefore = (
      await fixture.owner.query<{calendar_date: string; booked_units: number}>(
        `SELECT calendar_date::text, booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date IN ($1, $2) ORDER BY calendar_date`,
        [checkInDate, night2Date]
      )
    ).rows;
    expect(invBefore).toHaveLength(2);
    expect(invBefore[0].booked_units).toBe(1);
    expect(invBefore[1].booked_units).toBe(1);

    // Artificially corrupt night 2 only: booked_units = 0 (< canonical allocation 1)
    // Night 1 remains booked_units = 1 (sufficient)
    await fixture.owner.query(
      `UPDATE inventory_days SET booked_units = 0 WHERE room_type_id = 101 AND calendar_date = $1`,
      [night2Date]
    );

    // Attempt completion: Night 1 is processed/decremented in loop, but Night 2 discovers underflow
    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: decisionAuth.authorizationId,
        commandId: completionCmd,
        reservationId: res.reservationId,
        reasonCode: 'CANCELLATION_APPROVED',
      })
    ).rejects.toThrow('INVENTORY_RELEASE_UNDERFLOW');

    // Verify full rollback:
    // 1. Lifecycle remains CANCELLATION_REQUESTED
    const lifecycle = await getReservationLifecycle(cancellationExecutor, res.reservationId);
    expect(lifecycle?.lifecycleState).toBe('CANCELLATION_REQUESTED');
    expect(lifecycle?.currentSequence).toBe(1);

    // 2. Zero CANCELLED event
    const cancelEvents = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1 AND event_type = 'CANCELLED'`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(cancelEvents).toBe(0);

    // 3. Zero completion command receipt
    const cmds = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_lifecycle_commands WHERE command_id = $1`,
        [completionCmd]
      )
    ).rows[0].count;
    expect(cmds).toBe(0);

    // 4. Zero cancellation release fence
    const releases = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(releases).toBe(0);

    // 5. Zero per-night release evidence
    const releaseNights = (
      await fixture.owner.query<{count: number}>(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_release_nights WHERE reservation_id = $1`,
        [res.reservationId]
      )
    ).rows[0].count;
    expect(releaseNights).toBe(0);

    // 6. Decision authorization remains unconsumed
    const authRow = (
      await fixture.owner.query<{consumed_at: string | null}>(
        `SELECT consumed_at FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decisionAuth.authorizationId]
      )
    ).rows[0];
    expect(authRow.consumed_at).toBeNull();

    // 7. Night 1 booked_units is restored to original (1), no partial decrement survives
    // Night 2 remains fixture state (0)
    const invAfter = (
      await fixture.owner.query<{calendar_date: string; booked_units: number}>(
        `SELECT calendar_date::text, booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date IN ($1, $2) ORDER BY calendar_date`,
        [checkInDate, night2Date]
      )
    ).rows;
    expect(invAfter[0].booked_units).toBe(1); // restored!
    expect(invAfter[1].booked_units).toBe(0); // remains fixture state
  });

  it('27. injected late failure -> full rollback', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Install disposable trigger on canonical_reservation_cancellation_release_nights to fail late in the transaction
    await fixture.owner.query(`
      CREATE OR REPLACE FUNCTION failure_injection_trigger_func()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'INJECTED_LATE_FAILURE_ERROR';
      END;
      $$;

      CREATE TRIGGER trg_test_failure_injection
      BEFORE INSERT ON canonical_reservation_cancellation_release_nights
      FOR EACH ROW EXECUTE FUNCTION failure_injection_trigger_func();
    `);

    try {
      let failureError: any = null;
      try {
        await completeReservationCancellation(cancellationExecutor, {
          authorizationId: decisionAuth.authorizationId,
          commandId: completionCmd,
          reservationId: res.reservationId,
          reasonCode: 'CANCELLATION_APPROVED',
        });
      } catch (err: any) {
        failureError = err;
      }
      expect(failureError).toBeDefined();
      expect(failureError.cause?.message || failureError.message).toContain('INJECTED_LATE_FAILURE_ERROR');

      // Verify full rollback:
      const lifecycle = await getReservationLifecycle(cancellationExecutor, res.reservationId);
      expect(lifecycle?.lifecycleState).toBe('CANCELLATION_REQUESTED');

      const events = (
        await fixture.owner.query(
          `SELECT count(*)::int AS count FROM canonical_reservation_events WHERE reservation_id = $1 AND event_type = 'CANCELLED'`,
          [res.reservationId]
        )
      ).rows[0].count;
      expect(events).toBe(0);

      const releases = (
        await fixture.owner.query(
          `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
          [res.reservationId]
        )
      ).rows[0].count;
      expect(releases).toBe(0);

      const inv = (
        await fixture.owner.query<{booked_units: number}>(
          `SELECT booked_units FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
          [res.checkIn]
        )
      ).rows[0];
      expect(inv.booked_units).toBe(1);

      const authRow = (
        await fixture.owner.query<{consumed_at: string | null}>(
          `SELECT consumed_at FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
          [decisionAuth.authorizationId]
        )
      ).rows[0];
      expect(authRow.consumed_at).toBeNull();
    } finally {
      // Remove disposable trigger
      await fixture.owner.query(`
        DROP TRIGGER IF EXISTS trg_test_failure_injection ON canonical_reservation_cancellation_release_nights;
        DROP FUNCTION IF EXISTS failure_injection_trigger_func();
      `);
    }

    // Prove same command can then succeed after trigger removal
    const completed = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    expect(completed.lifecycleState).toBe('CANCELLED');
  });

  // --------------------------------------------------------------------------
  // TESTS 28-34: IMMUTABILITY, ISOLATION, SCOPE AND SECURITY DEFINER CHECKS
  // --------------------------------------------------------------------------

  it('28. cancellation-specific release fence cannot be duplicated', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    // Attempting direct manual duplicate insertion of release fence
    await expect(
      fixture.owner.query(
        `INSERT INTO canonical_reservation_cancellation_inventory_releases (
          reservation_id, event_id, command_id, authorization_id, release_fingerprint
        ) VALUES ($1, $2, $3, $4, $5)`,
        [res.reservationId, completion.eventId, randomUUID(), randomUUID(), 'b'.repeat(64)]
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  it('29. release-night evidence immutable', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_release_nights SET released_units = 99 WHERE release_id = $1`,
        [completion.releaseId]
      )
    ).rejects.toThrow('CANONICAL_RELEASE_NIGHT_IMMUTABLE');

    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_cancellation_release_nights WHERE release_id = $1`,
        [completion.releaseId]
      )
    ).rejects.toThrow('CANONICAL_RELEASE_NIGHT_IMMUTABLE');
  });

  it('30. release fence immutable', async () => {
    const res = await createCancellationRequestedReservation();
    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    const completion = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    await expect(
      fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_inventory_releases SET release_fingerprint = 'x' WHERE release_id = $1`,
        [completion.releaseId]
      )
    ).rejects.toThrow('CANONICAL_CANCELLATION_RELEASE_IMMUTABLE');

    await expect(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
        [completion.releaseId]
      )
    ).rejects.toThrow('CANONICAL_CANCELLATION_RELEASE_IMMUTABLE');
  });

  it('31. no payment/refund mutation', async () => {
    const res = await createCancellationRequestedReservation();
    const paymentBefore = await getPaymentAttempt(paymentWorker, res.paymentAttemptId);
    expect(paymentBefore?.paymentState).toBe('MATCHED_CAPTURE');

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const paymentAfter = await getPaymentAttempt(paymentWorker, res.paymentAttemptId);
    expect(paymentAfter?.paymentState).toBe('MATCHED_CAPTURE');
    expect(paymentAfter?.reconciliationReason).toBe(paymentBefore?.reconciliationReason);
  });

  it('32. no legacy bookings dual-write', async () => {
    const res = await createCancellationRequestedReservation();
    const bookingsBeforeCount = (
      await fixture.owner.query<{count: number}>('SELECT count(*)::int AS count FROM bookings')
    ).rows[0].count;

    const completionCmd = randomUUID();
    const decisionAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: res.reservationId,
      requestEventId: res.requestEventId,
      commandId: completionCmd,
      reasonCode: 'CANCELLATION_APPROVED',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decisionAuth.authorizationId,
      commandId: completionCmd,
      reservationId: res.reservationId,
      reasonCode: 'CANCELLATION_APPROVED',
    });

    const bookingsAfterCount = (
      await fixture.owner.query<{count: number}>('SELECT count(*)::int AS count FROM bookings')
    ).rows[0].count;
    expect(bookingsAfterCount).toBe(bookingsBeforeCount);
  });

  it('33. EXTERNAL_CHANNEL completion rejected', async () => {
    // Create an EXTERNAL_CHANNEL reservation directly as owner
    const extResId = randomUUID();
    const extCmdId = randomUUID();

    await fixture.owner.query(
      `INSERT INTO canonical_reservations (
        id, origin_kind, listing_id, room_type_id, offer_id, offer_revision, quote_id, hold_id,
        holder_principal, check_in_date, check_out_date, nights, guest_count, room_subtotal_paise,
        currency, status, command_id, command_fingerprint
      ) VALUES ($1, 'EXTERNAL_CHANNEL', 1, 101, $2, 1, NULL, NULL, 'external:guest',
        '2026-11-01', '2026-11-02', 1, 2, 550000, 'INR', 'INVENTORY_COMMITTED', $3, $4)`,
      [extResId, offerId, extCmdId, 'c'.repeat(64)]
    );

    await expect(
      issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId: extResId,
        requestEventId: randomUUID(),
        commandId: randomUUID(),
        reasonCode: 'EXTERNAL_CANCEL',
      })
    ).rejects.toThrow('CANCELLATION_ORIGIN_NOT_SUPPORTED');

    await expect(
      completeReservationCancellation(cancellationExecutor, {
        authorizationId: randomUUID(),
        reservationId: extResId,
        commandId: randomUUID(),
        reasonCode: 'EXTERNAL_CANCEL',
      })
    ).rejects.toThrow('CANCELLATION_ORIGIN_NOT_SUPPORTED');
  });

  it('34. PUBLIC/web/payment/composition/W4-A lifecycle worker cannot invoke W4-B privileged functions', async () => {
    // 1. PUBLIC checks via has_function_privilege
    const publicChecks = await fixture.owner.query<{func: string; has_priv: boolean}>(`
      SELECT
        p.proname AS func,
        has_function_privilege('public', p.oid, 'EXECUTE') AS has_priv
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'canonical_issue_cancellation_decision_authorization',
          'canonical_complete_reservation_cancellation',
          'canonical_get_cancellation_release'
        )
    `);
    expect(publicChecks.rows.length).toBeGreaterThanOrEqual(3);
    for (const check of publicChecks.rows) {
      expect(check.has_priv).toBe(false);
    }

    // 2. Named worker roles checks
    const rolesToTest = [
      {name: 'encho_stays_web', pool: stays},
      {name: 'encho_payment_worker', pool: paymentWorker},
      {name: 'encho_composition_worker', pool: compositionWorker},
      {name: 'encho_reservation_worker', pool: reservationWorker},
      {name: 'encho_lifecycle_worker', pool: lifecycleWorker},
      {name: 'encho_lifecycle_issuer', pool: lifecycleIssuer},
    ];

    for (const {name, pool} of rolesToTest) {
      // has_function_privilege verification
      const privChecks = await fixture.owner.query<{has_issue: boolean; has_complete: boolean}>(`
        SELECT
          has_function_privilege($1, 'canonical_issue_cancellation_decision_authorization(UUID,UUID,UUID,TEXT,TEXT)', 'EXECUTE') AS has_issue,
          has_function_privilege($1, 'canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT)', 'EXECUTE') AS has_complete
      `, [name]);
      expect(privChecks.rows[0].has_issue).toBe(false);
      expect(privChecks.rows[0].has_complete).toBe(false);

      // Actual query execution rejection verification
      const client = await pool.connect();
      try {
        await expect(
          client.query(
            `SELECT * FROM canonical_issue_cancellation_decision_authorization($1::uuid, $2::uuid, $3::uuid, 'TEST', NULL)`,
            [randomUUID(), randomUUID(), randomUUID()]
          )
        ).rejects.toThrow(/permission denied for function canonical_issue_cancellation_decision_authorization/);

        await expect(
          client.query(
            `SELECT * FROM canonical_complete_reservation_cancellation($1::uuid, $2::uuid, $3::uuid, 'TEST', NULL)`,
            [randomUUID(), randomUUID(), randomUUID()]
          )
        ).rejects.toThrow(/permission denied for function canonical_complete_reservation_cancellation/);
      } finally {
        client.release();
      }
    }
  });
});
