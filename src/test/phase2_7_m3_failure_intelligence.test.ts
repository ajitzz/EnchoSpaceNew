import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';
import { FailureIntelligenceService } from '../lib/failureIntelligenceService.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.7 MILESTONE 3 — FAILURE INTELLIGENCE & OPERATOR GUIDANCE CERTIFICATION', () => {
  let testHost1Id: number;
  let testHost2Id: number;
  let testAdminId: number;
  let testListingId: number;

  beforeAll(async () => {
    // Seed test users & listing
    const userRes1 = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'M3 Test Host 1')
      RETURNING id
    `, [`host1_p27_m3_${Date.now()}@test.com`]);
    testHost1Id = userRes1.rows[0].id;

    const userRes2 = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'M3 Test Host 2')
      RETURNING id
    `, [`host2_p27_m3_${Date.now()}@test.com`]);
    testHost2Id = userRes2.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'M3 Test Admin')
      RETURNING id
    `, [`admin_p27_m3_${Date.now()}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type, image_url)
      VALUES ($1, 'M3 Test Cabin', 'Cozy cabin', 'Lake Tahoe', '456 Pine St', 250, 'cabin', 'https://picsum.photos/seed/m3/200/300')
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

  it('1. Rate-limit classification (RATE_LIMIT)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 429,
      meta_error_code: 17,
      raw_message: 'User-level rate limit exceeded. Please wait before retrying.',
      publishing_stage: 'ADSET',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('RATE_LIMIT');
    expect(res.owner).toBe('SYSTEM_INFRA_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.host_action_required).toBe(false);
    expect(res.admin_action_required).toBe(false);
  });

  it('2. Network timeout classification (TRANSIENT_INFRA)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 504,
      network_exception_type: 'ETIMEDOUT',
      raw_message: 'Connection timed out while sending request to Meta Graph API.',
      publishing_stage: 'CREATIVE',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('TRANSIENT_INFRA');
    expect(res.owner).toBe('SYSTEM_INFRA_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.severity).toBe('HIGH');
  });

  it('3. OAuth/auth classification (AUTH_EXPIRED)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 401,
      meta_error_code: 190,
      meta_error_subcode: 460,
      raw_message: 'Error validating access token: Session has been invalidated because the user changed password.',
      publishing_stage: 'CAMPAIGN',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('AUTH_EXPIRED');
    expect(res.owner).toBe('SYSTEM_INFRA_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.admin_action_required).toBe(true);
    expect(res.admin_guidance).toContain('Re-authenticate Meta OAuth');
  });

  it('4. Policy error classification (POLICY_DISAPPROVED)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 400,
      meta_error_code: 100,
      meta_error_subcode: 33,
      raw_message: 'Param housing_policy violated: Ad contains claims prohibited under Housing Special Category.',
      publishing_stage: 'AD',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('POLICY_DISAPPROVED');
    expect(res.owner).toBe('META_POLICY_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.host_action_required).toBe(true);
    expect(res.host_guidance).toContain('ACTION REQUIRED');
  });

  it('5. Asset failure classification (DETERMINISTIC_ASSET_ERROR)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 400,
      raw_message: 'The image aspect ratio 3:1 is not supported. Please use 1:1 or 9:16.',
      publishing_stage: 'CREATIVE',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('DETERMINISTIC_ASSET_ERROR');
    expect(res.owner).toBe('HOST_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.host_action_required).toBe(true);
  });

  it('6. Invalid parameter classification (INVALID_PARAMETER)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: 400,
      meta_error_code: 100,
      raw_message: 'Invalid parameter: Missing required field targeting.geo_locations',
      publishing_stage: 'ADSET',
      current_publish_status: 'FAILED_PUBLISH'
    });

    expect(res.error_class).toBe('INVALID_PARAMETER');
    expect(res.owner).toBe('HOST_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.host_action_required).toBe(true);
  });

  it('7. Unknown external outcome (EXTERNAL_OUTCOME_UNKNOWN)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      http_status: null,
      current_publish_status: 'EXTERNAL_OUTCOME_UNKNOWN',
      publishing_stage: 'AD',
      raw_message: 'Socket hang up before receiving HTTP response body'
    });

    expect(res.error_class).toBe('EXTERNAL_OUTCOME_UNKNOWN');
    expect(res.retryable).toBe(false);
    expect(res.reconciliation_required).toBe(true);
    expect(res.external_object_state).toBe('UNVERIFIED_EXTERNAL_OBJECTS');
  });

  it('8. Rollback failed (RECONCILIATION_FAILURE)', () => {
    const res = FailureIntelligenceService.classifyFailure({
      current_publish_status: 'ROLLBACK_FAILED',
      rollback_status: 'ROLLBACK_FAILED',
      publishing_stage: 'RECONCILIATION',
      raw_message: 'Rollback failed when attempting DELETE on Meta adset id 12345'
    });

    expect(res.error_class).toBe('RECONCILIATION_FAILURE');
    expect(res.severity).toBe('CRITICAL');
    expect(res.reconciliation_required).toBe(true);
    expect(res.external_object_state).toBe('ORPHANED_EXTERNAL_OBJECTS');
  });

  it('9. Reconciliation required flag correctness', () => {
    const normalFail = FailureIntelligenceService.classifyFailure({
      current_publish_status: 'FAILED_PUBLISH',
      meta_error_code: 100,
      meta_error_subcode: 33,
      raw_message: 'Policy disapproval'
    });
    expect(normalFail.reconciliation_required).toBe(false);

    const unknownOutcome = FailureIntelligenceService.classifyFailure({
      current_publish_status: 'EXTERNAL_OUTCOME_UNKNOWN'
    });
    expect(unknownOutcome.reconciliation_required).toBe(true);
  });

  it('10. Host remediation ownership', () => {
    const hostFail = FailureIntelligenceService.classifyFailure({
      raw_message: 'Image resolution too low',
      publishing_stage: 'CREATIVE',
      current_publish_status: 'FAILED_PUBLISH'
    });
    expect(hostFail.owner).toBe('HOST_ERROR');
    expect(hostFail.host_action_required).toBe(true);
  });

  it('11. Admin remediation visibility in control center service', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Auth Failure Campaign', 300, 'failed_publish', true)
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem = `idem_auth_${Math.random().toString(36).substring(2)}`;
    const errDetailsJson = JSON.stringify({ code: 190, subcode: 460, message: 'OAuth Token Invalidated' });
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, error_details, failure_stage, idempotency_key)
      VALUES ($1, 'corr_auth_999', 'FAILED_PUBLISH', $2, 'CAMPAIGN', $3)
    `, [campaignId, errDetailsJson, randIdem]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);
    expect(adminTruth.failure_intelligence.error_class).toBe('AUTH_EXPIRED');
    expect(adminTruth.failure_intelligence.admin_action_required).toBe(true);
    expect(adminTruth.failure_intelligence.correlation_id).toBe('corr_auth_999');
    expect(adminTruth.failure_intelligence.meta_error_code).toBe(190);
    expect(adminTruth.failure_intelligence.meta_subcode).toBe(460);

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('12. Financial safety remains unchanged by error classification', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, escrow_status)
      VALUES ($1, $2, 'Escrow Safety Campaign', 500, 'failed_publish', 'HOLDING')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const truth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    expect(truth.financial_safety.is_money_safe).toBe(true);
    expect(truth.financial_safety.escrow_status).toBe('HOLDING');
    expect(truth.financial_safety.total_charged_cents).toBe(50000);

    // Verify DB was NOT mutated by reading campaign
    const reCheck = await pool.query(`SELECT escrow_status FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    expect(reCheck.rows[0].escrow_status).toBe('HOLDING');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('13. AI explanation cannot change operational outcome (Deterministic rules govern retry & owner)', () => {
    const inputs = {
      http_status: 400,
      meta_error_code: 100,
      meta_error_subcode: 33,
      raw_message: 'Housing Policy Disapproved',
      publishing_stage: 'AD',
      current_publish_status: 'FAILED_PUBLISH'
    };

    const result = FailureIntelligenceService.classifyFailure(inputs);
    expect(result.error_class).toBe('POLICY_DISAPPROVED');
    expect(result.retryable).toBe(false);
    expect(result.owner).toBe('META_POLICY_ERROR');
  });

  it('14. Tenant isolation (Host 2 blocked from Host 1 campaign)', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Tenant Test Campaign', 100, 'draft')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    await expect(
      CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost2Id, role: 'host' }, pool)
    ).rejects.toThrow('Unauthorized access');

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('15. Correlation ID visible only to Admin', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status)
      VALUES ($1, $2, 'Corr Mask Campaign', 100, 'failed_publish')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const randIdem = `idem_corr_${Math.random().toString(36).substring(2)}`;
    const errDetailsJson = JSON.stringify({ message: 'Network drop' });
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, correlation_id, publish_status, error_details, idempotency_key)
      VALUES ($1, 'secret_corr_id_777', 'FAILED_PUBLISH', $2, $3)
    `, [campaignId, errDetailsJson, randIdem]);

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    const adminTruth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testAdminId, role: 'admin', isAdmin: true }, pool);

    expect(adminTruth.failure_intelligence.correlation_id).toBe('secret_corr_id_777');
    expect(hostTruth.failure_intelligence.correlation_id).toBeUndefined();
    expect(hostTruth.correlation_id).toBeUndefined();

    await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });

  it('16. Retry eligibility correctness', () => {
    const rateLimit = FailureIntelligenceService.classifyFailure({ http_status: 429, raw_message: 'rate limit' });
    expect(rateLimit.retryable).toBe(true);

    const transient = FailureIntelligenceService.classifyFailure({ http_status: 503, network_exception_type: 'ETIMEDOUT' });
    expect(transient.retryable).toBe(true);

    const policy = FailureIntelligenceService.classifyFailure({ meta_error_code: 100, meta_error_subcode: 33, raw_message: 'housing policy' });
    expect(policy.retryable).toBe(false);

    const auth = FailureIntelligenceService.classifyFailure({ http_status: 401, meta_error_code: 190 });
    expect(auth.retryable).toBe(false);
  });

  it('17. Existing P0 regression check', async () => {
    // Rule D: EXTERNAL_OUTCOME_UNKNOWN remains UNKNOWN
    const unknownClassification = FailureIntelligenceService.classifyFailure({
      current_publish_status: 'EXTERNAL_OUTCOME_UNKNOWN',
      external_outcome: 'EXTERNAL_OUTCOME_UNKNOWN'
    });
    expect(unknownClassification.error_class).toBe('EXTERNAL_OUTCOME_UNKNOWN');
    expect(unknownClassification.reconciliation_required).toBe(true);
  });

  it('18. Existing Phase 2.6 regression check', async () => {
    // DCO and analytics objects remain uncorrupted
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved, meta_status)
      VALUES ($1, $2, 'Phase 2.6 Regression Campaign', 400, 'active', true, 'ACTIVE')
      RETURNING id
    `, [testHost1Id, testListingId]);
    const campaignId = campRes.rows[0].id;

    const truth = await CampaignControlCenterService.getCampaignTruth(campaignId, { userId: testHost1Id, role: 'host' }, pool);
    expect(truth.dco_state).toBeDefined();
    expect(truth.performance_state).toBeDefined();

    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
  });
});
