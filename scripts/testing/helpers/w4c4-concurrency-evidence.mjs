/**
 * Task-local shared test helper for W4-C4 concurrency evidence.
 * Provides bounded command gates, pg_stat_activity/pg_blocking_pids lock observation,
 * and scoped before/after state snapshots.
 */
import assert from 'node:assert/strict';

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  do {
    last = await predicate();
    if (last) return last;
    await pause(20);
  } while (Date.now() < deadline);
  throw new Error(`WAIT_TIMEOUT: ${label}`);
}

export async function waitForLockWait(client, pid, blockerPid, label, timeoutMs = 8000) {
  return waitFor(async () => {
    const actRes = await client.query(
      `SELECT pid, usename, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
       FROM pg_stat_activity WHERE pid = $1`,
      [pid]
    );
    const act = actRes.rows[0];
    if (act && act.wait_event_type === 'Lock' && Array.isArray(act.blockers) && act.blockers.includes(blockerPid)) {
      const lockRes = await client.query(
        `SELECT locktype, mode, granted, relation::regclass::text AS relation
         FROM pg_locks WHERE pid = $1 AND NOT granted`,
        [pid]
      );
      return {
        ...act,
        ungrantedLocks: lockRes.rows,
      };
    }
    return false;
  }, label, timeoutMs);
}

export async function setupCommandGate(ownerClient) {
  await ownerClient.query(`
    CREATE TABLE IF NOT EXISTS review_c4_gate (
      command_id uuid PRIMARY KEY,
      gate_key bigint NOT NULL
    );

    CREATE OR REPLACE FUNCTION review_c4_after_command() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      k bigint;
    BEGIN
      SELECT gate_key INTO k FROM public.review_c4_gate WHERE command_id = NEW.command_id;
      IF k IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(k);
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS review_c4_command_gate ON canonical_reservation_commands;
    CREATE TRIGGER review_c4_command_gate
      AFTER INSERT ON canonical_reservation_commands
      FOR EACH ROW EXECUTE FUNCTION review_c4_after_command();

    ALTER ROLE encho_composition_worker SET deadlock_timeout = '200ms';
    ALTER ROLE encho_reservation_worker SET deadlock_timeout = '2s';
  `);
}

export async function teardownCommandGate(ownerClient) {
  await ownerClient.query(`
    DROP TRIGGER IF EXISTS review_c4_command_gate ON canonical_reservation_commands;
    DROP FUNCTION IF EXISTS review_c4_after_command();
    DROP TABLE IF EXISTS review_c4_gate;
  `);
}

export async function captureScopedSnapshot(ownerClient, { holdId, commandId, attemptId }) {
  const queryRows = async (sql, args) => (await ownerClient.query(sql, args)).rows;

  const [
    inventory,
    hold,
    reservations,
    nights,
    fences,
    bridges,
    attempt,
    events,
    reconciliations,
  ] = await Promise.all([
    queryRows(
      `SELECT d.id, d.calendar_date::text AS date, d.room_type_id, d.held_units, d.booked_units, d.blocked_units, d.total_units
       FROM inventory_days d
       JOIN booking_hold_nights hn ON hn.inventory_day_id = d.id
       WHERE hn.hold_id = $1
       ORDER BY d.calendar_date, d.id`,
      [holdId]
    ),
    queryRows(
      `SELECT id, status, expires_at::text, released_at::text, release_reason
       FROM booking_holds
       WHERE id = $1`,
      [holdId]
    ),
    queryRows(
      `SELECT id, status, hold_id, command_id
       FROM canonical_reservations
       WHERE hold_id = $1
       ORDER BY id`,
      [holdId]
    ),
    queryRows(
      `SELECT n.reservation_id, n.inventory_day_id, n.stay_date::text, n.units
       FROM canonical_reservation_nights n
       JOIN canonical_reservations r ON r.id = n.reservation_id
       WHERE r.hold_id = $1
       ORDER BY n.stay_date, n.inventory_day_id`,
      [holdId]
    ),
    queryRows(
      `SELECT command_id, holder_principal, hold_id, quote_id, request_fingerprint, reservation_id
       FROM canonical_reservation_commands
       WHERE command_id = $1 OR hold_id = $2
       ORDER BY command_id`,
      [commandId, holdId]
    ),
    queryRows(
      `SELECT id, command_id, payment_attempt_id, quote_id, hold_id, reservation_id, command_fingerprint, status
       FROM canonical_payment_reservations
       WHERE payment_attempt_id = $1
       ORDER BY id`,
      [attemptId]
    ),
    queryRows(
      `SELECT payment_state, reconciliation_reason, matched_at::text, expected_amount_paise
       FROM canonical_payment_attempts
       WHERE id = $1`,
      [attemptId]
    ),
    queryRows(
      `SELECT id, status, normalized_event_type, reported_amount_paise
       FROM canonical_provider_events
       WHERE payment_attempt_id = $1
       ORDER BY id`,
      [attemptId]
    ),
    queryRows(
      `SELECT reason, details
       FROM canonical_payment_reconciliations
       WHERE payment_attempt_id = $1
       ORDER BY id`,
      [attemptId]
    ),
  ]);

  return {
    inventory,
    hold,
    reservations,
    nights,
    fences,
    bridges,
    attempt,
    events,
    reconciliations,
  };
}

