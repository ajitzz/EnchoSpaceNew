/**
 * Phase 3.8: Google Ads Provider Contract Test Suite
 *
 * Certified Scenarios:
 * 1. Google provider registration in ProviderRegistry
 * 2. Hierarchy creation adhering to AdProvider contract
 * 3. Pause campaign control operation
 * 4. Resume campaign control operation
 * 5. Budget update with authorized limit guard
 * 6. Hierarchy ownership verification
 * 7. Delivery truth reduction
 * 8. Telemetry normalization
 * 9. Reconcile hierarchy
 * 10. Tenant isolation enforcement
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { providerRegistry } from '../lib/providers/providerRegistry.js';
import { GoogleAdsProvider, googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';
import { ProviderPublishRequest, ProviderControlRequest, ProviderBudgetUpdateRequest } from '../lib/providers/types.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.8: GOOGLE ADS PROVIDER CONTRACT TEST SUITE', () => {
  let hostAId: number;
  let hostBId: number;
  let listingAId: number;
  let campaignAId: number;
  let campaignBId: number;
  let googleProvider: GoogleAdsProvider;

  beforeAll(async () => {
    await ensureMarketingSchema();

    providerRegistry.registerProvider(googleAdsProvider);
    googleProvider = providerRegistry.getProvider('GOOGLE') as GoogleAdsProvider;

    const seed = Math.floor(1000000 + Math.random() * 8000000);
    const uRes1 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host A GoogleTest', 'host_a_google_${Date.now()}@encho.com', 'host', '+1555${seed}1')
      RETURNING id
    `);
    hostAId = uRes1.rows[0].id;

    const uRes2 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host B GoogleTest', 'host_b_google_${Date.now()}@encho.com', 'host', '+1555${seed}2')
      RETURNING id
    `);
    hostBId = uRes2.rows[0].id;

    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Aspen Mountain Chalet', 'Luxury Aspen Chalet', 'Aspen', '500 Ski Way', 950, 'chalet')
      RETURNING id
    `, [hostAId]);
    listingAId = lRes.rows[0].id;

    const cRes1 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, admin_approved
      ) VALUES (
        $1, $2, 'Aspen Winter Escape', 1000, 'CAMPAIGN_LIVE', true
      ) RETURNING id
    `, [hostAId, listingAId]);
    campaignAId = cRes1.rows[0].id;

    const cRes2 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, admin_approved
      ) VALUES (
        $1, $2, 'Host B Isolated Google Campaign', 500, 'CAMPAIGN_LIVE', true
      ) RETURNING id
    `, [hostBId, listingAId]);
    campaignBId = cRes2.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES (
        $1, 100000, 15000, 85000, 0, 85000, 'USD'
      ) ON CONFLICT (campaign_id) DO NOTHING
    `, [campaignAId]);
  }, 60000);

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_publishing_transactions WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM listings WHERE user_id IN ($1, $2) OR id = $3`, [hostAId, hostBId, listingAId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [hostAId, hostBId]);
  });

  it('1. Google provider registration in ProviderRegistry', () => {
    expect(providerRegistry.hasProvider('GOOGLE')).toBe(true);
    const provider = providerRegistry.getProvider('GOOGLE');
    expect(provider).toBeDefined();
    expect(provider.providerId).toBe('GOOGLE');
    expect(provider.apiVersion).toBe('v18');
    expect(provider.capabilities.supportsBudgetMutation).toBe(true);
    expect(provider.capabilities.supportsAssetLevelTargeting).toBe(true);
  });

  let createdExternalCampaignId: string;

  it('2. Hierarchy creation adhering to AdProvider contract', async () => {
    const publishReq: ProviderPublishRequest = {
      campaignId: campaignAId,
      hostId: hostAId,
      listingId: listingAId,
      title: 'Aspen Luxury Ski Chalet',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 85000 },
      targetAudience: { locations: ['New York', 'Chicago'] },
      creativeAssets: {
        headline: 'Book Luxury Aspen Chalet',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingAId}`
      },
      idempotencyKey: `idemp_google_pub_${Date.now()}`,
      correlationId: `corr_google_pub_${Date.now()}`
    };

    const result = await googleProvider.createCampaignHierarchy(publishReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('GOOGLE');
    expect(result.externalCampaignId).toMatch(/^customers\/\d+\/campaigns\/\d+$/);
    createdExternalCampaignId = result.externalCampaignId;
  });

  it('3. Pause campaign control operation', async () => {
    const pauseReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: createdExternalCampaignId,
      action: 'PAUSE',
      reason: 'Host requested pause',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: `idemp_google_pause_${Date.now()}`,
      correlationId: `corr_google_pause_${Date.now()}`
    };

    const result = await googleProvider.pauseCampaign(pauseReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('GOOGLE');
    expect(result.normalizedDeliveryState).toBe('PAUSED');
  });

  it('4. Resume campaign control operation', async () => {
    const resumeReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: createdExternalCampaignId,
      action: 'RESUME',
      reason: 'Host requested resume',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: `idemp_google_resume_${Date.now()}`,
      correlationId: `corr_google_resume_${Date.now()}`
    };

    const result = await googleProvider.resumeCampaign(resumeReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('GOOGLE');
    expect(result.normalizedDeliveryState).toBe('LIVE');
  });

  it('5. Budget update with authorized limit guard', async () => {
    const budgetReq: ProviderBudgetUpdateRequest = {
      campaignId: campaignAId,
      externalCampaignId: createdExternalCampaignId,
      newBudget: { currency: 'USD', minor_units: 50000 },
      authorizedLimit: { currency: 'USD', minor_units: 85000 },
      idempotencyKey: `idemp_google_budget_${Date.now()}`,
      correlationId: `corr_google_budget_${Date.now()}`
    };

    const result = await googleProvider.updateBudget(budgetReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('GOOGLE');
  });

  it('6. Hierarchy ownership verification', async () => {
    const isValid = await googleProvider.validateHierarchyOwnership(
      campaignAId,
      { externalCampaignId: createdExternalCampaignId },
      pool
    );
    expect(isValid).toBe(true);
  });

  it('7. Delivery truth reduction', async () => {
    const truth = await googleProvider.fetchAuthoritativeDeliveryTruth(createdExternalCampaignId, pool);
    expect(truth.provider).toBe('GOOGLE');
    expect(['LIVE', 'PAUSED', 'REVIEWING', 'DISAPPROVED', 'NOT_DELIVERING', 'UNKNOWN']).toContain(truth.normalizedState);
  });

  it('8. Telemetry normalization', async () => {
    const snapshot = await googleProvider.fetchTelemetrySnapshot(
      createdExternalCampaignId,
      { startDate: '2026-08-01', endDate: '2026-08-16' },
      pool
    );

    expect(snapshot.provider).toBe('GOOGLE');
    expect(snapshot.spend.currency).toBe('USD');
    expect(typeof snapshot.spend.minor_units).toBe('number');
    expect(Number.isNaN(snapshot.ctr)).toBe(false);
  });

  it('9. Reconcile hierarchy', async () => {
    const report = await googleProvider.reconcileHierarchy(
      campaignAId,
      { externalCampaignId: `customers/1234567890/campaigns/${campaignAId}` },
      pool
    );
    expect(report.provider).toBe('GOOGLE');
    expect(report.isConsistent).toBe(true);
  });

  it('10. Tenant isolation enforcement', async () => {
    const unauthorizedReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: `customers/1234567890/campaigns/${campaignAId}`,
      action: 'PAUSE',
      reason: 'Malicious tenant breach attempt',
      actorType: 'host',
      actorId: hostBId, // Host B unauthorized
      idempotencyKey: `idemp_cross_google_${Date.now()}`,
      correlationId: `corr_cross_google_${Date.now()}`
    };

    const result = await googleProvider.pauseCampaign(unauthorizedReq, pool);
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Tenant isolation|FORBIDDEN/i);
  });
});
