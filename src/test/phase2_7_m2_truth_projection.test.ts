import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.7 MILESTONE 2 — CAMPAIGN TRUTH PROJECTION ENGINE CERTIFICATION', () => {
  let testHost1Id: number;
  let testHost2Id: number;
  let testAdminId: number;
  let testListingId: number;

  beforeAll(async () => {
    // 1. Seed users to satisfy host_id foreign key constraints
    const userRes1 = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host 1 Truth Test')
      RETURNING id
    `, [`host1_p27_m2_${Date.now()}@test.com`]);
    testHost1Id = userRes1.rows[0].id;

    const userRes2 = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host 2 Truth Test')
      RETURNING id
    `, [`host2_p27_m2_${Date.now()}@test.com`]);
    testHost2Id = userRes2.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Admin Truth Test')
      RETURNING id
    `, [`admin_p27_m2_${Date.now()}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type, image_url)
      VALUES ($1, 'M2 Test Villa', 'Luxury villa', 'San Francisco', '123 Main St', 300, 'villa', 'https://picsum.photos/seed/m2/200/300')
      RETURNING id
    `, [testHost1Id]);
    testListingId = listingRes.rows[0].id;
  });

  afterAll(async () => {
    if (testHost1Id) {
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id IN (SELECT id FROM host_marketing_campaigns WHERE host_id = $1)`, [testHost1Id]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE host_id = $1`, [testHost1Id]);
    }
    if (testListingId) await pool.query(`DELETE FROM listings WHERE id = $1`, [testListingId]);
    if (testHost1Id) await pool.query(`DELETE FROM users WHERE id = $1`, [testHost1Id]);
    if (testHost2Id) await pool.query(`DELETE FROM users WHERE id = $1`, [testHost2Id]);
    if (testAdminId) await pool.query(`DELETE FROM users WHERE id = $1`, [testAdminId]);
    await pool.end();
  });

  it('1. Approved but not published (Rule A: APPROVED MUST NEVER imply LIVE)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status)
      VALUES ($1, $2, 'Approved Unpublished Campaign', 100, 'approved', true, 'UNPUBLISHED')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);

    expect(adminTruth.governance_status).toBe('ADMIN_APPROVED');
    expect(adminTruth.publish_status).toBe('IDLE');
    expect(adminTruth.meta_external_state.meta_status).toBe('UNPUBLISHED');
    expect(hostTruth.friendly_delivery_state).not.toBe('Live on Meta');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('2. Successful Meta publication', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status, meta_campaign_id)
      VALUES ($1, $2, 'Live Campaign', 200, 'CAMPAIGN_LIVE', true, 'ACTIVE', 'meta_camp_123')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem = `idem_live_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, meta_campaign_id, idempotency_key)
      VALUES ($1, 'corr_live_123', 'SUCCESS', 'meta_camp_123', $2)
    `, [campaignId, randIdem]);

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    expect(hostTruth.friendly_delivery_state).toBe('Live on Meta');
    expect(hostTruth.host_next_action).toContain('live on Meta');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('3. Failed publish with clear root cause (Rule B: FAILED_PUBLISH must have stage, root error, owner & next action)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Failed Campaign', 150, 'failed_publish', true)
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem3 = `idem_fail_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (
        campaign_id, correlation_id, publish_status, failure_stage, failure_code, error_details, idempotency_key
      ) VALUES ($1, 'corr_fail_123', 'FAILED_PUBLISH', 'CREATIVE', 100, $2, $3)
    `, [campaignId, JSON.stringify({ message: 'Housing policy validation error', subcode: 33 }), randIdem3]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);

    expect(adminTruth.publish_status).toBe('FAILED_PUBLISH');
    expect(adminTruth.failure_stage).toBe('CREATIVE');
    expect(adminTruth.root_error_code).toBe(100);
    expect(adminTruth.root_error_classification).toBe('POLICY_DISAPPROVED');
    expect(adminTruth.error_owner).toBe('META_POLICY_ERROR');
    expect(adminTruth.host_next_action).toBeDefined();
    expect(adminTruth.admin_next_action).toBeDefined();

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('4. Rollback success representation (Rule F)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Rollback Success Campaign', 100, 'failed_publish')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem4 = `idem_rb_succ_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, rollback_status, idempotency_key)
      VALUES ($1, 'corr_rb_succ', 'ROLLBACK_SUCCESS', 'ROLLBACK_SUCCESS', $2)
    `, [campaignId, randIdem4]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.publish_status).toBe('ROLLBACK_SUCCESS');
    expect(adminTruth.rollback_state).toBe('ROLLBACK_SUCCESS');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('5. Rollback failure triggers RECONCILIATION_REQUIRED (Rule E)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Rollback Failed Campaign', 100, 'failed_publish')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem5 = `idem_rb_fail_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, rollback_status, idempotency_key)
      VALUES ($1, 'corr_rb_fail', 'ROLLBACK_FAILED', 'ROLLBACK_FAILED', $2)
    `, [campaignId, randIdem5]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.publish_status).toBe('ROLLBACK_FAILED');
    expect(adminTruth.reconciliation_state).toBe('RECONCILIATION_REQUIRED');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('6. Quarantined campaign', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Quarantined Campaign', 100, 'failed_publish')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem6 = `idem_quarantine_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, idempotency_key)
      VALUES ($1, 'corr_quarantine', 'QUARANTINED', $2)
    `, [campaignId, randIdem6]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.publish_status).toBe('QUARANTINED');
    expect(adminTruth.reconciliation_state).toBe('RECONCILIATION_REQUIRED');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('7. External outcome unknown remains visibly UNKNOWN (Rule D)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Unknown Outcome Campaign', 100, 'approved')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem7 = `idem_unk_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, idempotency_key)
      VALUES ($1, 'corr_unk_123', 'EXTERNAL_OUTCOME_UNKNOWN', $2)
    `, [campaignId, randIdem7]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('8. Meta state freshness classification (STALE / DEGRADED)', async () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, external_status_verified_at)
      VALUES ($1, $2, 'Stale Verified Campaign', 100, 'CAMPAIGN_LIVE', $3)
      RETURNING id
    `, [testHost1Id, testListingId, staleTime]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.meta_external_state.external_freshness).toBe('DEGRADED');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('9. Meta state unknown when timestamp missing', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, external_status_verified_at)
      VALUES ($1, $2, 'No Verified Time Campaign', 100, 'draft', NULL)
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.meta_external_state.external_freshness).toBe('UNKNOWN');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('10. Fresh performance telemetry', async () => {
    const freshPerfTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, insights_synced_at)
      VALUES ($1, $2, 'Fresh Insights Campaign', 100, 'CAMPAIGN_LIVE', $3)
      RETURNING id
    `, [testHost1Id, testListingId, freshPerfTime]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.performance_state.performance_freshness).toBe('FRESH');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('11. Stale performance telemetry', async () => {
    const stalePerfTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, insights_synced_at)
      VALUES ($1, $2, 'Stale Insights Campaign', 100, 'CAMPAIGN_LIVE', $3)
      RETURNING id
    `, [testHost1Id, testListingId, stalePerfTime]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.performance_state.performance_freshness).toBe('STALE');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('12. Host redaction (Redacts correlation ID, access tokens, admin actions, raw traces)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Redaction Test Campaign', 100, 'approved')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem12 = `idem_redact_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, idempotency_key)
      VALUES ($1, 'secret_corr_id_999', 'SUCCESS', $2)
    `, [campaignId, randIdem12]);

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);

    expect(hostTruth.projection_type).toBe('HOST');
    expect(hostTruth.correlation_id).toBeUndefined();
    expect(hostTruth.admin_next_action).toBeUndefined();
    expect(hostTruth.object_hierarchy).toBeUndefined();
    expect(hostTruth.raw_traces_count).toBeUndefined();
    expect(hostTruth.friendly_delivery_state).toBeDefined();

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('13. Admin diagnostic visibility', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Admin Visibility Campaign', 100, 'approved')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem13 = `idem_admin_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, idempotency_key)
      VALUES ($1, 'admin_corr_777', 'SUCCESS', $2)
    `, [campaignId, randIdem13]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);

    expect(adminTruth.projection_type).toBe('ADMIN');
    expect(adminTruth.correlation_id).toBe('admin_corr_777');
    expect(adminTruth.admin_next_action).toBeDefined();
    expect(adminTruth.object_hierarchy).toBeDefined();

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('14. Tenant isolation (Host 2 cannot view Host 1 campaign)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Tenant Iso Campaign', 100, 'approved')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    await expect(
      CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost2Id, role: 'host' }, pool)
    ).rejects.toThrow('Unauthorized access');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('15. Financial safety projection (Rule H)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, escrow_status)
      VALUES ($1, $2, 'Financial Test Campaign', 200, 'CAMPAIGN_LIVE', 'HOLDING')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    expect(hostTruth.financial_safety.is_money_safe).toBe(true);
    expect(hostTruth.financial_safety.escrow_status).toBe('HOLDING');
    expect(hostTruth.financial_safety.total_paid_cents).toBe(20000);
    expect(hostTruth.financial_safety.ad_spend_allocation_cents).toBe(17000);
    expect(hostTruth.financial_safety.encho_fee_cents).toBe(3000);

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('16. DCO state projection', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, dco_status)
      VALUES ($1, $2, 'DCO Test Campaign', 100, 'CAMPAIGN_LIVE', 'TESTING')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.dco_state.dco_status).toBe('TESTING');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });
});
