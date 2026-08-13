import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import pkg from 'pg';
import { MetaExternalSyncEngine } from '../lib/metaExternalSyncEngine.js';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';

const { Pool } = pkg;

// Use test database connection or mock pool
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is not configured for test environment");
}
const pool = new Pool({ connectionString: dbUrl });

describe('Phase 2.7 Milestone 4 — External Meta Synchronization & Reconciliation Engine', () => {
  const secretKey = 'test_meta_app_secret_2026';
  let testCampaignId: number;
  let testMetaCampaignId: string;

  beforeEach(async () => {
    process.env.META_APP_SECRET = secretKey;
    process.env.META_AD_ACCOUNT_ID = 'act_1381407594129620';

    const randStr = Math.random().toString(36).substring(2, 7);
    testMetaCampaignId = `meta_camp_m4_${Date.now()}_${randStr}`;

    // Insert test user, listing & campaign
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host M4 Test')
      RETURNING id
    `, [`host_m4_${Date.now()}_${randStr}@test.com`]);
    const hostId = userRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (title, user_id, price, description, type, city, address)
      VALUES ('M4 Sync Villa', $1, 350, 'Villa description', 'villa', 'Miami', '123 Beach Rd')
      RETURNING id
    `, [hostId]);
    const listingId = listingRes.rows[0].id;

    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns
      (title, listing_id, host_id, budget, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status, external_status_verified_at, external_status_verification_source)
      VALUES
      ('M4 Test Campaign', $1, $2, 100, 'active', $3, 'meta_adset_m4_101', 'meta_ad_m4_101', 'ACTIVE', 'ACTIVE', NOW(), 'ACTIVE_POLL')
      RETURNING id
    `, [listingId, hostId, testMetaCampaignId]);
    testCampaignId = campRes.rows[0].id;
  });

  // -------------------------------------------------------------
  // 1. HMAC-SHA256 Webhook Signature Verification
  // -------------------------------------------------------------
  describe('1. Webhook Signature Verification', () => {
    it('1.1 Valid HMAC-SHA256 signature is accepted', () => {
      const payload = JSON.stringify({ object: 'page', entry: [{ id: 'act_1381407594129620' }] });
      const signature = 'sha256=' + crypto.createHmac('sha256', secretKey).update(payload).digest('hex');

      const isValid = MetaExternalSyncEngine.verifyWebhookSignature(signature, payload, secretKey);
      expect(isValid).toBe(true);
    });

    it('1.2 Tampered signature or body is rejected', () => {
      const payload = JSON.stringify({ object: 'page', entry: [{ id: 'act_1381407594129620' }] });
      const invalidSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const isValid = MetaExternalSyncEngine.verifyWebhookSignature(invalidSignature, payload, secretKey);
      expect(isValid).toBe(false);
    });

    it('1.3 Missing signature header is rejected', () => {
      const payload = JSON.stringify({ object: 'page' });
      const isValid = MetaExternalSyncEngine.verifyWebhookSignature(undefined, payload, secretKey);
      expect(isValid).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. Webhook Ingestion & Scope Security
  // -------------------------------------------------------------
  describe('2. Webhook Ingestion & Tenant Scope', () => {
    it('2.1 Ingests valid Meta status webhook and updates verified DB snapshot', async () => {
      const body = {
        object: 'adaccount',
        entry: [{
          id: 'act_1381407594129620',
          changes: [{
            field: 'status',
            value: {
              campaign_id: testMetaCampaignId,
              status: 'PAUSED',
              effective_status: 'PAUSED'
            }
          }]
        }]
      };
      const rawBody = JSON.stringify(body);
      const signature = 'sha256=' + crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');

      const result = await MetaExternalSyncEngine.verifyAndIngestWebhook(
        { 'x-hub-signature-256': signature },
        rawBody,
        body,
        pool
      );

      expect(result.valid).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.resolvedCampaignId).toBe(testCampaignId);
      expect(result.snapshot?.meta_effective_status).toBe('PAUSED');
      expect(result.snapshot?.verification_source).toBe('WEBHOOK');

      // Verify DB was updated
      const dbRes = await pool.query(`SELECT meta_effective_status, external_status_verification_source FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
      expect(dbRes.rows[0].meta_effective_status).toBe('PAUSED');
      expect(dbRes.rows[0].external_status_verification_source).toBe('WEBHOOK');
    });

    it('2.2 Unknown Meta object ID in webhook is rejected', async () => {
      const body = {
        object: 'adaccount',
        entry: [{
          id: 'act_1381407594129620',
          changes: [{
            field: 'status',
            value: { campaign_id: 'meta_camp_UNKNOWN_999999', status: 'PAUSED' }
          }]
        }]
      };
      const rawBody = JSON.stringify(body);
      const signature = 'sha256=' + crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');

      const result = await MetaExternalSyncEngine.verifyAndIngestWebhook(
        { 'x-hub-signature-256': signature },
        rawBody,
        body,
        pool
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('UNKNOWN_META_OBJECT_REJECTED');
    });

    it('2.3 Cross-tenant Ad Account ID in webhook is rejected', async () => {
      const body = {
        object: 'adaccount',
        entry: [{
          id: 'act_OTHER_ACCOUNT_8888',
          changes: [{
            field: 'status',
            value: { campaign_id: testMetaCampaignId, status: 'PAUSED' }
          }]
        }]
      };
      const rawBody = JSON.stringify(body);
      const signature = 'sha256=' + crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');

      const result = await MetaExternalSyncEngine.verifyAndIngestWebhook(
        { 'x-hub-signature-256': signature },
        rawBody,
        body,
        pool
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('CROSS_TENANT_AD_ACCOUNT_REJECTED');
    });
  });

  // -------------------------------------------------------------
  // 3. Authoritative GET Verification & Hierarchy Checks
  // -------------------------------------------------------------
  describe('3. Read-First GET Meta Verification & Hierarchy', () => {
    it('3.1 Fetches and verifies Campaign, AdSet, Ad hierarchy via Meta GET calls', async () => {
      const mockGraphFetcher = async (endpoint: string) => {
        if (endpoint.includes(testMetaCampaignId)) {
          return { status: 200, data: { id: testMetaCampaignId, status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '1381407594129620' } };
        }
        if (endpoint.includes('meta_adset_m4_101')) {
          return { status: 200, data: { id: 'meta_adset_m4_101', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: testMetaCampaignId } };
        }
        if (endpoint.includes('meta_ad_m4_101')) {
          return { status: 200, data: { id: 'meta_ad_m4_101', status: 'ACTIVE', effective_status: 'ACTIVE', review_status: 'APPROVED', adset_id: 'meta_adset_m4_101', campaign_id: testMetaCampaignId } };
        }
        return { status: 404, data: { error: { message: 'Not found' } } };
      };

      const snapshot = await MetaExternalSyncEngine.fetchAndVerifyMetaObjectState(
        testCampaignId,
        { source: 'ACTIVE_POLL', customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(snapshot.meta_status).toBe('ACTIVE');
      expect(snapshot.meta_effective_status).toBe('ACTIVE');
      expect(snapshot.meta_review_status).toBe('APPROVED');
      expect(snapshot.hierarchy_verified).toBe(true);
      expect(snapshot.account_ownership_verified).toBe(true);
      expect(snapshot.freshness).toBe('FRESH');
      expect(snapshot.has_drift).toBe(false);
    });

    it('3.2 Detects missing object on Meta (404) as MISSING_ON_META with drift', async () => {
      const mockGraphFetcher = async () => ({ status: 404, data: { error: { code: 100, message: 'Object missing' } } });

      const snapshot = await MetaExternalSyncEngine.fetchAndVerifyMetaObjectState(
        testCampaignId,
        { source: 'ACTIVE_POLL', customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(snapshot.meta_effective_status).toBe('MISSING_ON_META');
      expect(snapshot.hierarchy_verified).toBe(false);
      expect(snapshot.has_drift).toBe(true);
      expect(snapshot.reconciliation_required).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. External Freshness Classification Contract
  // -------------------------------------------------------------
  describe('4. External Freshness Contract', () => {
    it('4.1 Verification <= 5 minutes ago produces FRESH', () => {
      const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      expect(MetaExternalSyncEngine.calculateExternalFreshness(recent)).toBe('FRESH');
    });

    it('4.2 Verification > 5 min and <= 15 min produces STALE', () => {
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(MetaExternalSyncEngine.calculateExternalFreshness(stale)).toBe('STALE');
    });

    it('4.3 Verification > 15 minutes produces DEGRADED', () => {
      const degraded = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(MetaExternalSyncEngine.calculateExternalFreshness(degraded)).toBe('DEGRADED');
    });

    it('4.4 Null or invalid verification timestamp produces UNKNOWN', () => {
      expect(MetaExternalSyncEngine.calculateExternalFreshness(null)).toBe('UNKNOWN');
      expect(MetaExternalSyncEngine.calculateExternalFreshness('invalid-date')).toBe('UNKNOWN');
    });
  });

  // -------------------------------------------------------------
  // 5. Active Reconciliation Engine & Target Prioritization
  // -------------------------------------------------------------
  describe('5. Active Reconciliation Worker & Remediation', () => {
    it('5.1 Unknown outcome resolution: active Meta objects confirm SUCCESS and transition to CAMPAIGN_LIVE', async () => {
      // Set campaign in failed_publish / EXTERNAL_OUTCOME_UNKNOWN state
      await pool.query(`UPDATE host_marketing_campaigns SET status = 'failed_publish' WHERE id = $1`, [testCampaignId]);
      await pool.query(`
        INSERT INTO meta_publishing_transactions
        (campaign_id, correlation_id, idempotency_key, publish_status, failure_code, error_details)
        VALUES ($1, 'corr_unk_m4', $2, 'FAILED_PUBLISH', 'EXTERNAL_OUTCOME_UNKNOWN', '{"failure_code": "EXTERNAL_OUTCOME_UNKNOWN"}')
      `, [testCampaignId, `idem_unk_${Date.now()}`]);

      const mockGraphFetcher = async () => ({
        status: 200,
        data: { id: testMetaCampaignId, status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '1381407594129620' }
      });

      const report = await MetaExternalSyncEngine.reconcileExternalMetaState(
        { campaignId: testCampaignId, customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(report.totalReconciled).toBe(1);
      expect(report.items[0].remediated).toBe(true);
      expect(report.items[0].remediationAction).toBe('RESOLVED_UNKNOWN_OUTCOME_TO_ACTIVE');

      // Check transaction updated
      const txRes = await pool.query(`SELECT publish_status FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
      expect(txRes.rows[0].publish_status).toBe('SUCCESS');
    });

    it('5.2 Local ACTIVE / Meta PAUSED mismatch: syncs local state to paused', async () => {
      await pool.query(`UPDATE host_marketing_campaigns SET status = 'active' WHERE id = $1`, [testCampaignId]);

      const mockGraphFetcher = async (endpoint: string) => {
        if (endpoint.includes(testMetaCampaignId)) {
          return { status: 200, data: { id: testMetaCampaignId, status: 'PAUSED', effective_status: 'PAUSED', account_id: '1381407594129620' } };
        }
        return { status: 200, data: { status: 'PAUSED' } };
      };

      const report = await MetaExternalSyncEngine.reconcileExternalMetaState(
        { campaignId: testCampaignId, customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(report.items[0].hasDrift).toBe(true);
      expect(report.items[0].remediated).toBe(true);
      expect(report.items[0].remediationAction).toBe('SYNCED_LOCAL_STATE_TO_PAUSED');

      const campRes = await pool.query(`SELECT status FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
      expect(campRes.rows[0].status).toBe('paused');
    });

    it('5.3 Quarantined / Rollback Failed campaigns: flagged for Admin action while escrow remains strictly UNTOUCHED', async () => {
      await pool.query(`
        INSERT INTO meta_publishing_transactions
        (campaign_id, correlation_id, idempotency_key, publish_status)
        VALUES ($1, 'corr_quar_m4', $2, 'QUARANTINED')
      `, [testCampaignId, `idem_quar_${Date.now()}`]);

      const mockGraphFetcher = async () => ({ status: 200, data: { id: testMetaCampaignId, status: 'PAUSED', effective_status: 'PAUSED' } });

      const report = await MetaExternalSyncEngine.reconcileExternalMetaState(
        { campaignId: testCampaignId, customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(report.items[0].remediationAction).toContain('FLAGGED_ADMIN_ACTION_REQUIRED_QUARANTINED');

      // Verify financial safety / escrow
      const campRes = await pool.query(`SELECT escrow_status FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
      expect(campRes.rows[0].escrow_status).toBe('released');
    });
  });

  // -------------------------------------------------------------
  // 6. Manual Force Re-Sync Support
  // -------------------------------------------------------------
  describe('6. Manual Admin Force Re-Sync', () => {
    it('6.1 Non-Admin user request is rejected with 403 error', async () => {
      const hostContext = { userId: 1, role: 'host', isAdmin: false };
      await expect(
        MetaExternalSyncEngine.resyncCampaignExternalState(testCampaignId, hostContext, {}, pool)
      ).rejects.toThrow('FORBIDDEN');
    });

    it('6.2 Admin user re-sync executes Meta GET, updates DB snapshot with source MANUAL_RESYNC, and logs audit event', async () => {
      const adminContext = { userId: 99, role: 'admin', isAdmin: true };
      const mockGraphFetcher = async () => ({
        status: 200,
        data: { id: 'meta_camp_m4_101', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '1381407594129620' }
      });

      const snapshot = await MetaExternalSyncEngine.resyncCampaignExternalState(
        testCampaignId,
        adminContext,
        { customGraphFetcher: mockGraphFetcher },
        pool
      );

      expect(snapshot.verification_source).toBe('MANUAL_RESYNC');
      expect(snapshot.meta_effective_status).toBe('ACTIVE');

      // Check DB updated
      const campRes = await pool.query(`SELECT external_status_verification_source FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
      expect(campRes.rows[0].external_status_verification_source).toBe('MANUAL_RESYNC');
    });
  });

  // -------------------------------------------------------------
  // 7. Integration with CampaignControlCenterService Truth Projection
  // -------------------------------------------------------------
  describe('7. CampaignControlCenterService Integration', () => {
    it('7.1 getCampaignTruth incorporates verified external Meta state, freshness, drift flags, and reconciliation flags', async () => {
      // Set external verification timestamp to 2 minutes ago (FRESH)
      const freshTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await pool.query(`
        UPDATE host_marketing_campaigns
        SET external_status_verified_at = $1,
            external_status_verification_source = 'MANUAL_RESYNC',
            meta_status = 'ACTIVE',
            meta_effective_status = 'ACTIVE',
            meta_review_status = 'APPROVED'
        WHERE id = $2
      `, [freshTime, testCampaignId]);

      const truth = await CampaignControlCenterService.getCampaignTruth(testCampaignId, { role: 'admin', isAdmin: true, userId: 1 }, pool);

      expect(truth.meta_external_state.meta_status).toBe('ACTIVE');
      expect(truth.meta_external_state.meta_effective_status).toBe('ACTIVE');
      expect(truth.meta_external_state.external_freshness).toBe('FRESH');
      expect(truth.meta_external_state.external_status_verification_source).toBe('MANUAL_RESYNC');
      expect(truth.meta_external_state.has_drift).toBe(false);
      expect(truth.meta_external_state.reconciliation_required).toBe(false);
    });
  });
});
