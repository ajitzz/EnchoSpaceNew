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

  // 1. payable authority lifecycle is exactly one immutable APPROVED authority per quote
  it('1. payable authority lifecycle is exactly one immutable APPROVED authority per quote', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId = randomUUID();
    const contractHash = '1'.repeat(64);

    // A. Attempting to insert status other than APPROVED fails check constraint
    await expect(fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'TEST', $4, 'SUPERSEDED')`,
      [randomUUID(), ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    )).rejects.toThrow(/check constraint "canonical_payable_authorities_status_check"/);

    await expect(fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'TEST', $4, 'REVOKED')`,
      [randomUUID(), ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    )).rejects.toThrow(/check constraint "canonical_payable_authorities_status_check"/);

    // B. Inserting valid APPROVED row succeeds
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'TEST', $4, 'APPROVED')`,
      [payableId, ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    );

    // C. UPDATE is rejected by immutability trigger
    await expect(fixture.owner.query(
      `UPDATE canonical_payable_authorities SET payable_amount_paise = 999999 WHERE id = $1`,
      [payableId]
    )).rejects.toThrow('CANONICAL_PAYABLE_AUTHORITY_IMMUTABLE');

    // D. DELETE is rejected by immutability trigger
    await expect(fixture.owner.query(
      `DELETE FROM canonical_payable_authorities WHERE id = $1`,
      [payableId]
    )).rejects.toThrow('CANONICAL_PAYABLE_AUTHORITY_IMMUTABLE');
  });

  // 2. second payable authority for same quote is rejected
  it('2. second payable authority for same quote is rejected (quote_id UNIQUE)', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId1 = randomUUID();
    const payableId2 = randomUUID();
    const contractHash = '2'.repeat(64);

    // First authority insert succeeds
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'TEST', $4, 'APPROVED')`,
      [payableId1, ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    );

    // Second authority insert for same quote_id violates unique constraint
    await expect(fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'TEST', $4, 'APPROVED')`,
      [payableId2, ctx.quoteId, ctx.roomSubtotalPaise, contractHash]
    )).rejects.toThrow(/unique constraint "canonical_payable_authorities_quote_id_key"/);
  });

  // 3. payment attempt exact authority kind/ref/hash/amount/currency all match
  it('3. payment attempt exact authority kind/ref/hash/amount/currency all match', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId = randomUUID();
    const contractHash = '3'.repeat(64);

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

  // 4. same amount/currency but different authority contract/hash cannot compose
  it('4. same amount/currency but different authority contract/hash cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const differentHash = 'f'.repeat(64);

    // Owner mutates the payment attempt's expected_authority_hash to a different contract hash
    // while keeping amount, currency, and MATCHED_CAPTURE status untouched
    await fixture.owner.query(
      `UPDATE canonical_payment_attempts
       SET expected_authority_hash = $1
       WHERE id = $2`,
      [differentHash, fixtureData.attemptId]
    );

    // Composition MUST fail closed with PAYMENT_PAYABLE_AUTHORITY_MISMATCH
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: fixtureData.attemptId,
    })).rejects.toThrow('PAYMENT_PAYABLE_AUTHORITY_MISMATCH');

    // Zero reservations created
    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 5. same amount/currency but different authority ref/id cannot compose
  it('5. same amount/currency but different authority ref/id cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const differentRef = randomUUID();

    // Owner mutates attempt's expected_authority_ref to a different ID
    await fixture.owner.query(
      `UPDATE canonical_payment_attempts
       SET expected_authority_ref = $1
       WHERE id = $2`,
      [differentRef, fixtureData.attemptId]
    );

    // Composition MUST fail closed with PAYMENT_PAYABLE_AUTHORITY_MISMATCH
    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: fixtureData.attemptId,
    })).rejects.toThrow('PAYMENT_PAYABLE_AUTHORITY_MISMATCH');

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [fixtureData.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 6. unchanged W2 quote cannot itself provide payable authority
  it('6. unchanged W2 quote cannot itself provide payable authority', async () => {
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

  // 7. positive test payable authority leaves quote unchanged
  it('7. positive test payable authority leaves quote unchanged', async () => {
    const ctx = await createHeldContext('user:10', 1);
    const payableId = randomUUID();
    const contractHash = '7'.repeat(64);

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

  // 8. quote total/tax remain NULL before and after composition
  it('8. quote total/tax remain NULL before and after composition', async () => {
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

  // 9. caller cannot select arbitrary authority/amount
  it('9. caller cannot select arbitrary authority/amount', async () => {
    const ctx = await createHeldContext('user:10', 1);

    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_arb_' + randomUUID(),
    } as any);

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBeNull();
    expect(dbAttempt?.expectedAuthorityKind).toBe('PAYABLE_AUTHORITY_MISSING');
  });

  // 10. valid MATCHED_CAPTURE + valid hold -> exactly one canonical reservation
  it('10. valid MATCHED_CAPTURE + valid hold -> exactly one canonical reservation', async () => {
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

  // 11. tampered payment state without evidence cannot compose
  it('11. tampered payment state without evidence cannot compose even if state column is tampered with', async () => {
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

    await expect(composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    })).rejects.toThrow(/PAYMENT_PAYABLE_AUTHORITY_MISSING|PAYMENT_CAPTURE_EVIDENCE_INVALID/);

    const {rows: resCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
      [ctx.holdId]
    );
    expect(resCount[0].count).toBe(0);
  });

  // 12. unresolved reconciliation blocks
  it('12. unresolved reconciliation blocks composition', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

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

  // 13. exact replay after consumed hold -> same reservation
  it('13. exact replay after consumed hold -> same reservation ID, replayed=true, no second inventory effect', async () => {
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

  // 14. different command same payment -> no second reservation
  it('14. different command same payment -> no second reservation', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId1 = randomUUID();
    const commandId2 = randomUUID();

    await composePaymentReservation(compositionWorker, {
      commandId: commandId1,
      paymentAttemptId: fixtureData.attemptId,
    });

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

  // 15. hold expires after capture -> no reservation
  it('15. hold expires after capture -> no reservation, capture evidence preserved, reconciliation recorded', async () => {
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
    expect(dbAttempt?.matchedAt).not.toBeNull();

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

  // 16. inner W3-A failure -> no partial reservation/inventory
  it('16. inner W3-A failure -> no partial reservation/inventory, capture preserved, reconciliation recorded', async () => {
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

  // 17. post-W3-A outer failure -> ALL W3-A effects rolled back
  it('17. post-W3-A outer failure -> ALL W3-A effects rolled back atomically (no orphaned reservation or inventory conversion)', async () => {
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
      await expect(composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      })).rejects.toThrow(/FIXTURE_INJECTED_BRIDGE_FAILURE|COMPOSITION_AUTHORITY_UNAVAILABLE/);

      // Verify ALL W3-A effects were rolled back:
      const {rows: resCount} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fixtureData.holdId]
      );
      expect(resCount[0].count).toBe(0);

      const {rows: resNights} = await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_nights
         WHERE reservation_id IN (SELECT id FROM canonical_reservations WHERE hold_id = $1)`,
        [fixtureData.holdId]
      );
      expect(resNights[0].count).toBe(0);

      const {rows: dayRows} = await fixture.owner.query(
        `SELECT d.held_units, d.booked_units
         FROM inventory_days d
         JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
         WHERE hn.hold_id = $1`,
        [fixtureData.holdId]
      );
      expect(dayRows[0].held_units).toBe(1);
      expect(dayRows[0].booked_units).toBe(0);

      const {rows: holdRows} = await fixture.owner.query(
        'SELECT status FROM booking_holds WHERE id = $1',
        [fixtureData.holdId]
      );
      expect(holdRows[0].status).toBe('ACTIVE');

      const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
      expect(bridge).toBeNull();

      const {rows: events} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = $2',
        [fixtureData.attemptId, 'PAYMENT_CAPTURED']
      );
      expect(events[0].count).toBe(1);

      const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
      expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
    } finally {
      await fixture.owner.query(`
        DROP TRIGGER IF EXISTS fixture_test_fail_bridge ON canonical_payment_reservations;
        DROP FUNCTION IF EXISTS fixture_fail_bridge_insert();
      `);
    }
  });

  // 18. real canonical_ingest_provider_event vs composition race: provider reconciliation wins first -> composition refuses
  it('18. real canonical_ingest_provider_event vs composition race: provider reconciliation wins first -> composition refuses', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const connA = await paymentWorker.connect();
    try {
      // Connection A begins transaction and calls canonical_ingest_provider_event with conflicting second capture
      // This acquires the FOR UPDATE row lock on canonical_payment_attempts within connA's open transaction!
      await connA.query('BEGIN');
      const conflictEventId = 'evt_conflict_' + randomUUID();
      const conflictPayRef = 'pay_conflict_' + randomUUID();

      const {rows: ingestRows} = await connA.query<{
        payment_state: string;
        reconciliation_reason: string;
      }>(
        `SELECT payment_state, reconciliation_reason
         FROM canonical_ingest_provider_event(
           $1::uuid, $2::text, $3::text, $4::text, $5::bigint, $6::text, $7::text, $8::text, $9::jsonb, statement_timestamp()
         )`,
        [
          fixtureData.attemptId,
          'RAZORPAY',
          conflictEventId,
          'PAYMENT_CAPTURED',
          fixtureData.expectedAmount,
          'INR',
          conflictPayRef,
          fixtureData.orderRef,
          JSON.stringify({pay_id: conflictPayRef}),
        ]
      );
      expect(ingestRows[0].payment_state).toBe('RECONCILIATION_REQUIRED');
      expect(ingestRows[0].reconciliation_reason).toBe('CAPTURE_CONFLICT');

      // Connection B launches composition -> blocks waiting for connection A's row lock on canonical_payment_attempts
      let compCompleted = false;
      const compPromise = composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fixtureData.attemptId,
      }).finally(() => {
        compCompleted = true;
      });

      // Brief pause to ensure connection B is blocked waiting for the row lock
      await new Promise(r => setTimeout(r, 100));
      expect(compCompleted).toBe(false);

      // Connection A commits: releases lock and commits RECONCILIATION_REQUIRED state
      await connA.query('COMMIT');

      // Connection B now unblocks, observes RECONCILIATION_REQUIRED, and refuses composition
      await expect(compPromise).rejects.toThrow('PAYMENT_STATE_NOT_CAPTURED');

      // Verify zero canonical reservations created
      const {rows: resCount} = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fixtureData.holdId]
      );
      expect(resCount[0].count).toBe(0);

      // Verify zero composition bridge
      const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
      expect(bridge).toBeNull();

      // Hold remains ACTIVE (not consumed)
      const {rows: holdRows} = await fixture.owner.query(
        'SELECT status FROM booking_holds WHERE id = $1',
        [fixtureData.holdId]
      );
      expect(holdRows[0].status).toBe('ACTIVE');

      // Payment attempt remains RECONCILIATION_REQUIRED / CAPTURE_CONFLICT
      const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
      expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
      expect(dbAttempt?.reconciliationReason).toBe('CAPTURE_CONFLICT');

      // Reconciliation row and conflicting provider event are durably preserved
      const reconciliations = await getPaymentReconciliations(paymentWorker, fixtureData.attemptId);
      expect(reconciliations.some(r => r.reason === 'CAPTURE_CONFLICT')).toBe(true);
    } catch (err) {
      await connA.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      connA.release();
    }
  });

  // 19. real composition vs provider event race: composition wins lock first -> late conflicting provider event enters reconciliation while reservation remains intact
  it('19. real composition vs provider event race: composition wins lock first -> late conflicting provider event enters reconciliation while reservation remains intact', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    const connB = await compositionWorker.connect();
    try {
      // Connection B begins transaction and calls canonical_compose_payment_reservation
      // This acquires the FOR UPDATE row lock on canonical_payment_attempts within connB's open transaction!
      await connB.query('BEGIN');
      const {rows: compRows} = await connB.query<{
        reservation_id: string;
        composition_state: string;
      }>(
        `SELECT reservation_id, composition_state
         FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)`,
        [commandId, fixtureData.attemptId]
      );
      expect(compRows[0].composition_state).toBe('COMMITTED');
      expect(compRows[0].reservation_id).not.toBeNull();

      // Connection A launches provider event ingestion with a DIFFERENT non-empty provider payment ref on the same payment attempt -> blocks
      const conflictingLatePaymentRef = 'pay_conflicting_late_' + randomUUID();
      let ingestCompleted = false;
      const ingestPromise = ingestProviderEvent(paymentWorker, {
        attemptId: fixtureData.attemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_after_comp_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: fixtureData.expectedAmount,
        reportedCurrency: 'INR',
        providerPaymentRef: conflictingLatePaymentRef, // DIFFERENT non-empty provider payment ref
        providerOrderRef: fixtureData.orderRef,
        evidencePayload: {conflicting: true, pay_id: conflictingLatePaymentRef},
      }).finally(() => {
        ingestCompleted = true;
      });

      // Brief pause to verify connection A is blocked waiting for connection B lock
      await new Promise(r => setTimeout(r, 100));
      expect(ingestCompleted).toBe(false);

      // Connection B commits
      await connB.query('COMMIT');

      // Connection A unblocks and finishes processing
      const ingestRes = await ingestPromise;
      expect(ingestRes.ingestStatus).toBe('PROCESSED');
      expect(ingestRes.paymentState).toBe('RECONCILIATION_REQUIRED');
      expect(ingestRes.reconciliationReason).toBe('CAPTURE_CONFLICT');

      // 1. Payment enters RECONCILIATION_REQUIRED / CAPTURE_CONFLICT
      const dbAttempt = await getPaymentAttempt(paymentWorker, fixtureData.attemptId);
      expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
      expect(dbAttempt?.reconciliationReason).toBe('CAPTURE_CONFLICT');

      // 2. Reconciliation row is recorded
      const reconciliations = await getPaymentReconciliations(paymentWorker, fixtureData.attemptId);
      expect(reconciliations.some(r => r.reason === 'CAPTURE_CONFLICT')).toBe(true);

      // 3. Exactly one canonical reservation remains with unchanged identity and commercial snapshot
      const {rows: resRows} = await fixture.owner.query(
        'SELECT * FROM canonical_reservations WHERE hold_id = $1',
        [fixtureData.holdId]
      );
      expect(resRows.length).toBe(1);
      const res = resRows[0];
      expect(res.id).toBe(compRows[0].reservation_id);
      expect(res.origin_kind).toBe('ENCHO_DIRECT');
      expect(res.status).toBe('INVENTORY_COMMITTED');
      expect(res.room_subtotal_paise).toBe('550000');
      expect(res.currency).toBe('INR');
      expect(res.nights).toBe(fixtureData.nights);
      expect(res.guest_count).toBe(2);
      expect(res.command_id).toBe(commandId);
      expect(res.quote_id).toBe(fixtureData.quoteId);
      expect(res.hold_id).toBe(fixtureData.holdId);
      expect(res.offer_id).toBe(offerId);
      expect(res.offer_revision).toBe(1);

      // 4. Exactly one payment-reservation bridge remains committed
      const bridge = await getPaymentReservation(compositionWorker, fixtureData.attemptId);
      expect(bridge).not.toBeNull();
      expect(bridge?.status).toBe('COMMITTED');
      expect(bridge?.reservationId).toBe(compRows[0].reservation_id);
      expect(bridge?.paymentAttemptId).toBe(fixtureData.attemptId);
      expect(bridge?.commandId).toBe(commandId);

      // 5. Hold remains CONSUMED
      const {rows: holdRows} = await fixture.owner.query(
        'SELECT status FROM booking_holds WHERE id = $1',
        [fixtureData.holdId]
      );
      expect(holdRows[0].status).toBe('CONSUMED');

      // 6. Every inventory night remains booked exactly once
      const {rows: dayRows} = await fixture.owner.query(
        `SELECT d.held_units, d.booked_units
         FROM inventory_days d
         JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
         WHERE hn.hold_id = $1`,
        [fixtureData.holdId]
      );
      expect(dayRows.length).toBe(fixtureData.nights);
      for (const day of dayRows) {
        expect(day.held_units).toBe(0);
        expect(day.booked_units).toBe(1);
      }
    } catch (err) {
      await connB.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      connB.release();
    }
  });

  // 20. composition worker cannot directly execute W3-A finalizer
  it('20. composition worker cannot directly execute W3-A finalizer', async () => {
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

  // 21. payment worker cannot compose
  it('21. payment worker cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    await expect(paymentWorker.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    await expect(assertCompositionWorkerRole(paymentWorker)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
  });

  // 22. Guest/web cannot compose
  it('22. Guest/web cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    await expect(stays.query(
      'SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)',
      [commandId, fixtureData.attemptId]
    )).rejects.toThrow(/permission denied/);

    await expect(assertCompositionWorkerRole(stays)).rejects.toThrow('COMPOSITION_ROLE_NOT_RESTRICTED');
  });

  // 23. zero duplicate reservations: concurrent executions yield exactly one reservation
  it('23. zero duplicate reservations: concurrent executions yield exactly one reservation', async () => {
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

  // 24. external-channel reservation schema remains independent
  it('24. external-channel reservation schema remains independent', async () => {
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

  // 25. Non-captured states cannot compose
  it('25. INITIATED, AUTHORIZED, UNKNOWN, FAILED states cannot compose', async () => {
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

  // 26. mismatched provider capture evidence cannot compose
  it('26. mismatched provider capture evidence cannot compose', async () => {
    const fixtureData = await createTestOnlyMatchedCaptureFixture();

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

  // 27. same command ID + different payment attempt -> conflict
  it('27. same command ID + different payment attempt -> conflict', async () => {
    const fixture1 = await createTestOnlyMatchedCaptureFixture();
    const fixture2 = await createTestOnlyMatchedCaptureFixture();
    const commandId = randomUUID();

    await composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixture1.attemptId,
    });

    await expect(composePaymentReservation(compositionWorker, {
      commandId,
      paymentAttemptId: fixture2.attemptId,
    })).rejects.toThrow('COMPOSITION_COMMAND_CONFLICT');
  });

  // 28. no public route added: internal composition authority only
  it('28. no public route added: internal composition authority only', async () => {
    const {readFileSync} = await import('node:fs');
    const serverSource = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    expect(serverSource).not.toContain('/api/stays/compose');
    expect(serverSource).not.toContain('/api/stays/checkout');
    expect(serverSource).not.toContain('canonical_compose_payment_reservation');
  });
});
