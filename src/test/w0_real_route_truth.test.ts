import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import app from '../../server.ts';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('W0 real-route catalogue truth discrepancy on disposable PostgreSQL', () => {
  const listingId = 8881;
  const slug = 'truth-palace-8881';
  const unapprovedRawImageUrl = 'https://media.encho.test/raw-unapproved-photo.jpg';

  beforeAll(async () => {
    // Ensure media_assets has necessary columns matching M3 schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_types (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER NOT NULL REFERENCES listings(id),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        icon VARCHAR(20) DEFAULT '🛏️',
        tag VARCHAR(100),
        base_price FLOAT DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        max_occupancy INTEGER DEFAULT 2,
        inventory_count INTEGER DEFAULT 1,
        description TEXT,
        specs VARCHAR(500),
        features JSONB,
        amenities JSONB,
        min_stay_nights INTEGER DEFAULT 1
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_assets (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        url TEXT,
        tier VARCHAR(100) DEFAULT 'common',
        category VARCHAR(50) DEFAULT 'other',
        title VARCHAR(255),
        description TEXT,
        specs VARCHAR(500),
        is_hero BOOLEAN DEFAULT false,
        order_index INTEGER DEFAULT 0,
        room_type_id INTEGER,
        moderation_status VARCHAR(50) DEFAULT 'pending_review',
        is_sleeping_area BOOLEAN DEFAULT false
      );
    `);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM media_assets WHERE entity_id = $1', [listingId]);
    await pool.query('DELETE FROM room_types WHERE listing_id = $1', [listingId]);
    await pool.query('DELETE FROM listings WHERE id = $1', [listingId]);

    // 1. Insert a published listing whose raw table column contains a photo
    // that has NOT been approved (it is pending_review in media_assets).
    await pool.query(`
      INSERT INTO listings (
        id, user_id, title, slug, publication_status, price, currency, type,
        city, image_url, image_urls, rooms
      ) VALUES (
        $1, 10, 'Truth Palace', $2, 'published', 25000, 'INR', 'Villa',
        'Jaipur', $3, $4, '[]'::jsonb
      )
    `, [
      listingId,
      slug,
      unapprovedRawImageUrl,
      JSON.stringify([unapprovedRawImageUrl])
    ]);

    // 2. Insert at least one room_type for relational authority
    const roomRes = await pool.query(`
      INSERT INTO room_types (
        listing_id, name, type, base_price, currency, max_occupancy
      ) VALUES (
        $1, 'Royal Suite', 'suite', 25000, 'INR', 2
      ) RETURNING id
    `, [listingId]);
    const roomId = roomRes.rows[0].id;

    // 3. Insert relational media_assets record with moderation_status = 'pending_review'
    // (i.e. strictly NOT 'approved')
    await pool.query(`
      INSERT INTO media_assets (
        entity_type, entity_id, url, tier, category, is_hero,
        room_type_id, moderation_status, is_sleeping_area
      ) VALUES (
        'listing', $1, $2, 'common', 'other', true,
        $3, 'pending_review', false
      )
    `, [listingId, unapprovedRawImageUrl, roomId]);
  });

  it('preserves two identical display-name rooms and their media across public reads without publishing an unverified price', async () => {
    const first = (await pool.query('SELECT id FROM room_types WHERE listing_id = $1', [listingId])).rows[0].id;
    const second = (await pool.query(`INSERT INTO room_types (listing_id, name, type, base_price, currency, max_occupancy)
      VALUES ($1, 'Royal Suite', 'suite', 25000, 'INR', 2) RETURNING id`, [listingId])).rows[0].id;
    const firstUrl = 'https://media.encho.test/room-one.jpg';
    const secondUrl = 'https://media.encho.test/room-two.jpg';
    await pool.query(`UPDATE listings SET rooms = $1, price = 999 WHERE id = $2`, [
      JSON.stringify([{id: 'legacy-fake', name: 'Royal Suite', type: 'suite', price: 999}]), listingId]);
    await pool.query(`INSERT INTO media_assets (entity_type, entity_id, url, tier, category, room_type_id, moderation_status)
      VALUES ('listing', $1, $2, 'suite', 'bedroom', $3, 'approved'),
             ('listing', $1, $4, 'suite', 'bedroom', $5, 'approved')`,
      [listingId, firstUrl, first, secondUrl, second]);

    const catalogue = await request(app).get('/api/listings?city=Jaipur').expect(200);
    const card = catalogue.body.find((item: {id: string}) => String(item.id) === String(listingId));
    const detail = (await request(app).get(`/api/v2/stays/${slug}`).expect(200)).body;
    const refresh = (await request(app).get(`/api/listings/${listingId}`).expect(200)).body;
    const seo = await request(app).get(`/api/seo?type=stay&slug=${slug}`).expect(200);

    for (const surface of [card, detail, refresh]) {
      expect(surface.rooms.map((room: {id: string}) => room.id)).toEqual([String(first), String(second)]);
      expect(surface.rooms.map((room: {name: string}) => room.name)).toEqual(['Royal Suite', 'Royal Suite']);
      expect(surface.photos.filter((photo: {room_type_id?: string}) => photo.room_type_id)
        .map((photo: {room_type_id: string; url: string}) => [photo.room_type_id, photo.url]))
        .toEqual([[String(first), firstUrl], [String(second), secondUrl]]);
      expect(surface.priceState).toBe('VERIFIED_OFFER_UNAVAILABLE');
      expect(surface.price).toBeNull();
      expect(JSON.stringify(surface)).not.toContain('legacy-fake');
      expect(JSON.stringify(surface)).not.toContain('999');
    }
    expect(seo.text).not.toMatch(/product:price:amount|og:price:amount/);
    expect(seo.text).not.toContain('legacy-fake');
  });

  it('distinguishes unreconciled legacy rooms from no rooms and fails closed when room authority is unreadable', async () => {
    await pool.query('DELETE FROM media_assets WHERE entity_id = $1', [listingId]);
    await pool.query('DELETE FROM room_types WHERE listing_id = $1', [listingId]);
    await pool.query(`UPDATE listings SET rooms = $1 WHERE id = $2`,
      [JSON.stringify([{id: 'legacy-fake', name: 'Deluxe', price: 999}]), listingId]);
    const legacy = (await request(app).get(`/api/v2/stays/${slug}`).expect(200)).body;
    expect(legacy.rooms).toEqual([]);
    expect(legacy.roomState).toBe('LEGACY_DATA_UNRECONCILED');
    expect(legacy.price).toBeNull();
    await pool.query(`UPDATE listings SET rooms = '[]'::jsonb WHERE id = $1`, [listingId]);
    const noRoom = (await request(app).get(`/api/v2/stays/${slug}`).expect(200)).body;
    expect(noRoom.rooms).toEqual([]);
    expect(noRoom.roomState).toBe('NO_ROOM');

    await pool.query('ALTER TABLE room_types RENAME TO room_types_w0_unavailable');
    try {
      for (const path of [`/api/v2/stays/${slug}`, `/api/listings/${listingId}`, '/api/listings?city=Jaipur', `/api/seo?type=stay&slug=${slug}`]) {
        await request(app).get(path).expect(503);
      }
    } finally {
      await pool.query('ALTER TABLE room_types_w0_unavailable RENAME TO room_types');
    }
  });

  it('rejects legacy listing-price filtering until a verified public offer price exists', async () => {
    const response = await request(app).get('/api/listings?city=Jaipur&minPrice=500').expect(422);
    expect(response.body.code).toBe('VERIFIED_OFFER_PRICE_UNAVAILABLE');
  });

  it('bounds published catalogue pages with a stable cursor and filters occupancy from canonical rooms', async () => {
    const ids = Array.from({length: 26}, (_, index) => 8901 + index);
    try {
      for (const id of ids) await pool.query(`INSERT INTO listings
        (id,user_id,title,slug,publication_status,price,currency,type,city,address,max_guests)
        VALUES ($1,10,$2,$3,'published',9000,'INR','Villa','W0 Paging','',20)`,
        [id, `Paging stay ${id}`, `paging-stay-${id}`]);
      const first = await request(app).get('/api/listings?city=W0%20Paging').expect(200);
      expect(first.body).toHaveLength(24);
      expect(first.body.map((card: {id: string}) => Number(card.id))).toEqual(ids.slice(2).reverse());
      expect(first.headers['x-next-cursor']).toBe(String(ids[2]));
      expect(first.headers['cache-control']).toContain('no-store');
      const second = await request(app).get(`/api/listings?city=W0%20Paging&after=${first.headers['x-next-cursor']}`).expect(200);
      expect(second.body.map((card: {id: string}) => Number(card.id))).toEqual(ids.slice(0, 2).reverse());
      expect(second.headers['x-next-cursor']).toBeUndefined();
      await request(app).get('/api/listings?city=W0%20Paging&after=abc').expect(400);
      await request(app).get('/api/listings?city=W0%20Paging&bedrooms=2').expect(422);
      const occupancy = await request(app).get('/api/listings?city=W0%20Paging&maxGuests=3').expect(200);
      expect(occupancy.body).toEqual([]); // Listing-level legacy max_guests=20 is not room authority.
      await pool.query(`INSERT INTO room_types (listing_id,name,base_price,currency,max_occupancy)
        VALUES ($1,'Verified suite',9000,'INR',3)`, [ids[0]]);
      const verified = await request(app).get('/api/listings?city=W0%20Paging&maxGuests=3').expect(200);
      expect(verified.body.map((card: {id: string}) => card.id)).toEqual([String(ids[0])]);
    } finally {
      await pool.query('DELETE FROM room_types WHERE listing_id = ANY($1::int[])', [ids]);
      await pool.query('DELETE FROM listings WHERE id = ANY($1::int[])', [ids]);
    }
  });

  it('withholds invalid and incomplete coordinates across catalogue and detail', async () => {
    for (const [lat,lng] of [[999,76],[11,null],[0,0]]) {
      await pool.query('UPDATE listings SET lat=$1,lng=$2 WHERE id=$3', [lat,lng,listingId]);
      const card = (await request(app).get('/api/listings?city=Jaipur').expect(200)).body
        .find((item: {id: string}) => item.id === String(listingId));
      const detail = (await request(app).get(`/api/v2/stays/${slug}`).expect(200)).body;
      expect([card.lat,card.lng]).toEqual([null,null]);
      expect(detail.location.approximateLatitude).toBeNull();
      expect(detail.location.approximateLongitude).toBeNull();
    }
  });

  it('refuses an approved image linked to a room belonging to a different property', async () => {
    const foreignListingId = 8882;
    await pool.query(`INSERT INTO listings (id, user_id, title, slug, publication_status, price, currency, type, city)
      VALUES ($1, 10, 'Foreign Stay', 'foreign-stay-8882', 'draft', 1200, 'INR', 'Villa', 'Jaipur')`,
      [foreignListingId]);
    try {
      const foreignRoomId = (await pool.query(`INSERT INTO room_types
        (listing_id, name, type, base_price, currency, max_occupancy)
        VALUES ($1, 'Foreign Suite', 'suite', 1200, 'INR', 2) RETURNING id`, [foreignListingId])).rows[0].id;
      await pool.query(`INSERT INTO media_assets
        (entity_type, entity_id, url, tier, category, room_type_id, moderation_status)
        VALUES ('listing', $1, 'https://media.encho.test/foreign.jpg', 'suite', 'bedroom', $2, 'approved')`,
        [listingId, foreignRoomId]);
      await request(app).get(`/api/v2/stays/${slug}`).expect(503);
      await request(app).get('/api/listings?city=Jaipur').expect(503);
      await request(app).get(`/api/seo?type=stay&slug=${slug}`).expect(503);
    } finally {
      await pool.query('DELETE FROM room_types WHERE listing_id = $1', [foreignListingId]);
      await pool.query('DELETE FROM listings WHERE id = $1', [foreignListingId]);
    }
  });

  it('failing-before assertion 1: GET /api/v2/stays/:slug filters unapproved media while GET /api/listings exposes raw image', async () => {
    // 1. Query public stay detail endpoint: /api/v2/stays/:propertySlug
    const stayRes = await request(app)
      .get(`/api/v2/stays/${slug}`)
      .expect(200);

    expect(stayRes.body.imageUrls).not.toContain(unapprovedRawImageUrl);
    expect(stayRes.body.imageUrl).not.toBe(unapprovedRawImageUrl);

    // 2. Query catalogue search endpoint: GET /api/listings
    const listingsRes = await request(app)
      .get(`/api/listings?city=Jaipur`)
      .expect(200);

    const listingCard = listingsRes.body.find((l: any) => String(l.id) === String(listingId));
    expect(listingCard).toBeDefined();

    // Catalogue cards must not expose unapproved raw image; missing/unapproved media must be empty
    expect(listingCard.imageUrl).toBe('');
    expect(listingCard.imageUrls).toEqual([]);
    expect(listingCard.imageCount).toBe(0);
  });

  it('failing-before assertion 2: GET /api/seo exposes unapproved raw image in og:image and twitter:image', async () => {
    // Query SEO endpoint: GET /api/seo?type=stay&slug=${slug}
    const seoRes = await request(app)
      .get(`/api/seo?type=stay&slug=${slug}`)
      .expect(200);

    // SEO metadata must not expose unapproved raw image
    expect(seoRes.text).not.toContain(unapprovedRawImageUrl);
    expect(seoRes.text).not.toContain('og:image');
    expect(seoRes.text).not.toContain('twitter:image');
  });

  it('published detail and numeric-ID refresh never revive raw media when no relational assets exist', async () => {
    await pool.query('DELETE FROM media_assets WHERE entity_id = $1', [listingId]);
    await pool.query(
      'UPDATE listings SET photos = $1, hero_video_url = $2, hero_fallback_url = $3 WHERE id = $4',
      [JSON.stringify([{ url: unapprovedRawImageUrl, tier: 'legacy', category: 'other' }]),
        unapprovedRawImageUrl, unapprovedRawImageUrl, listingId]
    );

    for (const path of [`/api/v2/stays/${slug}`, `/api/listings/${listingId}`]) {
      const response = await request(app).get(path).expect(200);
      expect(response.body.imageUrl).toBe('');
      expect(response.body.imageUrls).toEqual([]);
      expect(response.body.photos).toEqual([]);
      expect(response.body.hero_video_url).toBeUndefined();
      expect(response.body.hero_fallback_url).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(unapprovedRawImageUrl);
    }
  });

  it('uses the same approved hero in catalogue, SEO and both public detail routes', async () => {
    const nonHeroUrl = 'https://media.encho.test/approved-nonhero.jpg';
    const heroUrl = 'https://media.encho.test/approved-hero.jpg';
    await pool.query('DELETE FROM media_assets WHERE entity_id = $1', [listingId]);
    await pool.query('UPDATE listings SET image_url = $1, image_urls = $2 WHERE id = $3',
      [nonHeroUrl, JSON.stringify([nonHeroUrl, heroUrl]), listingId]);
    await pool.query(`
      INSERT INTO media_assets (entity_type, entity_id, url, tier, category, is_hero, moderation_status, order_index)
      VALUES ('listing', $1, $2, 'common', 'other', false, 'approved', 0),
             ('listing', $1, $3, 'common', 'other', true, 'approved', 1)
    `, [listingId, nonHeroUrl, heroUrl]);

    const cards = await request(app).get('/api/listings?city=Jaipur').expect(200);
    const card = cards.body.find((listing: {id: string}) => String(listing.id) === String(listingId));
    expect(card?.imageUrl).toBe(heroUrl);

    const seo = await request(app).get(`/api/seo?type=stay&slug=${slug}`).expect(200);
    expect(seo.text).toContain(`og:image" content="${heroUrl}"`);

    for (const path of [`/api/v2/stays/${slug}`, `/api/listings/${listingId}`]) {
      const response = await request(app).get(path).expect(200);
      expect(response.body.imageUrl).toBe(heroUrl);
      expect(response.body.imageUrls).toEqual([nonHeroUrl, heroUrl]);
    }
  });

  it('returns unavailable rather than an empty success when relational media cannot be read', async () => {
    // The fixture database is disposable; a committed rename makes the real
    // mounted routes encounter the same missing-authority failure on their own
    // connections. Restore the table even if an assertion fails.
    await pool.query('ALTER TABLE media_assets RENAME TO media_assets_w0_unavailable');
    try {
      const routes = [
        '/api/listings?city=Jaipur',
        `/api/seo?type=stay&slug=${slug}`,
        `/api/v2/stays/${slug}`
      ];
      const responses = await Promise.all(routes.map(path => request(app).get(path)));
      expect(Object.fromEntries(routes.map((path, index) => [path, responses[index].status])))
        .toEqual(Object.fromEntries(routes.map(path => [path, 503])));
    } finally {
      await pool.query('ALTER TABLE media_assets_w0_unavailable RENAME TO media_assets');
    }
  });

  it('does not present a missing listings relation as an empty destination', async () => {
    await pool.query('ALTER TABLE listings RENAME TO listings_w0_unavailable');
    try {
      const catalogue = await request(app).get('/api/listings?city=Jaipur');
      const seo = await request(app).get(`/api/seo?type=stay&slug=${slug}`);
      expect(catalogue.status).toBe(503);
      expect(seo.status).toBe(503);
    } finally {
      await pool.query('ALTER TABLE listings_w0_unavailable RENAME TO listings');
    }
  });

  it('verified approved media displays on public catalogue, SEO, and stay detail', async () => {
    const approvedUrl = 'https://media.encho.test/approved-photo.jpg';

    // Insert approved media asset
    await pool.query(`
      INSERT INTO media_assets (
        entity_type, entity_id, url, tier, category, is_hero,
        moderation_status, is_sleeping_area, order_index
      ) VALUES (
        'listing', $1, $2, 'common', 'other', true,
        'approved', false, 0
      )
    `, [listingId, approvedUrl]);

    // 1. Catalogue cards must display approved media
    const listingsRes = await request(app)
      .get(`/api/listings?city=Jaipur`)
      .expect(200);

    const card = listingsRes.body.find((l: any) => String(l.id) === String(listingId));
    expect(card).toBeDefined();
    expect(card.imageUrl).toBe(approvedUrl);
    expect(card.imageUrls).toContain(approvedUrl);
    expect(card.imageCount).toBe(1);

    // 2. SEO endpoint must project approved media in og:image
    const seoRes = await request(app)
      .get(`/api/seo?type=stay&slug=${slug}`)
      .expect(200);

    expect(seoRes.text).toContain(`og:image" content="${approvedUrl}"`);
    expect(seoRes.text).toContain(`twitter:image" content="${approvedUrl}"`);

    // 3. Stay detail endpoint must also project approved media
    const stayRes = await request(app)
      .get(`/api/v2/stays/${slug}`)
      .expect(200);

    expect(stayRes.body.imageUrl).toBe(approvedUrl);
    expect(stayRes.body.imageUrls).toContain(approvedUrl);
  });

  it('rejected media is excluded across catalogue, SEO, and stay detail', async () => {
    const rejectedUrl = 'https://media.encho.test/rejected-photo.jpg';

    // Insert rejected media asset
    await pool.query(`
      INSERT INTO media_assets (
        entity_type, entity_id, url, tier, category, is_hero,
        moderation_status, is_sleeping_area, order_index
      ) VALUES (
        'listing', $1, $2, 'common', 'other', true,
        'rejected', false, 0
      )
    `, [listingId, rejectedUrl]);

    // 1. Catalogue cards must exclude rejected media
    const listingsRes = await request(app)
      .get(`/api/listings?city=Jaipur`)
      .expect(200);

    const card = listingsRes.body.find((l: any) => String(l.id) === String(listingId));
    expect(card).toBeDefined();
    expect(card.imageUrl).toBe('');
    expect(card.imageUrls).toEqual([]);

    // 2. SEO endpoint must exclude rejected media
    const seoRes = await request(app)
      .get(`/api/seo?type=stay&slug=${slug}`)
      .expect(200);

    expect(seoRes.text).not.toContain(rejectedUrl);
    expect(seoRes.text).not.toContain('og:image');

    // 3. Stay detail endpoint must exclude rejected media
    const stayRes = await request(app)
      .get(`/api/v2/stays/${slug}`)
      .expect(200);

    expect(stayRes.body.imageUrl).toBe('');
    expect(stayRes.body.imageUrls).toEqual([]);
  });

  it('owner and admin management reads preserve administrative and relational photos', async () => {
    // Ensure test user exists in users table with active status
    await pool.query(`
      INSERT INTO users (id, name, email, password_hash, role, is_active)
      VALUES (10, 'Host Ten', 'host10@encho.test', 'hash', 'host', true)
      ON CONFLICT (id) DO UPDATE SET is_active = true, role = 'host', name = 'Host Ten';
    `);

    const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long-for-tests';
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ id: 10, role: 'host' }, jwtSecret);

    // Authenticated owner read: GET /api/listings?userId=10
    const ownerRes = await request(app)
      .get(`/api/listings?userId=10`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ownerListing = ownerRes.body.find((l: any) => String(l.id) === String(listingId));
    expect(ownerListing).toBeDefined();
    // Raw columns preserved for host dashboard management
    expect(ownerListing.imageUrl).toBe(unapprovedRawImageUrl);
    expect(ownerListing.imageUrls).toContain(unapprovedRawImageUrl);
  });

  it('does not grant a different tenant private listing authority through a userId query', async () => {
    await pool.query(`INSERT INTO users (id,name,email,password_hash,role,is_active)
      VALUES (11,'Other Host','host11@encho.test','hash','host',true)
      ON CONFLICT (id) DO UPDATE SET is_active=true,role='host'`);
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({id:11,role:'host'}, process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long-for-tests');
    await request(app).get('/api/listings?userId=10').set('Authorization',`Bearer ${token}`).expect(401);
    const publicCard = (await request(app).get('/api/listings?city=Jaipur').expect(200)).body
      .find((item: {id: string}) => item.id === String(listingId));
    expect(publicCard.user_id).toBeUndefined();
    expect(publicCard.address).toBeUndefined();
    expect(JSON.stringify(publicCard)).not.toContain('unapproved-photo.jpg');
  });
});
