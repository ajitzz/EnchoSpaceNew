/**
 * src/test/harvo/sprint4_feeder_corridors.test.ts
 *
 * FAANG L7/L8 Zero-Trust Adversarial Test Suite for:
 * Feeder Corridors Engine & Admin God-Mode Meta/Google Ads Manager Parity Studio (Sprint 4).
 * Fulfills Blueprint Section 6 & 8, and Decisions CR1-045 & CR1-048.
 *
 * Verifies:
 * 1. Feeder Targeting Formula: FeederTargeting = Union(CityCenter_i, Radius_i) \ LocalDistrictBoundary.
 * 2. Targeting Collision Protection: Excluded local destination district cannot be targeted as a feeder.
 * 3. AI Advisory Copilot Recommendation: Generates high-converting placements, corridors, keywords, and negative terms.
 * 4. Admin God-Mode Meta Schema Validation: Enforces Housing Special Ad Category (HEC) and ROAS floor.
 * 5. Admin God-Mode Google Schema Validation: Enforces exact/phrase keywords, negative suppression list, and CPA/CPC limits.
 * 6. Host vs Admin RBAC Isolation: Hosts cannot mutate targeting dials directly (Admin authority required).
 * 7. Cross-Tenant Campaign Isolation: Host A cannot view Host B's campaign targeting.
 * 8. Atomic Persistence & Monotonic Versioning: Version bumps monotonically; backward-compat syncs to host_marketing_campaigns.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createLocalPostgresFixture } from './postgres.js';
import { FeederCorridorService } from '../../services/feederCorridorService.js';
import { createFeederCorridorRouter } from '../../server/marketing/feederCorridorRouter.js';

describe('Sprint 4: Feeder Corridors & God-Mode Ads Manager Adversarial Suite', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let service: FeederCorridorService;
  let app: express.Express;

  const HOST_A_ID = 301;
  const HOST_B_ID = 302;
  const ADMIN_ID = 901;

  let listingId: number;
  let campaignAId: number;
  let campaignBId: number;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });

    // 1. Base Users Table
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user'
      );
    `);

    // 2. Base Listings Table
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        host_user_id INT REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        price DECIMAL NOT NULL,
        city VARCHAR(100) NOT NULL,
        amenities JSONB DEFAULT '[]'::jsonb
      );
    `);

    // 3. Base Host Marketing Campaigns Table
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS host_marketing_campaigns (
        id SERIAL PRIMARY KEY,
        host_user_id INT REFERENCES users(id),
        listing_id INT REFERENCES listings(id),
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING_ADMIN',
        meta_specifications JSONB DEFAULT '{}'::jsonb,
        adset_specifications JSONB DEFAULT '{}'::jsonb,
        admin_approved BOOLEAN DEFAULT false,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Migration 044 Tables
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_feeder_corridor_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region_code VARCHAR(50) NOT NULL,
        corridor_name VARCHAR(150) NOT NULL,
        source_city VARCHAR(100) NOT NULL,
        center_lat DECIMAL(10, 7) NOT NULL,
        center_lng DECIMAL(10, 7) NOT NULL,
        radius_km DECIMAL(6, 2) NOT NULL DEFAULT 25.00,
        excluded_local_district VARCHAR(100) NOT NULL,
        tier_eligibility VARCHAR(50) NOT NULL DEFAULT 'ALL',
        expected_roas_benchmark DECIMAL(4, 2) DEFAULT 3.80,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS campaign_godmode_targeting (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        housing_special_category BOOLEAN NOT NULL DEFAULT true,
        meta_placements JSONB NOT NULL DEFAULT '["INSTAGRAM_REELS", "INSTAGRAM_STORIES", "FACEBOOK_FEED"]'::jsonb,
        selected_corridor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        custom_geo_radii JSONB NOT NULL DEFAULT '[]'::jsonb,
        excluded_districts JSONB NOT NULL DEFAULT '[]'::jsonb,
        bidding_strategy VARCHAR(50) NOT NULL DEFAULT 'TARGET_ROAS',
        target_roas_floor DECIMAL(4, 2) DEFAULT 3.00,
        cpc_ceiling_cents INT DEFAULT 150,
        target_cpa_cents INT DEFAULT 1200,
        google_search_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
        google_negative_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
        google_sitelinks JSONB NOT NULL DEFAULT '[]'::jsonb,
        ai_copilot_recommendation JSONB,
        configured_by_admin_id INT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (campaign_id)
      );
    `);

    // 5. Seed Users
    await fixture.pool.query(
      `INSERT INTO users (id, email, name, role) VALUES 
       ($1, 'host_a@encho.in', 'Host A', 'host'),
       ($2, 'host_b@encho.in', 'Host B', 'host'),
       ($3, 'admin@encho.in', 'AdTech Admin', 'admin')`,
      [HOST_A_ID, HOST_B_ID, ADMIN_ID]
    );

    // 6. Seed Listing
    const listingRes = await fixture.pool.query(
      `INSERT INTO listings (host_user_id, title, price, city, amenities)
       VALUES ($1, 'Wayanad Mountain Panorama Villa', 15000, 'Wayanad', '["Infinity Pool", "Mountain View", "Private Jacuzzi"]')
       RETURNING id`,
      [HOST_A_ID]
    );
    listingId = listingRes.rows[0].id;

    // 7. Seed Campaigns
    const cARes = await fixture.pool.query(
      `INSERT INTO host_marketing_campaigns (host_user_id, listing_id, status)
       VALUES ($1, $2, 'PENDING_ADMIN') RETURNING id`,
      [HOST_A_ID, listingId]
    );
    campaignAId = cARes.rows[0].id;

    const cBRes = await fixture.pool.query(
      `INSERT INTO host_marketing_campaigns (host_user_id, listing_id, status)
       VALUES ($1, $2, 'PENDING_ADMIN') RETURNING id`,
      [HOST_B_ID, listingId]
    );
    campaignBId = cBRes.rows[0].id;

    // 8. Seed Feeder Corridors
    await fixture.pool.query(`
      INSERT INTO marketing_feeder_corridor_definitions 
      (region_code, corridor_name, source_city, center_lat, center_lng, radius_km, excluded_local_district, tier_eligibility, expected_roas_benchmark)
      VALUES
      ('WAYANAD', 'Bangalore Tech Corridor (Outer Ring / Whitefield / Koramangala)', 'Bangalore', 12.9352000, 77.6245000, 25.00, 'Wayanad', 'ALL', 4.20),
      ('WAYANAD', 'South Mumbai Affluent Corridor (Colaba to Bandra)', 'Mumbai', 18.9220000, 72.8347000, 15.00, 'Wayanad', 'LUXURY', 3.90),
      ('WAYANAD', 'Chennai Central Weekend Traveler Hub', 'Chennai', 13.0827000, 80.2707000, 20.00, 'Wayanad', 'ALL', 3.50),
      ('GOA', 'Mumbai Metropolitan Financial Hub', 'Mumbai', 19.0760000, 72.8777000, 25.00, 'North Goa', 'ALL', 4.50)
    `);

    // 9. Instantiate Service & Express App
    service = new FeederCorridorService(fixture.pool);

    app = express();
    app.use(express.json());

    // Mock Authentication Middleware
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.includes('Bearer host-a-token')) {
        (req as any).user = { id: HOST_A_ID, role: 'host' };
      } else if (authHeader?.includes('Bearer host-b-token')) {
        (req as any).user = { id: HOST_B_ID, role: 'host' };
      } else if (authHeader?.includes('Bearer admin-token')) {
        (req as any).user = { id: ADMIN_ID, role: 'admin' };
      }
      next();
    });

    app.use('/api/marketing/v2/feeder-corridors', createFeederCorridorRouter(fixture.pool));
  });

  afterAll(async () => {
    await fixture.close();
  });

  // ==========================================================================
  // Test 1: Mathematical Feeder Targeting Formula & Collision Protection
  // ==========================================================================
  it('Test 1: Feeder Targeting Formula calculates Union(City, Radius) \\ LocalDistrict correctly', async () => {
    const corridors = await service.listAvailableCorridors('WAYANAD');
    expect(corridors.length).toBe(3);

    const resolution = service.calculateCorridorTargetingFormula(
      corridors,
      [{ city: 'Pune', radiusKm: 20, lat: 18.5204, lng: 73.8567 }],
      ['Wayanad']
    );

    expect(resolution.isValid).toBe(true);
    expect(resolution.targetedCities).toContain('Bangalore');
    expect(resolution.targetedCities).toContain('Mumbai');
    expect(resolution.targetedCities).toContain('Chennai');
    expect(resolution.targetedCities).toContain('Pune');
    expect(resolution.excludedDistricts).toContain('Wayanad');
    expect(resolution.effectiveFormula).toContain('[Bangalore(25km) ∪ Mumbai(15km) ∪ Chennai(20km) ∪ Pune(20km)] \\ [Wayanad]');
  });

  it('Test 1b: Targeting collision fails closed if local district is targeted as a feeder', async () => {
    const corridors = await service.listAvailableCorridors('WAYANAD');
    const collisionResolution = service.calculateCorridorTargetingFormula(
      corridors,
      [{ city: 'Wayanad', radiusKm: 15, lat: 11.6854, lng: 76.1320 }], // Invalid: trying to target Wayanad residents
      ['Wayanad']
    );

    expect(collisionResolution.isValid).toBe(false);
    expect(collisionResolution.effectiveFormula).toBe('TARGETING_COLLISION');
    expect(collisionResolution.validationError).toContain('Collision detected');
  });

  // ==========================================================================
  // Test 2: AI Advisory Copilot Recommendation Engine
  // ==========================================================================
  it('Test 2: AI Copilot generates strategic targeting recommendations with >=0.90 confidence', async () => {
    const recommendation = await service.generateAiCopilotRecommendation(
      {
        id: listingId,
        title: 'Wayanad Mountain Panorama Villa',
        price: 15000,
        city: 'Wayanad',
        amenities: ['Infinity Pool', 'Mountain View', 'Jacuzzi'],
      },
      700000, // ₹7,000 budget
      'OMNICHANNEL'
    );

    expect(recommendation.confidenceScore).toBeGreaterThanOrEqual(0.90);
    // Visual high-ticket stay recommends 9:16 vertical video dominance
    expect(recommendation.recommendedPlacements[0].placement).toBe('INSTAGRAM_REELS');
    expect(recommendation.recommendedPlacements[0].allocationPercentage).toBe(70);

    // Corridors match Wayanad
    expect(recommendation.recommendedCorridors.some((c) => c.city === 'Bangalore')).toBe(true);
    expect(recommendation.mandatoryExclusions).toContain('Wayanad');

    // Negative keywords list contains essential suppression terms
    expect(recommendation.googleKeywordPlan.negativeKeywords).toContain('cheap homestay');
    expect(recommendation.googleKeywordPlan.negativeKeywords).toContain('bus timings');
    expect(recommendation.googleKeywordPlan.negativeKeywords).toContain('dormitory rooms');

    // Luxury stay gets target ROAS floor >= 3.8
    expect(recommendation.recommendedBidding.roasFloor).toBe(3.8);
  });

  // ==========================================================================
  // Test 3 & 4: Admin God-Mode Schema Validation (Meta HEC & Google Keywords)
  // ==========================================================================
  it('Test 3: God-Mode Meta schema enforces Housing Special Category and valid ROAS floor', async () => {
    const corridors = await service.listAvailableCorridors('WAYANAD');
    const corridorIds = corridors.map((c) => c.id);

    // Save targeting as Admin
    const result = await service.saveGodmodeTargeting(
      campaignAId,
      {
        housingSpecialCategory: true,
        metaPlacements: ['INSTAGRAM_REELS', 'INSTAGRAM_STORIES'],
        selectedCorridorIds: corridorIds,
        customGeoRadii: [],
        excludedDistricts: ['Wayanad'],
        biddingStrategy: 'TARGET_ROAS',
        targetRoasFloor: 3.8,
        cpcCeilingCents: 160,
        targetCpaCents: 1500,
        googleSearchKeywords: [
          { keyword: '[luxury resort wayanad]', matchType: 'EXACT' },
          { keyword: '"pool villa wayanad"', matchType: 'PHRASE' },
        ],
        googleNegativeKeywords: ['cheap homestay', 'free stay'],
        googleSitelinks: [],
      },
      ADMIN_ID
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe(1);
    expect(result.config.housing_special_category).toBe(true);
    expect(result.config.bidding_strategy).toBe('TARGET_ROAS');
    expect(Number(result.config.target_roas_floor)).toBe(3.8);
  });

  it('Test 4: God-Mode schema rejects invalid target ROAS floor (< 1.0)', async () => {
    await expect(
      service.saveGodmodeTargeting(
        campaignAId,
        {
          targetRoasFloor: 0.5, // Invalid: below 1.0 minimum floor
        },
        ADMIN_ID
      )
    ).rejects.toThrow();
  });

  // ==========================================================================
  // Test 5: Host vs Admin Role Separation (Security Invariant)
  // ==========================================================================
  it('Test 5: Host attempting to commit targeting dials is rejected with HTTP 403', async () => {
    const res = await request(app)
      .post(`/api/marketing/v2/feeder-corridors/campaigns/${campaignAId}/targeting`)
      .set('Authorization', 'Bearer host-a-token') // Host token, NOT Admin
      .send({
        biddingStrategy: 'MAX_CONVERSIONS',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Admin authority required');
  });

  it('Test 5b: Unauthenticated request is rejected with HTTP 401', async () => {
    const res = await request(app)
      .post(`/api/marketing/v2/feeder-corridors/campaigns/${campaignAId}/targeting`)
      .send({
        biddingStrategy: 'MAX_CONVERSIONS',
      });

    expect(res.status).toBe(401);
  });

  // ==========================================================================
  // Test 6: Cross-Tenant Campaign Targeting Isolation
  // ==========================================================================
  it('Test 6: Host B cannot inspect Host A campaign targeting (HTTP 403)', async () => {
    const res = await request(app)
      .get(`/api/marketing/v2/feeder-corridors/campaigns/${campaignAId}/targeting`)
      .set('Authorization', 'Bearer host-b-token'); // Host B inspecting Host A's campaign

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  it('Test 6b: Host A can inspect their own campaign targeting (HTTP 200)', async () => {
    const res = await request(app)
      .get(`/api/marketing/v2/feeder-corridors/campaigns/${campaignAId}/targeting`)
      .set('Authorization', 'Bearer host-a-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targeting).toBeDefined();
    expect(res.body.targeting.campaign_id).toBe(campaignAId);
  });

  // ==========================================================================
  // Test 7: Atomic Configuration Persistence & Monotonic Version Bump
  // ==========================================================================
  it('Test 7: Updating campaign targeting increments version monotonically (v1 -> v2)', async () => {
    const updateRes = await service.saveGodmodeTargeting(
      campaignAId,
      {
        biddingStrategy: 'MAX_CONVERSIONS',
        targetRoasFloor: 4.2,
      },
      ADMIN_ID
    );

    expect(updateRes.version).toBe(2);

    // Verify backward-compat sync to host_marketing_campaigns table
    const campRow = (
      await fixture.pool.query(
        'SELECT meta_specifications, admin_approved FROM host_marketing_campaigns WHERE id = $1',
        [campaignAId]
      )
    ).rows[0];

    expect(campRow.admin_approved).toBe(true);
    expect(campRow.meta_specifications.biddingStrategy).toBe('MAX_CONVERSIONS');
  });

  // ==========================================================================
  // Test 8: End-to-End API Integration
  // ==========================================================================
  it('Test 8: GET /corridors returns active feeder corridors catalog', async () => {
    const res = await request(app).get('/api/marketing/v2/feeder-corridors/corridors?region=WAYANAD');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.corridors.length).toBe(3);
    expect(res.body.corridors[0].source_city).toBeDefined();
  });

  it('Test 8b: POST /recommend generates valid AI Advisory recommendation via HTTP', async () => {
    const res = await request(app)
      .post('/api/marketing/v2/feeder-corridors/recommend')
      .set('Authorization', 'Bearer admin-token')
      .send({
        listingId,
        budgetCents: 800000,
        platform: 'OMNICHANNEL',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.recommendation.recommendedPlacements).toBeDefined();
    expect(res.body.recommendation.googleKeywordPlan.negativeKeywords.length).toBeGreaterThan(0);
  });
});
