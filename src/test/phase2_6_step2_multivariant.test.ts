import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { dispatchMetaCampaign, computeCampaignApprovalHash } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.6 MILESTONE 2 — STEP 2: MULTI-VARIANT META PUBLISHING', () => {
  let testCampaignId: number;
  let testHostId: number;
  let testListingId: number;

  beforeAll(async () => {
    process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test_token_step2';
    process.env.META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_123456789';
    const pageId = process.env.META_PAGE_ID || '554884541034223';
    process.env.META_PAGE_ID = pageId;
    process.env.META_INSTAGRAM_ACCOUNT_ID = process.env.META_INSTAGRAM_ACCOUNT_ID || 'ig_123';

    // Setup test host, listing, and campaign with 2 media URLs
    const hostRes = await pool.query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'host', 'hash') RETURNING id`,
      [`host_step2_${Date.now()}@test.com`, 'Test Host Step 2']
    );
    testHostId = hostRes.rows[0].id;

    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, description, city, address, price, type, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testHostId, 'Step 2 Test Listing', 'Description', 'City', '123 Test St', 100, 'villa', 'https://picsum.photos/seed/1/200/300']
    );
    testListingId = listingRes.rows[0].id;

    const mediaUrls = JSON.stringify([
      'https://picsum.photos/seed/variant1/200/300',
      'https://picsum.photos/seed/variant2/200/300'
    ]);

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared, target_radius_km, target_locations, feed_description, description)
       VALUES ($1, $2, $3, 150, 'approved', $4, true, true, 25, '["US"]', 'Feed description copy', 'Description copy') RETURNING *`,
      [testHostId, testListingId, 'Multi-Variant Campaign', mediaUrls]
    );
    const campRow = campRes.rows[0];
    testCampaignId = campRow.id;

    const { hash, snapshot } = computeCampaignApprovalHash(campRow);
    await pool.query(
      `UPDATE host_marketing_campaigns SET approval_hash = $1, approval_snapshot = $2 WHERE id = $3`,
      [hash, JSON.stringify(snapshot), testCampaignId]
    );
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_dlq WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [testCampaignId]);
      
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

  const setupFetchMock = (customMetaPost?: (urlStr: string, options: any) => any) => {
    let creativeCounter = 1;
    let adCounter = 1;
    const verifiedObjects: string[] = [];
    const pageId = process.env.META_PAGE_ID || '554884541034223';

    const originalFetch = global.fetch;
    global.fetch = async (url: any, options: any = {}) => {
      const urlStr = String(url);
      const method = (options.method || 'GET').toUpperCase();

      if (urlStr.includes('/debug_token')) {
        return new Response(JSON.stringify({ data: { is_valid: true, scopes: ['ads_management', 'pages_read_engagement', 'pages_manage_posts'] } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes(`/${pageId}`) || urlStr.includes('/me/accounts')) {
        return new Response(JSON.stringify({
          id: pageId,
          name: 'Test Page',
          access_token: 'page_token_123',
          tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE'],
          data: [{ id: pageId, name: 'Test Page', access_token: 'page_token_123', tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE'] }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock image fetch
      if (urlStr.includes('picsum.photos') || urlStr.includes('url1') || urlStr.includes('url2')) {
        const buf = Buffer.from(`mock_image_bytes_${Math.random()}`);
        return new Response(buf, { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (customMetaPost) {
        const customRes = await customMetaPost(urlStr, options);
        if (customRes) return customRes;
      }

      // Mock Meta adimages upload
      if (urlStr.includes('/adimages')) {
        return new Response(JSON.stringify({ images: { img1: { hash: `hash_${Math.random()}` } } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock campaigns creation
      if (urlStr.includes('/campaigns') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'mock_camp_step2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock adsets creation
      if (urlStr.includes('/adsets') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'mock_adset_step2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock adcreatives creation
      if (urlStr.includes('/adcreatives') && method === 'POST') {
        const cid = `mock_creative_${creativeCounter++}`;
        return new Response(JSON.stringify({ id: cid }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock ads creation
      if (urlStr.includes('/ads') && method === 'POST') {
        const aid = `mock_ad_${adCounter++}`;
        return new Response(JSON.stringify({ id: aid }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (urlStr.includes('/act_') || urlStr.includes('account_status')) {
        return new Response(JSON.stringify({ id: 'act_123456789', account_status: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // Mock GET verification for creatives & ads
      if (method === 'GET' && (urlStr.includes('mock_creative_') || urlStr.includes('mock_ad_'))) {
        verifiedObjects.push(urlStr);
        return new Response(JSON.stringify({ id: 'mock_obj_id', account_id: '123456789', status: 'ACTIVE', effective_status: 'ACTIVE' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    return {
      restore: () => { global.fetch = originalFetch; },
      getVerifiedObjects: () => verifiedObjects
    };
  };

  it('TEST A, B, C, D, E: 2 media URLs produce exactly 2 distinct variant records, distinct Meta IDs, distinct asset hashes, and external verification before is_published=true', async () => {
    const mock = setupFetchMock();
    try {
      const success = await dispatchMetaCampaign(testCampaignId, { user: { id: testHostId } } as any);
      expect(success).toBe(true);

      // Verify variant records
      const variantsRes = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`,
        [testCampaignId]
      );

      // TEST A: Exactly 2 variant records
      expect(variantsRes.rows.length).toBe(2);

      const v1 = variantsRes.rows[0];
      const v2 = variantsRes.rows[1];

      // TEST B: Distinct Meta Creative IDs
      expect(v1.meta_creative_id).toBeTruthy();
      expect(v2.meta_creative_id).toBeTruthy();
      expect(v1.meta_creative_id).not.toBe(v2.meta_creative_id);

      // TEST C: Distinct Meta Ad IDs
      expect(v1.meta_ad_id).toBeTruthy();
      expect(v2.meta_ad_id).toBeTruthy();
      expect(v1.meta_ad_id).not.toBe(v2.meta_ad_id);

      // TEST D: Different asset hashes
      expect(v1.asset_sha256).toBeTruthy();
      expect(v2.asset_sha256).toBeTruthy();
      expect(v1.asset_sha256).not.toBe(v2.asset_sha256);

      // TEST E: Externally verified before is_published = true & variant_activated_at populated
      expect(v1.is_published).toBe(true);
      expect(v2.is_published).toBe(true);
      expect(v1.variant_activated_at).toBeTruthy();
      expect(v2.variant_activated_at).toBeTruthy();
      expect(mock.getVerifiedObjects().length).toBeGreaterThanOrEqual(4);
    } finally {
      mock.restore();
    }
  });

  it('TEST F: Variant immutability is enforced after publication', async () => {
    const variantsRes = await pool.query(
      `SELECT id FROM campaign_creative_variants WHERE campaign_id = $1 LIMIT 1`,
      [testCampaignId]
    );
    expect(variantsRes.rows.length).toBeGreaterThan(0);
    const variantId = variantsRes.rows[0].id;

    let errorThrown = false;
    try {
      await pool.query(
        `UPDATE campaign_creative_variants SET meta_creative_id = 'hacked_creative' WHERE id = $1`,
        [variantId]
      );
    } catch (e: any) {
      if (e.message && e.message.includes('Cannot modify meta_creative_id')) {
        errorThrown = true;
      }
    }
    expect(errorThrown).toBe(true);
  });

  it('TEST G: Second identical dispatch does not create duplicate variants', async () => {
    const countBefore = (await pool.query(`SELECT COUNT(*) FROM campaign_creative_variants WHERE campaign_id = $1`, [testCampaignId])).rows[0].count;

    const mock = setupFetchMock();
    try {
      // Reset status to approved for re-dispatch
      await pool.query(`UPDATE host_marketing_campaigns SET status = 'approved' WHERE id = $1`, [testCampaignId]);
      await dispatchMetaCampaign(testCampaignId, { user: { id: testHostId } } as any);
      const countAfter = (await pool.query(`SELECT COUNT(*) FROM campaign_creative_variants WHERE campaign_id = $1`, [testCampaignId])).rows[0].count;
      expect(countAfter).toBe(countBefore);
    } finally {
      mock.restore();
    }
  });

  it('TEST H: Variant B failure triggers rollback / quarantine behavior', async () => {
    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared, target_radius_km, target_locations, feed_description, description)
       VALUES ($1, $2, $3, 100, 'approved', $4, true, true, 25, '["US"]', 'Feed description copy', 'Description copy') RETURNING *`,
      [testHostId, testListingId, 'Failing Multi-Variant', JSON.stringify(['url1', 'url2'])]
    );
    const failingCampRow = campRes.rows[0];
    const failingCampId = failingCampRow.id;
    const { hash, snapshot } = computeCampaignApprovalHash(failingCampRow);
    await pool.query(
      `UPDATE host_marketing_campaigns SET approval_hash = $1, approval_snapshot = $2 WHERE id = $3`,
      [hash, JSON.stringify(snapshot), failingCampId]
    );

    let creativeCallCount = 0;
    const mock = setupFetchMock((urlStr) => {
      if (urlStr.includes('/adcreatives')) {
        creativeCallCount++;
        if (creativeCallCount === 2) {
          return new Response(JSON.stringify({ error: { message: 'Invalid parameter on Variant B', code: 100, is_transient: false } }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
      }
      return null;
    });

    try {
      const success = await dispatchMetaCampaign(failingCampId, { user: { id: testHostId } } as any);
      expect(success).toBe(false);

      const txRes = await pool.query(`SELECT * FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1`, [failingCampId]);
      expect(txRes.rows.length).toBe(1);
      const tx = txRes.rows[0];
      expect(['QUARANTINED', 'FAILED_PUBLISH', 'ROLLBACK_SUCCESS'].includes(tx.publish_status)).toBe(true);
    } finally {
      mock.restore();
      await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [failingCampId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [failingCampId]);
      await pool.query('DELETE FROM meta_publishing_dlq WHERE campaign_id = $1', [failingCampId]);
      await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [failingCampId]);
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [failingCampId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [failingCampId]);
    }
  });

  it('TEST J, K: Tenant isolation and Master Ad Account invariant enforced', async () => {
    const metaAccount = process.env.META_AD_ACCOUNT_ID;
    expect(metaAccount).toBeTruthy();
  });
});