export function assertNoNewAllocation(before, after) {
  assert.deepEqual(after.inventory, before.inventory, 'inventory counters must remain unchanged');
  assert.deepEqual(after.hold, before.hold, 'hold status and fields must remain unchanged');
  assert.deepEqual(after.reservations, before.reservations, 'reservations must remain unchanged');
  assert.deepEqual(after.nights, before.nights, 'reservation nights must remain unchanged');
  assert.deepEqual(after.fences, before.fences, 'reservation command fences must remain unchanged');
  assert.deepEqual(after.bridges, before.bridges, 'payment reservation bridges must remain unchanged');
  assert.deepEqual(after.events, before.events, 'provider events must remain unchanged');
}

export function assertInventoryMovedOnce(before, after, expectedBridgeCount) {
  assert.equal(
    after.inventory.length,
    before.inventory.length,
    'All affected inventory days must be present'
  );
  after.inventory.forEach((afterDay, idx) => {
    const beforeDay = before.inventory[idx];
    assert.equal(afterDay.id, beforeDay.id, 'Inventory day ID must match');
    assert.equal(
      afterDay.held_units,
      beforeDay.held_units - 1,
      `held_units must decrement exactly once for day ${afterDay.date}`
    );
    assert.equal(
      afterDay.booked_units,
      beforeDay.booked_units + 1,
      `booked_units must increment exactly once for day ${afterDay.date}`
    );
    assert.equal(
      afterDay.blocked_units,
      beforeDay.blocked_units,
      'blocked_units must remain unchanged'
    );
    assert.equal(
      afterDay.total_units,
      beforeDay.total_units,
      'total_units must remain unchanged'
    );
  });

  assert.equal(after.reservations.length, 1, 'Exactly one canonical reservation must exist');
  assert.equal(
    after.nights.length,
    before.inventory.length,
    'Reservation nights must equal stay nights'
  );
  assert.equal(after.fences.length, 1, 'Exactly one reservation command fence must exist');
  assert.ok(after.fences[0].reservation_id, 'Fence must be populated with reservation_id');
  assert.equal(
    after.bridges.length,
    expectedBridgeCount,
    `Bridges count must equal ${expectedBridgeCount}`
  );
  assert.equal(after.hold[0].status, 'CONSUMED', 'Hold status must be CONSUMED');
  assert.deepEqual(after.events, before.events, 'Provider events must remain unchanged');
}

export async function getFunctionIdentity(client, signature = 'canonical_compose_payment_reservation(uuid,uuid)') {
  const res = await client.query(
    `SELECT p.oid::regprocedure::text AS function,
            pg_get_userbyid(p.proowner) AS owner,
            p.prosecdef,
            p.proconfig,
            encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS function_hash
     FROM pg_proc p
     WHERE p.oid = $1::regprocedure`,
    [signature]
  );
  return res.rows[0];
}
