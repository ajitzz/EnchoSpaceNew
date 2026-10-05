/**
 * ENCHO W3-B Task 2 diagnostic: Provider-Independent Payment Evidence and Reconciliation Authority
 * FAILING-BEFORE boundary reproduction.
 *
 * Demonstrates:
 * 1. Missing payment evidence authority (RED):
 *    - Given an active W2 hold and quote (where total_paise IS NULL / legally gated),
 *      provider capture evidence arrives (e.g. from Razorpay or Stripe).
 *    - Canonical payment evidence authority (canonical_payment_attempts, canonical_provider_events,
 *      canonical_payment_reconciliations) does not exist in the database (to_regclass returns NULL).
 *    - The legacy stays_orders table cannot record this evidence safely:
 *      - Its column total_paise is NOT NULL (rejects NULL).
 *      - Its status check constraint only permits ('PAYMENT_PENDING', 'AUTHORIZED', 'CONFIRMED', 'CANCELLED', 'FAILED').
 *      - It cannot represent RECONCILIATION_REQUIRED or PAYABLE_AUTHORITY_MISSING.
 *      - Setting CONFIRMED without approved payable total would falsely claim booking success.
 *    - Therefore, without Task 2 canonical payment authority, provider capture evidence either
 *      drops on the floor or pretends success without an approved payable total.
 */
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {test} from 'node:test';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../src/services/itineraryQuoteService.js';
import {acquireHold} from '../../src/services/inventoryHoldService.js';
import {addDays,createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.ts';

test('provider capture evidence cannot be safely recorded or reconciled without canonical payment authority', async()=>{
  const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
  try {
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner,'041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'052_canonical_reservation_hold_finalization.sql');

    const stays=new (await import('pg')).default.Pool({...fixture.owner.options,user:'encho_stays_web'});
    let quoteId,holdId,checkIn,checkOut;
    try {
      // 1. Establish valid accepted commercial offer
      const offerService=new AcceptedOfferService(fixture.hostPool,
        new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
      const draft=await offerService.createDraft(fixture.principal(10),{
        commandId:randomUUID(),listingId:1,roomTypeId:101,amountMinor:'550000',
        stayStart:fixture.today,stayEnd:addDays(fixture.today,70),
        effectiveFrom:new Date(Date.now()-3600000).toISOString(),
        effectiveUntil:new Date(Date.now()+70*86400000).toISOString(),maxGuests:2,minNights:1,
      });
      const submitted=await offerService.submit(fixture.principal(10),{
        offerId:draft.offerId,revision:1,expectedVersion:draft.version});
      await fixture.grantOffer(draft.offerId);
      await offerService.accept(fixture.principal(90,'STAFF'),{
        offerId:draft.offerId,revision:1,expectedVersion:submitted.version});

      // 2. Establish valid W2 itinerary quote (total_paise is NULL)
      checkIn=addDays(fixture.today,5);
      checkOut=addDays(fixture.today,8);
      const quote=await createItineraryQuote(stays,{
        offerId:draft.offerId,revision:1,checkIn,checkOut,
        guestCount:2,requestId:randomUUID()
      },'user:10');
      quoteId=quote.id;

      // 3. Establish active physical hold
      const holdRes=await acquireHold(stays,{
        roomTypeId:101,checkIn,checkOut,quantity:1,
        idempotencyKey:randomUUID(),quoteId:quote.id,
        holderPrincipal:'user:10',userId:10
      });
      assert.equal(holdRes.success,true,'W2 hold acquisition must succeed');
      holdId=holdRes.hold.id;
    } finally {
      await stays.end();
    }

    // Inspect database truth for quote and hold
    const quoteRow=(await fixture.owner.query(
      'SELECT id,base_price_paise,tax_paise,total_paise,currency FROM stays_quotes WHERE id=$1',
      [quoteId]
    )).rows[0];
    assert.equal(quoteRow.total_paise, null, 'stays_quotes.total_paise must be NULL');

    // Synthetic provider event arrives (e.g. webhook payload)
    const providerEvent = {
      eventId: 'evt_test_capture_' + randomUUID(),
      providerPaymentId: 'pay_test_' + randomUUID(),
      providerOrderId: 'order_test_' + randomUUID(),
      amountPaise: 1650000,
      currency: 'INR',
      eventType: 'payment.captured'
    };

    // Prove legacy stays_orders cannot represent RECONCILIATION_REQUIRED
    let legacyStatusCheckFailed = false;
    try {
      await fixture.owner.query(
        `INSERT INTO stays_orders(id, hold_id, quote_id, user_id, total_paise, currency, status, idempotency_key)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), holdId, quoteId, 10, quoteRow.base_price_paise, 'INR', 'RECONCILIATION_REQUIRED', randomUUID()]
      );
    } catch (e) {
      legacyStatusCheckFailed = e.message.includes('chk_stays_orders_status');
    }
    assert.equal(legacyStatusCheckFailed, true, 'Legacy stays_orders rejects RECONCILIATION_REQUIRED status');

    // Prove canonical payment authority table is missing
    const tableCheck = (await fixture.owner.query(
      "SELECT to_regclass('public.canonical_payment_attempts') AS payment_table"
    )).rows[0];

    console.log('W3_B_TASK_2_FAILING_BEFORE_OBSERVATION', JSON.stringify({
      quoteId: quoteRow.id,
      roomSubtotalPaise: quoteRow.base_price_paise,
      quoteTotalPaise: quoteRow.total_paise,
      holdId,
      providerEventId: providerEvent.eventId,
      legacyStatusCheckFailed,
      canonicalPaymentAttemptsTable: tableCheck.payment_table
    }));

    // FAILING ASSERTION:
    // Canonical payment authority table must exist to safely record provider evidence and reconciliation
    assert.notEqual(
      tableCheck.payment_table,
      null,
      'Canonical payment authority (canonical_payment_attempts) is missing in predecessor schema'
    );
  } finally {
    await fixture.close();
  }
});
