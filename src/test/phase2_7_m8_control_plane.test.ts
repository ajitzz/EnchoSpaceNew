import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { MetaControlPlaneService } from '../lib/metaControlPlaneService.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.7 MILESTONE 8 — SAFE META CAMPAIGN MANAGEMENT CONTROL PLANE', () => {
  let testHostAId: number;
  let testHostBId: number;
  let testAdminId: number;
  let testListingId: number;
  let testCampaignId: number;
  let testVariantId: number;

  beforeAll(async () => {
    // Seed Host A, Host B, Admin
    const userARes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'M8 Host A')
      RETURNING id
    `, [`m8_host_a_${Date.now()}@test.com`]);
    testHostAId = userARes.rows[0].id;

    const userBRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'M8 Host B')
      RETURNING id
    `, [`m8_host_b_${Date.now()}@test.com`]);
    testHostBId = userBRes.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'M8 Admin')
      RETURNING id
    `, [`m8_admin_${Date.now()}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type, image_url)
      VALUES ($1, 'M8 Mountain Villa', 'Scenic mountain view', 'Aspen', '100 Alpine Way', 750, 'villa', 'https://picsum.photos/seed/m8/200/300')
      RETURNING id
    `, [testHostAId]);
    testListingId = listingRes.rows[0].id;

    // Seed Active Campaign
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status
      )
      VALUES (
        $1, $2, 'M8 Alpine Summer Ad', 500, 120, 'active', true,
        'mock_meta_camp_888', 'mock_meta_adset_888', 'mock_meta_ad_888', 'ACTIVE', 'ACTIVE',
        'HOLDING', 75, 425, 'paid'
      )
      RETURNING id
    `, [testHostAId, testListingId]);
    testCampaignId = campRes.rows[0].id;

    // Seed Creative Variant
    const varRes = await pool.query(`
      INSERT INTO campaign_creative_variants (
        campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id
      )
      VALUES (
        $1, 'https://picsum.photos/seed/m8/200/300', 'image', 'sha256_m8', 'ACTIVE', true, 'mock_meta_creative_888', 'mock_meta_ad_888'
      )
      RETURNING id
    `, [testCampaignId]);
    testVariantId = varRes.rows[0].id;
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query(`DELETE FROM campaign_creative_variants WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_events WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1`, [testCampaignId]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
    }
    if (testListingId) await pool.query(`DELETE FROM listings WHERE id = $1`, [testListingId]);
    if (testHostAId) await pool.query(`DELETE FROM users WHERE id = $1`, [testHostAId]);
    if (testHostBId) await pool.query(`DELETE FROM users WHERE id = $1`, [testHostBId]);
    if (testAdminId) await pool.query(`DELETE FROM users WHERE id = $1`, [testAdminId]);
    await pool.end();
  });

  it('1. Generates 6-part FAANG Action Explanation Previews for Host & Admin', async () => {
    // Action preview for PAUSE
    const pausePreview = await MetaControlPlaneService.generateActionPreview(
      testCampaignId,
      'PAUSE',
      { userId: testHostAId, role: 'host' },
      {},
      pool
    );

    expect(pausePreview.action).toBe('PAUSE');
    expect(pausePreview.is_executable).toBe(true);
    expect(pausePreview.what_will_happen).toContain('PAUSED');
    expect(pausePreview.what_will_not_happen).toContain('budget');
    expect(pausePreview.why_allowed).toBeDefined();
    expect(pausePreview.expected_result).toBeDefined();
    expect(pausePreview.failure_or_unknown_outcome).toBeDefined();

    // Action preview for RESYNC
    const resyncPreview = await MetaControlPlaneService.generateActionPreview(
      testCampaignId,
      'RESYNC',
      { userId: testHostAId, role: 'host' },
      {},
      pool
    );
    expect(resyncPreview.action).toBe('RESYNC');
    expect(resyncPreview.is_executable).toBe(true);

    // Action preview for RECONCILE (Admin only)
    const adminReconcilePreview = await MetaControlPlaneService.generateActionPreview(
      testCampaignId,
      'RECONCILE',
      { userId: testAdminId, role: 'admin', isAdmin: true },
      {},
      pool
    );
    expect(adminReconcilePreview.is_executable).toBe(true);

    // Host checking preview for RECONCILE should be non-executable / blocked
    const hostReconcilePreview = await MetaControlPlaneService.generateActionPreview(
      testCampaignId,
      'RECONCILE',
      { userId: testHostAId, role: 'host' },
      {},
      pool
    );
    expect(hostReconcilePreview.is_executable).toBe(false);
    expect(hostReconcilePreview.blocking_reason).toContain('Admin authorization');
  });

  it('2. Enforces Tenant Isolation and Role-Based Access Control', async () => {
    // Host B attempting to access Host A campaign should fail with 403
    await expect(
      MetaControlPlaneService.pauseCampaign(
        testCampaignId,
        { userId: testHostBId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/Tenant isolation/i);

    // Host A attempting admin-restricted action (e.g. RECONCILE) should fail with 403
    await expect(
      MetaControlPlaneService.executeControlAction(
        testCampaignId,
        'RECONCILE',
        { userId: testHostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/restricted to Admin role/i);
  });

  it('3. Executes Authoritative PAUSE Pipeline with Independent Verification and Financial Invariant Guarantees', async () => {
    let mockGraphCallCount = 0;
    const customFetcher = async (endpoint: string, options?: any) => {
      mockGraphCallCount++;
      if (options?.method === 'POST') {
        return { status: 200, data: { success: true } };
      }
      return { status: 200, data: { id: 'mock_meta_camp_888', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    const idempotencyKey = `pause_idem_${Date.now()}`;
    const result = await MetaControlPlaneService.pauseCampaign(
      testCampaignId,
      { userId: testHostAId, role: 'host' },
      { idempotencyKey, customGraphFetcher: customFetcher },
      pool
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe('PAUSE');
    expect(result.new_state.local_status).toBe('paused');
    expect(result.new_state.meta_status).toBe('PAUSED');
    expect(result.verified_externally).toBe(true);

    // Verify Campaign state in DB
    const campInDb = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    const row = campInDb.rows[0];
    expect(row.status).toBe('paused');
    expect(row.meta_status).toBe('PAUSED');

    // Verify Financial Invariants: Absolutely NO changes to financial fields
    expect(parseFloat(row.budget)).toBe(500);
    expect(parseFloat(row.spent)).toBe(120);
    expect(parseFloat(row.optimization_fee)).toBe(75);
    expect(parseFloat(row.ad_spend_pool)).toBe(425);
    expect(row.escrow_status).toBe('HOLDING');

    // Verify Audit Event logged in meta_publishing_events
    const eventInDb = await pool.query(
      'SELECT * FROM meta_publishing_events WHERE campaign_id = $1 AND correlation_id = $2',
      [testCampaignId, idempotencyKey]
    );
    expect(eventInDb.rows.length).toBe(1);
    expect(eventInDb.rows[0].event_type).toBe('CONTROL_ACTION_PAUSE');
  });

  it('4. Enforces Durable Idempotency on repeated execution', async () => {
    const idempotencyKey = `idem_dup_test_${Date.now()}`;
    let postCalls = 0;
    const customFetcher = async (endpoint: string, options?: any) => {
      if (options?.method === 'POST') postCalls++;
      return { status: 200, data: { id: 'mock_meta_camp_888', status: 'ACTIVE', effective_status: 'ACTIVE' } };
    };

    // First call: RESUME
    const firstRes = await MetaControlPlaneService.resumeCampaign(
      testCampaignId,
      { userId: testHostAId, role: 'host' },
      { idempotencyKey, customGraphFetcher: customFetcher },
      pool
    );
    expect(firstRes.success).toBe(true);
    expect(firstRes.reused_idempotent_result).toBeFalsy();
    expect(postCalls).toBe(2); // 1 POST for campaign + 1 POST for adset

    // Second call with same idempotency key: Should return idempotent reuse without re-mutating Meta
    const secondRes = await MetaControlPlaneService.resumeCampaign(
      testCampaignId,
      { userId: testHostAId, role: 'host' },
      { idempotencyKey, customGraphFetcher: customFetcher },
      pool
    );
    expect(secondRes.success).toBe(true);
    expect(secondRes.reused_idempotent_result).toBe(true);
    expect(postCalls).toBe(2); // Did not make a 2nd round of POST mutations
  });

  it('5. Executes Authoritative RESYNC & RECONCILE Actions', async () => {
    const customFetcher = async (endpoint: string) => {
      return {
        status: 200,
        data: {
          id: 'mock_meta_camp_888',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          configured_status: 'ACTIVE'
        }
      };
    };

    // Resync
    const resyncRes = await MetaControlPlaneService.resyncCampaign(
      testCampaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      { customGraphFetcher: customFetcher },
      pool
    );
    expect(resyncRes.success).toBe(true);
    expect(resyncRes.action).toBe('RESYNC');
    expect(resyncRes.verified_externally).toBe(true);

    // Reconcile
    const reconcileRes = await MetaControlPlaneService.reconcileCampaign(
      testCampaignId,
      { userId: testAdminId, role: 'admin', isAdmin: true },
      { customGraphFetcher: customFetcher },
      pool
    );
    expect(reconcileRes.success).toBe(true);
    expect(reconcileRes.action).toBe('RECONCILE');
  });

  it('6. Object-Level Granular Status Mutation with Hierarchy Verification', async () => {
    const customFetcher = async (endpoint: string, options?: any) => {
      return { status: 200, data: { success: true, status: 'PAUSED' } };
    };

    // Updating a valid ad variant
    const objResult = await MetaControlPlaneService.setObjectStatus(
      testCampaignId,
      'AD',
      'mock_meta_ad_888',
      'PAUSED',
      { userId: testAdminId, role: 'admin', isAdmin: true },
      { customGraphFetcher: customFetcher },
      pool
    );
    expect(objResult.success).toBe(true);
    expect(objResult.target_object_type).toBe('AD');
    expect(objResult.target_object_id).toBe('mock_meta_ad_888');

    // Attempting to mutate an unlinked Ad ID should fail with 400
    await expect(
      MetaControlPlaneService.setObjectStatus(
        testCampaignId,
        'AD',
        'foreign_unlinked_ad_99999',
        'PAUSED',
        { userId: testAdminId, role: 'admin', isAdmin: true },
        {},
        pool
      )
    ).rejects.toThrow(/INVALID_TARGET/i);
  });
});
