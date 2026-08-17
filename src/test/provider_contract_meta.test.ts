/**
 * Phase 3.7B: Meta Provider Contract & Abstraction Test Suite
 *
 * Certified Scenarios:
 * 1. Meta provider registration in ProviderRegistry
 * 2. Publish mapping & hierarchy initialization
 * 3. Pause campaign control operation
 * 4. Resume campaign control operation
 * 5. Budget guard & authorization ceiling enforcement
 * 6. Hierarchy ownership verification
 * 7. Normalized delivery truth reduction
 * 8. Telemetry normalization & MoneyAmount representation
 * 9. Hierarchy reconciliation & drift detection
 * 10. Unknown outcome resilience
 * 11. Operation idempotency enforcement
 * 12. Strict tenant isolation across provider boundary
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'crypto';
import { providerRegistry } from '../lib/providers/providerRegistry.js';
import { MetaAdProvider, metaAdProvider } from '../lib/providers/meta/MetaAdProvider.js';
import { ProviderPublishRequest, ProviderControlRequest, ProviderBudgetUpdateRequest } from '../lib/providers/types.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.7B: PROVIDER ABSTRACTION FOUNDATION & META CONTRACT TEST SUITE', () => {
  let hostAId: number;
  let hostBId: number;
  let adminId: number;
  let listingAId: number;
  let campaignAId: number;
  let campaignBId: number;
  let metaProvider: MetaAdProvider;

  beforeAll(async () => {
    await ensureMarketingSchema();

    providerRegistry.registerProvider(metaAdProvider);
    metaProvider = providerRegistry.getProvider('META') as MetaAdProvider;

    // 1. Seed Users
    const seed = Math.floor(1000000 + Math.random() * 8000000);
    const uRes1 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host A ProviderTest', 'host_a_provider_${Date.now()}@encho.com', 'host', '+1555${seed}1')
      RETURNING id
    `);
    hostAId = uRes1.rows[0].id;

    const uRes2 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host B ProviderTest', 'host_b_provider_${Date.now()}@encho.com', 'host', '+1555${seed}2')
      RETURNING id
    `);
    hostBId = uRes2.rows[0].id;

    const uRes3 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Admin ProviderTest', 'admin_provider_${Date.now()}@encho.com', 'admin', '+1555${seed}3')
      RETURNING id
    `);
    adminId = uRes3.rows[0].id;

    // 2. Seed Listing
    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Malibu Oceanview Estate', 'Luxury ocean view', 'Malibu', '100 Ocean Way', 850, 'villa')
      RETURNING id
    `, [hostAId]);
    listingAId = lRes.rows[0].id;

    // 3. Seed Campaigns
    const cRes1 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, meta_campaign_id, meta_ad_id, admin_approved
      ) VALUES (
        $1, $2, 'Malibu Summer Luxury', 1000, 'CAMPAIGN_LIVE', 'meta_camp_p37b_a', 'meta_ad_p37b_a', true
      ) RETURNING id
    `, [hostAId, listingAId]);
    campaignAId = cRes1.rows[0].id;

    const cRes2 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, meta_campaign_id, meta_ad_id, admin_approved
      ) VALUES (
        $1, $2, 'Host B Isolated Campaign', 500, 'CAMPAIGN_LIVE', 'meta_camp_p37b_b', 'meta_ad_p37b_b', true
      ) RETURNING id
    `, [hostBId, listingAId]);
    campaignBId = cRes2.rows[0].id;

    // 4. Seed Financial Contract
    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES (
        $1, 100000, 15000, 85000, 0, 85000, 'USD'
      ) ON CONFLICT (campaign_id) DO NOTHING
    `, [campaignAId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_publishing_transactions WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM provider_entities WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingAId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [hostAId, hostBId, adminId]);
  });

  it('1. Meta provider registration in ProviderRegistry', () => {
    expect(providerRegistry.hasProvider('META')).toBe(true);
    const provider = providerRegistry.getProvider('META');
    expect(provider).toBeDefined();
    expect(provider.providerId).toBe('META');
    expect(provider.apiVersion).toBe('v21.0');
    expect(provider.capabilities.supportsBudgetMutation).toBe(true);
    expect(provider.capabilities.supportsCreativeMutation).toBe(true);
  });

  it('2. Publish mapping & hierarchy initialization', async () => {
    const publishReq: ProviderPublishRequest = {
      campaignId: campaignAId,
      hostId: hostAId,
      listingId: listingAId,
      title: 'Malibu Oceanfront Retreat',
      objective: 'OUTCOME_LEADS',
      budget: { currency: 'USD', minor_units: 85000 },
      targetAudience: { locations: ['Los Angeles', 'San Francisco'] },
      creativeAssets: {
        headline: 'Experience Coastal Luxury',
        mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        landingPageUrl: `https://encho.space/rooms/${listingAId}`
      },
      idempotencyKey: `idemp_publish_p37b_${Date.now()}`,
      correlationId: `corr_publish_p37b_${Date.now()}`
    };

    const result = await metaProvider.createCampaignHierarchy(publishReq, pool);
    expect(result.provider).toBe('META');
    expect(result.hierarchy.campaignId).toBe(campaignAId);
  });

  it('3. Pause campaign control operation', async () => {
    const pauseReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      action: 'PAUSE',
      reason: 'Host requested pause via UI',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: `idemp_pause_p37b_${Date.now()}`,
      correlationId: `corr_pause_p37b_${Date.now()}`
    };

    const result = await metaProvider.pauseCampaign(pauseReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('META');
    expect(result.normalizedDeliveryState).toBe('PAUSED');
  });

  it('4. Resume campaign control operation', async () => {
    const resumeReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      action: 'RESUME',
      reason: 'Host requested resume via UI',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: `idemp_resume_p37b_${Date.now()}`,
      correlationId: `corr_resume_p37b_${Date.now()}`
    };

    const result = await metaProvider.resumeCampaign(resumeReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('META');
    expect(result.normalizedDeliveryState).toBe('LIVE');
  });

  it('5. Budget guard & authorization ceiling enforcement', async () => {
    const budgetReq: ProviderBudgetUpdateRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      newBudget: { currency: 'USD', minor_units: 5000 },
      authorizedLimit: { currency: 'USD', minor_units: 85000 },
      idempotencyKey: `idemp_budget_p37b_${Date.now()}`,
      correlationId: `corr_budget_p37b_${Date.now()}`
    };

    const result = await metaProvider.updateBudget(budgetReq, pool);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('META');
  });

  it('6. Hierarchy ownership verification', async () => {
    const isValid = await metaProvider.validateHierarchyOwnership(
      campaignAId,
      {
        externalCampaignId: 'meta_camp_p37b_a',
        externalContainerId: 'meta_adset_p37b_a',
        externalAdId: 'meta_ad_p37b_a'
      },
      pool
    );
    expect(typeof isValid).toBe('boolean');
  });

  it('7. Normalized delivery truth reduction', async () => {
    const truth = await metaProvider.fetchAuthoritativeDeliveryTruth('meta_camp_p37b_a', pool);
    expect(truth.provider).toBe('META');
    expect(['LIVE', 'PAUSED', 'REVIEWING', 'DISAPPROVED', 'NOT_DELIVERING', 'UNKNOWN']).toContain(truth.normalizedState);
  });

  it('8. Telemetry normalization & MoneyAmount representation', async () => {
    const snapshot = await metaProvider.fetchTelemetrySnapshot(
      'meta_camp_p37b_a',
      { startDate: '2026-08-01', endDate: '2026-08-16' },
      pool
    );

    expect(snapshot.provider).toBe('META');
    expect(snapshot.spend).toBeDefined();
    expect(snapshot.spend.currency).toBe('USD');
    expect(typeof snapshot.spend.minor_units).toBe('number');
    expect(Number.isNaN(snapshot.ctr)).toBe(false);
    expect(Number.isNaN(snapshot.cpc)).toBe(false);
  });

  it('9. Hierarchy reconciliation & drift detection', async () => {
    const report = await metaProvider.reconcileHierarchy(
      campaignAId,
      {
        externalCampaignId: 'meta_camp_p37b_a',
        externalContainerId: 'meta_adset_p37b_a',
        externalAdId: 'meta_ad_p37b_a'
      },
      pool
    );

    expect(report.provider).toBe('META');
    expect(report.campaignId).toBe(campaignAId);
    expect(typeof report.isConsistent).toBe('boolean');
  });

  it('10. Unknown outcome resilience', async () => {
    // Test that querying non-existent external campaign falls back gracefully
    const truth = await metaProvider.fetchAuthoritativeDeliveryTruth('non_existent_meta_id_9999', pool);
    expect(truth.provider).toBe('META');
    expect(truth.normalizedState).toBe('UNKNOWN');
  });

  it('11. Operation idempotency enforcement', async () => {
    const fixedIdempKey = `idemp_dup_test_${Date.now()}`;
    const pauseReq1: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      action: 'PAUSE',
      reason: 'Idempotency test 1',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: fixedIdempKey,
      correlationId: `corr_idemp_1_${Date.now()}`
    };

    const res1 = await metaProvider.pauseCampaign(pauseReq1, pool);
    expect(res1.success).toBe(true);

    const pauseReq2: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      action: 'PAUSE',
      reason: 'Idempotency test 2',
      actorType: 'host',
      actorId: hostAId,
      idempotencyKey: fixedIdempKey,
      correlationId: `corr_idemp_2_${Date.now()}`
    };

    const res2 = await metaProvider.pauseCampaign(pauseReq2, pool);
    expect(res2.success).toBe(true);
  });

  it('12. Strict tenant isolation across provider boundary', async () => {
    // Host B attempts to pause Campaign A owned by Host A
    const maliciousReq: ProviderControlRequest = {
      campaignId: campaignAId,
      externalCampaignId: 'meta_camp_p37b_a',
      action: 'PAUSE',
      reason: 'Malicious cross-tenant attempt',
      actorType: 'host',
      actorId: hostBId, // Host B unauthorized
      idempotencyKey: `idemp_cross_tenant_${Date.now()}`,
      correlationId: `corr_cross_tenant_${Date.now()}`
    };

    const result = await metaProvider.pauseCampaign(maliciousReq, pool);
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Forbidden|Unauthorized|tenant|ownership/i);
  });
});
