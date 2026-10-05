/**
 * ENCHO W3-B Task 3 Diagnostic: Unchanged W2 Quote Conflict Reproduction (RED).
 *
 * Proves that under the previous design, an unchanged W2 accepted-offer quote
 * (where tax_paise IS NULL and total_paise IS NULL by W3-A invariants):
 * 1. Cannot establish trusted MATCHED_CAPTURE because payment attempt expects total_paise;
 * 2. If total_paise were altered, W3-A canonical_finalize_direct_hold rejects with RESERVATION_AUTHORITY_MISMATCH;
 * 3. Therefore, without a separate immutable payable authority, payment capture and W3-A reservation
 *    cannot both succeed on the same immutable quote.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {test} from 'node:test';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../src/services/itineraryQuoteService.js';
import {acquireHold} from '../../src/services/inventoryHoldService.js';
import {createPaymentAttempt, ingestProviderEvent, getPaymentAttempt} from '../../src/services/canonicalPaymentService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.ts';

test('reproduce unchanged-quote conflict between MATCHED_CAPTURE and W3-A finalization', async () => {
  const fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
  try {
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner, '041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');
    await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');

    const stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    const paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker', max: 4});

    try {
      // 1. Establish valid accepted offer
      const offerService = new AcceptedOfferService(fixture.hostPool,
        new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'), 'LOCAL');
      const draft = await offerService.createDraft(fixture.principal(10), {
        commandId: randomUUID(), listingId: 1, roomTypeId: 101, amountMinor: '550000',
        stayStart: fixture.today, stayEnd: addDays(fixture.today, 60),
        effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
        effectiveUntil: new Date(Date.now() + 60 * 86400000).toISOString(), maxGuests: 2, minNights: 1,
      });
      const submitted = await offerService.submit(fixture.principal(10), {
        offerId: draft.offerId, revision: 1, expectedVersion: draft.version,
      });
      await fixture.grantOffer(draft.offerId);
      await offerService.accept(fixture.principal(90, 'STAFF'), {
        offerId: draft.offerId, revision: 1, expectedVersion: submitted.version,
      });

      // 2. Create quote and hold without modifying stays_quotes (tax_paise IS NULL, total_paise IS NULL)
      const checkIn = addDays(fixture.today, 5);
      const checkOut = addDays(fixture.today, 6);
      const quote = await createItineraryQuote(stays, {
        offerId: draft.offerId, revision: 1, checkIn, checkOut, guestCount: 2, requestId: randomUUID(),
      }, 'user:10');

      const holdRes = await acquireHold(stays, {
        roomTypeId: 101, checkIn, checkOut, quantity: 1,
        idempotencyKey: randomUUID(), quoteId: quote.id, holderPrincipal: 'user:10', userId: 10,
      });
      assert.ok(holdRes.success);

      // Verify immutable quote shape
      const {rows: quoteRows} = await fixture.owner.query('SELECT total_paise, tax_paise FROM stays_quotes WHERE id = $1', [quote.id]);
      assert.strictEqual(quoteRows[0].total_paise, null, 'stays_quotes.total_paise must be null on accepted offer');
      assert.strictEqual(quoteRows[0].tax_paise, null, 'stays_quotes.tax_paise must be null on accepted offer');

      // 3. Under 053 design, creating payment attempt derives expected amount from stays_quotes.total_paise
      const orderRef = 'order_test_' + randomUUID();
      const attempt = await createPaymentAttempt(paymentWorker, {
        commandId: randomUUID(),
        holderPrincipal: 'user:10',
        originKind: 'RAZORPAY',
        quoteId: quote.id,
        holdId: holdRes.hold.id,
        providerOrderRef: orderRef,
      });

      const attemptBefore = await getPaymentAttempt(paymentWorker, attempt.attemptId);
      assert.strictEqual(attemptBefore.expectedAmountPaise, null, 'expectedAmountPaise is NULL because total_paise is NULL');

      // 4. Ingesting capture event cannot achieve MATCHED_CAPTURE without payable authority
      const ingestRes = await ingestProviderEvent(paymentWorker, {
        attemptId: attempt.attemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: 550000,
        reportedCurrency: 'INR',
        providerPaymentRef: 'pay_' + randomUUID(),
        providerOrderRef: orderRef,
        evidencePayload: {amount: 550000},
      });

      // It strictly enters RECONCILIATION_REQUIRED / PAYABLE_AUTHORITY_MISSING!
      assert.strictEqual(ingestRes.paymentState, 'RECONCILIATION_REQUIRED');
      assert.strictEqual(ingestRes.reconciliationReason, 'PAYABLE_AUTHORITY_MISSING');

      // 5. If someone tries to alter stays_quotes, the immutability trigger rejects it
      await assert.rejects(
        fixture.owner.query('UPDATE stays_quotes SET total_paise = 550000 WHERE id = $1', [quote.id]),
        /ACCEPTED_OFFER_QUOTE_IMMUTABLE/
      );

      console.log('REPRODUCED_UNCHANGED_QUOTE_CONFLICT', {
        quoteId: quote.id,
        quoteTotalPaise: quoteRows[0].total_paise,
        paymentState: ingestRes.paymentState,
        reconciliationReason: ingestRes.reconciliationReason,
        conclusion: 'Without a separate immutable payable authority, an unchanged W2 accepted-offer quote cannot reach MATCHED_CAPTURE, and mutating stays_quotes is forbidden by immutability trigger',
      });
    } finally {
      await stays.end();
      await paymentWorker.end();
    }
  } finally {
    await fixture.close();
  }
});
