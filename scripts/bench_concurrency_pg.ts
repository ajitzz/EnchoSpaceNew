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

import {readFileSync} from 'node:fs';
import {createLocalPostgresFixture} from '../src/test/harvo/postgres.js';
import { acquireHold } from '../src/services/inventoryHoldService.js';

export async function runConcurrencyBenchmark(): Promise<{
  successes: number;
  conflicts: number;
  others: number;
  totalHeldUnits: number;
}> {
  // No caller-supplied URL and no destructive cleanup of a pre-existing database.
  const fixture = await createLocalPostgresFixture({schema:'empty'});
  const pool = fixture.pool;

  try {
    // Explicit minimal legacy dependencies, followed by complete canonical migrations.
    // No DDL extraction from application startup and no live database connection.
    await pool.query(readFileSync(new URL('./testing/fixtures/inventory-baseline.sql',import.meta.url),'utf8'));
    for(const migration of ['003_canonical_room_and_media_authority.sql','004_canonical_constraints.sql',
      '005_inventory_days_and_atomic_holds.sql','006_legacy_calendar_block_mapping.sql','007_legacy_conflict_ledger_uniqueness.sql'])
      await pool.query(readFileSync(new URL(`../src/migrations/${migration}`,import.meta.url),'utf8'));
    await pool.query('INSERT INTO users VALUES(801)');
    await pool.query("INSERT INTO listings(id,user_id,title,publication_status) VALUES(801,801,'Bench Villa','published')");
    await pool.query("INSERT INTO room_types(id,listing_id,name,type,base_price,inventory_count) VALUES(801,801,'Single Suite','suite',10000,1)");

    const anchor = Date.now();
    const date = (offset: number) => new Date(anchor + offset * 86400000).toISOString().slice(0,10);
    const checkIn = date(30), checkOut = date(32);
    const holdPromises = [];
    for (let i = 0; i < 100; i++) {
      holdPromises.push(
        acquireHold(pool, {
          roomTypeId: 801,
          checkIn,
          checkOut,
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
    await fixture.close();
  }
}

if (process.argv[1]?.endsWith('bench_concurrency_pg.ts') || process.argv[1]?.endsWith('bench_concurrency_pg.js')) {
  runConcurrencyBenchmark()
    .then(result => {
      console.log(JSON.stringify(result));
      if (result.successes === 1 && result.conflicts === 99 && result.others === 0 && result.totalHeldUnits === 2) {
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
