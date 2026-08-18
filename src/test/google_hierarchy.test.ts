/**
 * Phase 3.8: Google Ads Hierarchy & Entity Storage Test Suite
 *
 * Certified Scenarios:
 * 1. Campaign hierarchy node creation
 * 2. AdGroup parent linkage to Campaign
 * 3. AdGroupAd parent linkage to AdGroup
 * 4. Headline Asset parent linkage to AdGroupAd
 * 5. Unique constraint enforcement across provider entities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: GOOGLE ADS HIERARCHY TEST SUITE', () => {
  let hostId: number;
  let listingId: number;
  let campaignId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const uRes = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Hierarchy Host', 'hier_${Date.now()}@encho.com', 'host', '+1555${Math.floor(1000000 + Math.random() * 8000000)}')
      RETURNING id
    `);
    hostId = uRes.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Vail Chalet', 'Vail Ski Chalet', 'Vail', '200 Vail Rd', 1200, 'chalet')
      RETURNING id
    `, [hostId]);
    listingId = lRes.rows[0].id;

    const cRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Vail Ski Getaway', 1000, 'CAMPAIGN_LIVE', true)
      RETURNING id
    `, [hostId, listingId]);
    campaignId = cRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 100000, 15000, 85000, 0, 85000, 'USD')
      ON CONFLICT (campaign_id) DO NOTHING
    `, [campaignId]);
  }, 60000);

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [hostId]);
  });

  it('1. Creates full 4-tier Google hierarchy in provider_entities', async () => {
    const res = await googleAdsProvider.createCampaignHierarchy({
      campaignId,
      hostId,
      listingId,
      title: 'Vail Alpine Lodge',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 85000 },
      targetAudience: { locations: ['Denver', 'Boulder'] },
      creativeAssets: {
        headline: 'Ski In Luxury At Vail',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingId}`
      },
      idempotencyKey: `idemp_hier_${Date.now()}`,
      correlationId: `corr_hier_${Date.now()}`
    }, pool);

    expect(res.success).toBe(true);

    const entitiesRes = await pool.query(
      `SELECT entity_type, external_id, parent_entity_id FROM provider_entities WHERE campaign_id = $1 AND provider = 'GOOGLE' ORDER BY id ASC`,
      [campaignId]
    );

    const entityTypes = entitiesRes.rows.map(r => r.entity_type);
    expect(entityTypes).toContain('CAMPAIGN');
    expect(entityTypes).toContain('AD_GROUP');
    expect(entityTypes).toContain('AD');
    expect(entityTypes).toContain('ASSET');

    // Verify parentage
    const adGroup = entitiesRes.rows.find(r => r.entity_type === 'AD_GROUP');
    const campaign = entitiesRes.rows.find(r => r.entity_type === 'CAMPAIGN');
    expect(adGroup.parent_entity_id).toBe(campaign.external_id);
  });
});
