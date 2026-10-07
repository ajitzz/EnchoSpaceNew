/**
 * ENCHO W4-C4 Focused Test Suite:
 * Payment Composition & Direct Finalizer Lock-Order Hardening.
 *
 * Verifies Migration 060:
 * - Post-fix serialization of canonical_compose_payment_reservation:
 *   Composition eliminates pre-finalization booking_holds FOR UPDATE lock,
 *   preserving the global lock hierarchy:
 *   canonical_payment_attempts -> canonical_reservation_commands -> booking_holds -> inventory_days.
 * - Race Case A: Direct finalizer wins same H/C race -> zero 40P01, clean reconciliation with
 *   FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
 * - Sequential consumed-hold regression on different command -> HOLD_EXPIRED.
 * - Race Case B: Composition wins same H/C race -> zero 40P01, exactly one reservation, exact finalizer replay.
 * - Race Case C: Hold expiry while waiting -> finalizer rejects on clock_timestamp(), composition reconciles HOLD_EXPIRED.
 * - Race Case D: Non-active / released hold -> finalizer rejects with RESERVATION_HOLD_NOT_ACTIVE, maps to HOLD_EXPIRED.
 * - Replay Cases:
 *   - Exact composition replay returns stored record with replayed = true, zero additional movement.
 *   - Direct finalizer command replay unchanged.
 *   - Changed command/attempt conflicts rejected.
 *   - Outside-composition finalizer replay rejected with FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
 * - Outer Transaction Failure:
 *   - Failure on bridge insert (injected P7777) rolls back entire outer transaction including finalizer effects.
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
import {
  waitFor,
  waitForLockWait,
  setupCommandGate,
  teardownCommandGate,
  captureScopedSnapshot,
  assertNoNewAllocation,
  assertInventoryMovedOnce,
  getFunctionIdentity,
} from './helpers/w4c4-concurrency-evidence.mjs';

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
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');
    await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');
    await applyIsolatedMigration(fixture.owner, '058_version_aware_cancellation_release.sql');

    await fixture.owner.query(`CREATE ROLE encho_modification_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '059_canonical_reservation_modification_request.sql');

    // Apply MIGRATION 060: Lock order hardening
    await applyIsolatedMigration(fixture.owner, '060_canonical_payment_composition_lock_order_hardening.sql');

    // Setup command gate trigger for synchronization
    await setupCommandGate(fixture.owner);

    // Verify installed function identity
    const installed = await getFunctionIdentity(fixture.owner);
    assert.equal(installed.function, 'canonical_compose_payment_reservation(uuid,uuid)');
    assert.equal(installed.prosecdef, true);
    assert.ok(installed.function_hash);

    stays = new pg.Pool({ ...fixture.owner.options, user: 'encho_stays_web' });
    reservationWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_reservation_worker' });
    compositionWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_composition_worker' });
    paymentWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_payment_worker' });
    cancellationExecutor = new pg.Pool({ ...fixture.owner.options, user: 'encho_cancellation_executor' });

    for (const p of [fixture.owner, stays, reservationWorker, compositionWorker, paymentWorker, cancellationExecutor]) {
      p.on('error', () => {});
    }

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

    // Helper: Run race between direct finalizer and composition on SAME H and SAME C
    const runRace = async (label, offsetDays, first) => {
      const f = await setupPaymentAttemptFixture(offsetDays, 2);
      const command = randomUUID();
      const gateKey = 88773301n;
      const before = await captureScopedSnapshot(fixture.owner, {
        holdId: f.holdId,
        commandId: command,
        attemptId: f.attemptId,
      });

      const gateConn = await fixture.owner.connect();
      const dirConn = await reservationWorker.connect();
      const compConn = await compositionWorker.connect();

      const getPid = async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const pids = {
        gate: await getPid(gateConn),
        direct: await getPid(dirConn),
        composition: await getPid(compConn),
      };

      let directPromise;
      let compPromise;

      try {
        await gateConn.query('SELECT pg_advisory_lock($1)', [gateKey.toString()]);
        await fixture.owner.query(
          'INSERT INTO review_c4_gate (command_id, gate_key) VALUES ($1, $2)',
          [command, gateKey.toString()]
        );

        for (const conn of [dirConn, compConn]) {
          await conn.query('BEGIN');
          await conn.query("SET LOCAL lock_timeout = '8s'; SET LOCAL statement_timeout = '12s'");
        }
        await dirConn.query("SELECT set_config('app.stays_principal', 'user:10', true)");

        const invokeClient = (conn, sql, args) =>
          conn
            .query(sql, args)
            .then(async (r) => {
              await conn.query('COMMIT');
              return { clientError: null, result: r.rows[0] };
            })
            .catch(async (e) => {
              await conn.query('ROLLBACK');
              return { clientError: { code: e.code, message: e.message }, result: null };
            });

        const startDirect = () =>
          invokeClient(dirConn, 'SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)', [
            f.holdId,
            f.quote.id,
            command,
          ]);

        const startComp = () =>
          invokeClient(compConn, 'SELECT * FROM canonical_compose_payment_reservation($1, $2)', [
            command,
            f.attemptId,
          ]);

        if (first === 'direct') {
          directPromise = startDirect();
        } else {
          compPromise = startComp();
        }

        const firstPid = first === 'direct' ? pids.direct : pids.composition;
        const gateWait = await waitForLockWait(
          fixture.owner,
          firstPid,
          pids.gate,
          `${label}: first gated after command insert`
        );
        assert.ok(gateWait, `${label}: first contender must wait on command gate`);

        if (first === 'direct') {
          compPromise = startComp();
        } else {
          directPromise = startDirect();
        }

        const secondPid = first === 'direct' ? pids.composition : pids.direct;
        const secondWait = await waitForLockWait(
          fixture.owner,
          secondPid,
          firstPid,
          `${label}: second command contention`
        );
        assert.ok(secondWait, `${label}: second contender must wait on command lock`);

        await gateConn.query('SELECT pg_advisory_unlock($1)', [gateKey.toString()]);

        const [directRes, compRes] = await Promise.all([directPromise, compPromise]);
        const after = await captureScopedSnapshot(fixture.owner, {
          holdId: f.holdId,
          commandId: command,
          attemptId: f.attemptId,
        });

        return {
          d: directRes,
          c: compRes,
          before,
          after,
          f,
          command,
          gateWait,
          secondWait,
          pids,
        };
      } finally {
        await gateConn.query('SELECT pg_advisory_unlock_all()').catch(() => {});
        await Promise.allSettled([directPromise, compPromise].filter(Boolean));
        await dirConn.query('ROLLBACK').catch(() => {});
        await compConn.query('ROLLBACK').catch(() => {});
        await fixture.owner.query('DELETE FROM review_c4_gate WHERE command_id = $1', [command]).catch(() => {});
        gateConn.release();
        dirConn.release();
        compConn.release();
      }
    };

    // =========================================================================
    // 3. RACE CASE A: DIRECT FINALIZER WINS (SAME H / SAME C)
    // =========================================================================
    // Direct finalizer runs first on hold H and command C; paused on gate.
    // Composition starts on SAME H and SAME C; observed waiting on command lock.
    // Gate unlocks -> direct finalizer completes and creates reservation.
    // Composition serializes behind it, sees hold consumed, refuses adoption:
    // FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
    // Verify:
    // - Zero 40P01, zero 55P03
    // - Exactly one reservation, zero bridges
    // - Held decremented once, booked incremented once.
    // =========================================================================
    {
      const directFirst = await runRace('POST_060_DIRECT_FIRST_SAME_H_SAME_C', 10, 'direct');
      assert.equal(directFirst.d.clientError, null, 'Direct finalizer client error must be null');
      assert.equal(directFirst.c.clientError, null, 'Composition client error must be null');
      assert.equal(directFirst.d.result.replayed, false, 'Direct finalizer must create new reservation');
      assert.ok(directFirst.d.result.reservation_id, 'Direct finalizer must return reservation_id');
      assert.equal(
        directFirst.c.result.composition_state,
        'RECONCILIATION_REQUIRED',
        'Composition must enter RECONCILIATION_REQUIRED'
      );
      assert.equal(
        directFirst.c.result.reconciliation_reason,
        'FINALIZER_FAILURE',
        'Composition reconciliation_reason must be FINALIZER_FAILURE'
      );
      assert.equal(directFirst.c.result.replayed, false);
      assert.equal(
        directFirst.after.reconciliations[0].details?.reason,
        'FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT',
        'Reconciliation details reason must be FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT'
      );
      assertInventoryMovedOnce(directFirst.before, directFirst.after, 0);
      assert.equal(directFirst.after.bridges.length, 0, 'Zero paid composition bridges for losing composition');
    }

    // =========================================================================
    // 3b. SEQUENTIAL CONSUMED-HOLD DIFFERENT-COMMAND REGRESSION
    // =========================================================================
    // Direct finalizer commits first with command C1.
    // Subsequent composition arrives on same hold with DIFFERENT command C2.
    // Hold is non-ACTIVE (CONSUMED), so composition enters RECONCILIATION_REQUIRED / HOLD_EXPIRED.
    // =========================================================================
    {
      const fSeq = await setupPaymentAttemptFixture(12, 2);
      const directCmdSeq = randomUUID();
      const dirClientSeq = await reservationWorker.connect();
      let directResSeq;
      try {
        await dirClientSeq.query('BEGIN');
        await dirClientSeq.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
        const { rows } = await dirClientSeq.query(
          `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
          [fSeq.holdId, fSeq.quote.id, directCmdSeq]
        );
        directResSeq = rows[0];
        await dirClientSeq.query('COMMIT');
      } finally {
        dirClientSeq.release();
      }
      assert.ok(directResSeq.reservation_id, 'Direct finalizer must create reservation');
      assert.equal(directResSeq.replayed, false);

      const compCmdSeq = randomUUID();
      const compResSeq = await composePaymentReservation(compositionWorker, {
        commandId: compCmdSeq,
        paymentAttemptId: fSeq.attemptId,
      });

      assert.equal(compResSeq.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(compResSeq.reconciliationReason, 'HOLD_EXPIRED');
      assert.equal(compResSeq.reservationId, null);

      const { rows: resCount } = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fSeq.holdId]
      );
      assert.equal(resCount[0].count, 1, 'Exactly one reservation must exist');

      const bridge = await getPaymentReservation(compositionWorker, fSeq.attemptId);
      assert.equal(bridge, null, 'Losing composition must not record bridge');
    }

    // =========================================================================
    // 4. RACE CASE B: COMPOSITION WINS (SAME H / SAME C SERIALIZATION)
    // =========================================================================
    // Composition begins first for H, C; paused on gate after inserting command.
    // Concurrent direct finalizer targets SAME H, C; observed waiting on command lock.
    // Gate unlocks -> composition commits reservation and bridge.
    // Direct finalizer unblocks, returns exact replay: replayed = true, matching reservation_id.
    // Verify:
    // - ZERO 40P01, ZERO 55P03
    // - Exactly one reservation, exactly one bridge
    // - Exact inventory movement (held -1, booked +1).
    // =========================================================================
    {
      const compFirst = await runRace('POST_060_COMPOSITION_FIRST_SAME_H_SAME_C', 15, 'composition');
      assert.equal(compFirst.d.clientError, null, 'Direct finalizer client error must be null');
      assert.equal(compFirst.c.clientError, null, 'Composition client error must be null');
      assert.equal(compFirst.c.result.composition_state, 'COMMITTED');
      assert.equal(compFirst.c.result.replayed, false);
      assert.ok(compFirst.c.result.reservation_id);
      assert.equal(compFirst.d.result.replayed, true, 'Direct finalizer must return replayed = true');
      assert.equal(
        compFirst.d.result.reservation_id,
        compFirst.c.result.reservation_id,
        'Direct finalizer must return identical reservation ID'
      );
      assertInventoryMovedOnce(compFirst.before, compFirst.after, 1);
      assert.equal(compFirst.after.bridges.length, 1);
      assert.equal(compFirst.after.bridges[0].status, 'COMMITTED');

      // Exact replay of the composed result produces zero additional movement
      const replayCommand = compFirst.after.bridges[0].command_id;
      const replayAttemptId = compFirst.after.bridges[0].payment_attempt_id;
      const replay = await composePaymentReservation(compositionWorker, {
        commandId: replayCommand,
        paymentAttemptId: replayAttemptId,
      });
      assert.equal(replay.compositionState, 'COMMITTED');
      assert.equal(replay.reservationId, compFirst.c.result.reservation_id);
      assert.equal(replay.replayed, true);

      const afterReplay = await captureScopedSnapshot(fixture.owner, {
        holdId: compFirst.after.hold[0].id,
        commandId: replayCommand,
        attemptId: replayAttemptId,
      });
      assert.deepEqual(afterReplay, compFirst.after, 'Exact replay must produce zero additional effects');
    }

    // =========================================================================
    // CASE-C LOCAL HELPER: BOUNDED TRANSACTION & ACTIVE DEADLINE CLEANUP
    // =========================================================================
    const SCENARIO_DEADLINE_MS = 15000;
    const CLEANUP_DEADLINE_MS = 5000;
    const FALLBACK_RESERVE_MS = 1500; // Reserved fallback budget inside cleanup deadline

    const runWithDeadline = async (action, deadlineAt, errorFactory) => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        throw errorFactory();
      }
      let timerId;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(errorFactory());
        }, remaining);
      });
      const promise = typeof action === 'function' ? action() : action;
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timerId);
      }
    };

    const createClientTracker = () => {
      const tracked = new Map();
      return {
        track: (client, name = 'client') => {
          tracked.set(client, { name, released: false, discarded: false });
          return client;
        },
        releaseClean: (client) => {
          const entry = tracked.get(client);
          if (!entry || entry.released) return;
          entry.released = true;
          try {
            client.release();
          } catch {}
        },
        discard: (client, err = new Error('CLIENT_DISCARDED')) => {
          const entry = tracked.get(client);
          if (!entry || entry.released) return;
          entry.released = true;
          entry.discarded = true;
          try {
            client.connection?.stream?.destroy?.();
          } catch {}
          try {
            client.release(err);
          } catch {}
        },
        isReleased: (client) => tracked.get(client)?.released ?? false,
        isDiscarded: (client) => tracked.get(client)?.discarded ?? false,
      };
    };

    const assertBackendIdleAndClean = async (ownerConn, pid) => {
      const { rows } = await ownerConn.query(
        `SELECT pid, state, query, backend_xid, backend_xmin
         FROM pg_stat_activity
         WHERE pid = $1`,
        [pid]
      );
      if (rows.length === 0) return true;
      const row = rows[0];
      assert.equal(
        row.state,
        'idle',
        `Backend ${pid} must be in idle state, got '${row.state}'`
      );
      assert.equal(
        row.backend_xid,
        null,
        `Backend ${pid} must have null backend_xid, got ${row.backend_xid}`
      );
      assert.equal(
        row.backend_xmin,
        null,
        `Backend ${pid} must have null backend_xmin, got ${row.backend_xmin}`
      );
      return true;
    };

    const performFiniteCleanup = async ({
      ownerConn,
      compConn,
      compPid,
      queryState,
      compPromise,
      holdConn,
      cleanupDeadlineMs = CLEANUP_DEADLINE_MS,
      clientTracker,
      controlDelayHook = null,
    }) => {
      const cleanupStart = Date.now();
      const cleanupDeadlineAt = cleanupStart + cleanupDeadlineMs;
      const gracefulDeadlineAt = cleanupDeadlineAt - FALLBACK_RESERVE_MS;

      let cleanupStageError = null;
      let fallbackExercised = false;
      let clientDiscarded = false;
      const cleanupErrors = [];

      try {
        // Step 1: Control stage (rollback holdConn and execute controlDelayHook if set)
        if (holdConn) {
          await runWithDeadline(
            holdConn.query('ROLLBACK'),
            gracefulDeadlineAt,
            () => new Error('CLEANUP_HOLD_ROLLBACK_TIMEOUT')
          );
        }
        if (typeof controlDelayHook === 'function') {
          await runWithDeadline(
            controlDelayHook(),
            gracefulDeadlineAt,
            () => new Error('CLEANUP_CONTROL_STAGE_TIMEOUT')
          );
        }

        // Step 2: Graceful cancellation & query settlement
        if (!queryState.settled) {
          queryState.cancelled = true;
          await runWithDeadline(
            ownerConn.query('SELECT pg_cancel_backend($1)', [compPid]),
            gracefulDeadlineAt,
            () => new Error('CLEANUP_CANCELLATION_QUERY_TIMEOUT')
          );
          await runWithDeadline(
            compPromise,
            gracefulDeadlineAt,
            () => new Error('CLEANUP_SETTLEMENT_TIMEOUT')
          );
        }

        // Step 3: Rollback composition transaction
        await runWithDeadline(
          compConn.query('ROLLBACK'),
          gracefulDeadlineAt,
          () => new Error('CLEANUP_ROLLBACK_TIMEOUT')
        );

        // Step 4: Verify backend idle and clean
        await runWithDeadline(
          assertBackendIdleAndClean(ownerConn, compPid),
          gracefulDeadlineAt,
          () => new Error('CLEANUP_VERIFICATION_TIMEOUT')
        );
      } catch (err) {
        fallbackExercised = true;
        cleanupStageError = err;
        cleanupErrors.push(err);

        // Fallback: bounded by remaining budget up to cleanupDeadlineAt
        try {
          clientDiscarded = true;
          clientTracker.discard(compConn, cleanupStageError);

          await runWithDeadline(
            (async () => {
              await ownerConn.query('SELECT pg_terminate_backend($1)', [compPid]).catch(() => {});
              if (!queryState.settled && compPromise) {
                await compPromise.catch(() => {});
              }
              await waitFor(async () => {
                const r = await ownerConn.query(
                  'SELECT pid, state, backend_xid FROM pg_stat_activity WHERE pid = $1',
                  [compPid]
                );
                return (
                  r.rows.length === 0 ||
                  (r.rows[0].state === 'idle' && r.rows[0].backend_xid === null)
                );
              }, 'backend cleanup after fallback', Math.max(100, cleanupDeadlineAt - Date.now()));
            })(),
            cleanupDeadlineAt,
            () => new Error('CLEANUP_FALLBACK_DEADLINE_EXCEEDED')
          );
        } catch (fallbackErr) {
          cleanupErrors.push(fallbackErr);
        }
      }

      const cleanupDurationMs = Date.now() - cleanupStart;
      assert.ok(
        cleanupDurationMs <= cleanupDeadlineMs,
        `Cleanup exceeded declared deadline: ${cleanupDurationMs}ms > ${cleanupDeadlineMs}ms`
      );

      return {
        cleanupDurationMs,
        fallbackExercised,
        clientDiscarded,
        cleanupStageError,
        cleanupErrors,
      };
    };

    // =========================================================================
    // 5. RACE CASE C: HOLD EXPIRY WHILE WAITING ON LOCK
    // =========================================================================
    // Hold is fresh and unexpired when test starts (verified clock_timestamp() < expires_at).
    // Independent connection holds booking_holds(id) FOR UPDATE.
    // Composition starts in an explicit transaction; observed blocked on booking_holds lock.
    // While blocked, query database time until clock_timestamp() > expires_at.
    // Release lock -> finalizer post-lock clock_timestamp() check rejects with RESERVATION_HOLD_EXPIRED.
    // Composition reconciles HOLD_EXPIRED.
    // Verify:
    // - Explicit transaction on compExpiryConn with lock_timeout '8s' and statement_timeout '12s'.
    // - Effective timeouts verified on compExpiryConn prior to invocation.
    // - Normal path validation of domain result RECONCILIATION_REQUIRED / HOLD_EXPIRED.
    // - COMMIT issued only on successful normal path.
    // - Scoped snapshot shows zero new allocation, capture evidence preserved.
    // - In the event of failure, bounded cleanup cancels query and rolls back.
    // =========================================================================
    {
      const scenarioStart = Date.now();
      const scenarioDeadlineAt = scenarioStart + SCENARIO_DEADLINE_MS;
      const tracker = createClientTracker();

      const fExpiry = await runWithDeadline(
        setupPaymentAttemptFixture(20, 2),
        scenarioDeadlineAt,
        () => new Error('CASE_C_FIXTURE_SETUP_TIMEOUT')
      );
      const expiryCommand = randomUUID();

      await fixture.owner.query(
        "UPDATE booking_holds SET expires_at = clock_timestamp() + interval '2 seconds' WHERE id = $1",
        [fExpiry.holdId]
      );

      const beforeExpiry = await captureScopedSnapshot(fixture.owner, {
        holdId: fExpiry.holdId,
        commandId: expiryCommand,
        attemptId: fExpiry.attemptId,
      });

      const blockConn = tracker.track(await fixture.owner.connect(), 'blockConn');
      const compExpiryConn = tracker.track(await compositionWorker.connect(), 'compExpiryConn');
      const compPid = (await compExpiryConn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const blockPid = (await blockConn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
        cancelled: false,
      };

      let compExpiryPromise;
      let committed = false;
      let scenarioError = null;

      try {
        await blockConn.query('BEGIN');
        await blockConn.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fExpiry.holdId]);

        const startFresh = (await fixture.owner.query(
          'SELECT clock_timestamp() < expires_at AS fresh FROM booking_holds WHERE id = $1',
          [fExpiry.holdId]
        )).rows[0];
        assert.equal(startFresh.fresh, true, 'Hold must be unexpired when test starts');

        // BEGIN explicit transaction on compExpiryConn
        await compExpiryConn.query('BEGIN');
        await compExpiryConn.query("SET LOCAL lock_timeout = '8s'");
        await compExpiryConn.query("SET LOCAL statement_timeout = '12s'");

        // Verify effective settings on that SAME connection immediately before invocation
        const settingsRes = (await compExpiryConn.query(
          "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
        )).rows[0];
        assert.equal(settingsRes.lt, '8s', 'Effective lock_timeout must be 8s');
        assert.equal(settingsRes.st, '12s', 'Effective statement_timeout must be 12s');

        compExpiryPromise = compExpiryConn
          .query('SELECT * FROM canonical_compose_payment_reservation($1, $2)', [
            expiryCommand,
            fExpiry.attemptId,
          ])
          .then((r) => {
            queryState.settled = true;
            queryState.result = r.rows[0];
            return { clientError: null, result: r.rows[0] };
          })
          .catch((e) => {
            queryState.settled = true;
            queryState.clientError = { code: e.code, message: e.message };
            return { clientError: { code: e.code, message: e.message }, result: null };
          });

        const expiryWait = await waitForLockWait(
          fixture.owner,
          compPid,
          blockPid,
          'Expiry waiting on hold'
        );
        assert.ok(expiryWait, 'Composition must be observed waiting on booking_holds lock');

        const dbExpired = await waitFor(async () => {
          const r = (await fixture.owner.query(
            'SELECT clock_timestamp() AS observed_at, expires_at, clock_timestamp() > expires_at AS expired FROM booking_holds WHERE id = $1',
            [fExpiry.holdId]
          )).rows[0];
          return r.expired ? r : false;
        }, 'DB time after expiry', Math.max(100, scenarioDeadlineAt - Date.now()));
        assert.ok(dbExpired, 'DB clock must cross expires_at while composition is waiting');

        await blockConn.query('COMMIT');
        const compExpiryRes = await runWithDeadline(
          compExpiryPromise,
          scenarioDeadlineAt,
          () => new Error('CASE_C_COMPOSITION_SETTLEMENT_TIMEOUT')
        );

        // Normal-path validation
        assert.equal(compExpiryRes.clientError, null, 'Composition client error must be null');
        assert.equal(
          compExpiryRes.result.composition_state,
          'RECONCILIATION_REQUIRED',
          'Composition state must be RECONCILIATION_REQUIRED'
        );
        assert.equal(
          compExpiryRes.result.reconciliation_reason,
          'HOLD_EXPIRED',
          'Reconciliation reason must be HOLD_EXPIRED'
        );
        assert.equal(compExpiryRes.result.replayed, false, 'replayed must be false');

        // COMMIT only on the successful intended test path
        await compExpiryConn.query('COMMIT');
        committed = true;

        // Verify durable state from owner connection after commit
        const afterExpiry = await captureScopedSnapshot(fixture.owner, {
          holdId: fExpiry.holdId,
          commandId: expiryCommand,
          attemptId: fExpiry.attemptId,
        });
        assertNoNewAllocation(beforeExpiry, afterExpiry);

        assert.equal(afterExpiry.reconciliations[0].reason, 'HOLD_EXPIRED');
        assert.equal(afterExpiry.reconciliations[0].details?.error_message, 'RESERVATION_HOLD_EXPIRED');
        assert.equal(afterExpiry.reconciliations[0].details?.error_code, 'P0001');
        assert.equal(afterExpiry.attempt[0].payment_state, 'RECONCILIATION_REQUIRED');
        assert.equal(afterExpiry.attempt[0].reconciliation_reason, 'HOLD_EXPIRED');
        assert.ok(afterExpiry.attempt[0].matched_at, 'matched_at must be preserved');

        await assertBackendIdleAndClean(fixture.owner, compPid);

        const scenarioDurationMs = Date.now() - scenarioStart;
        assert.ok(
          scenarioDurationMs <= SCENARIO_DEADLINE_MS,
          `Case C scenario duration exceeded bound: ${scenarioDurationMs}ms > ${SCENARIO_DEADLINE_MS}ms`
        );
      } catch (err) {
        scenarioError = err;
      } finally {
        let cleanupError = null;
        if (!committed) {
          try {
            await performFiniteCleanup({
              ownerConn: fixture.owner,
              compConn: compExpiryConn,
              compPid,
              queryState,
              compPromise: compExpiryPromise,
              holdConn: blockConn,
              clientTracker: tracker,
            });
          } catch (err) {
            cleanupError = err;
          }
        }
        tracker.releaseClean(blockConn);
        if (!tracker.isDiscarded(compExpiryConn)) {
          tracker.releaseClean(compExpiryConn);
        }

        if (scenarioError && cleanupError) {
          throw new AggregateError([scenarioError, cleanupError], 'Case C scenario and cleanup both failed');
        } else if (scenarioError) {
          throw scenarioError;
        } else if (cleanupError) {
          throw cleanupError;
        }
      }
    }

    // =========================================================================
    // 5b. RACE CASE C2: DELIBERATE OBSERVATION FAILURE & IMMEDIATE CANCELLATION CLEANUP
    // =========================================================================
    // Exercises the exact same operation/cleanup path.
    // Demonstrates that observation failure cannot leave cleanup stuck when releasing
    // the hold locker is insufficient (blocked on secondary retained inventory blocker).
    // Immediate cancellation path: pg_cancel_backend settles query promptly with 57014.
    // Fallback is NOT exercised. Client is released cleanly.
    // =========================================================================
    {
      const scenarioStart = Date.now();
      const scenarioDeadlineAt = scenarioStart + SCENARIO_DEADLINE_MS;
      const tracker = createClientTracker();

      const fFail = await runWithDeadline(
        setupPaymentAttemptFixture(60, 2),
        scenarioDeadlineAt,
        () => new Error('CASE_C2_FIXTURE_SETUP_TIMEOUT')
      );
      const failCommand = randomUUID();

      const beforeFail = await captureScopedSnapshot(fixture.owner, {
        holdId: fFail.holdId,
        commandId: failCommand,
        attemptId: fFail.attemptId,
      });

      const holdLocker = tracker.track(await fixture.owner.connect(), 'holdLocker');
      const inventoryLocker = tracker.track(await fixture.owner.connect(), 'inventoryLocker');
      const compFailConn = tracker.track(await compositionWorker.connect(), 'compFailConn');

      const holdLockerPid = (await holdLocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const invLockerPid = (await inventoryLocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const compFailPid = (await compFailConn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
        cancelled: false,
      };

      let compFailPromise;
      let caughtInjectedError = null;
      let cleanupRes = null;
      let cleanupError = null;
      let secondaryBlockObserved = false;

      try {
        await holdLocker.query('BEGIN');
        await holdLocker.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fFail.holdId]);

        await inventoryLocker.query('BEGIN');
        await inventoryLocker.query(
          `SELECT room_type_id, calendar_date FROM inventory_days
           WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 FOR UPDATE`,
          [fFail.checkIn, fFail.checkOut]
        );

        // BEGIN explicit transaction on compFailConn
        await compFailConn.query('BEGIN');
        await compFailConn.query("SET LOCAL lock_timeout = '8s'");
        await compFailConn.query("SET LOCAL statement_timeout = '12s'");

        const settingsFail = (await compFailConn.query(
          "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
        )).rows[0];
        assert.equal(settingsFail.lt, '8s', 'Effective lock_timeout must be 8s');
        assert.equal(settingsFail.st, '12s', 'Effective statement_timeout must be 12s');

        compFailPromise = compFailConn
          .query('SELECT * FROM canonical_compose_payment_reservation($1, $2)', [
            failCommand,
            fFail.attemptId,
          ])
          .then((r) => {
            queryState.settled = true;
            queryState.result = r.rows[0];
            return { clientError: null, result: r.rows[0] };
          })
          .catch((e) => {
            queryState.settled = true;
            queryState.clientError = { code: e.code, message: e.message };
            return { clientError: { code: e.code, message: e.message }, result: null };
          });

        // 1. Observe blocking on holdLocker
        const holdWait = await waitForLockWait(
          fixture.owner,
          compFailPid,
          holdLockerPid,
          'Comp waiting on holdLocker'
        );
        assert.ok(holdWait, 'Composition must wait on hold locker');

        // 2. Commit holdLocker -> composition enters direct finalizer and hits inventoryLocker
        await holdLocker.query('COMMIT');

        // 3. Observe blocking on secondary retained inventory blocker
        const invWait = await waitForLockWait(
          fixture.owner,
          compFailPid,
          invLockerPid,
          'Comp waiting on inventoryLocker'
        );
        assert.ok(invWait, 'Composition must wait on secondary inventory locker');
        secondaryBlockObserved = true;

        // 4. Inject distinctive observation failure
        throw new Error('INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST');
      } catch (err) {
        caughtInjectedError = err;

        try {
          cleanupRes = await performFiniteCleanup({
            ownerConn: fixture.owner,
            compConn: compFailConn,
            compPid: compFailPid,
            queryState,
            compPromise: compFailPromise,
            holdConn: holdLocker,
            cleanupDeadlineMs: CLEANUP_DEADLINE_MS,
            clientTracker: tracker,
          });
        } catch (cErr) {
          cleanupError = cErr;
        }
      } finally {
        await inventoryLocker.query('ROLLBACK').catch(() => {});
        tracker.releaseClean(inventoryLocker);
        tracker.releaseClean(holdLocker);
        if (!tracker.isDiscarded(compFailConn)) {
          tracker.releaseClean(compFailConn);
        }
      }

      if (cleanupError) {
        throw new AggregateError(
          [caughtInjectedError, cleanupError],
          'Case C2 cleanup failed unexpectedly during failure regression'
        );
      }

      assert.ok(caughtInjectedError, 'Injected observation failure must be caught');
      assert.equal(
        caughtInjectedError.message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST',
        'Exact injected observation failure message must match'
      );
      assert.equal(secondaryBlockObserved, true, 'Secondary blocking relationship must be observed');
      assert.equal(cleanupRes.fallbackExercised, false, 'Graceful immediate cancellation must not exercise fallback');
      assert.equal(cleanupRes.clientDiscarded, false, 'Client must not be discarded on graceful cleanup');
      assert.ok(
        cleanupRes.cleanupDurationMs <= CLEANUP_DEADLINE_MS,
        `Cleanup must finish within declared deadline (${cleanupRes.cleanupDurationMs}ms <= ${CLEANUP_DEADLINE_MS}ms)`
      );
      assert.equal(queryState.settled, true, 'Operation promise must settle');
      assert.equal(
        queryState.clientError?.code,
        '57014',
        'PostgreSQL error code must be 57014 (query_canceled)'
      );

      // Scoped database snapshot matches prepared baseline
      const afterFail = await captureScopedSnapshot(fixture.owner, {
        holdId: fFail.holdId,
        commandId: failCommand,
        attemptId: fFail.attemptId,
      });
      assert.deepEqual(
        afterFail,
        beforeFail,
        'Scoped database snapshot must match baseline exactly after rollback'
      );
      assert.equal(afterFail.reservations.length, 0, 'Zero reservations survive');
      assert.equal(afterFail.bridges.length, 0, 'Zero bridges survive');
      assert.equal(afterFail.reconciliations.length, 0, 'Zero reconciliations survive');
      assert.equal(afterFail.attempt.length, 1, 'Payment attempt evidence remains');
      assert.equal(afterFail.attempt[0].payment_state, 'MATCHED_CAPTURE', 'Payment attempt state remains MATCHED_CAPTURE');

      const scenarioDurationMs = Date.now() - scenarioStart;
      assert.ok(
        scenarioDurationMs <= SCENARIO_DEADLINE_MS,
        `Case C2 scenario duration exceeded bound: ${scenarioDurationMs}ms > ${SCENARIO_DEADLINE_MS}ms`
      );
    }

    // =========================================================================
    // 5c. RACE CASE C3: DELIBERATE DELAYED-CONTROL & FALLBACK CLEANUP REGRESSION
    // =========================================================================
    // Tests that when the cleanup control path is delayed (e.g. by 5.2s), the active
    // deadline cuts off the delayed control work at 3.5s (before the 5.0s total cleanup deadline),
    // and exercises fallback: client is discarded, server backend is terminated,
    // transaction is rolled back, baseline restored, with both the original observation
    // error and the cleanup stage timeout error preserved and identifiable.
    // =========================================================================
    {
      const scenarioStart = Date.now();
      const scenarioDeadlineAt = scenarioStart + SCENARIO_DEADLINE_MS;
      const tracker = createClientTracker();

      const fDelay = await runWithDeadline(
        setupPaymentAttemptFixture(70, 2),
        scenarioDeadlineAt,
        () => new Error('CASE_C3_FIXTURE_SETUP_TIMEOUT')
      );
      const delayCommand = randomUUID();

      const beforeDelay = await captureScopedSnapshot(fixture.owner, {
        holdId: fDelay.holdId,
        commandId: delayCommand,
        attemptId: fDelay.attemptId,
      });

      const holdLocker = tracker.track(await fixture.owner.connect(), 'holdLocker');
      const inventoryLocker = tracker.track(await fixture.owner.connect(), 'inventoryLocker');
      const compDelayConn = tracker.track(await compositionWorker.connect(), 'compDelayConn');

      const holdLockerPid = (await holdLocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const invLockerPid = (await inventoryLocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const compDelayPid = (await compDelayConn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
        cancelled: false,
      };

      let compDelayPromise;
      let caughtInjectedError = null;
      let cleanupRes = null;
      let cleanupError = null;
      let secondaryBlockObserved = false;

      try {
        await holdLocker.query('BEGIN');
        await holdLocker.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fDelay.holdId]);

        await inventoryLocker.query('BEGIN');
        await inventoryLocker.query(
          `SELECT room_type_id, calendar_date FROM inventory_days
           WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 FOR UPDATE`,
          [fDelay.checkIn, fDelay.checkOut]
        );

        // BEGIN explicit transaction on compDelayConn
        await compDelayConn.query('BEGIN');
        await compDelayConn.query("SET LOCAL lock_timeout = '8s'");
        await compDelayConn.query("SET LOCAL statement_timeout = '12s'");

        const settingsDelay = (await compDelayConn.query(
          "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
        )).rows[0];
        assert.equal(settingsDelay.lt, '8s', 'Effective lock_timeout must be 8s');
        assert.equal(settingsDelay.st, '12s', 'Effective statement_timeout must be 12s');

        compDelayPromise = compDelayConn
          .query('SELECT * FROM canonical_compose_payment_reservation($1, $2)', [
            delayCommand,
            fDelay.attemptId,
          ])
          .then((r) => {
            queryState.settled = true;
            queryState.result = r.rows[0];
            return { clientError: null, result: r.rows[0] };
          })
          .catch((e) => {
            queryState.settled = true;
            queryState.clientError = { code: e.code, message: e.message };
            return { clientError: { code: e.code, message: e.message }, result: null };
          });

        // 1. Observe blocking on holdLocker
        const holdWait = await waitForLockWait(
          fixture.owner,
          compDelayPid,
          holdLockerPid,
          'Comp waiting on holdLocker'
        );
        assert.ok(holdWait, 'Composition must wait on hold locker');

        // 2. Commit holdLocker -> composition enters direct finalizer and hits inventoryLocker
        await holdLocker.query('COMMIT');

        // 3. Observe blocking on secondary retained inventory blocker
        const invWait = await waitForLockWait(
          fixture.owner,
          compDelayPid,
          invLockerPid,
          'Comp waiting on inventoryLocker'
        );
        assert.ok(invWait, 'Composition must wait on secondary inventory locker');
        secondaryBlockObserved = true;

        // 4. Inject distinctive observation failure
        throw new Error('INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST');
      } catch (err) {
        caughtInjectedError = err;

        try {
          cleanupRes = await performFiniteCleanup({
            ownerConn: fixture.owner,
            compConn: compDelayConn,
            compPid: compDelayPid,
            queryState,
            compPromise: compDelayPromise,
            holdConn: holdLocker,
            cleanupDeadlineMs: CLEANUP_DEADLINE_MS,
            clientTracker: tracker,
            controlDelayHook: () => new Promise((resolve) => setTimeout(resolve, 5200)),
          });
        } catch (cErr) {
          cleanupError = cErr;
        }
      } finally {
        await inventoryLocker.query('ROLLBACK').catch(() => {});
        tracker.releaseClean(inventoryLocker);
        tracker.releaseClean(holdLocker);
        if (!tracker.isDiscarded(compDelayConn)) {
          tracker.releaseClean(compDelayConn);
        }
      }

      if (cleanupError) {
        throw new AggregateError(
          [caughtInjectedError, cleanupError],
          'Case C3 fallback failed unexpectedly during delayed-control regression'
        );
      }

      // Assertions on the delayed-control / fallback regression:
      assert.ok(caughtInjectedError, 'Injected observation failure must be caught');
      assert.equal(
        caughtInjectedError.message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST',
        'Exact injected observation failure message must match'
      );
      assert.equal(secondaryBlockObserved, true, 'Secondary blocking relationship must be observed');
      assert.equal(cleanupRes.fallbackExercised, true, 'Fallback must be exercised when control stage times out');
      assert.equal(cleanupRes.clientDiscarded, true, 'Client must be discarded on fallback');
      assert.equal(
        cleanupRes.cleanupStageError?.message,
        'CLEANUP_CONTROL_STAGE_TIMEOUT',
        'Cleanup stage error must be CLEANUP_CONTROL_STAGE_TIMEOUT'
      );
      assert.ok(
        cleanupRes.cleanupDurationMs <= CLEANUP_DEADLINE_MS,
        `Cleanup must finish within declared deadline (${cleanupRes.cleanupDurationMs}ms <= ${CLEANUP_DEADLINE_MS}ms)`
      );
      assert.ok(
        cleanupRes.cleanupDurationMs >= 3000,
        `Cleanup duration must reflect graceful budget exhaustion before fallback (${cleanupRes.cleanupDurationMs}ms >= 3000ms)`
      );
      assert.ok(
        cleanupRes.cleanupDurationMs < 5000,
        `Cleanup duration must be strictly less than total cleanup bound (${cleanupRes.cleanupDurationMs}ms < 5000ms)`
      );

      // Scoped database snapshot matches prepared baseline
      const afterDelay = await captureScopedSnapshot(fixture.owner, {
        holdId: fDelay.holdId,
        commandId: delayCommand,
        attemptId: fDelay.attemptId,
      });
      assert.deepEqual(
        afterDelay,
        beforeDelay,
        'Scoped database snapshot must match baseline exactly after fallback cleanup'
      );
      assert.equal(afterDelay.reservations.length, 0, 'Zero reservations survive');
      assert.equal(afterDelay.bridges.length, 0, 'Zero bridges survive');
      assert.equal(afterDelay.reconciliations.length, 0, 'Zero reconciliations survive');
      assert.equal(afterDelay.attempt.length, 1, 'Payment attempt evidence remains');
      assert.equal(afterDelay.attempt[0].payment_state, 'MATCHED_CAPTURE', 'Payment attempt state remains MATCHED_CAPTURE');

      const scenarioDurationMs = Date.now() - scenarioStart;
      assert.ok(
        scenarioDurationMs <= SCENARIO_DEADLINE_MS,
        `Case C3 scenario duration exceeded bound: ${scenarioDurationMs}ms > ${SCENARIO_DEADLINE_MS}ms`
      );
    }

    // =========================================================================
    // 6. RACE CASE D: RELEASED / NON-ACTIVE HOLD
    // =========================================================================
    // Hold was set to RELEASED by test fixture preparation.
    // Finalizer rejects with RESERVATION_HOLD_NOT_ACTIVE.
    // Composition maps RESERVATION_HOLD_NOT_ACTIVE to HOLD_EXPIRED (pre-060 contract).
    // Verify:
    // - RECONCILIATION_REQUIRED / HOLD_EXPIRED
    // - No reservation, no bridge, no inventory resurrection.
    // =========================================================================
    {
      const fReleased = await setupPaymentAttemptFixture(25, 2);
      const releasedCommand = randomUUID();

      // Owner sets RELEASED before baseline snapshot; fixture preparation only
      await fixture.owner.query(
        "UPDATE booking_holds SET status = 'RELEASED', released_at = clock_timestamp(), release_reason = 'TEST_FIXTURE_PREPARATION' WHERE id = $1",
        [fReleased.holdId]
      );

      const beforeReleased = await captureScopedSnapshot(fixture.owner, {
        holdId: fReleased.holdId,
        commandId: releasedCommand,
        attemptId: fReleased.attemptId,
      });

      const resReleased = await composePaymentReservation(compositionWorker, {
        commandId: releasedCommand,
        paymentAttemptId: fReleased.attemptId,
      });

      const afterReleased = await captureScopedSnapshot(fixture.owner, {
        holdId: fReleased.holdId,
        commandId: releasedCommand,
        attemptId: fReleased.attemptId,
      });
      assertNoNewAllocation(beforeReleased, afterReleased);

      assert.equal(resReleased.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(resReleased.reconciliationReason, 'HOLD_EXPIRED');
      assert.equal(resReleased.reservationId, null);
      assert.equal(afterReleased.reconciliations[0].reason, 'HOLD_EXPIRED');
      assert.equal(
        afterReleased.reconciliations[0].details?.error_message,
        'RESERVATION_HOLD_NOT_ACTIVE'
      );
      assert.equal(afterReleased.reconciliations[0].details?.error_code, 'P0001');

      const { rows: resCount } = await fixture.owner.query(
        'SELECT count(*)::int AS count FROM canonical_reservations WHERE hold_id = $1',
        [fReleased.holdId]
      );
      assert.equal(resCount[0].count, 0);
    }

    // =========================================================================
    // 7. REPLAY CASES
    // =========================================================================
    // 7a. Changed command for composed attempt throws PAYMENT_ALREADY_COMPOSED
    // 7b. Changed attempt for composed command throws COMPOSITION_COMMAND_CONFLICT
    // 7c. Outside-composition finalizer replay rejected:
    //     If direct finalizer ran for command C outside composition, composition
    //     cannot adopt it -> RECONCILIATION_REQUIRED / FINALIZER_FAILURE
    //     with reason FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.
    // =========================================================================
    {
      const fReplay = await setupPaymentAttemptFixture(35, 2);
      const commandId = randomUUID();

      const initial = await composePaymentReservation(compositionWorker, {
        commandId,
        paymentAttemptId: fReplay.attemptId,
      });
      assert.equal(initial.compositionState, 'COMMITTED');
      assert.equal(initial.replayed, false);

      // 7a. Different command, same payment attempt
      await assert.rejects(
        composePaymentReservation(compositionWorker, {
          commandId: randomUUID(),
          paymentAttemptId: fReplay.attemptId,
        }),
        /PAYMENT_ALREADY_COMPOSED/
      );

      // 7b. Same command, different payment attempt
      const fOther = await setupPaymentAttemptFixture(40, 2);
      await assert.rejects(
        composePaymentReservation(compositionWorker, {
          commandId,
          paymentAttemptId: fOther.attemptId,
        }),
        /COMPOSITION_COMMAND_CONFLICT/
      );

      // 7c. Outside-composition finalizer replay
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

      const unadoptedRes = await composePaymentReservation(compositionWorker, {
        commandId: commandOut,
        paymentAttemptId: fOut.attemptId,
      });

      assert.equal(unadoptedRes.compositionState, 'RECONCILIATION_REQUIRED');
      assert.equal(unadoptedRes.reconciliationReason, 'FINALIZER_FAILURE');

      const recs = await getPaymentReconciliations(paymentWorker, fOut.attemptId);
      const replayRec = recs.find((r) => r.reason === 'FINALIZER_FAILURE');
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
    // Test owner injects failure on canonical_payment_reservations insert with P7777.
    // Composition fails, rolling back entire outer transaction including finalizer effects.
    // Verify:
    // - Error cause is exact P7777 / REVIEW_BRIDGE_FAILURE_AFTER_FINALIZER
    // - Scoped snapshot before vs after is completely identical.
    // =========================================================================
    {
      const fBridgeFail = await setupPaymentAttemptFixture(50, 2);
      const bridgeFailCommand = randomUUID();
      const beforeBridgeFail = await captureScopedSnapshot(fixture.owner, {
        holdId: fBridgeFail.holdId,
        commandId: bridgeFailCommand,
        attemptId: fBridgeFail.attemptId,
      });

      await fixture.owner.query(`
        CREATE OR REPLACE FUNCTION review_fail_bridge() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM canonical_reservations WHERE id = NEW.reservation_id) THEN
            RAISE EXCEPTION 'REVIEW_BRIDGE_REACHED_WITHOUT_RESERVATION';
          END IF;
          RAISE EXCEPTION 'REVIEW_BRIDGE_FAILURE_AFTER_FINALIZER' USING ERRCODE = 'P7777';
        END $$;

        DROP TRIGGER IF EXISTS review_bridge_failure ON canonical_payment_reservations;
        CREATE TRIGGER review_bridge_failure
          BEFORE INSERT ON canonical_payment_reservations
          FOR EACH ROW EXECUTE FUNCTION review_fail_bridge();
      `);

      let caughtBridgeFail;
      try {
        await composePaymentReservation(compositionWorker, {
          commandId: bridgeFailCommand,
          paymentAttemptId: fBridgeFail.attemptId,
        });
      } catch (err) {
        caughtBridgeFail = err;
      } finally {
        await fixture.owner.query(`
          DROP TRIGGER IF EXISTS review_bridge_failure ON canonical_payment_reservations;
          DROP FUNCTION IF EXISTS review_fail_bridge();
        `);
      }

      assert.ok(caughtBridgeFail, 'Bridge failure must be thrown');
      assert.equal(caughtBridgeFail.cause?.code, 'P7777', 'Error code must match injected P7777');
      assert.equal(
        caughtBridgeFail.cause?.message,
        'REVIEW_BRIDGE_FAILURE_AFTER_FINALIZER',
        'Error message must match injected REVIEW_BRIDGE_FAILURE_AFTER_FINALIZER'
      );

      const afterBridgeFail = await captureScopedSnapshot(fixture.owner, {
        holdId: fBridgeFail.holdId,
        commandId: bridgeFailCommand,
        attemptId: fBridgeFail.attemptId,
      });
      assert.deepEqual(
        afterBridgeFail,
        beforeBridgeFail,
        'Entire outer transaction effects must be rolled back'
      );
    }

    // =========================================================================
    // 9. ROLE ISOLATION POST-060
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
    if (fixture?.owner) {
      await teardownCommandGate(fixture.owner).catch(() => {});
    }
    if (stays) await stays.end();
    if (reservationWorker) await reservationWorker.end();
    if (compositionWorker) await compositionWorker.end();
    if (paymentWorker) await paymentWorker.end();
    if (cancellationExecutor) await cancellationExecutor.end();
    await fixture?.close();
  }
});
