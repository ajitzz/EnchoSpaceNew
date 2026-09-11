import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../../server';
import { validatePropertyPublication } from '../../server';
import {
  toPublicStayProjection,
  mapPublicMediaAsset,
  mapPublicRoomTier
} from '../lib/stayProjection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pkg;
const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';

function createAuthToken(user: { id: number; email: string; role: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

describe('Phase 3 Milestone 3 — Canonical Relational Room & Media Authority', () => {
  let pool: any;
  const adminToken = createAuthToken({ id: 999, email: 'admin@encho.space', role: 'admin' });
  const hostToken = createAuthToken({ id: 1001, email: 'host@encho.space', role: 'host' });

  beforeAll(async () => {
    pool = new Pool();
  });

  beforeEach(async () => {
    // Clean tables before each test to maintain clean state
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM room_types');
    await pool.query('DELETE FROM listings');
  });

  // Test 1: Property cannot be published if a room type has < 3 approved photos
  it('Test 1: Property cannot be published if a room type has < 3 approved photos', async () => {
    // Insert listing
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (301, 1001, 'Mountain Peak Villa', 'High elevation retreat', 12000, 'villa', 'Road 1', 'Manali', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    // Insert 1 room type
    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Deluxe Valley Suite', 'deluxe', 12000, 2)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // Insert only 2 approved photos for this room (1 sleeping area)
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/deluxe1.jpg', 'deluxe', $2, 'approved', true),
        ('listing', $1, 'https://images.encho.space/deluxe2.jpg', 'deluxe', $2, 'approved', false);
    `, [listingId, roomId]);

    // Direct validator check
    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('only 2 approved photo(s)'))).toBe(true);

    // Endpoint check: PATCH /api/admin/listings/:id/status
    const res = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(422);

    expect(res.body.error).toContain('PROPOSED-007');
    expect(res.body.details.some((d: string) => d.includes('Minimum 3 approved room-specific photos are required'))).toBe(true);

    // Verify DB was NOT updated to published
    const checkListing = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(checkListing.rows[0].publication_status).toBe('draft');
  });

  // Test 2: Property cannot be published if a room has 3 approved photos but 0 sleeping area photos
  it('Test 2: Property cannot be published if a room has 3 approved photos but 0 sleeping area photos', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (302, 1001, 'Lakeside Chalet', 'Serene lake view', 15000, 'chalet', 'Lake Rd', 'Nainital', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Lake Panorama Room', 'lake-panorama', 15000, 2)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // Insert 3 approved photos, but ALL have is_sleeping_area = false
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/balcony.jpg', 'lake-panorama', $2, 'approved', false),
        ('listing', $1, 'https://images.encho.space/bathroom.jpg', 'lake-panorama', $2, 'approved', false),
        ('listing', $1, 'https://images.encho.space/study.jpg', 'lake-panorama', $2, 'approved', false);
    `, [listingId, roomId]);

    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('must have at least 1 approved photo showing the sleeping area'))).toBe(true);

    const res = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(422);

    expect(res.body.details.some((d: string) => d.includes('sleeping area'))).toBe(true);
  });

  // Test 3: Property-wide media does not satisfy room photo count
  it('Test 3: Property-wide media (tier = common or room_type_id IS NULL) does not satisfy room photo count', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (303, 1001, 'Heritage Palace', 'Ancient heritage', 25000, 'palace', 'Palace Rd', 'Jaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Royal Courtyard Suite', 'royal-suite', 25000, 2)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // Insert 5 approved common property photos (room_type_id IS NULL)
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/pool.jpg', 'common', NULL, 'approved', false),
        ('listing', $1, 'https://images.encho.space/garden.jpg', 'common', NULL, 'approved', false),
        ('listing', $1, 'https://images.encho.space/lobby.jpg', 'common', NULL, 'approved', false),
        ('listing', $1, 'https://images.encho.space/facade.jpg', 'common', NULL, 'approved', false),
        ('listing', $1, 'https://images.encho.space/dining.jpg', 'common', NULL, 'approved', false);
    `, [listingId]);

    // And only 1 room photo with sleeping area
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/bed.jpg', 'royal-suite', $2, 'approved', true);
    `, [listingId, roomId]);

    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(false);
    // Room has only 1 approved room photo, despite 5 common photos
    expect(validation.errors.some(e => e.includes('only 1 approved photo(s)'))).toBe(true);
  });

  // Test 4: Property can be published when all room types have >= 3 approved photos + >= 1 sleeping area photo
  it('Test 4: Property can be published when all room types meet PROPOSED-007 requirements', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (304, 1001, 'Pine Forest Cabin', 'Woodland escape', 18000, 'cabin', 'Pine Ridge', 'Kodaikanal', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Forest Loft', 'loft', 18000, 2)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // 3 approved photos: 1 sleeping area, 2 others
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/loft-bed.jpg', 'loft', $2, 'approved', true),
        ('listing', $1, 'https://images.encho.space/loft-desk.jpg', 'loft', $2, 'approved', false),
        ('listing', $1, 'https://images.encho.space/loft-bath.jpg', 'loft', $2, 'approved', false);
    `, [listingId, roomId]);

    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);

    const res = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.publication_status).toBe('published');

    const checkListing = await pool.query('SELECT publication_status FROM listings WHERE id = $1', [listingId]);
    expect(checkListing.rows[0].publication_status).toBe('published');
  });

  // Test 5: Unapproved/rejected photos are excluded from public stay projection
  it('Test 5: Unapproved/rejected photos are excluded from public stay projection', () => {
    const approvedPhoto = {
      id: 'photo_1',
      url: 'https://images.encho.space/approved.jpg',
      tier: 'deluxe',
      category: 'bedroom',
      moderation_status: 'approved',
      is_sleeping_area: true
    };
    const pendingPhoto = {
      id: 'photo_2',
      url: 'https://images.encho.space/pending.jpg',
      tier: 'deluxe',
      category: 'pool',
      moderation_status: 'pending'
    };
    const rejectedPhoto = {
      id: 'photo_3',
      url: 'https://images.encho.space/rejected.jpg',
      tier: 'deluxe',
      category: 'exterior',
      moderation_status: 'rejected'
    };

    expect(mapPublicMediaAsset(approvedPhoto)).not.toBeNull();
    expect(mapPublicMediaAsset(approvedPhoto)?.url).toBe('https://images.encho.space/approved.jpg');
    expect(mapPublicMediaAsset(approvedPhoto)?.isSleepingArea).toBe(true);

    // Unapproved or rejected photos must be dropped
    expect(mapPublicMediaAsset(pendingPhoto)).toBeNull();
    expect(mapPublicMediaAsset(rejectedPhoto)).toBeNull();

    // In stay projection
    const rawListing = {
      id: 501,
      title: 'Projection Test Stay',
      price: 10000,
      publication_status: 'published',
      city: 'Goa',
      photos: [approvedPhoto, pendingPhoto, rejectedPhoto]
    };

    const projection = toPublicStayProjection(rawListing);
    expect(projection.photos.length).toBe(1);
    expect(projection.photos[0].url).toBe('https://images.encho.space/approved.jpg');
  });

  // Test 6: Relational tables take precedence over legacy JSON even when JSON is populated
  it('Test 6: Relational tables take precedence over legacy JSON even when JSON is populated', async () => {
    const legacyRoomsJson = JSON.stringify([
      { id: 'legacy_1', name: 'Legacy Old Suite', type: 'legacy', price: 5000, capacity: 1 }
    ]);
    const legacyPhotosJson = JSON.stringify([
      { url: 'https://images.encho.space/legacy.jpg', tier: 'legacy' }
    ]);

    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (306, 1001, 'Dual Authority Villa', 'Testing authority precedence', 20000, 'villa', 'Rd 6', 'Udaipur', 'dual-auth-306', 'published', $1, $2)
      RETURNING id;
    `, [legacyRoomsJson, legacyPhotosJson]);
    const listingId = listingRes.rows[0].id;

    // Relational rooms (authoritative)
    const rtRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Authoritative Relational Suite', 'relational-suite', 22000, 3)
      RETURNING id;
    `, [listingId]);
    const roomId = rtRes.rows[0].id;

    // Relational media (authoritative)
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES ($1, $2, 'https://images.encho.space/relational-bedroom.jpg', 'relational-suite', $3, 'approved', true);
    `, ['listing', listingId, roomId]);

    // Query stay endpoint
    const res = await request(app)
      .get('/api/v2/stays/dual-auth-306')
      .expect(200);

    // Must show authoritative relational suite, not legacy suite
    expect(res.body.rooms.length).toBe(1);
    expect(res.body.rooms[0].name).toBe('Authoritative Relational Suite');
    expect(res.body.rooms[0].price).toBe(22000);
    expect(res.body.photos.length).toBe(1);
    expect(res.body.photos[0].url).toBe('https://images.encho.space/relational-bedroom.jpg');

    const jsonString = JSON.stringify(res.body);
    expect(jsonString).not.toContain('Legacy Old Suite');
    expect(jsonString).not.toContain('https://images.encho.space/legacy.jpg');
  });

  // Test 7: Fallback to legacy JSON only when relational tables have 0 rows
  it('Test 7: Fallback to legacy JSON only when relational tables have 0 rows', async () => {
    const legacyRoomsJson = JSON.stringify([
      { id: 'fallback_1', name: 'Legacy Fallback Bedroom', type: 'fallback', price: 9000, capacity: 2 }
    ]);
    const legacyPhotosJson = JSON.stringify([
      { url: 'https://images.encho.space/fallback.jpg', tier: 'fallback', category: 'bedroom' }
    ]);

    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (307, 1001, 'Fallback Sanctuary', 'Testing graceful fallback', 9000, 'cottage', 'Rd 7', 'Coorg', 'fallback-307', 'published', $1, $2)
      RETURNING id;
    `, [legacyRoomsJson, legacyPhotosJson]);

    // No rows in room_types or media_assets
    const res = await request(app)
      .get('/api/v2/stays/fallback-307')
      .expect(200);

    // Graceful fallback to legacy JSON
    expect(res.body.rooms.length).toBe(1);
    expect(res.body.rooms[0].name).toBe('Legacy Fallback Bedroom');
    expect(res.body.rooms[0].price).toBe(9000);
    expect(res.body.photos.length).toBe(1);
    expect(res.body.photos[0].url).toBe('https://images.encho.space/fallback.jpg');
  });

  // Test 8: Non-destructive room updates preserve existing room IDs
  it('Test 8: Non-destructive room updates via PUT /api/listings/:id/rooms preserve existing room IDs', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (308, 1001, 'Upsert Testing Haven', 'Testing non-destructive upserts', 14000, 'resort', 'Rd 8', 'Alibaug', 'published')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    // Create existing room
    const initRoomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Garden Villa Room', 'garden-villa', 14000, 2)
      RETURNING id;
    `, [listingId]);
    const existingRoomId = initRoomRes.rows[0].id;

    // Link a media asset to this specific existing room ID
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES ('listing', $1, 'https://images.encho.space/garden-bed.jpg', 'garden-villa', $2, 'approved', true);
    `, [listingId, existingRoomId]);

    // Perform PUT update with modified room name and price, passing same ID
    await request(app)
      .put(`/api/listings/${listingId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rooms: [
          {
            id: String(existingRoomId),
            name: 'Renovated Garden Luxury Villa',
            type: 'garden-villa',
            price: 16500,
            capacity: 3
          }
        ]
      })
      .expect(200);

    // Verify the existing row ID was preserved (NOT deleted and re-inserted with new ID)
    const checkRoom = await pool.query('SELECT * FROM room_types WHERE listing_id = $1', [listingId]);
    expect(checkRoom.rows.length).toBe(1);
    expect(checkRoom.rows[0].id).toBe(existingRoomId);
    expect(checkRoom.rows[0].name).toBe('Renovated Garden Luxury Villa');
    expect(checkRoom.rows[0].base_price).toBe(16500);

    // Verify foreign key integrity in media_assets is fully preserved
    const checkMedia = await pool.query('SELECT room_type_id FROM media_assets WHERE entity_id = $1', [listingId]);
    expect(checkMedia.rows[0].room_type_id).toBe(existingRoomId);
  });

  // Test 9: HostForm dual-write populates room_types and media_assets with room_type_id and is_sleeping_area
  it('Test 9: Listing creation populates room_types and media_assets with room_type_id and is_sleeping_area', async () => {
    const createPayload = {
      title: 'Sunset Beach Bungalow',
      description: 'Stunning beachfront experience with curated interiors and direct ocean access.',
      price: '28000',
      type: 'resort',
      address: 'Beach Road 99',
      city: 'Gokarna',
      rentalMode: 'entire_place',
      rooms: [
        {
          id: 'temp_room_1',
          name: 'Ocean Breeze Suite',
          type: 'ocean-suite',
          price: 28000,
          capacity: 2,
          inventory_count: 1,
          description: 'Ocean facing suite with plush king bed',
          specs: '800 sq.ft · Sea View',
          photos: [
            {
              id: 'p1',
              url: 'https://images.encho.space/ocean-bed.jpg',
              category: 'bedroom',
              is_sleeping_area: true,
              tier: 'ocean-suite'
            },
            {
              id: 'p2',
              url: 'https://images.encho.space/ocean-terrace.jpg',
              category: 'exterior',
              is_sleeping_area: false,
              tier: 'ocean-suite'
            }
          ]
        }
      ],
      photos: [
        {
          id: 'p_common',
          url: 'https://images.encho.space/common-pool.jpg',
          tier: 'common',
          category: 'pool',
          is_sleeping_area: false
        }
      ]
    };

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send(createPayload)
      .expect(201);

    const createdListingId = res.body.id;
    expect(createdListingId).toBeDefined();

    // Verify relational room_types was populated
    const rtRes = await pool.query('SELECT * FROM room_types WHERE listing_id = $1', [createdListingId]);
    expect(rtRes.rows.length).toBe(1);
    expect(rtRes.rows[0].name).toBe('Ocean Breeze Suite');
    expect(rtRes.rows[0].base_price).toBe(28000);
    const roomTypeId = rtRes.rows[0].id;

    // Verify relational media_assets was populated with linked room_type_id and is_sleeping_area
    const mediaRes = await pool.query(
      'SELECT * FROM media_assets WHERE entity_id = $1 ORDER BY id ASC',
      [createdListingId]
    );
    expect(mediaRes.rows.length).toBe(3);

    const bedPhoto = mediaRes.rows.find((m: any) => m.url === 'https://images.encho.space/ocean-bed.jpg');
    expect(bedPhoto).toBeDefined();
    expect(bedPhoto.room_type_id).toBe(roomTypeId);
    expect(bedPhoto.is_sleeping_area).toBe(true);

    const poolPhoto = mediaRes.rows.find((m: any) => m.url === 'https://images.encho.space/common-pool.jpg');
    expect(poolPhoto).toBeDefined();
    expect(poolPhoto.room_type_id).toBeNull();
    expect(poolPhoto.is_sleeping_area).toBe(false);
  });

  // Test 10: Idempotent backfill script converts legacy JSON to relational records without duplicating rows
  it('Test 10: Idempotent backfill script converts legacy JSON to relational records without duplicate rows', async () => {
    const legacyRoomsJson = JSON.stringify([
      { id: 'b_room_1', name: 'Backfill Master Suite', type: 'master-suite', price: 19000, capacity: 2 },
      { id: 'b_room_2', name: 'Backfill Garden Room', type: 'garden-room', price: 11000, capacity: 2 }
    ]);
    const legacyPhotosJson = JSON.stringify([
      { url: 'https://images.encho.space/bf-suite-bed.jpg', tier: 'master-suite', category: 'bedroom', is_sleeping_area: true },
      { url: 'https://images.encho.space/bf-common-pool.jpg', tier: 'common', category: 'pool' }
    ]);

    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (310, 1001, 'Backfill Target Villa', 'Testing idempotent migration', 19000, 'villa', 'Rd 10', 'Kasol', 'backfill-310', 'draft', $1, $2)
      RETURNING id;
    `, [legacyRoomsJson, legacyPhotosJson]);
    const listingId = listingRes.rows[0].id;

    // Run backfill first time
    const res1 = await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res1.body.success).toBe(true);
    expect(res1.body.backfilledRooms).toBeGreaterThanOrEqual(2);
    expect(res1.body.backfilledMedia).toBeGreaterThanOrEqual(2);

    const roomsAfter1 = await pool.query('SELECT * FROM room_types WHERE listing_id = $1', [listingId]);
    expect(roomsAfter1.rows.length).toBe(2);

    const mediaAfter1 = await pool.query('SELECT * FROM media_assets WHERE entity_id = $1', [listingId]);
    expect(mediaAfter1.rows.length).toBe(2);

    // Verify room linkage and sleeping area in backfilled media
    const bedMedia = mediaAfter1.rows.find((m: any) => m.url === 'https://images.encho.space/bf-suite-bed.jpg');
    expect(bedMedia.is_sleeping_area).toBe(true);
    expect(bedMedia.room_type_id).not.toBeNull();

    // Run backfill a SECOND time (idempotency check)
    const res2 = await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res2.body.success).toBe(true);
    expect(res2.body.backfilledRooms).toBe(0);
    expect(res2.body.backfilledMedia).toBe(0);

    // Verify row counts DID NOT double
    const roomsAfter2 = await pool.query('SELECT * FROM room_types WHERE listing_id = $1', [listingId]);
    expect(roomsAfter2.rows.length).toBe(2);

    const mediaAfter2 = await pool.query('SELECT * FROM media_assets WHERE entity_id = $1', [listingId]);
    expect(mediaAfter2.rows.length).toBe(2);
  });

  // Test 11: Cross-property room assignment rejected with 422
  it('Test 11: Cross-property room assignment is rejected with 422 (room_types.listing_id !== media_assets.entity_id)', async () => {
    // Listing A
    const listingARes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (311, 1001, 'Property A', 'First property', 10000, 'villa', 'Rd A', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingAId = listingARes.rows[0].id;

    // Listing B
    const listingBRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (312, 1001, 'Property B', 'Second property', 15000, 'resort', 'Rd B', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingBId = listingBRes.rows[0].id;

    // Room belonging to Property B
    const roomBRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Suite in B', 'suite-b', 15000)
      RETURNING id;
    `, [listingBId]);
    const roomBId = roomBRes.rows[0].id;

    // Media asset belonging to Property A
    const mediaARes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/prop-a-photo.jpg', 'common', 'pending_review')
      RETURNING id;
    `, [listingAId]);
    const mediaAId = mediaARes.rows[0].id;

    // Attempt to assign Room B to Media A (cross-property violation)
    const patchRes = await request(app)
      .patch(`/api/admin/media-assets/${mediaAId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomBId })
      .expect(422);

    expect(patchRes.body.error).toContain('Cross-property room assignment rejected');

    // Verify room_type_id was NOT updated in DB
    const checkMedia = await pool.query('SELECT room_type_id FROM media_assets WHERE id = $1', [mediaAId]);
    expect(checkMedia.rows[0].room_type_id).toBeNull();
  });

  // Test 12: Durable backfill conflicts are recorded in backfill_conflict_records
  it('Test 12: Durable backfill conflicts are recorded in backfill_conflict_records for ambiguous/invalid data', async () => {
    // Listing with invalid media (empty URL) and invalid room (missing both name and type)
    const brokenRoomsJson = JSON.stringify([
      { id: 'broken_1', price: 5000 } // No name, no type
    ]);
    const brokenPhotosJson = JSON.stringify([
      { id: 'broken_p1', url: '' } // Empty URL
    ]);

    await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (313, 1001, 'Broken Data Villa', 'Has invalid records', 5000, 'villa', 'Rd C', 'Delhi', 'broken-313', 'draft', $1, $2);
    `, [brokenRoomsJson, brokenPhotosJson]);

    await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    // Verify backfill_conflict_records table contains durable audit records
    const conflictRecords = await pool.query('SELECT * FROM backfill_conflict_records WHERE listing_id = 313 ORDER BY id ASC');
    expect(conflictRecords.rows.length).toBe(2);

    const roomConflict = conflictRecords.rows.find((r: any) => r.source_type === 'room');
    expect(roomConflict).toBeDefined();
    expect(roomConflict.reason).toContain('missing both name and type');
    expect(roomConflict.status).toBe('manual_review');

    const mediaConflict = conflictRecords.rows.find((r: any) => r.source_type === 'media');
    expect(mediaConflict).toBeDefined();
    expect(mediaConflict.reason).toContain('missing or empty URL');
  });

  // Test 13: Moderation bypass rejection: NULL or pending_review media does NOT satisfy publication
  it('Test 13: Media with NULL or pending_review moderation_status does NOT count toward 3-photo rule', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (314, 1001, 'Pending Moderation Estate', 'Photos not yet approved', 15000, 'estate', 'Rd D', 'Ooty', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Presidential Suite', 'presidential', 15000)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // 3 room photos with sleeping area, but 2 are pending_review and 1 is NULL moderation_status
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/pending1.jpg', 'presidential', $2, 'pending_review', true),
        ('listing', $1, 'https://images.encho.space/pending2.jpg', 'presidential', $2, 'pending_review', false),
        ('listing', $1, 'https://images.encho.space/null-mod.jpg', 'presidential', $2, NULL, false);
    `, [listingId, roomId]);

    // Validation must strictly fail because approved count is 0
    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('only 0 approved photo(s)'))).toBe(true);

    // Attempting publication via status PATCH must return 422
    await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(422);
  });

  // Test 14: Sleeping area is NOT inferred from category = bedroom
  it('Test 14: Sleeping area must be explicit is_sleeping_area = true; category = bedroom is NOT inferred', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (315, 1001, 'Category Test Chalet', 'Testing no bedroom inference', 12000, 'chalet', 'Rd E', 'Shimla', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Cedar Suite', 'cedar', 12000)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // 3 approved photos with category = 'bedroom', but is_sleeping_area = false
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, category, is_sleeping_area)
      VALUES
        ('listing', $1, 'https://images.encho.space/b1.jpg', 'cedar', $2, 'approved', 'bedroom', false),
        ('listing', $1, 'https://images.encho.space/b2.jpg', 'cedar', $2, 'approved', 'bedroom', false),
        ('listing', $1, 'https://images.encho.space/b3.jpg', 'cedar', $2, 'approved', 'bedroom', false);
    `, [listingId, roomId]);

    const validation = await validatePropertyPublication(listingId, pool);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('must have at least 1 approved photo showing the sleeping area'))).toBe(true);
  });

  // Test 15: Ordinary room/media update omits an existing record: omitted records remain preserved
  it('Test 15: Ordinary room and media update omits existing records: omitted records remain preserved in DB', async () => {
    // 1. Create listing with 2 rooms and 2 media assets
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (316, 1001, 'Preservation Villa', 'Testing non-destructive updates', 20000, 'villa', 'Preservation Lane', 'Udaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const r1Res = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Master Suite', 'master', 15000)
      RETURNING id;
    `, [listingId]);
    const r1Id = r1Res.rows[0].id;

    const r2Res = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Guest Bedroom', 'guest', 10000)
      RETURNING id;
    `, [listingId]);
    const r2Id = r2Res.rows[0].id;

    const m1Res = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/master-room.jpg', 'master', $2, 'pending_review')
      RETURNING id;
    `, [listingId, r1Id]);
    const m1Id = m1Res.rows[0].id;

    const m2Res = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/guest-room.jpg', 'guest', $2, 'pending_review')
      RETURNING id;
    `, [listingId, r2Id]);
    const m2Id = m2Res.rows[0].id;

    // 2. PUT /api/listings/:id/rooms omitting Guest Bedroom (r2)
    const putRoomsRes = await request(app)
      .put(`/api/listings/${listingId}/rooms`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        rooms: [
          { id: r1Id, name: 'Master Suite Updated', type: 'master', price: 16000 }
        ]
      })
      .expect(200);

    expect(putRoomsRes.body.success).toBe(true);

    // Verify Guest Bedroom (r2) is STILL PRESERVED in room_types table
    const checkRooms = await pool.query('SELECT id, name FROM room_types WHERE listing_id = $1 ORDER BY id ASC', [listingId]);
    expect(checkRooms.rows.length).toBe(2);
    expect(checkRooms.rows.map((r: any) => r.id)).toContain(r2Id);
    // And its linked media did not have room_type_id nulled
    const checkM2 = await pool.query('SELECT room_type_id FROM media_assets WHERE id = $1', [m2Id]);
    expect(checkM2.rows[0].room_type_id).toBe(r2Id);

    // 3. PUT /api/listings/:id omitting m2 photo
    const putListingRes = await request(app)
      .put(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Preservation Villa Updated',
        photos: [
          { id: m1Id, url: 'https://images.encho.space/master-room.jpg', tier: 'master' }
        ]
      })
      .expect(200);

    expect(putListingRes.body.success).toBe(true);

    // Verify m2 photo is STILL PRESERVED in media_assets table
    const checkMedia = await pool.query('SELECT id, url FROM media_assets WHERE entity_id = $1 ORDER BY id ASC', [listingId]);
    expect(checkMedia.rows.length).toBe(2);
    expect(checkMedia.rows.map((m: any) => m.id)).toContain(m2Id);
  });

  // Test 16: Forced failure during room dual-write rolls back legacy and relational state atomically
  it('Test 16: Failure during room dual-write rolls back both relational and legacy state atomically', async () => {
    const initialRooms = [{ id: 'init-1', name: 'Initial Suite', type: 'initial', price: 5000 }];
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status, rooms)
      VALUES (317, 1001, 'Atomic Rollback Manor', 'Testing transaction atomicity', 5000, 'manor', 'Lane 1', 'Kochi', 'draft', $1)
      RETURNING id;
    `, [JSON.stringify(initialRooms)]);
    const listingId = listingRes.rows[0].id;

    await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Initial Suite', 'initial', 5000);
    `, [listingId]);

    // Send an invalid payload where price is an invalid type that causes a DB error or invalid constraint
    // For example, base_price is a DECIMAL column, sending an uncastable string or bad structure
    // To trigger rollback safely: send room with name exceeding VARCHAR(255) limit
    const oversizedName = 'A'.repeat(500); // room_types.name is VARCHAR(255)
    const errRes = await request(app)
      .put(`/api/listings/${listingId}/rooms`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        rooms: [
          { name: oversizedName, type: 'overflow', price: 9000 }
        ]
      })
      .expect(500);

    expect(errRes.body.error).toBeDefined();

    // Verify relational state rolled back: only initial room exists, no new room inserted
    const checkRooms = await pool.query('SELECT name FROM room_types WHERE listing_id = $1', [listingId]);
    expect(checkRooms.rows.length).toBe(1);
    expect(checkRooms.rows[0].name).toBe('Initial Suite');

    // Verify legacy listings.rooms state rolled back: still contains initialRooms
    const checkListing = await pool.query('SELECT rooms FROM listings WHERE id = $1', [listingId]);
    const listingRooms = typeof checkListing.rows[0].rooms === 'string'
      ? JSON.parse(checkListing.rows[0].rooms)
      : checkListing.rows[0].rooms;
    expect(listingRooms[0].name).toBe('Initial Suite');
  });

  // Test 17: Host submitting moderation_status = 'approved' is stored as pending_review and rejected for publication
  it('Test 17: Host submitting moderation_status=approved is forced to pending_review and publication is rejected', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (318, 1001, 'Bypass Attempt Villa', 'Testing host moderation boundary', 10000, 'villa', 'Lane 2', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    // Host updates listing attempting to sneak in approved photos
    await request(app)
      .put(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Bypass Attempt Villa',
        rooms: [
          { name: 'Seaview Room', type: 'seaview', price: 10000, capacity: 2 }
        ],
        photos: [
          { url: 'https://images.encho.space/sea1.jpg', tier: 'seaview', is_sleeping_area: true, moderation_status: 'approved' },
          { url: 'https://images.encho.space/sea2.jpg', tier: 'seaview', is_sleeping_area: false, moderation_status: 'approved' },
          { url: 'https://images.encho.space/sea3.jpg', tier: 'seaview', is_sleeping_area: false, moderation_status: 'approved' }
        ]
      })
      .expect(200);

    // Verify DB stored moderation_status as 'pending_review', NOT 'approved'
    const mediaCheck = await pool.query('SELECT moderation_status FROM media_assets WHERE entity_id = $1', [listingId]);
    expect(mediaCheck.rows.length).toBe(3);
    for (const row of mediaCheck.rows) {
      expect(row.moderation_status).toBe('pending_review');
    }

    // Publication must be rejected with 422 because approved photo count is 0
    const pubRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(422);

    expect(pubRes.body.error).toContain('PROPOSED-007');
    expect(pubRes.body.details.some((d: string) => d.includes('only 0 approved photo(s)'))).toBe(true);
  });

  // Test 18: Admin approval via PATCH /api/admin/media-assets/:id/moderation permits publication
  it('Test 18: Admin approval via PATCH /api/admin/media-assets/:id/moderation permits publication', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (319, 1001, 'Legitimate Review Villa', 'Waiting for admin review', 15000, 'villa', 'Lane 3', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const roomRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Deluxe Room', 'deluxe', 15000)
      RETURNING id;
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // Insert 3 photos as pending_review
    const m1 = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES ('listing', $1, 'https://images.encho.space/deluxe-bed.jpg', 'deluxe', $2, 'pending_review', true)
      RETURNING id;
    `, [listingId, roomId]);
    const m2 = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES ('listing', $1, 'https://images.encho.space/deluxe-bath.jpg', 'deluxe', $2, 'pending_review', false)
      RETURNING id;
    `, [listingId, roomId]);
    const m3 = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, room_type_id, moderation_status, is_sleeping_area)
      VALUES ('listing', $1, 'https://images.encho.space/deluxe-view.jpg', 'deluxe', $2, 'pending_review', false)
      RETURNING id;
    `, [listingId, roomId]);

    // Admin approves each asset
    for (const mId of [m1.rows[0].id, m2.rows[0].id, m3.rows[0].id]) {
      await request(app)
        .patch(`/api/admin/media-assets/${mId}/moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ moderation_status: 'approved' })
        .expect(200);
    }

    // Now publication succeeds with 200
    const pubRes = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(200);

    expect(pubRes.body.success).toBe(true);
    expect(pubRes.body.publication_status).toBe('published');
  });

  // Test 19: Ambiguous tier mapping creates exactly one durable conflict and NO unassigned media row; idempotent on re-run
  it('Test 19: Ambiguous tier mapping creates durable conflict record and NO unassigned media row; re-run creates no duplicates', async () => {
    // Listing has a photo claiming tier "penthouse", but NO room type exists for "penthouse"
    const photosJson = JSON.stringify([
      { id: 'photo_ambig_1', url: 'https://images.encho.space/mystery-penthouse.jpg', tier: 'penthouse' }
    ]);

    await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (320, 1001, 'Ambiguous Tier Chalet', 'Has unmapped tier media', 15000, 'chalet', 'Lane 4', 'Manali', 'ambig-320', 'draft', '[]', $1);
    `, [photosJson]);

    const res1 = await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res1.body.success).toBe(true);
    expect(res1.body.conflictsCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res1.body.conflictIds)).toBe(true);

    // Verify NO unassigned media was inserted
    const mediaCheck = await pool.query('SELECT * FROM media_assets WHERE entity_id = 320');
    expect(mediaCheck.rows.length).toBe(0);

    // Verify exactly ONE conflict record was created in backfill_conflict_records
    const conflicts = await pool.query('SELECT * FROM backfill_conflict_records WHERE listing_id = 320');
    expect(conflicts.rows.length).toBe(1);
    expect(conflicts.rows[0].reason).toContain('Ambiguous tier mapping');
    expect(conflicts.rows[0].source_type).toBe('media');

    // Re-run backfill (idempotency check)
    const res2 = await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res2.body.conflictsCount).toBe(0);

    // Verify conflict records count DID NOT increase
    const conflictsAfter2 = await pool.query('SELECT * FROM backfill_conflict_records WHERE listing_id = 320');
    expect(conflictsAfter2.rows.length).toBe(1);
  });

  // Test 20: Verified absence of DELETE FROM room_types and DELETE FROM media_assets in ordinary update flows
  it('Test 20: Verified absence of DELETE FROM room_types and DELETE FROM media_assets in ordinary update flows', async () => {
    // When updating listing or rooms with completely disjoint items, old records are NOT deleted
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (321, 1001, 'No Delete Verification Stay', 'Verification', 12000, 'villa', 'Lane 5', 'Jaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Original Room', 'orig_tier', 12000);
    `, [listingId]);

    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/original.jpg', 'common', 'approved');
    `, [listingId]);

    // Send empty payload or entirely different items
    await request(app)
      .put(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'No Delete Verification Stay Updated',
        rooms: [{ name: 'Brand New Room', type: 'new_tier', price: 14000 }],
        photos: [{ url: 'https://images.encho.space/brand-new.jpg', tier: 'common' }]
      })
      .expect(200);

    // Verify both original room and new room exist
    const rooms = await pool.query('SELECT * FROM room_types WHERE listing_id = $1', [listingId]);
    expect(rooms.rows.length).toBe(2);

    // Verify both original photo and new photo exist
    const photos = await pool.query('SELECT * FROM media_assets WHERE entity_id = $1', [listingId]);
    expect(photos.rows.length).toBe(2);
  });

  // Test 21: Legacy photo claiming moderation_status = 'approved' in JSON is backfilled as pending_review and cannot publish
  it('Test 21: Legacy photo claiming moderation_status=approved in JSON is backfilled as pending_review and cannot publish', async () => {
    const photosWithApprovedJson = JSON.stringify([
      { url: 'https://images.encho.space/claimed-approved-bed.jpg', tier: 'legacy_tier', is_sleeping_area: true, moderation_status: 'approved' },
      { url: 'https://images.encho.space/claimed-approved-bath.jpg', tier: 'legacy_tier', is_sleeping_area: false, moderation_status: 'approved' },
      { url: 'https://images.encho.space/claimed-approved-view.jpg', tier: 'legacy_tier', is_sleeping_area: false, moderation_status: 'approved' }
    ]);
    const roomsJson = JSON.stringify([
      { name: 'Legacy Room', type: 'legacy_tier', price: 10000, capacity: 2 }
    ]);

    await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, slug, publication_status, rooms, photos)
      VALUES (322, 1001, 'Claimed Approved Chalet', 'Has claimed approved photos in JSON', 10000, 'chalet', 'Lane 6', 'Manali', 'claimed-322', 'draft', $1, $2);
    `, [roomsJson, photosWithApprovedJson]);

    // Run backfill
    const res = await request(app)
      .post('/api/admin/backfill/room-media-authority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.backfilledRooms).toBe(1);
    expect(res.body.backfilledMedia).toBe(3);

    // Verify all 3 backfilled media rows have moderation_status = 'pending_review', NOT 'approved'
    const mediaCheck = await pool.query('SELECT moderation_status FROM media_assets WHERE entity_id = 322');
    expect(mediaCheck.rows.length).toBe(3);
    for (const m of mediaCheck.rows) {
      expect(m.moderation_status).toBe('pending_review');
    }

    // Direct validator check must fail (0 approved photos)
    const validation = await validatePropertyPublication(322, pool);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('only 0 approved photo(s)'))).toBe(true);

    // Attempting publication via status PATCH must return 422
    await request(app)
      .patch('/api/admin/listings/322/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publication_status: 'published' })
      .expect(422);
  });

  // Test 22: PATCH /api/admin/media-assets/:id/moderation rejects invalid moderation_status values with 400
  it('Test 22: PATCH /api/admin/media-assets/:id/moderation rejects invalid moderation_status values with 400', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (323, 1001, 'Moderation Validation Villa', 'Testing invalid moderation status', 11000, 'villa', 'Lane 7', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    const mediaRes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/test-status.jpg', 'common', 'pending_review')
      RETURNING id;
    `, [listingId]);
    const mediaId = mediaRes.rows[0].id;

    // Send invalid status: 'bypassed', 'auto_approved', 'random'
    for (const badStatus of ['bypassed', 'auto_approved', 'random_value', '']) {
      const errRes = await request(app)
        .patch(`/api/admin/media-assets/${mediaId}/moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ moderation_status: badStatus })
        .expect(400);

      expect(errRes.body.error).toContain('Invalid moderation_status');
    }

    // Verify DB was NOT updated
    const checkMedia = await pool.query('SELECT moderation_status FROM media_assets WHERE id = $1', [mediaId]);
    expect(checkMedia.rows[0].moderation_status).toBe('pending_review');
  });

  // Test 23: PATCH /api/admin/media-assets/:id/moderation atomically verifies same-property room assignment and rejects cross-property
  it('Test 23: PATCH /api/admin/media-assets/:id/moderation permits same-property room assignment and rejects cross-property with 422', async () => {
    // Listing A
    const listingARes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (324, 1001, 'Prop A', 'First', 10000, 'villa', 'A Rd', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingAId = listingARes.rows[0].id;

    // Listing B
    const listingBRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (325, 1001, 'Prop B', 'Second', 15000, 'villa', 'B Rd', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingBId = listingBRes.rows[0].id;

    // Room in Prop A
    const roomARes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Room in A', 'suite-a', 10000)
      RETURNING id;
    `, [listingAId]);
    const roomAId = roomARes.rows[0].id;

    // Room in Prop B
    const roomBRes = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Room in B', 'suite-b', 15000)
      RETURNING id;
    `, [listingBId]);
    const roomBId = roomBRes.rows[0].id;

    // Media in Prop A
    const mediaARes = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/photo-a.jpg', 'common', 'pending_review')
      RETURNING id;
    `, [listingAId]);
    const mediaAId = mediaARes.rows[0].id;

    // Cross-property assignment: Media A (listing 324) -> Room B (listing 325) must fail with 422
    const failRes = await request(app)
      .patch(`/api/admin/media-assets/${mediaAId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomBId })
      .expect(422);

    expect(failRes.body.error).toContain('Cross-property room assignment rejected');

    // Same-property assignment: Media A (listing 324) -> Room A (listing 324) must succeed with 200
    const okRes = await request(app)
      .patch(`/api/admin/media-assets/${mediaAId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ room_type_id: roomAId, moderation_status: 'approved', is_sleeping_area: true })
      .expect(200);

    expect(okRes.body.success).toBe(true);

    const checkMedia = await pool.query('SELECT room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE id = $1', [mediaAId]);
    expect(checkMedia.rows[0].room_type_id).toBe(roomAId);
    expect(checkMedia.rows[0].moderation_status).toBe('approved');
    expect(checkMedia.rows[0].is_sleeping_area).toBe(true);
  });

  // Test 24: Database-level check constraints reject invalid inserts (prices < 0, occupancy < 1, inventory < 1, invalid moderation status)
  it('Test 24: Database-level check constraints reject invalid inserts/updates for room_types and media_assets', async () => {
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (326, 1001, 'Constraint Test Villa', 'Testing check constraints', 10000, 'villa', 'C Rd', 'Goa', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    // 1. base_price < 0 must be rejected
    await expect(pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price)
      VALUES ($1, 'Negative Price Room', 'neg', -500)
    `, [listingId])).rejects.toThrow();

    // 2. max_occupancy < 1 must be rejected
    await expect(pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy)
      VALUES ($1, 'Zero Occupancy Room', 'zero_occ', 5000, 0)
    `, [listingId])).rejects.toThrow();

    // 3. inventory_count < 1 must be rejected
    await expect(pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, inventory_count)
      VALUES ($1, 'Zero Inventory Room', 'zero_inv', 5000, 0)
    `, [listingId])).rejects.toThrow();

    // 4. min_stay_nights < 1 must be rejected
    await expect(pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, min_stay_nights)
      VALUES ($1, 'Zero Min Stay Room', 'zero_stay', 5000, 0)
    `, [listingId])).rejects.toThrow();

    // 5. media_assets invalid moderation_status must be rejected
    await expect(pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/invalid.jpg', 'common', 'bogus_status')
    `, [listingId])).rejects.toThrow();

    // 6. Valid room and media must succeed
    const validRoom = await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count, min_stay_nights)
      VALUES ($1, 'Valid Room', 'valid', 5000, 2, 1, 1)
      RETURNING id
    `, [listingId]);
    expect(validRoom.rows[0].id).toBeDefined();

    const validMedia = await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES ('listing', $1, 'https://images.encho.space/valid.jpg', 'common', 'approved')
      RETURNING id
    `, [listingId]);
    expect(validMedia.rows[0].id).toBeDefined();
  });

  // Test 25: Migration 004 contains NOT VALID on all CHECK constraints for non-blocking deploy on existing data
  it('Test 25: Migration 004 contains NOT VALID on all CHECK constraints', () => {
    const migration004Path = path.resolve(__dirname, '../migrations/004_canonical_constraints.sql');
    expect(fs.existsSync(migration004Path)).toBe(true);

    const content = fs.readFileSync(migration004Path, 'utf8');

    // Invariant: each CHECK constraint added in migration 004 MUST include NOT VALID
    const constraints = [
      'chk_media_assets_moderation_status',
      'chk_room_types_base_price',
      'chk_room_types_max_occupancy',
      'chk_room_types_inventory_count',
      'chk_room_types_min_stay_nights'
    ];

    for (const constraint of constraints) {
      expect(content).toContain(constraint);
      // Ensure the constraint declaration ends with NOT VALID;
      const regex = new RegExp(`ADD\\s+CONSTRAINT\\s+${constraint}[\\s\\S]*?NOT\\s+VALID;`, 'i');
      expect(regex.test(content)).toBe(true);
    }
  });

  // Test 26: Preflight script accurately inspects historical invariants in read-only mode and handles legacy NULLs correctly
  it('Test 26: Preflight script accurately inspects historical invariants in read-only mode and handles legacy NULLs as informational', async () => {
    const { runReadOnlyPreflight } = await import('../../scripts/preflight_m3_constraints');

    // 1. On clean tables, preflight should pass with 0 violations
    const initialReport = await runReadOnlyPreflight(pool);
    expect(initialReport.totalViolations).toBe(0);
    expect(initialReport.cleared).toBe(true);

    // 2. Insert valid listing with a legacy NULL moderation status photo
    const listingRes = await pool.query(`
      INSERT INTO listings (id, user_id, title, description, price, type, address, city, publication_status)
      VALUES (327, 1001, 'Preflight Sample Villa', 'Testing preflight reporting', 10000, 'villa', 'Preflight Rd', 'Udaipur', 'draft')
      RETURNING id;
    `);
    const listingId = listingRes.rows[0].id;

    await pool.query(`
      INSERT INTO room_types (listing_id, name, type, base_price, max_occupancy, inventory_count, min_stay_nights)
      VALUES ($1, 'Clean Suite', 'clean', 8000, 2, 2, 1);
    `, [listingId]);

    // Insert 1 approved photo and 1 legacy NULL photo
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, moderation_status)
      VALUES
        ('listing', $1, 'https://images.encho.space/clean.jpg', 'common', 'approved'),
        ('listing', $1, 'https://images.encho.space/legacy_null.jpg', 'common', NULL);
    `, [listingId]);

    const reportWithNull = await runReadOnlyPreflight(pool);
    // Invariant: NULL moderation status is allowed by migration 004, so it is NOT a constraint violation
    expect(reportWithNull.totalViolations).toBe(0);
    expect(reportWithNull.legacyNullCount).toBe(1);
    expect(reportWithNull.cleared).toBe(true);

    const nullReport = reportWithNull.reports.find(r => r.name.includes('NULL'));
    expect(nullReport).toBeDefined();
    expect(nullReport?.isViolation).toBe(false);
    expect(nullReport?.status).toBe('INFORMATIONAL');
  });

  // Test 27: No unapplied VALIDATE migrations exist in src/migrations to prevent runner auto-discovery
  it('Test 27: No unapplied deferred VALIDATE migration is present in src/migrations', () => {
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const sqlFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

    // Verify 005_validate_canonical_constraints.sql is NOT in src/migrations
    expect(sqlFiles).not.toContain('005_validate_canonical_constraints.sql');

    // Verify no migration in src/migrations executes VALIDATE CONSTRAINT
    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      expect(content).not.toContain('VALIDATE CONSTRAINT');
    }

    // Verify the deferred validation runbook exists outside src/migrations
    const runbookPath = path.resolve(__dirname, '../../docs/operations/DEFERRED_CANONICAL_CONSTRAINT_VALIDATION.md');
    expect(fs.existsSync(runbookPath)).toBe(true);
    const runbookContent = fs.readFileSync(runbookPath, 'utf8');
    expect(runbookContent).toContain('VALIDATE CONSTRAINT chk_media_assets_moderation_status');
    expect(runbookContent).toContain('VALIDATE CONSTRAINT chk_room_types_base_price');
  });

  // Test 28: Preflight begins a READ ONLY transaction and missing tables cause fail-closed behavior
  it('Test 28: Preflight enforces BEGIN READ ONLY and fails closed when tables are missing', async () => {
    const { runReadOnlyPreflight } = await import('../../scripts/preflight_m3_constraints');

    // Create a mock pool to spy on client queries during preflight
    const executedQueries: string[] = [];
    const mockClient = {
      query: async (queryText: string, _params?: any[]) => {
        executedQueries.push(queryText.trim());
        if (queryText.includes('information_schema.tables')) {
          // Return table exists for both
          return { rows: [{ '?column?': 1 }] };
        }
        if (queryText.includes('COUNT(*)::int AS total')) {
          return { rows: [{ total: 0 }] };
        }
        if (queryText.includes('COALESCE(ARRAY_AGG')) {
          return { rows: [{ sample_ids: [] }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    const mockPool = {
      connect: async () => mockClient,
      end: async () => {}
    };

    await runReadOnlyPreflight(mockPool);

    // Invariant: First query must be BEGIN READ ONLY
    expect(executedQueries[0]).toBe('BEGIN READ ONLY');
    // Invariant: Must end with ROLLBACK to ensure zero mutation
    expect(executedQueries[executedQueries.length - 1]).toBe('ROLLBACK');

    // Test missing tables fail-closed: mock pool where room_types and media_assets do not exist
    const missingTablesClient = {
      query: async (queryText: string, _params?: any[]) => {
        if (queryText.includes('information_schema.tables')) {
          return { rows: [] }; // table does not exist
        }
        return { rows: [] };
      },
      release: () => {}
    };
    const missingTablesPool = {
      connect: async () => missingTablesClient,
      end: async () => {}
    };

    const missingReport = await runReadOnlyPreflight(missingTablesPool);
    expect(missingReport.cleared).toBe(false);
    expect(missingReport.missingTables).toContain('media_assets');
    expect(missingReport.missingTables).toContain('room_types');
  });
});
