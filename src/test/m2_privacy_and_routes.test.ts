import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import app from '../../server';
import {
  toPublicStayProjection,
  toPublicListingCardProjection,
  coarsenCoordinate,
  generateListingSlug,
  escapeHtml,
  mapPublicRoomTier,
  mapPublicMediaAsset,
  mapPublicNearbyAttraction,
  mapPublicPolicies,
  sanitizePublicText
} from '../lib/stayProjection';

import { __mockRedisStore } from './setup';

vi.hoisted(() => {
  // This suite explicitly exercises the mocked cache. Never inherit a real URL/token.
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis-fixture.invalid');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'isolated-fixture-token');
});
afterAll(() => vi.unstubAllEnvs());

const { Pool } = pkg;
const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';

describe('Phase 3 Milestone 2 — Published Projection, Canonical Routes & Address Privacy', () => {
  // Fixture containing nested malicious / private data
  const maliciousRawListing = {
    id: 42,
    user_id: 1001,
    title: 'Cliffside <script>alert("xss")</script> Sanctuary & Spa',
    type: 'resort',
    rental_mode: 'entire_place',
    price: 25000,
    currency: 'INR',
    publication_status: 'published',
    address: 'Plot 14, Whispering Pines Road, Attamala, Wayanad 673577',
    city: 'Wayanad',
    lat: 11.538742,
    lng: 76.129481,
    image_url: 'https://images.encho.space/hero.jpg',
    image_urls: ['https://images.encho.space/hero.jpg'],
    // Malicious nested rooms with internal IDs, inventory counts, and leaked credentials
    rooms: [
      {
        id: 'room_internal_9999',
        name: 'Master Suite',
        type: 'suites',
        price: 25000,
        capacity: 4,
        inventory_count: 5,
        internal_code: 'ROOM_SECRET_KEY',
        host_access_notes: 'Host phone: +91 99999 88888',
        features: ['Balcony', 'Jacuzzi'],
        amenities: ['wifi', 'ac']
      }
    ],
    max_guests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ['wifi', 'pool', 'spa'],
    amenity_clusters: { wellness: ['spa', 'pool'] },
    child_safety_specs: ['stair_gates'],
    // Malicious nested nearby with exact lat/lng and map links
    nearby: [
      {
        id: 'poi_private_1',
        name: 'Chembra Peak',
        distance: '3.2 km',
        type: 'nature',
        lat: 11.52001,
        lng: 76.13002,
        map_url: 'https://maps.google.com/?q=secret-coords',
        contact_phone: '+91 88888 77777'
      }
    ],
    // Malicious nested media with storage paths and moderation flags
    photos: [
      {
        id: 'media_internal_7',
        url: 'https://images.encho.space/hero.jpg',
        tier: 'suites',
        category: 'bedroom',
        s3_bucket: 'internal-private-bucket',
        uploaded_by_user_id: 1001,
        moderation_score: 0.99
      }
    ],
    description: 'A serene luxury sanctuary nestled in the mist-clad hills.',
    hero_video_url: 'https://mux.com/v123',
    hero_fallback_url: 'https://images.encho.space/hero_fallback.jpg',
    dominant_color_hex: '#1a365d',
    curated_guidelines: 'Quiet hours after 10 PM\nNo access without host passcode 9988',
    experience_tags: ['Wellness Sanctuary', 'Mountain Retreat'],
    concierge_privileges: 'Private chef on demand',
    host_philosophy: 'Harmonizing architecture with nature',
    editorial_quote: 'The pinnacle of hill country living',
    brand: 'Encho Luxe',
    brand_font: 'font-playfair',
    brand_color: 'text-amber-800',
    rating: 4.95,
    reviewCount: 28,
    // Top-level simulated internal / private fields that must NEVER leak
    internal_notes: 'Host phone: +91 98765 43210',
    host_phone: '+91 98765 43210',
    host_email: 'host@sanctuary.com',
    access_pin: '4829',
    wifi_password: 'SecretWifiPassword2026',
    door_passcode: '9988'
  };

  describe('Unit Tests: Recursive Privacy Mappers & Field Allowlist', () => {
    it('coarsens geographical coordinates to 2 decimal places (~1.1 km area)', () => {
      expect(coarsenCoordinate(11.538742, 2)).toBe(11.54);
      expect(coarsenCoordinate(76.129481, 2)).toBe(76.13);
      expect(coarsenCoordinate(null)).toBeNull();
      expect(coarsenCoordinate(undefined)).toBeNull();
      expect(coarsenCoordinate('invalid')).toBeNull();
    });

    it('generates collision-safe, deterministic slugs', () => {
      expect(generateListingSlug('Cliffside Panorama Sanctuary & Spa', 42)).toBe('cliffside-panorama-sanctuary-spa-42');
      expect(generateListingSlug('  Spaces  &  Symbols!  ', 101)).toBe('spaces-symbols-101');
      expect(generateListingSlug('', 999)).toBe('stay-999');
    });

    it('escapes hostile HTML injection vectors in titles, descriptions, and URLs', () => {
      const hostile = '<script>alert("xss")</script>&"\'<tag>';
      const escaped = escapeHtml(hostile);
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('</script>');
      expect(escaped).not.toContain('"');
      expect(escaped).not.toContain("'");
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&#39;');
      expect(escaped).toContain('&amp;');
    });

    it('mapPublicRoomTier strips internal room IDs, inventory counts, and host access notes', () => {
      const rawRoom = maliciousRawListing.rooms[0];
      const mapped = mapPublicRoomTier(rawRoom);

      expect(mapped.type).toBe('suites');
      expect(mapped.name).toBe('Master Suite');
      expect(mapped.price).toBe(25000);
      expect(mapped.capacity).toBe(4);
      expect(mapped.features).toEqual(['Balcony', 'Jacuzzi']);

      const serialized = JSON.stringify(mapped);
      expect(serialized).not.toContain('room_internal_9999');
      expect(serialized).not.toContain('inventory_count');
      expect(serialized).not.toContain('ROOM_SECRET_KEY');
      expect(serialized).not.toContain('99999 88888');
      expect((mapped as any).internal_code).toBeUndefined();
      expect((mapped as any).inventory_count).toBeUndefined();
    });

    it('mapPublicMediaAsset strips internal S3 bucket, uploader user_id, and moderation flags', () => {
      const rawPhoto = maliciousRawListing.photos[0];
      const mapped = mapPublicMediaAsset(rawPhoto);
      expect(mapped).not.toBeNull();
      expect(mapped!.url).toBe('https://images.encho.space/hero.jpg');
      expect(mapped!.tier).toBe('suites');
      expect(mapped!.category).toBe('bedroom');

      const serialized = JSON.stringify(mapped);
      expect(serialized).not.toContain('internal-private-bucket');
      expect(serialized).not.toContain('uploaded_by_user_id');
      expect(serialized).not.toContain('1001');
      expect(serialized).not.toContain('moderation_score');
      expect((mapped as any).s3_bucket).toBeUndefined();
      expect((mapped as any).uploaded_by_user_id).toBeUndefined();
    });

    it('mapPublicNearbyAttraction strips internal POI IDs, exact coords, map URLs, and phones', () => {
      const rawPoi = maliciousRawListing.nearby[0];
      const mapped = mapPublicNearbyAttraction(rawPoi);
      expect(mapped).not.toBeNull();
      expect(mapped!.name).toBe('Chembra Peak');
      expect(mapped!.distance).toBe('3.2 km');
      expect(mapped!.type).toBe('nature');

      const serialized = JSON.stringify(mapped);
      expect(serialized).not.toContain('poi_private_1');
      expect(serialized).not.toContain('11.52001');
      expect(serialized).not.toContain('76.13002');
      expect(serialized).not.toContain('secret-coords');
      expect(serialized).not.toContain('88888 77777');
      expect((mapped as any).lat).toBeUndefined();
      expect((mapped as any).lng).toBeUndefined();
      expect((mapped as any).map_url).toBeUndefined();
      expect((mapped as any).contact_phone).toBeUndefined();
    });

    it('toPublicStayProjection performs complete recursive sanitization of top-level and nested structures', () => {
      const projection = toPublicStayProjection(maliciousRawListing);

      expect(projection.id).toBe('42');
      expect(projection.slug).toBe('cliffside-scriptalertxssscript-sanctuary-spa-42');
      expect(projection.location.city).toBe('Wayanad');
      expect(projection.location.approximateLatitude).toBe(11.54);
      expect(projection.location.approximateLongitude).toBe(76.13);

      const serialized = JSON.stringify(projection);

      // Recursive denial: Street addresses, house numbers, pin codes
      expect(serialized).not.toContain('Plot 14');
      expect(serialized).not.toContain('Whispering Pines Road');
      expect(serialized).not.toContain('673577');
      expect((projection as any).address).toBeUndefined();

      // Recursive denial: Exact coordinates
      expect(serialized).not.toContain('11.538742');
      expect(serialized).not.toContain('76.129481');
      expect((projection as any).lat).toBeUndefined();
      expect((projection as any).lng).toBeUndefined();

      // Recursive denial: User IDs and Host Contacts
      expect(serialized).not.toContain('1001');
      expect(serialized).not.toContain('98765 43210');
      expect(serialized).not.toContain('host@sanctuary.com');
      expect((projection as any).user_id).toBeUndefined();
      expect((projection as any).host_id).toBeUndefined();

      // Recursive denial: Physical access codes & Wi-Fi
      expect(serialized).not.toContain('4829');
      expect(serialized).not.toContain('SecretWifiPassword2026');
      expect((projection as any).access_pin).toBeUndefined();
      expect((projection as any).wifi_password).toBeUndefined();

      // Recursive denial: Nested room internals
      expect(serialized).not.toContain('ROOM_SECRET_KEY');
      expect(serialized).not.toContain('99999 88888');

      // Recursive denial: Nested media internals
      expect(serialized).not.toContain('internal-private-bucket');

      // Recursive denial: Nested POI internals
      expect(serialized).not.toContain('secret-coords');
    });

    it('toPublicListingCardProjection performs strict field allowlisting and recursive sanitization for card view', () => {
      const card = toPublicListingCardProjection(maliciousRawListing);

      expect(card.id).toBe('42');
      expect(card.slug).toBe('cliffside-scriptalertxssscript-sanctuary-spa-42');
      expect(card.city).toBe('Wayanad');
      expect(card.lat).toBe(11.54);
      expect(card.lng).toBe(76.13);
      expect(card.price).toBe(25000);
      expect(card.currency).toBe('₹');

      const serialized = JSON.stringify(card);

      // Sensitive addresses, house numbers, pin codes MUST NOT appear anywhere in JSON
      expect(serialized).not.toContain('Plot 14');
      expect(serialized).not.toContain('Whispering Pines Road');
      expect(serialized).not.toContain('673577');
      expect((card as any).address).toBeUndefined();

      // Exact coords omitted
      expect(serialized).not.toContain('11.538742');
      expect(serialized).not.toContain('76.129481');

      // User IDs, host contacts, and access codes omitted
      expect(serialized).not.toContain('1001');
      expect(serialized).not.toContain('98765 43210');
      expect(serialized).not.toContain('host@sanctuary.com');
      expect((card as any).user_id).toBeUndefined();
      expect((card as any).host_id).toBeUndefined();
      expect((card as any).access_pin).toBeUndefined();
      expect((card as any).wifi_password).toBeUndefined();

      // Nested internals stripped from rooms
      expect(serialized).not.toContain('ROOM_SECRET_KEY');
      expect(serialized).not.toContain('99999 88888');

      // Internal media, nearby attractions, description, raw_rules, and unapproved nested keys omitted
      expect((card as any).description).toBeUndefined();
      expect((card as any).raw_rules).toBeUndefined();
      expect((card as any).nearby).toBeUndefined();
      expect((card as any).photos).toBeUndefined();
      expect((card as any).curated_guidelines).toBeUndefined();
      expect((card as any).concierge_privileges).toBeUndefined();
      expect((card as any).host_philosophy).toBeUndefined();
      expect((card as any).dynamicPricing).toBeUndefined();
    });
  });

  describe('HTTP Route Integration Tests with Isolated pg-mem Database', () => {
    beforeAll(async () => {
      // In-memory pg-mem database initialized via setup.ts
      const pool = new Pool();

      // Published property
      await pool.query(`
        INSERT INTO listings (
          id, user_id, title, description, price, currency, type, address, city, lat, lng, slug, publication_status
        ) VALUES (
          77, 999, 'Mountain Mist Sanctuary', 'Peaceful hill retreat', 15000, 'INR', 'villa',
          'Exact Secret Address 123', 'Munnar', 10.09, 77.06, 'mountain-mist-sanctuary-77', 'published'
        ) ON CONFLICT (id) DO NOTHING;
      `);

      // Unlisted / Draft property (Publication Boundary Test)
      await pool.query(`
        INSERT INTO listings (
          id, user_id, title, description, price, currency, type, address, city, lat, lng, slug, publication_status
        ) VALUES (
          88, 999, 'Private Unlisted Sanctuary', 'Hidden draft stay', 30000, 'INR', 'estate',
          'Super Secret Unlisted Road', 'Ooty', 11.41, 76.70, 'private-unlisted-sanctuary-88', 'draft'
        ) ON CONFLICT (id) DO NOTHING;
      `);
    });

    it('GET /api/v2/stays/:propertySlug returns public projection for valid published slug with allowlisted fields only', async () => {
      const res = await request(app)
        .get('/api/v2/stays/mountain-mist-sanctuary-77')
        .expect(200);

      expect(res.body.id).toBe('77');
      expect(res.body.slug).toBe('mountain-mist-sanctuary-77');
      expect(res.body.title).toBe('Mountain Mist Sanctuary');
      expect(res.body.location.city).toBe('Munnar');
      expect(res.body.location.approximateLatitude).toBe(10.09);
      expect(res.body.location.approximateLongitude).toBe(77.06);

      // Verify strict allowlist enforcement: NO private address, raw coords, user_id
      expect(res.body.address).toBeUndefined();
      expect(res.body.lat).toBeUndefined();
      expect(res.body.lng).toBeUndefined();
      expect(res.body.user_id).toBeUndefined();

      const rawText = JSON.stringify(res.body);
      expect(rawText).not.toContain('Exact Secret Address 123');
      expect(rawText).not.toContain('10.088933');
      expect(rawText).not.toContain('77.059523');
    });

    it('GET /api/v2/stays/:propertySlug enforces publication boundary: returns 404 for unlisted/draft stay', async () => {
      const res = await request(app)
        .get('/api/v2/stays/private-unlisted-sanctuary-88')
        .expect(404);

      expect(res.body).toEqual({ error: 'Stay not found' });
    });

    it('GET /api/v2/stays/:propertySlug returns 404 for unknown slug', async () => {
      const res = await request(app)
        .get('/api/v2/stays/unknown-sanctuary-999999')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toEqual({ error: 'Stay not found' });
    });

    it('GET /listing/:id redirects 301 to canonical stay route for published stay', async () => {
      const res = await request(app)
        .get('/listing/77');

      expect(res.status).toBe(301);
      expect(res.header.location).toBe('/stay/mountain-mist-sanctuary-77');
    });

    it('GET /listings/:id redirects 301 to canonical stay route for published stay', async () => {
      const res = await request(app)
        .get('/listings/77');

      expect(res.status).toBe(301);
      expect(res.header.location).toBe('/stay/mountain-mist-sanctuary-77');
    });

    it('GET /listing/:id returns 404 for unlisted/draft stay to prevent private disclosure', async () => {
      const res = await request(app)
        .get('/listing/88');

      expect(res.status).toBe(404);
    });

    it('GET /listing/:id returns 404 if listing ID is unknown', async () => {
      const res = await request(app)
        .get('/listing/999999');

      expect(res.status).toBe(404);
    });

    it('GET /listing/invalid-id redirects to home (301)', async () => {
      const res = await request(app)
        .get('/listing/not-a-number');

      expect(res.status).toBe(301);
      expect(res.header.location).toBe('/');
    });

    it('GET /api/seo properly escapes hostile strings in HTML meta tags', async () => {
      // In-memory pool insertion with hostile script tag
      const pool = new Pool();
      await pool.query(`
        INSERT INTO listings (
          id, user_id, title, description, price, currency, type, address, city, slug, publication_status
        ) VALUES (
          99, 999, 'Hostile <script>alert("xss")</script> Sanctuary', 'Description with "quotes" & <tags>', 20000, 'INR', 'villa',
          'Safe Addr', 'Goa', 'hostile-xss-99', 'published'
        ) ON CONFLICT (id) DO NOTHING;
      `);

      const res = await request(app)
        .get('/api/seo?type=stay&slug=hostile-xss-99')
        .expect(200);

      expect(res.text).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(res.text).not.toContain('<script>alert("xss")</script>');
      expect(res.text).toContain('&quot;quotes&quot; &amp; &lt;tags&gt;');
      expect(res.text).toContain('<link rel="canonical" href="https://encho.space/stay/hostile-xss-99" />');
    });
  });

  describe('Round 3 Security Blocker Tests: Raw Listing Protection, Fail-Closed Boundaries & Text Sanitization', () => {
    const pool = new Pool();
    const hostUser = { id: 701, role: 'host', name: 'Authorized Host' };
    const adminUser = { id: 999, role: 'admin', name: 'Admin Master' };
    const strangerUser = { id: 802, role: 'host', name: 'Stranger Host' };

    const hostToken = jwt.sign(hostUser, JWT_SECRET);
    const adminToken = jwt.sign(adminUser, JWT_SECRET);
    const strangerToken = jwt.sign(strangerUser, JWT_SECRET);

    beforeAll(async () => {
      // Seed listings across all publication statuses: published, draft, unlisted, suspended, archived, and NULL
      // Fixture 501 is published and loaded with sensitive values across descriptions, rooms, photos, nearby, guidelines, tags, host philosophy, dynamic pricing, and raw rules
      await pool.query(`
        INSERT INTO listings (
          id, user_id, title, description, price, currency, type, address, city, lat, lng, slug, publication_status,
          rooms, photos, nearby, curated_guidelines, raw_rules, experience_tags, host_philosophy, concierge_privileges, dynamic_pricing
        ) VALUES 
          (
            501, 701, 'Host Published Villa',
            'Exclusive villa. Call host at +91-9876543210 or email secret_host@villa.com. Door code 123456. Road: 77 Palm Avenue.',
            12000, 'INR', 'villa', '77 Palm Avenue, Indiranagar', 'Bengaluru', 12.9716, 77.5946, 'host-published-villa-501', 'published',
            '[{"id":"internal_room_uuid_101","name":"Private Suite","type":"suites","price":12000,"capacity":2,"inventory_count":99,"specs":"Jacuzzi wifi secretpass123","description":"Contact host: 9876543210","features":["King Bed","wifi pass secretwifi"],"amenities":["ac","private_pool_code_99"]}]'::jsonb,
            '[{"id":"media_asset_internal_404","url":"https://images.encho.space/villa.jpg","tier":"suites","category":"bedroom","description":"Internal note: host pin 5544","s3_bucket":"secret-private-bucket","uploaded_by_user_id":701}]'::jsonb,
            '[{"id":"internal_poi_99","name":"Local Coffee wa.me/9199998888","distance":"2 km","type":"cafe","description":"Secret phone 9998887776","lat":12.975543,"lng":77.598876,"map_url":"https://maps.google.com/?q=secret-coords","contact":"+91 9998887776"}]'::jsonb,
            'No smoking. WiFi password is SuperSecretPass789. Door passcode: 4321.',
            'Raw internal rules: do not give keys without ID; secret alarm pin 9876.',
            '["Mountain Retreat","Contact 9876543210"]'::jsonb,
            'Philosophy of peace. Direct contact: host_direct@stay.org.',
            'Concierge service available. Call butler at +91 9123456789.',
            '{"weekendMultiplier": 1.2, "internal_margin_secret": 0.35}'::jsonb
          ),
          (502, 701, 'Host Draft Villa', 'Secret draft notes', 15000, 'INR', 'villa', '88 Hidden Lane', 'Bengaluru', 12.98, 77.60, 'host-draft-villa-502', 'draft', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL),
          (503, 701, 'Host Unlisted Villa', 'Unlisted private property', 18000, 'INR', 'villa', '99 Secluded Road', 'Bengaluru', 12.99, 77.61, 'host-unlisted-villa-503', 'unlisted', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL),
          (504, 701, 'Host Suspended Villa', 'Suspended due to review', 20000, 'INR', 'villa', '101 Red Flag Blvd', 'Bengaluru', 12.95, 77.55, 'host-suspended-villa-504', 'suspended', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL),
          (505, 701, 'Host Archived Villa', 'Old archived stay', 22000, 'INR', 'villa', '102 Memory Lane', 'Bengaluru', 12.94, 77.54, 'host-archived-villa-505', 'archived', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL),
          (506, 701, 'Host Null-Status Villa', 'Legacy stay without status', 25000, 'INR', 'villa', '103 Ghost Road', 'Bengaluru', 12.93, 77.53, 'host-null-status-villa-506', NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL)
        ON CONFLICT (id) DO NOTHING;
      `);
    });

    it('Anonymous GET /api/listings/:id never receives raw private fields (address, lat/lng, user_id)', async () => {
      const res = await request(app)
        .get('/api/listings/501')
        .expect(200);

      // Must be mapped through safe public projection
      expect(res.body.address).toBeUndefined();
      expect(res.body.user_id).toBeUndefined();
      expect(res.body.lat).toBeUndefined();
      expect(res.body.lng).toBeUndefined();

      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('77 Palm Avenue');
      expect(raw).not.toContain('Indiranagar'); // Street address token omitted from address field
      expect(raw).not.toContain('12.9716');
      expect(raw).not.toContain('77.5946');
      expect(raw).not.toContain('98765 43210');
      expect(raw).not.toContain('host@stay.com');
      expect(raw).not.toContain('560001');
    });

    it('Anonymous GET /api/listings/:id returns 404 for non-published listings (draft, unlisted, suspended, archived, NULL)', async () => {
      const nonPublishedIds = [502, 503, 504, 505, 506];
      for (const id of nonPublishedIds) {
        const res = await request(app).get(`/api/listings/${id}`);
        expect(res.status).toBe(404);
      }
    });

    it('Authenticated owner GET /api/listings/:id receives full raw listing for editing', async () => {
      const res = await request(app)
        .get('/api/listings/502')
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      expect(res.body.id).toBe(502);
      expect(res.body.address).toBe('88 Hidden Lane');
      expect(res.body.user_id).toBe(701);
      expect(res.body.publication_status).toBe('draft');
    });

    it('Authenticated admin GET /api/listings/:id receives full raw listing regardless of status', async () => {
      const res = await request(app)
        .get('/api/listings/504')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(504);
      expect(res.body.address).toBe('101 Red Flag Blvd');
      expect(res.body.publication_status).toBe('suspended');
    });

    it('Stranger host GET /api/listings/:id for draft/unlisted listing returns 404 (non-owner cannot see non-published raw data)', async () => {
      const res = await request(app)
        .get('/api/listings/502')
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(404);
    });

    it('Anonymous GET /api/listings contains ONLY published listings and omits private address, user_id, raw rules', async () => {
      const res = await request(app)
        .get('/api/listings')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const returnedIds = res.body.map((l: any) => String(l.id));

      // 501 is published, so it can be present
      expect(returnedIds).toContain('501');

      // 502 (draft), 503 (unlisted), 504 (suspended), 505 (archived), 506 (NULL) MUST NOT be present
      expect(returnedIds).not.toContain('502');
      expect(returnedIds).not.toContain('503');
      expect(returnedIds).not.toContain('504');
      expect(returnedIds).not.toContain('505');
      expect(returnedIds).not.toContain('506');

      const fullJsonString = JSON.stringify(res.body);

      // Verify ZERO sensitive leakage anywhere in the serialized response body
      expect(fullJsonString).not.toContain('77 Palm Avenue');
      expect(fullJsonString).not.toContain('Indiranagar');
      expect(fullJsonString).not.toContain('9876543210');
      expect(fullJsonString).not.toContain('secret_host@villa.com');
      expect(fullJsonString).not.toContain('123456');
      expect(fullJsonString).not.toContain('internal_room_uuid_101');
      expect(fullJsonString).not.toContain('secretpass123');
      expect(fullJsonString).not.toContain('secretwifi');
      expect(fullJsonString).not.toContain('private_pool_code_99');
      expect(fullJsonString).not.toContain('media_asset_internal_404');
      expect(fullJsonString).not.toContain('secret-private-bucket');
      expect(fullJsonString).not.toContain('host pin 5544');
      expect(fullJsonString).not.toContain('internal_poi_99');
      expect(fullJsonString).not.toContain('wa.me');
      expect(fullJsonString).not.toContain('9998887776');
      expect(fullJsonString).not.toContain('maps.google.com');
      expect(fullJsonString).not.toContain('secret-coords');
      expect(fullJsonString).not.toContain('SuperSecretPass789');
      expect(fullJsonString).not.toContain('4321');
      expect(fullJsonString).not.toContain('secret alarm pin 9876');
      expect(fullJsonString).not.toContain('host_direct@stay.org');
      expect(fullJsonString).not.toContain('9123456789');
      expect(fullJsonString).not.toContain('internal_margin_secret');

      const approvedCardKeys = new Set([
        'id',
        'slug',
        'title',
        'type',
        'rental_mode',
        'price',
        'currency',
        'period',
        'city',
        'imageUrl',
        'imageUrls',
        'imageCount',
        'rooms',
        'lat',
        'lng',
        'isVerified',
        'hasOffers',
        'rating',
        'reviewCount',
        'amenities',
        'maxGuests',
        'bedrooms',
        'beds',
        'bathrooms'
      ]);

      const approvedRoomKeys = new Set([
        'type',
        'name',
        'icon',
        'tag',
        'price',
        'capacity',
        'specs',
        'features',
        'amenities',
        'description'
      ]);

      // Check all returned listings for strict privacy omission and approved key allowlist
      for (const item of res.body) {
        expect(item.address).toBeUndefined();
        expect(item.user_id).toBeUndefined();
        expect(item.host_id).toBeUndefined();
        expect(item.raw_rules).toBeUndefined();
        expect(item.nearby).toBeUndefined();
        expect(item.photos).toBeUndefined();
        expect(item.curated_guidelines).toBeUndefined();
        expect(item.concierge_privileges).toBeUndefined();
        expect(item.host_philosophy).toBeUndefined();
        expect(item.dynamicPricing).toBeUndefined();

        // Check top-level keys against approved whitelist (no unknown keys)
        for (const key of Object.keys(item)) {
          expect(approvedCardKeys.has(key)).toBe(true);
        }

        // Check nested room keys against approved whitelist (no unknown internal room keys)
        if (Array.isArray(item.rooms)) {
          for (const r of item.rooms) {
            for (const rKey of Object.keys(r)) {
              expect(approvedRoomKeys.has(rKey)).toBe(true);
            }
            expect((r as any).id).toBeUndefined();
            expect((r as any).inventory_count).toBeUndefined();
            expect((r as any).internal_code).toBeUndefined();
          }
        }

        if (item.lat != null) {
          // Latitude must be coarsened (max 2 decimals)
          const decimals = String(item.lat).split('.')[1]?.length || 0;
          expect(decimals).toBeLessThanOrEqual(2);
        }
        if (item.lng != null) {
          // Longitude must be coarsened (max 2 decimals)
          const decimals = String(item.lng).split('.')[1]?.length || 0;
          expect(decimals).toBeLessThanOrEqual(2);
        }
      }
    });

    it('GET /api/v2/stays/:propertySlug returns 404 for all non-published stays (draft, unlisted, suspended, archived, NULL)', async () => {
      const nonPublishedSlugs = [
        'host-draft-villa-502',
        'host-unlisted-villa-503',
        'host-suspended-villa-504',
        'host-archived-villa-505',
        'host-null-status-villa-506'
      ];

      for (const slug of nonPublishedSlugs) {
        const res = await request(app).get(`/api/v2/stays/${slug}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Stay not found' });
      }
    });

    it('GET /listing/:id 301 redirect returns 404 for all non-published stays (fail closed)', async () => {
      const nonPublishedIds = [502, 503, 504, 505, 506];
      for (const id of nonPublishedIds) {
        const res = await request(app).get(`/listing/${id}`);
        expect(res.status).toBe(404);
      }
    });

    it('Migration 002 definition defaults to draft and never auto-publishes legacy rows', () => {
      const migrationPath = path.resolve(__dirname, '../migrations/002_add_listings_publication_status.sql');
      const content = fs.readFileSync(migrationPath, 'utf8');

      expect(content).toContain("DEFAULT 'draft'");
      expect(content).not.toContain("DEFAULT 'published'");
      expect(content).not.toMatch(/UPDATE\s+listings\s+SET\s+publication_status\s*=\s*'published'/i);
    });

    it('sanitizePublicText scrubs phone numbers, emails, whatsapp, pins, passcodes, coordinates, and street names', () => {
      const hostile = 'Contact: +91-9876543210 or host@example.com. WhatsApp wa.me/919876543210. WiFi password is secretpass123. Door passcode: 4321. Location: Plot 44, Hill Road, Pin 673577, coords 11.52001, 76.13002.';
      const sanitized = sanitizePublicText(hostile);

      expect(sanitized).not.toContain('9876543210');
      expect(sanitized).not.toContain('host@example.com');
      expect(sanitized).not.toContain('wa.me');
      expect(sanitized).not.toContain('secretpass123');
      expect(sanitized).not.toContain('4321');
      expect(sanitized).not.toContain('Plot 44');
      expect(sanitized).not.toContain('Hill Road');
      expect(sanitized).not.toContain('673577');
      expect(sanitized).not.toContain('11.52001');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('mapPublicRoomTier never derives public room type from rawRoom.id', () => {
      const rawRoom = {
        id: 'secret_db_uuid_room_987',
        name: 'Ocean Sunrise Villa',
        price: 15000,
        capacity: 2
      };

      const mapped = mapPublicRoomTier(rawRoom);
      expect(mapped.type).not.toContain('secret_db_uuid');
      expect(mapped.type).not.toContain('room_987');
      expect(mapped.type).toBe('ocean-sunrise-villa');
    });

    it('ListingDetailsNew.tsx does not fetch /api/listings/:id on public guest rendering path', () => {
      const componentPath = path.resolve(__dirname, '../../components/ListingDetailsNew.tsx');
      const content = fs.readFileSync(componentPath, 'utf8');

      // The unauthenticated raw fetch `/api/listings/${initialListing.id}` must NOT exist in the file
      expect(content).not.toMatch(/fetch\s*\(\s*['"`]\/api\/listings\/\$\{initialListing\.id\}['"`]\s*\)/);
      expect(content).not.toMatch(/fetch\s*\(\s*['"`]\/api\/listings\/['"`]\s*\+\s*initialListing\.id\s*\)/);
    });

    describe('Redis Cache Privacy Cutover: listings_v3 Namespace & Leak Prevention', () => {
      beforeEach(() => {
        __mockRedisStore.clear();
      });

      it('old listings_v2 cache entry containing address/private data must NEVER be read by public catalogue', async () => {
        // Seed poisoned legacy cache in listings_v2 namespace with raw private data
        const poisonedLegacyPayload = [
          {
            id: '999',
            title: 'Leaked Legacy Villa',
            address: 'Secret Private Street 123',
            user_id: 888,
            raw_rules: 'Leaked raw alarm pass 1234',
            description: 'Private unredacted phone: 9999999999'
          }
        ];

        // Seed old namespaces
        __mockRedisStore.set('listings_v2:all:/api/listings', JSON.stringify(poisonedLegacyPayload));
        __mockRedisStore.set('listings_v2:bengaluru:/api/listings?city=Bengaluru', JSON.stringify(poisonedLegacyPayload));

        // Public catalogue request
        const res = await request(app)
          .get('/api/listings')
          .expect(200);

        const rawJson = JSON.stringify(res.body);

        // Verification 1: Legacy v2 cache was completely ignored
        expect(rawJson).not.toContain('Secret Private Street 123');
        expect(rawJson).not.toContain('Leaked raw alarm pass 1234');
        expect(rawJson).not.toContain('9999999999');
        expect(rawJson).not.toContain('Leaked Legacy Villa');

        // Verification 2: The listings_v2 entry was untouched in cache
        expect(__mockRedisStore.has('listings_v2:all:/api/listings')).toBe(true);
      });

      it('public cache reads and writes use ONLY the listings_v3:public_cards namespace', async () => {
        // Issue fresh public request
        const res = await request(app)
          .get('/api/listings?city=Bengaluru')
          .expect(200);

        // Verify that Redis was written to
        const writtenKeys = Array.from(__mockRedisStore.keys());
        expect(writtenKeys.length).toBeGreaterThan(0);

        // All public cache keys MUST use the new listings_v3:public_cards prefix
        for (const key of writtenKeys) {
          expect(key.startsWith('listings_v3:public_cards:')).toBe(true);
          expect(key).not.toContain('listings_v2');
        }

        // Check key structure: listings_v3:public_cards:bengaluru:/api/listings?city=Bengaluru
        const targetKey = 'listings_v3:public_cards:bengaluru:/api/listings?city=Bengaluru';
        expect(__mockRedisStore.has(targetKey)).toBe(true);

        // Verify that the cached content is the safe public-card projection
        const cachedRaw = __mockRedisStore.get(targetKey);
        const cachedData = typeof cachedRaw === 'string' ? JSON.parse(cachedRaw) : cachedRaw;
        expect(Array.isArray(cachedData)).toBe(true);

        const cachedJson = JSON.stringify(cachedData);
        expect(cachedJson).not.toContain('77 Palm Avenue');
        expect(cachedJson).not.toContain('secret_host@villa.com');
        expect(cachedJson).not.toContain('SuperSecretPass789');

        for (const card of cachedData) {
          expect(card.address).toBeUndefined();
          expect(card.user_id).toBeUndefined();
          expect(card.raw_rules).toBeUndefined();
          expect(card.nearby).toBeUndefined();
        }

        // Verify subsequent request reads from listings_v3 cache
        const res2 = await request(app)
          .get('/api/listings?city=Bengaluru')
          .expect(200);

        expect(res2.body).toEqual(cachedData);
      });

      it('authenticated owner/admin responses are NEVER stored in a public cache', async () => {
        // Authenticated host request with userId
        await request(app)
          .get('/api/listings?userId=701')
          .set('Authorization', `Bearer ${hostToken}`)
          .expect(200);

        // Authenticated admin request with city=all
        await request(app)
          .get('/api/listings?city=all')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        // Neither owner nor admin feeds should write to Redis cache
        const allKeys = Array.from(__mockRedisStore.keys());
        for (const key of allKeys) {
          expect(key).not.toContain('userId');
          expect(key).not.toContain('701');
        }
        expect(allKeys.filter(k => k.includes('userId') || k.includes('701')).length).toBe(0);
      });
    });
  });
});
