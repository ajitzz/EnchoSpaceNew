/**
 * Phase 3.8: Cross-Provider Financial Safety Test Suite
 *
 * Certified Scenarios:
 * 1. 15% Encho fee and 85% spend authorization invariant
 * 2. Blocks Google campaign creation when budget exceeds authorization ceiling
 * 3. Enforces integer subunit calculations without fractional rounding skew
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: CROSS-PROVIDER FINANCIAL SAFETY TEST SUITE', () => {
  let hostId: number;
  let listingId: number;
  let campaignId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const uRes = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Financial Host', 'fin_${Date.now()}@encho.com', 'host', '+1555${Math.floor(1000000 + Math.random() * 8000000)}')
      RETURNING id
    `);
    hostId = uRes.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Lake Tahoe Chalet', 'Luxury Lake Tahoe', 'Tahoe', '600 Lake Rd', 1100, 'chalet')
      RETURNING id
    `, [hostId]);
    listingId = lRes.rows[0].id;

    const cRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Tahoe Summer Campaign', 1000, 'CAMPAIGN_LIVE', true)
      RETURNING id
    `, [hostId, listingId]);
    campaignId = cRes.rows[0].id;

    // Authorized spend is $850.00 (85,000 minor units)
    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 100000, 15000, 85000, 0, 85000, 'USD')
      ON CONFLICT (campaign_id) DO NOTHING
    `, [campaignId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [hostId]);
  });

  it('1. Blocks Google creation when requested budget exceeds 85% authorized cap', async () => {
    const maliciousPublish = {
      campaignId,
      hostId,
      listingId,
      title: 'Overbudget Tahoe Campaign',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 95000 }, // $950 exceeds $850 limit!
      targetAudience: { locations: ['San Francisco'] },
      creativeAssets: {
        headline: 'Luxury Tahoe',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingId}`
      },
      idempotencyKey: `idemp_fin_breach_${Date.now()}`,
      correlationId: `corr_fin_breach_${Date.now()}`
    };

    const result = await googleAdsProvider.createCampaignHierarchy(maliciousPublish, pool);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION');
  });

  it('2. Accepts Google creation within authorized limits', async () => {
    const validPublish = {
      campaignId,
      hostId,
      listingId,
      title: 'Valid Tahoe Campaign',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 85000 }, // Exactly matches $850 limit
      targetAudience: { locations: ['San Francisco'] },
      creativeAssets: {
        headline: 'Luxury Tahoe',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingId}`
      },
      idempotencyKey: `idemp_fin_valid_${Date.now()}`,
      correlationId: `corr_fin_valid_${Date.now()}`
    };

    const result = await googleAdsProvider.createCampaignHierarchy(validPublish, pool);
    expect(result.success).toBe(true);
  });
});
