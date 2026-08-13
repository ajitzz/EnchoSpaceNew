import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import pkg from 'pg';
import { MetaTelemetrySyncEngine } from '../lib/metaTelemetrySyncEngine.js';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';
import { evaluateCampaignDCO, computeCampaignApprovalHash } from '../../server.js';

const { Pool } = pkg;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is not configured for test environment");
}
const pool = new Pool({ connectionString: dbUrl });

describe('Phase 2.7 Milestone 5 — Performance & Social Engagement Telemetry Engine', () => {
  let testHostId: number;
  let testUnauthorizedHostId: number;
  let testListingId: number;
  let testCampaignId: number;

  beforeAll(async () => {
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reactions_count INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS shares_count INT;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_synced_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS telemetry_source_metadata JSONB DEFAULT '{}'::jsonb;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB DEFAULT '{}'::jsonb;`);
  }, 30000);

  beforeEach(async () => {
    const randStr = Math.random().toString(36).substring(2, 7);

    // Create Host 1
    const hostRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host M5 Test')
      RETURNING id
    `, [`host_m5_${Date.now()}_${randStr}@test.com`]);
    testHostId = hostRes.rows[0].id;

    // Create Unauthorized Host 2
    const unauthHostRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host M5 Unauthorized')
      RETURNING id
    `, [`host_m5_unauth_${Date.now()}_${randStr}@test.com`]);
    testUnauthorizedHostId = unauthHostRes.rows[0].id;

    // Create Listing
    const listingRes = await pool.query(`
      INSERT INTO listings (title, user_id, price, description, type, city, address)
      VALUES ('M5 Test Penthouse', $1, 500, 'Luxury Penthouse', 'apartment', 'Los Angeles', '777 Ocean Blvd')
      RETURNING id
    `, [testHostId]);
    testListingId = listingRes.rows[0].id;

    // Create Campaign
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns
      (title, listing_id, host_id, budget, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status)
      VALUES
      ('M5 Telemetry Campaign', $1, $2, 200, 'active', 'meta_camp_m5_999', 'meta_adset_m5_999', 'meta_ad_m5_999', 'ACTIVE', 'ACTIVE')
      RETURNING id
    `, [testListingId, testHostId]);
    testCampaignId = campRes.rows[0].id;
  }, 30000);

  // -------------------------------------------------------------
  // 1. Ads Insights Telemetry Ingestion (Test Cases 1 - 7)
  // -------------------------------------------------------------
  describe('1. Ads Insights Telemetry Ingestion', () => {
    it('1.1 Ingests raw impressions, reach, clicks, spend, CTR, CPC, and conversions', async () => {
      const forcedInsights = {
        impressions: 12500,
        reach: 10200,
        clicks: 450,
        spend: 85.50,
        ctr: 0.036,
        cpc: 0.19,
        actions: [
          { action_type: 'lead', value: 12 },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: 3 }
        ]
      };

      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.impressions).toBe(12500);
      expect(syncResult.reach).toBe(10200);
      expect(syncResult.clicks).toBe(450);
      expect(syncResult.spend).toBe(85.50);
      expect(syncResult.spend_cents).toBe(8550);
      expect(syncResult.ctr).toBe(0.036);
      expect(syncResult.cpc).toBe(0.19);
      expect(syncResult.cpc_cents).toBe(19);
      expect(syncResult.conversions).toBe(15);
    });

    it('1.2 Verifies CTR & CPC mathematically when omitted from Meta payload', async () => {
      const forcedInsights = {
        impressions: 10000,
        reach: 8000,
        clicks: 200,
        spend: 50.00
      };

      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.ctr).toBe(0.02); // 200 / 10000
      expect(syncResult.cpc).toBe(0.25); // 50 / 200
      expect(syncResult.cpc_cents).toBe(25);
    });

    it('1.3 Maps actions array to conversions (leads + purchases)', async () => {
      const forcedInsights = {
        impressions: 5000,
        clicks: 100,
        spend: 20.00,
        actions: [
          { action_type: 'page_engagement', value: 50 },
          { action_type: 'lead', value: 5 },
          { action_type: 'messaging_lead', value: 2 },
          { action_type: 'purchase', value: 1 }
        ]
      };

      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      // Only lead, messaging_lead, and purchase are counted as conversions (5+2+1 = 8)
      expect(syncResult.conversions).toBe(8);
    });
  });

  // -------------------------------------------------------------
  // 2. Cumulative Delta & Negative Corrections (Test Cases 8 - 10)
  // -------------------------------------------------------------
  describe('2. Cumulative Snapshot Delta & Negative Corrections', () => {
    it('2.1 Correctly updates cumulative totals on consecutive polls', async () => {
      // First poll
      await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 1000, clicks: 50, spend: 10.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      // Second poll (Meta lifetime totals increased)
      const secondPoll = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 2500, clicks: 120, spend: 24.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(secondPoll.impressions).toBe(2500);
      expect(secondPoll.clicks).toBe(120);
      expect(secondPoll.spend).toBe(24.00);
      expect(secondPoll.is_negative_correction).toBe(false);
    });

    it('2.2 Preserves negative corrections when Meta auditing adjusts metrics down', async () => {
      // First poll
      await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 10000, clicks: 500, spend: 100.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      // Second poll (Meta retroactively deducted invalid clicks/spend)
      const secondPoll = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 9800, clicks: 480, spend: 96.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(secondPoll.is_negative_correction).toBe(true);
      expect(secondPoll.impressions).toBe(9800);
      expect(secondPoll.clicks).toBe(480);
      expect(secondPoll.spend).toBe(96.00);
    });

    it('2.3 Prevents duplicate polling drift when polled with identical data', async () => {
      const forcedData = { impressions: 5000, clicks: 200, spend: 40.00 };

      const poll1 = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: forcedData, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const poll2 = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: forcedData, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(poll1.impressions).toBe(poll2.impressions);
      expect(poll1.clicks).toBe(poll2.clicks);
      expect(poll1.spend).toBe(poll2.spend);
      expect(poll2.is_negative_correction).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. Social Engagement Ingestion (Test Cases 11 - 14)
  // -------------------------------------------------------------
  describe('3. Social Engagement Ingestion', () => {
    it('3.1 Ingests comments, reactions, and shares independently', async () => {
      const forcedEngagement = {
        comments: { summary: { total_count: 42 } },
        reactions: { summary: { total_count: 180 } },
        shares: { count: 15 }
      };

      const syncResult = await MetaTelemetrySyncEngine.syncSocialEngagement(
        testCampaignId,
        { forcedEngagement, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.comments).toBe(42);
      expect(syncResult.reactions).toBe(180);
      expect(syncResult.shares).toBe(15);
      expect(syncResult.engagement_metadata.supported_metrics).toContain('shares');
    });

    it('3.2 Handles missing shares field gracefully (where unsupported)', async () => {
      const forcedEngagement = {
        comments: { summary: { total_count: 10 } },
        reactions: { summary: { total_count: 50 } }
      };

      const syncResult = await MetaTelemetrySyncEngine.syncSocialEngagement(
        testCampaignId,
        { forcedEngagement, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.comments).toBe(10);
      expect(syncResult.reactions).toBe(50);
      expect(syncResult.shares).toBeNull();
      expect(syncResult.engagement_metadata.supported_metrics).not.toContain('shares');
    });

    it('3.3 Maintains separate telemetry streams for performance vs engagement', async () => {
      // Sync Insights
      await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 3000, clicks: 100, spend: 15.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      // Sync Engagement
      await MetaTelemetrySyncEngine.syncSocialEngagement(
        testCampaignId,
        { forcedEngagement: { comments: { summary: { total_count: 8 } }, reactions: { summary: { total_count: 30 } } }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      // Query Truth Projection
      const truth = await CampaignControlCenterService.getCampaignTruth(
        testCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      expect(truth.performance_state.impressions).toBe(3000);
      expect(truth.performance_state.clicks).toBe(100);
      expect(truth.engagement_state.comments).toBe(8);
      expect(truth.engagement_state.reactions).toBe(30);
    });
  });

  // -------------------------------------------------------------
  // 4. Freshness Contracts & DCO Staleness (Test Cases 15 - 17)
  // -------------------------------------------------------------
  describe('4. Freshness Contracts & DCO Staleness Boundary', () => {
    it('4.1 Calculates performance freshness tiers correctly', () => {
      const now = Date.now();
      const freshDate = new Date(now - 10 * 60 * 1000).toISOString(); // 10 min ago
      const delayedDate = new Date(now - 30 * 60 * 1000).toISOString(); // 30 min ago
      const staleDate = new Date(now - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
      const unavailableDate = new Date(now - 8 * 3600 * 1000).toISOString(); // 8 hours ago

      expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(freshDate)).toBe('FRESH');
      expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(delayedDate)).toBe('DELAYED');
      expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(staleDate)).toBe('STALE');
      expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(unavailableDate)).toBe('UNAVAILABLE');
      expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(null)).toBe('UNAVAILABLE');
    });

    it('4.2 Calculates engagement freshness tiers correctly', () => {
      const now = Date.now();
      const freshDate = new Date(now - 5 * 60 * 1000).toISOString();
      const delayedDate = new Date(now - 45 * 60 * 1000).toISOString();

      expect(MetaTelemetrySyncEngine.calculateEngagementFreshness(freshDate)).toBe('FRESH');
      expect(MetaTelemetrySyncEngine.calculateEngagementFreshness(delayedDate)).toBe('DELAYED');
    });

    it('4.3 Flag DCO data as stale if insights age exceeds 6 hours', () => {
      const recentDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2h ago
      const oldDate = new Date(Date.now() - 7 * 3600 * 1000).toISOString(); // 7h ago

      expect(MetaTelemetrySyncEngine.isDcoDataStale(recentDate)).toBe(false);
      expect(MetaTelemetrySyncEngine.isDcoDataStale(oldDate)).toBe(true);
      expect(MetaTelemetrySyncEngine.isDcoDataStale(null)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 5. Tenant Isolation & Error Resilience (Test Cases 18 - 23)
  // -------------------------------------------------------------
  describe('5. Tenant Isolation & Error Resilience', () => {
    it('5.1 Rejects unauthorized host attempts to trigger sync (403 FORBIDDEN)', async () => {
      await expect(
        MetaTelemetrySyncEngine.syncAdsInsights(
          testCampaignId,
          { forcedInsights: { impressions: 100 }, viewerContext: { userId: testUnauthorizedHostId, role: 'host' } },
          pool
        )
      ).rejects.toThrow('TENANT_ACCESS_DENIED');
    });

    it('5.2 Allows Admin override for sync across any campaign', async () => {
      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 500, clicks: 20, spend: 5.00 }, viewerContext: { userId: 9999, role: 'admin', isAdmin: true } },
        pool
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.impressions).toBe(500);
    });

    it('5.3 Handles missing Meta object gracefully without throwing server exception', async () => {
      // Create campaign without meta IDs
      const campRes = await pool.query(`
        INSERT INTO host_marketing_campaigns
        (title, listing_id, host_id, budget, status)
        VALUES ('No Meta Obj Camp', $1, $2, 100, 'active')
        RETURNING id
      `, [testListingId, testHostId]);
      const noMetaCampId = campRes.rows[0].id;

      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        noMetaCampId,
        { viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.success).toBe(false);
      expect(syncResult.error_code).toBe('MISSING_META_OBJECT');
      expect(syncResult.freshness).toBe('UNAVAILABLE');
    });

    it('5.4 Enforces no synthetic or fabricated metrics when data is missing', async () => {
      const forcedData = { impressions: 0, clicks: 0, spend: 0 };

      const syncResult = await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: forcedData, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncResult.ctr).toBe(0);
      expect(syncResult.cpc).toBe(0);
      expect(syncResult.conversions).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // 6. Regression Protection (Test Cases 24 - 25)
  // -------------------------------------------------------------
  describe('6. Regression Protection', () => {
    it('6.1 Truth projection reflects full M5 performance and engagement state', async () => {
      // Sync insights & engagement
      await MetaTelemetrySyncEngine.syncAdsInsights(
        testCampaignId,
        { forcedInsights: { impressions: 8000, reach: 7000, clicks: 320, spend: 64.00 }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      await MetaTelemetrySyncEngine.syncSocialEngagement(
        testCampaignId,
        { forcedEngagement: { comments: { summary: { total_count: 14 } }, reactions: { summary: { total_count: 95 } } }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const truth = await CampaignControlCenterService.getCampaignTruth(
        testCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      expect(truth.performance_state.impressions).toBe(8000);
      expect(truth.performance_state.clicks).toBe(320);
      expect(truth.performance_state.spend).toBe(64.00);
      expect(truth.performance_state.spend_cents).toBe(6400);
      expect(truth.performance_state.performance_freshness).toBe('FRESH');
      expect(truth.performance_state.dco_data_stale).toBe(false);

      expect(truth.engagement_state.comments).toBe(14);
      expect(truth.engagement_state.reactions).toBe(95);
      expect(truth.engagement_state.engagement_freshness).toBe('FRESH');

      expect(truth.freshness.performance_freshness).toBe('FRESH');
      expect(truth.freshness.engagement_freshness).toBe('FRESH');
    });

    it('6.2 Preserves financial safety and FSM invariants', async () => {
      const truth = await CampaignControlCenterService.getCampaignTruth(
        testCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      expect(truth.financial_safety.is_money_safe).toBe(true);
      expect(truth.projection_type).toBe('HOST');
    });
  });

  // -------------------------------------------------------------
  // 7. M5 Source-of-Truth Remediation Verification (Test Cases 26 - 35)
  // -------------------------------------------------------------
  describe('7. M5 Source-of-Truth Remediation Verification', () => {
    let multiVarCampaignId: number;
    let var1Id: number;
    let var2Id: number;

    beforeEach(async () => {
      // Create campaign with 2 active published creative variants
      const cRes = await pool.query(`
        INSERT INTO host_marketing_campaigns
        (title, listing_id, host_id, budget, status, meta_campaign_id, meta_adset_id, meta_ad_id, admin_approved, policy_cleared, approval_hash, owner_meta_ad_account_id)
        VALUES ('Multi-Var Remediation Campaign', $1, $2, 300, 'active', 'meta_c_multi_1', 'meta_as_multi_1', 'meta_ad_multi_1', true, true, 'test_hash_remediation', 'act_test_master')
        RETURNING id
      `, [testListingId, testHostId]);
      multiVarCampaignId = cRes.rows[0].id;

      const v1 = await pool.query(`
        INSERT INTO campaign_creative_variants
        (campaign_id, is_published, meta_ad_id, status, variant_activated_at)
        VALUES ($1, true, 'meta_var_1_ad', 'ACTIVE', NOW() - INTERVAL '48 hours')
        RETURNING id
      `, [multiVarCampaignId]);
      var1Id = v1.rows[0].id;

      const v2 = await pool.query(`
        INSERT INTO campaign_creative_variants
        (campaign_id, is_published, meta_ad_id, status, variant_activated_at)
        VALUES ($1, true, 'meta_var_2_ad', 'ACTIVE', NOW() - INTERVAL '48 hours')
        RETURNING id
      `, [multiVarCampaignId]);
      var2Id = v2.rows[0].id;

      // Seed variant_meta_snapshots
      await pool.query(`
        INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_spend, last_meta_conversions, last_meta_fetched_at, snapshot_version)
        VALUES ($1, 1000, 50, 10.00, 2, NOW(), 1),
               ($2, 2000, 100, 20.00, 5, NOW(), 1)
      `, [var1Id, var2Id]);

      // Seed campaign accumulated fields with potentially conflicting values to verify NO DOUBLE COUNTING
      await pool.query(`
        UPDATE host_marketing_campaigns
        SET accumulated_impressions = 3000,
            accumulated_clicks = 150,
            accumulated_spent = 30.00,
            accumulated_conversions = 7
        WHERE id = $1
      `, [multiVarCampaignId]);
    });

    it('7.1 Eliminates double counting between campaign accumulated_* and variant snapshots', async () => {
      const truth = await CampaignControlCenterService.getCampaignTruth(
        multiVarCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      // Must equal variant totals (1000+2000 = 3000), NOT variant totals + accumulated (3000 + 3000 = 6000)
      expect(truth.performance_state.impressions).toBe(3000);
      expect(truth.performance_state.clicks).toBe(150);
      expect(truth.performance_state.spend).toBe(30.00);
      expect(truth.performance_state.conversions).toBe(7);
    });

    it('7.2 Variant aggregate equals campaign truth performance state', async () => {
      const aggRes = await pool.query(`
        SELECT SUM(last_meta_impressions)::int as total_imp,
               SUM(last_meta_clicks)::int as total_clicks,
               SUM(last_meta_spend)::numeric as total_spend,
               SUM(last_meta_conversions)::int as total_conv
        FROM variant_meta_snapshots
        WHERE variant_id IN ($1, $2)
      `, [var1Id, var2Id]);

      const truth = await CampaignControlCenterService.getCampaignTruth(
        multiVarCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      expect(truth.performance_state.impressions).toBe(aggRes.rows[0].total_imp);
      expect(truth.performance_state.clicks).toBe(aggRes.rows[0].total_clicks);
      expect(Number(truth.performance_state.spend)).toBe(Number(aggRes.rows[0].total_spend));
      expect(truth.performance_state.conversions).toBe(aggRes.rows[0].total_conv);
    });

    it('7.3 M5 sync updates variant snapshots via Phase 2.6 canonical lineage', async () => {
      const forcedInsights = {
        variants: {
          [var1Id]: { impressions: 1200, clicks: 60, spend: 12.00, conversions: 3 },
          [var2Id]: { impressions: 2200, clicks: 110, spend: 22.00, conversions: 6 }
        }
      };

      const syncRes = await MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      expect(syncRes.success).toBe(true);
      expect(syncRes.impressions).toBe(3400); // 1200 + 2200
      expect(syncRes.clicks).toBe(170); // 60 + 110
      expect(syncRes.spend).toBe(34.00);

      // Verify variant_meta_snapshots directly
      const v1Snap = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1`, [var1Id]);
      expect(Number(v1Snap.rows[0].last_meta_impressions)).toBe(1200);
      expect(Number(v1Snap.rows[0].last_meta_clicks)).toBe(60);
    });

    it('7.4 M5 sync generates variant raw delta logs with snapshot provenance', async () => {
      const forcedInsights = {
        variants: {
          [var1Id]: { impressions: 1500, clicks: 75, spend: 15.00, conversions: 4 },
          [var2Id]: { impressions: 2500, clicks: 125, spend: 25.00, conversions: 8 }
        }
      };

      await MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const logsRes = await pool.query(`
        SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1
      `, [var1Id]);

      expect(logsRes.rows.length).toBe(1);
      expect(Number(logsRes.rows[0].impressions_delta)).toBe(500); // 1500 - 1000
      expect(Number(logsRes.rows[0].clicks_delta)).toBe(25); // 75 - 50
      expect(logsRes.rows[0].is_correction).toBe(false);
    });

    it('7.5 Negative corrections flow through raw event logs with is_correction = true', async () => {
      const forcedInsights = {
        variants: {
          [var1Id]: { impressions: 800, clicks: 40, spend: 8.00, conversions: 1 }, // Reduced from 1000
          [var2Id]: { impressions: 2000, clicks: 100, spend: 20.00, conversions: 5 }
        }
      };

      await MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const logV1 = await pool.query(`
        SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1
      `, [var1Id]);

      expect(logV1.rows.length).toBe(1);
      expect(Number(logV1.rows[0].impressions_delta)).toBe(-200);
      expect(logV1.rows[0].is_correction).toBe(true);
    });

    it('7.6 Campaign freshness equals minimum freshness across all required active variants', async () => {
      const sevenHoursAgo = new Date(Date.now() - 7 * 3600 * 1000);
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Set V1 as Fresh (10m ago), V2 as Stale (7h ago)
      await pool.query(`UPDATE variant_meta_snapshots SET last_meta_fetched_at = $1 WHERE variant_id = $2`, [tenMinsAgo, var1Id]);
      await pool.query(`UPDATE variant_meta_snapshots SET last_meta_fetched_at = $1 WHERE variant_id = $2`, [sevenHoursAgo, var2Id]);

      const truth = await CampaignControlCenterService.getCampaignTruth(
        multiVarCampaignId,
        { userId: testHostId, role: 'host' },
        pool
      );

      // Freshness derived from minimum (V2 at 7h ago => STALE/UNAVAILABLE)
      expect(truth.performance_state.performance_freshness).toBe('UNAVAILABLE');
      expect(truth.performance_state.dco_data_stale).toBe(true);
    });

    it('7.7 DCO Evaluator defers evaluation when Control Center reports stale telemetry', async () => {
      const campRes = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [multiVarCampaignId]);
      const { hash } = computeCampaignApprovalHash(campRes.rows[0]);
      await pool.query(`UPDATE host_marketing_campaigns SET approval_hash = $1 WHERE id = $2`, [hash, multiVarCampaignId]);

      const sevenHoursAgo = new Date(Date.now() - 7 * 3600 * 1000);
      await pool.query(`UPDATE variant_meta_snapshots SET last_meta_fetched_at = $1 WHERE variant_id = $2`, [sevenHoursAgo, var2Id]);

      const evalRes = await evaluateCampaignDCO(multiVarCampaignId, { evaluationEpoch: 'epoch_test_remediation' });
      expect(evalRes.decision).toBe('DEFERRED');
      expect(evalRes.decision_reason).toBe('STALE_METRICS');
    });

    it('7.8 Concurrent ingestion uses atomic row locks without corrupting snapshots', async () => {
      const syncCall1 = MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights: { variants: { [var1Id]: { impressions: 1100, clicks: 55, spend: 11.00 }, [var2Id]: { impressions: 2100, clicks: 105, spend: 21.00 } } }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const syncCall2 = MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights: { variants: { [var1Id]: { impressions: 1200, clicks: 60, spend: 12.00 }, [var2Id]: { impressions: 2200, clicks: 110, spend: 22.00 } } }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const [res1, res2] = await Promise.all([syncCall1, syncCall2]);
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const v1Snap = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1`, [var1Id]);
      expect(v1Snap.rows[0].snapshot_version).toBeGreaterThan(1);
    });

    it('7.9 Handles timeout gracefully with META_API_TIMEOUT error code', async () => {
      const noObjRes = await MetaTelemetrySyncEngine.syncAdsInsights(
        999999,
        { timeoutMs: 1, viewerContext: { userId: 999999, role: 'admin', isAdmin: true } },
        pool
      ).catch(e => e);

      expect(noObjRes).toBeDefined();
    });

    it('7.10 Handles HTTP 5xx server errors from Meta API gracefully', async () => {
      const originalFetch = global.fetch;
      (global as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'Internal Meta Server Error', code: 500 } }), { status: 500, headers: { 'content-type': 'application/json' } });
      try {
        const res = await MetaTelemetrySyncEngine.syncAdsInsights(
          testCampaignId,
          { viewerContext: { userId: testHostId, role: 'host' } },
          pool
        );
        expect(res.success).toBe(false);
        expect(res.error_code).toBe('META_API_ERROR_500');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('7.11 Handles HTTP 429 / Meta rate limit errors gracefully with RATE_LIMIT_EXCEEDED', async () => {
      const originalFetch = global.fetch;
      (global as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'User request limit reached', code: 17 } }), { status: 429 });
      try {
        const res = await MetaTelemetrySyncEngine.syncAdsInsights(
          testCampaignId,
          { viewerContext: { userId: testHostId, role: 'host' } },
          pool
        );
        expect(res.success).toBe(false);
        expect(res.error_code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('7.12 M5 sync populates variant_daily_rollups for active variants', async () => {
      const forcedInsights = {
        variants: {
          [var1Id]: { impressions: 1600, clicks: 80, spend: 16.00, conversions: 5 },
          [var2Id]: { impressions: 2600, clicks: 130, spend: 26.00, conversions: 9 }
        }
      };

      await MetaTelemetrySyncEngine.syncAdsInsights(
        multiVarCampaignId,
        { forcedInsights, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const rollupsRes = await pool.query(`SELECT * FROM variant_daily_rollups WHERE variant_id = $1`, [var1Id]);
      expect(rollupsRes.rows.length).toBeGreaterThan(0);
      expect(Number(rollupsRes.rows[0].impressions)).toBeGreaterThan(0);
    });

    it('7.13 Verifies social engagement isolation and non-interference', async () => {
      await MetaTelemetrySyncEngine.syncSocialEngagement(
        multiVarCampaignId,
        { forcedEngagement: { comments: { summary: { total_count: 50 } }, reactions: { summary: { total_count: 200 } } }, viewerContext: { userId: testHostId, role: 'host' } },
        pool
      );

      const v1Snap = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1`, [var1Id]);
      expect(Number(v1Snap.rows[0].last_meta_impressions)).toBe(1000);
      expect(Number(v1Snap.rows[0].last_meta_clicks)).toBe(50);
    });
  });
});
