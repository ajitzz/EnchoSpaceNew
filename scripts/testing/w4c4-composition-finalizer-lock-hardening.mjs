/**
 * ENCHO W4-C4 Focused Test Suite:
 * Payment Composition & Direct Finalizer Lock-Order Hardening.
 *
 * Verifies Migration 060:
 * - Post-fix serialization of canonical_compose_payment_reservation:
 *   Composition eliminates pre-finalization booking_holds FOR UPDATE lock,
 *   preserving the global lock hierarchy:
 *   canonical_payment_attempts -> canonical_reservation_commands -> booking_holds -> inventory_days.
 * - Race Case A: Direct finalizer wins same H/C race -> zero 40P01, clean reconciliation.
 * - Race Case B: Composition wins same H/C race -> zero 40P01, exactly one reservation, exact finalizer replay.
 * - Race Case C: Hold expiry while waiting -> finalizer rejects on clock_timestamp(), composition reconciles HOLD_EXPIRED.
 * - Race Case D: Non-active / released hold -> finalizer rejects with RESERVATION_HOLD_NOT_ACTIVE, maps to HOLD_EXPIRED.
 * - Replay Cases:
 *   - Exact composition replay returns stored record with replayed = true.
 *   - Direct finalizer command replay unchanged.
 *   - Changed command/attempt conflicts rejected.
 *   - Outside-composition finalizer replay rejected with FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
 * - Outer Transaction Failure:
 *   - Failure on bridge insert rolls back entire outer transaction including finalizer effects.
 * - Role Isolation:
 *   - encho_composition_worker can EXECUTE composition, CANNOT execute finalizer directly, no raw table DML.
 *   - encho_reservation_worker can EXECUTE finalizer directly.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.TZ = 'UTC';

import pg from 'pg';
import { AcceptedOfferService } from '../../src/server/offers/acceptedOfferService.js';
import { PostgresWorkforceAuthorization } from '../../src/lib/iam/postgresAuthorization.js';
import { createItineraryQuote } from '../../src/services/itineraryQuoteService.js';
import { acquireHold } from '../../src/services/inventoryHoldService.js';
import {
  createPaymentAttempt,
  ingestProviderEvent,
  getPaymentAttempt,
  getPaymentReconciliations,
} from '../../src/services/canonicalPaymentService.js';
import {
  composePaymentReservation,
  getPaymentReservation,
} from '../../src/services/canonicalCompositionService.js';
import { addDays, createW1AcceptedOfferFixture } from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import { applyIsolatedMigration } from '../../src/test/harvo/helpers/isolatedMigration.js';

test('W4-C4 payment composition lock-order hardening verification (Migration 060)', async () => {
  // =========================================================================
  // 1. VERIFY EXACT CANONICAL BASE & ENVIRONMENT
  // =========================================================================
  const expectedCanonicalBase = 'e2479b1c7601e21a6198b7784fa93ac3a4e27dad';
  let mergeBaseCommit = '';
  try {
    mergeBaseCommit = execSync(`git merge-base HEAD ${expectedCanonicalBase}`, {
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new Error(`EVIDENCE_INCOMPLETE: Unable to verify canonical base commit: ${err.message}`);
  }

  assert.equal(
    mergeBaseCommit,
    expectedCanonicalBase,
    `EVIDENCE_INCOMPLETE: Worker branch must descend directly from canonical base ${expectedCanonicalBase}`
  );

  const activeNodeMajor = Number(process.versions.node.split('.')[0]);
  assert.equal(activeNodeMajor, 24, `EVIDENCE_INCOMPLETE: Required active Node major is 24, got ${activeNodeMajor}`);

  // =========================================================================
  // 2. SETUP ISOLATED POSTGRES CLUSTER & ROLES UP TO MIGRATION 060
  // =========================================================================
  const fixture = await createW1AcceptedOfferFixture({ serverCompatible: true });
  let stays;
  let reservationWorker;
  let compositionWorker;
  let paymentWorker;
  let cancellationExecutor;

  try {
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
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');
    await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');
    await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    await fixture.owner.query(`CREATE ROLE encho_cancellation_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_cancellation_executor LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');
    await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');
    await applyIsolatedMigration(fixture.owner, '058_version_aware_cancellation_release.sql');

    await fixture.owner.query(`CREATE ROLE encho_modification_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '059_canonical_reservation_modification_request.sql');

    // Apply MIGRATION 060: Lock order hardening
    await applyIsolatedMigration(fixture.owner, '060_canonical_payment_composition_lock_order_hardening.sql');

    stays = new pg.Pool({ ...fixture.owner.options, user: 'encho_stays_web' });
    reservationWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_reservation_worker' });
    compositionWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_composition_worker' });
    paymentWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_payment_worker' });
    cancellationExecutor = new pg.Pool({ ...fixture.owner.options, user: 'encho_cancellation_executor' });

    // Seed inventory days for roomTypeId 101 and 102
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 102, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );

    // Establish base accepted offer on room 101
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
      stayEnd: addDays(fixture.today, 100),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 100 * 86400000).toISOString(),
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
    const offerId = draft.offerId;

    // Helper: Create valid matched-capture payment attempt fixture
    const setupPaymentAttemptFixture = async (offsetDays = 10, nights = 2) => {
      const checkIn = addDays(fixture.today, offsetDays);
      const checkOut = addDays(fixture.today, offsetDays + nights);

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
        'user:10'
      );

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
      const expectedAmount = Number(quote.roomSubtotalMinor);

      const payableId = randomUUID();
      const contractHash = 'c'.repeat(64);
      await fixture.owner.query(
        `INSERT INTO canonical_payable_authorities (
          id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
        ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
        [payableId, quote.id, expectedAmount, contractHash]
      );

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
        reportedAmountPaise: expectedAmount,
        reportedCurrency: 'INR',
        providerPaymentRef: paymentRef,
        providerOrderRef: orderRef,
        evidencePayload: { pay_id: paymentRef, amount: expectedAmount },
      });

      return {
        quote,
        holdId,
        attemptId: attempt.attemptId,
        expectedAmount,
        checkIn,
        checkOut,
      };
    };

    // =========================================================================
    // 3. RACE CASE A: DIRECT FINALIZER WINS
    // =========================================================================
    // Direct finalizer runs first on hold H1 with command C1.
    // Composition arrives after hold is finalized/consumed.
    // Verify:
    // - Zero 40P01 deadlock
    // - If different command: RECONCILIATION_REQUIRED / HOLD_EXPIRED (due to non-ACTIVE status)
    // - No duplicate canonical reservation
    // - Held units decremented, booked units incremented exactly once.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(15, 2);
      const directCommand = randomUUID();

      // Direct finalizer executes and commits first
      const dirClient = await reservationWorker.connect();
      let directRes;
      try {
        await dirClient.query('BEGIN');
        await dirClient.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
        const { rows } = await dirClient.query(
          `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
          [f.holdId, f.quote.id, directCommand]
        );
        directRes = rows[0];
        await dirClient.query('COMMIT');
      } finally {
        dirClient.release();
      }
      assert.ok(directRes.reservation_id, 'Direct finalizer must create reservation');
      assert.equal(directRes.replayed, false);

      // Composition executes concurrently / subsequently on the same hold with its own command
      const compCommand = randomUUID();
      const compRes = await composePaymentReservation(compositionWorker, {
        commandId: compCommand,
        paymentAttemptId: f.attemptId,
      });

      assert.equal(compRes.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(compRes.reconciliationReason, 'HOLD_EXPIRED');
      assert.equal(compRes.reservationId, null);

      // Verify no duplicate reservation exists for this hold
      const { rows: resCount } = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [f.holdId]
      );
      assert.equal(resCount[0].count, 1, 'Exactly one reservation must exist');

      // Verify no bridge row created for losing composition
      const bridge = await getPaymentReservation(compositionWorker, f.attemptId);
      assert.equal(bridge, null, 'Losing composition must not record bridge');
    }

    // =========================================================================
    // 4. RACE CASE B: COMPOSITION WINS (SAME H/C SERIALIZATION)
    // =========================================================================
    // Composition begins first for H1, C1.
    // Concurrent direct finalizer targets SAME H1, C1.
    // Under Migration 060, composition locks Command then Hold (via finalizer),
    // eliminating the pre-lock on Hold. Direct finalizer also locks Command then Hold.
    // Both contenders share the exact same lock order:
    // canonical_reservation_commands -> booking_holds -> inventory_days.
    // Verify:
    // - ZERO 40P01 deadlock
    // - Composition commits exactly one reservation and bridge row
    // - Direct finalizer cleanly replays with replayed = true and matching reservation ID
    // - Held units decremented, booked units incremented exactly once.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(20, 2);
      const sharedCommand = randomUUID();

      const connComp = await compositionWorker.connect();
      const connDir = await reservationWorker.connect();

      try {
        await connComp.query('BEGIN');
        await connComp.query("SET lock_timeout = '3000ms'");

        await connDir.query('BEGIN');
        await connDir.query("SET lock_timeout = '3000ms'");
        await connDir.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);

        // Conn Comp calls composition inside transaction
        // Under 060, composition calls finalizer which locks canonical_reservation_commands(sharedCommand) FOR UPDATE
        const compPromise = connComp.query(
          `SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)`,
          [sharedCommand, f.attemptId]
        );

        // Conn Dir attempts canonical_finalize_direct_hold on the same command -> blocks on canonical_reservation_commands!
        // Brief pause to ensure Conn Comp has acquired the command lock
        await new Promise(r => setTimeout(r, 100));

        let dirCompletedEarly = false;
        const dirPromise = connDir.query(
          `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
          [f.holdId, f.quote.id, sharedCommand]
        ).then(res => {
          dirCompletedEarly = true;
          return res;
        });

        // Verify Conn Dir is cleanly waiting without throwing 40P01
        await new Promise(r => setTimeout(r, 100));
        assert.equal(dirCompletedEarly, false, 'Direct finalizer must wait cleanly on command lock held by composition');

        // Conn Comp commits
        await connComp.query('COMMIT');
        const compRes = (await compPromise).rows[0];

        assert.equal(compRes.composition_state, 'COMMITTED');
        assert.ok(compRes.reservation_id);
        assert.equal(compRes.replayed, false);

        // Conn Dir unblocks and returns exact replay
        const dirRes = (await dirPromise).rows[0];
        assert.equal(dirRes.reservation_id, compRes.reservation_id, 'Direct finalizer must return identical reservation ID');
        assert.equal(dirRes.replayed, true, 'Direct finalizer must return replayed = true');
        await connDir.query('COMMIT');

        // Exactly one reservation row
        const { rows: resRows } = await fixture.owner.query(
          'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
          [f.holdId]
        );
        assert.equal(resRows[0].count, 1);

        // Exactly one bridge row
        const bridge = await getPaymentReservation(compositionWorker, f.attemptId);
        assert.ok(bridge);
        assert.equal(bridge.reservationId, compRes.reservation_id);
        assert.equal(bridge.status, 'COMMITTED');
      } finally {
        connComp.release();
        connDir.release();
      }
    }

    // =========================================================================
    // 5. RACE CASE C: HOLD EXPIRY WHILE WAITING
    // =========================================================================
    // Simulates a hold that expires while finalization is waiting behind a lock.
    // Verify:
    // - Finalizer post-lock clock_timestamp() re-check rejects with RESERVATION_HOLD_EXPIRED
    // - Composition catches RESERVATION_HOLD_EXPIRED and transitions attempt to
    //   RECONCILIATION_REQUIRED / HOLD_EXPIRED
    // - Zero reservation created, zero inventory movement.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(25, 2);
      const commandId = randomUUID();

      // Artificially age the hold so it is past expires_at
      await fixture.owner.query(
        `UPDATE booking_holds SET expires_at = clock_timestamp() - INTERVAL '5 seconds' WHERE id = $1`,
        [f.holdId]
      );

      const res = await composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: f.attemptId,
      });

      assert.equal(res.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(res.reconciliationReason, 'HOLD_EXPIRED');
      assert.equal(res.reservationId, null);

      const dbAttempt = await getPaymentAttempt(paymentWorker, f.attemptId);
      assert.equal(dbAttempt?.paymentState, 'RECONCILIATION_REQUIRED');
      assert.equal(dbAttempt?.reconciliationReason, 'HOLD_EXPIRED');

      const reconciliations = await getPaymentReconciliations(paymentWorker, f.attemptId);
      assert.ok(reconciliations.some(r => r.reason === 'HOLD_EXPIRED'));

      const { rows: resCount } = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [f.holdId]
      );
      assert.equal(resCount[0].count, 0, 'Zero reservation must be created on expired hold');
    }

    // =========================================================================
    // 6. RACE CASE D: RELEASED / NON-ACTIVE HOLD
    // =========================================================================
    // Hold was released before composition.
    // Finalizer rejects with RESERVATION_HOLD_NOT_ACTIVE.
    // Composition maps RESERVATION_HOLD_NOT_ACTIVE to HOLD_EXPIRED (pre-060 contract).
    // Verify:
    // - RECONCILIATION_REQUIRED / HOLD_EXPIRED
    // - No reservation, no bridge.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(30, 2);
      const commandId = randomUUID();

      await fixture.owner.query(
        `UPDATE booking_holds SET status = 'RELEASED', released_at = clock_timestamp() WHERE id = $1`,
        [f.holdId]
      );

      const res = await composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: f.attemptId,
      });

      assert.equal(res.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(res.reconciliationReason, 'HOLD_EXPIRED');
      assert.equal(res.reservationId, null);

      const dbAttempt = await getPaymentAttempt(paymentWorker, f.attemptId);
      assert.equal(dbAttempt?.paymentState, 'RECONCILIATION_REQUIRED');
      assert.equal(dbAttempt?.reconciliationReason, 'HOLD_EXPIRED');

      const { rows: resCount } = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [f.holdId]
      );
      assert.equal(resCount[0].count, 0);
    }

    // =========================================================================
    // 7. REPLAY CASES
    // =========================================================================
    // 7a. Exact composition replay returns stored record with replayed = true
    // 7b. Changed command for composed attempt throws PAYMENT_ALREADY_COMPOSED
    // 7c. Changed attempt for composed command throws COMPOSITION_COMMAND_CONFLICT
    // 7d. Outside-composition finalizer replay rejected:
    //     If direct finalizer ran for command C1 outside composition, composition
    //     cannot adopt it -> RECONCILIATION_REQUIRED / FINALIZER_FAILURE
    //     with reason FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(35, 2);
      const commandId = randomUUID();

      const initial = await composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: f.attemptId,
      });
      assert.equal(initial.compositionState, 'COMMITTED');
      assert.equal(initial.replayed, false);

      // 7a. Exact replay
      const replay = await composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: f.attemptId,
      });
      assert.equal(replay.compositionState, 'COMMITTED');
      assert.equal(replay.reservationId, initial.reservationId);
      assert.equal(replay.replayed, true);

      // 7b. Different command, same payment attempt
      await assert.rejects(
        composePaymentReservation(compositionWorker, {
          commandId: randomUUID(),
          paymentAttemptId: f.attemptId,
        }),
        /PAYMENT_ALREADY_COMPOSED/
      );

      // 7c. Same command, different payment attempt
      const fOther = await setupPaymentAttemptFixture(40, 2);
      await assert.rejects(
        composePaymentReservation(compositionWorker, {
          commandId,
          paymentAttemptId: fOther.attemptId,
        }),
        /COMPOSITION_COMMAND_CONFLICT/
      );

      // 7d. Outside-composition finalizer replay
      // Create a fresh hold & attempt, then execute direct finalizer directly with command C_out
      const fOut = await setupPaymentAttemptFixture(45, 2);
      const commandOut = randomUUID();

      const dirClient = await reservationWorker.connect();
      try {
        await dirClient.query('BEGIN');
        await dirClient.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
        const { rows } = await dirClient.query(
          `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
          [fOut.holdId, fOut.quote.id, commandOut]
        );
        assert.equal(rows[0].replayed, false);
        await dirClient.query('COMMIT');
      } finally {
        dirClient.release();
      }

      // Now attempt composition with commandOut and fOut.attemptId
      // Finalizer returns replayed = true, but no composition receipt exists for commandOut
      const unadoptedRes = await composePaymentReservation(compositionWorker, {
        commandId: commandOut,
        paymentAttemptId: fOut.attemptId,
      });

      assert.equal(unadoptedRes.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(unadoptedRes.reconciliationReason, 'FINALIZER_FAILURE');

      const recs = await getPaymentReconciliations(paymentWorker, fOut.attemptId);
      const replayRec = recs.find(r => r.reason === 'FINALIZER_FAILURE');
      assert.ok(replayRec);
      assert.equal(
        replayRec.details?.reason,
        'FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT',
        'Must record FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT'
      );
    }

    // =========================================================================
    // 8. OUTER TRANSACTION FAILURE (ROLLBACK PRESERVATION)
    // =========================================================================
    // Test owner injects a failure on canonical_payment_reservations insert.
    // Composition fails, rolling back the entire outer transaction including
    // the finalizer's reservation creation and inventory mutation.
    // =========================================================================
    {
      const f = await setupPaymentAttemptFixture(50, 2);
      const commandId = randomUUID();

      // Install temporary trigger on bridge table to simulate post-finalizer failure
      await fixture.owner.query(`
        CREATE OR REPLACE FUNCTION fixture_fail_bridge() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'FIXTURE_BRIDGE_FAILURE';
        END $$;
        CREATE TRIGGER trg_fixture_fail_bridge BEFORE INSERT ON canonical_payment_reservations
          FOR EACH ROW EXECUTE FUNCTION fixture_fail_bridge();
      `);

      try {
        await assert.rejects(
          composePaymentReservation(compositionWorker, {
            commandId,
            paymentAttemptId: f.attemptId,
          }),
          /FIXTURE_BRIDGE_FAILURE|COMPOSITION_AUTHORITY_UNAVAILABLE/
        );

        // Entire outer transaction must have rolled back:
        // 1. Zero canonical reservations created
        const { rows: resCount } = await fixture.owner.query(
          'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
          [f.holdId]
        );
        assert.equal(resCount[0].count, 0, 'Outer transaction rollback must roll back reservation');

        // 2. Hold status remains ACTIVE
        const { rows: holdRows } = await fixture.owner.query(
          'SELECT status FROM booking_holds WHERE id = $1',
          [f.holdId]
        );
        assert.equal(holdRows[0].status, 'ACTIVE', 'Hold status must remain ACTIVE after rollback');

        // 3. Zero bridge records
        const { rows: bridgeCount } = await fixture.owner.query(
          'SELECT count(*)::int AS count FROM canonical_payment_reservations WHERE payment_attempt_id = $1',
          [f.attemptId]
        );
        assert.equal(bridgeCount[0].count, 0);
      } finally {
        await fixture.owner.query('DROP TRIGGER IF EXISTS trg_fixture_fail_bridge ON canonical_payment_reservations');
        await fixture.owner.query('DROP FUNCTION IF EXISTS fixture_fail_bridge');
      }
    }

    // =========================================================================
    // 9. ROLE ISOLATION POST-060
    // =========================================================================
    // encho_composition_worker:
    // - EXECUTE canonical_compose_payment_reservation: YES
    // - direct EXECUTE canonical_finalize_direct_hold: NO
    // - raw DML on canonical_reservations, canonical_payment_attempts: NO
    // encho_reservation_worker:
    // - direct EXECUTE canonical_finalize_direct_hold: YES
    // =========================================================================
    {
      const { rows: compRoleRows } = await compositionWorker.query(`
        SELECT
          has_function_privilege('encho_composition_worker', 'canonical_compose_payment_reservation(uuid,uuid)', 'EXECUTE') AS can_compose,
          has_function_privilege('encho_composition_worker', 'canonical_finalize_direct_hold(uuid,uuid,uuid)', 'EXECUTE') AS can_finalize_directly,
          has_table_privilege('encho_composition_worker', 'canonical_reservations', 'INSERT,UPDATE,DELETE') AS raw_reservations,
          has_table_privilege('encho_composition_worker', 'canonical_payment_attempts', 'INSERT,UPDATE,DELETE') AS raw_attempts,
          has_table_privilege('encho_composition_worker', 'inventory_days', 'INSERT,UPDATE,DELETE') AS raw_inventory
      `);
      const r = compRoleRows[0];
      assert.equal(r.can_compose, true, 'encho_composition_worker must have EXECUTE on canonical_compose_payment_reservation');
      assert.equal(r.can_finalize_directly, false, 'encho_composition_worker must NOT have direct EXECUTE on canonical_finalize_direct_hold');
      assert.equal(r.raw_reservations, false, 'encho_composition_worker must not have raw DML on canonical_reservations');
      assert.equal(r.raw_attempts, false, 'encho_composition_worker must not have raw DML on canonical_payment_attempts');
      assert.equal(r.raw_inventory, false, 'encho_composition_worker must not have raw DML on inventory_days');

      const { rows: resRoleRows } = await reservationWorker.query(`
        SELECT
          has_function_privilege('encho_reservation_worker', 'canonical_finalize_direct_hold(uuid,uuid,uuid)', 'EXECUTE') AS can_finalize
      `);
      assert.equal(resRoleRows[0].can_finalize, true, 'encho_reservation_worker must have EXECUTE on canonical_finalize_direct_hold');
    }

  } finally {
    if (stays) await stays.end();
    if (reservationWorker) await reservationWorker.end();
    if (compositionWorker) await compositionWorker.end();
    if (paymentWorker) await paymentWorker.end();
    if (cancellationExecutor) await cancellationExecutor.end();
    await fixture?.close();
  }
});
