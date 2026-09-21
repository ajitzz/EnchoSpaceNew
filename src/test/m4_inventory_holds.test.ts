/**
 * src/test/m4_inventory_holds.test.ts
 *
 * Phase 3 Milestone 4 — Inventory Days & Atomic Holds Test Suite.
 *
 * SCOPE:
 * 1. Date range semantics: [check_in, check_out) with checkout excluded.
 * 2. Reject same-day and reversed date ranges.
 * 3. Atomic all-or-nothing hold acquisition: multiple nights either all held or none.
 * 4. Insufficient capacity returns HTTP 409 with zero partial state.
 * 5. Idempotent replays: identical idempotency_key returns existing hold.
 * 6. Maintenance mode: MAINTENANCE_MODE_HOLDS=true returns honest 503.
 * 7. Holder authorization: release blocked for unauthenticated random callers, allowed for holder or admin.
 * 8. Sweeper: expires active holds past TTL and restores capacity.
 * 9. Migration 005 structure: foreign keys, check constraints, indexes.
 * 10. PostgreSQL-backed concurrency test: runs against real PostgreSQL (Testcontainers or local PG)
 *     or honestly flags missing disposable PG environment as M4 acceptance blocker without claiming pg-mem certification.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../../server';
import {
  getStayDatesRange,
  parseDateOnly,
  formatDateOnly,
  acquireHold,
  releaseHold,
  sweepExpiredHolds,
  getHoldTtlSeconds,
  createHostCalendarBlock,
  signGuestSession,
  verifyGuestSession,
  computeConflictFingerprint
} from '../services/inventoryHoldService';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';

function createAuthToken(user: { id: number; email: string; role: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

describe('Phase 3 Milestone 4 — Inventory Days & Atomic Holds', () => {
  let pool: any;
  const guestUser = { id: 7001, email: 'guest1@encho.space', role: 'user' };
  const guestToken = createAuthToken(guestUser);
  const otherGuest = { id: 7002, email: 'guest2@encho.space', role: 'user' };
  const otherToken = createAuthToken(otherGuest);
  const adminUser = { id: 999, email: 'admin@encho.space', role: 'admin' };
  const adminToken = createAuthToken(adminUser);

  beforeAll(async () => {
    pool = new Pool();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM legacy_block_conflict_ledger');
    await pool.query('DELETE FROM room_calendar_blocks');
    await pool.query('DELETE FROM booking_hold_nights');
    await pool.query('DELETE FROM booking_holds');
    await pool.query('DELETE FROM inventory_days');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
  });

  // Test 1: Date semantics: [check_in, check_out) includes check_in and excludes check_out
  it('Test 1: Date semantics include check-in and exclude checkout [check_in, check_out)', () => {
    const range = getStayDatesRange('2026-10-10', '2026-10-13');
    expect(range.valid).toBe(true);
    expect(range.dates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(range.dates).not.toContain('2026-10-13'); // Checkout date excluded
  });

  // Test 2: Rejects same-day or inverted date ranges
  it('Test 2: Rejects same-day and inverted date ranges', () => {
    const sameDay = getStayDatesRange('2026-10-10', '2026-10-10');
    expect(sameDay.valid).toBe(false);
    expect(sameDay.error).toContain('Same-day or inverted stays are rejected');

    const inverted = getStayDatesRange('2026-10-15', '2026-10-10');
    expect(inverted.valid).toBe(false);
    expect(inverted.error).toContain('Same-day or inverted stays are rejected');

    const malformed = getStayDatesRange('invalid-date', '2026-10-12');
    expect(malformed.valid).toBe(false);
  });

  // Test 3: POST /api/v2/stays/holds acquires atomic hold across requested stay dates
  it('Test 3: Successfully acquires atomic hold and increments held_units in inventory_days', async () => {
    // Seed listing & room_type (inventory_count = 2)
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (401, 1001, 'Hold Test Villa', 'Testing holds', 8000, 'villa', 'Road 4', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Deluxe Garden Room', 'deluxe', 8000, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    const res = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-01',
        check_out: '2026-11-04', // 3 nights: Nov 1, 2, 3
        quantity: 1,
        idempotency_key: 'idem-test-hold-001'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.hold).toBeDefined();
    expect(res.body.hold.roomTypeId).toBe(roomTypeId);
    expect(res.body.hold.status).toBe('ACTIVE');
    expect(res.body.hold.quantity).toBe(1);

    // Verify inventory_days were created and held_units incremented
    const daysRes = await pool.query(
      'SELECT calendar_date, total_units, held_units FROM inventory_days WHERE room_type_id = $1 ORDER BY calendar_date ASC',
      [roomTypeId]
    );
    expect(daysRes.rows.length).toBe(3);
    for (const day of daysRes.rows) {
      expect(Number(day.total_units)).toBe(2);
      expect(Number(day.held_units)).toBe(1);
    }

    // Verify booking_hold_nights rows
    const nightsRes = await pool.query(
      'SELECT stay_date, units FROM booking_hold_nights WHERE hold_id = $1 ORDER BY stay_date ASC',
      [res.body.hold.id]
    );
    expect(nightsRes.rows.length).toBe(3);
  });

  // Test 4: Capacity exhaustion returns HTTP 409 with zero partial hold
  it('Test 4: Capacity exhaustion returns HTTP 409 with no partial allocation', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (402, 1001, 'Capacity Test Chalet', 'Testing capacity', 10000, 'chalet', 'Road 5', 'Shimla', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    // Room has inventory_count = 1
    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Chalet Studio', 'studio', 10000, 2, 1)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Hold 1 unit for Nov 1 -> Nov 3 (2 nights)
    const hold1 = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-01',
        check_out: '2026-11-03',
        quantity: 1,
        idempotency_key: 'idem-first-buyer-001'
      })
      .expect(201);
    expect(hold1.body.success).toBe(true);

    // Second guest attempts overlapping dates: Nov 2 -> Nov 4 (1 night overlap on Nov 2)
    const hold2 = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-02',
        check_out: '2026-11-04',
        quantity: 1,
        idempotency_key: 'idem-second-buyer-002'
      })
      .expect(409);

    expect(hold2.body.error).toContain('Insufficient inventory');
    expect(hold2.body.code).toBe('INSUFFICIENT_INVENTORY');
    expect(hold2.body.details.date).toBe('2026-11-02');
    expect(hold2.body.details.availableUnits).toBe(0);

    // Verify NO partial hold was created on Nov 3 for the second buyer
    const nov3Day = await pool.query(
      "SELECT held_units FROM inventory_days WHERE room_type_id = $1 AND calendar_date = '2026-11-03'",
      [roomTypeId]
    );
    // Nov 3 should have held_units = 0 (first hold was Nov 1 and Nov 2, since checkout Nov 3 is excluded)
    // and second buyer's failed hold must NOT have incremented anything
    expect(Number(nov3Day.rows[0].held_units)).toBe(0);
  });

  // Test 5: Idempotency returns identical existing hold
  it('Test 5: Re-submitting with identical idempotency key returns the existing hold (HTTP 200)', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (403, 1001, 'Idempotency Villa', 'Testing idempotency', 7000, 'villa', 'Road 6', 'Manali', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Pine View Suite', 'pine', 7000, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    const firstRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-01',
        check_out: '2026-12-03',
        quantity: 1,
        idempotency_key: 'idem-replay-003'
      })
      .expect(201);

    const secondRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-01',
        check_out: '2026-12-03',
        quantity: 1,
        idempotency_key: 'idem-replay-003'
      })
      .expect(200);

    expect(secondRes.body.hold.id).toBe(firstRes.body.hold.id);
    expect(secondRes.body.hold.status).toBe('ACTIVE');

    // Verify held_units was NOT incremented twice
    const daysRes = await pool.query(
      'SELECT held_units FROM inventory_days WHERE room_type_id = $1',
      [roomTypeId]
    );
    for (const d of daysRes.rows) {
      expect(Number(d.held_units)).toBe(1);
    }
  });

  // Test 6: Maintenance mode returns honest 503 Service Unavailable
  it('Test 6: Maintenance mode rejects hold requests with honest 503', async () => {
    process.env.MAINTENANCE_MODE_HOLDS = 'true';
    try {
      const res = await request(app)
        .post('/api/v2/stays/holds')
        .send({
          room_type_id: 9999,
          check_in: '2026-11-01',
          check_out: '2026-11-03',
          quantity: 1,
          idempotency_key: 'idem-maint-004'
        })
        .expect(503);

      expect(res.body.code).toBe('MAINTENANCE_MODE_ACTIVE');
      expect(res.body.error).toContain('scheduled maintenance');
    } finally {
      delete process.env.MAINTENANCE_MODE_HOLDS;
    }
  });

  // Test 7: Holder authorization on release (unauthorized caller receives 403)
  it('Test 7: Holder authorization prevents unauthorized users from releasing others holds', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (405, 1001, 'Auth Villa', 'Testing auth', 9000, 'villa', 'Road 7', 'Ooty', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Tea Estate Suite', 'tea', 9000, 2, 1)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Guest 1 creates hold
    const holdRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-10',
        check_out: '2026-11-12',
        quantity: 1,
        idempotency_key: 'idem-auth-release-005'
      })
      .expect(201);

    const holdId = holdRes.body.hold.id;

    // Guest 2 tries to release Guest 1's hold -> 403 Forbidden
    const forbiddenRes = await request(app)
      .post(`/api/v2/stays/holds/${holdId}/release`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(forbiddenRes.body.code).toBe('HOLD_RELEASE_FORBIDDEN');

    // Guest 1 releases own hold -> 200 OK
    const okRes = await request(app)
      .post(`/api/v2/stays/holds/${holdId}/release`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(okRes.body.success).toBe(true);

    // Verify held_units restored to 0
    const dayCheck = await pool.query(
      'SELECT held_units FROM inventory_days WHERE room_type_id = $1',
      [roomTypeId]
    );
    expect(Number(dayCheck.rows[0].held_units)).toBe(0);
  });

  // Test 8: Sweeper idempotently expires expired active holds and restores capacity
  it('Test 8: Sweeper expires holds past expires_at and restores held_units exactly once', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (406, 1001, 'Sweeper Villa', 'Testing sweeper', 12000, 'villa', 'Road 8', 'Kochi', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Backwater Suite', 'backwater', 12000, 2, 1)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Create hold
    const holdRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-20',
        check_out: '2026-11-22',
        quantity: 1,
        idempotency_key: 'idem-sweep-006'
      })
      .expect(201);
    const holdId = holdRes.body.hold.id;

    // Manually backdate expires_at to simulate TTL expiration
    await pool.query(
      "UPDATE booking_holds SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [holdId]
    );

    // Run sweeper
    const sweepResult = await sweepExpiredHolds(pool);
    expect(sweepResult.expiredHoldCount).toBe(1);

    // Verify hold status updated to EXPIRED
    const holdCheck = await pool.query('SELECT status, release_reason FROM booking_holds WHERE id = $1', [holdId]);
    expect(holdCheck.rows[0].status).toBe('EXPIRED');
    expect(holdCheck.rows[0].release_reason).toBe('TTL_EXPIRED');

    // Verify inventory capacity restored
    const days = await pool.query('SELECT held_units FROM inventory_days WHERE room_type_id = $1', [roomTypeId]);
    for (const d of days.rows) {
      expect(Number(d.held_units)).toBe(0);
    }

    // Running sweeper a second time does not double-decrement
    const secondSweep = await sweepExpiredHolds(pool);
    expect(secondSweep.expiredHoldCount).toBe(0);
  });

  // Test 9: Migration 005 file structure and constraints audit
  it('Test 9: Migration 005 contains required foreign keys, constraints, and ordered indexes', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/005_inventory_days_and_atomic_holds.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Verify table creations
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS inventory_days');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS booking_holds');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS booking_hold_nights');

    // Verify capacity constraints
    expect(sql).toContain('chk_inventory_days_capacity');
    expect(sql).toContain('held_units + booked_units + blocked_units <= total_units');

    // Verify ordered index for lock ordering
    expect(sql).toContain('idx_inventory_days_room_date ON inventory_days (room_type_id, calendar_date ASC)');

    // Verify date range constraint
    expect(sql).toContain('chk_booking_holds_date_range');
    expect(sql).toContain('check_out_date > check_in_date');
  });

  // Test 10: Real PostgreSQL concurrency certification (proves 100 simultaneous requests constraint)
  it('Test 10: Real PostgreSQL concurrency audit verification (100 simultaneous requests on dedicated test DB)', async () => {
    const { execFileSync } = await import('node:child_process');
    const output = execFileSync(process.execPath, ['--import','tsx','scripts/bench_concurrency_pg.ts'], {
      encoding: 'utf8',
      timeout: 60000,
      env: { PATH:process.env.PATH, HARVO_POSTGRES_BIN:process.env.HARVO_POSTGRES_BIN, NODE_ENV:'test' }
    });
    const lines = output.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const result = JSON.parse(jsonLine);

    // Invariants: EXACTLY 1 succeeds, EXACTLY 99 fail with 409 conflict, 0 unhandled errors
    expect(result.successes).toBe(1);
    expect(result.conflicts).toBe(99);
    expect(result.others).toBe(0);
    expect(result.totalHeldUnits).toBe(2); // 1 held unit * 2 nights
  });

  // Test 11: Legacy calendar block safety — mapped host block prevents hold
  it('Test 11: Mapped host calendar block prevents conflicting hold acquisition', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (410, 1001, 'Block Test Villa', 'Testing blocks', 9000, 'villa', 'Road 10', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Block Room', 'block_tier', 9000, 2, 1)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Host blocks dates Nov 15 -> Nov 18
    const blockRes = await createHostCalendarBlock(pool, {
      listingId,
      roomTypeId,
      startDate: '2026-11-15',
      endDate: '2026-11-18',
      blockSource: 'manual',
      note: 'Maintenance block'
    });
    expect(blockRes.success).toBe(true);
    expect(blockRes.statusCode).toBe(201);

    // Guest attempts to acquire hold overlapping the block (Nov 16 -> Nov 17) -> 409 Conflict
    const holdRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-16',
        check_out: '2026-11-18',
        quantity: 1,
        idempotency_key: 'idem-blocked-dates-011'
      })
      .expect(409);

    expect(holdRes.body.code).toBe('INSUFFICIENT_INVENTORY');
  });

  // Test 12: Active hold prevents conflicting host calendar block
  it('Test 12: Active hold prevents host from placing a conflicting calendar block', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (411, 1001, 'Conflicting Block Villa', 'Testing conflicting blocks', 9500, 'villa', 'Road 11', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Hold First Room', 'first_tier', 9500, 2, 1)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Guest acquires hold for Dec 1 -> Dec 4
    const holdRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-01',
        check_out: '2026-12-04',
        quantity: 1,
        idempotency_key: 'idem-active-hold-first-012'
      })
      .expect(201);
    expect(holdRes.body.success).toBe(true);

    // Host attempts to block Dec 2 -> Dec 5 -> must fail with 409 BLOCK_CONFLICT_EXISTS
    const blockRes = await createHostCalendarBlock(pool, {
      listingId,
      roomTypeId,
      startDate: '2026-12-02',
      endDate: '2026-12-05'
    });
    expect(blockRes.success).toBe(false);
    expect(blockRes.statusCode).toBe(409);
    expect(blockRes.code).toBe('BLOCK_CONFLICT_EXISTS');
  });

  // Test 13: Ambiguous legacy calendar block fails closed and logs to legacy_block_conflict_ledger
  it('Test 13: Ambiguous legacy block fails closed (HTTP 409) and logs to conflict ledger', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (412, 1001, 'Ambiguous Legacy Villa', 'Testing ambiguous block', 11000, 'villa', 'Road 12', 'Coorg', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Coorg Suite', 'suite', 11000, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Insert an unmapped/ambiguous legacy block (room_tier_key = 'all', room_type_id is NULL)
    await pool.query(`
      INSERT INTO room_calendar_blocks (listing_id, room_type_id, room_tier_key, room_name, start_date, end_date, mapping_status)
      VALUES ($1, NULL, 'all', 'Entire Estate', '2026-11-25', '2026-11-28', 'ambiguous')
    `, [listingId]);

    // Guest attempts hold overlapping the ambiguous block
    const holdRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-11-26',
        check_out: '2026-11-28',
        quantity: 1,
        idempotency_key: 'idem-ambiguous-fail-closed-013'
      })
      .expect(409);

    expect(holdRes.body.code).toBe('CALENDAR_BLOCK_CONFLICT');

    // Verify conflict record was inserted into legacy_block_conflict_ledger
    const ledgerRes = await pool.query(
      'SELECT * FROM legacy_block_conflict_ledger WHERE listing_id = $1',
      [listingId]
    );
    expect(ledgerRes.rows.length).toBe(1);
    expect(ledgerRes.rows[0].conflict_reason).toContain('Ambiguous legacy calendar block');
  });

  // Test 14: Principal-bound idempotency — same principal, same key, different payload returns 409
  it('Test 14: Same principal with same idempotency key but different fingerprint returns 409', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (413, 1001, 'Fingerprint Villa', 'Testing fingerprint', 8500, 'villa', 'Road 13', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Fingerprint Room', 'fp_tier', 8500, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // First request
    await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-05',
        check_out: '2026-12-07',
        quantity: 1,
        idempotency_key: 'idem-fingerprint-mismatch-key'
      })
      .expect(201);

    // Replay with DIFFERENT quantity (2 instead of 1) -> 409 IDEMPOTENCY_MISMATCH
    const replayRes = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-05',
        check_out: '2026-12-07',
        quantity: 2,
        idempotency_key: 'idem-fingerprint-mismatch-key'
      })
      .expect(409);

    expect(replayRes.body.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  // Test 15: Different principal with same idempotency key gets separate isolated hold
  it('Test 15: Different principal using same idempotency key gets isolated hold without collision', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (414, 1001, 'Principal Isolation Villa', 'Testing isolation', 9000, 'villa', 'Road 14', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Isolation Room', 'iso_tier', 9000, 2, 3)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    const commonIdempotencyKey = 'shared-idempotency-key-015';

    // Guest 1 acquires hold
    const hold1 = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-20',
        check_out: '2026-12-22',
        quantity: 1,
        idempotency_key: commonIdempotencyKey
      })
      .expect(201);

    // Guest 2 acquires hold with IDENTICAL key -> receives own separate hold (201)
    const hold2 = await request(app)
      .post('/api/v2/stays/holds')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-20',
        check_out: '2026-12-22',
        quantity: 1,
        idempotency_key: commonIdempotencyKey
      })
      .expect(201);

    expect(hold1.body.hold.id).not.toBe(hold2.body.hold.id);
    expect(hold1.body.hold.quantity).toBe(1);
    expect(hold2.body.hold.quantity).toBe(1);

    // Total held units in inventory_days must be 2
    const dayRes = await pool.query('SELECT held_units FROM inventory_days WHERE room_type_id = $1', [roomTypeId]);
    for (const d of dayRes.rows) {
      expect(Number(d.held_units)).toBe(2);
    }
  });

  // Test 16: Anonymous holds require server-signed HttpOnly cookie; untrusted headers rejected
  it('Test 16: Anonymous hold requires server-signed cookie; sets signed cookie on first visit', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (415, 1001, 'Cookie Villa', 'Testing cookies', 7500, 'villa', 'Road 15', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Cookie Room', 'cookie_tier', 7500, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Anonymous request without Authorization header
    const res = await request(app)
      .post('/api/v2/stays/holds')
      .send({
        room_type_id: roomTypeId,
        check_in: '2026-12-25',
        check_out: '2026-12-27',
        quantity: 1,
        idempotency_key: 'idem-cookie-test-016'
      })
      .expect(201);

    // Verify Set-Cookie header contains server-signed encho_guest_session
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const guestCookie = Array.isArray(setCookie) ? setCookie.find(c => c.startsWith('encho_guest_session=')) : setCookie;
    expect(guestCookie).toBeDefined();
    expect(guestCookie).toContain('HttpOnly');

    // Extract cookie value and verify signature using verifyGuestSession
    const rawCookieVal = guestCookie.split(';')[0].replace('encho_guest_session=', '');
    const verifiedSessionUuid = verifyGuestSession(rawCookieVal);
    expect(verifiedSessionUuid).toBeTruthy();

    // Verify hold in DB was bound to principal session:<uuid>
    const holdCheck = await pool.query('SELECT holder_principal FROM booking_holds WHERE id = $1', [res.body.hold.id]);
    expect(holdCheck.rows[0].holder_principal).toBe(`session:${verifiedSessionUuid}`);
  });

  // Test 17: Production cookie transport security attributes (Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age)
  it('Test 17: Production cookie transport sets Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const listingRes = await pool.query(`
        INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
        VALUES (416, 1001, 'Secure Cookie Villa', 'Testing secure cookies', 7800, 'villa', 'Road 16', 'Goa', 'published')
        RETURNING id;
      `);
      const listingId = listingRes.rows[0].id;

      const roomRes = await pool.query(`
        INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
        VALUES ($1, 'Secure Cookie Room', 'sec_tier', 7800, 2, 2)
        RETURNING id;
      `, [listingId]);
      const roomTypeId = roomRes.rows[0].id;

      const res = await request(app)
        .post('/api/v2/stays/holds')
        .send({
          room_type_id: roomTypeId,
          check_in: '2026-12-28',
          check_out: '2026-12-30',
          quantity: 1,
          idempotency_key: 'idem-prod-cookie-017'
        })
        .expect(201);

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const guestCookie = Array.isArray(setCookie) ? setCookie.find(c => c.startsWith('encho_guest_session=')) : setCookie;
      expect(guestCookie).toBeDefined();
      expect(guestCookie).toContain('HttpOnly');
      expect(guestCookie).toContain('Secure');
      expect(guestCookie).toContain('SameSite=Lax');
      expect(guestCookie).toContain('Path=/');
      expect(guestCookie).toContain('Max-Age=604800');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // Test 18: Real PostgreSQL integration test proving 409 response and durable ledger row both survive rollback
  it('Test 18: Real PostgreSQL test proves 409 response and durable ledger row both survive hold transaction rollback', async () => {
    const disposableDbUrl = 'postgresql://ajit@127.0.0.1:5439/encho_disposable_test';
    const disposablePool = new Pool({
      connectionString: disposableDbUrl
    });

    try {
      // Seed test property
      await disposablePool.query('DELETE FROM legacy_block_conflict_ledger');
      await disposablePool.query('DELETE FROM room_calendar_blocks');
      await disposablePool.query('DELETE FROM booking_hold_nights');
      await disposablePool.query('DELETE FROM booking_holds');
      await disposablePool.query('DELETE FROM inventory_days');
      await disposablePool.query('DELETE FROM room_types');
      await disposablePool.query('DELETE FROM listings');
      await disposablePool.query('DELETE FROM users');

      await disposablePool.query("INSERT INTO users (id, email, name) VALUES (850, 'host_rollback@encho.space', 'Rollback Host')");
      await disposablePool.query("INSERT INTO listings (id, user_id, title, city, price, type) VALUES (850, 850, 'Rollback Villa', 'Goa', 10000, 'villa')");
      await disposablePool.query("INSERT INTO room_types (id, listing_id, name, inventory_count) VALUES (850, 850, 'Rollback Suite', 2)");

      // Insert an ambiguous legacy block (room_tier_key = 'all', room_type_id IS NULL)
      const bRes = await disposablePool.query(`
        INSERT INTO room_calendar_blocks (listing_id, room_type_id, room_tier_key, room_name, start_date, end_date, mapping_status)
        VALUES (850, NULL, 'all', 'Estate Grounds', '2026-11-20', '2026-11-25', 'ambiguous')
        RETURNING id;
      `);
      const blockId = bRes.rows[0].id;

      // Attempt hold 1: must return 409
      const holdRes1 = await acquireHold(disposablePool, {
        roomTypeId: 850,
        checkIn: '2026-11-21',
        checkOut: '2026-11-23',
        quantity: 1,
        idempotencyKey: 'idem-test-durable-ledger-018-1',
        holderPrincipal: 'user:8501'
      });

      expect(holdRes1.success).toBe(false);
      expect(holdRes1.statusCode).toBe(409);
      expect(holdRes1.code).toBe('CALENDAR_BLOCK_CONFLICT');

      // Verify ZERO inventory was mutated in inventory_days
      const dayCheck = await disposablePool.query(
        'SELECT * FROM inventory_days WHERE room_type_id = 850'
      );
      expect(dayCheck.rows.length).toBe(0);

      // Verify conflict ledger row was written in separate committed transaction and SURVIVED the rollback
      const ledgerCheck1 = await disposablePool.query(
        'SELECT * FROM legacy_block_conflict_ledger WHERE block_id = $1',
        [blockId]
      );
      expect(ledgerCheck1.rows.length).toBe(1);
      expect(ledgerCheck1.rows[0].conflict_reason).toContain('Ambiguous legacy calendar block');

      // Attempt hold 2 (repeat attempt / retry): must return 409 AND not duplicate conflict ledger row
      const holdRes2 = await acquireHold(disposablePool, {
        roomTypeId: 850,
        checkIn: '2026-11-21',
        checkOut: '2026-11-23',
        quantity: 1,
        idempotencyKey: 'idem-test-durable-ledger-018-2',
        holderPrincipal: 'user:8502'
      });
      expect(holdRes2.statusCode).toBe(409);

      // Verify uniqueness boundary prevented retry storm: count remains exactly 1
      const ledgerCheck2 = await disposablePool.query(
        'SELECT * FROM legacy_block_conflict_ledger WHERE block_id = $1',
        [blockId]
      );
      expect(ledgerCheck2.rows.length).toBe(1);
    } finally {
      await disposablePool.end();
    }
  });

  // Test 19: Real PostgreSQL test for pre-existing mapped room_calendar_block prevents hold
  it('Test 19: Real PostgreSQL test proves pre-existing mapped legacy block is reconciled into blocked_units and prevents hold', async () => {
    const disposableDbUrl = 'postgresql://ajit@127.0.0.1:5439/encho_disposable_test';
    const disposablePool = new Pool({
      connectionString: disposableDbUrl
    });

    try {
      await disposablePool.query('DELETE FROM legacy_block_conflict_ledger');
      await disposablePool.query('DELETE FROM room_calendar_blocks');
      await disposablePool.query('DELETE FROM booking_hold_nights');
      await disposablePool.query('DELETE FROM booking_holds');
      await disposablePool.query('DELETE FROM inventory_days');
      await disposablePool.query('DELETE FROM room_types');
      await disposablePool.query('DELETE FROM listings');
      await disposablePool.query('DELETE FROM users');

      await disposablePool.query("INSERT INTO users (id, email, name) VALUES (860, 'host_mapped@encho.space', 'Mapped Host')");
      await disposablePool.query("INSERT INTO listings (id, user_id, title, city, price, type) VALUES (860, 860, 'Mapped Villa', 'Goa', 12000, 'villa')");
      // Single unit room (inventory_count = 1)
      await disposablePool.query("INSERT INTO room_types (id, listing_id, name, inventory_count) VALUES (860, 860, 'Mapped Luxury Suite', 1)");

      // Insert pre-existing mapped room_calendar_block (created out-of-band or by legacy host sync)
      await disposablePool.query(`
        INSERT INTO room_calendar_blocks (listing_id, room_type_id, start_date, end_date, block_source, mapping_status)
        VALUES (860, 860, '2026-12-01', '2026-12-05', 'legacy_sync', 'mapped')
      `);

      // Guest attempts to acquire hold for Dec 2 -> Dec 4 overlapping the pre-existing block
      const holdRes = await acquireHold(disposablePool, {
        roomTypeId: 860,
        checkIn: '2026-12-02',
        checkOut: '2026-12-04',
        quantity: 1,
        idempotencyKey: 'idem-test-preexisting-mapped-019',
        holderPrincipal: 'user:8601'
      });

      // Must fail closed with capacity exhaustion because mapped block was reconciled into blocked_units
      expect(holdRes.success).toBe(false);
      expect(holdRes.statusCode).toBe(409);
      expect(holdRes.code).toBe('INSUFFICIENT_INVENTORY');

      // Verify blocked_units in inventory_days was reconciled to 1 and held_units is 0
      const daysCheck = await disposablePool.query(
        'SELECT calendar_date, total_units, held_units, blocked_units FROM inventory_days WHERE room_type_id = 860 ORDER BY calendar_date ASC'
      );
      expect(daysCheck.rows.length).toBe(2);
      for (const day of daysCheck.rows) {
        expect(Number(day.blocked_units)).toBe(1);
        expect(Number(day.held_units)).toBe(0);
      }
    } finally {
      await disposablePool.end();
    }
  });

  // Test 20: Non-destructive historical preservation — duplicate historical ledger rows survive unchanged
  it('Test 20: Real PostgreSQL test proves pre-existing duplicate historical ledger rows survive without deletion or mutation', async () => {
    const disposableDbUrl = 'postgresql://ajit@127.0.0.1:5439/encho_disposable_test';
    const disposablePool = new Pool({
      connectionString: disposableDbUrl
    });

    try {
      await disposablePool.query('DELETE FROM legacy_block_conflict_ledger');
      await disposablePool.query('DELETE FROM room_calendar_blocks');
      await disposablePool.query('DELETE FROM booking_hold_nights');
      await disposablePool.query('DELETE FROM booking_holds');
      await disposablePool.query('DELETE FROM inventory_days');
      await disposablePool.query('DELETE FROM room_types');
      await disposablePool.query('DELETE FROM listings');
      await disposablePool.query('DELETE FROM users');

      await disposablePool.query("INSERT INTO users (id, email, name) VALUES (870, 'host_hist@encho.space', 'Historical Host')");
      await disposablePool.query("INSERT INTO listings (id, user_id, title, city, price, type) VALUES (870, 870, 'Historical Villa', 'Goa', 9000, 'villa')");
      await disposablePool.query("INSERT INTO room_types (id, listing_id, name, inventory_count) VALUES (870, 870, 'Historical Suite', 2)");

      const bRes = await disposablePool.query(`
        INSERT INTO room_calendar_blocks (listing_id, room_type_id, room_tier_key, room_name, start_date, end_date, mapping_status)
        VALUES (870, NULL, 'all', 'Estate Historical', '2026-12-10', '2026-12-15', 'ambiguous')
        RETURNING id;
      `);
      const blockId = bRes.rows[0].id;

      // Seed 2 duplicate historical rows with NULL dedupe_key (simulating legacy data prior to migration 007)
      await disposablePool.query(`
        INSERT INTO legacy_block_conflict_ledger (listing_id, block_id, room_tier_key, room_name, start_date, end_date, conflict_reason, dedupe_key)
        VALUES
          (870, $1, 'all', 'Estate Historical', '2026-12-10', '2026-12-15', 'Legacy conflict reason 1', NULL),
          (870, $1, 'all', 'Estate Historical', '2026-12-10', '2026-12-15', 'Legacy conflict reason 1', NULL)
      `, [blockId]);

      // Verify both historical rows exist
      const preCheck = await disposablePool.query(
        'SELECT id, conflict_reason, dedupe_key FROM legacy_block_conflict_ledger WHERE block_id = $1',
        [blockId]
      );
      expect(preCheck.rows.length).toBe(2);

      // Attempt hold which triggers ambiguous block detection for this block
      const holdRes = await acquireHold(disposablePool, {
        roomTypeId: 870,
        checkIn: '2026-12-11',
        checkOut: '2026-12-13',
        quantity: 1,
        idempotencyKey: 'idem-test-hist-preserve-020',
        holderPrincipal: 'user:8701'
      });
      expect(holdRes.statusCode).toBe(409);

      // Verify both original historical rows survive completely untouched, plus 1 new fingerprint-deduped row
      const postCheck = await disposablePool.query(
        'SELECT id, conflict_reason, dedupe_key FROM legacy_block_conflict_ledger WHERE block_id = $1 ORDER BY id ASC',
        [blockId]
      );
      expect(postCheck.rows.length).toBe(3);
      expect(postCheck.rows[0].dedupe_key).toBeNull();
      expect(postCheck.rows[1].dedupe_key).toBeNull();
      expect(postCheck.rows[2].dedupe_key).toBeTruthy(); // New fingerprint-deduped row
    } finally {
      await disposablePool.end();
    }
  });

  // Test 21: Forced conflict ledger write failure fails closed with HTTP 500 and does NOT return a successful-looking 409
  it('Test 21: Forced conflict ledger write failure returns HTTP 500 fail-closed without claiming durable conflict recording', async () => {
    // Create a mock pool whose query rejects specifically on legacy_block_conflict_ledger INSERT
    const realConnect = pool.connect.bind(pool);
    const faultyPool = {
      connect: async () => {
        const client = await realConnect();
        return client;
      },
      query: async (sql: string, params?: any[]) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO legacy_block_conflict_ledger')) {
          throw new Error('SIMULATED_DISK_FULL: Conflict ledger write failed');
        }
        return pool.query(sql, params);
      }
    };

    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (417, 1001, 'Fault Villa', 'Testing ledger failure', 8000, 'villa', 'Road 17', 'Goa', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count)
      VALUES ($1, 'Fault Room', 'fault_tier', 8000, 2, 2)
      RETURNING id;
    `, [listingId]);
    const roomTypeId = roomRes.rows[0].id;

    // Ambiguous legacy block
    await pool.query(`
      INSERT INTO room_calendar_blocks (listing_id, room_type_id, room_tier_key, room_name, start_date, end_date, mapping_status)
      VALUES ($1, NULL, 'all', 'Estate Grounds', '2026-11-20', '2026-11-25', 'ambiguous')
    `, [listingId]);

    const res = await acquireHold(faultyPool, {
      roomTypeId,
      checkIn: '2026-11-21',
      checkOut: '2026-11-23',
      quantity: 1,
      idempotencyKey: 'idem-faulty-ledger-021',
      holderPrincipal: 'user:4171'
    });

    // Invariant: Must return 500 CONFLICT_LEDGER_WRITE_FAILED, never a deceptive 409
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.code).toBe('CONFLICT_LEDGER_WRITE_FAILED');
  });
});

