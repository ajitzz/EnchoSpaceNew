import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {acquireHold} from '../../services/inventoryHoldService.js';
import {createItineraryQuote} from '../../services/itineraryQuoteService.js';
import {
  assertPaymentWorkerRole,
  createPaymentAttempt,
  ingestProviderEvent,
  getPaymentAttempt,
  getPaymentReconciliations,
} from '../../services/canonicalPaymentService.js';
import {
  assertCompositionWorkerRole,
  composePaymentReservation,
  getPaymentReservation,
  CompositionAuthorityError,
} from '../../services/canonicalCompositionService.js';
import {addDays, createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('W3-B Task 3: Internal Verified Payment -> Canonical Reservation Composition Authority', () => {
  let fixture: Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let stays: pg.Pool;
  let paymentWorker: pg.Pool;
  let compositionWorker: pg.Pool;
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

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 8});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker', max: 8});

    await assertPaymentWorkerRole(paymentWorker);
    await assertCompositionWorkerRole(compositionWorker);

    // Establish accepted offer
    const service = new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'), 'LOCAL');
    const draft = await service.createDraft(fixture.principal(10), {
      commandId: randomUUID(), listingId: 1, roomTypeId: 101, amountMinor: '550000',
      stayStart: fixture.today, stayEnd: addDays(fixture.today, 365),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 365 * 86400000).toISOString(), maxGuests: 2, minNights: 1,
    });
    const submitted = await service.submit(fixture.principal(10), {
      offerId: draft.offerId, revision: 1, expectedVersion: draft.version});
    await fixture.grantOffer(draft.offerId);
    await service.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft.offerId, revision: 1, expectedVersion: submitted.version});
    offerId = draft.offerId;
  }, 90000);

  afterAll(async () => {
    await Promise.all([stays?.end(), paymentWorker?.end(), compositionWorker?.end()]);
    await fixture?.close();
  });

  const createHeldContext = async (principal = 'user:10', nights = 1) => {
    const start = nextOffset;
    nextOffset += nights + 1;
    const checkIn = addDays(fixture.today, start);
    const checkOut = addDays(fixture.today, start + nights);

    const quote = await createItineraryQuote(stays, {
      offerId, revision: 1, checkIn, checkOut, guestCount: 2, requestId: randomUUID()
    }, principal);
    const result = await acquireHold(stays, {
      roomTypeId: 101, checkIn, checkOut, quantity: 1,
      idempotencyKey: randomUUID(), quoteId: quote.id, holderPrincipal: principal, userId: 10
    });
    expect(result.success).toBe(true);
    return {
      holdId: result.hold!.id,
      quoteId: quote.id,
      roomSubtotalPaise: Number(quote.roomSubtotalMinor),
      checkIn,
      checkOut,
      nights,
    };
  };

  /**
   * DISPOSABLE TEST FIXTURE ONLY:
   * Establishes trusted test-only payment state in MATCHED_CAPTURE
   * while preserving canonical W3-A accepted offer state (total_paise IS NULL)
   * so that W3-A canonical_finalize_direct_hold authority remains pristine.
   */
  const createTestOnlyMatchedCaptureFixture = async (nights = 1) => {
    const ctx = await createHeldContext('user:10', nights);
    const expectedAmount = ctx.roomSubtotalPaise;
    const orderRef = 'order_test_' + randomUUID();
    const paymentRef = 'pay_test_' + randomUUID();

    // 1. Temporarily provide total_paise so payment attempt derives monetary authority
    await fixture.owner.query('ALTER TABLE stays_quotes DISABLE TRIGGER stays_quote_accepted_immutable');
    await fixture.owner.query('ALTER TABLE stays_quotes DROP CONSTRAINT IF EXISTS stays_quotes_authority_shape');
    await fixture.owner.query('UPDATE stays_quotes SET total_paise = $1 WHERE id = $2', [expectedAmount, ctx.quoteId]);
    await fixture.owner.query('ALTER TABLE stays_quotes ENABLE TRIGGER stays_quote_accepted_immutable');

    // 2. Create payment attempt
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    // 3. Ingest matching PAYMENT_CAPTURED event -> enters MATCHED_CAPTURE
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      providerPaymentRef: paymentRef,
      providerOrderRef: orderRef,
      evidencePayload: {pay_id: paymentRef, amount: expectedAmount},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
    expect(dbAttempt?.matchedAt).not.toBeNull();
    expect(dbAttempt?.reconciliationReason).toBeNull();

    // 4. Restore canonical W3-A accepted offer quote state (total_paise = NULL)
    await fixture.owner.query('ALTER TABLE stays_quotes DISABLE TRIGGER stays_quote_accepted_immutable');
    await fixture.owner.query('UPDATE stays_quotes SET total_paise = NULL WHERE id = $1', [ctx.quoteId]);
    await fixture.owner.query('ALTER TABLE stays_quotes ENABLE TRIGGER stays_quote_accepted_immutable');

    return {
      attemptId: attempt.attemptId,
      expectedAmount,
      orderRef,
      paymentRef,
      ...ctx,
    };
  };

  // 1. MATCHED_CAPTURE + valid active hold -> exactly one canonical reservation
  it('1. MATCHED_CAPTURE + valid active hold -> exactly one canonical reservation', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });

    expect(res.compositionState).toBe('COMMITTED');
    expect(res.reservationId).not.toBeNull();
    expect(res.replayed).toBe(false);
    expect(res.reconciliationReason).toBeNull();

    // Verify exactly one reservation in database
    const {rows: resRows} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE id = $1',
      [res.reservationId]
    );
    expect(resRows[0].count).toBe(1);

    // Verify bridge row in canonical_payment_reservations
    const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
    expect(bridge).not.toBeNull();
    expect(bridge?.reservationId).toBe(res.reservationId);
    expect(bridge?.paymentAttemptId).toBe(fixtureData.attemptId);
    expect(bridge?.quoteId).toBe(fixtureData.quoteId);
    expect(bridge?.holdId).toBe(fixtureData.holdId);
    expect(bridge?.status).toBe('COMMITTED');
  });

  // 2. reservation is the exact W3-A reservation
  it('2. reservation is the exact W3-A reservation (quote, hold, offer/revision, itinerary, commercial snapshot)', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });

    const {rows} = await fixture.owner.query(
      'SELECT * FROM canonical_reservations WHERE id = $1',
      [res.reservationId]
    );
    expect(rows.length).toBe(1);
    const r = rows[0];

    expect(r.origin_kind).toBe('ENCHO_DIRECT');
    expect(r.listing_id).toBe(1);
    expect(r.room_type_id).toBe(101);
    expect(r.offer_id).toBe(offerId);
    expect(r.offer_revision).toBe(1);
    expect(r.quote_id).toBe(fixtureData.quoteId);
    expect(r.hold_id).toBe(fixtureData.holdId);
    expect(r.holder_principal).toBe('user:10');
    expect(r.nights).toBe(1);
    expect(r.guest_count).toBe(2);
    expect(r.room_subtotal_paise).toBe('550000');
    expect(r.currency).toBe('INR');
    expect(r.status).toBe('INVENTORY_COMMITTED');
    expect(r.command_id).toBe(commandId);
  });

  // 3. all held nights: held_units decrement, booked_units increment exactly once
  it('3. all held nights: held_units decrement, booked_units increment exactly once', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture(2); // 2 nights

    // Inspect inventory before composition
    const {rows: daysBefore} = await fixture.owner.query(
      `SELECT d.id, d.held_units, d.booked_units
       FROM inventory_days d
       JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
       WHERE hn.hold_id = $1`,
      [fixtureData.holdId]
    );
    expect(daysBefore.length).toBe(2);
    for (const d of daysBefore) {
      expect(d.held_units).toBe(1);
      expect(d.booked_units).toBe(0);
    }

    const commandId = randomUUID();
    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(res.compositionState).toBe('COMMITTED');

    // Inspect inventory after composition
    const {rows: daysAfter} = await fixture.owner.query(
      `SELECT d.id, d.held_units, d.booked_units
       FROM inventory_days d
       JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
       WHERE hn.hold_id = $1`,
      [fixtureData.holdId]
    );
    expect(daysAfter.length).toBe(2);
    for (const d of daysAfter) {
      expect(d.held_units).toBe(0);
      expect(d.booked_units).toBe(1);
    }

    // Reservation nights match
    const {rows: nights} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservation_nights WHERE reservation_id = $1',
      [res.reservationId]
    );
    expect(nights[0].count).toBe(2);
  });

  // 4. hold becomes CONSUMED
  it('4. hold becomes CONSUMED', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    const commandId = randomUUID();
    await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });

    const {rows: holdRows} = await fixture.owner.query(
      'SELECT status FROM booking_holds WHERE id = $1',
      [fixtureData.holdId]
    );
    expect(holdRows[0].status).toBe('CONSUMED');
  });

  // 5. exact command replay after successful finalization
  it('5. exact command replay after successful finalization -> same reservation ID, replayed=true, no second inventory effect', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const first = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(first.replayed).toBe(false);

    // Exact replay with same commandId
    const replay = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.reservationId).toBe(first.reservationId);
    expect(replay.compositionState).toBe('COMMITTED');

    // Total reservations in DB for this hold remains 1
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(1);

    // Inventory booked_units remains 1 (no second increment)
    const {rows: dayRows} = await fixture.owner.query(
      `SELECT d.booked_units
       FROM inventory_days d
       JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
       WHERE hn.hold_id = $1`,
      [fixtureData.holdId]
    );
    expect(dayRows[0].booked_units).toBe(1);
  });

  // 6. two concurrent same-command executions -> one reservation
  it('6. two concurrent same-command executions -> one reservation', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const [res1, res2] = await Promise.all([
      composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      }),
      composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      }),
    ]);

    expect(res1.reservationId).toBe(res2.reservationId);
    expect(res1.compositionState).toBe('COMMITTED');
    expect(res2.compositionState).toBe('COMMITTED');

    // Exactly one replayed=false, one replayed=true (or both replayed=true if serialized)
    const replayFlags = [res1.replayed, res2.replayed];
    expect(replayFlags).toContain(false);

    // Inventory effect exactly once
    const {rows: dayRows} = await fixture.owner.query(
      `SELECT d.booked_units
       FROM inventory_days d
       JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
       WHERE hn.hold_id = $1`,
      [fixtureData.holdId]
    );
    expect(dayRows[0].booked_units).toBe(1);

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(1);
  });

  // 7. two different command IDs racing on same payment attempt -> one reservation only
  it('7. two different command IDs racing on same payment attempt -> one reservation only', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId1 = randomUUID();
    const commandId2 = randomUUID();

    const results = await Promise.allSettled([
      composePaymentReservation(compositionWorker, {
        commandId: commandId1,
        paymentAttemptId: fixtureData.attemptId,
      }),
      composePaymentReservation(compositionWorker, {
        commandId: commandId2,
        paymentAttemptId: fixtureData.attemptId,
      }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const winningRes = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(winningRes.compositionState).toBe('COMMITTED');
    expect(winningRes.reservationId).not.toBeNull();

    const losingError = (rejected[0] as PromiseRejectedResult).reason;
    expect(losingError).toBeInstanceOf(CompositionAuthorityError);
    expect(losingError.code).toBe('PAYMENT_ALREADY_COMPOSED');

    // Total reservations in DB remains 1
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(1);
  });

  // 8. INITIATED attempt cannot compose
  it('8. INITIATED attempt cannot compose', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_init_' + randomUUID(),
    });
    expect(attempt.paymentState).toBe('INITIATED');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [ctx.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 9. AUTHORIZED attempt cannot compose
  it('9. AUTHORIZED attempt cannot compose', async () => {
    const ctx = await createHeldContext();
    const orderRef = 'order_auth_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_auth_' + randomUUID(),
      normalizedEventType: 'PAYMENT_AUTHORIZED',
      reportedAmountPaise: 550000,
      reportedCurrency: 'INR',
      providerPaymentRef: 'pay_auth_' + randomUUID(),
      providerOrderRef: orderRef,
      evidencePayload: {note: 'auth'},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('AUTHORIZED');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 10. UNKNOWN attempt cannot compose
  it('10. UNKNOWN attempt cannot compose', async () => {
    const ctx = await createHeldContext();
    const orderRef = 'order_unk_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_unk_' + randomUUID(),
      normalizedEventType: 'PAYMENT_UNKNOWN',
      reportedAmountPaise: 0,
      reportedCurrency: 'INR',
      providerOrderRef: orderRef,
      evidencePayload: {note: 'unknown'},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('UNKNOWN');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 11. FAILED attempt cannot compose
  it('11. FAILED attempt cannot compose', async () => {
    const ctx = await createHeldContext();
    const orderRef = 'order_fail_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_fail_' + randomUUID(),
      normalizedEventType: 'PAYMENT_FAILED',
      reportedAmountPaise: 550000,
      reportedCurrency: 'INR',
      providerOrderRef: orderRef,
      evidencePayload: {note: 'declined'},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('FAILED');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 12. RECONCILIATION_REQUIRED attempt cannot compose
  it('12. RECONCILIATION_REQUIRED attempt cannot compose', async () => {
    const ctx = await createHeldContext();
    const orderRef = 'order_rec_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    // Ingest capture with missing payment reference -> RECONCILIATION_REQUIRED / CAPTURE_IDENTITY_MISSING
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_no_ref_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 550000,
      reportedCurrency: 'INR',
      providerPaymentRef: null,
      providerOrderRef: orderRef,
      evidencePayload: {note: 'no payment id'},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 13. missing/non-authoritative capture evidence cannot compose even if state column is tampered with
  it('13. missing/non-authoritative capture evidence cannot compose even if a state column is tampered with by test owner', async () => {
    const ctx = await createHeldContext();
    const orderRef = 'order_tamper_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    // Owner maliciously tampers payment_state to MATCHED_CAPTURE without inserting any provider event
    await fixture.owner.query(
      `UPDATE canonical_payment_attempts
       SET payment_state = 'MATCHED_CAPTURE',
           matched_at = statement_timestamp(),
           expected_amount_paise = 550000
       WHERE id = $1`,
      [attempt.attemptId]
    );

    // Composition MUST fail closed with PAYMENT_CAPTURE_EVIDENCE_INVALID
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_CAPTURE_EVIDENCE_INVALID');

    // Zero reservations created
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [ctx.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 14. mismatched provider capture evidence cannot compose
  it('14. mismatched provider capture evidence cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    // Owner mutates the provider event reported_amount in canonical_provider_events
    await fixture.owner.query('ALTER TABLE canonical_provider_events DISABLE TRIGGER canonical_provider_events_immutable');
    await fixture.owner.query(
      'UPDATE canonical_provider_events SET reported_amount_paise = 999999 WHERE payment_attempt_id = $1',
      [fixtureData.attemptId]
    );
    await fixture.owner.query('ALTER TABLE canonical_provider_events ENABLE TRIGGER canonical_provider_events_immutable');

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: fixtureData.attemptId,
    })).rejects.toThrow('PAYMENT_CAPTURE_EVIDENCE_INVALID');

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 15. hold expires after MATCHED_CAPTURE but before composition
  it('15. hold expires after MATCHED_CAPTURE but before composition -> zero reservation, capture evidence preserved, reconciliation recorded', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    // Fast-forward hold past expiry
    await fixture.owner.query(
      `UPDATE booking_holds SET expires_at = clock_timestamp() - interval '5 seconds' WHERE id = $1`,
      [fixtureData.holdId]
    );

    const commandId = randomUUID();
    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });

    expect(res.compositionState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('HOLD_EXPIRED');
    expect(res.reservationId).toBeNull();
    expect(res.replayed).toBe(false);

    // Verify zero canonical reservation
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);

    // Payment attempt updated to RECONCILIATION_REQUIRED / HOLD_EXPIRED
    const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
    expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(dbAttempt?.reconciliationReason).toBe('HOLD_EXPIRED');
    expect(dbAttempt?.matchedAt).not.toBeNull(); // matched_at preserved!

    // Provider capture evidence preserved
    const {rows: events} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = $2',
      [fixtureData.attemptId, 'PAYMENT_CAPTURED']
    );
    expect(events[0].count).toBe(1);

    // Reconciliation row recorded
    const reconciliations = await getPaymentReconciliations(paymentWorker, fixtureData.attemptId);
    expect(reconciliations.some(r => r.reason === 'HOLD_EXPIRED')).toBe(true);
  });

  // 16. W3-A finalizer failure
  it('16. W3-A finalizer failure -> zero partial reservation, zero partial inventory conversion, capture evidence preserved, FINALIZER_FAILURE reconciliation', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    // Corrupt inventory day held_units so W3-A finalizer fails night validation
    await fixture.owner.query(
      `UPDATE inventory_days SET held_units = 0
       WHERE id = (SELECT inventory_day_id FROM booking_hold_nights WHERE hold_id = $1 LIMIT 1)`,
      [fixtureData.holdId]
    );

    const commandId = randomUUID();
    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });

    expect(res.compositionState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('FINALIZER_FAILURE');
    expect(res.reservationId).toBeNull();

    // Verify zero canonical reservation created for this hold
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);

    const {rows: resNightCount} = await fixture.owner.query(
      `SELECT count(*)::int AS count FROM canonical_reservation_nights
       WHERE reservation_id IN (SELECT id FROM canonical_reservations WHERE hold_id = $1)`,
      [fixtureData.holdId]
    );
    expect(resNightCount[0].count).toBe(0);

    const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
    expect(bridge).toBeNull();

    // Payment attempt updated to RECONCILIATION_REQUIRED / FINALIZER_FAILURE
    const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
    expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(dbAttempt?.reconciliationReason).toBe('FINALIZER_FAILURE');
    expect(dbAttempt?.matchedAt).not.toBeNull(); // matched_at preserved!

    // Provider capture evidence preserved
    const {rows: events} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = $2',
      [fixtureData.attemptId, 'PAYMENT_CAPTURED']
    );
    expect(events[0].count).toBe(1);

    // Reconciliation row recorded
    const reconciliations = await getPaymentReconciliations(paymentWorker, fixtureData.attemptId);
    expect(reconciliations.some(r => r.reason === 'FINALIZER_FAILURE')).toBe(true);
  });

  // 17. response-loss replay after committed reservation -> recover same reservation despite consumed hold
  it('17. response-loss replay after committed reservation -> recover same reservation despite consumed hold', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    // First commit
    const first = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(first.replayed).toBe(false);

    // Confirm hold is CONSUMED
    const {rows: holdRows} = await fixture.owner.query('SELECT status FROM booking_holds WHERE id = $1', [fixtureData.holdId]);
    expect(holdRows[0].status).toBe('CONSUMED');

    // Simulate lost response: retrying identical command recovers committed reservation without error
    const replay = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.reservationId).toBe(first.reservationId);
    expect(replay.compositionState).toBe('COMMITTED');
  });

  // 18. same command ID + different payment attempt -> conflict
  it('18. same command ID + different payment attempt -> conflict', async () => {
    const fixture1 = await createTestOnlyMatchedCaptureFixture();
    const fixture2 = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    // Command committed for attempt 1
    await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixture1.attemptId,
    });

    // Same command used for attempt 2 -> COMPOSITION_COMMAND_CONFLICT
    await expect(composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixture2.attemptId,
    })).rejects.toThrow('COMPOSITION_COMMAND_CONFLICT');
  });

  // 19. different command after payment already composed -> no second reservation
  it('19. different command after payment already composed -> no second reservation', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId1 = randomUUID();
    const commandId2 = randomUUID();

    await composePaymentReservation(compositionWorker, {
      commandId: commandId1,
      paymentAttemptId: fixtureData.attemptId,
    });

    // Attempting to compose the already-composed payment attempt with a different commandId
    await expect(composePaymentReservation(compositionWorker, {
      commandId: commandId2,
      paymentAttemptId: fixtureData.attemptId,
    })).rejects.toThrow('PAYMENT_ALREADY_COMPOSED');

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(1);
  });

  // 20. Guest/web/payment worker cannot invoke composition authority
  it('20. Guest/web/payment worker cannot invoke composition authority', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    // Guest/web role (encho_stays_web) cannot execute procedure
    await expect(stays.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    // Payment worker cannot execute procedure
    await expect(paymentWorker.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    // Composition worker role check rejects paymentWorker pool
    await expect(assertCompositionWorkerRole(paymentWorker)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
    await expect(assertCompositionWorkerRole(stays)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
  });

  // 21. no public route added
  it('21. no public route added: internal composition authority only', async () => {
    const {readFileSync} = await import('node:fs');
    const serverSource = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    expect(serverSource).not.toContain('/api/stays/compose');
    expect(serverSource).not.toContain('/api/stays/checkout');
    expect(serverSource).not.toContain('canonical_compose_payment_reservation');
  });
});
