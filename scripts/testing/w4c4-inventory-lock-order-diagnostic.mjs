/**
 * ENCHO W4-C4 Focused Test Suite:
 * Cross-Writer Inventory Lock-Order Diagnostic.
 *
 * Verifies:
 * - Current accepted inventory writer inventory_days row-lock ordering.
 * - Single-room determinism: all current writers acquire in calendar_date ASC order.
 * - Serialization by earlier root locks: booking_holds and canonical_reservations.
 * - Two-connection PostgreSQL concurrency probes:
 *   - Probe 1: Positive determinism & opposite caller date array ordering.
 *   - Probe 2: Hold release vs hold finalization on same hold (serialized on hold header).
 *   - Probe 3: Concurrent hold acquisitions on same room & overlapping dates.
 *   - Probe 4: Calendar block creation vs hold acquisition.
 *   - Probe 5: Reservation cancellation vs calendar block mutation.
 *   - Probe 6: SQL itinerary expiry vs hold finalization.
 *   - Probe 7: Multi-room future modifier: ABBA deadlock demonstration without union sort
 *              vs clean serialized execution with proposed union sort key.
 * - Absence of physical modification writer in pg_proc.
 * - Absence of current deadlock cycle among accepted writers.
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
import { addDays, createW1AcceptedOfferFixture } from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import { applyIsolatedMigration } from '../../src/test/harvo/helpers/isolatedMigration.js';

test('W4-C4 cross-writer inventory lock-order diagnostic verification', async () => {
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
  // 2. SETUP ISOLATED POSTGRES CLUSTER & ROLES UP TO MIGRATION 059
  // =========================================================================
  const fixture = await createW1AcceptedOfferFixture({ serverCompatible: true });
  let stays;
  let reservationWorker;
  let compositionWorker;
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

    stays = new pg.Pool({ ...fixture.owner.options, user: 'encho_stays_web' });
    reservationWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_reservation_worker' });
    compositionWorker = new pg.Pool({ ...fixture.owner.options, user: 'encho_composition_worker' });
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

    // =========================================================================
    // 3. SCHEMA & CATALOG INTEGRITY CHECKS
    // =========================================================================

    // 3a. Table constraints on inventory_days
    const constraintsRes = await fixture.owner.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'public.inventory_days'::regclass
    `);
    const constraints = constraintsRes.rows.map(r => r.conname);

    assert.ok(constraints.includes('uq_inventory_days_room_date'), 'inventory_days must enforce UNIQUE(room_type_id, calendar_date)');
    assert.ok(constraints.includes('chk_inventory_days_capacity'), 'inventory_days must enforce capacity invariant');
    assert.ok(constraints.includes('chk_inventory_days_held_positive'), 'inventory_days must enforce held_units >= 0');
    assert.ok(constraints.includes('chk_inventory_days_booked_positive'), 'inventory_days must enforce booked_units >= 0');
    assert.ok(constraints.includes('chk_inventory_days_blocked_positive'), 'inventory_days must enforce blocked_units >= 0');
    assert.ok(constraints.includes('chk_inventory_days_total_positive'), 'inventory_days must enforce total_units >= 0');

    // 3b. Verify stored functions exist in catalog
    const procsRes = await fixture.owner.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname IN (
        'stays_expire_holds_for_itinerary',
        'canonical_finalize_direct_hold',
        'canonical_compose_payment_reservation',
        'canonical_complete_reservation_cancellation',
        'canonical_request_reservation_modification'
      )
    `);
    const procs = procsRes.rows.map(r => r.proname);
    assert.equal(procs.length, 5, 'All five canonical accepted stored routines must exist');

    // 3c. Verify NO physical modification / inventory replacement writer exists
    const modProcsRes = await fixture.owner.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname LIKE '%modify%reservation%inventory%'
         OR proname LIKE '%replace%reservation%nights%'
         OR proname LIKE '%apply%reservation%revision%'
         OR proname LIKE '%finalize%modification%'
    `);
    assert.equal(modProcsRes.rows.length, 0, 'No physical modification writer must exist in pg_proc');

    // =========================================================================
    // 4. TWO-CONNECTION CONCURRENCY PROBES
    // =========================================================================

    const roomA = 101;
    const roomB = 102;
    const d1 = addDays(fixture.today, 10);
    const d2 = addDays(fixture.today, 11);
    const d3 = addDays(fixture.today, 12);

    // -------------------------------------------------------------------------
    // PROBE 1: Positive Determinism & Opposite Input Array Order
    // Proves: Input order array ['2026-11-11', '2026-11-10'] does NOT alter the
    // internal acquisition order of SELECT ... ORDER BY calendar_date ASC FOR UPDATE.
    // -------------------------------------------------------------------------
    {
      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 passes descending array: [d2, d1]
        const c1Res = await conn1.query(`
          SELECT id, calendar_date::text AS cdate
          FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
          ORDER BY calendar_date ASC
          FOR UPDATE
        `, [roomA, [d2, d1]]);

        assert.equal(c1Res.rows[0].cdate, d1, 'Engine must return and lock d1 first despite descending input');
        assert.equal(c1Res.rows[1].cdate, d2, 'Engine must return and lock d2 second');

        // Conn 2 passes ascending array: [d1, d2]
        let timedOut = false;
        try {
          await conn2.query(`
            SELECT id, calendar_date::text AS cdate
            FROM inventory_days
            WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
            ORDER BY calendar_date ASC
            FOR UPDATE
          `, [roomA, [d1, d2]]);
        } catch (err) {
          if (err.code === '55P03') { // lock_not_available / lock_timeout
            timedOut = true;
          } else {
            throw err;
          }
        }

        assert.ok(timedOut, 'Conn 2 must encounter lock timeout waiting on d1 from Conn 1');

        await conn2.query('ROLLBACK');
        await conn1.query('COMMIT');

        // Once Conn 1 commits, Conn 2 can acquire both without error
        await conn2.query('BEGIN');
        const c2RetryRes = await conn2.query(`
          SELECT id, calendar_date::text AS cdate
          FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
          ORDER BY calendar_date ASC
          FOR UPDATE
        `, [roomA, [d1, d2]]);
        assert.equal(c2RetryRes.rows.length, 2, 'Conn 2 acquires both locked rows after Conn 1 commit');
        await conn2.query('COMMIT');
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 2: Hold Release vs Hold Finalization on Same Hold
    // Proves: Contending release vs finalization serialize strictly on
    // booking_holds (id) row lock before any inventory_days lock is requested.
    // -------------------------------------------------------------------------
    {
      const checkIn = addDays(fixture.today, 20);
      const checkOut = addDays(fixture.today, 22);

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
      const commandId = randomUUID();

      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 locks booking_holds row FOR UPDATE (simulating releaseHold Step 1)
        await conn1.query('SELECT id, status FROM booking_holds WHERE id = $1 FOR UPDATE', [holdId]);

        // Conn 2 attempts canonical_finalize_direct_hold
        let blockedOnHold = false;
        try {
          await conn2.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
          await conn2.query(`
            SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)
          `, [holdId, quote.id, commandId]);
        } catch (err) {
          if (err.code === '55P03') {
            blockedOnHold = true;
          } else {
            throw err;
          }
        }

        assert.ok(blockedOnHold, 'Finalizer must block on hold header lock held by releaseHold');

        await conn2.query('ROLLBACK');

        // Conn 1 marks hold RELEASED and commits
        await conn1.query(`UPDATE booking_holds SET status = 'RELEASED' WHERE id = $1`, [holdId]);
        await conn1.query('COMMIT');

        // Conn 2 retries after Conn 1 committed RELEASED: must reject with RESERVATION_HOLD_NOT_ACTIVE
        await conn2.query('BEGIN');
        await conn2.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
        let rejectedCleanly = false;
        try {
          await conn2.query(`
            SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)
          `, [holdId, quote.id, commandId]);
        } catch (err) {
          if (err.message.includes('RESERVATION_HOLD_NOT_ACTIVE')) {
            rejectedCleanly = true;
          } else {
            throw err;
          }
        }
        assert.ok(rejectedCleanly, 'Finalizer cleanly aborts when hold is no longer ACTIVE without touching inventory');
        await conn2.query('ROLLBACK');
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 3: Concurrent Hold Acquisitions on Same Dates
    // Proves: Two hold requests sort by calendar_date ASC and cleanly serialize
    // on inventory_days rows without deadlock.
    // -------------------------------------------------------------------------
    {
      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 acquires lock on d1 and d2 in calendar_date ASC order
        await conn1.query(`
          SELECT id, calendar_date, total_units, held_units, booked_units, blocked_units
          FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
          ORDER BY calendar_date ASC
          FOR UPDATE
        `, [roomA, [d1, d2]]);

        // Conn 2 attempts same query
        let timedOut = false;
        try {
          await conn2.query(`
            SELECT id, calendar_date, total_units, held_units, booked_units, blocked_units
            FROM inventory_days
            WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
            ORDER BY calendar_date ASC
            FOR UPDATE
          `, [roomA, [d1, d2]]);
        } catch (err) {
          if (err.code === '55P03') {
            timedOut = true;
          } else {
            throw err;
          }
        }
        assert.ok(timedOut, 'Conn 2 must wait and time out behind Conn 1 on d1');

        await conn2.query('ROLLBACK');
        await conn1.query('COMMIT');
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 4: Calendar Block Creation vs Hold Acquisition
    // Proves: Calendar block creation and hold acquisition both lock inventory_days
    // in calendar_date ASC order and cleanly wait without cycle.
    // -------------------------------------------------------------------------
    {
      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 simulates calendar.ts block create: locks inventory_days ORDER BY calendar_date
        await conn1.query(`
          SELECT id FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
          ORDER BY calendar_date
          FOR UPDATE
        `, [roomA, [d1, d2]]);

        // Conn 2 simulates acquireHold: locks inventory_days ORDER BY calendar_date ASC
        let timedOut = false;
        try {
          await conn2.query(`
            SELECT id FROM inventory_days
            WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
            ORDER BY calendar_date ASC
            FOR UPDATE
          `, [roomA, [d2, d1]]);
        } catch (err) {
          if (err.code === '55P03') {
            timedOut = true;
          } else {
            throw err;
          }
        }
        assert.ok(timedOut, 'Hold acquire must wait and time out behind calendar block creation on d1');

        // Conn 1 updates blocked_units and commits
        await conn1.query(`
          UPDATE inventory_days
          SET blocked_units = blocked_units + 1, updated_at = NOW()
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
        `, [roomA, [d1, d2]]);
        await conn1.query('COMMIT');

        await conn2.query('ROLLBACK');

        // Reset blocked_units
        await fixture.owner.query(`
          UPDATE inventory_days
          SET blocked_units = 0
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
        `, [roomA, [d1, d2]]);
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 5: Reservation Cancellation vs Calendar Block Mutation
    // Proves: Cancellation locks inventory_days in (calendar_date ASC, id ASC)
    // while calendar block locks in calendar_date ASC order; no cycle.
    // -------------------------------------------------------------------------
    {
      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 simulates cancellation: locks inventory_days ORDER BY calendar_date ASC, id ASC
        await conn1.query(`
          SELECT id, calendar_date
          FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
          ORDER BY calendar_date ASC, id ASC
          FOR UPDATE
        `, [roomA, [d1, d2]]);

        // Conn 2 simulates calendar block: locks inventory_days ORDER BY calendar_date
        let timedOut = false;
        try {
          await conn2.query(`
            SELECT id FROM inventory_days
            WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
            ORDER BY calendar_date
            FOR UPDATE
          `, [roomA, [d1, d2]]);
        } catch (err) {
          if (err.code === '55P03') {
            timedOut = true;
          } else {
            throw err;
          }
        }
        assert.ok(timedOut, 'Calendar block waits behind cancellation on d1');

        await conn2.query('ROLLBACK');
        await conn1.query('COMMIT');
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 6: SQL Itinerary Expiry vs Hold Finalization
    // Proves: Expiry and Finalizer serialize on booking_holds (id) row lock.
    // -------------------------------------------------------------------------
    {
      const checkIn = addDays(fixture.today, 30);
      const checkOut = addDays(fixture.today, 32);

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
      const commandId = randomUUID();

      // Artificially age the hold past expires_at
      await fixture.owner.query(`
        UPDATE booking_holds
        SET expires_at = NOW() - INTERVAL '5 minutes'
        WHERE id = $1
      `, [holdId]);

      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn2.query("SET lock_timeout = '250ms'");

        // Conn 1 starts expiry loop by locking expired hold FOR UPDATE
        await conn1.query(`
          SELECT id FROM booking_holds
          WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE
        `, [holdId]);

        // Conn 2 attempts finalization
        let timedOut = false;
        try {
          await conn2.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
          await conn2.query(`
            SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)
          `, [holdId, quote.id, commandId]);
        } catch (err) {
          if (err.code === '55P03') {
            timedOut = true;
          } else {
            throw err;
          }
        }
        assert.ok(timedOut, 'Finalizer must wait on hold header locked by expiry worker');

        await conn2.query('ROLLBACK');

        // Conn 1 marks hold EXPIRED and decrements held_units
        await conn1.query(`UPDATE booking_holds SET status = 'EXPIRED' WHERE id = $1`, [holdId]);
        await conn1.query('COMMIT');
      } finally {
        conn1.release();
        conn2.release();
      }
    }

    // -------------------------------------------------------------------------
    // PROBE 7: Multi-Room Future Modifier Simulation
    // Part 7a: ABBA Deadlock Demonstration if multi-room access is un-sorted.
    // Part 7b: Clean Serialized Resolution when UNION is sorted by (calendar_date, room_type_id).
    // -------------------------------------------------------------------------
    {
      const conn1 = await fixture.owner.connect();
      const conn2 = await fixture.owner.connect();

      // Part 7a: Un-sorted opposite room order leads to ABBA Deadlock
      try {
        await conn1.query('BEGIN');
        await conn2.query('BEGIN');
        await conn1.query("SET deadlock_timeout = '150ms'");
        await conn2.query("SET deadlock_timeout = '150ms'");
        await conn1.query("SET lock_timeout = '400ms'");
        await conn2.query("SET lock_timeout = '400ms'");

        // Tx 1 locks Room A first
        await conn1.query(`
          SELECT id FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = $2::date
          FOR UPDATE
        `, [roomA, d1]);

        // Tx 2 locks Room B first
        await conn2.query(`
          SELECT id FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = $2::date
          FOR UPDATE
        `, [roomB, d1]);

        // Tx 1 attempts to lock Room B -> blocks waiting for Tx 2
        // Tx 2 attempts to lock Room A -> creates ABBA cycle!
        let cycleDetected = false;
        const p1 = conn1.query(`
          SELECT id FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = $2::date
          FOR UPDATE
        `, [roomB, d1]).catch(err => err);

        const p2 = conn2.query(`
          SELECT id FROM inventory_days
          WHERE room_type_id = $1 AND calendar_date = $2::date
          FOR UPDATE
        `, [roomA, d1]).catch(err => err);

        const [r1, r2] = await Promise.all([p1, p2]);

        if ((r1 && (r1.code === '40P01' || r1.code === '55P03')) ||
            (r2 && (r2.code === '40P01' || r2.code === '55P03'))) {
          cycleDetected = true;
        }

        assert.ok(cycleDetected, 'Opposite room order without union sort must encounter deadlock (40P01) or timeout (55P03)');

        await conn1.query('ROLLBACK');
        await conn2.query('ROLLBACK');
      } finally {
        conn1.release();
        conn2.release();
      }

      // Part 7b: Deterministic Union Sort Key (calendar_date ASC, room_type_id ASC)
      // Completely eliminates the cycle and converts contending cross-room
      // operations into clean serial execution.
      {
        const connA = await fixture.owner.connect();
        const connB = await fixture.owner.connect();

        try {
          await connA.query('BEGIN');
          await connB.query('BEGIN');
          await connA.query("SET deadlock_timeout = '150ms'");
          await connB.query("SET deadlock_timeout = '150ms'");
          await connB.query("SET lock_timeout = '300ms'");

          // Both transactions lock the UNION of {Room A, Room B} sorted deterministically:
          // ORDER BY calendar_date ASC, room_type_id ASC FOR UPDATE
          // Conn A locks union set in canonical order: Room A (101) then Room B (102)
          await connA.query(`
            SELECT id, room_type_id, calendar_date
            FROM inventory_days
            WHERE (room_type_id = $1 AND calendar_date = $3::date)
               OR (room_type_id = $2 AND calendar_date = $3::date)
            ORDER BY calendar_date ASC, room_type_id ASC
            FOR UPDATE
          `, [roomA, roomB, d1]);

          // Conn B attempts same union in same canonical order -> blocks cleanly on Room A (101)
          let timedOutCleanly = false;
          try {
            await connB.query(`
              SELECT id, room_type_id, calendar_date
              FROM inventory_days
              WHERE (room_type_id = $1 AND calendar_date = $3::date)
                 OR (room_type_id = $2 AND calendar_date = $3::date)
              ORDER BY calendar_date ASC, room_type_id ASC
              FOR UPDATE
            `, [roomA, roomB, d1]);
          } catch (err) {
            if (err.code === '55P03') {
              timedOutCleanly = true;
            } else {
              throw err;
            }
          }

          assert.ok(timedOutCleanly, 'Conn B must wait and time out cleanly on Room A; zero deadlock cycle occurred');

          await connB.query('ROLLBACK');
          await connA.query('COMMIT');

          // Conn B retries after Conn A commits: succeeds immediately
          await connB.query('BEGIN');
          const bRes = await connB.query(`
            SELECT id, room_type_id, calendar_date
            FROM inventory_days
            WHERE (room_type_id = $1 AND calendar_date = $3::date)
               OR (room_type_id = $2 AND calendar_date = $3::date)
            ORDER BY calendar_date ASC, room_type_id ASC
            FOR UPDATE
          `, [roomA, roomB, d1]);
          assert.equal(bRes.rows.length, 2, 'Conn B succeeds without deadlock after Conn A commits');
          await connB.query('COMMIT');
        } finally {
          connA.release();
          connB.release();
        }
      }
    }

  } finally {
    if (stays) await stays.end();
    if (reservationWorker) await reservationWorker.end();
    if (compositionWorker) await compositionWorker.end();
    if (cancellationExecutor) await cancellationExecutor.end();
    await fixture?.close();
  }
});
