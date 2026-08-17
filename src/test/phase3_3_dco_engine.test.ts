import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  evaluateVariantComparison,
  DEFAULT_DCO_CONFIG,
  DcoEngine,
  DcoVariantMetricInput
} from '../lib/dcoEngine.js';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.3: MULTI-VARIANT DCO & STATISTICAL WINNER SELECTION SUITE', () => {
  let hostId: number;
  let adminId: number;
  let campaignId: number;
  let variant1Id: number;
  let variant2Id: number;

  beforeAll(async () => {
    // 1. Seed Host & Admin
    const hRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'DCO Host') RETURNING id",
      [`host_dco_${Date.now()}@encho.com`]
    );
    hostId = hRes.rows[0].id;

    const aRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'admin', 'DCO Admin') RETURNING id",
      [`admin_dco_${Date.now()}@encho.com`]
    );
    adminId = aRes.rows[0].id;

    // 2. Seed Campaign with Multi-Creative Media URLs
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, title, budget, status, escrow_status, admin_approved, meta_dispatched_at, media_urls
      ) VALUES (
        $1, 'Phase 3.3 DCO Test Campaign', 300, 'active', 'released', true, NOW() - INTERVAL '30 hours',
        '["https://example.com/a.jpg", "https://example.com/b.jpg"]'::jsonb
      ) RETURNING id
    `, [hostId]);
    campaignId = campRes.rows[0].id;

    // 3. Seed Creative Variants
    const v1Res = await pool.query(`
      INSERT INTO campaign_creative_variants (
        campaign_id, media_url, meta_creative_id, meta_ad_id, status, is_published, variant_activated_at
      ) VALUES (
        $1, 'https://example.com/a.jpg', 'cr_meta_1', 'ad_meta_1', 'ACTIVE', true, NOW() - INTERVAL '30 hours'
      ) RETURNING id
    `, [campaignId]);
    variant1Id = v1Res.rows[0].id;

    const v2Res = await pool.query(`
      INSERT INTO campaign_creative_variants (
        campaign_id, media_url, meta_creative_id, meta_ad_id, status, is_published, variant_activated_at
      ) VALUES (
        $1, 'https://example.com/b.jpg', 'cr_meta_2', 'ad_meta_2', 'ACTIVE', true, NOW() - INTERVAL '30 hours'
      ) RETURNING id
    `, [campaignId]);
    variant2Id = v2Res.rows[0].id;

    // 4. Update campaign with active external meta state
    await pool.query(`
      UPDATE host_marketing_campaigns
      SET meta_status = 'ACTIVE',
          meta_effective_status = 'ACTIVE',
          meta_review_status = 'APPROVED',
          external_status_verified_at = NOW(),
          external_status_verification_source = 'ACTIVE_POLL'
      WHERE id = $1
    `, [campaignId]);

    // 5. Seed Publishing Transaction
    await pool.query(`
      INSERT INTO meta_publishing_transactions (
        campaign_id, publish_status, meta_campaign_id, meta_adset_id, idempotency_key, correlation_id, created_at, updated_at
      ) VALUES (
        $1, 'SUCCESS', 'cmp_meta_dco', 'adset_meta_dco', $2, $2, NOW(), NOW()
      )
    `, [campaignId, `dco_test_tx_${Date.now()}`]);
  });

  afterAll(async () => {
    if (campaignId) {
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM dco_external_actions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    }
    if (hostId) await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
    if (adminId) await pool.query('DELETE FROM users WHERE id = $1', [adminId]);
    await pool.end();
  });

  // ================================================================
  // 1. Insufficient Sample Size Checks
  // ================================================================
  it('1. Returns INSUFFICIENT_DATA when impressions are below minimum threshold (<500)', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 36 * 3600 * 1000), impressions: 350, clicks: 30, conversions: 2, spend: 10 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 36 * 3600 * 1000), impressions: 600, clicks: 35, conversions: 2, spend: 12 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('INSUFFICIENT_DATA');
    expect(result.winner_variant_id).toBeNull();
    expect(result.reason).toContain('minimum 500 required');
  });

  it('2. Returns INSUFFICIENT_DATA when clicks are below minimum threshold (<25)', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 36 * 3600 * 1000), impressions: 1000, clicks: 15, conversions: 1, spend: 10 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 36 * 3600 * 1000), impressions: 1200, clicks: 30, conversions: 2, spend: 12 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('INSUFFICIENT_DATA');
    expect(result.winner_variant_id).toBeNull();
  });

  // ================================================================
  // 3. Stale Data & Age Checks
  // ================================================================
  it('3. Returns STALE_DATA when telemetry age exceeds maximum staleness (>6h) or is marked STALE', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 36 * 3600 * 1000), freshness: 'STALE', impressions: 1000, clicks: 50, conversions: 5, spend: 20 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 36 * 3600 * 1000), freshness: 'FRESH', impressions: 1000, clicks: 40, conversions: 3, spend: 20 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('STALE_DATA');
    expect(result.winner_variant_id).toBeNull();
  });

  it('4. Returns NOT_READY when testing age is under 24 hours', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 12 * 3600 * 1000), impressions: 1000, clicks: 50, conversions: 5, spend: 20 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 12 * 3600 * 1000), impressions: 1000, clicks: 40, conversions: 3, spend: 20 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('NOT_READY');
    expect(result.winner_variant_id).toBeNull();
    expect(result.reason).toContain('Testing window in progress');
  });

  // ================================================================
  // 5. Statistical Rigor (No False Winners)
  // ================================================================
  it('5. Returns TIE when variants have identical performance', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 2000, clicks: 60, conversions: 0, spend: 30 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 2000, clicks: 60, conversions: 0, spend: 30 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('TIE');
    expect(result.winner_variant_id).toBeNull();
  });

  it('6. Returns INCONCLUSIVE when CTR difference is small and statistically insignificant (Z < 1.96)', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 1000, clicks: 31, conversions: 0, spend: 20 }, // 3.1% CTR
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 1000, clicks: 30, conversions: 0, spend: 20 }  // 3.0% CTR
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('INCONCLUSIVE');
    expect(result.winner_variant_id).toBeNull();
  });

  it('7. Returns WINNER_IDENTIFIED when CTR difference is statistically significant (Z >= 1.96, Advantage >= 15%)', () => {
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 3000, clicks: 150, conversions: 0, spend: 40 }, // 5.0% CTR
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 3000, clicks: 60, conversions: 0, spend: 40 }   // 2.0% CTR
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('WINNER_IDENTIFIED');
    expect(result.winner_variant_id).toBe(1);
    expect(result.loser_variant_ids).toEqual([2]);
    expect(result.decision_metric).toBe('CTR');
    expect(result.relative_advantage).toBeGreaterThanOrEqual(0.15);
    expect(result.z_score).toBeGreaterThanOrEqual(1.96);
  });

  // ================================================================
  // 8. Metric Hierarchy (Conversions Override CTR)
  // ================================================================
  it('8. Evaluates Tier 1 Qualified Conversions ahead of Tier 2 CTR when conversion data is sufficient', () => {
    // Variant 2 has slightly lower CTR (3.0% vs 3.5%) but significantly higher conversions (18 vs 2)
    const variants: DcoVariantMetricInput[] = [
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 2000, clicks: 70, conversions: 2, spend: 50 },
      { id: 2, meta_ad_id: 'ad_2', activated_at: new Date(Date.now() - 30 * 3600 * 1000), impressions: 2000, clicks: 60, conversions: 18, spend: 50 }
    ];

    const result = evaluateVariantComparison(variants);
    expect(result.result).toBe('WINNER_IDENTIFIED');
    expect(result.winner_variant_id).toBe(2);
    expect(result.decision_metric).toBe('CONVERSIONS');
  });

  // ================================================================
  // 9. Full DCO Engine Database Execution & Invariants
  // ================================================================
  it('9. Executes DcoEngine.processCampaignDco, creates immutable evaluation record and safe pause action', async () => {
    // Populate snapshots for the test variants
    await pool.query(`
      INSERT INTO variant_meta_snapshots (
        variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at
      ) VALUES 
        ($1, 2500, 125, 0, 30.0, NOW()),
        ($2, 2500, 50, 0, 30.0, NOW())
      ON CONFLICT (variant_id) DO UPDATE SET
        last_meta_impressions = EXCLUDED.last_meta_impressions,
        last_meta_clicks = EXCLUDED.last_meta_clicks,
        last_meta_fetched_at = EXCLUDED.last_meta_fetched_at
    `, [variant1Id, variant2Id]);

    const epoch = `p33_test_epoch_${Date.now()}`;
    const result = await DcoEngine.processCampaignDco(campaignId, pool, epoch);

    expect(result.result).toBe('WINNER_IDENTIFIED');
    expect(result.winner_variant_id).toBe(variant1Id);
    expect(result.loser_variant_ids).toContain(variant2Id);

    // Verify dco_evaluation_transactions record
    const evalRes = await pool.query(
      'SELECT * FROM dco_evaluation_transactions WHERE campaign_id = $1 AND evaluation_epoch = $2',
      [campaignId, epoch]
    );
    expect(evalRes.rows.length).toBe(1);
    expect(evalRes.rows[0].winner_variant_id).toBe(variant1Id);
    expect(evalRes.rows[0].status).toBe('WINNER_SELECTED');

    // Verify dco_external_actions record
    const actionRes = await pool.query(
      'SELECT * FROM dco_external_actions WHERE campaign_id = $1 AND variant_id = $2',
      [campaignId, variant2Id]
    );
    expect(actionRes.rows.length).toBe(1);
    expect(actionRes.rows[0].action_type).toBe('PAUSE_VARIANT');

    // Verify local variant statuses
    const v1State = await pool.query('SELECT status FROM campaign_creative_variants WHERE id = $1', [variant1Id]);
    const v2State = await pool.query('SELECT status FROM campaign_creative_variants WHERE id = $1', [variant2Id]);
    expect(v1State.rows[0].status).toBe('WINNER');
    expect(v2State.rows[0].status).toBe('PRUNED');

    // Verify financial contract envelope remains exactly $300 (0 expansion)
    const campCheck = await pool.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    expect(Number(campCheck.rows[0].budget)).toBe(300);
  });

  // ================================================================
  // 10. Idempotency & Duplicate Epoch Protection
  // ================================================================
  it('10. Guarantees idempotency when evaluated again for the same epoch', async () => {
    const epoch = `p33_test_epoch_duplicate`;
    const res1 = await DcoEngine.processCampaignDco(campaignId, pool, epoch);
    const res2 = await DcoEngine.processCampaignDco(campaignId, pool, epoch);

    expect(res1.winner_variant_id).toBe(res2.winner_variant_id);
    expect(res1.result).toBe(res2.result);
  });

  // ================================================================
  // 11. Financial Safety Barrier
  // ================================================================
  it('11. Blocks DCO evaluation if campaign has a financial block', async () => {
    // Create temporary blocked campaign
    const blockRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, title, budget, status, escrow_status, admin_approved
      ) VALUES (
        $1, 'Financial Block DCO Campaign', 100, 'active', 'held', true
      ) RETURNING id
    `, [hostId]);
    const blockedCampId = blockRes.rows[0].id;

    // Seed invalid contract where math violates invariants or spend exceeds cap
    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES (
        $1, 10000, 1500, 8500, 8500, 8500, 0, 'USD'
      )
    `, [blockedCampId]);

    // Update campaign budget to conflict with contract so financial verification fails
    await pool.query('UPDATE host_marketing_campaigns SET budget = 500 WHERE id = $1', [blockedCampId]);

    const result = await DcoEngine.processCampaignDco(blockedCampId, pool, 'blocked_epoch');
    expect(result.result).toBe('INVALID_DATA');

    // Cleanup
    await pool.query('DELETE FROM campaign_financial_contracts WHERE campaign_id = $1', [blockedCampId]);
    await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [blockedCampId]);
  });

  // ================================================================
  // 12. Hierarchy Integrity Barrier
  // ================================================================
  it('12. Prohibits DCO evaluation when hierarchy integrity validation fails', async () => {
    // Create orphaned campaign without meta_publishing_transactions
    const brokenCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, title, budget, status, escrow_status, admin_approved
      ) VALUES (
        $1, 'Broken Hierarchy DCO Campaign', 100, 'active', 'released', true
      ) RETURNING id
    `, [hostId]);
    const brokenId = brokenCampRes.rows[0].id;

    const result = await DcoEngine.processCampaignDco(brokenId, pool, 'broken_epoch');
    expect(result.result).toBe('INVALID_DATA');
    expect(result.reason).toContain('hierarchy integrity validation failed');

    // Cleanup
    await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [brokenId]);
  });

  // ================================================================
  // 13. Tenant & Host Projection Isolation
  // ================================================================
  it('13. Renders Host projection with translated DCO status without exposing internal Z-Scores', async () => {
    const hostTruth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: hostId, role: 'host' },
      pool
    );

    expect(hostTruth.dco_state).toBeDefined();
    expect(hostTruth.dco_state.dco_status).toBeDefined();
    expect(hostTruth.dco_state.dco_status_label).toBeDefined();
    expect(hostTruth.dco_state.variants).toBeDefined();
    // Verify internal z_score is not leaked to host projection
    expect((hostTruth.dco_state as any).z_score).toBeUndefined();
  });

  // ================================================================
  // 14. Zero Financial Envelope Expansion
  // ================================================================
  it('14. Guarantees 0% budget expansion across multiple evaluation epochs', async () => {
    const campCheckBefore = await pool.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    const budgetBefore = Number(campCheckBefore.rows[0].budget);

    // Run evaluation
    await DcoEngine.processCampaignDco(campaignId, pool, `epoch_repeat_${Date.now()}`);

    const campCheckAfter = await pool.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    const budgetAfter = Number(campCheckAfter.rows[0].budget);

    expect(budgetAfter).toBe(budgetBefore);
  });

  // ================================================================
  // 15. Invalid Input Rejection
  // ================================================================
  it('15. evaluateVariantComparison returns INVALID_DATA for empty or single-variant array', () => {
    const resEmpty = evaluateVariantComparison([]);
    expect(resEmpty.result).toBe('INVALID_DATA');

    const resSingle = evaluateVariantComparison([
      { id: 1, meta_ad_id: 'ad_1', activated_at: new Date(), impressions: 1000, clicks: 50, conversions: 2, spend: 20 }
    ]);
    expect(resSingle.result).toBe('INVALID_DATA');
  });
});
