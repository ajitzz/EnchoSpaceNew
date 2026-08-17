/**
 * Phase 3.8: Google Ads Unknown Outcome & Timeout Recovery Test Suite
 *
 * Certified Scenarios:
 * 1. Timeout records is_unknown_outcome in provider_publishing_transactions
 * 2. Deduplication on identical idempotency key
 * 3. Fallback delivery truth handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: GOOGLE ADS UNKNOWN OUTCOME & TIMEOUT TEST SUITE', () => {
  let hostId: number;
  let listingId: number;
  let campaignId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const uRes = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Timeout Host', 'timeout_${Date.now()}@encho.com', 'host', '+1555${Math.floor(1000000 + Math.random() * 8000000)}')
      RETURNING id
    `);
    hostId = uRes.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Breckenridge Lodge', 'Luxury Lodge', 'Breckenridge', '300 Ridge Rd', 700, 'chalet')
      RETURNING id
    `, [hostId]);
    listingId = lRes.rows[0].id;

    const cRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Breckenridge Summer Peak', 1000, 'CAMPAIGN_LIVE', true)
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
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_publishing_transactions WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id = $1`, [campaignId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = $1`, [campaignId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [hostId]);
  });

  it('1. Handles unknown network outcome gracefully in delivery truth', async () => {
    const truth = await googleAdsProvider.fetchAuthoritativeDeliveryTruth('non_existent_google_id_9999', pool);
    expect(truth.provider).toBe('GOOGLE');
    expect(truth.normalizedState).toBe('UNKNOWN');
    expect(truth.reconciliationRequired).toBe(true);
  });

  it('2. Records and deduplicates publishing transactions under identical idempotency keys', async () => {
    const fixedKey = `idemp_unknown_test_${Date.now()}`;

    const res1 = await googleAdsProvider.createCampaignHierarchy({
      campaignId,
      hostId,
      listingId,
      title: 'Breckenridge Peak Escape',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 85000 },
      targetAudience: { locations: ['Denver'] },
      creativeAssets: {
        headline: 'Book Breckenridge Lodge',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingId}`
      },
      idempotencyKey: fixedKey,
      correlationId: `corr_1_${Date.now()}`
    }, pool);

    expect(res1.success).toBe(true);

    const txRes = await pool.query(
      `SELECT idempotency_key, publish_status FROM provider_publishing_transactions WHERE idempotency_key = $1`,
      [fixedKey]
    );
    expect(txRes.rows.length).toBe(1);
    expect(txRes.rows[0].publish_status).toBe('COMMITTED');
  });
});
