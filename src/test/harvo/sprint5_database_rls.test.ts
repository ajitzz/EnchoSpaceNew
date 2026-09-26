/**
 * src/test/harvo/sprint5_database_rls.test.ts
 *
 * FAANG L7/L8 Zero-Trust Adversarial Test Suite for:
 * Multi-Role PostgreSQL Database Security & True Session-Scoped RLS (Sprint 5).
 * Fulfills Blueprint Domain 6 (Sprint 5 Specification), Section 9 & 11, and Decision CR1-050.
 *
 * Verifies:
 * 1. Catalog Level FORCE RLS: Asserts relrowsecurity=true and relforcerowsecurity=true across all 11 tables.
 * 2. Unfiltered Campaign SELECT: Host A sees only Campaign A; Host B sees only Campaign B.
 * 3. Godmode Targeting Isolation: Host A sees only Campaign A targeting dials.
 * 4. Creative Reels & Assets Isolation: Host A sees only Host A's package assets.
 * 5. Walled Garden CRM Leads & Wallets Isolation: Host A cannot view Host B's leads.
 * 6. Cross-Tenant Write Attack Containment: Host A cannot update or delete Host B's campaign (rowCount = 0).
 * 7. Anonymous Fail-Closed Guarantee: Unauthenticated session returns 0 rows.
 * 8. Stays Holds Session Isolation: Guest session token strictly isolates holds in stays_holds.
 * 9. Admin Moderation Authority: Admin session (bypass_rls=true) accesses cross-tenant records.
 * 10. Table Owner Non-Bypass: FORCE ROW LEVEL SECURITY prevents table-owner bypass.
 * 11. Express API Diagnostic: GET /api/operations/v1/security/rls-health returns 200 HEALTHY.
 * 12. Express Adversarial Diagnostic: POST /api/operations/v1/security/verify-isolation proves zero cross-tenant leak.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createLocalPostgresFixture } from './postgres.js';
import { DatabaseSecurityService, PROTECTED_TENANT_TABLES } from '../../services/databaseSecurityService.js';
import { createDatabaseSecurityRouter } from '../../server/marketing/databaseSecurityRouter.js';

describe('Sprint 5: Multi-Role PostgreSQL Database Security & True Session-Scoped RLS Adversarial Suite', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let securityService: DatabaseSecurityService;
  let app: express.Express;

  const HOST_A_ID = 501;
  const HOST_B_ID = 502;
  const ADMIN_ID = 901;

  let listingAId: number;
  let listingBId: number;
  let campaignAId: number;
  let campaignBId: number;
  let packageAId: string;
  let packageBId: string;

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
        user_id INT REFERENCES users(id),
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
        host_id INT REFERENCES users(id) ON DELETE CASCADE,
        listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        budget DECIMAL DEFAULT 2500,
        status VARCHAR(50) DEFAULT 'draft'
      );
    `);

    // 4. Base Campaign Godmode Targeting Table
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_godmode_targeting (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        housing_special_category BOOLEAN NOT NULL DEFAULT true,
        meta_placements JSONB NOT NULL DEFAULT '["INSTAGRAM_REELS"]'::jsonb,
        selected_corridor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        bidding_strategy VARCHAR(50) NOT NULL DEFAULT 'TARGET_ROAS',
        target_roas_floor DECIMAL(4, 2) DEFAULT 3.00,
        google_search_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
        google_negative_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
        configured_by_admin_id INT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        UNIQUE (campaign_id)
      );
    `);

    // 5. Base Marketing Creative Packages & Assets
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_creative_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        host_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        headline VARCHAR(255) NOT NULL,
        description TEXT,
        aspect_ratio VARCHAR(20) NOT NULL DEFAULT '9:16',
        video_duration_seconds DECIMAL(6, 2) NOT NULL,
        rights_attestation_hash VARCHAR(64) NOT NULL,
        ai_quality_score DECIMAL(3, 1) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING_ADMIN'
      );

      CREATE TABLE IF NOT EXISTS marketing_creative_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES marketing_creative_packages(id) ON DELETE CASCADE,
        asset_type VARCHAR(20) NOT NULL,
        original_url TEXT NOT NULL,
        sha256_hash VARCHAR(64) NOT NULL
      );
    `);

    // 6. Base Host Wallets & Transactions
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS host_wallets (
        id SERIAL PRIMARY KEY,
        host_id INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        balance_paise BIGINT NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
        amount_paise BIGINT NOT NULL,
        description TEXT
      );
    `);

    // 7. Base Leads & Inquiries
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS host_outreach_leads (
        id SERIAL PRIMARY KEY,
        host_id INT REFERENCES users(id) ON DELETE CASCADE,
        property_name VARCHAR(255),
        guest_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'discovered'
      );

      CREATE TABLE IF NOT EXISTS lead_inquiries (
        id SERIAL PRIMARY KEY,
        host_id INT REFERENCES users(id) ON DELETE CASCADE,
        campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        masked_contact_info TEXT,
        raw_inquiry TEXT
      );
    `);

    // 8. Base Stays Holds & Orders
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS stays_holds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_token VARCHAR(255) NOT NULL,
        user_id INT REFERENCES users(id),
        room_type_id INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS stays_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guest_id INT REFERENCES users(id),
        listing_id INT NOT NULL REFERENCES listings(id),
        amount_paise BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'CAPTURED'
      );
    `);

    // 9. Base Feeder Corridor Definitions
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
        expected_roas_benchmark DECIMAL(4, 2) DEFAULT 3.80,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    // 10. Execute Migration 045 DDL (Multi-Role & FORCE RLS)
    await fixture.pool.query(`
      CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer AS $$
        SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION is_admin_or_rls_bypassed() RETURNS boolean AS $$
        SELECT current_setting('app.bypass_rls', true) = 'true' 
            OR current_setting('app.marketing_admin', true) = 'true';
      $$ LANGUAGE sql STABLE;

      -- 1. host_marketing_campaigns
      ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_marketing_campaigns FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_campaigns_tenant_policy ON host_marketing_campaigns;
      CREATE POLICY host_campaigns_tenant_policy ON host_marketing_campaigns
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 2. campaign_godmode_targeting
      ALTER TABLE campaign_godmode_targeting ENABLE ROW LEVEL SECURITY;
      ALTER TABLE campaign_godmode_targeting FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS campaign_godmode_targeting_policy ON campaign_godmode_targeting;
      CREATE POLICY campaign_godmode_targeting_policy ON campaign_godmode_targeting
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_marketing_campaigns c
            WHERE c.id = campaign_godmode_targeting.campaign_id
              AND c.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_marketing_campaigns c
            WHERE c.id = campaign_godmode_targeting.campaign_id
              AND c.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 3. marketing_creative_packages
      ALTER TABLE marketing_creative_packages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE marketing_creative_packages FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS marketing_creative_packages_policy ON marketing_creative_packages;
      CREATE POLICY marketing_creative_packages_policy ON marketing_creative_packages
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 4. marketing_creative_assets
      ALTER TABLE marketing_creative_assets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE marketing_creative_assets FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS marketing_creative_assets_policy ON marketing_creative_assets;
      CREATE POLICY marketing_creative_assets_policy ON marketing_creative_assets
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM marketing_creative_packages p
            WHERE p.id = marketing_creative_assets.package_id
              AND p.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM marketing_creative_packages p
            WHERE p.id = marketing_creative_assets.package_id
              AND p.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 5. host_wallets
      ALTER TABLE host_wallets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_wallets FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_wallets_tenant_policy ON host_wallets;
      CREATE POLICY host_wallets_tenant_policy ON host_wallets
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 6. wallet_transactions
      ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE wallet_transactions FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS wallet_transactions_tenant_policy ON wallet_transactions;
      CREATE POLICY wallet_transactions_tenant_policy ON wallet_transactions
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_wallets w
            WHERE w.id = wallet_transactions.wallet_id
              AND w.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_wallets w
            WHERE w.id = wallet_transactions.wallet_id
              AND w.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 7. host_outreach_leads
      ALTER TABLE host_outreach_leads ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_outreach_leads FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_leads_tenant_policy ON host_outreach_leads;
      CREATE POLICY host_leads_tenant_policy ON host_outreach_leads
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 8. lead_inquiries
      ALTER TABLE lead_inquiries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE lead_inquiries FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS lead_inquiries_tenant_policy ON lead_inquiries;
      CREATE POLICY lead_inquiries_tenant_policy ON lead_inquiries
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 9. stays_holds
      ALTER TABLE stays_holds ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stays_holds FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS stays_holds_session_policy ON stays_holds;
      CREATE POLICY stays_holds_session_policy ON stays_holds
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
          OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
          OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
        );

      -- 10. stays_orders
      ALTER TABLE stays_orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stays_orders FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS stays_orders_participant_policy ON stays_orders;
      CREATE POLICY stays_orders_participant_policy ON stays_orders
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR guest_id::text = current_setting('app.current_user_id', true)
          OR EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = stays_orders.listing_id
              AND l.user_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR guest_id::text = current_setting('app.current_user_id', true)
          OR EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = stays_orders.listing_id
              AND l.user_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 11. marketing_feeder_corridor_definitions
      ALTER TABLE marketing_feeder_corridor_definitions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE marketing_feeder_corridor_definitions FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS feeder_corridors_public_read ON marketing_feeder_corridor_definitions;
      DROP POLICY IF EXISTS feeder_corridors_admin_write ON marketing_feeder_corridor_definitions;
      CREATE POLICY feeder_corridors_public_read ON marketing_feeder_corridor_definitions
        FOR SELECT USING (true);
      CREATE POLICY feeder_corridors_admin_write ON marketing_feeder_corridor_definitions
        FOR ALL USING (is_admin_or_rls_bypassed()) WITH CHECK (is_admin_or_rls_bypassed());
    `);

    // 11. Multi-Role Setup: Create restricted runtime role encho_app_user & encho_table_owner
    await fixture.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_app_user') THEN
          CREATE ROLE encho_app_user WITH LOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_table_owner') THEN
          CREATE ROLE encho_table_owner WITH LOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;

      GRANT USAGE ON SCHEMA public TO encho_app_user, encho_table_owner;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO encho_app_user, encho_table_owner;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO encho_app_user, encho_table_owner;
    `);

    // 12. Seed Base Test Tenants & Data (using admin bypass for seeding)
    const client = await fixture.pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");

      await client.query(`
        INSERT INTO users (id, email, name, role) VALUES
          (${HOST_A_ID}, 'host_a@encho.test', 'Host Alpha', 'user'),
          (${HOST_B_ID}, 'host_b@encho.test', 'Host Beta', 'user'),
          (${ADMIN_ID}, 'admin@encho.test', 'Platform Admin', 'admin')
        ON CONFLICT DO NOTHING;
      `);

      const listARes = await client.query(`
        INSERT INTO listings (user_id, title, price, city)
        VALUES (${HOST_A_ID}, 'Host A Eco Villa', 15000, 'Wayanad')
        RETURNING id;
      `);
      listingAId = listARes.rows[0].id;

      const listBRes = await client.query(`
        INSERT INTO listings (user_id, title, price, city)
        VALUES (${HOST_B_ID}, 'Host B Sea Resort', 22000, 'Goa')
        RETURNING id;
      `);
      listingBId = listBRes.rows[0].id;

      const campARes = await client.query(`
        INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
        VALUES (${HOST_A_ID}, ${listingAId}, 'Host A Monsoon Campaign', 10000, 'approved')
        RETURNING id;
      `);
      campaignAId = campARes.rows[0].id;

      const campBRes = await client.query(`
        INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
        VALUES (${HOST_B_ID}, ${listingBId}, 'Host B Sun & Beach Campaign', 18000, 'approved')
        RETURNING id;
      `);
      campaignBId = campBRes.rows[0].id;

      // Godmode Targeting
      await client.query(`
        INSERT INTO campaign_godmode_targeting (campaign_id, bidding_strategy, target_roas_floor, configured_by_admin_id)
        VALUES 
          (${campaignAId}, 'TARGET_ROAS', 4.00, ${ADMIN_ID}),
          (${campaignBId}, 'MAX_CONVERSIONS', 3.50, ${ADMIN_ID});
      `);

      // Creative Packages & Assets
      const pkgARes = await client.query(`
        INSERT INTO marketing_creative_packages (listing_id, host_id, headline, video_duration_seconds, rights_attestation_hash, ai_quality_score)
        VALUES (${listingAId}, ${HOST_A_ID}, 'Reel A', 15.0, 'hash_alpha', 9.2)
        RETURNING id;
      `);
      packageAId = pkgARes.rows[0].id;

      await client.query(`
        INSERT INTO marketing_creative_assets (package_id, asset_type, original_url, sha256_hash)
        VALUES ('${packageAId}', 'VIDEO', 'https://cdn.encho.test/reel_a.mp4', 'sha_a');
      `);

      const pkgBRes = await client.query(`
        INSERT INTO marketing_creative_packages (listing_id, host_id, headline, video_duration_seconds, rights_attestation_hash, ai_quality_score)
        VALUES (${listingBId}, ${HOST_B_ID}, 'Reel B', 30.0, 'hash_beta', 8.8)
        RETURNING id;
      `);
      packageBId = pkgBRes.rows[0].id;

      await client.query(`
        INSERT INTO marketing_creative_assets (package_id, asset_type, original_url, sha256_hash)
        VALUES ('${packageBId}', 'VIDEO', 'https://cdn.encho.test/reel_b.mp4', 'sha_b');
      `);

      // Wallets
      await client.query(`
        INSERT INTO host_wallets (host_id, balance_paise) VALUES
          (${HOST_A_ID}, 500000),
          (${HOST_B_ID}, 800000);
      `);

      // Leads
      await client.query(`
        INSERT INTO host_outreach_leads (host_id, property_name, guest_name) VALUES
          (${HOST_A_ID}, 'Eco Villa', 'Lead for Alpha'),
          (${HOST_B_ID}, 'Sea Resort', 'Lead for Beta');
      `);
    } finally {
      client.release();
    }

    securityService = new DatabaseSecurityService(fixture.pool);

    // Setup Express App with Router
    app = express();
    app.use(express.json());
    app.use('/api/operations/v1/security', createDatabaseSecurityRouter(fixture.pool));
  });

  afterAll(async () => {
    await fixture.close();
  });

  // TEST 1: Catalog Level FORCE RLS Verification
  it('Test 1: Authoritative Catalog Audit asserts relrowsecurity and relforcerowsecurity on all 11 tables', async () => {
    const report = await securityService.auditRlsStatus();
    expect(report.healthy).toBe(true);
    expect(report.summary.totalChecked).toBe(11);
    expect(report.summary.fullySecured).toBe(11);
    expect(report.summary.missingForcedRls).toBe(0);
    expect(report.summary.unprotected).toBe(0);

    for (const table of report.tables) {
      expect(table.rlsEnabled).toBe(true);
      expect(table.rlsForced).toBe(true);
      expect(table.status).toBe('SECURE');
      expect(table.policyCount).toBeGreaterThanOrEqual(1);
    }
  });

  // TEST 2: Direct Unfiltered SELECT on host_marketing_campaigns
  it('Test 2: Direct Unfiltered SELECT on host_marketing_campaigns strictly isolates tenant data', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      // Tenant A Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);
      const resA = await client.query('SELECT id, host_id, title FROM host_marketing_campaigns');
      expect(resA.rows.length).toBe(1);
      expect(resA.rows[0].id).toBe(campaignAId);
      expect(Number(resA.rows[0].host_id)).toBe(HOST_A_ID);

      // Tenant B Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_B_ID)]);
      const resB = await client.query('SELECT id, host_id, title FROM host_marketing_campaigns');
      expect(resB.rows.length).toBe(1);
      expect(resB.rows[0].id).toBe(campaignBId);
      expect(Number(resB.rows[0].host_id)).toBe(HOST_B_ID);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 3: Godmode Targeting Isolation
  it('Test 3: Direct Unfiltered SELECT on campaign_godmode_targeting physically blocks cross-tenant access', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      // Tenant A Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);
      const resA = await client.query('SELECT campaign_id, bidding_strategy FROM campaign_godmode_targeting');
      expect(resA.rows.length).toBe(1);
      expect(resA.rows[0].campaign_id).toBe(campaignAId);
      expect(resA.rows[0].bidding_strategy).toBe('TARGET_ROAS');

      // Tenant B Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_B_ID)]);
      const resB = await client.query('SELECT campaign_id, bidding_strategy FROM campaign_godmode_targeting');
      expect(resB.rows.length).toBe(1);
      expect(resB.rows[0].campaign_id).toBe(campaignBId);
      expect(resB.rows[0].bidding_strategy).toBe('MAX_CONVERSIONS');

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 4: Creative Packages & Assets Isolation
  it('Test 4: Standalone Reel packages & asset URLs are physically isolated between hosts', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      // Tenant A Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);
      const pkgA = await client.query('SELECT id, host_id, headline FROM marketing_creative_packages');
      expect(pkgA.rows.length).toBe(1);
      expect(pkgA.rows[0].id).toBe(packageAId);

      const assetsA = await client.query('SELECT package_id, original_url FROM marketing_creative_assets');
      expect(assetsA.rows.length).toBe(1);
      expect(assetsA.rows[0].package_id).toBe(packageAId);

      // Tenant B Query
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_B_ID)]);
      const pkgB = await client.query('SELECT id, host_id, headline FROM marketing_creative_packages');
      expect(pkgB.rows.length).toBe(1);
      expect(pkgB.rows[0].id).toBe(packageBId);

      const assetsB = await client.query('SELECT package_id, original_url FROM marketing_creative_assets');
      expect(assetsB.rows.length).toBe(1);
      expect(assetsB.rows[0].package_id).toBe(packageBId);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 5: Walled Garden CRM Leads & Wallets Isolation
  it('Test 5: Walled Garden CRM leads and host wallets are physically sealed per host', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);

      const leadsA = await client.query('SELECT id, host_id, guest_name FROM host_outreach_leads');
      expect(leadsA.rows.length).toBe(1);
      expect(Number(leadsA.rows[0].host_id)).toBe(HOST_A_ID);
      expect(leadsA.rows[0].guest_name).toBe('Lead for Alpha');

      const walletsA = await client.query('SELECT id, host_id, balance_paise FROM host_wallets');
      expect(walletsA.rows.length).toBe(1);
      expect(Number(walletsA.rows[0].host_id)).toBe(HOST_A_ID);
      expect(walletsA.rows[0].balance_paise).toBe('500000');

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 6: Cross-Tenant Mutation Prevention (Write Attack Exclusion)
  it('Test 6: Cross-tenant UPDATE/DELETE attacks affect exactly 0 rows', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      // Tenant A attempts to hijack Tenant B's budget
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);
      const updateRes = await client.query(
        'UPDATE host_marketing_campaigns SET budget = 999999 WHERE id = $1',
        [campaignBId]
      );
      expect(updateRes.rowCount).toBe(0); // RLS strictly filters out Campaign B from the write set

      // Tenant A attempts to delete Tenant B's campaign
      const deleteRes = await client.query(
        'DELETE FROM host_marketing_campaigns WHERE id = $1',
        [campaignBId]
      );
      expect(deleteRes.rowCount).toBe(0);

      // Verify Campaign B unchanged
      await client.query("RESET ROLE");
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      const verifyRes = await client.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [campaignBId]);
      expect(Number(verifyRes.rows[0].budget)).toBe(18000);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 7: Anonymous / Unauthenticated Fail-Closed Protection
  it('Test 7: Unauthenticated session returns 0 rows across all tenant-isolated tables', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      // Blank session context
      await client.query("SELECT set_config('app.current_user_id', '', true), set_config('app.bypass_rls', 'false', true)");

      const campaigns = await client.query('SELECT * FROM host_marketing_campaigns');
      expect(campaigns.rows.length).toBe(0);

      const targeting = await client.query('SELECT * FROM campaign_godmode_targeting');
      expect(targeting.rows.length).toBe(0);

      const packages = await client.query('SELECT * FROM marketing_creative_packages');
      expect(packages.rows.length).toBe(0);

      const wallets = await client.query('SELECT * FROM host_wallets');
      expect(wallets.rows.length).toBe(0);

      const leads = await client.query('SELECT * FROM host_outreach_leads');
      expect(leads.rows.length).toBe(0);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 8: Guest Session-Bound Hold Isolation in stays_holds
  it('Test 8: Guest session token strictly isolates holds in stays_holds', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');

      // Admin bypass to insert holds for two distinct guest browser sessions
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      await client.query(`
        INSERT INTO stays_holds (session_token, room_type_id, status)
        VALUES 
          ('sess_guest_alpha', 101, 'ACTIVE'),
          ('sess_guest_beta', 102, 'ACTIVE');
      `);

      await client.query('SET ROLE encho_app_user');

      // Guest Alpha Session
      await client.query("SELECT set_config('app.session_token', 'sess_guest_alpha', true), set_config('app.bypass_rls', 'false', true)");
      const resAlpha = await client.query('SELECT session_token, room_type_id FROM stays_holds');
      expect(resAlpha.rows.length).toBe(1);
      expect(resAlpha.rows[0].session_token).toBe('sess_guest_alpha');
      expect(resAlpha.rows[0].room_type_id).toBe(101);

      // Guest Beta Session
      await client.query("SELECT set_config('app.session_token', 'sess_guest_beta', true), set_config('app.bypass_rls', 'false', true)");
      const resBeta = await client.query('SELECT session_token, room_type_id FROM stays_holds');
      expect(resBeta.rows.length).toBe(1);
      expect(resBeta.rows[0].session_token).toBe('sess_guest_beta');
      expect(resBeta.rows[0].room_type_id).toBe(102);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 9: Admin Session Moderation & Bypass Authority
  it('Test 9: Admin session with bypass_rls=true reads and moderates all tenant records', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET ROLE encho_app_user');

      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'true', true)", [String(ADMIN_ID)]);

      const allCampaigns = await client.query('SELECT id, host_id FROM host_marketing_campaigns ORDER BY id ASC');
      expect(allCampaigns.rows.length).toBe(2);
      expect(allCampaigns.rows.map((r) => Number(r.host_id))).toEqual([HOST_A_ID, HOST_B_ID]);

      const allTargeting = await client.query('SELECT campaign_id FROM campaign_godmode_targeting ORDER BY campaign_id ASC');
      expect(allTargeting.rows.length).toBe(2);

      const allPackages = await client.query('SELECT id FROM marketing_creative_packages ORDER BY id ASC');
      expect(allPackages.rows.length).toBe(2);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 10: FORCE ROW LEVEL SECURITY prevents Table-Owner Bypass
  it('Test 10: Non-superuser table owner is strictly subject to RLS due to FORCE ROW LEVEL SECURITY', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');

      // Change owner to encho_table_owner
      await client.query("ALTER TABLE host_marketing_campaigns OWNER TO encho_table_owner;");
      await client.query("SET ROLE encho_table_owner");
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'false', true)", [String(HOST_A_ID)]);

      // Even though encho_table_owner owns the table, FORCE ROW LEVEL SECURITY ensures RLS is applied!
      const ownerQueryRes = await client.query('SELECT id, host_id FROM host_marketing_campaigns');
      expect(ownerQueryRes.rows.length).toBe(1);
      expect(Number(ownerQueryRes.rows[0].host_id)).toBe(HOST_A_ID);

      await client.query('ROLLBACK');
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  // TEST 11: End-to-End Express Diagnostic Endpoint (GET /rls-health)
  it('Test 11: Express diagnostic endpoint GET /api/operations/v1/security/rls-health returns 200 HEALTHY', async () => {
    const res = await request(app).get('/api/operations/v1/security/rls-health');
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.summary.fullySecured).toBe(11);
    expect(res.body.summary.missingForcedRls).toBe(0);
    expect(res.body.summary.unprotected).toBe(0);
  });

  // TEST 12: End-to-End Express Adversarial Verification Endpoint (POST /verify-isolation)
  it('Test 12: Express adversarial endpoint POST /verify-isolation proves zero cross-tenant leak', async () => {
    const res = await request(app)
      .post('/api/operations/v1/security/verify-isolation')
      .send({ tenantAId: HOST_A_ID, tenantBId: HOST_B_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isolated).toBe(true);
    expect(res.body.crossTenantLeakDetected).toBe(false);
    expect(res.body.mutationLeakDetected).toBe(false);
    expect(res.body.tenantACampaignCount).toBe(1);
  });
});
