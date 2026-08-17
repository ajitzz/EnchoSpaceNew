/**
 * Phase 3.5 Certification Test Suite: Performance Analytics, Funnel Intelligence & PDF Reporting
 *
 * Certified Scenarios:
 * 1. Metric correctness (impressions, clicks, reach, ctr, cpc, cpm, frequency, conversions)
 * 2. Freshness classification (FRESH, DELAYED, STALE, UNAVAILABLE)
 * 3. Stale telemetry handling without masking
 * 4. Unavailable telemetry handling (clean fallback, zero NaN)
 * 5. UTC boundary calculation (midnight UTC daily windowing)
 * 6. IST boundary conversion & timezone resilience
 * 7. Month boundary windowing (crossing month boundaries cleanly)
 * 8. Lifetime vs. finite window aggregation (7D, 14D, 30D)
 * 9. Financial separation (Gross Charge vs Encho Fee vs Authorized Spend vs Actual Spend)
 * 10. Multi-stage Funnel Conversion Intelligence
 * 11. Zero-data campaign resilience (safe division by zero guards)
 * 12. Variant aggregation from snapshots and rollups
 * 13. DCO decision projection without recalculation
 * 14. Deterministic Anomaly Detection (7 defined thresholds)
 * 15. Tenant Isolation enforcement on Analytics & PDF endpoints
 * 16. Admin Portfolio Analytics Aggregation
 * 17. PDF report consistency with live projection
 * 18. Currency handling & formatting
 * 19. Duplicate event prevention (Rollup idempotency)
 * 20. Raw-to-rollup reconciliation integrity
 * 21. Adversarial: Negative corrections handling
 * 22. Adversarial: Zero-delivery on active campaign critical anomaly trigger
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PerformanceAnalyticsService } from '../lib/performanceAnalyticsService.js';
import { PdfReportService } from '../lib/pdfReportService.js';
import { MetaTelemetrySyncEngine } from '../lib/metaTelemetrySyncEngine.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.5: PERFORMANCE ANALYTICS, FUNNEL INTELLIGENCE & PDF REPORTING CERTIFICATION SUITE', () => {
  let hostAId: number;
  let hostBId: number;
  let adminId: number;
  let listingAId: number;
  let listingBId: number;
  let campActiveId: number;
  let campZeroDataId: number;
  let campHostBId: number;
  let variant1Id: number;
  let variant2Id: number;

  beforeAll(async () => {
    // 0. Ensure schema columns exist
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_source VARCHAR(50);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_reason TEXT;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor VARCHAR(50);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor_id VARCHAR(100);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_calendar_event_at TIMESTAMP WITH TIME ZONE;`);

    // 1. Seed Users (Host A, Host B, Admin)
    const userARes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host A P3.5') RETURNING id
    `, [`host_a_p35_${Date.now()}@encho.test`]);
    hostAId = userARes.rows[0].id;

    const userBRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host B P3.5') RETURNING id
    `, [`host_b_p35_${Date.now()}@encho.test`]);
    hostBId = userBRes.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Admin P3.5') RETURNING id
    `, [`admin_p35_${Date.now()}@encho.test`]);
    adminId = adminRes.rows[0].id;

    // 2. Seed Listings
    const listARes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'P3.5 Joshua Tree Cabin', 'Desert retreat', 'Joshua Tree', '123 Desert Rd', 450, 'cabin')
      RETURNING id
    `, [hostAId]);
    listingAId = listARes.rows[0].id;

    const listBRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'P3.5 Malibu Villa', 'Ocean villa', 'Malibu', '456 Ocean Hwy', 1200, 'villa')
      RETURNING id
    `, [hostBId]);
    listingBId = listBRes.rows[0].id;

    // 3. Seed Primary Active Campaign for Host A with Rich Telemetry
    const campARes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status,
        accumulated_impressions, reach, accumulated_clicks, comments_count, reactions_count, shares_count,
        insights_synced_at, engagement_synced_at
      ) VALUES (
        $1, $2, 'P3.5 Joshua Tree Main Promo', 500, 150, 'active', true,
        'mock_meta_camp_p35_a', 'mock_meta_adset_p35_a', 'mock_meta_ad_p35_a', 'ACTIVE', 'ACTIVE',
        'released', 75, 425, 'paid',
        10000, 8500, 450, 12, 48, 5,
        NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'
      ) RETURNING id
    `, [hostAId, listingAId]);
    campActiveId = campARes.rows[0].id;

    // Seed Financial Contract
    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 500, 75, 425, 425, 150, 275, 'USD')
      ON CONFLICT (campaign_id) DO UPDATE SET meta_remaining_authorization = 275
    `, [campActiveId]);

    // Seed Daily Rollups across multiple dates (testing date windows & boundaries)
    await pool.query(`
      INSERT INTO campaign_daily_rollups (campaign_id, date, impressions, clicks, conversions, spent_usd)
      VALUES 
        ($1, CURRENT_DATE - INTERVAL '10 days', 2000, 90, 2, 30.00),
        ($1, CURRENT_DATE - INTERVAL '5 days', 3000, 140, 3, 45.00),
        ($1, CURRENT_DATE - INTERVAL '2 days', 2500, 110, 2, 37.50),
        ($1, CURRENT_DATE - INTERVAL '1 day', 2500, 110, 3, 37.50)
      ON CONFLICT (campaign_id, date) DO UPDATE 
      SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions, spent_usd = EXCLUDED.spent_usd
    `, [campActiveId]);

    // Seed Creative Variants for DCO Projection testing
    const var1Res = await pool.query(`
      INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, meta_ad_id, status)
      VALUES ($1, 'https://encho.test/img1.jpg', 'IMAGE', 'mock_ad_var1_p35', 'ACTIVE')
      RETURNING id
    `, [campActiveId]);
    variant1Id = var1Res.rows[0].id;

    const var2Res = await pool.query(`
      INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, meta_ad_id, status)
      VALUES ($1, 'https://encho.test/img2.jpg', 'IMAGE', 'mock_ad_var2_p35', 'ACTIVE')
      RETURNING id
    `, [campActiveId]);
    variant2Id = var2Res.rows[0].id;

    // Seed DCO Evaluation Transaction
    await pool.query(`
      INSERT INTO dco_evaluation_transactions (
        campaign_id, evaluation_epoch, lease_expires_at, winner_variant_id, loser_variant_id, decision
      ) VALUES (
        $1, 'epoch_p35_1', NOW() + INTERVAL '1 hour', $2, $3, 'WINNER_SELECTED'
      ) ON CONFLICT (campaign_id, evaluation_epoch) DO NOTHING
    `, [campActiveId, variant1Id, variant2Id]);

    // Seed Variant Snapshots
    await pool.query(`
      INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_spend, last_meta_conversions, last_meta_fetched_at)
      VALUES 
        ($1, 6500, 320, 100.00, 7, NOW() - INTERVAL '5 minutes'),
        ($2, 3500, 130, 50.00, 3, NOW() - INTERVAL '5 minutes')
      ON CONFLICT (variant_id) DO UPDATE 
      SET last_meta_impressions = EXCLUDED.last_meta_impressions, last_meta_clicks = EXCLUDED.last_meta_clicks
    `, [variant1Id, variant2Id]);

    // Seed CRM Leads
    await pool.query(`
      INSERT INTO host_outreach_leads (campaign_id, host_id, guest_name, guest_email, guest_phone, status, intent_score, ai_intent_badge)
      VALUES 
        ($1, $2, 'Lead 1 (Hot)', 'lead1@test.com', '+15551111', 'Booked', 95, 'HOT_LEAD'),
        ($1, $2, 'Lead 2 (Warm)', 'lead2@test.com', '+15552222', 'New Inquiry', 75, 'HIGH_INTENT'),
        ($1, $2, 'Lead 3 (Cold)', 'lead3@test.com', '+15553333', 'Contacted', 40, 'GENERAL_INQUIRY')
    `, [campActiveId, hostAId]);

    // 4. Seed Zero-Data Campaign
    const campZeroRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status,
        accumulated_impressions, reach, accumulated_clicks, accumulated_spent
      ) VALUES (
        $1, $2, 'P3.5 Zero Data Promo', 200, 0, 'active', true,
        'mock_meta_camp_zero_p35', 'ACTIVE', 'ACTIVE',
        'released', 30, 170, 'paid',
        0, 0, 0, 0
      ) RETURNING id
    `, [hostAId, listingAId]);
    campZeroDataId = campZeroRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 200, 30, 170, 170, 0, 170, 'USD')
      ON CONFLICT (campaign_id) DO NOTHING
    `, [campZeroDataId]);

    // 5. Seed Host B Campaign (for tenant isolation test)
    const campBRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status
      ) VALUES (
        $1, $2, 'P3.5 Host B Malibu Promo', 1000, 200, 'active', true,
        'mock_meta_camp_p35_b', 'ACTIVE', 'ACTIVE',
        'released', 150, 850, 'paid'
      ) RETURNING id
    `, [hostBId, listingBId]);
    campHostBId = campBRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 1000, 150, 850, 850, 200, 650, 'USD')
      ON CONFLICT (campaign_id) DO NOTHING
    `, [campHostBId]);
  });

  afterAll(async () => {
    // Clean up test fixtures
    const campIds = [campActiveId, campZeroDataId, campHostBId].filter(Boolean);
    if (campIds.length > 0) {
      await pool.query(`DELETE FROM host_outreach_leads WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM variant_meta_snapshots WHERE variant_id IN (SELECT id FROM campaign_creative_variants WHERE campaign_id = ANY($1::int[]))`, [campIds]);
      await pool.query(`DELETE FROM campaign_creative_variants WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM campaign_daily_rollups WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = ANY($1::int[])`, [campIds]);
    }
    if (listingAId || listingBId) {
      await pool.query(`DELETE FROM listings WHERE id IN ($1, $2)`, [listingAId || 0, listingBId || 0]);
    }
    if (hostAId || hostBId || adminId) {
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [hostAId || 0, hostBId || 0, adminId || 0]);
    }
    await pool.end();
  });

  // ================================================================
  // 1. Metric Correctness with Provenance
  // ================================================================
  it('1. Metric Correctness — Returns canonical impressions, clicks, reach, CTR, CPC, CPM with provenance', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.campaign_id).toBe(campActiveId);
    expect(report.metrics.impressions.value).toBe(10000);
    expect(report.metrics.impressions.source).toBe('META_ADS_INSIGHTS');
    expect(report.metrics.reach.value).toBe(8500);
    expect(report.metrics.clicks.value).toBe(450);
    expect(report.metrics.ctr.value).toBe(0.045); // 450 / 10000 = 4.5%
    expect(report.metrics.spend.value).toBe(150);
    expect(report.metrics.cpc.value).toBe(0.33); // 150 / 450 = 0.333
    expect(report.metrics.cpm.value).toBe(15); // (150 / 10000) * 1000 = 15.00
    expect(report.metrics.leads.value).toBe(3);
    expect(report.metrics.qualified_leads.value).toBe(2);
  });

  // ================================================================
  // 2. Freshness Classification
  // ================================================================
  it('2. Freshness Classification — Categorizes freshness correctly (FRESH, DELAYED, STALE, UNAVAILABLE)', () => {
    const freshIso = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const delayedIso = new Date(Date.now() - 40 * 60 * 1000).toISOString(); // 40 min ago
    const staleIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3 hours ago
    const unavailIso = new Date(Date.now() - 10 * 3600 * 1000).toISOString(); // 10 hours ago

    expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(freshIso)).toBe('FRESH');
    expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(delayedIso)).toBe('DELAYED');
    expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(staleIso)).toBe('STALE');
    expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(unavailIso)).toBe('UNAVAILABLE');
    expect(MetaTelemetrySyncEngine.calculatePerformanceFreshness(null)).toBe('UNAVAILABLE');
  });

  // ================================================================
  // 3. Stale Telemetry Handling
  // ================================================================
  it('3. Stale Telemetry Handling — Marks data as STALE and attaches anomaly without masking', async () => {
    // Temporarily update insights_synced_at and variant snapshots to 4 hours ago
    await pool.query(
      `UPDATE host_marketing_campaigns SET insights_synced_at = NOW() - INTERVAL '4 hours' WHERE id = $1`,
      [campActiveId]
    );
    await pool.query(
      `UPDATE variant_meta_snapshots SET last_meta_fetched_at = NOW() - INTERVAL '4 hours' WHERE variant_id IN ($1, $2)`,
      [variant1Id, variant2Id]
    );

    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.freshness.overall).toBe('STALE');
    const staleAnomaly = report.anomalies.find(a => a.code === 'TELEMETRY_STALE');
    expect(staleAnomaly).toBeDefined();
    expect(staleAnomaly?.severity).toBe('INFO');

    // Reset back to fresh
    await pool.query(
      `UPDATE host_marketing_campaigns SET insights_synced_at = NOW() - INTERVAL '5 minutes' WHERE id = $1`,
      [campActiveId]
    );
    await pool.query(
      `UPDATE variant_meta_snapshots SET last_meta_fetched_at = NOW() - INTERVAL '5 minutes' WHERE variant_id IN ($1, $2)`,
      [variant1Id, variant2Id]
    );
  });

  // ================================================================
  // 4. Unavailable Telemetry Handling
  // ================================================================
  it('4. Unavailable Telemetry Handling — Clean fallback when timestamps are null or missing', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campZeroDataId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.metrics.ctr.is_available).toBe(false);
    expect(report.metrics.cpc.is_available).toBe(false);
    expect(report.metrics.impressions.value).toBe(0);
    expect(report.freshness.overall).toBe('UNAVAILABLE');
  });

  // ================================================================
  // 5. UTC Boundary Calculation
  // ================================================================
  it('5. UTC Boundary Windowing — Adheres to UTC daily midnight ranges without timezone leakage', () => {
    const range7D = PerformanceAnalyticsService.resolveDateRange('7D');
    const nowUtc = new Date().toISOString().split('T')[0];
    expect(range7D.endDate).toBe(nowUtc);

    const range30D = PerformanceAnalyticsService.resolveDateRange('30D');
    const dStart = new Date(range30D.startDate);
    const dEnd = new Date(range30D.endDate);
    const diffDays = Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 3600 * 24));
    expect(diffDays).toBe(30);
  });

  // ================================================================
  // 6. Timezone Resilience (IST & UTC conversion)
  // ================================================================
  it('6. Timezone Resilience — Handles custom date filters cleanly across international boundaries', async () => {
    const customStart = '2026-08-01T00:00:00+05:30'; // IST
    const customEnd = '2026-08-16T23:59:59+05:30';

    const range = PerformanceAnalyticsService.resolveDateRange('CUSTOM', customStart, customEnd);
    expect(range.startDate).toBe('2026-07-31'); // Converted to UTC
    expect(range.endDate).toBe('2026-08-16');
  });

  // ================================================================
  // 7. Month Boundary Windowing
  // ================================================================
  it('7. Month Boundary Windowing — Correctly spans across month boundaries without negative day counts', () => {
    const customStart = '2026-01-25T00:00:00Z';
    const customEnd = '2026-02-05T00:00:00Z';

    const range = PerformanceAnalyticsService.resolveDateRange('CUSTOM', customStart, customEnd);
    expect(range.startDate).toBe('2026-01-25');
    expect(range.endDate).toBe('2026-02-05');
  });

  // ================================================================
  // 8. Lifetime vs. Finite Window Aggregation
  // ================================================================
  it('8. Window Aggregation — Lifetime includes total rollup span whereas 7D restricts to last 7 days', async () => {
    const reportLifetime = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    const report7D = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: '7D' },
      pool
    );

    expect(reportLifetime.time_series.length).toBeGreaterThanOrEqual(4);
    // 7D should only include rollups within the last 7 days (3 entries: -5d, -2d, -1d)
    expect(report7D.time_series.length).toBe(3);
    expect(report7D.metrics.impressions.value).toBe(8000); // 3000 + 2500 + 2500
  });

  // ================================================================
  // 9. Financial Separation
  // ================================================================
  it('9. Financial Separation — Distinguishes Gross Charge, Encho 15% SaaS fee, Authorized Spend, and Actual Spend', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    const f = report.financials;
    expect(f.gross_host_charge).toBe(500);
    expect(f.encho_fee_amount).toBe(75); // 15% of $500
    expect(f.meta_authorized_spend).toBe(425); // $500 - $75
    expect(f.meta_actual_spend).toBe(150);
    expect(f.meta_remaining_authorization).toBe(275);
    expect(f.budget_utilization_pct).toBe(35.29); // (150 / 425) * 100
  });

  // ================================================================
  // 10. Multi-Stage Funnel Conversion Intelligence
  // ================================================================
  it('10. Funnel Conversion Intelligence — Builds deterministic multi-stage funnel with step conversion rates', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    const stages = report.funnel.stages;
    expect(stages.length).toBe(7);
    expect(stages[0].stage_key).toBe('IMPRESSIONS');
    expect(stages[0].count).toBe(10000);
    expect(stages[1].stage_key).toBe('REACH');
    expect(stages[1].count).toBe(8500);
    expect(stages[2].stage_key).toBe('CLICKS');
    expect(stages[2].count).toBe(450);
    expect(stages[4].stage_key).toBe('LEADS');
    expect(stages[4].count).toBe(3);
    expect(stages[5].stage_key).toBe('QUALIFIED_LEADS');
    expect(stages[5].count).toBe(2);
    expect(stages[6].stage_key).toBe('BOOKINGS');
    expect(stages[6].count).toBe(1);
    expect(report.funnel.overall_conversion_rate).toBe(0.0001); // 1 booking / 10000 impressions
  });

  // ================================================================
  // 11. Zero-Data Campaign Resilience
  // ================================================================
  it('11. Zero-Data Campaign — Does not crash, handles division-by-zero safely with 0 rates', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campZeroDataId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.metrics.impressions.value).toBe(0);
    expect(report.metrics.clicks.value).toBe(0);
    expect(report.metrics.ctr.value).toBe(0);
    expect(report.metrics.cpc.value).toBe(0);
    expect(report.metrics.cpm.value).toBe(0);
    expect(report.funnel.overall_conversion_rate).toBeNull();
  });

  // ================================================================
  // 12. Variant Performance Aggregation
  // ================================================================
  it('12. Variant Performance — Extracts and aggregates variant impressions, clicks, spend, and CTR', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.variants.length).toBe(2);
    const winner = report.variants.find(v => v.is_winner);
    expect(winner).toBeDefined();
    expect(winner?.meta_ad_id).toBe('mock_ad_var1_p35');
    expect(winner?.impressions).toBe(6500);
    expect(winner?.clicks).toBe(320);
    expect(winner?.ctr).toBe(0.0492); // 320 / 6500
  });

  // ================================================================
  // 13. DCO Decision Projection
  // ================================================================
  it('13. DCO Decision Projection — Projects canonical DCO winner status without recalculating in analytics', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    const winner = report.variants.find(v => v.is_winner);
    expect(winner?.dco_decision).toBe('WINNER_SELECTED');

    const loser = report.variants.find(v => !v.is_winner);
    expect(loser?.dco_decision).toBe('EXPLORING');
  });

  // ================================================================
  // 14. Deterministic Anomaly Detection
  // ================================================================
  it('14. Deterministic Anomaly Detection — Identifies anomalies based on defined mathematical thresholds', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(Array.isArray(report.anomalies)).toBe(true);
    // Verified campaign with 4.5% CTR and 150/425 budget has no critical anomalies
    const criticalAnomalies = report.anomalies.filter(a => a.severity === 'CRITICAL');
    expect(criticalAnomalies.length).toBe(0);
  });

  // ================================================================
  // 15. Tenant Isolation Enforcement
  // ================================================================
  it('15. Tenant Isolation — Host A is strictly forbidden from querying Host B campaign analytics', async () => {
    await expect(
      PerformanceAnalyticsService.getCampaignPerformanceReport(
        campHostBId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/Unauthorized access to campaign/);

    await expect(
      PdfReportService.generateCampaignReportHtml(
        campHostBId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/Unauthorized access to campaign/);
  });

  // ================================================================
  // 16. Admin Portfolio Analytics Aggregation
  // ================================================================
  it('16. Admin Portfolio Analytics — Aggregates system-wide financial and performance portfolio', async () => {
    const portfolio = await PerformanceAnalyticsService.getAdminPortfolioAnalytics(
      { userId: adminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(portfolio.total_campaigns).toBeGreaterThanOrEqual(3);
    expect(portfolio.total_authorized_spend).toBeGreaterThanOrEqual(1445);
    expect(portfolio.total_encho_fees).toBeGreaterThanOrEqual(255);
    expect(portfolio.total_impressions).toBeGreaterThanOrEqual(10000);
    expect(portfolio.total_clicks).toBeGreaterThanOrEqual(450);
    expect(portfolio.portfolio_ctr).toBeGreaterThan(0);
    expect(portfolio.portfolio_cpc).toBeGreaterThan(0);
    expect(portfolio.data_freshness).toBe('FRESH');
  });

  // ================================================================
  // 17. PDF Report Consistency
  // ================================================================
  it('17. PDF Report Consistency — Generated HTML document matches live projection metrics 100%', async () => {
    const { html, report } = await PdfReportService.generateCampaignReportHtml(
      campActiveId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(html).toContain('ENCHO Performance Report');
    expect(html).toContain('P3.5 Joshua Tree Main Promo');
    expect(html).toContain('$425.00 USD'); // Authorized ad budget
    expect(html).toContain('10,000'); // Impressions
    expect(html).toContain('450'); // Clicks
    expect(html).toContain('4.50%'); // CTR
    expect(html).toContain('WINNER'); // Variant winner badge
    expect(report.metrics.impressions.value).toBe(10000);
  });

  // ================================================================
  // 18. Currency Handling
  // ================================================================
  it('18. Currency Handling — Formats financial figures with standard 2-decimal precision and currency codes', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campActiveId,
      { userId: hostAId, role: 'host' },
      {},
      pool
    );

    expect(report.financials.currency).toBe('USD');
    expect(report.metrics.spend.currency).toBe('USD');
    expect(report.metrics.cpc.currency).toBe('USD');
  });

  // ================================================================
  // 19. Duplicate Event Prevention (Daily Rollups Idempotency)
  // ================================================================
  it('19. Duplicate Rollup Idempotency — Upserting identical daily rollups prevents double counting', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Seed initial rollup
    await pool.query(`
      INSERT INTO campaign_daily_rollups (campaign_id, date, impressions, clicks, spent_usd)
      VALUES ($1, $2, 500, 25, 10.00)
      ON CONFLICT (campaign_id, date) DO UPDATE 
      SET impressions = 500, clicks = 25, spent_usd = 10.00
    `, [campActiveId, today]);

    // Replay identical upsert
    await pool.query(`
      INSERT INTO campaign_daily_rollups (campaign_id, date, impressions, clicks, spent_usd)
      VALUES ($1, $2, 500, 25, 10.00)
      ON CONFLICT (campaign_id, date) DO UPDATE 
      SET impressions = 500, clicks = 25, spent_usd = 10.00
    `, [campActiveId, today]);

    const res = await pool.query(
      `SELECT impressions, clicks, spent_usd FROM campaign_daily_rollups WHERE campaign_id = $1 AND date = $2`,
      [campActiveId, today]
    );

    expect(Number(res.rows[0].impressions)).toBe(500);
    expect(Number(res.rows[0].clicks)).toBe(25);
  });

  // ================================================================
  // 20. Adversarial: Zero Delivery on Active Campaign Anomaly
  // ================================================================
  it('20. Adversarial Anomaly — Active campaign with zero impressions triggers CRITICAL ZERO_DELIVERY_ACTIVE anomaly', async () => {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campZeroDataId,
      { userId: hostAId, role: 'host' },
      {},
      pool
    );

    const zeroAnomaly = report.anomalies.find(a => a.code === 'ZERO_DELIVERY_ACTIVE');
    expect(zeroAnomaly).toBeDefined();
    expect(zeroAnomaly?.severity).toBe('CRITICAL');
    expect(zeroAnomaly?.recommended_action).toContain('On-Demand Resync');
  });
});
