import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { GoogleAdsClient } from '../../lib/providers/google/GoogleAdsClient.js';
import { GoogleAdsProvider } from '../../lib/providers/google/GoogleAdsProvider.js';
import { GooglePublishingStore } from '../../lib/providers/google/GooglePublishingStore.js';
import type { ProviderPublishRequest, ProviderControlRequest } from '../../lib/providers/types.js';
import { createLocalPostgresFixture } from './postgres.js';

import {customer, root, ids, origin, request, providerFixture} from './googleProviderFixture.js';

describe('HARVO Google provider — real transport code and isolated PostgreSQL', () => {
  let pool: Pool;
  let close: () => Promise<void>;
  beforeAll(async () => { ({ pool, close } = await createLocalPostgresFixture()); });
  afterAll(async () => { await close?.(); });
  beforeEach(async () => {
    await pool.query('TRUNCATE provider_entities, provider_publishing_transactions, campaign_financial_contracts, host_marketing_campaigns, listings RESTART IDENTITY CASCADE');
    await pool.query("INSERT INTO listings (id,user_id,title,slug,publication_status) VALUES (20,10,'Lake House','lake-house','published')");
    await pool.query('INSERT INTO host_marketing_campaigns VALUES (1,10,20)');
    await pool.query(`INSERT INTO campaign_financial_contracts (campaign_id,gross_host_charge,encho_fee_amount,meta_authorized_spend,meta_remaining_authorization,currency) VALUES (1,10500,500,10000,10000,'INR')`);
  });

  it('creates a provider-verified total budget and preserves the same funded authorization',async()=>{
    const {provider,state}=providerFixture();const req=request();req.metadata!.googleSearch.budgetMode='CAMPAIGN_TOTAL';
    const result=await provider.createCampaignHierarchy(req,pool);expect(result.success).toBe(true);
    expect(state.operations[0].campaignBudgetOperation.create).toMatchObject({period:'CUSTOM_PERIOD',totalAmountMicros:'100000000',explicitlyShared:false});
    expect(state.operations[0].campaignBudgetOperation.create).not.toHaveProperty('amountMicros');
    const metadata=(await pool.query("SELECT metadata FROM provider_entities WHERE entity_type='CAMPAIGN'")).rows[0].metadata;
    expect(metadata).toMatchObject({budgetMode:'CAMPAIGN_TOTAL',totalBudgetMinor:10000,startTime:'2026-10-01',endTime:'2026-10-10'});
    expect(metadata).not.toHaveProperty('dailyBudgetMinor');
    expect((await provider.reconcileHierarchy(1,{externalCampaignId:ids.campaign,externalContainerId:ids.group,externalAdId:ids.ad},pool)).isConsistent).toBe(true);
  });
  it.each(['TOTAL_WRONG_PERIOD','TOTAL_WRONG_AMOUNT','TOTAL_WRONG_DATES'])('quarantines total-budget readback mismatch %s',async mode=>{
    const {provider,state}=providerFixture(mode);const req=request();req.metadata!.googleSearch.budgetMode='CAMPAIGN_TOTAL';
    expect((await provider.createCampaignHierarchy(req,pool)).error?.code).toBe('GOOGLE_UNKNOWN_OUTCOME');
    expect((await pool.query('SELECT publish_status FROM provider_publishing_transactions')).rows[0].publish_status).toBe('RECONCILIATION_REQUIRED');
    expect(state.mutations).toBe(1);
  });
  it('creates and verifies actual transport-returned paused hierarchy and preserves financial amounts', async () => {
    const { provider, state } = providerFixture();
    const result = await provider.createCampaignHierarchy(request(), pool);
    expect(result).toMatchObject({ success: true, externalCampaignId: ids.campaign, externalContainerId: ids.group, externalAdId: ids.ad, rawResponse: { creationState: 'PAUSED', deliveryConfirmed: false } });
    expect(result.externalCreativeId).toBeUndefined();
    expect(state.mutations).toBe(1);
    expect(state.operations).toHaveLength(7);
    expect(state.operations[0].campaignBudgetOperation.create.amountMicros).toBe('10000000');
    for (const [index, key] of [[1, 'campaignOperation'], [2, 'adGroupOperation'], [3, 'adGroupAdOperation']] as const) expect(state.operations[index][key].create.status).toBe('PAUSED');
    expect(state.calls.find(c => c.url.endsWith(':mutate'))!.body.partialFailure).toBe(false);
    const tx = (await pool.query('SELECT * FROM provider_publishing_transactions')).rows[0];
    expect(tx.publish_status).toBe('COMMITTED');
    expect(tx.is_unknown_outcome).toBe(false);
    expect((await pool.query('SELECT external_id,configured_status,effective_status FROM provider_entities ORDER BY id')).rows).toEqual([
      { external_id: ids.campaign, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
      { external_id: ids.group, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
      { external_id: ids.ad, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
    ]);
    expect((await pool.query('SELECT meta_remaining_authorization FROM campaign_financial_contracts')).rows[0].meta_remaining_authorization).toBe('10000');
  });

  it('makes one mutation under simultaneous requests and returns the stored result on replay', async () => {
    const { provider, state } = providerFixture();
    const responses = await Promise.all(Array.from({ length: 12 }, () => provider.createCampaignHierarchy(request(), pool)));
    expect(responses.some(r => r.success)).toBe(true);
    expect(state.mutations).toBe(1);
    const replay = await provider.createCampaignHierarchy(request(), pool);
    expect(replay).toMatchObject({ success: true, isDuplicate: true, externalCampaignId: ids.campaign });
    const changed = request(); changed.metadata!.listingRevision = 'changed';
    expect((await provider.createCampaignHierarchy(changed, pool)).success).toBe(false);
    const newKey = request(); newKey.idempotencyKey = 'different-key';
    expect((await provider.createCampaignHierarchy(newKey, pool)).success).toBe(false);
    expect(state.mutations).toBe(1);
  });

  it.each(['TIMEOUT', 'FOREIGN_ID', 'READ_FAILURE', 'UNSAFE_STATUS', 'WRONG_BUDGET'])('quarantines %s and prevents re-creation even with a new key', async mode => {
    const { provider, state } = providerFixture(mode);
    const result = await provider.createCampaignHierarchy(request(), pool);
    expect(result).toMatchObject({ success: false, error: { code: 'GOOGLE_UNKNOWN_OUTCOME', isRetryable: false } });
    const row = (await pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows[0];
    expect(row).toEqual({ publish_status: 'RECONCILIATION_REQUIRED', is_unknown_outcome: true });
    expect((await pool.query('SELECT * FROM provider_entities')).rows).toHaveLength(0);
    const retry = request(); retry.idempotencyKey = 'fresh-key';
    expect((await provider.createCampaignHierarchy(retry, pool)).success).toBe(false);
    expect(state.mutations).toBe(1);
  });

  it('records definite rejection separately without claiming created resources', async () => {
    const { provider } = providerFixture('REJECTED');
    const result = await provider.createCampaignHierarchy(request(), pool);
    expect(result.success).toBe(false);
    expect(result.error?.code).not.toBe('GOOGLE_UNKNOWN_OUTCOME');
    expect((await pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows[0]).toEqual({ publish_status: 'FAILED', is_unknown_outcome: false });
  });

  it.each(['MANAGER_ACCOUNT', 'CURRENCY_MISMATCH'])('rejects %s before mutation', async mode => {
    const { provider, state } = providerFixture(mode);
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false);
    expect(state.mutations).toBe(0);
  });

  it('rejects mismatched host and absent contract before any HTTP calls', async () => {
    const { provider, state } = providerFixture();
    const other = request(); other.hostId = 99;
    expect((await provider.createCampaignHierarchy(other, pool)).success).toBe(false);
    await pool.query('DELETE FROM campaign_financial_contracts');
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it('rejects another property destination before any HTTP calls', async () => {
    const { provider, state } = providerFixture();
    const other = request(); other.creativeAssets.landingPageUrl = `${origin}/stay/another-property`;
    expect((await provider.createCampaignHierarchy(other, pool)).success).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it('preserves returned resource evidence if local persistence fails after Google success', async () => {
    const { provider, state } = providerFixture();
    const failure = vi.spyOn(GooglePublishingStore.prototype, 'complete').mockRejectedValueOnce(new Error('fixture DB connection lost'));
    expect((await provider.createCampaignHierarchy(request(), pool)).error?.code).toBe('GOOGLE_UNKNOWN_OUTCOME');
    failure.mockRestore();
    const tx = (await pool.query('SELECT * FROM provider_publishing_transactions')).rows[0];
    expect(tx.publish_status).toBe('RECONCILIATION_REQUIRED');
    expect(JSON.stringify(tx.response)).toContain(ids.campaign);
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false);
    expect(state.mutations).toBe(1);
  });

  it('returns UNKNOWN with no new observation timestamp when Google read fails', async () => {
    const successful = providerFixture();
    expect((await successful.provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    const { provider } = providerFixture('READ_FAILURE');
    expect(await provider.fetchAuthoritativeDeliveryTruth(ids.campaign, pool)).toMatchObject({ normalizedState: 'UNKNOWN', isLive: false, isServingImpressions: false, lastObservedAt: '', reconciliationRequired: true });
  });

  it('does not equate eligibility with observed impressions', async () => {
    expect((await providerFixture().provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    expect(await providerFixture('ELIGIBLE').provider.fetchAuthoritativeDeliveryTruth(ids.campaign, pool)).toMatchObject({ normalizedState: 'NOT_DELIVERING', readiness:'BLOCKED', isLive: false, isServingImpressions: false, reconciliationRequired: false });
    expect(await providerFixture('DELIVERY_ELIGIBLE').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,pool)).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false});
    expect(await providerFixture('POLICY_REVIEW').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,pool)).toMatchObject({readiness:'REVIEWING',normalizedState:'REVIEWING',isLive:false});
  });

  it.each(['GROUP_DRIFT', 'AD_DRIFT', 'WRONG_BUDGET'])('detects structural hierarchy drift for %s', async mode => {
    expect((await providerFixture().provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    const report = await providerFixture(mode).provider.reconcileHierarchy(1, { externalCampaignId: ids.campaign, externalContainerId: ids.group, externalAdId: ids.ad }, pool);
    expect(report).toMatchObject({ isConsistent: false, skewDetected: true, autoCorrected: false });
  });

  it('does not accept corrupted local parentage or foreign composite ad identity', async () => {
    const { provider } = providerFixture();
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    const hierarchy = { externalCampaignId: ids.campaign, externalContainerId: ids.group, externalAdId: ids.ad };
    expect(await provider.validateHierarchyOwnership(1, hierarchy, pool)).toBe(true);
    await pool.query("UPDATE provider_entities SET parent_entity_id=$1 WHERE entity_type='AD'", [`${root}/adGroups/999`]);
    expect(await provider.validateHierarchyOwnership(1, hierarchy, pool)).toBe(false);
    expect(await provider.validateHierarchyOwnership(1, { ...hierarchy, externalAdId: `${root}/adGroupAds/999~888` }, pool)).toBe(false);
  });

  it('reports a consistent paused structural hierarchy only with complete evidence', async () => {
    const { provider } = providerFixture();
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    expect(await provider.reconcileHierarchy(1, { externalCampaignId: ids.campaign, externalContainerId: ids.group, externalAdId: ids.ad }, pool)).toMatchObject({ isConsistent: true, normalizedState: 'PAUSED', skewDetected: false, autoCorrected: false });
  });

  it('queries real-shaped metrics with actual account currency and correct CTR units', async () => {
    const { provider } = providerFixture();
    expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    const metrics = await provider.fetchTelemetrySnapshot(ids.campaign, { startDate: '2026-09-01', endDate: '2026-09-12' }, pool);
    expect(metrics).toMatchObject({ impressions: 200, clicks: 20, conversions: 2.5, ctr: 0.1, spend: { currency: 'INR', minor_units: 123 }, dataFreshness: 'DELAYED' });
  });

  it.each(['EMPTY_METRICS', 'INVALID_METRICS'])('preserves missing observations for %s rather than substituting zero', async mode => {
    expect((await providerFixture().provider.createCampaignHierarchy(request(), pool)).success).toBe(true);
    await expect(providerFixture(mode).provider.fetchTelemetrySnapshot(ids.campaign, { startDate: '2026-09-01', endDate: '2026-09-12' }, pool)).rejects.toMatchObject({ code: mode === 'EMPTY_METRICS' ? 'PROVIDER_REPORT_PENDING' : 'GOOGLE_TELEMETRY_UNAVAILABLE' });
  });

  it('never pretends to apply unimplemented controls or DCO', async () => {
    const { provider, state } = providerFixture();
    const control: ProviderControlRequest = { campaignId: 1, externalCampaignId: ids.campaign, action: 'RESUME', actorType: 'admin', actorId: 1, idempotencyKey: 'control', correlationId: 'trace' };
    expect((await provider.resumeCampaign(control, pool)).success).toBe(false);
    expect((await provider.pauseCampaign({ ...control, action: 'PAUSE' }, pool)).success).toBe(false);
    expect((await provider.updateBudget({ campaignId: 1, externalCampaignId: ids.campaign, newBudget: { currency: 'INR', minor_units: 100 }, authorizedLimit: { currency: 'INR', minor_units: 1000 }, idempotencyKey: 'budget', correlationId: 'trace' }, pool)).success).toBe(false);
    expect(await provider.applyDcoDecision(1, { result: 'WINNER_IDENTIFIED', winner_variant_id: 1, loser_variant_ids: [2] } as any, pool)).toMatchObject({ success: false, mutatedEntityIds: [], actionsTaken: ['GOOGLE_DCO_NOT_IMPLEMENTED'] });
    expect(state.calls).toHaveLength(0);
  });

  it('retains unconditional production dispatch containment even with the environment flag enabled', async () => {
    const source = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    const start = source.indexOf('async function dispatchGoogleAdsCampaign');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}', start) + 2);
    expect(body).toContain('GOOGLE_ADS_CONTAINMENT_LOCKED');
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const gate = new Function('StructuredLogger', 'process', `${compiled}; return dispatchGoogleAdsCampaign;`)({ warn: vi.fn() }, { env: { ENABLE_GOOGLE_ADS_DISPATCH: 'true' } });
    expect(await gate(1)).toMatchObject({ dispatched: false, reason: expect.stringContaining('GOOGLE_ADS_CONTAINMENT_LOCKED') });
    expect(body).not.toContain('createCampaignHierarchy');
    expect(body).not.toContain('if (');
  });
});
