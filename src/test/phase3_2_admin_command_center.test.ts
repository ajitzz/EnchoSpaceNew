import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.2: ADMIN COMMAND CENTER & META HIERARCHY TREE CERTIFICATION', () => {
  let adminId: number;
  let hostId: number;
  let campaignId: number;

  beforeAll(async () => {
    // 1. Seed Admin
    const aRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'admin', 'Admin User') RETURNING id",
      [`admin_p32_${Date.now()}@encho.com`]
    );
    adminId = aRes.rows[0].id;

    // 2. Seed Host
    const hRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Host User') RETURNING id",
      [`host_p32_${Date.now()}@encho.com`]
    );
    hostId = hRes.rows[0].id;

    // 3. Seed Base Campaign
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, escrow_status, admin_approved)
      VALUES ($1, 'Phase 3.2 Admin Test Campaign', 200, 'active', 'released', true)
      RETURNING id
    `, [hostId]);
    campaignId = campRes.rows[0].id;
  });

  afterAll(async () => {
    if (campaignId) {
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    }
    if (adminId) await pool.query('DELETE FROM users WHERE id = $1', [adminId]);
    if (hostId) await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
    await pool.end();
  });

  // ================================================================
  // 1. Full Admin Truth Projection Contract
  // ================================================================
  it('1. Returns complete Admin projection contract with all 14 top-level domains', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: adminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(truth.projection_type).toBe('ADMIN');
    expect(truth.access_role).toBe('ADMIN');
    expect(truth.campaign_identity).toBeDefined();
    expect(truth.governance).toBeDefined();
    expect(truth.financial).toBeDefined();
    expect(truth.publishing).toBeDefined();
    expect(truth.external_truth).toBeDefined();
    expect(truth.delivery_truth).toBeDefined();
    expect(truth.object_hierarchy).toBeDefined();
    expect(truth.freshness).toBeDefined();
    expect(truth.failure_intelligence).toBeDefined();
    expect(truth.allowed_actions).toBeDefined();
    expect(truth.action_previews).toBeDefined();
    expect(truth.audit_history).toBeDefined();
    expect(truth.traces).toBeDefined();
  });

  // ================================================================
  // 2. Meta Object Hierarchy Tree & Validation
  // ================================================================
  it('2. Builds complete hierarchy tree (Campaign -> AdSet -> Ad -> Creative) and validates integrity', () => {
    const mockTruth = {
      publish_status: 'SUCCESS',
      meta_external_state: {
        meta_campaign_id: 'cmp_123',
        meta_adset_id: 'ads_456',
        meta_status: 'ACTIVE',
        meta_effective_status: 'ACTIVE',
        meta_review_status: 'APPROVED',
        external_freshness: 'FRESH'
      }
    };
    const mockVariants = [
      { id: 1, meta_creative_id: 'cr_789', meta_ad_id: 'ad_101', media_url: 'https://example.com/img.jpg', status: 'ACTIVE' }
    ];

    const tree = CampaignControlCenterService.buildHierarchyTree(mockTruth, mockVariants);
    expect(tree.campaign.id).toBe('cmp_123');
    expect(tree.adset.id).toBe('ads_456');
    expect(tree.adset.parent_id).toBe('cmp_123');
    expect(tree.ads[0].id).toBe('ad_101');
    expect(tree.ads[0].parent_id).toBe('ads_456');
    expect(tree.creatives[0].id).toBe('cr_789');
    expect(tree.hierarchy_integrity.is_valid).toBe(true);
    expect(tree.hierarchy_integrity.integrity_status).toBe('VALID');
  });

  // ================================================================
  // 3. Hierarchy Integrity Failure & Downgrade
  // ================================================================
  it('3. Flags HIERARCHY_INTEGRITY_FAILURE on orphaned AdSet and prohibits LIVE status', () => {
    const mockBrokenTruth = {
      publish_status: 'SUCCESS',
      governance_status: 'ADMIN_APPROVED',
      meta_external_state: {
        meta_campaign_id: null, // MISSING CAMPAIGN
        meta_adset_id: 'ads_orphan',
        meta_status: 'ACTIVE',
        meta_effective_status: 'ACTIVE',
        external_freshness: 'FRESH'
      }
    };

    const tree = CampaignControlCenterService.buildHierarchyTree(mockBrokenTruth, []);
    expect(tree.hierarchy_integrity.is_valid).toBe(false);
    expect(tree.hierarchy_integrity.integrity_status).toBe('HIERARCHY_INTEGRITY_FAILURE');
    expect(tree.hierarchy_integrity.orphan_count).toBeGreaterThan(0);

    // Verify operational status is downgraded from LIVE to RECONCILIATION_REQUIRED
    const op = CampaignControlCenterService.getOperationalStatus({
      ...mockBrokenTruth,
      object_hierarchy: tree
    });
    expect(op.operational_status).not.toBe('LIVE');
    expect(op.operational_status).toBe('RECONCILIATION_REQUIRED');
  });

  // ================================================================
  // 4. Foreign Account Detection
  // ================================================================
  it('4. Flags FOREIGN_ACCOUNT when external object belongs to unverified ad account', () => {
    const mockForeignTruth = {
      publish_status: 'SUCCESS',
      meta_external_state: {
        meta_campaign_id: 'cmp_foreign',
        meta_adset_id: 'ads_foreign',
        foreign_account: true,
        account_id: 'act_rogue_999'
      }
    };

    const tree = CampaignControlCenterService.buildHierarchyTree(mockForeignTruth, []);
    expect(tree.hierarchy_integrity.is_valid).toBe(false);
    expect(tree.campaign.flags).toContain('FOREIGN_ACCOUNT');
  });

  // ================================================================
  // 5. Sensitive Meta API Trace Redaction
  // ================================================================
  it('5. Strictly sanitizes traces and masks access tokens and bearer authorization', () => {
    const rawTraces = [
      {
        id: 1,
        endpoint: 'https://graph.facebook.com/v20.0/act_123/campaigns',
        method: 'POST',
        response_code: 200,
        request_payload: '{"access_token":"EAAB1234567890abcdef","name":"Test"}',
        response_payload: { id: 'cmp_123', debug: 'Bearer EAAB999999secret' }
      }
    ];

    const sanitized = CampaignControlCenterService.sanitizeTracesForAdmin(rawTraces);
    expect(sanitized[0].request_payload).not.toContain('EAAB1234567890abcdef');
    expect(sanitized[0].request_payload).toContain('[REDACTED_ACCESS_TOKEN]');
    expect(JSON.stringify(sanitized[0].response_payload)).not.toContain('EAAB999999secret');
  });

  // ================================================================
  // 6. Admin Action Authorization & Previews
  // ================================================================
  it('6. Authorizes appropriate admin actions and delivers complete action previews', () => {
    const mockLiveTruth = {
      governance_status: 'ADMIN_APPROVED',
      publish_status: 'SUCCESS',
      meta_external_state: { meta_status: 'LIVE', meta_effective_status: 'ACTIVE' }
    };

    const actions = CampaignControlCenterService.getAllowedAdminActions(mockLiveTruth);
    expect(actions.allowed_actions).toContain('PAUSE');
    expect(actions.allowed_actions).toContain('EMERGENCY_PAUSE');
    expect(actions.allowed_actions).toContain('RESYNC');

    expect(actions.action_previews['PAUSE']).toBeDefined();
    expect(actions.action_previews['PAUSE'].what_will_happen).toBeDefined();
    expect(actions.action_previews['PAUSE'].financial_impact).toBeDefined();
    expect(actions.action_previews['EMERGENCY_PAUSE']).toBeDefined();
  });

  // ================================================================
  // 7. Financial Panel Contract (15/85 Breakdown)
  // ================================================================
  it('7. Enforces exact 15/85 financial ledger calculations and safety verdict', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: adminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(truth.financial.gross_host_charge).toBe(200);
    expect(truth.financial.encho_fee).toBe(30);
    expect(truth.financial.authorized_meta_spend).toBe(170);
    expect(truth.financial.safety_verdict).toBe('SAFE');
  });
});
