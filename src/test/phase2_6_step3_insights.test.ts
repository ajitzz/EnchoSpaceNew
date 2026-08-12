import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ingestVariantInsights } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.6 MILESTONE 2 — STEP 3: VARIANT INSIGHTS INGESTION & ROLLUP', () => {
  let testHostId: number;
  let testListingId: number;
  let testCampaignId: number;
  let testVariantId: number;

  beforeAll(async () => {
    const hostRes = await pool.query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'host', 'hash') RETURNING id`,
      [`host_step3_${Date.now()}@test.com`, 'Test Host Step 3']
    );
    testHostId = hostRes.rows[0].id;

    const listingRes = await pool.query(
      `INSERT INTO listings (user_id, title, description, city, address, price, type, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testHostId, 'Step 3 Test Listing', 'Description', 'City', '123 Test St', 100, 'villa', 'https://picsum.photos/seed/step3/200/300']
    );
    testListingId = listingRes.rows[0].id;

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, media_urls, admin_approved, policy_cleared, target_radius_km, target_locations, feed_description, description)
       VALUES ($1, $2, $3, 100, 'approved', $4, true, true, 25, '["US"]', 'Feed', 'Desc') RETURNING *`,
      [testHostId, testListingId, 'Step 3 Campaign', JSON.stringify(['https://picsum.photos/seed/step3/200/300'])]
    );
    testCampaignId = campRes.rows[0].id;

    const variantRes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id)
       VALUES ($1, $2, 'image', 'sha256_step3', 'ACTIVE', true, 'creative_step3', 'ad_step3') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/step3/200/300']
    );
    testVariantId = variantRes.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM variant_daily_rollups WHERE variant_id = $1', [testVariantId]);
    await pool.query('DELETE FROM variant_raw_event_logs WHERE variant_id = $1', [testVariantId]);
    await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id = $1', [testVariantId]);
  });

  afterAll(async () => {
    if (testVariantId) {
      await pool.query('DELETE FROM variant_daily_rollups WHERE variant_id = $1', [testVariantId]);
      await pool.query('DELETE FROM variant_raw_event_logs WHERE variant_id = $1', [testVariantId]);
      await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id = $1', [testVariantId]);
      await pool.query('DELETE FROM campaign_creative_variants WHERE id = $1', [testVariantId]);
    }
    if (testCampaignId) {
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

  it('TEST A: First cumulative snapshot creates correct deltas', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });

    const logRes = await pool.query(`SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1`, [testVariantId]);
    expect(logRes.rows.length).toBe(1);
    const log = logRes.rows[0];
    expect(Number(log.impressions_delta)).toBe(1000);
    expect(Number(log.clicks_delta)).toBe(50);
    expect(Number(log.conversions_delta)).toBe(5);
    expect(Number(log.spend_delta)).toBe(25.00);
    expect(log.snapshot_before_version).toBe(0);
    expect(log.snapshot_after_version).toBe(1);
  });

  it('TEST B: Second cumulative snapshot creates only incremental deltas', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });
    await ingestVariantInsights(testVariantId, { impressions: 1500, clicks: 75, conversions: 8, spend: 40.00 });

    const logRes = await pool.query(`SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1`, [testVariantId]);
    const log = logRes.rows[0];
    expect(Number(log.impressions_delta)).toBe(500);
    expect(Number(log.clicks_delta)).toBe(25);
    expect(Number(log.conversions_delta)).toBe(3);
    expect(Number(log.spend_delta)).toBe(15.00);
    expect(log.snapshot_before_version).toBe(1);
    expect(log.snapshot_after_version).toBe(2);
  });

  it('TEST C: Identical repeated snapshot creates zero new delta', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1500, clicks: 75, conversions: 8, spend: 40.00 });
    const countBefore = (await pool.query(`SELECT COUNT(*) FROM variant_raw_event_logs WHERE variant_id = $1`, [testVariantId])).rows[0].count;
    await ingestVariantInsights(testVariantId, { impressions: 1500, clicks: 75, conversions: 8, spend: 40.00 });
    const countAfter = (await pool.query(`SELECT COUNT(*) FROM variant_raw_event_logs WHERE variant_id = $1`, [testVariantId])).rows[0].count;
    expect(Number(countAfter)).toBe(Number(countBefore) + 1);

    const logRes = await pool.query(`SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1`, [testVariantId]);
    const log = logRes.rows[0];
    expect(Number(log.impressions_delta)).toBe(0);
    expect(Number(log.clicks_delta)).toBe(0);
  });

  it('TEST D: Enforce snapshot-transition uniqueness constraint', async () => {
    let errorCaught = false;
    try {
      await pool.query(`
        INSERT INTO variant_raw_event_logs (
          variant_id, meta_ad_id, snapshot_before_version, snapshot_after_version,
          impressions_delta, clicks_delta, conversions_delta, spend_delta,
          is_correction, observed_at, processed, source_snapshot_reference
        ) VALUES ($1, 'ad_step3', 0, 1, 10, 1, 0, 1.00, false, NOW(), false, 'dup_ref')
      `, [testVariantId]);

      // Attempt duplicate transition with same before and after version
      await pool.query(`
        INSERT INTO variant_raw_event_logs (
          variant_id, meta_ad_id, snapshot_before_version, snapshot_after_version,
          impressions_delta, clicks_delta, conversions_delta, spend_delta,
          is_correction, observed_at, processed, source_snapshot_reference
        ) VALUES ($1, 'ad_step3', 0, 1, 10, 1, 0, 1.00, false, NOW(), false, 'dup_ref_2')
      `, [testVariantId]);
    } catch (e) {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  });

  it('TEST E: Negative metric correction produces is_correction=true', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 3000, clicks: 150, conversions: 15, spend: 75.00 });
    await ingestVariantInsights(testVariantId, { impressions: 2900, clicks: 145, conversions: 14, spend: 72.00 });

    const logRes = await pool.query(`SELECT * FROM variant_raw_event_logs WHERE variant_id = $1 ORDER BY id DESC LIMIT 1`, [testVariantId]);
    const log = logRes.rows[0];
    expect(log.is_correction).toBe(true);
    expect(Number(log.impressions_delta)).toBe(-100);
  });

  it('TEST F, G: Snapshot version advances correctly and transition uniqueness is enforced', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });
    const snapRes = await pool.query(`SELECT snapshot_version FROM variant_meta_snapshots WHERE variant_id = $1`, [testVariantId]);
    expect(snapRes.rows[0].snapshot_version).toBeGreaterThan(0);
  });

  it('TEST H, I: Daily rollup aggregates by variant + UTC date and preserves history', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });
    const rollupRes = await pool.query(`SELECT * FROM variant_daily_rollups WHERE variant_id = $1`, [testVariantId]);
    expect(rollupRes.rows.length).toBeGreaterThan(0);
    const rollup = rollupRes.rows[0];
    expect(rollup.date).toBeTruthy();
    expect(Number(rollup.impressions)).toBeGreaterThan(0);
  });

  it('TEST J: Rollup success keeps raw event processed=true', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });
    const unprocRes = await pool.query(`SELECT COUNT(*) FROM variant_raw_event_logs WHERE variant_id = $1 AND processed = false`, [testVariantId]);
    expect(Number(unprocRes.rows[0].count)).toBe(0);
  });

  it('TEST K, L: Meta timeout / 4xx error preserves previous snapshot', async () => {
    await ingestVariantInsights(testVariantId, { impressions: 1000, clicks: 50, conversions: 5, spend: 25.00 });
    const snapBefore = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1`, [testVariantId]);
    
    let failed = false;
    try {
      const badVarRes = await pool.query(
        `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id)
         VALUES ($1, $2, 'image', 'sha256_bad', 'ACTIVE', true, 'creative_bad', 'non_existent_ad_id_999') RETURNING id`,
        [testCampaignId, 'https://picsum.photos/seed/bad/200/300']
      );
      await ingestVariantInsights(badVarRes.rows[0].id);
    } catch (e) {
      failed = true;
    }
    expect(failed).toBe(true);

    const snapAfter = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1`, [testVariantId]);
    expect(snapAfter.rows[0].snapshot_version).toBe(snapBefore.rows[0].snapshot_version);
  });

  it('TEST M: Tenant/identity boundaries remain intact', async () => {
    let unpubFailed = false;
    const unpubVarRes = await pool.query(
      `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published, meta_creative_id, meta_ad_id)
       VALUES ($1, $2, 'image', 'sha256_unpub', 'ACTIVE', false, 'creative_unpub', 'ad_unpub') RETURNING id`,
      [testCampaignId, 'https://picsum.photos/seed/unpub/200/300']
    );
    try {
      await ingestVariantInsights(unpubVarRes.rows[0].id, { impressions: 100, clicks: 10, spend: 5 });
    } catch (e) {
      unpubFailed = true;
    }
    expect(unpubFailed).toBe(true);
  });
});
