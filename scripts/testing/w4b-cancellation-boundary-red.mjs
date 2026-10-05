/**
 * ENCHO W4-B Task 1 diagnostic: Cancellation Completion and Booked Inventory Release Boundary Trace.
 *
 * Demonstrates:
 * 1. Current W4-A Lifecycle & Allocation Baseline:
 *    - Given a fully finalized canonical reservation with committed inventory (booked_units = 1),
 *      the reservation transitions to CANCELLATION_REQUESTED via authorized W4-A lifecycle commands.
 *    - Allocation truth in W3 remains canonical_reservations.status = 'INVENTORY_COMMITTED'.
 *    - CANCELLATION_REQUESTED lifecycle transition has ZERO inventory consequence:
 *      inventory_days.booked_units remains 1; held_units remains 0.
 *
 * 2. Immutability & Direct Mutation Rejection:
 *    - Direct `UPDATE canonical_reservations SET status = 'CANCELLED'` fails with CANONICAL_RESERVATION_IMMUTABLE.
 *    - Direct `UPDATE canonical_reservation_nights` or `DELETE` fails with CANONICAL_RESERVATION_IMMUTABLE.
 *    - Direct `INSERT` into canonical_reservation_events with event_type = 'CANCELLED' is rejected by
 *      CHECK constraint on canonical_reservation_events (only 'CANCELLATION_REQUESTED' allowed).
 *
 * 3. Missing W4-B Cancellation Completion & Release Authority (RED):
 *    - No inventory release fence table exists (`canonical_reservation_inventory_releases` is NULL).
 *    - No cancellation completion procedure exists (`canonical_complete_reservation_cancellation` is NULL).
 *    - Restricted worker (`encho_lifecycle_worker`) has zero DML privilege on `inventory_days` (42501).
 *    - Restricted worker has zero direct INSERT privilege on `canonical_reservation_events` (42501).
 *    - Zero canonical functions exist anywhere in PostgreSQL that can decrement `inventory_days.booked_units`.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';

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
import {composePaymentReservation} from '../../src/services/canonicalCompositionService.js';
import {
  issueCancellationAuthorization,
  requestReservationCancellation,
  getReservationLifecycle,
} from '../../src/services/canonicalLifecycleService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

test('W4-B cancellation completion and booked inventory release boundary diagnostic', async () => {
  const fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
  let stays;
  let reservationWorker;
  let paymentWorker;
  let compositionWorker;
  let lifecycleIssuer;
  let lifecycleWorker;

  try {
    // 1. Provision roles and apply migrations up to W4-A (055)
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

    // Provision lifecycle roles for W4-A
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});

    // 2. Establish valid accepted commercial offer
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

    // 3. Establish valid W2 itinerary quote (1 night, subtotal 550000 paise)
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

    // 4. Acquire atomic hold (1 unit)
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

    // 5. Provision separate approved payable authority
    const payableId = randomUUID();
    const contractHash = 'a'.repeat(64);
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, quote.id, roomSubtotalPaise, contractHash]
    );

    // 6. Create payment attempt & ingest PAYMENT_CAPTURED
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

    // 7. Compose payment and finalize canonical reservation (W3)
    const compRes = await composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    });
    const reservationId = compRes.reservationId;
    assert.equal(compRes.compositionState, 'COMMITTED');

    // Verify baseline allocation state:
    const resRow = (
      await fixture.owner.query(
        `SELECT id, status, origin_kind, hold_id, quote_id FROM canonical_reservations WHERE id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(resRow.status, 'INVENTORY_COMMITTED');

    const invRowBefore = (
      await fixture.owner.query(
        `SELECT id, calendar_date, total_units, held_units, booked_units, blocked_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [checkIn]
      )
    ).rows[0];
    assert.equal(invRowBefore.held_units, 0);
    assert.equal(invRowBefore.booked_units, 1);

    // 8. Execute authorized W4-A lifecycle transition to CANCELLATION_REQUESTED
    const cancelCmdId = randomUUID();
    const auth = await issueCancellationAuthorization(lifecycleIssuer, {
      reservationId,
      commandId: cancelCmdId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
      authenticatedPrincipal: 'user:10',
    });
    assert.ok(auth.authorizationId);

    const transitionRes = await requestReservationCancellation(lifecycleWorker, {
      authorizationId: auth.authorizationId,
      commandId: cancelCmdId,
      reservationId,
      reasonCode: 'GUEST_CANCEL_REQUEST',
      reasonText: 'Guest requested cancellation',
    });
    assert.equal(transitionRes.lifecycleState, 'CANCELLATION_REQUESTED');

    const lifecycleView = await getReservationLifecycle(lifecycleWorker, reservationId);
    assert.equal(lifecycleView?.lifecycleState, 'CANCELLATION_REQUESTED');
    assert.equal(lifecycleView?.currentSequence, 1);

    // Verify that W4-A cancellation request did NOT touch booked inventory
    const invRowAfterRequest = (
      await fixture.owner.query(
        `SELECT calendar_date, total_units, held_units, booked_units, blocked_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [checkIn]
      )
    ).rows[0];
    assert.equal(invRowAfterRequest.held_units, 0);
    assert.equal(invRowAfterRequest.booked_units, 1);

    // =========================================================================
    // BOUNDARY CHECK 1: Direct in-place mutation of canonical_reservations is rejected
    // =========================================================================
    let directResMutationBlocked = false;
    let directResMutationError = '';
    try {
      await fixture.owner.query(
        `UPDATE canonical_reservations SET status = 'CANCELLED' WHERE id = $1`,
        [reservationId]
      );
    } catch (err) {
      directResMutationBlocked = true;
      directResMutationError = err.message;
    }
    assert.equal(directResMutationBlocked, true);
    assert.ok(directResMutationError.includes('CANONICAL_RESERVATION_IMMUTABLE'));

    // =========================================================================
    // BOUNDARY CHECK 2: Direct mutation of canonical_reservation_nights is rejected
    // =========================================================================
    let directNightMutationBlocked = false;
    let directNightMutationError = '';
    try {
      await fixture.owner.query(
        `DELETE FROM canonical_reservation_nights WHERE reservation_id = $1`,
        [reservationId]
      );
    } catch (err) {
      directNightMutationBlocked = true;
      directNightMutationError = err.message;
    }
    assert.equal(directNightMutationBlocked, true);
    assert.ok(directNightMutationError.includes('CANONICAL_RESERVATION_IMMUTABLE'));

    // =========================================================================
    // BOUNDARY CHECK 3: CANCELLED event type rejected by schema constraint
    // =========================================================================
    let directEventInsertBlocked = false;
    let directEventInsertError = '';
    try {
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_events (
          reservation_id, sequence_number, event_type, actor_kind, actor_principal,
          origin_kind, reason_code, command_id
        ) VALUES ($1, 2, 'CANCELLED', 'GUEST', 'user:10', 'ENCHO_DIRECT', 'MANUAL_OVERRIDE', $2)`,
        [reservationId, randomUUID()]
      );
    } catch (err) {
      directEventInsertBlocked = true;
      directEventInsertError = err.message;
    }
    assert.equal(directEventInsertBlocked, true);
    assert.ok(
      directEventInsertError.includes('canonical_reservation_events_event_type_check') ||
      directEventInsertError.includes('check constraint')
    );

    // =========================================================================
    // BOUNDARY CHECK 4: Restricted lifecycle worker cannot touch inventory_days
    // =========================================================================
    const lWorkerClient = await lifecycleWorker.connect();
    let workerInventoryUpdateBlocked = false;
    let workerInventoryUpdateCode = '';
    try {
      await lWorkerClient.query(
        `UPDATE inventory_days SET booked_units = booked_units - 1 WHERE id = $1`,
        [invRowBefore.id]
      );
    } catch (err) {
      workerInventoryUpdateBlocked = true;
      workerInventoryUpdateCode = err.code;
    } finally {
      lWorkerClient.release();
    }
    assert.equal(workerInventoryUpdateBlocked, true);
    assert.equal(workerInventoryUpdateCode, '42501'); // insufficient_privilege

    // =========================================================================
    // BOUNDARY CHECK 5: Restricted lifecycle worker cannot directly insert events
    // =========================================================================
    const lWorkerClient2 = await lifecycleWorker.connect();
    let workerEventInsertBlocked = false;
    let workerEventInsertCode = '';
    try {
      await lWorkerClient2.query(
        `INSERT INTO canonical_reservation_events (
          reservation_id, sequence_number, event_type, actor_kind, actor_principal,
          origin_kind, reason_code, command_id
        ) VALUES ($1, 2, 'CANCELLATION_REQUESTED', 'GUEST', 'user:10', 'ENCHO_DIRECT', 'FORGERY', $2)`,
        [reservationId, randomUUID()]
      );
    } catch (err) {
      workerEventInsertBlocked = true;
      workerEventInsertCode = err.code;
    } finally {
      lWorkerClient2.release();
    }
    assert.equal(workerEventInsertBlocked, true);
    assert.equal(workerEventInsertCode, '42501'); // insufficient_privilege

    // =========================================================================
    // BOUNDARY CHECK 6: Schema inspection for missing W4-B authorities
    // =========================================================================
    const schemaChecks = (
      await fixture.owner.query(`
        SELECT
          to_regclass('public.canonical_reservation_inventory_releases') AS inventory_release_fence_table,
          to_regprocedure('public.canonical_complete_reservation_cancellation(uuid,uuid,uuid,text,text)') AS complete_cancellation_proc,
          (
            SELECT count(*)::int
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND (p.proname LIKE '%release%inventory%' OR p.proname LIKE '%complete%cancellation%')
          ) AS matching_release_procs_count
      `)
    ).rows[0];

    const observation = {
      canonicalReservationId: reservationId,
      canonicalReservationStatus: resRow.status,
      w4aLifecycleState: lifecycleView?.lifecycleState,
      inventoryBookedUnits: invRowAfterRequest.booked_units,
      inventoryHeldUnits: invRowAfterRequest.held_units,
      directResMutationBlocked,
      directNightMutationBlocked,
      directEventInsertBlocked,
      workerInventoryUpdateBlocked,
      workerEventInsertBlocked,
      inventoryReleaseFenceTable: schemaChecks.inventory_release_fence_table,
      completeCancellationProcedure: schemaChecks.complete_cancellation_proc,
      matchingReleaseProcsCount: schemaChecks.matching_release_procs_count,
    };

    console.log('W4_B_BOUNDARY_OBSERVATION', JSON.stringify(observation));

    // =========================================================================
    // DELIBERATE HONEST RED ASSERTION:
    // W4-B inventory release fence authority is missing.
    // An authorized cancellation request currently has zero mechanism to
    // atomically complete cancellation and release booked inventory.
    // =========================================================================
    assert.notEqual(
      schemaChecks.inventory_release_fence_table,
      null,
      'Canonical inventory release fence authority (canonical_reservation_inventory_releases) is missing in W4-A baseline'
    );
  } finally {
    await Promise.all([
      stays?.end(),
      reservationWorker?.end(),
      paymentWorker?.end(),
      compositionWorker?.end(),
      lifecycleIssuer?.end(),
      lifecycleWorker?.end(),
    ]);
    await fixture.close();
  }
});
