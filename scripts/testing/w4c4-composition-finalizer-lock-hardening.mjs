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

    const deliberatelyDiscardedClients = new Set();
    const unexpectedPoolErrors = [];

    for (const [name, p] of Object.entries({
      owner: fixture.owner,
      stays,
      reservationWorker,
      compositionWorker,
      paymentWorker,
      cancellationExecutor,
    })) {
      p.on('error', (err, client) => {
        if (client && deliberatelyDiscardedClients.has(client)) {
          // Expected disposal event on a deliberately discarded client
          return;
        }
        unexpectedPoolErrors.push({ pool: name, error: err, client });
      });
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
    const setupPaymentAttemptFixture = async (offsetDays = 10, nights = 2, ownerClient = fixture.owner) => {
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
      await ownerClient.query(
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

    class HarnessDeadlineError extends Error {
      constructor(message = 'HARNESS_DEADLINE_EXCEEDED', details = {}) {
        super(message);
        this.name = 'HarnessDeadlineError';
        this.code = 'HARNESS_DEADLINE_EXCEEDED';
        this.details = details;
      }
    }

    const runWithDeadline = async (startFn, deadlineAt, errorFactory) => {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        throw errorFactory ? errorFactory() : new HarnessDeadlineError('HARNESS_DEADLINE_EXCEEDED');
      }
      let timerId;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(errorFactory ? errorFactory() : new HarnessDeadlineError('HARNESS_DEADLINE_EXCEEDED'));
        }, remaining);
      });
      try {
        const promise = startFn();
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timerId);
      }
    };

    const createClientTracker = (deliberatelyDiscardedSet) => {
      const entries = new Map();

      const acquire = async (pool, roleName, deadlineAt) => {
        return await runWithDeadline(
          async () => {
            const client = await pool.connect();
            const pidRes = await client.query('SELECT pg_backend_pid() AS pid');
            const pid = pidRes.rows[0].pid;
            const entry = {
              client,
              roleName,
              pid,
              state: 'active',
              discardErr: null,
            };
            entries.set(client, entry);
            return client;
          },
          deadlineAt,
          () => new HarnessDeadlineError(`CLIENT_ACQUISITION_TIMEOUT: ${roleName}`)
        );
      };

      const getPid = (client) => entries.get(client)?.pid;
      const getRole = (client) => entries.get(client)?.roleName;

      const releaseClean = (client) => {
        const entry = entries.get(client);
        if (!entry) {
          throw new Error('CLIENT_UNTRACKED: Cannot release untracked client');
        }
        if (entry.state === 'released') {
          throw new Error(`CLIENT_DOUBLE_RELEASE: Client ${entry.roleName} (pid ${entry.pid}) already released`);
        }
        if (entry.state === 'discarded') {
          throw new Error(`CLIENT_STATE_CONFLICT: Client ${entry.roleName} (pid ${entry.pid}) already discarded`);
        }
        entry.state = 'released';
        entry.client.release();
      };

      const discard = (client, err = new Error('CLIENT_DISCARDED')) => {
        const entry = entries.get(client);
        if (!entry) {
          throw new Error('CLIENT_UNTRACKED: Cannot discard untracked client');
        }
        if (entry.state === 'released') {
          throw new Error(`CLIENT_STATE_CONFLICT: Client ${entry.roleName} (pid ${entry.pid}) already cleanly released`);
        }
        if (entry.state === 'discarded') {
          return;
        }
        entry.state = 'discarded';
        entry.discardErr = err;
        deliberatelyDiscardedSet.add(entry.client);
        try {
          entry.client.connection?.stream?.destroy?.();
        } catch {}
        try {
          entry.client.release(err);
        } catch {}
      };

      const isReleased = (client) => entries.get(client)?.state === 'released';
      const isDiscarded = (client) => entries.get(client)?.state === 'discarded';

      const assertAllAccountedFor = () => {
        const unaccounted = [];
        for (const [, entry] of entries) {
          if (entry.state !== 'released' && entry.state !== 'discarded') {
            unaccounted.push(`${entry.roleName} (pid ${entry.pid}, state ${entry.state})`);
          }
        }
        if (unaccounted.length > 0) {
          throw new Error(`CLIENT_ACCOUNTING_INCOMPLETE: Unaccounted clients: ${unaccounted.join(', ')}`);
        }
      };

      return {
        acquire,
        getPid,
        getRole,
        releaseClean,
        discard,
        isReleased,
        isDiscarded,
        assertAllAccountedFor,
      };
    };

    const createTrackedQueryAdapter = (client) => {
      let chain = Promise.resolve();
      return {
        query: (sql, args) => {
          const next = chain.then(() => client.query(sql, args));
          chain = next.catch(() => {});
          return next;
        },
      };
    };

    const verifyBackendsCleanOrAbsent = async (cancellationConn, pidsToVerify, deadlineAt) => {
      return await runWithDeadline(
        async () => {
          const results = {};
          for (const { pid, role } of pidsToVerify) {
            const { rows } = await cancellationConn.query(
              `SELECT pid, state, query, backend_xid, backend_xmin
               FROM pg_stat_activity
               WHERE pid = $1`,
              [pid]
            );
            if (rows.length === 0) {
              results[role] = { pid, status: 'ABSENT' };
            } else {
              const row = rows[0];
              assert.equal(
                row.state,
                'idle',
                `Backend ${pid} (${role}) must be idle, got '${row.state}'`
              );
              assert.equal(
                row.backend_xid,
                null,
                `Backend ${pid} (${role}) must have null backend_xid, got ${row.backend_xid}`
              );
              assert.equal(
                row.backend_xmin,
                null,
                `Backend ${pid} (${role}) must have null backend_xmin, got ${row.backend_xmin}`
              );
              results[role] = { pid, status: 'IDLE_CLEAN' };
            }
          }
          return results;
        },
        deadlineAt,
        () => new HarnessDeadlineError('BACKEND_VERIFICATION_TIMEOUT')
      );
    };

    class CaseLocalCoordinator {
      constructor({
        scenarioName,
        fixture: coordFixture,
        compositionWorker: coordCompWorker,
        deliberatelyDiscardedSet,
        scenarioDeadlineMs = SCENARIO_DEADLINE_MS,
        cleanupDeadlineMs = CLEANUP_DEADLINE_MS,
        fallbackReserveMs = FALLBACK_RESERVE_MS,
      }) {
        this.scenarioName = scenarioName;
        this.fixture = coordFixture;
        this.compositionWorker = coordCompWorker;
        this.scenarioDeadlineMs = scenarioDeadlineMs;
        this.cleanupDeadlineMs = cleanupDeadlineMs;
        this.fallbackReserveMs = fallbackReserveMs;

        this.scenarioStart = Date.now();
        this.scenarioDeadlineAt = this.scenarioStart + this.scenarioDeadlineMs;
        this.normalDeadlineAt = this.scenarioDeadlineAt - this.cleanupDeadlineMs;
        this.tracker = createClientTracker(deliberatelyDiscardedSet);

        this.operations = new Map();
        this.unsettledWork = new Set();
      }

      async runOperation(name, startFn, { owningClient = null, cancel = null, deadlineAt = this.normalDeadlineAt } = {}) {
        let op = this.operations.get(name);
        if (!op) {
          op = {
            name,
            owningClient,
            cancel,
            started: false,
            settled: false,
            result: null,
            error: null,
            promise: null,
          };
          this.operations.set(name, op);
        }

        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) {
          throw new HarnessDeadlineError(`HARNESS_DEADLINE_EXCEEDED: ${name}`);
        }

        op.started = true;
        this.unsettledWork.add(name);

        let timerId;
        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(() => {
            reject(new HarnessDeadlineError(`OPERATION_TIMEOUT: ${name}`));
          }, remaining);
        });

        try {
          const p = startFn();
          op.promise = p
            .then((res) => {
              op.settled = true;
              op.result = res;
              this.unsettledWork.delete(name);
              return res;
            })
            .catch((err) => {
              op.settled = true;
              op.error = err;
              this.unsettledWork.delete(name);
              throw err;
            });

          return await Promise.race([op.promise, timeoutPromise]);
        } finally {
          clearTimeout(timerId);
        }
      }

      async waitForCondition(name, predicateStartFn, { deadlineAt = this.normalDeadlineAt, intervalMs = 20 } = {}) {
        while (true) {
          const remaining = deadlineAt - Date.now();
          if (remaining <= 0) {
            throw new HarnessDeadlineError(`WAIT_FOR_CONDITION_TIMEOUT: ${name}`);
          }
          const matched = await this.runOperation(
            `${name}_poll_${Date.now()}`,
            predicateStartFn,
            { deadlineAt }
          );
          if (matched) {
            return matched;
          }
          await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
        }
      }

      async performFiniteCleanup({
        cancellationConn,
        observerConn,
        compConn,
        compPid,
        compPromise,
        compQueryState,
        blockers = [],
        retainedBlockers = [],
        delayedControlOp = null,
        scenarioError = null,
        committed = false,
      }) {
        const cleanupStart = Date.now();
        const cleanupDeadlineAt = Math.min(cleanupStart + this.cleanupDeadlineMs, this.scenarioDeadlineAt);
        const gracefulDeadlineAt = cleanupDeadlineAt - this.fallbackReserveMs;

        const cleanupErrors = [];
        let fallbackExercised = false;
        let clientDiscarded = false;
        let delayedControlSettled = false;

        const allBlockers = [...blockers, ...retainedBlockers];

        if (!committed) {
          try {
            // Step 1: Control stage: rollback standard blockers (e.g. holdLocker)
            for (const blocker of blockers) {
              if (!this.tracker.isReleased(blocker) && !this.tracker.isDiscarded(blocker)) {
                await runWithDeadline(
                  () => blocker.query('ROLLBACK'),
                  gracefulDeadlineAt,
                  () => new HarnessDeadlineError('CLEANUP_BLOCKER_ROLLBACK_TIMEOUT')
                );
              }
            }

            // Step 2: Delayed control query stage (if present)
            if (delayedControlOp && delayedControlOp.promise) {
              await runWithDeadline(
                () => delayedControlOp.promise,
                gracefulDeadlineAt,
                () => new HarnessDeadlineError('CLEANUP_CONTROL_STAGE_TIMEOUT')
              );
              delayedControlSettled = true;
            }

            // Step 3: Graceful cancellation & query settlement
            if (compPromise && !compQueryState.settled) {
              await runWithDeadline(
                () => cancellationConn.query('SELECT pg_cancel_backend($1)', [compPid]),
                gracefulDeadlineAt,
                () => new HarnessDeadlineError('CLEANUP_CANCELLATION_QUERY_TIMEOUT')
              );
              await runWithDeadline(
                () => compPromise,
                gracefulDeadlineAt,
                () => new HarnessDeadlineError('CLEANUP_SETTLEMENT_TIMEOUT')
              );
            }

            // Step 4: Rollback composition transaction
            if (compConn && !this.tracker.isDiscarded(compConn)) {
              await runWithDeadline(
                () => compConn.query('ROLLBACK'),
                gracefulDeadlineAt,
                () => new HarnessDeadlineError('CLEANUP_ROLLBACK_TIMEOUT')
              );
            }

            // Step 4b: Rollback retained blockers after composition settlement
            for (const blocker of retainedBlockers) {
              if (!this.tracker.isReleased(blocker) && !this.tracker.isDiscarded(blocker)) {
                await runWithDeadline(
                  () => blocker.query('ROLLBACK'),
                  gracefulDeadlineAt,
                  () => new HarnessDeadlineError('CLEANUP_RETAINED_BLOCKER_ROLLBACK_TIMEOUT')
                );
              }
            }
          } catch (gracefulErr) {
            fallbackExercised = true;
            cleanupErrors.push(gracefulErr);

            // Fallback stage: bounded by cleanupDeadlineAt
            try {
              if (delayedControlOp && !delayedControlSettled) {
                await cancellationConn.query('SELECT pg_cancel_backend($1)', [delayedControlOp.pid]).catch(() => {});
                await runWithDeadline(
                  () => delayedControlOp.promise.catch((e) => ({ clientError: e })),
                  cleanupDeadlineAt,
                  () => new HarnessDeadlineError('FALLBACK_DELAYED_CONTROL_SETTLEMENT_TIMEOUT')
                );
                delayedControlSettled = true;
              }

              if (compConn && !this.tracker.isDiscarded(compConn)) {
                clientDiscarded = true;
                this.tracker.discard(compConn, gracefulErr);

                await cancellationConn.query('SELECT pg_terminate_backend($1)', [compPid]).catch(() => {});

                if (compPromise) {
                  const outcome = await runWithDeadline(
                    () => compPromise,
                    cleanupDeadlineAt,
                    () => new HarnessDeadlineError('FALLBACK_COMPOSITION_SETTLEMENT_TIMEOUT')
                  );
                  if (outcome && outcome.clientError) {
                    compQueryState.settled = true;
                    compQueryState.clientError = outcome.clientError;
                  }
                }
              }

              for (const blocker of allBlockers) {
                if (!this.tracker.isReleased(blocker) && !this.tracker.isDiscarded(blocker)) {
                  await blocker.query('ROLLBACK').catch(() => {});
                }
              }
            } catch (fallbackErr) {
              cleanupErrors.push(fallbackErr);
            }
          }
        }

        // Step 5: Verify backends clean or absent
        const pidsToVerify = [];
        if (compPid) pidsToVerify.push({ pid: compPid, role: 'comp' });
        if (delayedControlOp?.pid) pidsToVerify.push({ pid: delayedControlOp.pid, role: 'delayedControl' });
        for (const blocker of allBlockers) {
          const pid = this.tracker.getPid(blocker);
          if (pid) pidsToVerify.push({ pid, role: this.tracker.getRole(blocker) });
        }

        let backendObservations = {};
        try {
          backendObservations = await verifyBackendsCleanOrAbsent(
            cancellationConn,
            pidsToVerify,
            cleanupDeadlineAt
          );
        } catch (backendErr) {
          cleanupErrors.push(backendErr);
        }

        // Step 6: Client release accounting
        for (const blocker of allBlockers) {
          if (!this.tracker.isReleased(blocker) && !this.tracker.isDiscarded(blocker)) {
            this.tracker.releaseClean(blocker);
          }
        }
        if (delayedControlOp?.client) {
          if (!this.tracker.isReleased(delayedControlOp.client) && !this.tracker.isDiscarded(delayedControlOp.client)) {
            this.tracker.releaseClean(delayedControlOp.client);
          }
        }
        if (compConn && !this.tracker.isDiscarded(compConn) && !this.tracker.isReleased(compConn)) {
          this.tracker.releaseClean(compConn);
        }
        if (observerConn && !this.tracker.isReleased(observerConn)) {
          this.tracker.releaseClean(observerConn);
        }
        if (cancellationConn && !this.tracker.isReleased(cancellationConn)) {
          this.tracker.releaseClean(cancellationConn);
        }

        try {
          this.tracker.assertAllAccountedFor();
        } catch (accountErr) {
          cleanupErrors.push(accountErr);
        }

        // Step 7: Combine errors
        let combinedError = null;
        if (scenarioError && cleanupErrors.length > 0) {
          combinedError = new AggregateError([scenarioError, ...cleanupErrors], 'Scenario and cleanup both failed');
        } else if (scenarioError) {
          combinedError = scenarioError;
        } else if (cleanupErrors.length > 0) {
          combinedError = cleanupErrors.length === 1 ? cleanupErrors[0] : new AggregateError(cleanupErrors, 'Cleanup failed');
        }

        const cleanupDurationMs = Date.now() - cleanupStart;

        return {
          cleanupDurationMs,
          fallbackExercised,
          clientDiscarded,
          cleanupErrors,
          combinedError,
          operationOutcomes: {
            compSettled: compQueryState ? compQueryState.settled : true,
            compClientError: compQueryState ? compQueryState.clientError : null,
            delayedControlSettled,
          },
          backendObservations,
          unsettledWork: Array.from(this.unsettledWork),
        };
      }
    }

    // =========================================================================
    // NEGATIVE CONTROL: EXPIRED BUDGET MUST REJECT WITH ZERO ACTION INVOCATIONS
    // =========================================================================
    {
      let negativeActionInvocations = 0;
      const expiredBudgetAt = Date.now() - 50;
      await assert.rejects(
        () => runWithDeadline(
          () => {
            negativeActionInvocations++;
            return Promise.resolve('SHOULD_NOT_EXECUTE');
          },
          expiredBudgetAt,
          () => new HarnessDeadlineError('NEGATIVE_CONTROL_BUDGET_EXPIRED')
        ),
        (err) => {
          assert.equal(err.name, 'HarnessDeadlineError');
          assert.equal(err.message, 'NEGATIVE_CONTROL_BUDGET_EXPIRED');
          assert.equal(negativeActionInvocations, 0, 'Expired budget must start zero actions');
          return true;
        }
      );
    }

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
    // - Coordinated cleanup consumes combinedError and throws if any cleanup error occurred.
    // =========================================================================
    {
      const coordinator = new CaseLocalCoordinator({
        scenarioName: 'CASE_C_NORMAL_EXPIRY',
        fixture,
        compositionWorker,
        deliberatelyDiscardedSet: deliberatelyDiscardedClients,
      });

      const cancellationConn = await coordinator.tracker.acquire(
        fixture.owner,
        'cancellationConn',
        coordinator.normalDeadlineAt
      );
      const observerConn = await coordinator.tracker.acquire(
        fixture.owner,
        'observerConn',
        coordinator.normalDeadlineAt
      );
      const blockConn = await coordinator.tracker.acquire(
        fixture.owner,
        'blockConn',
        coordinator.normalDeadlineAt
      );
      const compExpiryConn = await coordinator.tracker.acquire(
        compositionWorker,
        'compExpiryConn',
        coordinator.normalDeadlineAt
      );

      const compPid = coordinator.tracker.getPid(compExpiryConn);
      const blockPid = coordinator.tracker.getPid(blockConn);

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
      };

      let compExpiryPromise;
      let committed = false;
      let scenarioError = null;
      let cleanupRes = null;

      let fExpiry;
      let expiryCommand;
      let beforeExpiry;

      try {
        fExpiry = await coordinator.runOperation('setup_fixture', () =>
          setupPaymentAttemptFixture(20, 2, observerConn)
        );
        expiryCommand = randomUUID();

        await coordinator.runOperation('update_expires_at', () =>
          observerConn.query(
            "UPDATE booking_holds SET expires_at = clock_timestamp() + interval '2 seconds' WHERE id = $1",
            [fExpiry.holdId]
          )
        );

        beforeExpiry = await coordinator.runOperation('capture_before_snapshot', () =>
          captureScopedSnapshot(createTrackedQueryAdapter(observerConn), {
            holdId: fExpiry.holdId,
            commandId: expiryCommand,
            attemptId: fExpiry.attemptId,
          })
        );

        await coordinator.runOperation('block_hold_begin', () => blockConn.query('BEGIN'));
        await coordinator.runOperation('block_hold_lock', () =>
          blockConn.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fExpiry.holdId])
        );

        const startFresh = await coordinator.runOperation('assert_fresh', async () => {
          const r = (await observerConn.query(
            'SELECT clock_timestamp() < expires_at AS fresh FROM booking_holds WHERE id = $1',
            [fExpiry.holdId]
          )).rows[0];
          assert.equal(r.fresh, true, 'Hold must be unexpired when test starts');
          return r;
        });
        assert.equal(startFresh.fresh, true);

        // Explicit transaction on compExpiryConn
        await coordinator.runOperation('comp_begin', () => compExpiryConn.query('BEGIN'));
        await coordinator.runOperation('comp_set_lt', () =>
          compExpiryConn.query("SET LOCAL lock_timeout = '8s'")
        );
        await coordinator.runOperation('comp_set_st', () =>
          compExpiryConn.query("SET LOCAL statement_timeout = '12s'")
        );

        const settingsRes = await coordinator.runOperation('comp_verify_settings', async () => {
          const r = (await compExpiryConn.query(
            "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
          )).rows[0];
          assert.equal(r.lt, '8s', 'Effective lock_timeout must be 8s');
          assert.equal(r.st, '12s', 'Effective statement_timeout must be 12s');
          return r;
        });
        assert.equal(settingsRes.lt, '8s');

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
            queryState.clientError = { code: e?.code, message: e?.message };
            return { clientError: { code: e?.code, message: e?.message }, result: null };
          });

        const expiryWait = await coordinator.waitForCondition(
          'expiry_wait_on_hold',
          async () => {
            const actRes = await observerConn.query(
              `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
               FROM pg_stat_activity WHERE pid = $1`,
              [compPid]
            );
            const act = actRes.rows[0];
            if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(blockPid)) {
              return act;
            }
            return false;
          }
        );
        assert.ok(expiryWait, 'Composition must be observed waiting on booking_holds lock');

        const dbExpired = await coordinator.waitForCondition(
          'db_time_crosses_expires_at',
          async () => {
            const r = (await observerConn.query(
              'SELECT clock_timestamp() AS observed_at, expires_at, clock_timestamp() > expires_at AS expired FROM booking_holds WHERE id = $1',
              [fExpiry.holdId]
            )).rows[0];
            return r.expired ? r : false;
          }
        );
        assert.ok(dbExpired, 'DB clock must cross expires_at while composition is waiting');

        await coordinator.runOperation('release_block_conn', () => blockConn.query('COMMIT'));

        const compExpiryRes = await coordinator.runOperation(
          'await_comp_settlement',
          () => compExpiryPromise
        );

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

        await coordinator.runOperation('comp_commit', () => compExpiryConn.query('COMMIT'));
        committed = true;

        const afterExpiry = await coordinator.runOperation('capture_after_snapshot', () =>
          captureScopedSnapshot(createTrackedQueryAdapter(observerConn), {
            holdId: fExpiry.holdId,
            commandId: expiryCommand,
            attemptId: fExpiry.attemptId,
          })
        );
        assertNoNewAllocation(beforeExpiry, afterExpiry);

        assert.equal(afterExpiry.reconciliations[0].reason, 'HOLD_EXPIRED');
        assert.equal(afterExpiry.reconciliations[0].details?.error_message, 'RESERVATION_HOLD_EXPIRED');
        assert.equal(afterExpiry.reconciliations[0].details?.error_code, 'P0001');
        assert.equal(afterExpiry.attempt[0].payment_state, 'RECONCILIATION_REQUIRED');
        assert.equal(afterExpiry.attempt[0].reconciliation_reason, 'HOLD_EXPIRED');
        assert.ok(afterExpiry.attempt[0].matched_at, 'matched_at must be preserved');
      } catch (err) {
        scenarioError = err;
      } finally {
        cleanupRes = await coordinator.performFiniteCleanup({
          cancellationConn,
          observerConn,
          compConn: compExpiryConn,
          compPid,
          compPromise: compExpiryPromise,
          compQueryState: queryState,
          blockers: [blockConn],
          scenarioError,
          committed,
        });

        if (cleanupRes.combinedError) {
          throw cleanupRes.combinedError;
        }
      }

      assert.equal(cleanupRes.fallbackExercised, false, 'Case C normal path must not exercise fallback');
      assert.equal(cleanupRes.clientDiscarded, false, 'Case C normal path must not discard client');
      assert.equal(cleanupRes.cleanupErrors.length, 0, 'Case C normal path must have 0 cleanup errors');
      assert.equal(cleanupRes.backendObservations.comp?.status, 'IDLE_CLEAN');
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
      const coordinator = new CaseLocalCoordinator({
        scenarioName: 'CASE_C2_FAILURE_CLEANUP',
        fixture,
        compositionWorker,
        deliberatelyDiscardedSet: deliberatelyDiscardedClients,
      });

      const cancellationConn = await coordinator.tracker.acquire(
        fixture.owner,
        'cancellationConn',
        coordinator.normalDeadlineAt
      );
      const observerConn = await coordinator.tracker.acquire(
        fixture.owner,
        'observerConn',
        coordinator.normalDeadlineAt
      );
      const holdLocker = await coordinator.tracker.acquire(
        fixture.owner,
        'holdLocker',
        coordinator.normalDeadlineAt
      );
      const inventoryLocker = await coordinator.tracker.acquire(
        fixture.owner,
        'inventoryLocker',
        coordinator.normalDeadlineAt
      );
      const compFailConn = await coordinator.tracker.acquire(
        compositionWorker,
        'compFailConn',
        coordinator.normalDeadlineAt
      );

      const holdLockerPid = coordinator.tracker.getPid(holdLocker);
      const invLockerPid = coordinator.tracker.getPid(inventoryLocker);
      const compFailPid = coordinator.tracker.getPid(compFailConn);

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
      };

      let compFailPromise;
      let caughtInjectedError = null;
      let cleanupRes = null;
      let secondaryBlockObserved = false;
      let beforeFail;
      let failCommand;
      let fFail;

      try {
        fFail = await coordinator.runOperation('setup_c2_fixture', () =>
          setupPaymentAttemptFixture(60, 2, observerConn)
        );
        failCommand = randomUUID();

        beforeFail = await coordinator.runOperation('capture_c2_before', () =>
          captureScopedSnapshot(createTrackedQueryAdapter(observerConn), {
            holdId: fFail.holdId,
            commandId: failCommand,
            attemptId: fFail.attemptId,
          })
        );

        await coordinator.runOperation('hold_locker_begin', () => holdLocker.query('BEGIN'));
        await coordinator.runOperation('hold_locker_lock', () =>
          holdLocker.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fFail.holdId])
        );

        await coordinator.runOperation('inv_locker_begin', () => inventoryLocker.query('BEGIN'));
        await coordinator.runOperation('inv_locker_lock', () =>
          inventoryLocker.query(
            `SELECT room_type_id, calendar_date FROM inventory_days
             WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 FOR UPDATE`,
            [fFail.checkIn, fFail.checkOut]
          )
        );

        await coordinator.runOperation('comp_fail_begin', () => compFailConn.query('BEGIN'));
        await coordinator.runOperation('comp_fail_lt', () =>
          compFailConn.query("SET LOCAL lock_timeout = '8s'")
        );
        await coordinator.runOperation('comp_fail_st', () =>
          compFailConn.query("SET LOCAL statement_timeout = '12s'")
        );

        const settingsFail = await coordinator.runOperation('comp_fail_verify_settings', async () => {
          const r = (await compFailConn.query(
            "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
          )).rows[0];
          assert.equal(r.lt, '8s', 'Effective lock_timeout must be 8s');
          assert.equal(r.st, '12s', 'Effective statement_timeout must be 12s');
          return r;
        });
        assert.equal(settingsFail.lt, '8s');

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
            queryState.clientError = { code: e?.code, message: e?.message };
            return { clientError: { code: e?.code, message: e?.message }, result: null };
          });

        const holdWait = await coordinator.waitForCondition('c2_hold_wait', async () => {
          const actRes = await observerConn.query(
            `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity WHERE pid = $1`,
            [compFailPid]
          );
          const act = actRes.rows[0];
          if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(holdLockerPid)) {
            return act;
          }
          return false;
        });
        assert.ok(holdWait, 'Composition must wait on hold locker');

        await coordinator.runOperation('hold_locker_commit', () => holdLocker.query('COMMIT'));

        const invWait = await coordinator.waitForCondition('c2_inv_wait', async () => {
          const actRes = await observerConn.query(
            `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity WHERE pid = $1`,
            [compFailPid]
          );
          const act = actRes.rows[0];
          if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(invLockerPid)) {
            return act;
          }
          return false;
        });
        assert.ok(invWait, 'Composition must wait on secondary inventory locker');
        secondaryBlockObserved = true;

        throw new Error('INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST');
      } catch (err) {
        caughtInjectedError = err;
      } finally {
        cleanupRes = await coordinator.performFiniteCleanup({
          cancellationConn,
          observerConn,
          compConn: compFailConn,
          compPid: compFailPid,
          compPromise: compFailPromise,
          compQueryState: queryState,
          blockers: [holdLocker],
          retainedBlockers: [inventoryLocker],
          scenarioError: caughtInjectedError,
          committed: false,
        });
      }

      assert.ok(caughtInjectedError, 'Injected observation failure must be caught');
      assert.equal(
        caughtInjectedError.message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST'
      );
      assert.equal(secondaryBlockObserved, true);
      assert.equal(cleanupRes.fallbackExercised, false, 'Graceful immediate cancellation must not exercise fallback');
      assert.equal(cleanupRes.clientDiscarded, false, 'Client must not be discarded on graceful cleanup');
      assert.equal(cleanupRes.cleanupErrors.length, 0, 'Cleanup errors must be empty on graceful path');
      assert.equal(
        cleanupRes.combinedError?.message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST',
        'Combined error must be the exact injected observation failure directly'
      );
      assert.ok(
        cleanupRes.cleanupDurationMs <= CLEANUP_DEADLINE_MS,
        `Cleanup must finish within declared deadline (${cleanupRes.cleanupDurationMs}ms <= ${CLEANUP_DEADLINE_MS}ms)`
      );
      assert.equal(queryState.settled, true, 'Operation promise must settle');
      assert.equal(queryState.clientError?.code, '57014', 'PostgreSQL error code must be 57014');

      // Verify baseline restored using explicitly tracked verifyConn
      const verifyConn = await coordinator.tracker.acquire(
        fixture.owner,
        'verifyConn',
        coordinator.normalDeadlineAt
      );
      try {
        const afterFail = await captureScopedSnapshot(createTrackedQueryAdapter(verifyConn), {
          holdId: fFail.holdId,
          commandId: failCommand,
          attemptId: fFail.attemptId,
        });
        assert.deepEqual(afterFail, beforeFail, 'Baseline must be restored');
      } finally {
        coordinator.tracker.releaseClean(verifyConn);
      }
    }

    // =========================================================================
    // 5c. RACE CASE C3: DELIBERATE DELAYED-CONTROL & FALLBACK CLEANUP REGRESSION
    // =========================================================================
    // Tests that when the cleanup control path is delayed by a real database query
    // (SELECT pg_sleep(5.2)), the active deadline cuts off the delayed control work
    // at graceful budget (3.5s), initiates active cancellation so the query does not
    // leak on Postgres, and exercises fallback: client is discarded, server backend
    // is terminated, transaction is rolled back, baseline restored, with both the
    // original observation error and the cleanup stage timeout error preserved
    // in an AggregateError.
    // =========================================================================
    {
      const coordinator = new CaseLocalCoordinator({
        scenarioName: 'CASE_C3_DELAYED_CONTROL_FALLBACK',
        fixture,
        compositionWorker,
        deliberatelyDiscardedSet: deliberatelyDiscardedClients,
      });

      const cancellationConn = await coordinator.tracker.acquire(
        fixture.owner,
        'cancellationConn',
        coordinator.normalDeadlineAt
      );
      const observerConn = await coordinator.tracker.acquire(
        fixture.owner,
        'observerConn',
        coordinator.normalDeadlineAt
      );
      const holdLocker = await coordinator.tracker.acquire(
        fixture.owner,
        'holdLocker',
        coordinator.normalDeadlineAt
      );
      const inventoryLocker = await coordinator.tracker.acquire(
        fixture.owner,
        'inventoryLocker',
        coordinator.normalDeadlineAt
      );
      const compDelayConn = await coordinator.tracker.acquire(
        compositionWorker,
        'compDelayConn',
        coordinator.normalDeadlineAt
      );
      const controlConn = await coordinator.tracker.acquire(
        fixture.owner,
        'controlConn',
        coordinator.normalDeadlineAt
      );

      const holdLockerPid = coordinator.tracker.getPid(holdLocker);
      const invLockerPid = coordinator.tracker.getPid(inventoryLocker);
      const compDelayPid = coordinator.tracker.getPid(compDelayConn);
      const controlPid = coordinator.tracker.getPid(controlConn);

      const queryState = {
        settled: false,
        result: null,
        clientError: null,
      };

      let compDelayPromise;
      let caughtInjectedError = null;
      let cleanupRes = null;
      let secondaryBlockObserved = false;
      let delayedControlStarted = false;
      let beforeDelay;
      let delayCommand;
      let fDelay;
      let delayedControlOp;

      try {
        fDelay = await coordinator.runOperation('setup_c3_fixture', () =>
          setupPaymentAttemptFixture(70, 2, observerConn)
        );
        delayCommand = randomUUID();

        beforeDelay = await coordinator.runOperation('capture_c3_before', () =>
          captureScopedSnapshot(createTrackedQueryAdapter(observerConn), {
            holdId: fDelay.holdId,
            commandId: delayCommand,
            attemptId: fDelay.attemptId,
          })
        );

        await coordinator.runOperation('hold_locker_begin_c3', () => holdLocker.query('BEGIN'));
        await coordinator.runOperation('hold_locker_lock_c3', () =>
          holdLocker.query('SELECT id FROM booking_holds WHERE id = $1 FOR UPDATE', [fDelay.holdId])
        );

        await coordinator.runOperation('inv_locker_begin_c3', () => inventoryLocker.query('BEGIN'));
        await coordinator.runOperation('inv_locker_lock_c3', () =>
          inventoryLocker.query(
            `SELECT room_type_id, calendar_date FROM inventory_days
             WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2 FOR UPDATE`,
            [fDelay.checkIn, fDelay.checkOut]
          )
        );

        await coordinator.runOperation('comp_delay_begin', () => compDelayConn.query('BEGIN'));
        await coordinator.runOperation('comp_delay_lt', () =>
          compDelayConn.query("SET LOCAL lock_timeout = '8s'")
        );
        await coordinator.runOperation('comp_delay_st', () =>
          compDelayConn.query("SET LOCAL statement_timeout = '12s'")
        );

        const settingsDelay = await coordinator.runOperation('comp_delay_verify_settings', async () => {
          const r = (await compDelayConn.query(
            "SELECT current_setting('lock_timeout') AS lt, current_setting('statement_timeout') AS st"
          )).rows[0];
          assert.equal(r.lt, '8s', 'Effective lock_timeout must be 8s');
          assert.equal(r.st, '12s', 'Effective statement_timeout must be 12s');
          return r;
        });
        assert.equal(settingsDelay.lt, '8s');

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
            queryState.clientError = { code: e?.code, message: e?.message };
            return { clientError: { code: e?.code, message: e?.message }, result: null };
          });

        const holdWait = await coordinator.waitForCondition('c3_hold_wait', async () => {
          const actRes = await observerConn.query(
            `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity WHERE pid = $1`,
            [compDelayPid]
          );
          const act = actRes.rows[0];
          if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(holdLockerPid)) {
            return act;
          }
          return false;
        });
        assert.ok(holdWait, 'Composition must wait on hold locker');

        await coordinator.runOperation('hold_locker_commit_c3', () => holdLocker.query('COMMIT'));

        const invWait = await coordinator.waitForCondition('c3_inv_wait', async () => {
          const actRes = await observerConn.query(
            `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity WHERE pid = $1`,
            [compDelayPid]
          );
          const act = actRes.rows[0];
          if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(invLockerPid)) {
            return act;
          }
          return false;
        });
        assert.ok(invWait, 'Composition must wait on secondary inventory locker');
        secondaryBlockObserved = true;

        // Start REAL identifiable database control query on controlConn: SELECT pg_sleep(5.2) AS delay_result
        const delayedControlPromise = controlConn.query('SELECT pg_sleep(5.2) AS delay_result');
        delayedControlOp = {
          client: controlConn,
          pid: controlPid,
          promise: delayedControlPromise,
        };

        // Verify delayed control query has actually started in pg_stat_activity
        const controlStat = await coordinator.waitForCondition('control_query_started', async () => {
          const r = (await observerConn.query(
            "SELECT pid, state, query FROM pg_stat_activity WHERE pid = $1 AND query LIKE '%pg_sleep%'",
            [controlPid]
          )).rows[0];
          return r || false;
        });
        assert.ok(controlStat, 'Delayed control query must be started and identifiable in pg_stat_activity');
        delayedControlStarted = true;

        throw new Error('INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST');
      } catch (err) {
        caughtInjectedError = err;
      } finally {
        cleanupRes = await coordinator.performFiniteCleanup({
          cancellationConn,
          observerConn,
          compConn: compDelayConn,
          compPid: compDelayPid,
          compPromise: compDelayPromise,
          compQueryState: queryState,
          blockers: [holdLocker],
          retainedBlockers: [inventoryLocker],
          delayedControlOp,
          scenarioError: caughtInjectedError,
          committed: false,
        });
      }

      // Assertions on Case C3:
      assert.ok(caughtInjectedError, 'Injected observation failure must be caught');
      assert.equal(
        caughtInjectedError.message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST'
      );
      assert.equal(secondaryBlockObserved, true);
      assert.equal(delayedControlStarted, true, 'Delayed control query must have started');
      assert.equal(cleanupRes.fallbackExercised, true, 'Fallback must be exercised when control stage times out');
      assert.equal(cleanupRes.clientDiscarded, true, 'Client must be discarded on fallback');
      assert.equal(cleanupRes.operationOutcomes.delayedControlSettled, true, 'Delayed control query must have settled');
      assert.equal(cleanupRes.operationOutcomes.compSettled, true, 'Composition query must have settled');
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

      // Verify the combined error is an AggregateError combining original and cleanup stage timeout:
      assert.ok(
        cleanupRes.combinedError instanceof AggregateError,
        'Case C3 must produce AggregateError combining original and cleanup errors'
      );
      assert.equal(cleanupRes.combinedError.errors.length, 2);
      assert.equal(
        cleanupRes.combinedError.errors[0].message,
        'INJECTED_OBSERVATION_FAILURE_FOR_CLEANUP_TEST'
      );
      assert.equal(
        cleanupRes.combinedError.errors[1].message,
        'CLEANUP_CONTROL_STAGE_TIMEOUT'
      );

      // Verify baseline restored using explicitly tracked verifyConn
      const verifyConn = await coordinator.tracker.acquire(
        fixture.owner,
        'verifyConn',
        coordinator.normalDeadlineAt
      );
      try {
        const afterDelay = await captureScopedSnapshot(createTrackedQueryAdapter(verifyConn), {
          holdId: fDelay.holdId,
          commandId: delayCommand,
          attemptId: fDelay.attemptId,
        });
        assert.deepEqual(afterDelay, beforeDelay, 'Baseline must match beforeDelay snapshot exactly');
        assert.equal(afterDelay.reservations.length, 0);
        assert.equal(afterDelay.bridges.length, 0);
        assert.equal(afterDelay.reconciliations.length, 0);
        assert.equal(afterDelay.attempt.length, 1);
        assert.equal(afterDelay.attempt[0].payment_state, 'MATCHED_CAPTURE');
      } finally {
        coordinator.tracker.releaseClean(verifyConn);
      }
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
      assert.equal(unexpectedPoolErrors.length, 0, 'No unexpected pool errors allowed');
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
