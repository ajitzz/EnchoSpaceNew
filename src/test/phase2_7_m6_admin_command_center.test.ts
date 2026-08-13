import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.7 MILESTONE 6 — ADMIN META CAMPAIGN COMMAND CENTER CERTIFICATION', () => {
  let testHostId: number;
  let testAdminId: number;
  let testListingId: number;

  beforeAll(async () => {
    // Seed test users & listing
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'M6 Test Host')
      RETURNING id
    `, [`m6_host_${Date.now()}@test.com`]);
    testHostId = userRes.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'M6 Test Admin')
      RETURNING id
    `, [`m6_admin_${Date.now()}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type, image_url)
      VALUES ($1, 'M6 Test Resort', 'Luxury resort', 'Miami', '456 Ocean Dr', 500, 'resort', 'https://picsum.photos/seed/m6/200/300')
      RETURNING id
    `, [testHostId]);
    testListingId = listingRes.rows[0].id;
  });

  afterAll(async () => {
    if (testHostId) {
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id IN (SELECT id FROM host_marketing_campaigns WHERE host_id = $1)`, [testHostId]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE host_id = $1`, [testHostId]);
    }
    if (testListingId) await pool.query(`DELETE FROM listings WHERE id = $1`, [testListingId]);
    if (testHostId) await pool.query(`DELETE FROM users WHERE id = $1`, [testHostId]);
    if (testAdminId) await pool.query(`DELETE FROM users WHERE id = $1`, [testAdminId]);
    await pool.end();
  });

  it('1. Admin truth projection includes all 3 core state axes, meta external state, and failure intelligence', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status, escrow_status)
      VALUES ($1, $2, 'Command Center Campaign', 300, 'pending_approval', false, 'UNPUBLISHED', 'HOLDING')
      RETURNING id
    `, [testHostId, testListingId]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );

    // Verify projection type & access role
    expect(adminTruth.projection_type).toBe('ADMIN');
    expect(adminTruth.access_role).toBe('ADMIN');

    // 1. Core State Axes
    expect(adminTruth.governance_status).toBe('PENDING_ADMIN_REVIEW');
    expect(adminTruth.escrow_status).toBe('HOLDING');
    expect(adminTruth.publish_status).toBe('IDLE');

    // 2. Meta External State
    expect(adminTruth.meta_external_state).toBeDefined();
    expect(adminTruth.meta_external_state.meta_status).toBe('UNPUBLISHED');
    expect(adminTruth.meta_external_state.external_freshness).toBeDefined();

    // 3. Financial Safety
    expect(adminTruth.financial_safety).toBeDefined();
    expect(adminTruth.financial_safety.is_money_safe).toBe(true);
    expect(adminTruth.financial_safety.total_charged_cents).toBe(30000);
    expect(adminTruth.financial_safety.ad_spend_allocated_cents).toBe(25500);
    expect(adminTruth.financial_safety.encho_fee_cents).toBe(4500);

    // 4. Performance & Engagement
    expect(adminTruth.performance_state).toBeDefined();
    expect(adminTruth.engagement_state).toBeDefined();
    expect(adminTruth.dco_state).toBeDefined();

    // 5. Diagnostics
    expect(adminTruth.admin_next_action).toBeDefined();
    expect(adminTruth.incident_timeline).toBeDefined();

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('2. Admin truth projection for FAILED_PUBLISH displays stage, error owner, and plain english failure', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status, escrow_status)
      VALUES ($1, $2, 'Failed Publish Campaign', 200, 'failed_publish', true, 'UNPUBLISHED', 'HOLDING')
      RETURNING id
    `, [testHostId, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem = `idem_fail_${Math.random().toString(36).substring(2)}`;
    const errorDetails = JSON.stringify({
      code: 100,
      subcode: 33,
      message: 'Invalid creative asset resolution',
      type: 'DETERMINISTIC_ASSET_ERROR'
    });

    await pool.query(`
      INSERT INTO meta_publishing_transactions (
        campaign_id, correlation_id, publish_status, error_details,
        failure_stage, idempotency_key
      ) VALUES ($1, 'corr_fail_123', 'FAILED_PUBLISH', $2, 'CREATIVE', $3)
    `, [campaignId, errorDetails, randIdem]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(adminTruth.publish_status).toBe('FAILED_PUBLISH');
    expect(adminTruth.failure_stage).toBe('CREATIVE');
    expect(adminTruth.root_error_code).toBe(100);
    expect(adminTruth.root_error_subcode).toBe(33);
    expect(adminTruth.root_error_message).toContain('creative asset');
    expect(adminTruth.plain_english_failure).toBeDefined();
    expect(adminTruth.admin_next_action).toBeDefined();

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('3. Admin truth projection for EXTERNAL_OUTCOME_UNKNOWN explicitly shows UNKNOWN and does NOT collapse to FAILED', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status, escrow_status)
      VALUES ($1, $2, 'Unknown Outcome Campaign', 400, 'meta_api_push', true, 'UNPUBLISHED', 'HOLDING')
      RETURNING id
    `, [testHostId, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem = `idem_unk_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (
        campaign_id, correlation_id, publish_status, idempotency_key
      ) VALUES ($1, 'corr_unk_999', 'EXTERNAL_OUTCOME_UNKNOWN', $2)
    `, [campaignId, randIdem]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(adminTruth.publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');
    expect(adminTruth.reconciliation_state).toBe('RECONCILIATION_REQUIRED');
    expect(adminTruth.meta_external_state.reconciliation_required).toBe(true);

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });
});
