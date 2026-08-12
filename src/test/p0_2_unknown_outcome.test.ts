import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { dispatchMetaCampaign, classifyMetaError, computeCampaignApprovalHash } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function createMetaFetchMock(onMutation: (urlStr: string, method: string) => Response | Promise<Response>) {
  return async (url: any, options: any = {}) => {
    const urlStr = String(url);
    const method = (options.method || 'GET').toUpperCase();

    if (method === 'POST') {
      return await onMutation(urlStr, method);
    }

    if (urlStr.includes('/debug_token')) {
      return new Response(JSON.stringify({
        data: {
          is_valid: true,
          app_id: process.env.META_APP_ID || '1347659864208278',
          type: 'USER',
          expires_at: 0,
          scopes: ['ads_management', 'pages_read_engagement', 'pages_show_list']
        }
      }), { status: 200 });
    }

    if (urlStr.includes('/act_') || urlStr.includes('account_status')) {
      return new Response(JSON.stringify({
        id: 'act_123456789',
        account_status: 1,
        disable_reason: 0,
        funding_source: 'fs_123'
      }), { status: 200 });
    }

    if (urlStr.includes('/campaigns') || urlStr.includes('/adsets') || urlStr.includes('/ads')) {
      return new Response(JSON.stringify({
        id: 'meta_obj_123',
        status: 'PAUSED',
        name: '[FAILED_ROLLBACK]_obj'
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      id: '554884541034223',
      name: 'Encho Mock Page',
      access_token: 'page_access_token_123',
      tasks: ['ADVERTISE', 'MANAGE'],
      username: 'encho_official',
      instagram_business_account: { id: '123456789' },
      is_valid: true
    }), { status: 200 });
  };
}

describe('P0-2 — Unknown External Outcome Invariants', () => {
  let testCampaignId: number;
  let testHostId: number;
  let validApprovalHash: string;
  let validApprovalSnapshot: string;

  beforeAll(async () => {
    process.env.META_APP_ID = process.env.META_APP_ID || '1347659864208278';
    process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test_token_p02';
    process.env.META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_123456789';
    process.env.META_PAGE_ID = process.env.META_PAGE_ID || '554884541034223';
    process.env.META_INSTAGRAM_ACCOUNT_ID = process.env.META_INSTAGRAM_ACCOUNT_ID || '123456789';

    // Seed a test host and campaign with preflight-compliant fields
    const hostRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'P0-2 Test Admin')
      RETURNING id
    `, [`p02_admin_${Date.now()}@example.com`]);
    testHostId = hostRes.rows[0].id;

    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, title, budget, status, media_urls, description,
        admin_approved, policy_cleared, target_radius_km, target_locations
      ) VALUES ($1, 'P0-2 Test Campaign', 100, 'approved', '["https://images.unsplash.com/photo-1512917774080-9991f1c4c750"]', 'Experience luxury stay', true, true, 25, '["US"]')
      RETURNING *
    `, [testHostId]);
    const campRow = campRes.rows[0];
    testCampaignId = campRow.id;

    const { hash, snapshot } = computeCampaignApprovalHash(campRow);
    validApprovalHash = hash;
    validApprovalSnapshot = JSON.stringify(snapshot);

    await pool.query(`
      UPDATE host_marketing_campaigns 
      SET approval_hash = $1, approval_snapshot = $2 
      WHERE id = $3
    `, [validApprovalHash, validApprovalSnapshot, testCampaignId]);
  });

  beforeEach(async () => {
    if (testCampaignId) {
      await pool.query(`DELETE FROM meta_publishing_dlq WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`
        UPDATE host_marketing_campaigns 
        SET status = 'approved', admin_approved = true, policy_cleared = true, target_radius_km = 25,
            approval_hash = $2, approval_snapshot = $3
        WHERE id = $1
      `, [testCampaignId, validApprovalHash, validApprovalSnapshot]);
    }
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query(`DELETE FROM meta_publishing_events WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_dlq WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
    }
    if (testHostId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [testHostId]);
    }
    await pool.end();
  });

  it('1. Network timeout during Campaign creation results in EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const correlationId = 'test-corr-p02-timeout-' + Date.now();
    const mockReq: any = { user: { id: testHostId, role: 'admin' } };

    const originalFetch = global.fetch;
    global.fetch = createMetaFetchMock((urlStr) => {
      if (urlStr.includes('/campaigns')) {
        throw new TypeError('fetch failed: ETIMEDOUT socket network timeout');
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const result = await dispatchMetaCampaign(testCampaignId, mockReq, correlationId);
      expect(result).toBe(false);

      const txRes = await pool.query(`
        SELECT * FROM meta_publishing_transactions WHERE correlation_id = $1
      `, [correlationId]);

      expect(txRes.rows.length).toBe(1);
      const tx = txRes.rows[0];
      expect(tx.publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');
      expect(tx.failure_code).toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
      expect(tx.meta_campaign_id).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('2. Connection reset during AdSet creation preserves created Campaign ID and sets status EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const correlationId = 'test-corr-p02-adset-reset-' + Date.now();
    const mockReq: any = { user: { id: testHostId, role: 'admin' } };

    const originalFetch = global.fetch;
    global.fetch = createMetaFetchMock((urlStr) => {
      if (urlStr.includes('/campaigns')) {
        return new Response(JSON.stringify({ id: 'meta_camp_p02_reset_123' }), { status: 200 });
      }
      if (urlStr.includes('/adsets')) {
        throw new Error('read ECONNRESET - connection reset by peer');
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const result = await dispatchMetaCampaign(testCampaignId, mockReq, correlationId);
      expect(result).toBe(false);

      const txRes = await pool.query(`
        SELECT * FROM meta_publishing_transactions WHERE correlation_id = $1
      `, [correlationId]);

      expect(txRes.rows.length).toBe(1);
      const tx = txRes.rows[0];
      expect(tx.publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');
      expect(tx.meta_campaign_id).toBe('meta_camp_p02_reset_123');
      expect(tx.failure_code).toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
      expect(tx.rollback_status).toBe('QUARANTINED');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('3. Deterministic Meta API 400 rejection is NOT classified as EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const correlationId = 'test-corr-p02-meta400-' + Date.now();
    const mockReq: any = { user: { id: testHostId, role: 'admin' } };

    const originalFetch = global.fetch;
    global.fetch = createMetaFetchMock((urlStr) => {
      if (urlStr.includes('/campaigns')) {
        return new Response(JSON.stringify({ id: 'meta_camp_det400' }), { status: 200 });
      }
      if (urlStr.includes('/adsets')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Invalid parameter: daily_budget must be >= 100',
            type: 'OAuthException',
            code: 100,
            fbtrace_id: 'fbtrace_det_400'
          }
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const result = await dispatchMetaCampaign(testCampaignId, mockReq, correlationId);
      expect(result).toBe(false);

      const txRes = await pool.query(`
        SELECT * FROM meta_publishing_transactions WHERE correlation_id = $1
      `, [correlationId]);

      expect(txRes.rows.length).toBe(1);
      const tx = txRes.rows[0];
      expect(tx.publish_status).not.toBe('EXTERNAL_OUTCOME_UNKNOWN');
      expect(tx.publish_status).toBe('QUARANTINED');
      expect(tx.failure_code).not.toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('4. Idempotency blocks dispatch if campaign has EXTERNAL_OUTCOME_UNKNOWN status', async () => {
    const unknownCorrelationId = 'test-corr-p02-block-' + Date.now();
    const newCorrelationId = 'test-corr-p02-blocked-attempt-' + Date.now();
    const mockReq: any = { user: { id: testHostId, role: 'admin' } };

    // Set transaction directly to EXTERNAL_OUTCOME_UNKNOWN
    await pool.query(`
      INSERT INTO meta_publishing_transactions (
        campaign_id, idempotency_key, correlation_id, publish_status, failure_code
      ) VALUES ($1, $2, $3, 'EXTERNAL_OUTCOME_UNKNOWN', 'EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME')
    `, [testCampaignId, `publish_meta_camp_${testCampaignId}`, unknownCorrelationId]);

    try {
      const result = await dispatchMetaCampaign(testCampaignId, mockReq, newCorrelationId);
      expect(result).toBe(false);

      // Verify transaction status remained EXTERNAL_OUTCOME_UNKNOWN
      const txRes = await pool.query(`
        SELECT * FROM meta_publishing_transactions WHERE campaign_id = $1
      `, [testCampaignId]);
      expect(txRes.rows[0].publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');
    } finally {
      await pool.query(`DELETE FROM meta_publishing_dlq WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
    }
  });

  it('5. classifyMetaError taxonomy correctly distinguishes network timeout vs Meta API errors', () => {
    const timeoutClassification = classifyMetaError({
      error: { message: 'fetch failed: ETIMEDOUT', isNetworkTimeout: true, code: 0 }
    });
    expect(timeoutClassification.code_name).toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
    expect(timeoutClassification.category).toBe('NETWORK_TRANSPORT');

    const metaErrorClassification = classifyMetaError({
      error: { message: 'Permissions error', code: 200, type: 'OAuthException' }
    });
    expect(metaErrorClassification.code_name).not.toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
    expect(metaErrorClassification.code_name).toBe('AUTH_MISSING_PERMISSIONS');
  });
});
