import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import { executeAutomatedDcoRebalancing, evaluateVariantComparison } from '../lib/dcoEngine.js';
import { detectLanguageFromGeotarget, localizeAdCopyForFeederMarkets } from '../lib/aiLocalizer.js';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('MILESTONE 15: AUTOMATED DCO BUDGET SHIFTING & MULTILINGUAL AI LOCALIZER', () => {
  let hostId: number;
  let listingId: number;
  let campaignId: number;
  let variant1Id: number;
  let variant2Id: number;

  beforeAll(async () => {
    const seed = Math.floor(1000000 + Math.random() * 8000000);
    const hostRes = await pool.query(`
      INSERT INTO users (email, name, role)
      VALUES ($1, 'DCO Host Test', 'user')
      RETURNING id
    `, ['dco.host.' + seed + '@enchospace.com']);
    hostId = hostRes.rows[0].id;

    const listingRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'DCO Luxury Villa', 'Scenic hill resort with private pool', 'Wayanad', 'Kerala Hills Road 12', 5000, 'villa')
      RETURNING id
    `, [hostId]);
    listingId = listingRes.rows[0].id;

    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, description, feed_description, ad_format, platforms,
        budget, status, admin_approved, policy_cleared, payment_status, escrow_status,
        target_locations, target_radius_km, target_audience_persona, media_urls
      ) VALUES (
        $1, $2, 'Luxury Wayanad Retreat', 'Scenic hill resort in Wayanad',
        'Book your private luxury escape in Wayanad today.', 'post',
        '["facebook_feed", "instagram_feed"]'::jsonb, 5000, 'CAMPAIGN_LIVE',
        true, true, 'paid', 'released', 'Mumbai, Delhi', 50, 'everyone',
        '["https://example.com/img1.jpg", "https://example.com/img2.jpg"]'::jsonb
      ) RETURNING id
    `, [hostId, listingId]);
    campaignId = campRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES (
        $1, 500000, 75000, 425000, 0, 425000, 'INR'
      )
    `, [campaignId]);

    const activatedAt = new Date(Date.now() - 48 * 3600 * 1000);

    const v1Res = await pool.query(`
      INSERT INTO campaign_creative_variants (
        campaign_id, media_url, media_type, meta_creative_id, meta_ad_id, status, is_published,
        variant_activated_at, created_at, updated_at
      ) VALUES (
        $1, 'https://example.com/img1.jpg', 'IMAGE', 'cr_meta_1', 'ad_meta_1', 'ACTIVE', true,
        $2, $2, $2
      ) RETURNING id
    `, [campaignId, activatedAt]);
    variant1Id = v1Res.rows[0].id;

    const v2Res = await pool.query(`
      INSERT INTO campaign_creative_variants (
        campaign_id, media_url, media_type, meta_creative_id, meta_ad_id, status, is_published,
        variant_activated_at, created_at, updated_at
      ) VALUES (
        $1, 'https://example.com/img2.jpg', 'IMAGE', 'cr_meta_2', 'ad_meta_2', 'ACTIVE', true,
        $2, $2, $2
      ) RETURNING id
    `, [campaignId, activatedAt]);
    variant2Id = v2Res.rows[0].id;

    // Seed snapshots
    await pool.query(`
      INSERT INTO variant_meta_snapshots (
        variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, last_meta_fetched_at
      ) VALUES 
        ($1, 1200, 85, 12, 1500, NOW()),
        ($2, 1100, 30, 2, 1400, NOW())
    `, [variant1Id, variant2Id]);
  });

  afterAll(async () => {
    if (campaignId) {
      if (variant1Id || variant2Id) {
        await pool.query('DELETE FROM variant_meta_snapshots WHERE variant_id IN ($1, $2)', [variant1Id, variant2Id]);
      }
      await pool.query('DELETE FROM campaign_creative_variants WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM campaign_financial_contracts WHERE campaign_id = $1', [campaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    }
    if (listingId) {
      await pool.query('DELETE FROM listings WHERE id = $1', [listingId]);
    }
    if (hostId) {
      await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
    }
    await pool.end();
  });

  it('1. Pure statistical comparison correctly identifies winning creative variant', () => {
    const variants = [
      { id: 1, meta_ad_id: 'ad_meta_1', impressions: 1200, clicks: 85, conversions: 12, spend: 1500, activated_at: new Date(Date.now() - 48 * 3600 * 1000) },
      { id: 2, meta_ad_id: 'ad_meta_2', impressions: 1100, clicks: 30, conversions: 2, spend: 1400, activated_at: new Date(Date.now() - 48 * 3600 * 1000) }
    ];
    const result = evaluateVariantComparison(variants as any);
    expect(result.result).toBe('WINNER_IDENTIFIED');
    expect(result.winner_variant_id).toBe(1);
    expect(result.loser_variant_ids).toContain(2);
    expect(result.relative_advantage).toBeGreaterThan(0.15);
  });

  it('2. 24-Hour Automated DCO budget rebalancer shifts 80% spend to statistical winner in database', async () => {
    const rebalanceResult = await executeAutomatedDcoRebalancing(campaignId, pool);
    expect(rebalanceResult.rebalanced).toBe(true);
    expect(rebalanceResult.winnerVariantId).toBe(variant1Id);
    expect(rebalanceResult.budgetShiftPercent).toBe(80);
    expect(rebalanceResult.weights[variant1Id]).toBe(80);
    expect(rebalanceResult.weights[variant2Id]).toBe(20);

    const updatedVariants = await pool.query(`
      SELECT id, status FROM campaign_creative_variants
      WHERE campaign_id = $1 ORDER BY id ASC
    `, [campaignId]);

    const v1 = updatedVariants.rows.find(r => r.id === variant1Id);
    const v2 = updatedVariants.rows.find(r => r.id === variant2Id);

    expect(v1.status).toBe('WINNER');
    expect(v2.status).toBe('ACTIVE');

    const updatedCamp = await pool.query('SELECT dco_status FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    expect(updatedCamp.rows[0].dco_status).toBe('WINNER_OPTIMIZED');
  });

  it('3. Preserves financial invariants (zero change to gross charge, fee, and authorized spend)', async () => {
    const contractRes = await pool.query(`
      SELECT gross_host_charge, encho_fee_amount, meta_authorized_spend
      FROM campaign_financial_contracts
      WHERE campaign_id = $1
    `, [campaignId]);
    const contract = contractRes.rows[0];
    expect(Number(contract.gross_host_charge)).toBe(500000);
    expect(Number(contract.encho_fee_amount)).toBe(75000);
    expect(Number(contract.meta_authorized_spend)).toBe(425000);
  });

  it('4. Multilingual Geotargeting Language Detection maps feeder locations correctly', () => {
    expect(detectLanguageFromGeotarget('Mumbai, India')).toBe('hi');
    expect(detectLanguageFromGeotarget('Madrid, Spain')).toBe('es');
    expect(detectLanguageFromGeotarget('Paris, France')).toBe('fr');
    expect(detectLanguageFromGeotarget('Berlin, Germany')).toBe('de');
    expect(detectLanguageFromGeotarget('Dubai, UAE')).toBe('ar');
    expect(detectLanguageFromGeotarget('New York, USA')).toBe('en');
  });

  it('5. AI Copy Localizer generates culturally adapted luxury ad copy within character constraints', async () => {
    const originalHeadline = 'Luxury Wayanad Villa Retreat';
    const originalBody = 'Experience breathtaking private pool vistas and unmatched serenity in Wayanad.';

    const localizedHi = await localizeAdCopyForFeederMarkets(originalHeadline, originalBody, 'Mumbai, India');
    expect(localizedHi.targetLanguage).toBe('hi');
    expect(localizedHi.localizedHeadline.length).toBeLessThanOrEqual(30);
    expect(localizedHi.localizedBody.length).toBeLessThanOrEqual(125);
    expect(localizedHi.confidence).toBeGreaterThan(0.8);

    const localizedEs = await localizeAdCopyForFeederMarkets(originalHeadline, originalBody, 'Madrid, Spain');
    expect(localizedEs.targetLanguage).toBe('es');
    expect(localizedEs.localizedHeadline.length).toBeLessThanOrEqual(30);
    expect(localizedEs.localizedBody.length).toBeLessThanOrEqual(125);

    const localizedEn = await localizeAdCopyForFeederMarkets(originalHeadline, originalBody, 'London, UK');
    expect(localizedEn.targetLanguage).toBe('en');
    expect(localizedEn.localizedHeadline).toBe(originalHeadline.slice(0, 30));
  });
});