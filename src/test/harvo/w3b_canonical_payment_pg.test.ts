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
    await Promise.all([stays?.end(), paymentWorker?.end()]);
    await fixture?.close();
  });

  const createHeldContext = async (principal = 'user:10') => {
    const start = nextOffset; nextOffset += 2;
    const checkIn = addDays(fixture.today, start);
    const checkOut = addDays(fixture.today, start + 1);
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
      holderPrincipal: principal,
    };
  };

  /**
   * DISPOSABLE TEST FIXTURE ONLY:
   * Test-only immutable payable-authority fixture using owner/test setup outside
   * migration 053 and outside encho_payment_worker privileges.
   * This proves:
   *   trusted TEST FIXTURE authority amount Y + provider evidence Y -> MATCHED_CAPTURE
   * The deployable application/service/payment-worker cannot create or manipulate this authority.
   */
  const createTestOnlyPayableQuoteFixture = async (amountPaise: number) => {
    const ctx = await createHeldContext();
    // Test owner drops the production CHECK constraint and disables immutability trigger
    // temporarily in disposable PostgreSQL to populate total_paise on an accepted-offer quote.
    // Payment-worker has no privileges to do this.
    await fixture.owner.query('ALTER TABLE stays_quotes DISABLE TRIGGER stays_quote_accepted_immutable');
    await fixture.owner.query('ALTER TABLE stays_quotes DROP CONSTRAINT IF EXISTS stays_quotes_authority_shape');
    await fixture.owner.query('UPDATE stays_quotes SET total_paise = $1 WHERE id = $2', [amountPaise, ctx.quoteId]);
    await fixture.owner.query('ALTER TABLE stays_quotes ENABLE TRIGGER stays_quote_accepted_immutable');
    return ctx;
  };

  // 1. payment worker cannot select synthetic monetary authority
  it('1. payment worker cannot select synthetic monetary authority', async () => {
    const ctx = await createHeldContext();
    const commandId = randomUUID();

    // TypeScript/Zod schema rejects SYNTHETIC_TEST
    await expect(createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'SYNTHETIC_TEST' as any,
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_test_syn',
    })).rejects.toThrow(PaymentAuthorityError);

    // Direct PostgreSQL call with SYNTHETIC_TEST origin kind rejects
    await expect(paymentWorker.query(
      `SELECT * FROM canonical_create_payment_attempt($1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::text)`,
      [commandId, 'user:10', 'SYNTHETIC_TEST', ctx.quoteId, ctx.holdId, 'order_syn']
    )).rejects.toThrow(/PAYMENT_INPUT_INVALID/);
  });

  // 2. payment worker cannot choose arbitrary expected amount
  it('2. payment worker cannot choose arbitrary expected amount', async () => {
    const ctx = await createHeldContext();

    // The payment worker cannot update stays_quotes to inject monetary authority
    await expect(paymentWorker.query(
      'UPDATE stays_quotes SET total_paise = 999999 WHERE id = $1',
      [ctx.quoteId]
    )).rejects.toThrow(/permission denied/);

    // The procedure canonical_create_payment_attempt has NO parameter for caller-supplied amount
    await expect(paymentWorker.query(
      `SELECT * FROM canonical_create_payment_attempt($1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::text, $7::bigint)`,
      [randomUUID(), 'user:10', 'RAZORPAY', ctx.quoteId, ctx.holdId, 'order_arb', 999999]
    )).rejects.toThrow(/function canonical_create_payment_attempt.*does not exist/);

    // Creating an attempt for a canonical accepted-offer quote strictly derives expected_amount_paise = NULL
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_arb_ref',
    });
    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBeNull();
  });

  // 3. RAZORPAY attempt without exact quote+hold fails
  it('3. RAZORPAY attempt without exact quote+hold fails', async () => {
    const ctx = await createHeldContext();

    // Non-existent quote
    await expect(createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: randomUUID(),
      holdId: ctx.holdId,
      providerOrderRef: 'order_missing_quote',
    })).rejects.toThrow(/PAYMENT_QUOTE_NOT_FOUND/);

    // Non-existent hold
    await expect(createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: randomUUID(),
      providerOrderRef: 'order_missing_hold',
    })).rejects.toThrow(/PAYMENT_HOLD_NOT_FOUND/);
  });

  // 4. quote A + hold B fails
  it('4. quote A + hold B fails', async () => {
    const ctxA = await createHeldContext();
    const ctxB = await createHeldContext();

    await expect(createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctxA.quoteId,
      holdId: ctxB.holdId, // Mismatched hold!
      providerOrderRef: 'order_mismatch',
    })).rejects.toThrow(/PAYMENT_QUOTE_HOLD_MISMATCH/);
  });

  // 5. foreign principal fails
  it('5. foreign principal fails', async () => {
    const ctx = await createHeldContext('user:10');

    // Caller declares principal user:20 for a hold and quote belonging to user:10
    await expect(createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:20',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_foreign',
    })).rejects.toThrow(/PAYMENT_PRINCIPAL_MISMATCH/);
  });

  // 6. replay same command with changed provider reference conflicts
  it('6. replay same command with changed provider reference conflicts', async () => {
    const ctx = await createHeldContext();
    const commandId = randomUUID();

    const first = await createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_ref_initial',
    });
    expect(first.replayed).toBe(false);

    // Exact replay with same parameters succeeds idempotently
    const replay = await createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_ref_initial',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.attemptId).toBe(first.attemptId);

    // Replay with mutated providerOrderRef conflicts
    await expect(createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_ref_mutated',
    })).rejects.toThrow(/PAYMENT_COMMAND_CONFLICT/);

    // Replay with mutated quoteId conflicts
    const ctx2 = await createHeldContext();
    await expect(createPaymentAttempt(paymentWorker, {
      commandId,
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx2.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_ref_initial',
    })).rejects.toThrow();
  });

  // 7. same event ID + same payload + changed event type quarantines
  it('7. same event ID + same payload + changed event type quarantines', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_evt_type',
    });

    const eventId = 'evt_type_' + randomUUID();
    const payload = {pay_id: 'pay_7', note: 'same_payload'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_AUTHORIZED', // Mutated event type!
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');
    expect(second.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(second.reconciliationReason).toBe('EVENT_CONFLICT_QUARANTINED');

    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1', [eventId]);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('MUTATED_EVENT_TYPE');
  });

  // 8. same event ID + changed amount quarantines
  it('8. same event ID + changed amount quarantines', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_evt_amt',
    });

    const eventId = 'evt_amt_' + randomUUID();
    const payload = {pay_id: 'pay_8'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 200000, // Mutated amount!
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');
    expect(second.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(second.reconciliationReason).toBe('EVENT_CONFLICT_QUARANTINED');

    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1', [eventId]);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('MUTATED_EVENT_AMOUNT');
  });

  // 9. same event ID + changed currency quarantines
  it('9. same event ID + changed currency quarantines', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_evt_curr',
    });

    const eventId = 'evt_curr_' + randomUUID();
    const payload = {pay_id: 'pay_9'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'USD', // Mutated currency!
      evidencePayload: payload,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');

    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1', [eventId]);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('MUTATED_EVENT_CURRENCY');
  });

  // 10. same event ID + changed provider refs quarantines
  it('10. same event ID + changed provider refs quarantines', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_evt_ref',
    });

    const eventId = 'evt_ref_' + randomUUID();
    const payload = {pay_id: 'pay_10'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      providerPaymentRef: 'pay_ref_original',
      evidencePayload: payload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      providerPaymentRef: 'pay_ref_mutated', // Mutated payment ref!
      evidencePayload: payload,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');

    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1', [eventId]);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('MUTATED_PAYMENT_REF');
  });

  // 11. same event ID replayed against another attempt conflicts/quarantines
  it('11. same event ID replayed against another attempt conflicts/quarantines', async () => {
    const ctx1 = await createHeldContext();
    const ctx2 = await createHeldContext();

    const attempt1 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx1.quoteId,
      holdId: ctx1.holdId,
      providerOrderRef: 'order_att_1',
    });
    const attempt2 = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx2.quoteId,
      holdId: ctx2.holdId,
      providerOrderRef: 'order_att_2',
    });

    const eventId = 'evt_cross_' + randomUUID();
    const payload = {pay_id: 'pay_cross'};

    const first = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt1.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(first.ingestStatus).toBe('PROCESSED');

    // Attempting to replay eventId against attempt2
    const second = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt2.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: 100000,
      reportedCurrency: 'INR',
      evidencePayload: payload,
    });
    expect(second.ingestStatus).toBe('QUARANTINED');
    expect(second.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(second.reconciliationReason).toBe('EVENT_CONFLICT_QUARANTINED');

    const {rows: quarantined} = await fixture.owner.query(
      'SELECT * FROM canonical_quarantined_events WHERE provider_event_id=$1', [eventId]);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].quarantine_reason).toBe('EVENT_REPLAYED_AGAINST_DIFFERENT_ATTEMPT');
  });

  // POSITIVE TEST-ONLY MATCHED_CAPTURE VECTOR (DISPOSABLE TEST FIXTURE ONLY)
  it('DISPOSABLE TEST FIXTURE ONLY: trusted test fixture authority amount Y + provider evidence Y -> MATCHED_CAPTURE', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);

    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_match_test',
    });
    expect(attempt.paymentState).toBe('INITIATED');

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBe(String(expectedAmount));

    const eventId = 'evt_matched_' + randomUUID();
    const result = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: eventId,
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {razorpay_payment_id: 'pay_matched', amount: expectedAmount},
    });

    expect(result.ingestStatus).toBe('PROCESSED');
    expect(result.paymentState).toBe('MATCHED_CAPTURE');
    expect(result.reconciliationReason).toBeNull();

    const verified = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(verified?.paymentState).toBe('MATCHED_CAPTURE');
    expect(verified?.matchedAt).not.toBeNull();
    expect(verified?.reconciliationReason).toBeNull();
  });

  // 12. MATCHED_CAPTURE + recordPaymentUnknown does not regress
  it('12. MATCHED_CAPTURE + recordPaymentUnknown does not regress', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_unknown_guard',
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_guard_12_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: expectedAmount},
    });

    // Invoke recordPaymentUnknown on an attempt that is MATCHED_CAPTURE
    const res = await recordPaymentUnknown(paymentWorker, {
      attemptId: attempt.attemptId,
      reasonDetails: {note: 'webhook connection timed out'},
    });
    expect(res.paymentState).toBe('MATCHED_CAPTURE');
    expect(res.reconciliationReason).toBeNull();

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
  });

  // 13. MATCHED_CAPTURE + PAYMENT_UNKNOWN event does not regress
  it('13. MATCHED_CAPTURE + PAYMENT_UNKNOWN event does not regress', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_unknown_evt',
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_guard_13a_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: expectedAmount},
    });

    // Ingest a PAYMENT_UNKNOWN provider event
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_guard_13b_' + randomUUID(),
      normalizedEventType: 'PAYMENT_UNKNOWN',
      reportedAmountPaise: 0,
      reportedCurrency: 'INR',
      evidencePayload: {status: 'uncertain'},
    });
    expect(res.paymentState).toBe('MATCHED_CAPTURE');
    expect(res.reconciliationReason).toBeNull();

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
  });

  // 14. captured + stale AUTHORIZED does not regress
  it('14. captured + stale AUTHORIZED does not regress', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_stale_auth',
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_14_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: expectedAmount},
    });

    // Delayed/stale AUTHORIZED event arrives
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_stale_auth_14_' + randomUUID(),
      normalizedEventType: 'PAYMENT_AUTHORIZED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {status: 'authorized'},
    });
    expect(res.paymentState).toBe('MATCHED_CAPTURE');
    expect(res.reconciliationReason).toBeNull();

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('MATCHED_CAPTURE');
  });

  // 15. captured + FAILED preserves capture truth and enters reconciliation
  it('15. captured + FAILED preserves capture truth and enters reconciliation', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_capture_then_fail',
    });
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_15_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: expectedAmount},
    });

    const beforeAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    const originalMatchedAt = beforeAttempt?.matchedAt;
    expect(originalMatchedAt).not.toBeNull();

    // Out-of-order FAILED event arrives after capture
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_fail_15_' + randomUUID(),
      normalizedEventType: 'PAYMENT_FAILED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {error: 'late webhook'},
    });
    expect(res.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('OUT_OF_ORDER_EVENT');

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(dbAttempt?.reconciliationReason).toBe('OUT_OF_ORDER_EVENT');
    // Capture truth preserved!
    expect(new Date(dbAttempt!.matchedAt!).getTime()).toBe(new Date(originalMatchedAt!).getTime());

    const recs = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    expect(recs.some(r => r.reason === 'OUT_OF_ORDER_EVENT')).toBe(true);
  });

  // 16. missing payable authority still cannot become MATCHED_CAPTURE
  it('16. missing payable authority still cannot become MATCHED_CAPTURE', async () => {
    // Standard canonical accepted-offer quote has tax_paise = NULL and total_paise = NULL
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_no_auth',
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    expect(dbAttempt?.expectedAmountPaise).toBeNull();

    // Provider reports capture
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_no_auth_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: ctx.roomSubtotalPaise,
      reportedCurrency: 'INR',
      evidencePayload: {amount: ctx.roomSubtotalPaise},
    });

    expect(res.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('PAYABLE_AUTHORITY_MISSING');

    const recs = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    expect(recs.some(r => r.reason === 'PAYABLE_AUTHORITY_MISSING')).toBe(true);
  });

  // 17. amount mismatch still reconciles
  it('17. amount mismatch still reconciles', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_mismatch_amt',
    });

    // Provider reports different amount
    const reportedAmount = 1500000;
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_mismatch_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: reportedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: reportedAmount},
    });

    expect(res.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('AMOUNT_MISMATCH');

    const recs = await getPaymentReconciliations(paymentWorker, attempt.attemptId);
    const rec = recs.find(r => r.reason === 'AMOUNT_MISMATCH');
    expect(rec).toBeDefined();
    expect(rec?.details).toMatchObject({
      expected_amount_paise: expectedAmount,
      reported_amount_paise: reportedAmount,
    });
  });

  // 18. capture after hold expiry records HOLD_EXPIRED without resurrecting hold or creating reservation
  it('18. capture after hold expiry records HOLD_EXPIRED without resurrecting hold or creating reservation', async () => {
    const expectedAmount = 1650000;
    const ctx = await createTestOnlyPayableQuoteFixture(expectedAmount);
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_expire_hold',
    });

    // Expire the hold in the database
    await fixture.owner.query(
      `UPDATE booking_holds SET expires_at = clock_timestamp() - interval '10 seconds', status = 'EXPIRED' WHERE id = $1`,
      [ctx.holdId]
    );

    // Capture arrives after hold expiry
    const res = await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_expired_hold_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: expectedAmount,
      reportedCurrency: 'INR',
      evidencePayload: {amount: expectedAmount},
    });

    expect(res.ingestStatus).toBe('PROCESSED');
    expect(res.paymentState).toBe('RECONCILIATION_REQUIRED');
    expect(res.reconciliationReason).toBe('HOLD_EXPIRED');

    // Hold was NOT resurrected
    const {rows: holdRows} = await fixture.owner.query('SELECT status FROM booking_holds WHERE id = $1', [ctx.holdId]);
    expect(holdRows[0].status).toBe('EXPIRED');
  });

  // 19. zero canonical reservations remain after all Task-2 paths
  it('19. zero canonical reservations remain after all Task-2 paths', async () => {
    const {rows: resCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM canonical_reservations');
    expect(resCount[0].count).toBe(0);

    const {rows: cmdCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM canonical_reservation_commands');
    expect(cmdCount[0].count).toBe(0);

    const {rows: bookingCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM bookings');
    expect(bookingCount[0].count).toBe(0);

    const {rows: orderCount} = await fixture.owner.query('SELECT count(*)::int AS count FROM stays_orders');
    expect(orderCount[0].count).toBe(0);
  });

  // Additional security checks
  it('20. foreign runtime role cannot call payment procedures without restricted worker privileges', async () => {
    await expect(assertPaymentWorkerRole(stays)).rejects.toThrow(PaymentAuthorityError);
  });

  it('21. raw Guest role (encho_stays_web) cannot execute direct DML on canonical payment tables', async () => {
    await expect(stays.query('SELECT * FROM canonical_payment_attempts')).rejects.toThrow(/permission denied/);
    await expect(stays.query('SELECT * FROM canonical_provider_events')).rejects.toThrow(/permission denied/);
    await expect(stays.query('SELECT * FROM canonical_quarantined_events')).rejects.toThrow(/permission denied/);
    await expect(stays.query('SELECT * FROM canonical_payment_reconciliations')).rejects.toThrow(/permission denied/);
  });

  it('22. duplicate identical provider event produces one logical evidence effect', async () => {
    const ctx = await createHeldContext();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: ctx.quoteId,
      holdId: ctx.holdId,
      providerOrderRef: 'order_dup_ref',
    });

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
});
