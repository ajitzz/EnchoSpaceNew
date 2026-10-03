import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import { moderateMediaAsset } from '../../server/media/mediaModerationService.js';
import { validatePropertyPublication } from '../../server/listings/publicationValidation.js';

describe('Admin Media Moderation Service — Atomic Transaction & Rollback on Disposable PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  const adminId = 999;
  const hostId = 888;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    const pool = fixture.pool;

    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE listings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        publication_status TEXT NOT NULL DEFAULT 'draft'
      );

      CREATE TABLE room_types (
        id SERIAL PRIMARY KEY,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        base_price DECIMAL NOT NULL DEFAULT 0,
        max_occupancy INT DEFAULT 2,
        inventory_count INT DEFAULT 1,
        min_stay_nights INT DEFAULT 1
      );

      CREATE TABLE media_assets (
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

      CREATE TABLE admin_audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INT REFERENCES users(id) ON DELETE SET NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        ip_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (id, email, role) VALUES
        (${adminId}, 'admin@encho.space', 'admin'),
        (${hostId}, 'host@encho.space', 'host');
    `);
  }, 30000);

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(async () => {
    const pool = fixture.pool;
    // Ensure audit logs table does not have lingering constraints from previous tests
    await pool.query('ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS fail_trigger');
    await pool.query('DELETE FROM admin_audit_logs');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
    await pool.query("UPDATE users SET role = 'admin', is_active = true WHERE id = $1", [adminId]);
  });

  it('rejects direct approval of unsafe stored media URLs without an asset change or audit receipt', async () => {
    const pool = fixture.pool;
    const listingId = (await pool.query(
      'INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id',
      [hostId, 'Unreviewed media stay']
    )).rows[0].id;

    for (const unsafeUrl of ['javascript:alert(1)', 'https://127.0.0.1/private.jpg', '']) {
      const assetId = (await pool.query(
        "INSERT INTO media_assets (entity_type, entity_id, url, moderation_status) VALUES ('listing', $1, $2, 'pending_review') RETURNING id",
        [listingId, unsafeUrl]
      )).rows[0].id;
      const result = await moderateMediaAsset(pool, { assetId, adminId, moderation_status: 'approved' });
      expect(result).toMatchObject({ success: false, status: 422 });
      expect((await pool.query('SELECT url, moderation_status FROM media_assets WHERE id = $1', [assetId])).rows[0])
        .toEqual({ url: unsafeUrl, moderation_status: 'pending_review' });
      expect(Number((await pool.query('SELECT COUNT(*) FROM admin_audit_logs')).rows[0].count)).toBe(0);
    }
  });

  it('rejects revoked or inactive administrators before changing an asset or writing audit evidence', async () => {
    const pool = fixture.pool;
    const listingId = (await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Role-check stay'])).rows[0].id;
    const assetId = (await pool.query(
      "INSERT INTO media_assets (entity_type, entity_id, url) VALUES ('listing', $1, $2) RETURNING id",
      [listingId, 'https://images.encho.space/role-check.jpg']
    )).rows[0].id;

    for (const state of [{ role: 'user', active: true }, { role: 'admin', active: false }]) {
      await pool.query('UPDATE users SET role = $1, is_active = $2 WHERE id = $3', [state.role, state.active, adminId]);
      const result = await moderateMediaAsset(pool, { assetId, adminId, moderation_status: 'approved' });
      expect(result).toEqual({ success: false, status: 403, error: 'Admin privileges required' });
      expect((await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [assetId])).rows[0].moderation_status).toBe('pending_review');
      expect(Number((await pool.query('SELECT COUNT(*) FROM admin_audit_logs')).rows[0].count)).toBe(0);
    }
  });

  it('proves that a failed audit log insert causes an atomic transaction ROLLBACK, leaving media_assets unchanged', async () => {
    const pool = fixture.pool;

    // 1. Seed listing and media asset
    const listingRes = await pool.query(
      'INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id',
      [hostId, 'Coorg Coffee Estate Villa']
    );
    const listingId = listingRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/estate-room.jpg', 'room-1', 'bedroom', 'pending_review', false)
       RETURNING id`,
      [listingId]
    );
    const assetId = assetRes.rows[0].id;

    // 2. Add NOT NULL constraint without default to admin_audit_logs to force audit log insertion failure
    await pool.query('ALTER TABLE admin_audit_logs ADD COLUMN fail_trigger TEXT NOT NULL');

    // 3. Attempt to moderate asset using the extracted production service
    await expect(
      moderateMediaAsset(pool, {
        assetId,
        adminId,
        moderation_status: 'approved',
        is_sleeping_area: true,
        ipAddress: '127.0.0.1'
      })
    ).rejects.toThrow();

    // 4. Verify durable rollback in real PostgreSQL:
    // media_assets row MUST retain its original moderation_status and is_sleeping_area
    const assetCheck = await pool.query(
      'SELECT moderation_status, is_sleeping_area, room_type_id FROM media_assets WHERE id = $1',
      [assetId]
    );
    expect(assetCheck.rows[0].moderation_status).toBe('pending_review');
    expect(assetCheck.rows[0].is_sleeping_area).toBe(false);
    expect(assetCheck.rows[0].room_type_id).toBeNull();

    // 5. Verify zero audit logs were committed
    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('atomically commits both media asset moderation and audit log record when audit write succeeds', async () => {
    const pool = fixture.pool;

    // 1. Seed listing, room type, and media asset
    const listingRes = await pool.query(
      'INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id',
      [hostId, 'Wayanad Treehouse Retreat']
    );
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Canopy Suite', 'canopy_suite', 18000]
    );
    const roomId = roomRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/treehouse.jpg', 'room-1', 'bedroom', 'pending_review', false)
       RETURNING id`,
      [listingId]
    );
    const assetId = assetRes.rows[0].id;

    // 2. Call extracted production moderation service
    const result = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      moderation_status: 'approved',
      is_sleeping_area: true,
      room_type_id: roomId,
      ipAddress: '192.168.1.100'
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.assetId).toBe(assetId);
    }

    // 3. Verify media_assets updated in real PostgreSQL
    const assetCheck = await pool.query(
      'SELECT moderation_status, is_sleeping_area, room_type_id FROM media_assets WHERE id = $1',
      [assetId]
    );
    expect(assetCheck.rows[0].moderation_status).toBe('approved');
    expect(assetCheck.rows[0].is_sleeping_area).toBe(true);
    expect(assetCheck.rows[0].room_type_id).toBe(roomId);

    // 4. Verify admin_audit_logs atomically committed with identical state diff
    const auditCheck = await pool.query('SELECT * FROM admin_audit_logs WHERE entity_id = $1', [assetId]);
    expect(auditCheck.rows.length).toBe(1);
    const audit = auditCheck.rows[0];
    expect(audit.admin_id).toBe(adminId);
    expect(audit.entity_type).toBe('media_asset');
    expect(audit.action).toBe('moderate_media_asset');
    expect(audit.ip_address).toBe('192.168.1.100');

    const prevState = typeof audit.previous_state === 'string' ? JSON.parse(audit.previous_state) : audit.previous_state;
    const newState = typeof audit.new_state === 'string' ? JSON.parse(audit.new_state) : audit.new_state;

    expect(prevState).toEqual({
      moderation_status: 'pending_review',
      is_sleeping_area: false,
      room_type_id: null
    });
    expect(newState).toEqual({
      moderation_status: 'approved',
      is_sleeping_area: true,
      room_type_id: roomId
    });
  });

  it('rejects cross-property room assignment with 422 and leaves database completely unmodified', async () => {
    const pool = fixture.pool;

    // Listing A & media A
    const listingARes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Listing A']);
    const listingAId = listingARes.rows[0].id;

    const mediaARes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, moderation_status)
       VALUES ('listing', $1, 'https://images.encho.space/a.jpg', 'pending_review')
       RETURNING id`,
      [listingAId]
    );
    const mediaAId = mediaARes.rows[0].id;

    // Listing B & room B
    const listingBRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Listing B']);
    const listingBId = listingBRes.rows[0].id;

    const roomBRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingBId, 'Room B', 'room_b', 12000]
    );
    const roomBId = roomBRes.rows[0].id;

    // Attempt to assign Room B to Media A
    const result = await moderateMediaAsset(pool, {
      assetId: mediaAId,
      adminId,
      room_type_id: roomBId,
      moderation_status: 'approved'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result as { success: false; status: number; error: string };
      expect(err.status).toBe(422);
      expect(err.error).toContain('Cross-property room assignment rejected');
    }

    // Verify media A unchanged
    const assetCheck = await pool.query('SELECT moderation_status, room_type_id FROM media_assets WHERE id = $1', [mediaAId]);
    expect(assetCheck.rows[0].moderation_status).toBe('pending_review');
    expect(assetCheck.rows[0].room_type_id).toBeNull();

    // Verify zero audit logs
    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('validates input parameters and rejects invalid values with 400 or 404 before mutation', async () => {
    const pool = fixture.pool;

    // Non-existent asset ID -> 404
    const notFound = await moderateMediaAsset(pool, {
      assetId: 99999,
      adminId,
      moderation_status: 'approved'
    });
    expect(notFound.success).toBe(false);
    if (!notFound.success) {
      const err = notFound as { success: false; status: number; error: string };
      expect(err.status).toBe(404);
      expect(err.error).toBe('Media asset not found');
    }

    // Invalid assetId -> 400
    const invalidId = await moderateMediaAsset(pool, {
      assetId: -5,
      adminId,
      moderation_status: 'approved'
    });
    expect(invalidId.success).toBe(false);
    if (!invalidId.success) {
      const err = invalidId as { success: false; status: number; error: string };
      expect(err.status).toBe(400);
      expect(err.error).toContain('Invalid asset ID');
    }

    // Invalid status -> 400
    const invalidStatus = await moderateMediaAsset(pool, {
      assetId: 1,
      adminId,
      moderation_status: 'bogus' as any
    });
    expect(invalidStatus.success).toBe(false);
    if (!invalidStatus.success) {
      const err = invalidStatus as { success: false; status: number; error: string };
      expect(err.status).toBe(400);
      expect(err.error).toContain('Invalid moderation_status');
    }

    // Invalid room_type_id -> 400
    const invalidRoom = await moderateMediaAsset(pool, {
      assetId: 1,
      adminId,
      room_type_id: -10
    });
    expect(invalidRoom.success).toBe(false);
    if (!invalidRoom.success) {
      const err = invalidRoom as { success: false; status: number; error: string };
      expect(err.status).toBe(400);
      expect(err.error).toContain('Invalid room_type_id');
    }
  });

  it('proves that changing room_type_id on an approved photo resets moderation_status to pending_review when moderation_status is omitted', async () => {
    const pool = fixture.pool;

    // Seed listing, 2 rooms, and 1 approved common photo
    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Coorg Sanctuary']);
    const listingId = listingRes.rows[0].id;

    const room1Res = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Room 1', 'room_1', 10000]
    );
    const room1Id = room1Res.rows[0].id;

    const room2Res = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Room 2', 'room_2', 15000]
    );
    const room2Id = room2Res.rows[0].id;

    // Initially approved photo assigned to Room 1
    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/pool.jpg', 'room_1', 'other', $2, 'approved', false)
       RETURNING id`,
      [listingId, room1Id]
    );
    const assetId = assetRes.rows[0].id;

    // Change room binding from Room 1 to Room 2 without specifying moderation_status
    const result = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: room2Id
    });
    expect(result.success).toBe(true);

    // Verify in real PostgreSQL: moderation_status MUST be reset to 'pending_review'
    const check = await pool.query('SELECT room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [assetId]);
    expect(check.rows[0].room_type_id).toBe(room2Id);
    expect(check.rows[0].moderation_status).toBe('pending_review');

    // Verify audit log recorded the transition from approved -> pending_review
    const auditRes = await pool.query('SELECT previous_state, new_state FROM admin_audit_logs WHERE entity_id = $1 ORDER BY id DESC LIMIT 1', [assetId]);
    const prev = typeof auditRes.rows[0].previous_state === 'string' ? JSON.parse(auditRes.rows[0].previous_state) : auditRes.rows[0].previous_state;
    const next = typeof auditRes.rows[0].new_state === 'string' ? JSON.parse(auditRes.rows[0].new_state) : auditRes.rows[0].new_state;

    expect(prev.moderation_status).toBe('approved');
    expect(prev.room_type_id).toBe(room1Id);
    expect(next.moderation_status).toBe('pending_review');
    expect(next.room_type_id).toBe(room2Id);
  });

  it('proves that changing is_sleeping_area on an approved photo resets moderation_status to pending_review when moderation_status is omitted', async () => {
    const pool = fixture.pool;

    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Shimla Lodge']);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Suite', 'suite', 20000]
    );
    const roomId = roomRes.rows[0].id;

    // Initially approved photo, is_sleeping_area = false
    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/bedroom-window.jpg', 'suite', 'bedroom', $2, 'approved', false)
       RETURNING id`,
      [listingId, roomId]
    );
    const assetId = assetRes.rows[0].id;

    // Toggle is_sleeping_area to true without specifying moderation_status
    const result = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      is_sleeping_area: true
    });
    expect(result.success).toBe(true);

    // Verify in real PostgreSQL: status reset to pending_review to prevent false sleeping area claim
    const check = await pool.query('SELECT moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [assetId]);
    expect(check.rows[0].is_sleeping_area).toBe(true);
    expect(check.rows[0].moderation_status).toBe('pending_review');
  });

  it('allows atomic reapproval of exact binding when moderation_status="approved" is explicitly passed alongside room_type_id or is_sleeping_area', async () => {
    const pool = fixture.pool;

    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Ooty Estate']);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Heritage Room', 'heritage', 14000]
    );
    const roomId = roomRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/heritage-bed.jpg', 'common', 'other', 'approved', false)
       RETURNING id`,
      [listingId]
    );
    const assetId = assetRes.rows[0].id;

    // Admin explicitly reapproves the new binding in the same atomic call
    const result = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: roomId,
      is_sleeping_area: true,
      moderation_status: 'approved'
    });
    expect(result.success).toBe(true);

    const check = await pool.query('SELECT room_type_id, is_sleeping_area, moderation_status FROM media_assets WHERE id = $1', [assetId]);
    expect(check.rows[0].room_type_id).toBe(roomId);
    expect(check.rows[0].is_sleeping_area).toBe(true);
    expect(check.rows[0].moderation_status).toBe('approved');
  });

  it('retains approved status when room_type_id and is_sleeping_area are updated with their existing values', async () => {
    const pool = fixture.pool;

    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Munnar Tea Estate']);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Tea Suite', 'tea_suite', 16000]
    );
    const roomId = roomRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/tea-suite.jpg', 'tea_suite', 'bedroom', $2, 'approved', true)
       RETURNING id`,
      [listingId, roomId]
    );
    const assetId = assetRes.rows[0].id;

    // Pass same room_type_id and is_sleeping_area
    const result = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: roomId,
      is_sleeping_area: true
    });
    expect(result.success).toBe(true);

    // Approval must be retained because neither room binding nor sleeping claim changed
    const check = await pool.query('SELECT room_type_id, is_sleeping_area, moderation_status FROM media_assets WHERE id = $1', [assetId]);
    expect(check.rows[0].room_type_id).toBe(roomId);
    expect(check.rows[0].is_sleeping_area).toBe(true);
    expect(check.rows[0].moderation_status).toBe('approved');
  });

  it('independently validates exact boolean and positive safe integer IDs, rejecting malformed and unparsed values with 400 and zero writes', async () => {
    const pool = fixture.pool;

    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Validation Villa']);
    const listingId = listingRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, 'https://images.encho.space/valid-test.jpg', 'common', 'exterior', 'pending_review', false)
       RETURNING id`,
      [listingId]
    );
    const assetId = assetRes.rows[0].id;

    // 1. Unparsed string boolean ('false') -> 400
    const strBoolRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      is_sleeping_area: 'false' as any
    });
    expect(strBoolRes.success).toBe(false);
    expect((strBoolRes as any).status).toBe(400);
    expect((strBoolRes as any).error).toBe('Invalid is_sleeping_area: must be a boolean');

    // 2. Numeric boolean (1) -> 400
    const numBoolRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      is_sleeping_area: 1 as any
    });
    expect(numBoolRes.success).toBe(false);
    expect((numBoolRes as any).status).toBe(400);
    expect((numBoolRes as any).error).toBe('Invalid is_sleeping_area: must be a boolean');

    // 3. Coerced string room_type_id ('1.0') -> 400
    const strRoomRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: '1.0' as any
    });
    expect(strRoomRes.success).toBe(false);
    expect((strRoomRes as any).status).toBe(400);
    expect((strRoomRes as any).error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 4. Boolean room_type_id (true) -> 400
    const boolRoomRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: true as any
    });
    expect(boolRoomRes.success).toBe(false);
    expect((boolRoomRes as any).status).toBe(400);
    expect((boolRoomRes as any).error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 5. Array room_type_id ([1]) -> 400
    const arrRoomRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: [1] as any
    });
    expect(arrRoomRes.success).toBe(false);
    expect((arrRoomRes as any).status).toBe(400);
    expect((arrRoomRes as any).error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 6. Unsafe integer room_type_id (9007199254740992) -> 400
    const unsafeIntRoomRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: 9007199254740992
    });
    expect(unsafeIntRoomRes.success).toBe(false);
    expect((unsafeIntRoomRes as any).status).toBe(400);
    expect((unsafeIntRoomRes as any).error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 7. Float room_type_id (3.14) -> 400
    const floatRoomRes = await moderateMediaAsset(pool, {
      assetId,
      adminId,
      room_type_id: 3.14 as any
    });
    expect(floatRoomRes.success).toBe(false);
    expect((floatRoomRes as any).status).toBe(400);
    expect((floatRoomRes as any).error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 8. Invalid adminId (0, null, negative, unsafe) -> 400, never audits null admin_id
    const zeroAdminRes = await moderateMediaAsset(pool, {
      assetId,
      adminId: 0,
      moderation_status: 'approved'
    });
    expect(zeroAdminRes.success).toBe(false);
    expect((zeroAdminRes as any).status).toBe(400);
    expect((zeroAdminRes as any).error).toBe('Invalid admin ID: must be a positive integer');

    const nullAdminRes = await moderateMediaAsset(pool, {
      assetId,
      adminId: null as any,
      moderation_status: 'approved'
    });
    expect(nullAdminRes.success).toBe(false);
    expect((nullAdminRes as any).status).toBe(400);
    expect((nullAdminRes as any).error).toBe('Invalid admin ID: must be a positive integer');

    const negAdminRes = await moderateMediaAsset(pool, {
      assetId,
      adminId: -10,
      moderation_status: 'approved'
    });
    expect(negAdminRes.success).toBe(false);
    expect((negAdminRes as any).status).toBe(400);
    expect((negAdminRes as any).error).toBe('Invalid admin ID: must be a positive integer');

    // 9. Empty fields to update -> 400
    const emptyUpdateRes = await moderateMediaAsset(pool, {
      assetId,
      adminId
    });
    expect(emptyUpdateRes.success).toBe(false);
    expect((emptyUpdateRes as any).status).toBe(400);
    expect((emptyUpdateRes as any).error).toBe('No fields to update');

    // 10. Durable no-write verification in real PostgreSQL
    const assetCheck = await pool.query('SELECT moderation_status, is_sleeping_area, room_type_id FROM media_assets WHERE id = $1', [assetId]);
    expect(assetCheck.rows[0].moderation_status).toBe('pending_review');
    expect(assetCheck.rows[0].is_sleeping_area).toBe(false);
    expect(assetCheck.rows[0].room_type_id).toBeNull();

    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('enforces entity boundary by rejecting room binding and sleeping area claims on non-listing media assets with 422', async () => {
    const pool = fixture.pool;

    // Seed listing and room
    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Listing Entity Test']);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Standard Room', 'standard', 8000]
    );
    const roomId = roomRes.rows[0].id;

    // Seed non-listing media asset (e.g. user profile photo)
    const userAssetRes = await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, url, tier, category, moderation_status, is_sleeping_area)
       VALUES ('user', $1, 'https://images.encho.space/user-profile.jpg', 'common', 'avatar', 'pending_review', false)
       RETURNING id`,
      [hostId]
    );
    const userAssetId = userAssetRes.rows[0].id;

    // 1. Attempt room assignment to non-listing asset -> 422
    const roomAssignRes = await moderateMediaAsset(pool, {
      assetId: userAssetId,
      adminId,
      room_type_id: roomId
    });
    expect(roomAssignRes.success).toBe(false);
    expect((roomAssignRes as any).status).toBe(422);
    expect((roomAssignRes as any).error).toContain('Cannot assign room to non-listing media asset');

    // 2. Attempt sleeping area designation on non-listing asset -> 422
    const sleepingRes = await moderateMediaAsset(pool, {
      assetId: userAssetId,
      adminId,
      is_sleeping_area: true
    });
    expect(sleepingRes.success).toBe(false);
    expect((sleepingRes as any).status).toBe(422);
    expect((sleepingRes as any).error).toContain('Cannot mark non-listing media asset as sleeping area');

    // 3. Durable no-write verification in real PostgreSQL
    const check = await pool.query('SELECT moderation_status, is_sleeping_area, room_type_id FROM media_assets WHERE id = $1', [userAssetId]);
    expect(check.rows[0].moderation_status).toBe('pending_review');
    expect(check.rows[0].is_sleeping_area).toBe(false);
    expect(check.rows[0].room_type_id).toBeNull();

    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('permits media rejection on published listing when 4 approved photos exist and remaining photos satisfy publication invariant', async () => {
    const pool = fixture.pool;

    // 1. Seed published listing with 1 room and 4 approved photos (1 sleeping area)
    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, publication_status)
       VALUES ($1, $2, 'published') RETURNING id`,
      [hostId, 'Published 4-Photo Estate']
    );
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      `INSERT INTO room_types (listing_id, name, type, base_price)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [listingId, 'Deluxe Suite', 'deluxe', 15000]
    );
    const roomId = roomRes.rows[0].id;

    const p1 = (await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p1.jpg', 'approved', true) RETURNING id`,
      [listingId, roomId]
    )).rows[0].id;

    await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES
         ('listing', $1, $2, 'https://cdn.test/p2.jpg', 'approved', false),
         ('listing', $1, $2, 'https://cdn.test/p3.jpg', 'approved', false)`,
      [listingId, roomId]
    );

    const p4 = (await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p4.jpg', 'approved', false) RETURNING id`,
      [listingId, roomId]
    )).rows[0].id;

    // 2. Reject 4th photo - remaining 3 photos still satisfy publication requirements
    const result = await moderateMediaAsset(pool, {
      assetId: p4,
      adminId,
      moderation_status: 'rejected'
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.assetId).toBe(p4);
    }

    // 3. Durable state: Photo 4 is rejected, Photo 1 remains approved sleeping area
    const p4Check = await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [p4]);
    expect(p4Check.rows[0].moderation_status).toBe('rejected');

    const p1Check = await pool.query('SELECT moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [p1]);
    expect(p1Check.rows[0].moderation_status).toBe('approved');
    expect(p1Check.rows[0].is_sleeping_area).toBe(true);

    // 4. Listing remains published
    const listingCheck = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(listingCheck.rows[0].publication_status).toBe('published');

    // 5. Audit log was committed
    const auditCheck = await pool.query('SELECT * FROM admin_audit_logs WHERE entity_id = $1', [p4]);
    expect(auditCheck.rows.length).toBe(1);
    expect(auditCheck.rows[0].action).toBe('moderate_media_asset');
  });

  it('rejects media rejection with 422 on published listing when approved photo count drops below 3, leaving asset, listing, and audit unchanged', async () => {
    const pool = fixture.pool;

    // 1. Seed published listing with 1 room and exactly 3 approved photos (1 sleeping area)
    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, publication_status)
       VALUES ($1, $2, 'published') RETURNING id`,
      [hostId, 'Published 3-Photo Estate']
    );
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      `INSERT INTO room_types (listing_id, name, type, base_price)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [listingId, 'Deluxe Suite', 'deluxe', 15000]
    );
    const roomId = roomRes.rows[0].id;

    await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p1.jpg', 'approved', true)`,
      [listingId, roomId]
    );

    await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p2.jpg', 'approved', false)`,
      [listingId, roomId]
    );

    const p3 = (await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p3.jpg', 'approved', false) RETURNING id`,
      [listingId, roomId]
    )).rows[0].id;

    // 2. Reject 3rd photo - would drop approved count to 2 on published listing -> 422
    const result = await moderateMediaAsset(pool, {
      assetId: p3,
      adminId,
      moderation_status: 'rejected'
    });

    expect(result.success).toBe(false);
    if ('status' in result) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('Cannot modify media on published listing');
      expect(result.error).toContain('Unpublish listing first');
    }

    // 3. Durable state: Photo 3 remains approved, listing remains published
    const p3Check = await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [p3]);
    expect(p3Check.rows[0].moderation_status).toBe('approved');

    const listingCheck = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(listingCheck.rows[0].publication_status).toBe('published');

    // 4. Audit log was NOT committed (transaction rolled back)
    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id = $1', [p3]);
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('rejects unflagging sleeping area with 422 on published listing when it is the sole sleeping area photo, leaving asset, listing, and audit unchanged', async () => {
    const pool = fixture.pool;

    // 1. Seed published listing with 1 room and 3 approved photos where Photo 1 is the ONLY sleeping area photo
    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, publication_status)
       VALUES ($1, $2, 'published') RETURNING id`,
      [hostId, 'Published Sole Sleeping Area Estate']
    );
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      `INSERT INTO room_types (listing_id, name, type, base_price)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [listingId, 'Deluxe Suite', 'deluxe', 15000]
    );
    const roomId = roomRes.rows[0].id;

    const p1 = (await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES ('listing', $1, $2, 'https://cdn.test/p1.jpg', 'approved', true) RETURNING id`,
      [listingId, roomId]
    )).rows[0].id;

    await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
       VALUES
         ('listing', $1, $2, 'https://cdn.test/p2.jpg', 'approved', false),
         ('listing', $1, $2, 'https://cdn.test/p3.jpg', 'approved', false)`,
      [listingId, roomId]
    );

    // 2. Unflag is_sleeping_area on Photo 1 -> 422
    const result = await moderateMediaAsset(pool, {
      assetId: p1,
      adminId,
      is_sleeping_area: false
    });

    expect(result.success).toBe(false);
    if ('status' in result) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('Cannot modify media on published listing');
      expect(result.error).toContain('Unpublish listing first');
    }

    // 3. Durable state: Photo 1 remains sleeping area and approved
    const p1Check = await pool.query('SELECT moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [p1]);
    expect(p1Check.rows[0].moderation_status).toBe('approved');
    expect(p1Check.rows[0].is_sleeping_area).toBe(true);

    const listingCheck = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(listingCheck.rows[0].publication_status).toBe('published');

    // 4. Audit log was NOT committed
    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id = $1', [p1]);
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });

  it('demonstrates parent-first listing row locking and two-connection lock wait settlement in moderateMediaAsset', async () => {
    const pool = fixture.pool;
    const connA = await pool.connect();
    const connB = await pool.connect();

    try {
      // 1. Seed published listing
      const listingRes = await pool.query(
        `INSERT INTO listings (user_id, title, publication_status)
         VALUES ($1, $2, 'published') RETURNING id`,
        [hostId, 'Lock Hierarchy Listing']
      );
      const listingId = listingRes.rows[0].id;

      const roomRes = await pool.query(
        `INSERT INTO room_types (listing_id, name, type, base_price)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [listingId, 'Tower Room', 'tower', 12000]
      );
      const roomId = roomRes.rows[0].id;

      const p1 = (await pool.query(
        `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
         VALUES ('listing', $1, $2, 'https://cdn.test/p1.jpg', 'approved', true) RETURNING id`,
        [listingId, roomId]
      )).rows[0].id;

      // 2. Connection A holds listing row lock
      await connA.query('BEGIN');
      await connA.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

      // 3. Dispatch moderateMediaAsset on pool (will acquire a separate client connection)
      const modPromise = moderateMediaAsset(pool, {
        assetId: p1,
        adminId,
        moderation_status: 'rejected'
      })
        .then((res) => ({ status: 'completed' as const, res }))
        .catch((err) => ({ status: 'error' as const, err }));

      // 4. Observe lock wait on listings row via connB
      let isWaitingOnListingLock = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const check = await connB.query(`
          SELECT pid, query, state, wait_event_type, wait_event
          FROM pg_stat_activity
          WHERE state = 'active'
            AND wait_event_type = 'Lock'
            AND query LIKE '%listings%FOR UPDATE%'
            AND pid <> pg_backend_pid()
        `);
        if (check.rows.length > 0) {
          isWaitingOnListingLock = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      // Check race with lock held
      const raceWithLockHeld = await Promise.race([
        modPromise,
        new Promise<{ status: 'still_held' }>((r) => setTimeout(() => r({ status: 'still_held' }), 120))
      ]);

      expect(isWaitingOnListingLock).toBe(true);
      expect(raceWithLockHeld.status).toBe('still_held');

      // 5. Commit connA to release lock and allow moderateMediaAsset to proceed
      await connA.query('COMMIT');

      // 6. Settle with bounded timeout
      const result = await Promise.race([
        modPromise,
        new Promise<{ status: 'timeout' }>((r) => setTimeout(() => r({ status: 'timeout' }), 5000))
      ]);

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        // Under containment policy, rejecting only photo of a 1-photo room yields 422
        expect(result.res.success).toBe(false);
        if ('status' in result.res) {
          expect(result.res.status).toBe(422);
        }
      }

      // 7. Verify no stuck lock or corrupted state
      const p1Check = await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [p1]);
      expect(p1Check.rows[0].moderation_status).toBe('approved');
    } finally {
      try { await connA.query('ROLLBACK'); } catch (_e) { void _e; }
      try { await connB.query('ROLLBACK'); } catch (_e) { void _e; }
      connA.release();
      connB.release();
    }
  });

  it('REGRESSION: canonical room authority uses room_type_id not tier; unassigned NULL cannot satisfy room gates, while common-tier bound asset does', async () => {
    const pool = fixture.pool;

    const listingRes = await pool.query('INSERT INTO listings (user_id, title) VALUES ($1, $2) RETURNING id', [hostId, 'Authority Boundary Villa']);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(
      'INSERT INTO room_types (listing_id, name, type, base_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, 'Canyon Pavilion', 'pavilion', 16000]
    );
    const roomId = roomRes.rows[0].id;

    // Case A: 2 room-assigned approved photos + 1 unassigned common photo with is_sleeping_area = true (room_type_id IS NULL)
    await pool.query(
      `INSERT INTO media_assets (entity_type, entity_id, room_type_id, url, tier, moderation_status, is_sleeping_area)
       VALUES
         ('listing', $1, $2, 'https://cdn.test/room1.jpg', 'deluxe', 'approved', false),
         ('listing', $1, $2, 'https://cdn.test/room2.jpg', 'deluxe', 'approved', false),
         ('listing', $1, NULL, 'https://cdn.test/common-sleeping.jpg', 'common', 'approved', true)`,
      [listingId, roomId]
    );

    // Unassigned photo (room_type_id NULL) MUST NOT satisfy room photo minimum or sleeping area gate
    const failCheck = await validatePropertyPublication(listingId, pool);
    expect(failCheck.valid).toBe(false);
    expect(failCheck.roomSummaries[0].approvedPhotosCount).toBe(2);
    expect(failCheck.roomSummaries[0].sleepingAreaPhotosCount).toBe(0);
    expect(failCheck.errors.some(e => e.includes('only 2 approved photo(s)'))).toBe(true);
    expect(failCheck.errors.some(e => e.includes('at least 1 approved photo showing the sleeping area'))).toBe(true);

    // Case B: Now admin explicitly binds the common photo to the room with atomic reapproval (tier remains 'common')
    const unassignedAssetRes = await pool.query('SELECT id FROM media_assets WHERE entity_id = $1 AND room_type_id IS NULL', [listingId]);
    const commonAssetId = unassignedAssetRes.rows[0].id;

    const modResult = await moderateMediaAsset(pool, {
      assetId: commonAssetId,
      adminId,
      room_type_id: roomId,
      is_sleeping_area: true,
      moderation_status: 'approved'
    });
    expect(modResult.success).toBe(true);

    // Verify DB state: asset's tier remains 'common', but room_type_id is now bound to roomId
    const assetCheck = await pool.query('SELECT tier, room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [commonAssetId]);
    expect(assetCheck.rows[0].tier).toBe('common');
    expect(assetCheck.rows[0].room_type_id).toBe(roomId);
    expect(assetCheck.rows[0].moderation_status).toBe('approved');
    expect(assetCheck.rows[0].is_sleeping_area).toBe(true);

    // Common-tier photo explicitly bound and approved to room MUST now satisfy room publication requirements!
    const passCheck = await validatePropertyPublication(listingId, pool);
    expect(passCheck.valid).toBe(true);
    expect(passCheck.roomSummaries[0].approvedPhotosCount).toBe(3);
    expect(passCheck.roomSummaries[0].sleepingAreaPhotosCount).toBe(1);
    expect(passCheck.roomSummaries[0].isCompliant).toBe(true);
  });
});
