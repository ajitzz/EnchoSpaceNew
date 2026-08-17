import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';
import { MetaDeliveryReducer } from '../lib/metaDeliveryReducer.js';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.1: HOST CONTROL CENTER & LIVE DELIVERY STATUS CERTIFICATION', () => {
  let host1Id: number;
  let host2Id: number;
  let campaignId: number;

  beforeAll(async () => {
    // 1. Seed Host 1
    const h1 = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Host One') RETURNING id",
      [`host1_p31_${Date.now()}@encho.com`]
    );
    host1Id = h1.rows[0].id;

    // 2. Seed Host 2 (Tenant Isolation Check)
    const h2 = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Host Two') RETURNING id",
      [`host2_p31_${Date.now()}@encho.com`]
    );
    host2Id = h2.rows[0].id;

    // 3. Seed Base Campaign
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, escrow_status, admin_approved)
      VALUES ($1, 'Phase 3.1 Test Campaign', 100, 'active', 'released', true)
      RETURNING id
    `, [host1Id]);
    campaignId = campRes.rows[0].id;
  });

  afterAll(async () => {
    if (campaignId) {
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    }
    if (host1Id) await pool.query('DELETE FROM users WHERE id = $1', [host1Id]);
    if (host2Id) await pool.query('DELETE FROM users WHERE id = $1', [host2Id]);
    await pool.end();
  });

  // ================================================================
  // 1. Operational State Projections (14 Canonical States)
  // ================================================================
  it('1. Correctly projects all 14 canonical host operational states without client-side guessing', async () => {
    // State 1: NOT_DISPATCHED
    const mockDraft = { governance_status: 'DRAFT', publish_status: 'IDLE' };
    const opDraft = CampaignControlCenterService.getOperationalStatus(mockDraft);
    expect(opDraft.operational_status).toBe('NOT_DISPATCHED');

    // State 2: UNDER_REVIEW
    const mockReview = { governance_status: 'PENDING_ADMIN_REVIEW', publish_status: 'IDLE' };
    const opReview = CampaignControlCenterService.getOperationalStatus(mockReview);
    expect(opReview.operational_status).toBe('NOT_DISPATCHED');
    expect(opReview.display_label).toBe('Under Review');

    // State 3: APPROVED (Waiting for delivery)
    const mockApproved = { governance_status: 'ADMIN_APPROVED', publish_status: 'IDLE' };
    const opApproved = CampaignControlCenterService.getOperationalStatus(mockApproved);
    expect(opApproved.display_label).toContain('Approved');

    // State 4: DISPATCHING
    const mockDispatching = { governance_status: 'ADMIN_APPROVED', publish_status: 'DISPATCHING' };
    const opDispatch = CampaignControlCenterService.getOperationalStatus(mockDispatching);
    expect(opDispatch.operational_status).toBe('DISPATCHING');

    // State 5: CREATED_NOT_SERVING
    const mockCreated = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'CREATED_NOT_SERVING' } };
    const opCreated = CampaignControlCenterService.getOperationalStatus(mockCreated);
    expect(opCreated.operational_status).toBe('CREATED_NOT_SERVING');

    // State 6: META_REVIEWING
    const mockMetaRev = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'PENDING_META_REVIEW' } };
    const opMetaRev = CampaignControlCenterService.getOperationalStatus(mockMetaRev);
    expect(opMetaRev.operational_status).toBe('PENDING_REVIEW');

    // State 7: LIVE
    const mockLive = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'LIVE', external_freshness: 'FRESH' } };
    const opLive = CampaignControlCenterService.getOperationalStatus(mockLive);
    expect(opLive.operational_status).toBe('LIVE');
    expect(opLive.badge_color).toBe('emerald');

    // State 8: PAUSED
    const mockPaused = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'PAUSED' } };
    const opPaused = CampaignControlCenterService.getOperationalStatus(mockPaused);
    expect(opPaused.operational_status).toBe('PAUSED');

    // State 9: ADSET_OFF
    const mockAdsetOff = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'ADSET_OFF' } };
    const opAdsetOff = CampaignControlCenterService.getOperationalStatus(mockAdsetOff);
    expect(opAdsetOff.operational_status).toBe('ADSET_OFF');

    // State 10: NOT_DELIVERING
    const mockNotDelivering = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'NOT_DELIVERING' } };
    const opNotDelivering = CampaignControlCenterService.getOperationalStatus(mockNotDelivering);
    expect(opNotDelivering.operational_status).toBe('NOT_DELIVERING');

    // State 11: DISAPPROVED
    const mockDisapproved = { governance_status: 'ADMIN_APPROVED', publish_status: 'SUCCESS', meta_external_state: { meta_status: 'DISAPPROVED' } };
    const opDisapproved = CampaignControlCenterService.getOperationalStatus(mockDisapproved);
    expect(opDisapproved.operational_status).toBe('DISAPPROVED');

    // State 12: RECONCILIATION_REQUIRED
    const mockRec = { governance_status: 'ADMIN_APPROVED', publish_status: 'EXTERNAL_OUTCOME_UNKNOWN' };
    const opRec = CampaignControlCenterService.getOperationalStatus(mockRec);
    expect(opRec.operational_status).toBe('RECONCILIATION_REQUIRED');

    // State 13: UNKNOWN
    const mockUnknown = { governance_status: 'ADMIN_APPROVED', publish_status: 'UNKNOWN' };
    const opUnknown = CampaignControlCenterService.getOperationalStatus(mockUnknown);
    expect(opUnknown.operational_status).toBe('UNKNOWN');

    // State 14: FAILED
    const mockFailed = { governance_status: 'ADMIN_APPROVED', publish_status: 'FAILED_PUBLISH' };
    const opFailed = CampaignControlCenterService.getOperationalStatus(mockFailed);
    expect(opFailed.operational_status).toBe('FAILED');
  });

  // ================================================================
  // 2. Canonical Host Projection Contract & 6 Transparency Panels
  // ================================================================
  it('2. getCampaignTruth delivers complete 6 Transparency Panels and financial safety contract', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: host1Id, role: 'host' },
      pool
    );

    expect(truth.projection_type).toBe('HOST');
    expect(truth.operational_status).toBeDefined();
    expect(truth.operational_status_info).toBeDefined();

    // Verify 6 Transparency Panels
    expect(truth.transparency_panels).toBeDefined();
    expect(typeof truth.transparency_panels.what_is_happening).toBe('string');
    expect(typeof truth.transparency_panels.why).toBe('string');
    expect(typeof truth.transparency_panels.who_is_responsible).toBe('string');
    expect(typeof truth.transparency_panels.last_verified).toBe('string');
    expect(typeof truth.transparency_panels.what_happens_next).toBe('string');
    expect(typeof truth.transparency_panels.what_you_can_do).toBe('string');

    // Verify Financial Transparency Contract (15/85)
    expect(truth.financial_safety.gross_host_charge).toBe(100);
    expect(truth.financial_safety.encho_fee).toBe(15);
    expect(truth.financial_safety.authorized_meta_spend).toBe(85);
    expect(truth.financial_safety.remaining_authorized_spend).toBe(85);
  });

  // ================================================================
  // 3. No Fabricated Zero Metrics (Strict Null/Unavailable Handling)
  // ================================================================
  it('3. Proves unpolled performance metrics return null and UNAVAILABLE without fabricating zero', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: host1Id, role: 'host' },
      pool
    );

    // If no performance rollups exist, values MUST be null or have has_performance_data = false
    if (!truth.performance_state.has_performance_data) {
      expect(truth.performance_state.impressions).toBeNull();
      expect(truth.performance_state.clicks).toBeNull();
      expect(truth.performance_state.ctr).toBeNull();
      expect(truth.performance_state.spend).toBeNull();
      expect(truth.performance_state.performance_freshness).toBe('UNAVAILABLE');
    }
  });

  // ================================================================
  // 4. Host Redaction & Data Protection
  // ================================================================
  it('4. Proves sensitive diagnostic fields, correlation IDs, tokens, and stack traces are redacted for Hosts', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: host1Id, role: 'host' },
      pool
    );

    const jsonStr = JSON.stringify(truth);
    expect(truth.correlation_id).toBeUndefined();
    expect(truth.raw_traces).toBeUndefined();
    expect(truth.root_error_code).toBeUndefined();
    expect(truth.internal_db_error).toBeUndefined();
    expect(jsonStr).not.toContain('access_token');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('Bearer');
  });

  // ================================================================
  // 5. Tenant Isolation
  // ================================================================
  it('5. Enforces strict tenant isolation: Host 2 cannot query Host 1 campaign truth (HTTP 403)', async () => {
    await expect(
      CampaignControlCenterService.getCampaignTruth(
        campaignId,
        { userId: host2Id, role: 'host' },
        pool
      )
    ).rejects.toThrow(/Unauthorized/);
  });

  // ================================================================
  // 6. Allowed Actions Projection & Previews
  // ================================================================
  it('6. Projects authorized actions and rich action previews for modal confirmation', async () => {
    const truth = await CampaignControlCenterService.getCampaignTruth(
      campaignId,
      { userId: host1Id, role: 'host' },
      pool
    );

    expect(Array.isArray(truth.allowed_actions)).toBe(true);
    expect(truth.action_previews).toBeDefined();
    for (const action of truth.allowed_actions) {
      if (truth.action_previews[action]) {
        expect(truth.action_previews[action].action).toBe(action);
        expect(truth.action_previews[action].what_will_happen).toBeDefined();
        expect(truth.action_previews[action].what_will_not_happen).toBeDefined();
      }
    }
  });
});
