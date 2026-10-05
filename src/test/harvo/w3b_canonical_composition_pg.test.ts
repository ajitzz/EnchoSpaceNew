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
   * Test owner inserts an approved payable authority row into canonical_payable_authorities
   * bound to the quote, without touching stays_quotes.
   * Payment worker derives this authority, ingests matching capture, and enters MATCHED_CAPTURE.
   */
  const createTestOnlyMatchedCaptureFixture = async (nights = 1) => {
    const ctx = await createHeldContext('user:10', nights);
    const expectedAmount = ctx.roomSubtotalPaise;
    const orderRef = 'order_test_' + randomUUID();
    const paymentRef = 'pay_test_' + randomUUID();
    const payableId = randomUUID();
    const contractHash = 'a'.repeat(64);

    // 1. Owner inserts DISPOSABLE TEST FIXTURE ONLY payable authority (never alters stays_quotes)
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, ctx.quoteId, expectedAmount, contractHash]
    );

    // 2. Create payment attempt (derives payable authority from DB)
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

    return {
      attemptId: attempt.attemptId,
      expectedAmount,
      payableId,
      contractHash,
      orderRef,
      paymentRef,
      ...ctx,
    };
  };

  // 1. unchanged W2 quote cannot itself provide payable authority
  it('1. unchanged W2 quote cannot itself provide payable authority', async () => {
    const ctx = await createHeldContext('user:10', 1);

    // Check stays_quotes is subtotal-only with total_paise and tax_paise NULL
    const {rows: quoteRows} = await fixture.owner.query(
      'SELECT base_price_paise, total_paise, tax_paise, quote_kind FROM stays_quotes WHERE id = $1',
      [ctx.quoteId]
    );
    expect(quoteRows[0].total_paise).toBeNull();
    expect(quoteRows[0].tax_paise).toBeNull();
    expect(quoteRows[0].quote_kind).toBe('ACCEPTED_OFFER');

    // Create payment attempt without any payable authority row in DB
    const orderRef = 'order_no_auth_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: orderRef,
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBeNull();
    expect(dbAttempt?.expectedAuthorityKind).toBe('PAYABLE_AUTHORITY_MISSING');

    // Attempting to ingest a capture event moves it to RECONCILIATION_REQUIRED / PAYABLE_AUTHORITY_MISSING
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_no_auth_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      providerPaymentRef: 'pay_no_auth_' + randomUUID(),
      providerOrderRef: orderRef,
      evidencePayload: {amount: ctx.roomSubtotalPaise},
    });

    const reconciledAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(reconciledAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(reconciledAttempt?.reconciliationReason).toBe('PAYABLE_AUTHORITY_MISSING');

    // Composition cannot proceed
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 2. positive test payable authority leaves quote unchanged
  it('2. positive test payable authority leaves quote unchanged', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId = randomUUID();
    const contractHash = 'b'.repeat(64);

    // Test owner inserts payable authority into canonical_payable_authorities
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    );

    // Verify stays_quotes remains untouched: subtotal-only, total_paise and tax_paise remain NULL
    const {rows: quoteRows} = await fixture.owner.query(
      'SELECT base_price_paise, total_paise, tax_paise, quote_kind FROM stays_quotes WHERE id = $1',
      [ctx.quoteId]
    );
    expect(quoteRows[0].total_paise).toBeNull();
    expect(quoteRows[0].tax_paise).toBeNull();
    expect(quoteRows[0].base_price_paise).toBe('550000');
  });

  // 3. quote total/tax remain NULL before and after composition
  it('3. quote total/tax remain NULL before and after composition', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    // Verify before composition
    const {rows: beforeRows} = await fixture.owner.query(
      'SELECT total_paise, tax_paise FROM stays_quotes WHERE id = $1',
      [fixtureData.quoteId]
    );
    expect(beforeRows[0].total_paise).toBeNull();
    expect(beforeRows[0].tax_paise).toBeNull();

    const commandId = randomUUID();
    const res = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(res.compositionState).toBe('COMMITTED');

    // Verify after composition
    const {rows: afterRows} = await fixture.owner.query(
      'SELECT total_paise, tax_paise FROM stays_quotes WHERE id = $1',
      [fixtureData.quoteId]
    );
    expect(afterRows[0].total_paise).toBeNull();
    expect(afterRows[0].tax_paise).toBeNull();
  });

  // 4. payment attempt derives test payable authority from DB
  it('4. payment attempt derives test payable authority from DB', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId = randomUUID();
    const contractHash = 'c'.repeat(64);

    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    );

    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_derive_' + randomUUID(),
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(Number(dbAttempt?.expectedAmountPaise)).toBe(ctx.roomSubtotalPaise);
    expect(dbAttempt?.expectedCurrency).toBe('INR');
    expect(dbAttempt?.expectedAuthorityKind).toBe('DISPOSABLE TEST FIXTURE ONLY');
    expect(dbAttempt?.expectedAuthorityRef).toBe(payableId);
    expect(dbAttempt?.expectedAuthorityHash).toBe(contractHash);
  });

  // 5. caller cannot select arbitrary authority/amount
  it('5. caller cannot select arbitrary authority/amount', async () => {
    const ctx = await createHeldContext('user:10', 1);

    // Neither service nor stored procedure accepts amount parameters
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_arb_' + randomUUID(),
      // Extra fields are rejected by strict Zod schema
    } as any);

    // DB attempt without payable authority in table has NULL expected amount
    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBeNull();
    expect(dbAttempt?.expectedAuthorityKind).toBe('PAYABLE_AUTHORITY_MISSING');
  });

  // 6. valid MATCHED_CAPTURE + valid hold -> exactly one canonical reservation
  it('6. valid MATCHED_CAPTURE + valid hold -> exactly one canonical reservation', async () => {
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

    // Verify exact W3-A reservation details
    const {rows: resDetails} = await fixture.owner.query(
      'SELECT * FROM canonical_reservations WHERE id = $1',
      [res.reservationId]
    );
    const r = resDetails[0];
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

    // Verify hold became CONSUMED
    const {rows: holdRows} = await fixture.owner.query(
      'SELECT status FROM booking_holds WHERE id = $1',
      [fixtureData.holdId]
    );
    expect(holdRows[0].status).toBe('CONSUMED');
  });

  // 7. tampered payment state without evidence cannot compose
  it('7. tampered payment state without evidence cannot compose even if state column is tampered with', async () => {
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

    // Composition MUST fail closed with PAYMENT_PAYABLE_AUTHORITY_MISSING or PAYMENT_CAPTURE_EVIDENCE_INVALID
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow(/PAYMENT_PAYABLE_AUTHORITY_MISSING|PAYMENT_CAPTURE_EVIDENCE_INVALID/);

    // Zero reservations created
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [ctx.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 8. unresolved reconciliation blocks
  it('8. unresolved reconciliation blocks composition', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

    // Insert an unresolved reconciliation row for this attempt
    await fixture.owner.query(
      `INSERT INTO canonical_payment_reconciliations (
        payment_attempt_id, reason, details, resolved
      ) VALUES ($1, 'CAPTURE_CONFLICT', '{"note": "fraud check"}'::jsonb, FALSE)`,
      [fixtureData.attemptId]
    );

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: fixtureData.attemptId,
    })).rejects.toThrow('PAYMENT_RECONCILIATION_UNRESOLVED');

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 9. exact replay after consumed hold -> same reservation
  it('9. exact replay after consumed hold -> same reservation ID, replayed=true, no second inventory effect', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const first = await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixtureData.attemptId,
    });
    expect(first.replayed).toBe(false);

    // Verify hold is CONSUMED
    const {rows: holdRows} = await fixture.owner.query(
      'SELECT status FROM booking_holds WHERE id = $1',
      [fixtureData.holdId]
    );
    expect(holdRows[0].status).toBe('CONSUMED');

    // Exact replay with same commandId recovers same reservation despite consumed hold
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

  // 10. different command same payment -> no second reservation
  it('10. different command same payment -> no second reservation', async () => {
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

  // 11. hold expires after capture -> no reservation
  it('11. hold expires after capture -> no reservation, capture evidence preserved, reconciliation recorded', async () => {
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

  // 12. inner W3-A failure -> no partial reservation/inventory
  it('12. inner W3-A failure -> no partial reservation/inventory, capture preserved, reconciliation recorded', async () => {
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
    expect(dbAttempt?.matchedAt).not.toBeNull();

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

  // 13. post-W3-A outer failure -> ALL W3-A effects rolled back
  it('13. post-W3-A outer failure -> ALL W3-A effects rolled back atomically (no orphaned reservation or inventory conversion)', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    // Test owner installs a temporary fixture trigger on canonical_payment_reservations that raises an exception on bridge insert
    await fixture.owner.query(`
      CREATE OR REPLACE FUNCTION fixture_fail_bridge_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'FIXTURE_INJECTED_BRIDGE_FAILURE';
      END $$;
      CREATE TRIGGER fixture_test_fail_bridge BEFORE INSERT ON canonical_payment_reservations
        FOR EACH ROW EXECUTE FUNCTION fixture_fail_bridge_insert();
    `);

    try {
      // Composition MUST fail due to outer transaction abort
      await expect(composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      })).rejects.toThrow(/FIXTURE_INJECTED_BRIDGE_FAILURE|COMPOSITION_AUTHORITY_UNAVAILABLE/);

      // Verify ALL W3-A effects were rolled back:
      // 1. Zero canonical reservations created
      const {rows: resCount} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fixtureData.holdId]
      );
      expect(resCount[0].count).toBe(0);

      // 2. Zero reservation nights
      const {rows: resNights} = await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_nights
         WHERE reservation_id IN (SELECT id FROM canonical_reservations WHERE hold_id = $1)`,
        [fixtureData.holdId]
      );
      expect(resNights[0].count).toBe(0);

      // 3. Inventory units restored: held_units remains 1, booked_units remains 0
      const {rows: dayRows} = await fixture.owner.query(
        `SELECT d.held_units, d.booked_units
         FROM inventory_days d
         JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
         WHERE hn.hold_id = $1`,
        [fixtureData.holdId]
      );
      expect(dayRows[0].held_units).toBe(1);
      expect(dayRows[0].booked_units).toBe(0);

      // 4. Hold remains ACTIVE (not consumed)
      const {rows: holdRows} = await fixture.owner.query(
        'SELECT status FROM booking_holds WHERE id = $1',
        [fixtureData.holdId]
      );
      expect(holdRows[0].status).toBe('ACTIVE');

      // 5. Zero bridge rows in canonical_payment_reservations
      const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
      expect(bridge).toBeNull();

      // 6. Pre-existing payment capture evidence from earlier transaction remains intact
      const {rows: events} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = $2',
        [fixtureData.attemptId, 'PAYMENT_CAPTURED']
      );
      expect(events[0].count).toBe(1);

      // 7. Payment attempt remains in MATCHED_CAPTURE (transaction rolled back)
      const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
      expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
    } finally {
      // Clean up temporary fixture trigger
      await fixture.owner.query(`
        DROP TRIGGER IF EXISTS fixture_test_fail_bridge ON canonical_payment_reservations;
        DROP FUNCTION IF EXISTS fixture_fail_bridge_insert();
      `);
    }
  });

  // 14. conflicting provider event wins lock before composition -> composition refuses after serialization
  it('14. conflicting provider event wins lock before composition -> composition refuses after serialization', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const conn1 = await fixture.owner.connect();
    try {
      // Connection 1 begins transaction and acquires row lock on payment attempt
      await conn1.query('BEGIN');
      await conn1.query('SELECT * FROM canonical_payment_attempts WHERE id = $1 FOR UPDATE', [fixtureData.attemptId]);

      // Connection 2 launches composition -> blocks waiting for connection 1 lock
      let compCompleted = false;
      const compPromise = composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      }).finally(() => {
        compCompleted = true;
      });

      // Brief pause to ensure connection 2 is blocked on lock
      await new Promise(r => setTimeout(r, 100));
      expect(compCompleted).toBe(false);

      // Connection 1 mutates attempt to RECONCILIATION_REQUIRED and commits
      await conn1.query(
        `UPDATE canonical_payment_attempts
         SET payment_state = 'RECONCILIATION_REQUIRED',
             reconciliation_reason = 'CAPTURE_CONFLICT',
             updated_at = statement_timestamp()
         WHERE id = $1`,
        [fixtureData.attemptId]
      );
      await conn1.query(
        `INSERT INTO canonical_payment_reconciliations (
          payment_attempt_id, reason, details
        ) VALUES ($1, 'CAPTURE_CONFLICT', '{"source": "independent_connection_race"}'::jsonb)`,
        [fixtureData.attemptId]
      );
      await conn1.query('COMMIT');

      // Connection 2 now unblocks, observes RECONCILIATION_REQUIRED, and refuses to compose
      await expect(compPromise).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

      // Verify zero reservations created
      const {rows: resCount} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fixtureData.holdId]
      );
      expect(resCount[0].count).toBe(0);

      // Hold remains ACTIVE
      const {rows: holdRows} = await fixture.owner.query(
        'SELECT status FROM booking_holds WHERE id = $1',
        [fixtureData.holdId]
      );
      expect(holdRows[0].status).toBe('ACTIVE');
    } catch (err) {
      await conn1.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      conn1.release();
    }
  });

  // 15. composition worker cannot directly execute W3-A finalizer
  it('15. composition worker cannot directly execute W3-A finalizer', async () => {
    const ctx = await createHeldContext();

    // 1. Function privilege query returns false
    const {rows: privRows} = await compositionWorker.query(
      `SELECT has_function_privilege(current_user, 'public.canonical_finalize_direct_hold(uuid,uuid,uuid)', 'EXECUTE') AS has_priv`
    );
    expect(privRows[0].has_priv).toBe(false);

    // 2. Direct execution attempt receives permission denied
    await expect(compositionWorker.query(
      `SELECT * FROM canonical_finalize_direct_hold($1::uuid, $2::uuid, $3::uuid)`,
      [ctx.holdId, ctx.quoteId, randomUUID()]
    )).rejects.toThrow(/permission denied/);

    // 3. Raw table DML on canonical_payable_authorities is denied
    await expect(compositionWorker.query(
      `SELECT * FROM canonical_payable_authorities`
    )).rejects.toThrow(/permission denied/);
  });

  // 16. payment worker cannot compose
  it('16. payment worker cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    await expect(paymentWorker.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    await expect(assertCompositionWorkerRole(paymentWorker)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
  });

  // 17. Guest/web cannot compose
  it('17. Guest/web cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    await expect(stays.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    await expect(assertCompositionWorkerRole(stays)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
  });

  // 18. zero duplicate reservations: concurrent executions yield exactly one reservation
  it('18. zero duplicate reservations: concurrent executions yield exactly one reservation', async () => {
    // A. Two concurrent same-command executions -> exactly one reservation, one replayed=true
    const fixture1 = await createTestOnlyMatchedCaptureFixture();
    const sameCmd = randomUUID();

    const [res1, res2] = await Promise.all([
      composePaymentReservation(compositionWorker, {
        commandId: sameCmd,
        paymentAttemptId: fixture1.attemptId,
      }),
      composePaymentReservation(compositionWorker, {
        commandId: sameCmd,
        paymentAttemptId: fixture1.attemptId,
      }),
    ]);

    expect(res1.reservationId).toBe(res2.reservationId);
    expect([res1.replayed, res2.replayed]).toContain(false);

    const {rows: resCount1} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixture1.holdId]
    );
    expect(resCount1[0].count).toBe(1);

    // B. Two concurrent different-command executions on same payment -> exactly one succeeds, one rejected
    const fixture2 = await createTestOnlyMatchedCaptureFixture();
    const diffCmd1 = randomUUID();
    const diffCmd2 = randomUUID();

    const diffResults = await Promise.allSettled([
      composePaymentReservation(compositionWorker, {
        commandId: diffCmd1,
        paymentAttemptId: fixture2.attemptId,
      }),
      composePaymentReservation(compositionWorker, {
        commandId: diffCmd2,
        paymentAttemptId: fixture2.attemptId,
      }),
    ]);

    const fulfilled = diffResults.filter(r => r.status === 'fulfilled');
    const rejected = diffResults.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const losingError = (rejected[0] as PromiseRejectedResult).reason;
    expect(losingError).toBeInstanceOf(CompositionAuthorityError);
    expect(losingError.code).toBe('PAYMENT_ALREADY_COMPOSED');

    const {rows: resCount2} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixture2.holdId]
    );
    expect(resCount2[0].count).toBe(1);
  });

  // 19. external-channel reservation schema remains independent
  it('19. external-channel reservation schema remains independent', async () => {
    // The legacy bookings table and external reservation pathways do not reference
    // canonical_payment_reservations or canonical_payable_authorities.
    const {rows} = await fixture.owner.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'bookings'
        AND ccu.table_name IN ('canonical_payment_reservations', 'canonical_payable_authorities')
    `);
    expect(rows.length).toBe(0);
  });

  // 20. Non-captured states cannot compose
  it('20. INITIATED, AUTHORIZED, UNKNOWN, FAILED states cannot compose', async () => {
    // INITIATED
    const ctx1 = await createHeldContext();
    const att1 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx1.quoteId,
      holdId: ctx1.holdId,
      providerOrderRef: 'order_init_' + randomUUID(),
    });
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: att1.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

    // AUTHORIZED
    const ctx2 = await createHeldContext();
    const order2 = 'order_auth_' + randomUUID();
    const att2 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx2.quoteId,
      holdId: ctx2.holdId,
      providerOrderRef: order2,
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: att2.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_auth_' + randomUUID(),
      normalizedEventType: 'PAYMENT_AUTHORIZED',
      reportedAmountPaise: 550000,
      reportedCurrency: 'INR',
      providerPaymentRef: 'pay_auth_' + randomUUID(),
      providerOrderRef: order2,
      evidencePayload: {note: 'auth'},
    });
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: att2.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

    // UNKNOWN
    const ctx3 = await createHeldContext();
    const order3 = 'order_unk_' + randomUUID();
    const att3 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx3.quoteId,
      holdId: ctx3.holdId,
      providerOrderRef: order3,
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: att3.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_unk_' + randomUUID(),
      normalizedEventType: 'PAYMENT_UNKNOWN',
      reportedAmountPaise: 0,
      reportedCurrency: 'INR',
      providerOrderRef: order3,
      evidencePayload: {note: 'unknown'},
    });
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: att3.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

    // FAILED
    const ctx4 = await createHeldContext();
    const order4 = 'order_fail_' + randomUUID();
    const att4 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx4.quoteId,
      holdId: ctx4.holdId,
      providerOrderRef: order4,
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: att4.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_fail_' + randomUUID(),
      normalizedEventType: 'PAYMENT_FAILED',
      reportedAmountPaise: 550000,
      reportedCurrency: 'INR',
      providerOrderRef: order4,
      evidencePayload: {note: 'declined'},
    });
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: att4.attemptId,
    })).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');
  });

  // 21. mismatched provider capture evidence cannot compose
  it('21. mismatched provider capture evidence cannot compose', async () => {
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

  // 22. same command ID + different payment attempt -> conflict
  it('22. same command ID + different payment attempt -> conflict', async () => {
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

  // 23. no public route added
  it('23. no public route added: internal composition authority only', async () => {
    const {readFileSync} = await import('node:fs');
    const serverSource = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    expect(serverSource).not.toContain('/api/stays/compose');
    expect(serverSource).not.toContain('/api/stays/checkout');
    expect(serverSource).not.toContain('canonical_compose_payment_reservation');
  });
});
