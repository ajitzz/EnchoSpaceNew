import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { evaluateCampaignDCO, computeCampaignApprovalHash, ensureMarketingSchema } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.6 MILESTONE 2 — STEP 4: DCO EVALUATION ENGINE (DECISION LOGIC ONLY)', () => {
  let testHostId: number;
  let testListingId: number;
  let testCampaignId: number;
  let variantAId: number;
  let variantBId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const hostRes = await pool.query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'host', 'hash') RETURNING id`,
      [`host_step4_${Date.now()}@test.com`, 'Test Host Step 4']
    );
    testHostId = hostRes.rows[0].id;

    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, description, city, address, price, type, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testHostId, 'Step 4 Test Listing', 'Description', 'City', '123 Test St', 100, 'villa', 'https://picsum.photos/seed/step4/200/300']
    );
    testListingId = listingRes.rows[0].id;

    const campData: any = {
      host_id: testHostId,
      listing_id: testListingId,
      title: 'Step 4 Campaign',
      budget: 100,
      status: 'active',
      media_urls: JSON.stringify(['https://picsum.photos/seed/step4/200/300']),
      admin_approved: true,
      policy_cleared: true,
      target_radius_km: 25,
      target_locations: '["US"]',
      feed_description: 'Feed',
      description: 'Desc',
      meta_campaign_id: 'meta_camp_123',
      meta_adset_id: 'meta_adset_123',
      owner_meta_ad_account_id: 'act_123',
      objective: 'TRAFFIC',
      optimization_metric: 'CPC'
    };

    const { hash } = computeCampaignApprovalHash(campData);
    campData.approval_hash = hash;

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared,
        target_radius_km, target_locations, feed_description, description,
        meta_campaign_id, meta_adset_id, owner_meta_ad_account_id, objective, optimization_metric, approval_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW() - INTERVAL '2 days') RETURNING *`,
      [
        campData.host_id, campData.listing_id, campData.title, campData.budget, campData.status,
        campData.media_urls, campData.admin_approved, campData.policy_cleared, campData.target_radius_km,
        campData.target_locations, campData.feed_description, campData.description,
        campData.meta_campaign_id, campData.meta_adset_id, campData.owner_meta_ad_account_id,
        campData.objective, campData.optimization_metric, campData.approval_hash
      ]
    );
    testCampaignId = campRes.rows[0].id;

    // Create 2 variants older than 24h with variant_activated_at
    const varARes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, created_at, variant_activated_at)
       VALUES ($1, $2, 'image', 'sha_a', 'ACTIVE', true, 'cre_a', 'ad_a', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/step4a/200/300']
    );
    variantAId = varARes.rows[0].id;

    const varBRes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, created_at, variant_activated_at)
       VALUES ($1, $2, 'image', 'sha_b', 'ACTIVE', true, 'cre_b', 'ad_b', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/step4b/200/300']
    );
    variantBId = varBRes.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [testCampaignId]);
    await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN ($1, $2)', [variantAId, variantBId]);
    await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [testCampaignId]);
    await pool.query('UPDATE campaign_creative_variants SET variant_activated_at = NOW() - INTERVAL \'2 days\' WHERE id IN ($1, $2)', [variantAId, variantBId]);
    const campRes = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
    if (campRes.rows.length > 0) {
      const camp = campRes.rows[0];
      camp.title = 'Step 4 Campaign';
      const { hash } = computeCampaignApprovalHash(camp);
      await pool.query(`UPDATE host_marketing_campaigns SET title = 'Step 4 Campaign', approval_hash = $1 WHERE id = $2`, [hash, testCampaignId]);
    }
  });

  afterAll(async () => {
    if (variantAId && variantBId) {
      await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN ($1, $2)', [variantAId, variantBId]);
      await pool.query('DELETE FROM campaign_creative_variants WHERE id IN ($1, $2)', [variantAId, variantBId]);
    }
    if (testCampaignId) {
      await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    }
    if (testListingId) {
      await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    }
    if (testHostId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testHostId]);
    }
    await pool.end();
  });

  async function setSnapshots(aImp: number, aClicks: number, aConv: number, aSpend: number, bImp: number, bClicks: number, bConv: number, bSpend: number, fetchedHoursAgo = 1) {
    const fetchedAt = new Date(Date.now() - fetchedHoursAgo * 3600 * 1000);
    await pool.query(`
      INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (variant_id) DO UPDATE SET
        last_meta_impressions = EXCLUDED.last_meta_impressions,
        last_meta_clicks = EXCLUDED.last_meta_clicks,
        last_meta_conversions = EXCLUDED.last_meta_conversions,
        last_meta_spend = EXCLUDED.last_meta_spend,
        last_meta_fetched_at = EXCLUDED.last_meta_fetched_at
    `, [variantAId, aImp, aClicks, aConv, aSpend, fetchedAt]);

    await pool.query(`
      INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (variant_id) DO UPDATE SET
        last_meta_impressions = EXCLUDED.last_meta_impressions,
        last_meta_clicks = EXCLUDED.last_meta_clicks,
        last_meta_conversions = EXCLUDED.last_meta_conversions,
        last_meta_spend = EXCLUDED.last_meta_spend,
        last_meta_fetched_at = EXCLUDED.last_meta_fetched_at
    `, [variantBId, bImp, bClicks, bConv, bSpend, fetchedAt]);
  }

  it('A. Traffic CPC winner', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-A' });
    expect(result.decision).toBe('WINNER_SELECTED');
    expect(result.winner_variant_id).toBe(variantAId);
  });

  it('B. Lead CPL winner', async () => {
    await pool.query(`UPDATE host_marketing_campaigns SET objective = 'LEAD_GENERATION', optimization_metric = 'CPL' WHERE id = $1`, [testCampaignId]);
    await setSnapshots(2000, 50, 10, 30.00, 2000, 50, 10, 60.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-B' });
    expect(result.decision).toBe('WINNER_SELECTED');
    expect(result.winner_variant_id).toBe(variantAId);
  });

  it('C. Conversion CPA winner', async () => {
    await pool.query(`UPDATE host_marketing_campaigns SET objective = 'CONVERSIONS', optimization_metric = 'CPA' WHERE id = $1`, [testCampaignId]);
    await setSnapshots(2000, 50, 10, 50.00, 2000, 50, 10, 100.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-C' });
    expect(result.decision).toBe('WINNER_SELECTED');
    expect(result.winner_variant_id).toBe(variantAId);
  });

  it('D. Insufficient impressions', async () => {
    await setSnapshots(500, 20, 2, 20.00, 500, 20, 2, 20.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-D' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('INSUFFICIENT_DATA');
  });

  it('E. Insufficient clicks/leads/conversions', async () => {
    await pool.query(`UPDATE host_marketing_campaigns SET objective = 'TRAFFIC', optimization_metric = 'CPC' WHERE id = $1`, [testCampaignId]);
    await setSnapshots(2000, 5, 1, 20.00, 2000, 5, 1, 20.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-E' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('INSUFFICIENT_DATA');
  });

  it('F. Insufficient spend', async () => {
    await setSnapshots(2000, 50, 5, 10.00, 2000, 50, 5, 10.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-F' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('INSUFFICIENT_DATA');
  });

  it('G. Stale metrics', async () => {
    await setSnapshots(2000, 50, 5, 25.00, 2000, 50, 5, 25.00, 7);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-G' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('STALE_METRICS');
  });

  it('H. Variant age <24h via variant_activated_at', async () => {
    await pool.query(`UPDATE campaign_creative_variants SET variant_activated_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [variantAId]);
    await setSnapshots(2000, 50, 5, 25.00, 2000, 50, 5, 25.00, 1);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-H' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('VARIANT_TOO_YOUNG');
    await pool.query(`UPDATE campaign_creative_variants SET variant_activated_at = NOW() - INTERVAL '2 days' WHERE id = $1`, [variantAId]);
  });

  it('I. Relative advantage <15%', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 22.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-I' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toContain('below 15%');
  });

  it('J. Zero-action edge cases', async () => {
    await setSnapshots(2000, 0, 0, 20.00, 2000, 0, 0, 20.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-J' });
    expect(result.decision).toBe('DEFERRED');
  });

  it('K. Equal-performance NO_WINNER', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 20.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-K', maxEvaluationWindowHours: 0 });
    expect(result.decision).toBe('NO_WINNER_EQUAL_PERFORMANCE');
  });

  it('L. Evaluation lease prevents duplicate evaluation', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    await pool.query(`
      INSERT INTO dco_evaluation_transactions (campaign_id, evaluation_epoch, status, lease_expires_at, decision)
      VALUES ($1, '2026-08-11-L', 'EVALUATING', NOW() + INTERVAL '30 minutes', 'DEFERRED')
      ON CONFLICT (campaign_id, evaluation_epoch) DO UPDATE SET status = 'EVALUATING', lease_expires_at = NOW() + INTERVAL '30 minutes'
    `, [testCampaignId]);

    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-L' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('ACTIVE_LEASE_EXISTS');
  });

  it('M. Expired lease recovery', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    await pool.query(`
      INSERT INTO dco_evaluation_transactions (campaign_id, evaluation_epoch, status, lease_expires_at, decision)
      VALUES ($1, '2026-08-11-M', 'EVALUATING', NOW() - INTERVAL '30 minutes', 'DEFERRED')
      ON CONFLICT (campaign_id, evaluation_epoch) DO UPDATE SET status = 'EVALUATING', lease_expires_at = NOW() - INTERVAL '30 minutes'
    `, [testCampaignId]);

    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-M' });
    expect(result.decision).toBe('WINNER_SELECTED');
  });

  it('N. DEFERRED retry reuses same epoch', async () => {
    await setSnapshots(500, 5, 1, 10.00, 500, 5, 1, 10.00);
    const r1 = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-N' });
    expect(r1.decision).toBe('DEFERRED');

    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const r2 = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-N' });
    expect(r2.decision).toBe('WINNER_SELECTED');
  });

  it('O. Terminal evaluation blocks repeat', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const r1 = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-O' });
    expect(r1.decision).toBe('WINNER_SELECTED');

    const r2 = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-O' });
    expect(r2.decision).toBe('WINNER_SELECTED');
  });

  it('P. Approval hash invalid blocks evaluation', async () => {
    await pool.query(`UPDATE host_marketing_campaigns SET title = 'Tampered Title' WHERE id = $1`, [testCampaignId]);
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-P' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('APPROVAL_HASH_MISMATCH');
    const campRes = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
    const { hash } = computeCampaignApprovalHash(campRes.rows[0]);
    await pool.query(`UPDATE host_marketing_campaigns SET title = 'Step 4 Campaign', approval_hash = $1 WHERE id = $2`, [hash, testCampaignId]);
  });

  it('Q. Reconciliation incident blocks evaluation', async () => {
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, idempotency_key)
      VALUES ($1, 'corr_test', 'PUBLISHING', 'idemp_q_test')
    `, [testCampaignId]);

    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-Q' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('ACTIVE_PUBLISHING_TRANSACTION');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
  });

  it('R. Tenant isolation', async () => {
    const result = await evaluateCampaignDCO(999999);
    expect(result.decision).toBe('FAILED');
    expect(result.decision_reason).toBe('CAMPAIGN_NOT_FOUND');
  });

  it('S. Immutable event ledger emission', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-S' });

    const eventRes = await pool.query(`
      SELECT * FROM meta_publishing_events WHERE campaign_id = $1 AND event_type = 'DCO_EVALUATION_DECISION'
      ORDER BY id DESC LIMIT 1
    `, [testCampaignId]);
    expect(eventRes.rows.length).toBe(1);
    expect(eventRes.rows[0].to_state).toBe('WINNER_SELECTED');
  });

  it('T. Verify ZERO Meta mutation requests occurred during Step 4', async () => {
    const actionRes = await pool.query(`SELECT COUNT(*) FROM dco_external_actions WHERE campaign_id = $1`, [testCampaignId]);
    expect(Number(actionRes.rows[0].count)).toBe(0);
  });

  it('U. variant_activated_at missing yields VARIANT_NOT_ACTIVATED', async () => {
    await pool.query(`UPDATE campaign_creative_variants SET variant_activated_at = NULL WHERE id = $1`, [variantAId]);
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-U' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('VARIANT_NOT_ACTIVATED');
    await pool.query(`UPDATE campaign_creative_variants SET variant_activated_at = NOW() - INTERVAL '2 days' WHERE id = $1`, [variantAId]);
  });

  it('V. Request-layer zero mutation network spy test', async () => {
    const originalFetch = global.fetch;
    let mutationCalled = false;
    global.fetch = async (url: any, options: any) => {
      const method = (options?.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && String(url).includes('graph.facebook.com')) {
        mutationCalled = true;
      }
      return originalFetch(url, options);
    };

    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-V' });
    global.fetch = originalFetch;

    expect(mutationCalled).toBe(false);
  });

  it('W. Step 4A never produces WINNER_OPTIMIZED state', async () => {
    await setSnapshots(2000, 100, 5, 20.00, 2000, 100, 5, 40.00);
    const result = await evaluateCampaignDCO(testCampaignId, { evaluationEpoch: '2026-08-11-W' });
    expect(result.decision).not.toBe('WINNER_OPTIMIZED');
    expect(result.decision).toBe('WINNER_SELECTED');
  });
});
