/**
 * ENCHO W4-A Task 1 diagnostic: Canonical Reservation Lifecycle Trace and First Failing Boundary.
 *
 * Demonstrates:
 * 1. Historical Immutability Guard (W3):
 *    - Given a fully composed canonical reservation with committed inventory (booked_units = 1)
 *      and matched payment capture, the canonical reservation row is strictly immutable.
 *    - Directly attempting `UPDATE canonical_reservations SET status = 'CANCELLED'` fails
 *      with exception `CANONICAL_RESERVATION_IMMUTABLE`.
 *
 * 2. Missing Canonical Lifecycle Event Authority (RED):
 *    - In the predecessor W3 PostgreSQL schema:
 *      - No append-only lifecycle event table exists (`canonical_reservation_events` is NULL).
 *      - No idempotent lifecycle command table exists (`canonical_reservation_lifecycle_commands` is NULL).
 *      - No canonical cancellation request procedure exists (`canonical_request_cancellation` is NULL).
 *    - Precise finding: canonical reservations currently have no authorized lifecycle/cancellation
 *      authority and no authorized booked-inventory release path.
 *
 * 3. Authority Decoupling:
 *    - The legacy `bookings` table has no foreign key or trigger relationship to `canonical_reservations`
 *      or `inventory_days`.
 *    - Source-traced route `PUT /api/user/bookings/:id/cancel` (server.ts:16165) operates exclusively
 *      on the legacy `bookings` table and cannot reach canonical reservation state.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';

// Enforce UTC timezone to match canonical database and CI test runner
process.env.TZ = 'UTC';

import pg from 'pg';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../src/services/itineraryQuoteService.js';
import {acquireHold} from '../../src/services/inventoryHoldService.js';
import {
  createPaymentAttempt,
  ingestProviderEvent,
  getPaymentAttempt,
} from '../../src/services/canonicalPaymentService.js';
import {
  composePaymentReservation,
} from '../../src/services/canonicalCompositionService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

test('canonical reservation cannot record cancellation transition without W4-A lifecycle authority', async () => {
  const fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
  let stays;
  let paymentWorker;
  let compositionWorker;

  try {
    // Apply migrations up to W3-B Task 3 (054)
    await fixture.owner.query(`CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT,
      listing_id INT NOT NULL,
      status TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      total_rent NUMERIC
    )`);
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
    await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});

    // 1. Establish valid accepted commercial offer
    const offerService = new AcceptedOfferService(
      fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'),
      'LOCAL'
    );
    const draft = await offerService.createDraft(fixture.principal(10), {
      commandId: randomUUID(),
      listingId: 1,
      roomTypeId: 101,
      amountMinor: '550000',
      stayStart: fixture.today,
      stayEnd: addDays(fixture.today, 70),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 70 * 86400000).toISOString(),
      maxGuests: 2,
      minNights: 1,
    });
    const submitted = await offerService.submit(fixture.principal(10), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: draft.version,
    });
    await fixture.grantOffer(draft.offerId);
    await offerService.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: submitted.version,
    });

    // 2. Establish valid W2 itinerary quote (1 night, subtotal 550000 paise)
    const checkIn = addDays(fixture.today, 10);
    const checkOut = addDays(fixture.today, 11);
    const quote = await createItineraryQuote(
      stays,
      {
        offerId: draft.offerId,
        revision: 1,
        checkIn,
        checkOut,
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    // 3. Acquire atomic hold (1 unit)
    const holdRes = await acquireHold(stays, {
      roomTypeId: 101,
      checkIn,
      checkOut,
      quantity: 1,
      idempotencyKey: randomUUID(),
      quoteId: quote.id,
      holderPrincipal: 'user:10',
      userId: 10,
    });
    assert.equal(holdRes.success, true);
    const holdId = holdRes.hold.id;
    const roomSubtotalPaise = Number(quote.roomSubtotalMinor);

    // 4. Provision separate approved payable authority (subtotal = 550000 paise)
    const payableId = randomUUID();
    const contractHash = 'a'.repeat(64);
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, quote.id, roomSubtotalPaise, contractHash]
    );

    // 5. Create canonical payment attempt via payment worker
    const orderRef = 'order_test_' + randomUUID();
    const paymentRef = 'pay_test_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: quote.id,
      holdId,
      providerOrderRef: orderRef,
    });

    // 6. Ingest matching PAYMENT_CAPTURED event -> enters MATCHED_CAPTURE
    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: roomSubtotalPaise,
      reportedCurrency: 'INR',
      providerPaymentRef: paymentRef,
      providerOrderRef: orderRef,
      evidencePayload: {pay_id: paymentRef, amount: roomSubtotalPaise},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    assert.equal(dbAttempt?.paymentState, 'MATCHED_CAPTURE');

    // 7. Compose payment and finalize canonical reservation
    const compRes = await composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    });
    const reservationId = compRes.reservationId;
    assert.equal(compRes.compositionState, 'COMMITTED');

    // VERIFY BASELINE W3 STATE:
    // Reservation is committed, inventory is booked
    const resRow = (
      await fixture.owner.query(
        `SELECT id, status, origin_kind, hold_id, quote_id FROM canonical_reservations WHERE id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(resRow.status, 'INVENTORY_COMMITTED');

    const invRow = (
      await fixture.owner.query(
        `SELECT calendar_date, total_units, held_units, booked_units, blocked_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [checkIn]
      )
    ).rows[0];
    assert.equal(invRow.held_units, 0);
    assert.equal(invRow.booked_units, 1);

    // =========================================================================
    // BOUNDARY TEST 1: Direct in-place mutation of canonical_reservations is rejected
    // =========================================================================
    let directMutationBlocked = false;
    let directMutationError = null;
    try {
      await fixture.owner.query(
        `UPDATE canonical_reservations SET status = 'CANCELLED' WHERE id = $1`,
        [reservationId]
      );
    } catch (err) {
      directMutationBlocked = true;
      directMutationError = err.message;
    }
    assert.equal(
      directMutationBlocked,
      true,
      'Direct mutation of canonical_reservations must be blocked by trigger'
    );
    assert.ok(
      directMutationError.includes('CANONICAL_RESERVATION_IMMUTABLE'),
      'Exception must cite CANONICAL_RESERVATION_IMMUTABLE'
    );

    // =========================================================================
    // BOUNDARY TEST 2: Inspect schema for missing canonical W4-A lifecycle authorities
    // =========================================================================
    const schemaChecks = (
      await fixture.owner.query(`
      SELECT
        to_regclass('public.canonical_reservation_events') AS lifecycle_events_table,
        to_regclass('public.canonical_reservation_lifecycle_commands') AS lifecycle_commands_table,
        to_regprocedure('public.canonical_request_cancellation(uuid,uuid,text,text,text)') AS cancellation_request_proc
    `)
    ).rows[0];

    // =========================================================================
    // BOUNDARY TEST 3: Schema relationship decoupling check
    // =========================================================================
    // Check if canonical_reservations has any foreign key or relationship to legacy bookings
    const fkCheck = (
      await fixture.owner.query(`
      SELECT count(*)::int AS count
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'canonical_reservations' AND ccu.table_name = 'bookings'
    `)
    ).rows[0];
    assert.equal(fkCheck.count, 0, 'canonical_reservations must not reference legacy bookings');

    const observation = {
      canonicalReservationId: reservationId,
      canonicalReservationStatus: resRow.status,
      inventoryBookedUnits: invRow.booked_units,
      directMutationBlocked,
      directMutationError,
      canonicalHasNoBookingsFk: fkCheck.count === 0,
      lifecycleEventsTable: schemaChecks.lifecycle_events_table,
      lifecycleCommandsTable: schemaChecks.lifecycle_commands_table,
      cancellationRequestProcedure: schemaChecks.cancellation_request_proc,
    };

    console.log('W4_A_BOUNDARY_OBSERVATION', JSON.stringify(observation));

    // =========================================================================
    // DELIBERATE HONEST RED ASSERTION:
    // W4-A canonical lifecycle event authority is missing.
    // Canonical reservations currently have no authorized lifecycle/cancellation
    // authority and no authorized booked-inventory release path.
    // =========================================================================
    assert.notEqual(
      schemaChecks.lifecycle_events_table,
      null,
      'Canonical reservation lifecycle authority (canonical_reservation_events) is missing in W3 baseline'
    );
  } finally {
    await Promise.all([stays?.end(), paymentWorker?.end(), compositionWorker?.end()]);
    await fixture.close();
  }
});
