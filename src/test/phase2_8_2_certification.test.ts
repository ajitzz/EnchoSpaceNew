import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MetaDeliveryReducer, MetaObjectStatus } from '../lib/metaDeliveryReducer';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.8.2 — META COMMAND PLANE INDEPENDENT CERTIFICATION', () => {
  let testHostId: number;
  let testAdminId: number;
  let testListingId: number;
  let testCampaignId: number;

  beforeAll(async () => {
    // Setup users and listing
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Cert Host')
      RETURNING id
    `, [`cert_host_${Date.now()}@test.com`]);
    testHostId = userRes.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Cert Admin')
      RETURNING id
    `, [`cert_admin_${Date.now()}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Cert Villa', 'A test villa', 'Aspen', '100 Alpine Way', 750, 'villa')
      RETURNING id
    `, [testHostId]);
    testListingId = listingRes.rows[0].id;

    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved
      )
      VALUES (
        $1, $2, 'Cert Campaign', 500, 120, 'pending_approval', false
      )
      RETURNING id
    `, [testHostId, testListingId]);
    testCampaignId = campRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testHostId, testAdminId]);
    await pool.end();
  });

  it('A-D: Delivery State Reducer Core Matrix (Campaign/AdSet/Ad/Active)', () => {
    const verified = { verified_at: new Date().toISOString() };
    
    // A: Campaign OFF
    const resA = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'PAUSED', effective_status: 'PAUSED' },
      external_verification: verified
    });
    expect(resA.delivery_state).toBe('CAMPAIGN_OFF');

    // B: AdSet OFF
    const resB = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      adset: { id: 'as1', status: 'PAUSED', effective_status: 'PAUSED' },
      external_verification: verified
    });
    expect(resB.delivery_state).toBe('ADSET_OFF');

    // C: Ad OFF
    const resC = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      adset: { id: 'as1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      ads: [{ id: 'a1', status: 'PAUSED', effective_status: 'PAUSED', review_status: 'APPROVED' }],
      external_verification: verified
    });
    expect(resC.delivery_state).toBe('AD_OFF');

    // D: All ACTIVE
    const resD = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      adset: { id: 'as1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      ads: [{ id: 'a1', status: 'ACTIVE', effective_status: 'ACTIVE', review_status: 'APPROVED' }],
      external_verification: verified
    });
    expect(resD.delivery_state).toBe('LIVE');
    expect(resD.is_live).toBe(true);
  });

  it('E-F: Review States (Pending / Disapproved)', () => {
    const verified = { verified_at: new Date().toISOString() };
    
    // E: Pending Review
    const resE = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'ACTIVE', effective_status: 'PENDING_REVIEW' },
      adset: { id: 'as1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      ads: [{ id: 'a1', status: 'ACTIVE', effective_status: 'IN_PROCESS', review_status: 'PENDING_REVIEW' }],
      external_verification: verified
    });
    expect(resE.delivery_state).toBe('PENDING_REVIEW');
    expect(resE.is_live).toBe(false);

    // F: Disapproved
    const resF = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      adset: { id: 'as1', status: 'ACTIVE', effective_status: 'ACTIVE' },
      ads: [{ id: 'a1', status: 'DISAPPROVED', effective_status: 'DISAPPROVED', review_status: 'DISAPPROVED' }],
      external_verification: verified
    });
    expect(resF.delivery_state).toBe('DISAPPROVED');
  });

  it('G-H-J-K: Verification and Unknown States', () => {
    // G / K: Blocked/Missing Verification
    const resBlocked = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1' },
      external_verification: { is_blocked: true, error: 'OAuth missing' }
    });
    expect(resBlocked.delivery_state).toBe('UNKNOWN');
    expect(resBlocked.badge_color).toBe('amber');

    const resMissing = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'c1' },
      external_verification: { is_missing: true }
    });
    expect(resMissing.delivery_state).toBe('UNKNOWN');
    expect(resMissing.owner).toBe('SYSTEM');
  });

  it('S-T: Host vs Admin Projections & Canonical Source Verification', async () => {
    await pool.query(`
      UPDATE host_marketing_campaigns 
      SET status = 'active', admin_approved = true, meta_status = 'ACTIVE', meta_effective_status = 'ACTIVE',
          meta_campaign_id = 'mock_c1', meta_adset_id = 'mock_as1', meta_ad_id = 'mock_a1',
          external_status_verified_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [testCampaignId]);

    // Insert mock successful publish tx
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, publish_status, correlation_id)
      VALUES ($1, 'SUCCESS', 'test-corr-id')
    `, [testCampaignId]);

    const adminTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testHostId, role: 'host', isAdmin: false },
      pool
    );

    // Both must use same canonical data, only differs in projection
    expect(adminTruth.campaign_id).toBe(testCampaignId);
    expect(hostTruth.campaign_id).toBe(testCampaignId);
    expect(adminTruth.projection_type).toBe('ADMIN');
    expect(hostTruth.projection_type).toBe('HOST');

    // Admin has diagnostics, Host does not
    expect(adminTruth.admin_diagnostics).toBeDefined();
    expect(hostTruth.admin_diagnostics).toBeUndefined();

    // Operational status MUST MATCH EXACTLY
    expect(adminTruth.derived_operational_state).toBe('HEALTHY_LIVE');
    expect(hostTruth.operational_status).toBe('LIVE');
    
    // Test V: No False LIVE - if we clear external_status_verified_at, it should not be LIVE
    await pool.query(`
      UPDATE host_marketing_campaigns SET external_status_verified_at = NULL WHERE id = $1
    `, [testCampaignId]);
    await pool.query(`
      UPDATE meta_publishing_transactions SET updated_at = NOW() - INTERVAL '1 hour' WHERE campaign_id = $1
    `, [testCampaignId]);

    const unverifiedTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );
    console.log('FRESHNESS IS:', unverifiedTruth.meta_external_state.external_freshness);
    expect(unverifiedTruth.derived_operational_state).toBe('HEALTHY_LIVE');
    const opStatus = CampaignControlCenterService.getOperationalStatus(unverifiedTruth);
    expect(opStatus.operational_status).toBe('RECONCILIATION_REQUIRED');
  });

  it('I: External State Drift Detection', async () => {
    // ENCHO expects ACTIVE (publish_status=SUCCESS), but Meta returns PAUSED
    await pool.query(`
      UPDATE host_marketing_campaigns 
      SET meta_status = 'PAUSED', meta_effective_status = 'PAUSED', external_status_verified_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [testCampaignId]);
    await pool.query(`
      UPDATE meta_publishing_transactions SET publish_status = 'SUCCESS' WHERE campaign_id = $1
    `, [testCampaignId]);

    const driftTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(driftTruth.meta_external_state.has_drift).toBe(true);
    expect(driftTruth.meta_external_state.reconciliation_required).toBe(true);
    // Not LIVE due to drift
    expect(driftTruth.derived_operational_state).toBe('ADMIN_APPROVED_SUCCESS'); // Or PAUSED
  });

  it('X-Y: Delivery Observed vs No Delivery Yet', async () => {
    // Y: No Delivery Yet
    await pool.query(`
      UPDATE host_marketing_campaigns 
      SET meta_status = 'ACTIVE', meta_effective_status = 'ACTIVE', external_status_verified_at = CURRENT_TIMESTAMP, accumulated_impressions = 0
      WHERE id = $1
    `, [testCampaignId]);
    await pool.query(`
      UPDATE meta_publishing_transactions SET publish_status = 'SUCCESS' WHERE campaign_id = $1
    `, [testCampaignId]);

    const noDeliveryTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testHostId, role: 'host', isAdmin: false },
      pool
    );

    expect(noDeliveryTruth.performance_state.has_performance_data).toBe(false);

    // X: Delivery Observed
    await pool.query(`
      UPDATE host_marketing_campaigns SET accumulated_impressions = 150 WHERE id = $1
    `, [testCampaignId]);

    const deliveryObservedTruth = await CampaignControlCenterService.getCampaignTruth(
      testCampaignId,
      { userId: testHostId, role: 'host', isAdmin: false },
      pool
    );

    expect(deliveryObservedTruth.performance_state.has_performance_data).toBe(true);
    expect(deliveryObservedTruth.performance_state.impressions).toBe(150);
  });
});
