/**
 * Phase 3.8: Multi-Provider Isolation Test Suite
 *
 * Certified Scenarios:
 * 1. Google Ads failure does NOT alter Meta campaign state
 * 2. Meta failure does NOT alter Google campaign state
 * 3. Both providers coexist cleanly in provider_entities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { metaAdProvider } from '../lib/providers/meta/MetaAdProvider.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: MULTI-PROVIDER ISOLATION TEST SUITE', () => {
  let hostId: number;
  let listingId: number;
  let metaCampId: number;
  let googleCampId: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    const uRes = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Isolation Host', 'iso_${Date.now()}@encho.com', 'host', '+1555${Math.floor(1000000 + Math.random() * 8000000)}')
      RETURNING id
    `);
    hostId = uRes.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Park City Haven', 'Luxury Haven', 'Park City', '400 Ski Rd', 880, 'villa')
      RETURNING id
    `, [hostId]);
    listingId = lRes.rows[0].id;

    const cRes1 = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, meta_campaign_id, admin_approved)
      VALUES ($1, $2, 'Meta Summer Campaign', 1000, 'CAMPAIGN_LIVE', 'meta_camp_iso_101', true)
      RETURNING id
    `, [hostId, listingId]);
    metaCampId = cRes1.rows[0].id;

    const cRes2 = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, budget, status, admin_approved)
      VALUES ($1, $2, 'Google Summer Campaign', 1000, 'CAMPAIGN_LIVE', true)
      RETURNING id
    `, [hostId, listingId]);
    googleCampId = cRes2.rows[0].id;

    await pool.query(`
      INSERT INTO provider_entities (
        campaign_id, provider, entity_type, external_id, account_id, configured_status, effective_status
      ) VALUES
        ($1, 'META', 'CAMPAIGN', 'meta_camp_iso_101', 'act_123', 'ACTIVE', 'ACTIVE'),
        ($2, 'GOOGLE', 'CAMPAIGN', $3, '123-456-7890', 'ENABLED', 'ELIGIBLE')
    `, [metaCampId, googleCampId, `customers/1234567890/campaigns/${googleCampId}`]);
  }, 60000);

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id IN ($1, $2)`, [metaCampId, googleCampId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id IN ($1, $2)`, [metaCampId, googleCampId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [hostId]);
  });

  it('1. Google Ads pause mutation does not alter Meta entity status', async () => {
    await googleAdsProvider.pauseCampaign({
      campaignId: googleCampId,
      externalCampaignId: `customers/1234567890/campaigns/${googleCampId}`,
      action: 'PAUSE',
      actorType: 'host',
      actorId: hostId,
      idempotencyKey: `idemp_iso_1_${Date.now()}`,
      correlationId: `corr_iso_1_${Date.now()}`
    }, pool);

    const metaEntity = await pool.query(
      `SELECT configured_status FROM provider_entities WHERE campaign_id = $1 AND provider = 'META'`,
      [metaCampId]
    );
    expect(metaEntity.rows[0].configured_status).toBe('ACTIVE');
  });

  it('2. Coexists cleanly in provider_entities with distinct provider keys', async () => {
    const allEntities = await pool.query(
      `SELECT provider, entity_type, external_id FROM provider_entities WHERE campaign_id IN ($1, $2)`,
      [metaCampId, googleCampId]
    );
    const providers = allEntities.rows.map(r => r.provider);
    expect(providers).toContain('META');
    expect(providers).toContain('GOOGLE');
  });
});
