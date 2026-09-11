/**
 * scripts/bench_concurrency_pg.ts
 *
 * Real PostgreSQL concurrency certification benchmark script.
 * Runs 100 simultaneous acquireHold requests against dedicated PostgreSQL instance.
 *
 * Assertions:
 * - Exactly 1 request acquires the hold (HTTP 201)
 * - Exactly 99 requests fail closed with capacity exhaustion (HTTP 409)
 * - 0 unhandled errors or double-allocations
 */

import pkg from 'pg';
import { acquireHold } from '../src/services/inventoryHoldService.js';

const { Pool } = pkg;

const connectionString = process.env.DISPOSABLE_PG_URL || 'postgresql://ajit@127.0.0.1:5439/encho_disposable_test';

export async function runConcurrencyBenchmark(): Promise<{
  successes: number;
  conflicts: number;
  others: number;
  totalHeldUnits: number;
}> {
  const pool = new Pool({
    connectionString,
    max: 120
  });

  try {
    // Reset and seed benchmark room
    await pool.query('DELETE FROM booking_hold_nights');
    await pool.query('DELETE FROM booking_holds');
    await pool.query('DELETE FROM inventory_days');
    await pool.query('DELETE FROM room_calendar_blocks');
    await pool.query('DELETE FROM legacy_block_conflict_ledger');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
    await pool.query('DELETE FROM users');

    await pool.query("INSERT INTO users (id, email, name) VALUES (801, 'host_bench@encho.space', 'Bench Host')");
    await pool.query("INSERT INTO listings (id, user_id, title, city, price, type) VALUES (801, 801, 'Bench Villa', 'Goa', 10000, 'villa')");
    await pool.query("INSERT INTO room_types (id, listing_id, name, inventory_count) VALUES (801, 801, 'Single Suite', 1)");

    const holdPromises = [];
    for (let i = 0; i < 100; i++) {
      holdPromises.push(
        acquireHold(pool, {
          roomTypeId: 801,
          checkIn: '2026-12-15',
          checkOut: '2026-12-17',
          quantity: 1,
          idempotencyKey: `idem-concurrent-bench-${i}`,
          holderPrincipal: `user:${9000 + i}`
        })
      );
    }

    const results = await Promise.all(holdPromises);
    const successes = results.filter(r => r.statusCode === 201).length;
    const conflicts = results.filter(r => r.statusCode === 409).length;
    const others = results.filter(r => r.statusCode !== 201 && r.statusCode !== 409).length;

    const dayRes = await pool.query(
      'SELECT calendar_date, total_units, held_units FROM inventory_days WHERE room_type_id = 801 ORDER BY calendar_date ASC'
    );
    const totalHeldUnits = dayRes.rows.reduce((sum: number, r: any) => sum + Number(r.held_units), 0);

    return { successes, conflicts, others, totalHeldUnits };
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('bench_concurrency_pg.ts') || process.argv[1]?.endsWith('bench_concurrency_pg.js')) {
  runConcurrencyBenchmark()
    .then(result => {
      console.log(JSON.stringify(result));
      if (result.successes === 1 && result.conflicts === 99 && result.others === 0) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
