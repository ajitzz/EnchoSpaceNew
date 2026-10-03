import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import {
  AdminDraftPropertyError,
  updateAdminDraftProperty,
} from '../../server/listings/adminDraftPropertyService.js';

describe('admin draft property edits on disposable PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  const adminId = 701;
  const hostId = 702;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query(`
      CREATE TABLE users (
        id INT PRIMARY KEY, role TEXT NOT NULL, is_active BOOLEAN NOT NULL
      );
      CREATE TABLE listings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        publication_status TEXT NOT NULL DEFAULT 'draft',
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC NOT NULL DEFAULT 12000,
        type VARCHAR(50) NOT NULL DEFAULT 'Villa',
        address VARCHAR(255) NOT NULL DEFAULT '1 Hill Road',
        city VARCHAR(100) NOT NULL DEFAULT 'Wayanad',
        lat NUMERIC,
        lng NUMERIC,
        rental_mode VARCHAR(50) DEFAULT 'entire_place',
        max_guests INT DEFAULT 2,
        bedrooms INT DEFAULT 1,
        beds INT DEFAULT 1,
        bathrooms INT DEFAULT 1,
        amenities JSONB DEFAULT '[]'::jsonb,
        amenity_clusters JSONB DEFAULT '{"vibe":[],"comfort":[],"work":[],"culinary":[]}'::jsonb,
        child_safety_specs JSONB DEFAULT '[]'::jsonb,
        raw_rules TEXT,
        curated_guidelines TEXT,
        experience_tags JSONB DEFAULT '[]'::jsonb,
        concierge_privileges TEXT,
        host_philosophy TEXT,
        seo_title TEXT,
        seo_description TEXT,
        seo_keywords TEXT,
        image_url TEXT DEFAULT 'https://images.encho.space/original.jpg',
        rooms JSONB DEFAULT '[]'::jsonb
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
      INSERT INTO users(id,role,is_active) VALUES
        (701,'admin',true), (702,'user',true), (703,'admin',true);
    `);
  }, 30_000);

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(async () => {
    await fixture.pool.query('ALTER TABLE admin_audit_logs DROP COLUMN IF EXISTS fail_trigger');
    await fixture.pool.query('TRUNCATE admin_audit_logs, listings RESTART IDENTITY');
    await fixture.pool.query("UPDATE users SET role = 'admin', is_active = true WHERE id IN (701,703)");
  });

  async function listing(status = 'draft') {
    return Number((await fixture.pool.query<{ id: number }>(
      'INSERT INTO listings(user_id,publication_status,title) VALUES ($1,$2,$3) RETURNING id',
      [hostId, status, 'Original Stay'],
    )).rows[0].id);
  }

  async function auditCount() {
    return Number((await fixture.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM admin_audit_logs')).rows[0].count);
  }

  it('updates only supplied draft facts and writes exact before/after evidence atomically', async () => {
    const listingId = await listing();
    const result = await updateAdminDraftProperty(fixture.pool, {
      listingId, adminId, ipAddress: '127.0.0.1',
      patch: {
        title: 'Rainforest Residence',
        city: 'Kalpetta',
        lat: 11.61,
        lng: 76.08,
        amenities: ['Wifi', 'Parking'],
        curated_guidelines: ['Quiet after 10 PM'],
        seo_title: 'Rainforest Residence in Kalpetta',
      },
      expectedCurrent: {
        title: 'Original Stay', city: 'Wayanad', lat: null, lng: null,
        amenities: [], curated_guidelines: null, seo_title: null,
      },
    });
    expect(result.unchanged).toBe(false);
    expect(result.auditLogId).toEqual(expect.any(Number));
    expect(result.changedFields).toEqual(['title', 'city', 'lat', 'lng', 'amenities', 'curated_guidelines', 'seo_title']);
    expect(result.property.curated_guidelines).toEqual(['Quiet after 10 PM']);
    expect(result.property.lat).toBe(11.61);
    const saved = (await fixture.pool.query(
      'SELECT title,city,lat,lng,amenities,curated_guidelines,price,image_url,rooms,publication_status FROM listings WHERE id=$1',
      [listingId],
    )).rows[0];
    expect(saved).toMatchObject({ title: 'Rainforest Residence', city: 'Kalpetta', publication_status: 'draft' });
    expect(saved.amenities).toEqual(['Wifi', 'Parking']);
    expect(saved.price).toBe('12000');
    expect(saved.image_url).toBe('https://images.encho.space/original.jpg');
    expect(saved.rooms).toEqual([]);
    const audit = (await fixture.pool.query('SELECT * FROM admin_audit_logs WHERE id=$1', [result.auditLogId])).rows[0];
    expect(audit).toMatchObject({ admin_id: adminId, entity_type: 'listing', entity_id: listingId, action: 'draft_property_fields_updated', ip_address: '127.0.0.1' });
    expect(audit.previous_state).toEqual({
      title: 'Original Stay', city: 'Wayanad', lat: null, lng: null,
      amenities: [], curated_guidelines: null, seo_title: null,
    });
    expect(audit.new_state).toEqual({
      title: 'Rainforest Residence', city: 'Kalpetta', lat: '11.61', lng: '76.08',
      amenities: ['Wifi', 'Parking'], curated_guidelines: '["Quiet after 10 PM"]',
      seo_title: 'Rainforest Residence in Kalpetta',
    });
  });

  it('rejects foreign, inactive, demoted and missing admin identities using persisted account state', async () => {
    const listingId = await listing();
    for (const actor of [hostId, 9999]) {
      await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId: actor, patch: { title: 'Unsafe' }, expectedCurrent: { title: 'Original Stay' } }))
        .rejects.toMatchObject({ status: 403, code: 'ADMIN_PRIVILEGES_REQUIRED' });
    }
    await fixture.pool.query('UPDATE users SET is_active=false WHERE id=$1', [adminId]);
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { title: 'Unsafe' }, expectedCurrent: { title: 'Original Stay' } }))
      .rejects.toMatchObject({ status: 403, code: 'ADMIN_PRIVILEGES_REQUIRED' });
    await fixture.pool.query("UPDATE users SET role='user',is_active=true WHERE id=$1", [adminId]);
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { title: 'Unsafe' }, expectedCurrent: { title: 'Original Stay' } }))
      .rejects.toMatchObject({ status: 403, code: 'ADMIN_PRIVILEGES_REQUIRED' });
    expect((await fixture.pool.query('SELECT title FROM listings WHERE id=$1', [listingId])).rows[0].title).toBe('Original Stay');
    expect(await auditCount()).toBe(0);
  });

  it('refuses published and unlisted direct edits with 422 and no audit receipt', async () => {
    for (const status of ['published', 'unlisted']) {
      const listingId = await listing(status);
      await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { title: 'Unsafe' }, expectedCurrent: { title: 'Original Stay' } }))
        .rejects.toMatchObject({ status: 422, code: 'LISTING_NOT_DRAFT' });
      expect((await fixture.pool.query('SELECT title,publication_status FROM listings WHERE id=$1', [listingId])).rows[0])
        .toEqual({ title: 'Original Stay', publication_status: status });
    }
    expect(await auditCount()).toBe(0);
  });

  it('rolls the property update back if its audit receipt cannot be inserted', async () => {
    const listingId = await listing();
    await fixture.pool.query('ALTER TABLE admin_audit_logs ADD COLUMN fail_trigger TEXT NOT NULL');
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { title: 'Would Be Lost' }, expectedCurrent: { title: 'Original Stay' } })).rejects.toThrow();
    expect((await fixture.pool.query('SELECT title FROM listings WHERE id=$1', [listingId])).rows[0].title).toBe('Original Stay');
    expect(await auditCount()).toBe(0);
  });

  it('treats identical retries and semantically identical JSON as unchanged, without a duplicate receipt', async () => {
    const listingId = await listing();
    const patch = { city: 'Kalpetta', amenity_clusters: { vibe: ['Quiet'], comfort: [], work: [], culinary: [] } };
    const expectedCurrent = { city: 'Wayanad', amenity_clusters: { vibe: [], comfort: [], work: [], culinary: [] } };
    const first = await updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch, expectedCurrent });
    const replay = await updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch, expectedCurrent });
    expect(first.unchanged).toBe(false);
    expect(replay).toMatchObject({ listingId, unchanged: true, changedFields: [], auditLogId: null });
    expect(await auditCount()).toBe(1);
  });

  it('rejects unsupported ownership, room, media, price and publication fields before connecting', async () => {
    const listingId = await listing();
    for (const field of ['user_id', 'rooms', 'price', 'photos', 'image_url', 'publication_status', 'seo_image_url']) {
      await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { [field]: 'unsafe' }, expectedCurrent: { [field]: null } }))
        .rejects.toBeInstanceOf(AdminDraftPropertyError);
    }
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { max_guests: -1 }, expectedCurrent: { max_guests: 2 } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_DRAFT_PROPERTY_PATCH' });
    // Parent capacity cannot be changed independently of the canonical room offer model.
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { max_guests: 8 }, expectedCurrent: { max_guests: 2 } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_DRAFT_PROPERTY_PATCH' });
    await expect(updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { lat: 10 }, expectedCurrent: { lat: null } }))
      .rejects.toMatchObject({ status: 422, code: 'INCOMPLETE_COORDINATES' });
    expect(await auditCount()).toBe(0);
  });

  it('rejects a stale second same-field edit after serializing both writers on the parent row', async () => {
    const listingId = await listing();
    const expectedCurrent = { title: 'Original Stay' };
    const attempts = await Promise.allSettled([
      updateAdminDraftProperty(fixture.pool, { listingId, adminId, patch: { title: 'First Editor' }, expectedCurrent }),
      updateAdminDraftProperty(fixture.pool, { listingId, adminId: 703, patch: { title: 'Second Editor' }, expectedCurrent }),
    ]);
    const fulfilled = attempts.filter(result => result.status === 'fulfilled');
    const rejected = attempts.filter(result => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'DRAFT_PROPERTY_STALE' });
    expect(await auditCount()).toBe(1);
    expect(['First Editor', 'Second Editor']).toContain((await fixture.pool.query('SELECT title FROM listings WHERE id=$1', [listingId])).rows[0].title);
  });

  it('keeps NULL distinct from an empty text value in expected-current checks', async () => {
    const listingId = await listing();
    await expect(updateAdminDraftProperty(fixture.pool, {
      listingId, adminId, patch: { description: 'A real description' }, expectedCurrent: { description: '' },
    })).rejects.toMatchObject({ status: 409, code: 'DRAFT_PROPERTY_STALE' });
    await updateAdminDraftProperty(fixture.pool, {
      listingId, adminId, patch: { description: 'A real description' }, expectedCurrent: { description: null },
    });
    await updateAdminDraftProperty(fixture.pool, {
      listingId, adminId, patch: { description: '' }, expectedCurrent: { description: 'A real description' },
    });
    await expect(updateAdminDraftProperty(fixture.pool, {
      listingId, adminId, patch: { description: 'Another description' }, expectedCurrent: { description: null },
    })).rejects.toMatchObject({ status: 409, code: 'DRAFT_PROPERTY_STALE' });
    expect((await fixture.pool.query('SELECT description FROM listings WHERE id=$1', [listingId])).rows[0].description).toBe('');
    expect(await auditCount()).toBe(2);
  });

  it('accepts the legacy empty amenity-cluster object as the expected value', async () => {
    const listingId = await listing();
    await fixture.pool.query("UPDATE listings SET amenity_clusters='{}'::jsonb WHERE id=$1", [listingId]);
    const result = await updateAdminDraftProperty(fixture.pool, {
      listingId, adminId,
      patch: { amenity_clusters: { vibe: ['Quiet'], comfort: [], work: [], culinary: [] } },
      expectedCurrent: { amenity_clusters: {} },
    });
    expect(result.unchanged).toBe(false);
    expect((await fixture.pool.query('SELECT amenity_clusters FROM listings WHERE id=$1', [listingId])).rows[0].amenity_clusters)
      .toEqual({ vibe: ['Quiet'], comfort: [], work: [], culinary: [] });
  });
});
