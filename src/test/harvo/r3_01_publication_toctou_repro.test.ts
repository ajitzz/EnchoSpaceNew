import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import net from 'node:net';
import { createLocalPostgresFixture } from './postgres.js';

const JWT_SECRET = 'encho-isolated-test-signing-key-not-a-production-secret';

function createAuthToken(user: { id: number; email: string; role: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

describe('R3-01 Publication TOCTOU Remediation — Mounted Route & Real PG Interleaving', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let proxy: net.Server;
  let pool: any;
  let app: any;
  let validatePropertyPublication: any;

  const adminId = 999;
  const hostId = 1001;
  const adminToken = createAuthToken({ id: adminId, email: 'admin@encho.space', role: 'admin' });

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    pool = fixture.pool;

    const socketDir = pool.options.host;
    const port = pool.options.port;
    const socketPath = `${socketDir}/.s.PGSQL.${port}`;

    proxy = net.createServer((sock) => {
      const pgSock = net.connect(socketPath);
      sock.pipe(pgSock).pipe(sock);
      sock.on('error', () => pgSock.destroy());
      pgSock.on('error', () => sock.destroy());
    });

    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', () => resolve()));
    const proxyPort = (proxy.address() as net.AddressInfo).port;

    process.env.DATABASE_URL = `postgresql://harvo_test@127.0.0.1:${proxyPort}/postgres`;
    process.env.JWT_SECRET = JWT_SECRET;

    // Create required tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user'
      );
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        price DECIMAL,
        type TEXT,
        address TEXT,
        city TEXT,
        publication_status TEXT NOT NULL DEFAULT 'draft'
      );
      CREATE TABLE IF NOT EXISTS room_types (
        id SERIAL PRIMARY KEY,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        base_price DECIMAL NOT NULL DEFAULT 0,
        max_occupancy INT DEFAULT 2,
        inventory_count INT DEFAULT 1,
        min_stay_nights INT DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS media_assets (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT NOT NULL,
        url TEXT NOT NULL,
        tier VARCHAR(100) DEFAULT 'common',
        category VARCHAR(50) NOT NULL DEFAULT 'other',
        room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL,
        moderation_status VARCHAR(50) DEFAULT 'pending_review',
        is_sleeping_area BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INT REFERENCES users(id) ON DELETE SET NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        ip_address VARCHAR(255),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS host_marketing_campaigns (
        id SERIAL PRIMARY KEY,
        host_id INT,
        listing_id INT,
        status VARCHAR(50)
      );
      CREATE TABLE IF NOT EXISTS threads (
        id SERIAL PRIMARY KEY
      );
    `);

    await pool.query(`
      INSERT INTO users (id, email, name, role) VALUES
        (${adminId}, 'admin@encho.space', 'Fixture Admin', 'admin'),
        (${hostId}, 'host@encho.space', 'Fixture Host', 'host')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);

    // Dynamically import server AFTER DATABASE_URL is configured on the loopback proxy
    const serverModule = await import('../../../server.js');
    app = serverModule.default;
    validatePropertyPublication = serverModule.validatePropertyPublication;
  }, 30000);

  afterAll(async () => {
    proxy?.close();
    await fixture?.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM admin_audit_logs');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
  });

  it('prevents TOCTOU publication and returns 422 when approved room photos drop below 3 while route waits on listing lock', async () => {
    const connA = await pool.connect();
    const connB = await pool.connect();

    try {
      // 1. Seed listing with 1 room and exactly 3 approved room photos (1 sleeping area)
      const listRes = await pool.query(`
        INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
        VALUES (801, ${hostId}, 'TOCTOU Proof Villa', 'Testing TOCTOU race', 15000, 'villa', 'Forest Rd 1', 'Wayanad', 'draft')
        RETURNING id;
      `);
      const listingId = listRes.rows[0].id;

      const roomRes = await pool.query(`
        INSERT INTO room_types (id, listing_id, name, type, base_price, max_occupancy)
        VALUES (8011, ${listingId}, 'Highland Suite', 'suite', 15000, 2)
        RETURNING id;
      `);
      const roomId = roomRes.rows[0].id;

      await pool.query(`
        INSERT INTO media_assets (id, entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
        VALUES
          (8001, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/p1.jpg', 'approved', true),
          (8002, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/p2.jpg', 'approved', false),
          (8003, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/p3.jpg', 'approved', false);
      `);

      // Pre-check invariant: listing currently satisfies PROPOSED-007 (3 approved photos, 1 sleeping area)
      const preCheck = await validatePropertyPublication(listingId, pool);
      expect(preCheck.valid).toBe(true);
      expect(preCheck.roomSummaries[0].approvedPhotosCount).toBe(3);

      // 2. Step 1: Hold exclusive row lock on listing via Connection A
      await connA.query('BEGIN');
      await connA.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

      // 3. Step 2: Start mounted PATCH publication on the real application route.
      // Supertest requests are lazy until .then() is invoked; attach .then(res => res) to dispatch immediately.
      const patchPromise = request(app)
        .patch(`/api/admin/listings/${listingId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ publication_status: 'published' })
        .then(res => res);

      // 4. Step 3: Inspect pg_stat_activity to confirm the production route is actively blocked on the listing row lock
      let isWaitingOnLock = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const check = await connB.query(`
          SELECT pid, query, state, wait_event_type, wait_event
          FROM pg_stat_activity
          WHERE state = 'active'
            AND wait_event_type = 'Lock'
            AND query LIKE '%listings%FOR UPDATE%'
            AND pid <> pg_backend_pid()
        `);
        if (check.rows.length > 0) {
          isWaitingOnLock = true;
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      try {
        expect(isWaitingOnLock).toBe(true);

        // 5. Step 4: On independent Connection B, reject one approved room photo and commit.
        // Updating media_assets does NOT touch listings, so it succeeds and commits immediately.
        await connB.query('BEGIN');
        await connB.query(`
          UPDATE media_assets
          SET moderation_status = 'rejected'
          WHERE id = 8003
        `);
        await connB.query('COMMIT');

        // Verify DB facts now have only 2 approved photos for the room
        const dbCount = await connB.query(
          "SELECT COUNT(*) FROM media_assets WHERE entity_id = $1 AND room_type_id = $2 AND moderation_status = 'approved'",
          [listingId, roomId]
        );
        expect(Number(dbCount.rows[0].count)).toBe(2);
      } finally {
        // 6. Step 5: Release Connection A's lock on listings so the waiting PATCH request can proceed.
        await connA.query('COMMIT');
      }

      // 7. Step 6: Await real mounted route response. With atomic FOR UPDATE before validation,
      // the route validates fresh DB facts and rejects publication with 422!
      const patchRes = await patchPromise;
      expect(patchRes.status).toBe(422);
      expect(patchRes.body.error).toContain('PROPOSED-007');
      expect(patchRes.body.details.some((d: string) => d.includes('Minimum 3 approved room-specific photos'))).toBe(true);

      // 8. Step 7: Invariant Assertion (Remediated)
      // The listing in the database MUST remain in 'draft' and NOT have transitioned to 'published'
      const listingInDb = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
      expect(listingInDb.rows[0].publication_status).toBe('draft');

      const postValidation = await validatePropertyPublication(listingId, pool);
      expect(postValidation.valid).toBe(false);
      expect(postValidation.roomSummaries[0].approvedPhotosCount).toBe(2);
    } finally {
      try { await connA.query('ROLLBACK'); } catch (_err) { void _err; }
      try { await connB.query('ROLLBACK'); } catch (_err) { void _err; }
      connA.release();
      connB.release();
    }
  });

  it('prevents TOCTOU publication and returns 422 when sleeping-area photo is unflagged while route waits on listing lock', async () => {
    const connA = await pool.connect();
    const connB = await pool.connect();

    try {
      // 1. Seed listing with 1 room and 3 approved photos where Photo 8101 is the ONLY sleeping area photo
      const listRes = await pool.query(`
        INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
        VALUES (802, ${hostId}, 'TOCTOU Sleeping Area Villa', 'Testing sleeping area race', 18000, 'villa', 'Valley Rd 2', 'Munnar', 'draft')
        RETURNING id;
      `);
      const listingId = listRes.rows[0].id;

      const roomRes = await pool.query(`
        INSERT INTO room_types (id, listing_id, name, type, base_price, max_occupancy)
        VALUES (8021, ${listingId}, 'Canopy Villa', 'villa', 18000, 2)
        RETURNING id;
      `);
      const roomId = roomRes.rows[0].id;

      await pool.query(`
        INSERT INTO media_assets (id, entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
        VALUES
          (8101, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/sa1.jpg', 'approved', true),
          (8102, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/sa2.jpg', 'approved', false),
          (8103, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/sa3.jpg', 'approved', false);
      `);

      // 2. Step 1: Hold exclusive row lock on listing via Connection A
      await connA.query('BEGIN');
      await connA.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

      // 3. Step 2: Start mounted PATCH publication on the real application route
      const patchPromise = request(app)
        .patch(`/api/admin/listings/${listingId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ publication_status: 'published' })
        .then(res => res);

      // 4. Step 3: Inspect pg_stat_activity to confirm the production route is blocked on FOR UPDATE
      let isWaitingOnLock = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const check = await connB.query(`
          SELECT pid, query, state, wait_event_type, wait_event
          FROM pg_stat_activity
          WHERE state = 'active'
            AND wait_event_type = 'Lock'
            AND query LIKE '%listings%FOR UPDATE%'
            AND pid <> pg_backend_pid()
        `);
        if (check.rows.length > 0) {
          isWaitingOnLock = true;
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      try {
        expect(isWaitingOnLock).toBe(true);

        // 5. Step 4: On independent Connection B, toggle is_sleeping_area to false on photo 8101
        await connB.query('BEGIN');
        await connB.query(`
          UPDATE media_assets
          SET is_sleeping_area = false
          WHERE id = 8101
        `);
        await connB.query('COMMIT');
      } finally {
        // 6. Step 5: Release Connection A's lock on listings
        await connA.query('COMMIT');
      }

      // 7. Step 6: Await real mounted route response. With FOR UPDATE held before validation,
      // route validates fresh DB facts and returns 422!
      const patchRes = await patchPromise;
      expect(patchRes.status).toBe(422);
      expect(patchRes.body.error).toContain('PROPOSED-007');
      expect(patchRes.body.details.some((d: string) => d.includes('sleeping area'))).toBe(true);

      // 8. Step 7: Invariant Assertion (Remediated)
      const listingInDb = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
      expect(listingInDb.rows[0].publication_status).toBe('draft');

      const postValidation = await validatePropertyPublication(listingId, pool);
      expect(postValidation.valid).toBe(false);
      expect(postValidation.roomSummaries[0].sleepingAreaPhotosCount).toBe(0);
    } finally {
      try { await connA.query('ROLLBACK'); } catch (_err) { void _err; }
      try { await connB.query('ROLLBACK'); } catch (_err) { void _err; }
      connA.release();
      connB.release();
    }
  });

  it('ensures transaction rollback on validation failure releases row lock and preserves draft state', async () => {
    // 1. Seed listing with room but only 1 approved photo (fails PROPOSED-007 validation)
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (803, ${hostId}, 'Rollback Verification Villa', 'Testing rollback', 12000, 'villa', 'Cliffside 3', 'Varkala', 'draft')
      RETURNING id;
    `);
    const listingId = listRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (id, listing_id, name, type, base_price, max_occupancy)
      VALUES (8031, ${listingId}, 'Cliff Suite', 'suite', 12000, 2)
      RETURNING id;
    `);
    const roomId = roomRes.rows[0].id;

    await pool.query(`
      INSERT INTO media_assets (id, entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
      VALUES (8201, 'listing', ${listingId}, ${roomId}, 'https://cdn.test/single.jpg', 'approved', true);
    `);

    // 2. Dispatch PATCH publication attempt
    const patchRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });

    expect(patchRes.status).toBe(422);
    expect(patchRes.body.error).toContain('PROPOSED-007');

    // 3. Confirm listing remains in draft state
    const checkDb = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(checkDb.rows[0].publication_status).toBe('draft');

    // 4. Verify client connection was properly released and row lock was freed
    // (A new transaction on an independent connection must immediately acquire FOR UPDATE without blocking)
    const connA = await pool.connect();
    try {
      await connA.query('BEGIN');
      const lockCheck = await connA.query('SELECT id, publication_status FROM listings WHERE id = $1 FOR UPDATE NOWAIT', [listingId]);
      expect(lockCheck.rows.length).toBe(1);
      expect(lockCheck.rows[0].publication_status).toBe('draft');
      await connA.query('COMMIT');
    } finally {
      try { await connA.query('ROLLBACK'); } catch (_err) { void _err; }
      connA.release();
    }
  });

  it('REGRESSION: unassigned media (room_type_id NULL) cannot satisfy publication, while common-tier bound media does', async () => {
    const listingId = 804;
    const roomId = 8041;
    const asset1Id = 8301;
    const asset2Id = 8302;
    const asset3Id = 8303;

    // 1. Seed listing with 1 room and 2 approved room photos using parameterized values
    await pool.query(
      `INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [listingId, hostId, 'Common Tier Proof Villa', 'Testing tier vs room_type_id', 14000, 'villa', 'Cliffside 4', 'Wayanad', 'draft']
    );

    await pool.query(
      `INSERT INTO room_types (id, listing_id, name, type, base_price, max_occupancy)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roomId, listingId, 'Terrace Room', 'terrace', 14000, 2]
    );

    // Insert 2 room photos with tier = 'common' (both approved, one sleeping area)
    // plus 1 unassigned photo with tier = 'common' (approved, sleeping area, but room_type_id IS NULL)
    await pool.query(
      `INSERT INTO media_assets (id, entity_type, entity_id, room_type_id, url, tier, moderation_status, is_sleeping_area)
       VALUES
         ($1, 'listing', $2, $3, 'https://cdn.test/r1.jpg', 'common', 'approved', true),
         ($4, 'listing', $2, $3, 'https://cdn.test/r2.jpg', 'common', 'approved', false),
         ($5, 'listing', $2, NULL, 'https://cdn.test/unassigned.jpg', 'common', 'approved', true)`,
      [asset1Id, listingId, roomId, asset2Id, asset3Id]
    );

    // The unassigned asset 8303 cannot count toward room minimum. Room has only 2 approved photos -> fails validation
    const failRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });

    expect(failRes.status).toBe(422);
    expect(failRes.body.error).toContain('PROPOSED-007');
    expect(failRes.body.details.some((d: string) => d.includes('only 2 approved photo(s)'))).toBe(true);

    // 2. Admin binds asset 8303 to roomId via mounted Admin moderation API (omitting moderation_status)
    // Under reviewed authority, reassigning room association resets status to pending_review and writes an audit log
    const bindRes = await request(app)
      .patch(`/api/admin/media-assets/${asset3Id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomId });

    expect(bindRes.status).toBe(200);
    expect(bindRes.body.success).toBe(true);
    expect(bindRes.body.assetId).toBe(asset3Id);

    // Assert pending status after reassignment in database, while tier remains 'common'
    const pendingCheck = await pool.query(
      'SELECT room_type_id, moderation_status, tier, is_sleeping_area FROM media_assets WHERE id = $1',
      [asset3Id]
    );
    expect(pendingCheck.rows[0].room_type_id).toBe(roomId);
    expect(pendingCheck.rows[0].moderation_status).toBe('pending_review');
    expect(pendingCheck.rows[0].tier).toBe('common');
    expect(pendingCheck.rows[0].is_sleeping_area).toBe(true);

    // Assert immutable audit receipt was recorded for room reassignment
    const audit1Check = await pool.query(
      'SELECT action, entity_id, new_state FROM admin_audit_logs WHERE entity_id = $1 AND entity_type = $2 ORDER BY created_at DESC',
      [asset3Id, 'media_asset']
    );
    expect(audit1Check.rows.length).toBe(1);
    expect(audit1Check.rows[0].action).toBe('moderate_media_asset');
    expect(audit1Check.rows[0].new_state.room_type_id).toBe(roomId);
    expect(audit1Check.rows[0].new_state.moderation_status).toBe('pending_review');

    // Publication attempt while asset is pending_review MUST still fail (pending photos cannot satisfy minimum)
    const pendingPublishRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });

    expect(pendingPublishRes.status).toBe(422);

    // 3. Admin explicitly reapproves the reassigned photo via mounted Admin moderation API
    const approveRes = await request(app)
      .patch(`/api/admin/media-assets/${asset3Id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    // Assert approved status and immutable audit receipt
    const approvedCheck = await pool.query(
      'SELECT room_type_id, moderation_status, tier, is_sleeping_area FROM media_assets WHERE id = $1',
      [asset3Id]
    );
    expect(approvedCheck.rows[0].room_type_id).toBe(roomId);
    expect(approvedCheck.rows[0].moderation_status).toBe('approved');
    expect(approvedCheck.rows[0].tier).toBe('common');

    const audit2Check = await pool.query(
      'SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id = $1 AND entity_type = $2',
      [asset3Id, 'media_asset']
    );
    expect(Number(audit2Check.rows[0].count)).toBe(2);

    // 4. Publish through mounted route: common tier does NOT prevent publication when bound and approved
    const passRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });

    expect(passRes.status).toBe(200);
    expect(passRes.body.publication_status).toBe('published');

    const dbCheck = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(dbCheck.rows[0].publication_status).toBe('published');
  });
});
