import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../../server';

const { Pool } = pkg;
const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';

function createAuthToken(user: { id: number; email: string; role: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

describe('Admin Media Review Desk — Relational Media Read & Atomic Moderation Audit', () => {
  let pool: any;
  const adminId = 888;
  const hostId = 777;
  const adminToken = createAuthToken({ id: adminId, email: 'admin-review@encho.space', role: 'admin' });
  const hostToken = createAuthToken({ id: hostId, email: 'host-review@encho.space', role: 'host' });

  beforeAll(async () => {
    pool = new Pool();
    // Ensure users exist
    await pool.query(`
      INSERT INTO users (id, email, name, role) VALUES
      (${adminId}, 'admin-review@encho.space', 'Review Desk Admin', 'admin'),
      (${hostId}, 'host-review@encho.space', 'Review Desk Host', 'host')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await pool.query('DELETE FROM admin_audit_logs');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
  });

  it('routes an Admin draft property-name correction through the audited field-scoped writer', async () => {
    const listingId = Number((await pool.query(`
      INSERT INTO listings (user_id, title, description, price, type, address, city, publication_status)
      VALUES ($1, 'Original Guest-Facing Name', 'Verified draft', 15000, 'villa', 'Hill Road', 'Wayanad', 'draft')
      RETURNING id`, [hostId])).rows[0].id);
    const response = await request(app)
      .patch(`/api/admin/listings/${listingId}/draft-property`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Reviewed Guest-Facing Name', expected_current: { title: 'Original Guest-Facing Name' } });
    expect(response.status).toBe(200);
    expect(response.body.changedFields).toEqual(['title']);
    expect((await pool.query('SELECT title FROM listings WHERE id=$1', [listingId])).rows[0].title)
      .toBe('Reviewed Guest-Facing Name');
    const audit = await pool.query('SELECT previous_state,new_state FROM admin_audit_logs WHERE entity_type=$1 AND entity_id=$2 AND action=$3',
      ['listing', listingId, 'draft_property_fields_updated']);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].previous_state.title).toBe('Original Guest-Facing Name');
    expect(audit.rows[0].new_state.title).toBe('Reviewed Guest-Facing Name');
  });

  // Test 1: Mounted admin-only GET and PATCH endpoints reject host role with 403 Forbidden
  it('Test 1: Mounted admin-only GET and PATCH endpoints reject host role with 403 Forbidden', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (701, ${hostId}, 'Lakeview Villa', 'Serene lakeside retreat', 15000, 'villa', 'Lake Road 1', 'Udaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const assetRes = await pool.query(`
      INSERT INTO media_assets (id, entity_type, entity_id, url, tier, category, is_sleeping_area, moderation_status)
      VALUES (999, 'listing', ${listingId}, 'https://images.example.com/asset-999.jpg', 'common', 'exterior', false, 'pending_review')
      RETURNING id;
    `);
    const assetId = assetRes.rows[0].id;

    // GET without token -> 401
    const getUnauth = await request(app).get(`/api/admin/listings/${listingId}/media-assets`);
    expect(getUnauth.status).toBe(401);

    // GET with host token -> 403 Forbidden
    const getHost = await request(app)
      .get(`/api/admin/listings/${listingId}/media-assets`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(getHost.status).toBe(403);
    expect(getHost.body.error).toBe('Admin privileges required');

    // PATCH with host token -> 403 Forbidden
    const patchHost = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ moderation_status: 'approved' });
    expect(patchHost.status).toBe(403);
    expect(patchHost.body.error).toBe('Admin privileges required');

    // Verify DB was unmodified
    const checkAsset = await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [assetId]);
    expect(checkAsset.rows[0].moderation_status).toBe('pending_review');
  });

  // Test 2: Validate listing and asset IDs as positive integers; hide raw DB errors
  it('Test 2: Validate listing and asset IDs as positive integers; hide raw DB errors', async () => {
    // Non-integer strings
    const nanGet = await request(app)
      .get('/api/admin/listings/not-a-number/media-assets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(nanGet.status).toBe(400);
    expect(nanGet.body.error).toBe('Invalid listing ID: must be a positive integer');

    const nanPatch = await request(app)
      .patch('/api/admin/media-assets/not-a-number/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });
    expect(nanPatch.status).toBe(400);
    expect(nanPatch.body.error).toBe('Invalid asset ID: must be a positive integer');

    // Negative and zero values
    const negGet = await request(app)
      .get('/api/admin/listings/-5/media-assets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(negGet.status).toBe(400);
    expect(negGet.body.error).toBe('Invalid listing ID: must be a positive integer');

    const zeroGet = await request(app)
      .get('/api/admin/listings/0/media-assets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(zeroGet.status).toBe(400);
    expect(zeroGet.body.error).toBe('Invalid listing ID: must be a positive integer');

    const floatGet = await request(app)
      .get('/api/admin/listings/12.34/media-assets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(floatGet.status).toBe(400);
    expect(floatGet.body.error).toBe('Invalid listing ID: must be a positive integer');

    const negPatch = await request(app)
      .patch('/api/admin/media-assets/-10/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });
    expect(negPatch.status).toBe(400);
    expect(negPatch.body.error).toBe('Invalid asset ID: must be a positive integer');

    // Invalid body fields
    const invalidStatus = await request(app)
      .patch('/api/admin/media-assets/1/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'invalid_status' });
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error).toMatch(/Invalid moderation_status/);

    const invalidRoomId = await request(app)
      .patch('/api/admin/media-assets/1/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: -99 });
    expect(invalidRoomId.status).toBe(400);
    expect(invalidRoomId.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // Non-existent records (404)
    const notFoundListing = await request(app)
      .get('/api/admin/listings/99999/media-assets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(notFoundListing.status).toBe(404);
    expect(notFoundListing.body.error).toBe('Listing not found');

    const notFoundAsset = await request(app)
      .patch('/api/admin/media-assets/99999/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });
    expect(notFoundAsset.status).toBe(404);
    expect(notFoundAsset.body.error).toBe('Media asset not found');
  });

  // Test 3: Admin GET returns bounded projection with room types, media assets, and validation status
  it('Test 3: Admin GET returns bounded projection with room types, media assets, and validation status', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (702, ${hostId}, 'Heritage Palace', 'Royal experience', 25000, 'resort', 'Palace St 1', 'Jaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Maharaja Suite', 'suite', 25000, 2)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, is_sleeping_area, moderation_status, order_index)
      VALUES
      ('listing', $1, 'https://images.example.com/suite-1.jpg', 'suite', 'bedroom', $2, true, 'pending_review', 0),
      ('listing', $1, 'https://images.example.com/exterior-1.jpg', 'common', 'exterior', NULL, false, 'pending_review', 1)
    `, [listingId, roomId]);

    const res = await request(app)
      .get(`/api/admin/listings/${listingId}/media-assets`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.listingId).toBe(listingId);
    expect(res.body.listingTitle).toBe('Heritage Palace');
    expect(res.body.roomTypes).toHaveLength(1);
    expect(res.body.roomTypes[0].name).toBe('Maharaja Suite');
    expect(res.body.mediaAssets).toHaveLength(2);
    expect(res.body.mediaAssets[0].url).toBe('https://images.example.com/suite-1.jpg');
    expect(res.body.mediaAssets[0].room_type_id).toBe(roomId);
    expect(res.body.mediaAssets[0].is_sleeping_area).toBe(true);
    expect(res.body.mediaAssets[0].moderation_status).toBe('pending_review');

    // Validation should report not valid because pending photos do not satisfy >= 3 approved photos
    expect(res.body.validation.valid).toBe(false);
    expect(res.body.validation.errors.length).toBeGreaterThan(0);
  });

  // Test 4: Cross-property room assignment is rejected with 422
  it('Test 4: Cross-property room assignment is rejected with 422', async () => {
    // Listing A & Room A
    const listARes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (703, ${hostId}, 'Property A', 'Desc A', 10000, 'villa', 'Addr A', 'Goa', 'draft')
      RETURNING id;
    `);
    const listAId = listARes.rows[0].id;

    // Listing B & Room B
    const listBRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (704, ${hostId}, 'Property B', 'Desc B', 10000, 'villa', 'Addr B', 'Goa', 'draft')
      RETURNING id;
    `);
    const listBId = listBRes.rows[0].id;

    const roomBRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Room B', 'deluxe', 10000, 2)
      RETURNING id;
    `, [listBId]);
    const roomBId = roomBRes.rows[0].id;

    // Media asset belongs to Listing A
    const assetRes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/asset-a.jpg', 'common', 'exterior', NULL, 'pending_review')
      RETURNING id;
    `, [listAId]);
    const assetId = assetRes.rows[0].id;

    // Attempt to assign Room B (from Listing B) to Asset A (from Listing A)
    const res = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomBId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Cross-property room assignment rejected: media asset and room type belong to different listings');
  });

  // Test 5: Atomic admin audit log receipt is inserted in the exact same transaction on moderation
  it('Test 5: Atomic admin audit log receipt is inserted in the exact same transaction on moderation', async () => {
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (705, ${hostId}, 'Forest Lodge', 'Deep woods', 8000, 'cabin', 'Forest Trail 1', 'Coorg', 'draft')
      RETURNING id;
    `);
    const listId = listRes.rows[0].id;

    const assetRes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, is_sleeping_area, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/lodge-bed.jpg', 'deluxe', 'bedroom', false, 'pending_review')
      RETURNING id;
    `, [listId]);
    const assetId = assetRes.rows[0].id;

    // Perform moderation update: approve and mark sleeping area
    const patchRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        moderation_status: 'approved',
        is_sleeping_area: true
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);

    // Verify media_assets updated
    const updatedAssetRes = await pool.query('SELECT * FROM media_assets WHERE id = $1', [assetId]);
    expect(updatedAssetRes.rows[0].moderation_status).toBe('approved');
    expect(updatedAssetRes.rows[0].is_sleeping_area).toBe(true);

    // Verify admin_audit_logs created in the exact same transaction
    const auditRes = await pool.query(
      "SELECT * FROM admin_audit_logs WHERE entity_type = 'media_asset' AND entity_id = $1",
      [assetId]
    );
    expect(auditRes.rows).toHaveLength(1);
    const audit = auditRes.rows[0];
    expect(audit.admin_id).toBe(adminId);
    expect(audit.action).toBe('moderate_media_asset');

    const prevState = typeof audit.previous_state === 'string' ? JSON.parse(audit.previous_state) : audit.previous_state;
    const newState = typeof audit.new_state === 'string' ? JSON.parse(audit.new_state) : audit.new_state;

    expect(prevState.moderation_status).toBe('pending_review');
    expect(prevState.is_sleeping_area).toBe(false);
    expect(newState.moderation_status).toBe('approved');
    expect(newState.is_sleeping_area).toBe(true);
  });

  // Test 6: Publication gate: Requires >= 3 approved room photos AND >= 1 sleeping area photo per room type
  it('Test 6: Publication gate requires >= 3 approved room photos AND >= 1 sleeping area photo per room', async () => {
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (706, ${hostId}, 'Mountain Chalet', 'Scenic views', 14000, 'chalet', 'Ridge Road 5', 'Shimla', 'draft')
      RETURNING id;
    `);
    const listId = listRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Chalet Double', 'double', 14000, 2)
      RETURNING id;
    `, [listId]);
    const roomId = roomRes.rows[0].id;

    // Step A: 0 photos -> publication fails with deficit errors
    const pubFail0 = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubFail0.status).toBe(422);
    expect(pubFail0.body.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Minimum 3 approved room-specific photos are required/),
        expect.stringMatching(/must have at least 1 approved photo showing the sleeping area/)
      ])
    );

    // Insert 3 photos for the room: all pending_review, none marked sleeping area
    const a1 = (await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, is_sleeping_area, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/c1.jpg', 'double', 'bedroom', $2, false, 'pending_review')
      RETURNING id;
    `, [listId, roomId])).rows[0].id;

    const a2 = (await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, is_sleeping_area, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/c2.jpg', 'double', 'living', $2, false, 'pending_review')
      RETURNING id;
    `, [listId, roomId])).rows[0].id;

    const a3 = (await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, is_sleeping_area, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/c3.jpg', 'double', 'bathroom', $2, false, 'pending_review')
      RETURNING id;
    `, [listId, roomId])).rows[0].id;

    // Step B: Photos exist but 0 approved -> 422
    const pubFail1 = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubFail1.status).toBe(422);

    // Step C: Admin approves photo 1 and photo 2, but neither is sleeping area -> 422 (only 2 approved, 0 sleeping)
    await request(app)
      .patch(`/api/admin/media-assets/${a1}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });

    await request(app)
      .patch(`/api/admin/media-assets/${a2}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });

    const pubFail2 = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubFail2.status).toBe(422);

    // Step D: Admin approves photo 3, but STILL no sleeping area -> 422 (3 approved, 0 sleeping)
    await request(app)
      .patch(`/api/admin/media-assets/${a3}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });

    const pubFail3 = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubFail3.status).toBe(422);
    expect(pubFail3.body.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/must have at least 1 approved photo showing the sleeping area/)
      ])
    );

    // Step E: Admin toggles photo 1 as sleeping area without specifying moderation_status
    // Critical boundary: photo 1 resets to pending_review to prevent silent approval retention
    await request(app)
      .patch(`/api/admin/media-assets/${a1}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_sleeping_area: true });

    // Publication must be blocked because photo 1 reset to pending_review (now only 2 approved)
    const pubFail4 = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubFail4.status).toBe(422);

    // Step F: Admin atomically reapproves photo 1 with exact sleeping area binding
    await request(app)
      .patch(`/api/admin/media-assets/${a1}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_sleeping_area: true, moderation_status: 'approved' });

    // Verify GET /api/admin/listings/:id/media-assets reports validation.valid === true
    const deskRes = await request(app)
      .get(`/api/admin/listings/${listId}/media-assets`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deskRes.status).toBe(200);
    expect(deskRes.body.validation.valid).toBe(true);
    expect(deskRes.body.validation.errors).toHaveLength(0);
    expect(deskRes.body.validation.roomSummaries[0].isCompliant).toBe(true);
    expect(deskRes.body.validation.roomSummaries[0].approvedPhotosCount).toBe(3);
    expect(deskRes.body.validation.roomSummaries[0].sleepingAreaPhotosCount).toBe(1);

    // Publication now succeeds!
    const pubSuccess = await request(app)
      .patch(`/api/admin/listings/${listId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' });
    expect(pubSuccess.status).toBe(200);
    expect(pubSuccess.body.success).toBe(true);
    expect(pubSuccess.body.publication_status).toBe('published');

    // Confirm listing is now published in DB
    const finalListing = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listId]);
    expect(finalListing.rows[0].publication_status).toBe('published');
  });

  // Test 7: Server handles moderation failure by releasing client and returning opaque 500
  it('Test 7: Server handles moderation failure by releasing client and returning opaque 500', async () => {
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (707, ${hostId}, 'Safe 500 Manor', 'Testing error shielding', 12000, 'estate', 'Manor Way 1', 'Kochi', 'draft')
      RETURNING id;
    `);
    const listId = listRes.rows[0].id;

    const assetRes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, is_sleeping_area, moderation_status)
      VALUES ('listing', $1, 'https://images.example.com/test-safe-500.jpg', 'common', 'exterior', false, 'pending_review')
      RETURNING id;
    `, [listId]);
    const assetId = assetRes.rows[0].id;

    // Add a NOT NULL column without default to admin_audit_logs to force error inside transaction
    await pool.query('ALTER TABLE admin_audit_logs ADD COLUMN fail_trigger TEXT NOT NULL');

    try {
      const patchRes = await request(app)
        .patch(`/api/admin/media-assets/${assetId}/moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          moderation_status: 'approved',
          is_sleeping_area: true
        });

      // 1. Opaque 500 without leaking raw database or stack trace error
      expect(patchRes.status).toBe(500);
      expect(patchRes.body.error).toBe('Failed to update asset moderation');
      expect(patchRes.body.error).not.toMatch(/violates not-null constraint/);
      expect(patchRes.body.error).not.toMatch(/QueryError/i);
    } finally {
      await pool.query('ALTER TABLE admin_audit_logs DROP COLUMN fail_trigger');
    }
  });

  // Test 8: Strict Zod parsing rejects unknown fields, malformed types, and unparsed/coerced values without mutation
  it('Test 8: Strict Zod parsing rejects unknown fields, malformed types, and unparsed/coerced values without mutation', async () => {
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (708, ${hostId}, 'Zod Boundary Villa', 'Testing schema validation', 11000, 'villa', 'Zod Lane 1', 'Pune', 'draft')
      RETURNING id;
    `);
    const listId = listRes.rows[0].id;

    const assetRes = await pool.query(`
      INSERT INTO media_assets (id, entity_type, entity_id, url, tier, category, is_sleeping_area, room_type_id, moderation_status)
      VALUES (7081, 'listing', $1, 'https://images.example.com/test-zod.jpg', 'common', 'exterior', false, NULL, 'pending_review')
      RETURNING id;
    `, [listId]);
    const assetId = assetRes.rows[0].id;

    // 1. Unknown fields -> 400
    const unknownFieldRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved', malicious_payload: 'exploit' });
    expect(unknownFieldRes.status).toBe(400);

    // 2. Coerced string room_type_id ('1.0') -> 400
    const stringFloatRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: '1.0' });
    expect(stringFloatRoomRes.status).toBe(400);
    expect(stringFloatRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 3. Coerced boolean string room_type_id ('false') -> 400
    const stringBoolRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: 'false' });
    expect(stringBoolRoomRes.status).toBe(400);
    expect(stringBoolRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 4. Boolean room_type_id (true) -> 400
    const boolRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: true });
    expect(boolRoomRes.status).toBe(400);
    expect(boolRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 5. Array room_type_id ([1]) -> 400
    const arrayRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: [1] });
    expect(arrayRoomRes.status).toBe(400);
    expect(arrayRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 6. Unsafe integer room_type_id (9007199254740992) -> 400
    const unsafeIntRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: 9007199254740992 });
    expect(unsafeIntRoomRes.status).toBe(400);
    expect(unsafeIntRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 7. Float room_type_id (2.5) -> 400
    const floatRoomRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: 2.5 });
    expect(floatRoomRes.status).toBe(400);
    expect(floatRoomRes.body.error).toBe('Invalid room_type_id: must be a positive integer or null');

    // 8. String is_sleeping_area ('false') -> 400
    const stringSleepingRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_sleeping_area: 'false' });
    expect(stringSleepingRes.status).toBe(400);
    expect(stringSleepingRes.body.error).toBe('Invalid is_sleeping_area: must be a boolean');

    // 9. Number is_sleeping_area (1) -> 400
    const numSleepingRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_sleeping_area: 1 });
    expect(numSleepingRes.status).toBe(400);
    expect(numSleepingRes.body.error).toBe('Invalid is_sleeping_area: must be a boolean');

    // 10. Empty body ({}) -> 400
    const emptyBodyRes = await request(app)
      .patch(`/api/admin/media-assets/${assetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(emptyBodyRes.status).toBe(400);
    expect(emptyBodyRes.body.error).toBe('No fields to update');

    // 11. Route ID non-safe integer -> 400
    const unsafeRouteIdRes = await request(app)
      .patch('/api/admin/media-assets/9007199254740992/moderation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_status: 'approved' });
    expect(unsafeRouteIdRes.status).toBe(400);
    expect(unsafeRouteIdRes.body.error).toBe('Invalid asset ID: must be a positive integer');

    // 12. No-write verification: ensure the row in media_assets is completely unmodified
    const checkRow = await pool.query('SELECT * FROM media_assets WHERE id = $1', [assetId]);
    expect(checkRow.rows[0].moderation_status).toBe('pending_review');
    expect(checkRow.rows[0].is_sleeping_area).toBe(false);
    expect(checkRow.rows[0].room_type_id).toBeNull();

    // Ensure zero audit logs written for these failed attempts
    const auditCount = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCount.rows[0].count)).toBe(0);
  });

  // Test 9: Mounted PATCH route rejects non-listing media asset room binding and sleeping area designation with 422
  it('Test 9: Mounted PATCH route rejects non-listing media asset room binding and sleeping area designation with 422', async () => {
    // Media asset belonging to a user (avatar / document), not a listing
    const nonListingAssetRes = await pool.query(`
      INSERT INTO media_assets (id, entity_type, entity_id, url, tier, category, is_sleeping_area, room_type_id, moderation_status)
      VALUES (7091, 'user', ${hostId}, 'https://images.example.com/user-avatar.jpg', 'common', 'avatar', false, NULL, 'pending_review')
      RETURNING id;
    `);
    const nonListingAssetId = nonListingAssetRes.rows[0].id;

    // Create a room type on some listing
    const listRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (709, ${hostId}, 'Regular Listing', 'Desc', 5000, 'apartment', 'Addr 9', 'Delhi', 'draft')
      RETURNING id;
    `);
    const listId = listRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Deluxe Bed', 'deluxe', 5000, 2)
      RETURNING id;
    `, [listId]);
    const roomId = roomRes.rows[0].id;

    // Attempt A: Assign room type to user media asset -> 422
    const roomAssignRes = await request(app)
      .patch(`/api/admin/media-assets/${nonListingAssetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomId });
    expect(roomAssignRes.status).toBe(422);
    expect(roomAssignRes.body.error).toContain('Cannot assign room to non-listing media asset');

    // Attempt B: Mark user media asset as sleeping area -> 422
    const sleepingAreaRes = await request(app)
      .patch(`/api/admin/media-assets/${nonListingAssetId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_sleeping_area: true });
    expect(sleepingAreaRes.status).toBe(422);
    expect(sleepingAreaRes.body.error).toContain('Cannot mark non-listing media asset as sleeping area');

    // Verify non-listing asset was NOT modified and 0 audit logs were written
    const assetCheck = await pool.query('SELECT * FROM media_assets WHERE id = $1', [nonListingAssetId]);
    expect(assetCheck.rows[0].room_type_id).toBeNull();
    expect(assetCheck.rows[0].is_sleeping_area).toBe(false);
    expect(assetCheck.rows[0].moderation_status).toBe('pending_review');

    const auditCheck = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    expect(Number(auditCheck.rows[0].count)).toBe(0);
  });
});
