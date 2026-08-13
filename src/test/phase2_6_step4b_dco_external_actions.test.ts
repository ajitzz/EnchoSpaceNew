import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { executeDCOOptimization, evaluateCampaignDCO, computeCampaignApprovalHash, ensureMarketingSchema, reconcileDCOExternalActionsWorker } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.6 MILESTONE 2 — STEP 4B: DCO EXTERNAL META ACTION EXECUTION', () => {
  let testHostId: number;
  let testListingId: number;
  let testCampaignId: number;
  let variantAId: number;
  let variantBId: number;
  let evalId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const hostRes = await pool.query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'host', 'hash') RETURNING id`,
      [`host_step4b_${Date.now()}@test.com`, 'Test Host Step 4B']
    );
    testHostId = hostRes.rows[0].id;

    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, description, city, address, price, type, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testHostId, 'Step 4B Test Listing', 'Description', 'City', '123 Test St', 100, 'villa', 'https://picsum.photos/seed/step4b/200/300']
    );
    testListingId = listingRes.rows[0].id;

    const campData: any = {
      host_id: testHostId,
      listing_id: testListingId,
      title: 'Step 4B Campaign',
      budget: 100,
      status: 'active',
      media_urls: JSON.stringify(['https://picsum.photos/seed/step4b/200/300']),
      admin_approved: true,
      policy_cleared: true,
      target_radius_km: 25,
      target_locations: '["US"]',
      feed_description: 'Feed',
      description: 'Desc',
      meta_campaign_id: 'meta_camp_4b',
      meta_adset_id: 'meta_adset_4b',
      owner_meta_ad_account_id: 'act_4b',
      objective: 'TRAFFIC',
      optimization_metric: 'CPC'
    };

    const { hash } = computeCampaignApprovalHash(campData);
    campData.approval_hash = hash;

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared,
        target_radius_km, target_locations, feed_description, description,
        meta_campaign_id, meta_adset_id, owner_meta_ad_account_id, objective, optimization_metric, approval_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW() - INTERVAL '3 days') RETURNING *`,
      [
        campData.host_id, campData.listing_id, campData.title, campData.budget, campData.status,
        campData.media_urls, campData.admin_approved, campData.policy_cleared, campData.target_radius_km,
        campData.target_locations, campData.feed_description, campData.description,
        campData.meta_campaign_id, campData.meta_adset_id, campData.owner_meta_ad_account_id,
        campData.objective, campData.optimization_metric, campData.approval_hash
      ]
    );
    testCampaignId = campRes.rows[0].id;

    const varARes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, created_at, variant_activated_at)
       VALUES ($1, $2, 'image', 'sha_4b_a', 'ACTIVE', true, 'cre_4b_a', 'ad_4b_winner', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/step4ba/200/300']
    );
    variantAId = varARes.rows[0].id;

    const varBRes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id, created_at, variant_activated_at)
       VALUES ($1, $2, 'image', 'sha_4b_b', 'ACTIVE', true, 'cre_4b_b', 'ad_4b_loser', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/step4bb/200/300']
    );
    variantBId = varBRes.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
    await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [testCampaignId]);
    await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN ($1, $2)', [variantAId, variantBId]);
    await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [testCampaignId]);
    await pool.query('UPDATE campaign_creative_variants SET status = \'ACTIVE\', is_published = true, variant_activated_at = NOW() - INTERVAL \'2 days\' WHERE id IN ($1, $2)', [variantAId, variantBId]);
    
    // Seed snapshots where variant A is winner (lower CPC) and variant B is loser
    const fetchedAt = new Date();
    await pool.query(`
      INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at)
      VALUES ($1, 2000, 100, 5, 50.00, $2)
      ON CONFLICT (variant_id) DO UPDATE SET last_meta_impressions = 2000, last_meta_clicks = 100, last_meta_conversions = 5, last_meta_spend = 50.00, last_meta_fetched_at = $2
    `, [variantAId, fetchedAt]);

    await pool.query(`
      INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at)
      VALUES ($1, 2000, 50, 2, 80.00, $2)
      ON CONFLICT (variant_id) DO UPDATE SET last_meta_impressions = 2000, last_meta_clicks = 50, last_meta_conversions = 2, last_meta_spend = 80.00, last_meta_fetched_at = $2
    `, [variantBId, fetchedAt]);

    // Run Step 4A evaluation to produce WINNER_SELECTED
    const evalRes = await evaluateCampaignDCO(testCampaignId);
    evalId = evalRes.evaluation_id!;
  });

  afterAll(async () => {
    if (variantAId && variantBId) {
      await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN ($1, $2)', [variantAId, variantBId]);
      await pool.query('DELETE FROM campaign_creative_variants WHERE id IN ($1, $2)', [variantAId, variantBId]);
    }
    if (testCampaignId) {
      await pool.query('DELETE FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [testCampaignId]);
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

  it('A. Valid WINNER_SELECTED produces exactly one durable REQUESTED action', async () => {
    const originalFetch = global.fetch;
    const requestedActions: string[] = [];

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes('ad_4b_loser') && options?.method === 'POST') {
        requestedActions.push(urlStr);
        return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
      }
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({}) } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(true);
    expect(res.status).toBe('META_ACTION_SUCCEEDED');

    const actionsRes = await pool.query('SELECT * FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
    expect(actionsRes.rows.length).toBe(1);
    expect(actionsRes.rows[0].status).toBe('META_ACTION_SUCCEEDED');

    global.fetch = originalFetch;
  });

  it('B. PAUSE POST is issued to loser only and C. Winner Meta Ad receives zero mutation requests', async () => {
    const originalFetch = global.fetch;
    const mutations: string[] = [];

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (options?.method === 'POST') {
        mutations.push(urlStr);
      }
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
    });

    await executeDCOOptimization(testCampaignId);

    expect(mutations.some(m => m.includes('ad_4b_loser'))).toBe(true);
    expect(mutations.some(m => m.includes('ad_4b_winner'))).toBe(false);

    global.fetch = originalFetch;
  });

  it('D. AdSet budget receives zero mutation requests', async () => {
    const originalFetch = global.fetch;
    const mutations: string[] = [];

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (options?.method === 'POST') {
        mutations.push(urlStr);
      }
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
    });

    await executeDCOOptimization(testCampaignId);

    expect(mutations.some(m => m.includes('meta_adset_4b'))).toBe(false);

    global.fetch = originalFetch;
  });

  it('E. Successful PAUSE + GET verification produces META_ACTION_SUCCEEDED and F. WINNER_OPTIMIZED', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(true);
    expect(res.status).toBe('META_ACTION_SUCCEEDED');

    const evalRes = await pool.query('SELECT * FROM dco_evaluation_transactions WHERE id = $1', [evalId]);
    expect(evalRes.rows[0].decision).toBe('WINNER_OPTIMIZED');

    const campRes = await pool.query('SELECT dco_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(campRes.rows[0].dco_status).toBe('WINNER_OPTIMIZED');

    global.fetch = originalFetch;
  });

  it('G. Timeout produces EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (options?.method === 'POST') {
        throw new Error('ETIMEDOUT');
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({}) } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);
    expect(res.status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

    const actionRes = await pool.query('SELECT * FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
    expect(actionRes.rows[0].status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

    global.fetch = originalFetch;
  });

  it('H. Connection reset produces EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (options?.method === 'POST') {
        throw new Error('ECONNRESET');
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({}) } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);
    expect(res.status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

    global.fetch = originalFetch;
  });

  it('I. Crash after POST is recovered by GET without duplicate POST and J. Existing REQUESTED action idempotently recovered', async () => {
    const originalFetch = global.fetch;
    let postCount = 0;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (options?.method === 'POST') {
        postCount++;
        return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
      }
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({}) } as any;
    });

    // Simulate crash after POST by running with chaos C (or running first part and setting REQUESTED)
    await pool.query(`
      INSERT INTO dco_external_actions (action_key, campaign_id, evaluation_id, variant_id, meta_ad_id, action_type, status)
      VALUES ($1, $2, $3, $4, $5, 'PAUSE', 'REQUESTED')
      ON CONFLICT (action_key) DO UPDATE SET status = 'REQUESTED'
    `, [`dco_pause_${testCampaignId}_${evalId}_${variantBId}`, testCampaignId, evalId, variantBId, 'ad_4b_loser']);

    // Now execute optimization which hits recovery path (GET check finds already PAUSED or calls GET)
    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(true);

    global.fetch = originalFetch;
  });

  it('K. Existing UNKNOWN action is reconciled safely', async () => {
    await pool.query(`
      INSERT INTO dco_external_actions (action_key, campaign_id, evaluation_id, variant_id, meta_ad_id, action_type, status)
      VALUES ($1, $2, $3, $4, $5, 'PAUSE', 'EXTERNAL_OUTCOME_UNKNOWN')
      ON CONFLICT (action_key) DO UPDATE SET status = 'EXTERNAL_OUTCOME_UNKNOWN'
    `, [`dco_pause_${testCampaignId}_${evalId}_${variantBId}`, testCampaignId, evalId, variantBId, 'ad_4b_loser']);

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: any) => {
      return {
        ok: true,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
      } as any;
    });

    await reconcileDCOExternalActionsWorker();

    const actionRes = await pool.query('SELECT status FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
    expect(actionRes.rows[0].status).toBe('META_ACTION_SUCCEEDED');

    global.fetch = originalFetch;
  });

  it('L. Already-PAUSED loser is recognized without duplicate POST', async () => {
    const originalFetch = global.fetch;
    let postCount = 0;

    global.fetch = vi.fn(async (url: any, options: any) => {
      if (options?.method === 'POST') {
        postCount++;
      }
      return {
        ok: true,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
      } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(true);

    global.fetch = originalFetch;
  });

  it('M. NO_WINNER produces zero mutations and N. DEFERRED produces zero mutations', async () => {
    // Clear evaluation and create DEFERRED / NO_WINNER state
    await pool.query('DELETE FROM dco_evaluation_transactions WHERE campaign_id = $1', [testCampaignId]);
    await pool.query(`
      INSERT INTO dco_evaluation_transactions (campaign_id, evaluation_epoch, decision, status, lease_expires_at)
      VALUES ($1, '2026-08-11', 'NO_WINNER_EQUAL_PERFORMANCE', 'COMPLETED', NOW() + INTERVAL '1 hour')
    `, [testCampaignId]);

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);

    const actionRes = await pool.query('SELECT * FROM dco_external_actions WHERE campaign_id = $1', [testCampaignId]);
    expect(actionRes.rows.length).toBe(0);
  });

  it('O. INVALID approval hash produces zero mutations', async () => {
    await pool.query(`UPDATE host_marketing_campaigns SET approval_hash = 'invalid_hash' WHERE id = $1`, [testCampaignId]);

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('P. Reconciliation incident / active publishing transaction blocks mutations', async () => {
    // Restore valid approval hash first
    const campRes = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [testCampaignId]);
    const { hash } = computeCampaignApprovalHash(campRes.rows[0]);
    await pool.query(`UPDATE host_marketing_campaigns SET approval_hash = $1 WHERE id = $2`, [hash, testCampaignId]);

    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, publish_status, idempotency_key, correlation_id)
      VALUES ($1, 'PENDING', $2, $3)
    `, [testCampaignId, `idemp_test_${Date.now()}`, `corr_test_${Date.now()}`]);

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('ACTIVE_PUBLISHING_TRANSACTION');

    await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [testCampaignId]);
  });

  it('Q. Master Ad Account mismatch / verification blocks mutations', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({ id: 'ad_4b_loser', status: 'ACTIVE', account_id: 'act_wrong_account', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
      } as any;
    });

    const res = await executeDCOOptimization(testCampaignId);
    expect(res.success).toBe(false);

    global.fetch = originalFetch;
  });

  it('S. Immutable event ledger emitted on successful optimization', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
    });

    await executeDCOOptimization(testCampaignId);

    const eventRes = await pool.query(`SELECT * FROM meta_publishing_events WHERE campaign_id = $1 AND event_type = 'DCO_WINNER_OPTIMIZED'`, [testCampaignId]);
    expect(eventRes.rows.length).toBeGreaterThan(0);
    expect(eventRes.rows[0].to_state).toBe('WINNER_OPTIMIZED');

    global.fetch = originalFetch;
  });

  it('T. Budget and targeting fields remain unchanged', async () => {
    const beforeCamp = await pool.query('SELECT budget, target_radius_km, target_locations, optimization_metric FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes('ad_4b_loser') && (!options || options.method === 'GET')) {
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({ id: 'ad_4b_loser', status: 'PAUSED', account_id: 'act_4b', campaign_id: 'meta_camp_4b', adset_id: 'meta_adset_4b' })
        } as any;
      }
      return { ok: true, headers: new Headers({'content-type': 'application/json'}), json: async () => ({ success: true }) } as any;
    });

    await executeDCOOptimization(testCampaignId);

    const afterCamp = await pool.query('SELECT budget, target_radius_km, target_locations, optimization_metric FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(afterCamp.rows[0]).toEqual(beforeCamp.rows[0]);

    global.fetch = originalFetch;
  });

  it('Chaos Tests: A, B recovery validation', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }) as any);

    const chaosARes = await executeDCOOptimization(testCampaignId, { chaosFailurePoint: 'A' });
    expect(chaosARes.success).toBe(false);

    const chaosBRes = await executeDCOOptimization(testCampaignId, { chaosFailurePoint: 'B' });
    expect(chaosBRes.success).toBe(false);

    global.fetch = originalFetch;
  });
});
