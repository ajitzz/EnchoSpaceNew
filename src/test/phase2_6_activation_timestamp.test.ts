import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dispatchMetaCampaign, evaluateCampaignDCO, computeCampaignApprovalHash } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.6 — VARIANT ACTIVATION TIMESTAMP REMEDIATION', () => {
  let testHostId: number;
  let testListingId: number;
  let campaignId: number;
  const getAdAccountId = () => process.env.META_AD_ACCOUNT_ID || 'act_1381407594129620';

  beforeAll(async () => {
    process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test_token_activation';
    process.env.META_PAGE_ID = process.env.META_PAGE_ID || '554884541034223';
    process.env.META_INSTAGRAM_ACCOUNT_ID = process.env.META_INSTAGRAM_ACCOUNT_ID || 'ig_123';

    const hostRes = await pool.query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'host', 'hash') RETURNING id`,
      [`host_activation_${Date.now()}@test.com`, 'Test Host Activation']
    );
    testHostId = hostRes.rows[0].id;

    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, description, city, address, price, type, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testHostId, 'Activation Test Listing', 'Desc', 'City', '123 St', 100, 'villa', 'https://picsum.photos/seed/act/200/300']
    );
    testListingId = listingRes.rows[0].id;

    const mediaUrls = JSON.stringify([
      'https://picsum.photos/seed/actv1/200/300',
      'https://picsum.photos/seed/actv2/200/300'
    ]);

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared, target_radius_km, target_locations, feed_description, description, owner_meta_ad_account_id, meta_campaign_id, meta_adset_id)
       VALUES ($1, $2, $3, 150, 'approved', $4, true, true, 25, '["US"]', 'Feed copy', 'Desc copy', $5, 'mock_camp_1', 'mock_adset_1') RETURNING *`,
      [testHostId, testListingId, 'Activation Test Campaign', mediaUrls, getAdAccountId()]
    );
    const campRow = campRes.rows[0];
    campaignId = campRow.id;

    const { hash, snapshot } = computeCampaignApprovalHash(campRow);
    await pool.query(
      `UPDATE host_marketing_campaigns SET approval_hash = $1, approval_snapshot = $2 WHERE id = $3`,
      [hash, JSON.stringify(snapshot), campaignId]
    );
  });

  afterAll(async () => {
    if (campaignId) {
      await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN (SELECT id FROM campaign_creative_variants WHERE campaign_id = $1)', [campaignId]);
      await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM meta_publishing_dlq WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = campaignId;
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    }
    if (testListingId) {
      await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    }
    if (testHostId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testHostId]);
    }
    await pool.end();
  });

  const setupMockFetch = (adStatus: 'ACTIVE' | 'PAUSED' | 'FAIL') => {
    const pageId = process.env.META_PAGE_ID || '554884541034223';
    let creativeCount = 1;
    let adCount = 1;

    const originalFetch = global.fetch;
    global.fetch = async (url: any, options: any = {}) => {
      const urlStr = String(url);
      const method = (options.method || 'GET').toUpperCase();

      if (urlStr.includes('/debug_token')) {
        return new Response(JSON.stringify({ data: { is_valid: true, scopes: ['ads_management', 'pages_read_engagement', 'pages_manage_posts'] } }), { status: 200 });
      }
      if (urlStr.includes(`/${pageId}`) || urlStr.includes('/me/accounts')) {
        return new Response(JSON.stringify({
          id: pageId,
          name: 'Page',
          access_token: 'page_token_123',
          tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE'],
          data: [{ id: pageId, name: 'Page', access_token: 'page_token_123', tasks: ['ANALYZE', 'ADVERTISE', 'MODERATE'] }]
        }), { status: 200 });
      }
      if (urlStr.includes('picsum.photos')) {
        return new Response(Buffer.from(`dummy_image_data_${urlStr}`), { status: 200 });
      }
      if (urlStr.includes('/adimages')) {
        return new Response(JSON.stringify({ images: { img1: { hash: 'hash123' } } }), { status: 200 });
      }
      if (urlStr.includes('/campaigns') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'mock_camp_act' }), { status: 200 });
      }
      if (urlStr.includes('/adsets') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'mock_adset_act' }), { status: 200 });
      }
      if (urlStr.includes('/adcreatives') && method === 'POST') {
        return new Response(JSON.stringify({ id: `mock_creative_act_${creativeCount++}` }), { status: 200 });
      }
      if (urlStr.includes('/ads') && method === 'POST') {
        return new Response(JSON.stringify({ id: `mock_ad_act_${adCount++}` }), { status: 200 });
      }
      if (urlStr.includes('/act_') || urlStr.includes('account_status')) {
        return new Response(JSON.stringify({ id: getAdAccountId(), account_status: 1 }), { status: 200 });
      }

      if (method === 'GET' && (urlStr.includes('mock_creative_') || urlStr.includes('mock_ad_'))) {
        if (adStatus === 'FAIL' && urlStr.includes('mock_ad_')) {
          return new Response(JSON.stringify({ error: { message: 'External verification failed' } }), { status: 400 });
        }
        return new Response(JSON.stringify({
          id: 'mock_obj_act',
          account_id: getAdAccountId(),
          status: adStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
          effective_status: adStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'
        }), { status: 200 });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    return {
      restore: () => { global.fetch = originalFetch; }
    };
  };

  const cleanCampaignState = async () => {
    await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN (SELECT id FROM campaign_creative_variants WHERE campaign_id = $1)', [campaignId]);
    await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [campaignId]);
    await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [campaignId]);
    await pool.query('DELETE FROM meta_publishing_dlq WHERE campaign_id = $1', [campaignId]);
    await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = campaignId;
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [campaignId]);
  };

  const prepareForDispatch = async () => {
    await cleanCampaignState();
    await pool.query(
      `UPDATE host_marketing_campaigns SET status = 'approved', owner_meta_ad_account_id = $1 WHERE id = $2`,
      [getAdAccountId(), campaignId]
    );
    const cRes = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    const { hash, snapshot } = computeCampaignApprovalHash(cRes.rows[0]);
    await pool.query('UPDATE host_marketing_campaigns SET approval_hash = $1, approval_snapshot = $2 WHERE id = $3', [hash, JSON.stringify(snapshot), campaignId]);
  };

  const prepareForDCO = async (activatedAt: Date | string | null = null) => {
    await cleanCampaignState();
    await pool.query(
      `UPDATE host_marketing_campaigns SET status = 'active', owner_meta_ad_account_id = $1, meta_campaign_id = 'mock_camp_1', meta_adset_id = 'mock_adset_1' WHERE id = $2`,
      [getAdAccountId(), campaignId]
    );
    const cRes = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    const { hash, snapshot } = computeCampaignApprovalHash(cRes.rows[0]);
    await pool.query('UPDATE host_marketing_campaigns SET approval_hash = $1, approval_snapshot = $2 WHERE id = $3', [hash, JSON.stringify(snapshot), campaignId]);

    const v1 = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, variant_activated_at)
       VALUES ($1, 'url1', 'image', 'sha1', 'ACTIVE', true, 'c1', 'a1', $2) RETURNING id`,
      [campaignId, activatedAt]
    );
    const v2 = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, variant_activated_at)
       VALUES ($1, 'url2', 'image', 'sha22', 'ACTIVE', true, 'c2', 'a2', $2) RETURNING id`,
      [campaignId, activatedAt]
    );

    const now = new Date();
    await pool.query(
      `INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at)
       VALUES ($1, 1000, 50, 5, 20.00, $2), ($3, 1000, 40, 4, 20.00, $2)`,
      [v1.rows[0].id, now, v2.rows[0].id]
    );
  };

  it('A. Successful ACTIVE Meta verification populates variant_activated_at', async () => {
    await prepareForDispatch();
    const mock = setupMockFetch('ACTIVE');
    try {
      const ok = await dispatchMetaCampaign(campaignId, { user: { id: testHostId } } as any);
      expect(ok).toBe(true);

      const variants = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`,
        [campaignId]
      );
      expect(variants.rows.length).toBe(2);
      expect(variants.rows[0].variant_activated_at).not.toBeNull();
      expect(variants.rows[1].variant_activated_at).not.toBeNull();
    } finally {
      mock.restore();
    }
  });

  it('B. PAUSED Meta Ad does NOT populate variant_activated_at', async () => {
    await prepareForDispatch();
    const mock = setupMockFetch('PAUSED');
    try {
      const ok = await dispatchMetaCampaign(campaignId, { user: { id: testHostId } } as any);
      expect(ok).toBe(true);

      const variants = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`,
        [campaignId]
      );
      expect(variants.rows.length).toBe(2);
      expect(variants.rows[0].variant_activated_at).toBeNull();
      expect(variants.rows[1].variant_activated_at).toBeNull();
    } finally {
      mock.restore();
    }
  });

  it('C. Failed external verification does NOT populate variant_activated_at', async () => {
    await prepareForDispatch();
    const mock = setupMockFetch('FAIL');
    try {
      const result = await dispatchMetaCampaign(campaignId, { user: { id: testHostId } } as any);
      expect(result).toBe(false);

      const variants = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1`,
        [campaignId]
      );
      const activeVariants = variants.rows.filter(v => v.variant_activated_at !== null);
      expect(activeVariants.length).toBe(0);
    } finally {
      mock.restore();
    }
  });

  it('D. NULL activation timestamp causes Step 4A: VARIANT_NOT_ACTIVATED', async () => {
    await prepareForDCO(null);

    const result = await evaluateCampaignDCO(campaignId, { evaluationEpoch: 'epoch_test_D' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('VARIANT_NOT_ACTIVATED');
  });

  it('E. After activation, Step 4A calculates age from variant_activated_at', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prepareForDCO(twoDaysAgo);

    const result = await evaluateCampaignDCO(campaignId, { evaluationEpoch: 'epoch_test_E' });
    expect(result.decision_reason).not.toBe('VARIANT_NOT_ACTIVATED');
    expect(result.decision_reason).not.toBe('VARIANT_TOO_YOUNG');
  });

  it('F. Re-dispatch/reconciliation does not overwrite an existing activation timestamp', async () => {
    await prepareForDispatch();

    const initialTimestamp = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, variant_activated_at)
       VALUES ($1, 'https://picsum.photos/seed/actv1/200/300', 'image', 'sha1_exist', 'ACTIVE', false, 'c1', 'a1', $2),
              ($1, 'https://picsum.photos/seed/actv2/200/300', 'image', 'sha2_exist', 'ACTIVE', false, 'c2', 'a2', $2)`,
      [campaignId, initialTimestamp]
    );

    const mock = setupMockFetch('ACTIVE');
    try {
      const ok = await dispatchMetaCampaign(campaignId, { user: { id: testHostId } } as any);
      expect(ok).toBe(true);

      const variants = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`,
        [campaignId]
      );
      const updatedTimestamp0 = new Date(variants.rows[0].variant_activated_at).toISOString();
      expect(new Date(updatedTimestamp0).getTime()).toBe(new Date(initialTimestamp).getTime());
    } finally {
      mock.restore();
    }
  });

  it('G. Exactly 24 hours from variant_activated_at satisfies the age boundary', async () => {
    const exactly24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
    await prepareForDCO(exactly24hAgo);

    const result = await evaluateCampaignDCO(campaignId, { evaluationEpoch: 'epoch_test_G' });
    expect(result.decision_reason).not.toBe('VARIANT_TOO_YOUNG');
    expect(result.decision_reason).not.toBe('VARIANT_NOT_ACTIVATED');
  });

  it('H. Less than 24 hours remains VARIANT_TOO_YOUNG', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prepareForDCO(twoHoursAgo);

    const result = await evaluateCampaignDCO(campaignId, { evaluationEpoch: 'epoch_test_H' });
    expect(result.decision).toBe('DEFERRED');
    expect(result.decision_reason).toBe('VARIANT_TOO_YOUNG');
  });
});
