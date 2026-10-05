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
  getPaymentAttempt,
  getPaymentReconciliations,
  ingestProviderEvent,
  recordPaymentUnknown,
  PaymentAuthorityError
} from '../../services/canonicalPaymentService.js';
import {addDays, createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('W3-B Task 2: Provider-independent payment evidence and reconciliation authority on real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let stays: pg.Pool;
  let paymentWorker: pg.Pool;
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

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 8});
    await assertPaymentWorkerRole(paymentWorker);

    // Establish accepted offer
    const service = new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'), 'LOCAL');
    const draft = await service.createDraft(fixture.principal(10), {
      commandId: randomUUID(), listingId: 1, roomTypeId: 101, amountMinor: '550000',
      stayStart: fixture.today, stayEnd: addDays(fixture.today, 70),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 70 * 86400000).toISOString(), maxGuests: 2, minNights: 1,
    });
    const submitted = await service.submit(fixture.principal(10), {
      offerId: draft.offerId, revision: 1, expectedVersion: draft.version});
    await fixture.grantOffer(draft.offerId);
    await service.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft.offerId, revision: 1, expectedVersion: submitted.version});
    offerId = draft.offerId;
  }, 90000);

  afterAll(async () => {
    await Promise.all([stays?.end(), paymentWorker?.end()]);
    await fixture?.close();
  });

  const createHeldContext = async () => {
    const start = nextOffset; nextOffset += 4;
    const checkIn = addDays(fixture.today, start);
    const checkOut = addDays(fixture.today, start + 3);
    const quote = await createItineraryQuote(stays, {
      offerId, revision: 1, checkIn, checkOut, guestCount: 2, requestId: randomUUID()
    }, 'user:10');
    const result = await acquireHold(stays, {
      roomTypeId: 101, checkIn, checkOut, quantity: 1,
      idempotencyKey: randomUUID(), quoteId: quote.id, holderPrincipal: 'user:10', userId: 10
    });
    expect(result.success).toBe(true);
    return {
      holdId: result.hold!.id,
      quoteId: quote.id,
      roomSubtotalPaise: Number(quote.roomSubtotalMinor),
      checkIn,
      checkOut,
    };
  };

  // TEST 1: Duplicate identical provider event → one logical evidence effect
  it('1. duplicate identical provider event produces one logical evidence effect', async () => {
    const ctx = await createHeldContext();
    const commandId = randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'NONE',
    });
    expect(attempt.paymentState).toBe('INITIATED');

    const eventPayload = {
      razorpay_payment_id: 'pay_dup_' + randomUUID(),
      razorpay_order_id: 'order_dup_' + randomUUID(),
      amount: ctx.roomSubtotalPaise,
      currency: 'INR',
    };
    const eventId = 'evt_dup_' + randomUUID();

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      providerPaymentRef: eventPayload.razorpay_payment_id,
      providerOrderRef: eventPayload.razorpay_order_id,
      evidencePayload: eventPayload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');
    expect(first.replayed).toBe(false);

    // Ingest the EXACT same event ID and payload again
    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      providerPaymentRef: eventPayload.razorpay_payment_id,
      providerOrderRef: eventPayload.razorpay_order_id,
      evidencePayload: eventPayload,
    });
    expect(second.ingestStatus).toBe('DUPLICATE_IGNORED');
    expect(second.replayed).toBe(true);
    expect(second.eventRecordId).toBe(first.eventRecordId);

    // Exactly one row in canonical_provider_events
    const {rows: eventCount} = await fixture.owner.query(
      'SELECT count(*)::int AS count FROM canonical_provider_events WHERE provider_event_id=$1',
      [eventId]
    );
    expect(eventCount[0].count).toBe(1);
  });

  // TEST 2: Same provider event ID with different payload/evidence → conflict/quarantine
  it('2. same provider event ID with mutated payload conflicts and quarantines', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'NONE',
    });

    const eventId = 'evt_mutate_' + randomUUID();
    const payloadA = {payment_id: 'pay_a', amount: ctx.roomSubtotalPaise, note: 'original'};
    const payloadB = {payment_id: 'pay_b', amount: ctx.roomSubtotalPaise, note: 'mutated'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: payloadA,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    // Mutated payload arrives for the same event ID
    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: payloadB,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');
    expect(second.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(second.reconciliationReason).toBe('EVENT_CONFLICT_QUARANTINED');

    // Quarantined event recorded in dedicated table
    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1',
      [eventId]
    );
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('MUTATED_PAYLOAD_FOR_EXISTING_EVENT_ID');

    // Reconciliation record created
    const reconciliations = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    expect(reconciliations.some(r => r.reason === 'EVENT_CONFLICT_QUARANTINED')).toBe(true);
  });

  // TEST 3: CAPTURED followed by older AUTHORIZED/PENDING → no state regression
  it('3. CAPTURED followed by older AUTHORIZED does not regress state', async () => {
    const ctx = await createHeldContext();
    // Use synthetic test authority to establish initial captured state
    const syntheticAmount = ctx.roomSubtotalPaise; // TEST VECTOR ONLY
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'SYNTHETIC_TEST',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'SYNTHETIC_INTERNAL_TEST',
      expectedAmountPaise: syntheticAmount,
      expectedCurrency: 'INR',
      expectedAuthorityHash: 'a'.repeat(64),
    });

    // Ingest CAPTURED first
    const captureRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'SYNTHETIC_TEST',
      providerEventId: 'evt_cap_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: syntheticAmount,
      reportedCurrency: 'INR',
      evidencePayload: {event: 'captured', amount: syntheticAmount},
    });
    expect(captureRes.paymentState).toBe('MATCHED_CAPTURE');

    // Older out-of-order AUTHORIZED event arrives later
    const authRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'SYNTHETIC_TEST',
      providerEventId: 'evt_auth_delayed_' + randomUUID(),
      normalizedEventType: 'PAYMENT_AUTHORIZED',
      reportedAmountPaise: syntheticAmount,
      reportedCurrency: 'INR',
      evidencePayload: {event: 'authorized', amount: syntheticAmount},
    });
    // State MUST NOT regress to AUTHORIZED
    expect(authRes.paymentState).toBe('MATCHED_CAPTURE');

    const fresh = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(fresh!.paymentState).toBe('MATCHED_CAPTURE');
  });

  // TEST 4: Missing expected payable authority → no matched capture / no reservation
  it('4. missing expected payable authority records evidence into RECONCILIATION_REQUIRED and creates zero reservations', async () => {
    const ctx = await createHeldContext();
    // Quote has total_paise IS NULL (enforced by DB constraint)
    const quoteRow = (await fixture.owner.query('SELECT total_paise FROM stays_quotes WHERE id=$1', [ctx.quoteId])).rows[0];
    expect(quoteRow.total_paise).toBeNull();

    // Payment attempt without approved payable total authority
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'NONE',
    });

    // Provider capture arrives
    const captureRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_noauth_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: {status: 'captured', amount: ctx.roomSubtotalPaise},
    });

    expect(captureRes.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(captureRes.reconciliationReason).toBe('PAYABLE_AUTHORITY_MISSING');
    expect(captureRes.paymentState).not.toBe('MATCHED_CAPTURE');

    // Crucial: Zero canonical reservations created
    const {rows: resCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM canonical_reservations');
    expect(resCount[0].count).toBe(0);

    // Inventory units remain held, not booked
    const {rows: inventory} = await fixture.owner.query(
      `SELECT coalesce(sum(booked_units),0)::int AS booked FROM inventory_days
       WHERE room_type_id=101 AND calendar_date>=$1::date AND calendar_date<$2::date`,
      [ctx.checkIn, ctx.checkOut]
    );
    expect(inventory[0].booked).toBe(0);
  });

  // TEST 5: Expected amount differs from provider-reported capture → reconciliation required
  it('5. expected amount mismatch flags RECONCILIATION_REQUIRED with both amounts preserved', async () => {
    const ctx = await createHeldContext();
    const syntheticExpected = 1650000; // TEST VECTOR ONLY
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'SYNTHETIC_TEST',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'SYNTHETIC_INTERNAL_TEST',
      expectedAmountPaise: syntheticExpected,
      expectedCurrency: 'INR',
      expectedAuthorityHash: 'b'.repeat(64),
    });

    const reportedMismatched = 1500000; // Mismatched reported amount
    const captureRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'SYNTHETIC_TEST',
      providerEventId: 'evt_mismatch_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: reportedMismatched,
      reportedCurrency: 'INR',
      evidencePayload: {amount: reportedMismatched},
    });

    expect(captureRes.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(captureRes.reconciliationReason).toBe('AMOUNT_MISMATCH');

    const recs = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    const mismatchRec = recs.find(r => r.reason === 'AMOUNT_MISMATCH');
    expect(mismatchRec).toBeDefined();
    expect(mismatchRec!.details).toMatchObject({
      expected_amount_paise: syntheticExpected,
      reported_amount_paise: reportedMismatched,
    });
  });

  // TEST 6: Matching amount with synthetic INTERNAL TEST authority → matched capture, NO reservation finalization in Task 2
  it('6. matching synthetic test authority normalizes to MATCHED_CAPTURE with zero reservation finalization', async () => {
    const ctx = await createHeldContext();
    const syntheticMatching = 1650000; // TEST VECTOR ONLY - clearly labeled synthetic test vector
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'SYNTHETIC_TEST',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'SYNTHETIC_INTERNAL_TEST',
      expectedAmountPaise: syntheticMatching,
      expectedCurrency: 'INR',
      expectedAuthorityHash: 'c'.repeat(64),
    });

    const captureRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'SYNTHETIC_TEST',
      providerEventId: 'evt_synthetic_matched_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: syntheticMatching,
      reportedCurrency: 'INR',
      evidencePayload: {amount: syntheticMatching},
    });

    expect(captureRes.paymentState).toBe('MATCHED_CAPTURE');
    expect(captureRes.reconciliationReason).toBeNull();

    // Verify Task 2 invariant: NO reservation finalizer is invoked, NO reservation is created
    const {rows: resCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM canonical_reservations');
    expect(resCount[0].count).toBe(0);

    const holdRow = (await fixture.owner.query('SELECT status FROM booking_holds WHERE id=$1', [ctx.holdId])).rows[0];
    expect(holdRow.status).toBe('ACTIVE'); // Hold is NOT consumed in Task 2
  });

  // TEST 7: Unknown outcome → durable recoverable UNKNOWN/reconciliation state
  it('7. unknown outcome persists durable recoverable UNKNOWN state distinct from failure', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'NONE',
    });

    const unknownRes = await recordPaymentUnknown(paymentWorker, {
      attemptId: attempt.attemptId,
      reasonDetails: {providerTimeoutMs: 10000, context: 'gateway_no_response'},
    });

    expect(unknownRes.paymentState).toBe('UNKNOWN');
    expect(unknownRes.reconciliationReason).toBe('UNKNOWN_OUTCOME');

    const fresh = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(fresh!.paymentState).toBe('UNKNOWN');
    expect(fresh!.paymentState).not.toBe('FAILED');

    const recs = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    expect(recs.some(r => r.reason === 'UNKNOWN_OUTCOME')).toBe(true);
  });

  // TEST 8: Capture evidence after hold expiry → recorded but no hold resurrection and no reservation
  it('8. capture after hold expiry records HOLD_EXPIRED without resurrecting hold or creating reservation', async () => {
    const ctx = await createHeldContext();
    const syntheticAmount = 1650000; // TEST VECTOR ONLY

    // Manually expire the hold in PostgreSQL
    await fixture.owner.query(
      "UPDATE booking_holds SET status='EXPIRED', expires_at=clock_timestamp() - interval '5 seconds' WHERE id=$1",
      [ctx.holdId]
    );

    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'SYNTHETIC_TEST',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      expectedAuthorityKind: 'SYNTHETIC_INTERNAL_TEST',
      expectedAmountPaise: syntheticAmount,
      expectedCurrency: 'INR',
      expectedAuthorityHash: 'd'.repeat(64),
    });

    // Capture arrives after hold expired
    const captureRes = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'SYNTHETIC_TEST',
      providerEventId: 'evt_late_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: syntheticAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: syntheticAmount},
    });

    expect(captureRes.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(captureRes.reconciliationReason).toBe('HOLD_EXPIRED');

    // Hold status remains EXPIRED (NOT resurrected, NOT extended)
    const holdRow = (await fixture.owner.query('SELECT status FROM booking_holds WHERE id=$1', [ctx.holdId])).rows[0];
    expect(holdRow.status).toBe('EXPIRED');

    // Zero reservations created
    const {rows: resCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM canonical_reservations');
    expect(resCount[0].count).toBe(0);
  });

  // TEST 9: Foreign/unauthorized runtime → cannot write canonical payment authority
  it('9. foreign runtime role cannot call payment procedures without restricted worker privileges', async () => {
    // encho_stays_web does not have execute privileges on canonical payment procedures
    await expect(
      createPaymentAttempt(stays, {
        commandId: randomUUID(),
        holderPrincipal: 'user:10',
        originKind: 'RAZORPAY',
        expectedAuthorityKind: 'NONE',
      })
    ).rejects.toThrow();

    await expect(
      assertPaymentWorkerRole(stays)
    ).rejects.toThrow(/PAYMENT_ROLE_NOT_RESTRICTED/);
  });

  // TEST 10: Raw Guest/browser role → cannot manufacture payment state
  it('10. raw Guest role (encho_stays_web) cannot execute direct DML on canonical payment tables', async () => {
    await expect(
      stays.query(
        `INSERT INTO canonical_payment_attempts(command_id, holder_principal, origin_kind, expected_authority_kind, payment_state)
         VALUES($1, 'user:10', 'RAZORPAY', 'NONE', 'MATCHED_CAPTURE')`,
        [randomUUID()]
      )
    ).rejects.toThrow(/permission denied/);

    await expect(
      stays.query(
        `INSERT INTO canonical_provider_events(origin_kind, provider_event_id, normalized_event_type, reported_amount_paise, reported_currency, evidence_hash, evidence_payload, status)
         VALUES('RAZORPAY', 'evt_hacked', 'PAYMENT_CAPTURED', 100, 'INR', $1, '{}'::jsonb, 'PROCESSED')`,
        ['e'.repeat(64)]
      )
    ).rejects.toThrow(/permission denied/);

    await expect(
      stays.query('UPDATE canonical_payment_attempts SET payment_state=\'MATCHED_CAPTURE\'')
    ).rejects.toThrow(/permission denied/);
  });
});
