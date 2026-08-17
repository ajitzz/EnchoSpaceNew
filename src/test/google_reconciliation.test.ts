/**
 * Phase 3.8: Google Ads Reconciliation Test Suite
 *
 * Certified Scenarios:
 * 1. Healthy campaign reconciliation report
 * 2. Missing entity drift detection
 * 3. Zero mutation of Meta records during Google reconciliation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: GOOGLE ADS RECONCILIATION TEST SUITE', () => {
  let hostId: number;
  let listingId: number;
  let campaignId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const uRes = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Reconcile Host', 'recon_${Date.now()}@encho.com', 'host', '+1555${Math.floor(1000000 + Math.random() * 8000000)}')
      RETURNING id
    `);
    hostId = uRes.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Telluride Mountain Cabin', 'Luxury Cabin', 'Telluride', '100 Alpine Rd', 800, 'cabin')
      RETURNING id
    `, [hostId]);
    listingId = lRes.rows[0].id;

    const cRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, meta_campaign_id, admin_approved)
      VALUES ($1, $2, 'Telluride Summer Retreat', 1000, 'CAMPAIGN_LIVE', 'meta_camp_untouched_123', true)
      RETURNING id
    `, [hostId, listingId]);
    campaignId = cRes.rows[0].id;

    await pool.query(`
      INSERT INTO provider_entities (
        campaign_id, provider, entity_type, external_id, account_id, configured_status, effective_status
      ) VALUES ($1, 'GOOGLE', 'CAMPAIGN', $2, '123-456-7890', 'ENABLED', 'ELIGIBLE')
    `, [campaignId, `customers/1234567890/campaigns/${campaignId}`]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [hostId]);
  });

  it('1. Generates consistent reconciliation report for verified Google campaign', async () => {
    const report = await googleAdsProvider.reconcileHierarchy(
      campaignId,
      { externalCampaignId: `customers/1234567890/campaigns/${campaignId}` },
      pool
    );

    expect(report.provider).toBe('GOOGLE');
    expect(report.isConsistent).toBe(true);
    expect(report.skewDetected).toBe(false);
  });

  it('2. Detects drift when campaign missing from database', async () => {
    const report = await googleAdsProvider.reconcileHierarchy(
      999999, // non-existent campaign
      { externalCampaignId: `customers/1234567890/campaigns/999999` },
      pool
    );

    expect(report.provider).toBe('GOOGLE');
    expect(report.isConsistent).toBe(false);
    expect(report.skewDetected).toBe(true);
  });

  it('3. Guarantees zero mutation of Meta records during Google reconciliation', async () => {
    const beforeCamp = await pool.query(`SELECT meta_campaign_id FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    expect(beforeCamp.rows[0].meta_campaign_id).toBe('meta_camp_untouched_123');

    await googleAdsProvider.reconcileHierarchy(
      campaignId,
      { externalCampaignId: `customers/1234567890/campaigns/${campaignId}` },
      pool
    );

    const afterCamp = await pool.query(`SELECT meta_campaign_id FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    expect(afterCamp.rows[0].meta_campaign_id).toBe('meta_camp_untouched_123');
  });
});
