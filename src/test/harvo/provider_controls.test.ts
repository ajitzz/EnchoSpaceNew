import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { GoogleAdsClient } from '../../lib/providers/google/GoogleAdsClient.js';
import { GoogleAdsProvider } from '../../lib/providers/google/GoogleAdsProvider.js';
import { ProviderOperationStore, type ProviderAuthorizationGuard } from '../../lib/providers/ProviderOperationStore.js';
import type { ProviderControlRequest } from '../../lib/providers/types.js';
import { createLocalPostgresFixture } from './postgres.js';
const customer = '9998887777', prefix = `customers/${customer}`;
const ids = { campaign: `${prefix}/campaigns/100`, group: `${prefix}/adGroups/200`, ad: `${prefix}/adGroupAds/200~300`, budget: `${prefix}/campaignBudgets/400`, keyword: `${prefix}/adGroupCriteria/200~500` };
const guard: ProviderAuthorizationGuard = async (ctx, tx) => {
    expect((await tx.query('SELECT txid_current()')).rows).toHaveLength(1);
    if (ctx.operation === 'UPDATE_BUDGET' && (ctx.budgetKind !== 'DAILY' || ctx.budgetMinor! > 2000))
        throw new Error('outside signed finance authorization');
    return { authorizationId: 'finance-reviewed' };
};
const request = (key = 'resume'): ProviderControlRequest => ({ campaignId: 1, externalCampaignId: ids.campaign, action: 'RESUME', actorType: 'admin', actorId: 1, idempotencyKey: key, correlationId: 'test-correlation' });
function fixture(mode = 'OK', authorize: ProviderAuthorizationGuard | undefined = guard) {
    const state = { mutations: [] as any[], status: 'PAUSED', keywordStatus: 'PAUSED', micros: '10000000' };
    const json = (value: any, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    const transport = vi.fn(async (url: any, init: any) => {
        if (String(url).includes('oauth2.googleapis.com'))
            return json({ access_token: 'test-access', expires_in: 3600 });
        const payload = JSON.parse(init.body);
        if (String(url).endsWith('googleAds:mutate')) {
            state.mutations.push(payload);
            if (mode === 'TIMEOUT')
                throw new Error('private network failure');
            if (mode === 'REJECTED')
                return json({ error: { message: 'private' } }, 400);
            for (const operation of payload.mutateOperations) {
                const action = Object.values(operation)[0] as any;
                const update = action.update;
                if (update.amountMicros || update.totalAmountMicros)
                    state.micros = update.amountMicros || update.totalAmountMicros;
                if (update.status) {
                    state.status = update.status;
                    state.keywordStatus = update.status;
                }
            }
            return json({ mutateOperationResponses: payload.mutateOperations.map((operation: any) => { const kind = Object.keys(operation)[0]; return { [kind.replace('Operation', 'Result')]: { resourceName: operation[kind].update.resourceName } }; }) });
        }
        const query: string = payload.query;
        if (query.includes('FROM customer'))
            return json([{ results: [{ customer: { id: customer, resourceName: prefix, manager: false, currencyCode: 'INR', timeZone: 'Asia/Kolkata' } }] }]);
        if (query.includes('FROM ad_group_ad'))
            return json([{ results: [{ campaign: { resourceName: ids.campaign, campaignBudget: ids.budget, status: state.status, startDateTime: '2026-10-01 00:00:00', endDateTime: '2026-10-10 23:59:59' }, adGroup: { resourceName: ids.group, campaign: ids.campaign, status: state.status }, adGroupAd: { resourceName: ids.ad, status: mode === 'READBACK_MISMATCH' && state.mutations.length ? 'PAUSED' : state.status } }] }]);
        if (query.includes('FROM ad_group_criterion'))
            return json([{ results: [{ adGroupCriterion: { resourceName: mode === 'FOREIGN_KEYWORD' ? `${prefix}/adGroupCriteria/200~999` : ids.keyword, status: state.keywordStatus, type: 'KEYWORD', negative: false } }] }]);
        if (query.includes('FROM campaign_budget'))
            return json([{ results: [{ campaignBudget: { resourceName: ids.budget, explicitlyShared: mode === 'SHARED_BUDGET', ...(mode.startsWith('TOTAL') ? { period: mode === 'TOTAL_WRONG_PERIOD' ? 'DAILY' : 'CUSTOM_PERIOD', totalAmountMicros: state.micros } : { amountMicros: state.micros }) } }] }]);
        throw new Error('Unexpected fixture query');
    });
    const client = new GoogleAdsClient({ clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh', developerToken: '', mccCustomerId: '1112223333', customerId: customer }, { fetch: transport as typeof fetch });
    return { provider: new GoogleAdsProvider(client, { authorize }), state, transport };
}
describe('Google guarded control operations with isolated PostgreSQL', () => {
    let pool: Pool, close: () => Promise<void>;
    beforeAll(async () => { ({ pool, close } = await createLocalPostgresFixture()); });
    afterAll(async () => { await close?.(); });
    beforeEach(async () => {
        await pool.query('TRUNCATE provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings RESTART IDENTITY CASCADE');
        await pool.query("INSERT INTO listings VALUES(20,10,'Lake House','lake-house','published')");
        await pool.query('INSERT INTO host_marketing_campaigns VALUES(1,10,20)');
        for (const [type, id, parent] of [['CAMPAIGN', ids.campaign, null], ['AD_GROUP', ids.group, ids.campaign], ['AD', ids.ad, ids.group]])
            await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,parent_entity_id,account_id,configured_status,effective_status,metadata)VALUES(1,'GOOGLE',$1,$2,$3,$4,'PAUSED','UNKNOWN',$5)", [type, id, parent, customer, JSON.stringify({ budgetResourceName: ids.budget, dailyBudgetMinor: 1000 })]);
        await pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,publish_status,is_unknown_outcome,response)VALUES(1,'GOOGLE','CREATE_HIERARCHY','created','COMMITTED',FALSE,$1)", [JSON.stringify({ hierarchy: { externalCampaignId: ids.campaign, rawMetadata: { resourceNames: Object.values(ids) } } })]);
    });
    const setTotal = async () => pool.query("UPDATE provider_entities SET metadata=metadata || $1::jsonb WHERE entity_type='CAMPAIGN'", [JSON.stringify({ budgetMode: 'CAMPAIGN_TOTAL', totalBudgetMinor: 1000, startTime: '2026-10-01', endTime: '2026-10-10', currency: 'INR' })]);
    it('uses lifetime authorization and totalAmountMicros for an existing campaign total budget', async () => {
        await setTotal();
        const authorize = vi.fn(async (ctx: any) => { expect(ctx.budgetKind).toBe('LIFETIME'); expect(ctx.budgetMinor).toBeLessThanOrEqual(2000); return { authorizationId: 'approved-total' }; });
        const { provider, state } = fixture('TOTAL', authorize);
        const result = await provider.updateBudget({ campaignId: 1, externalCampaignId: ids.campaign, newBudget: { currency: 'INR', minor_units: 1500 }, authorizedLimit: { currency: 'INR', minor_units: 999999 }, idempotencyKey: 'total-budget', correlationId: 'trace' }, pool);
        expect(result.success).toBe(true);
        expect(state.mutations[0].mutateOperations).toEqual([{ campaignBudgetOperation: { update: { resourceName: ids.budget, totalAmountMicros: '15000000' }, updateMask: 'totalAmountMicros' } }]);
        expect((await pool.query("SELECT metadata FROM provider_entities WHERE entity_type='CAMPAIGN'")).rows[0].metadata.totalBudgetMinor).toBe(1500);
        expect((await provider.resumeCampaign(request(), pool)).success).toBe(true);
    });
    it('blocks budget type drift and a client attempt to switch budget types', async () => {
        await setTotal();
        const { provider, state } = fixture('TOTAL_WRONG_PERIOD', async () => ({ authorizationId: 'reviewed' }));
        const req = { campaignId: 1, externalCampaignId: ids.campaign, newBudget: { currency: 'INR', minor_units: 1500 }, authorizedLimit: { currency: 'INR', minor_units: 999999 }, idempotencyKey: 'wrong-type', correlationId: 'trace' };
        expect((await provider.updateBudget(req, pool)).success).toBe(false);
        expect(state.mutations).toHaveLength(0);
        const forged = { ...req, idempotencyKey: 'forged-mode', newBudget: { ...req.newBudget, budgetMode: 'DAILY' } };
        expect((await provider.updateBudget(forged, pool)).success).toBe(false);
        expect(state.mutations).toHaveLength(0);
    });
    it('blocks cross-action pause after an uncertain activation rather than racing stale remote writes', async () => {
        const { provider, state } = fixture('TIMEOUT');
        expect((await provider.resumeCampaign(request(), pool)).success).toBe(false);
        expect((await provider.pauseCampaign({ ...request('new-pause'), action: 'PAUSE' }, pool)).success).toBe(false);
        expect(state.mutations).toHaveLength(1);
    });
    it('blocks activation after the remote amount drifts from recorded approval', async () => {
        const { provider, state } = fixture();
        state.micros = '20000000';
        expect((await provider.resumeCampaign(request(), pool)).success).toBe(false);
        expect(state.mutations).toHaveLength(0);
    });
    it('atomically enables approved campaign, group, ad and keywords without inventing LIVE delivery', async () => {
        const { provider, state } = fixture();
        expect(await provider.resumeCampaign(request(), pool)).toMatchObject({ success: true, newStatus: 'ENABLED', normalizedDeliveryState: 'UNKNOWN' });
        expect(state.mutations).toHaveLength(1);
        expect(state.mutations[0].partialFailure).toBe(false);
        expect(state.mutations[0].mutateOperations).toHaveLength(4);
        expect(state.mutations[0].mutateOperations[3].adGroupCriterionOperation.update).toEqual({ resourceName: ids.keyword, status: 'ENABLED' });
        expect(await provider.resumeCampaign(request(), pool)).toMatchObject({ success: true });
        expect(state.mutations).toHaveLength(1);
        expect(await provider.pauseCampaign({ ...request('pause'), action: 'PAUSE' }, pool)).toMatchObject({ success: true, newStatus: 'PAUSED', normalizedDeliveryState: 'PAUSED' });
        expect(state.mutations).toHaveLength(2);
    });
    it('enforces trusted authorization rather than request actor labels or submitted limits', async () => {
        const { provider, transport } = fixture('OK', async () => { throw new Error('deny'); });
        expect((await provider.resumeCampaign(request(), pool)).success).toBe(false);
        expect(transport).not.toHaveBeenCalled();
        const noGuard = fixture();
        const client = (noGuard.provider as any).client;
        expect((await new GoogleAdsProvider(client).resumeCampaign(request(), pool)).success).toBe(false);
        expect(noGuard.transport).not.toHaveBeenCalled();
    });
    it('deduplicates concurrent control requests', async () => { const { provider, state } = fixture(); const results = await Promise.all(Array.from({ length: 8 }, () => provider.resumeCampaign(request(), pool))); expect(results.some(r => r.success)).toBe(true); expect(state.mutations).toHaveLength(1); });
    it.each(['TIMEOUT', 'READBACK_MISMATCH'])('quarantines %s and blocks new-key control replay', async (mode) => { const { provider, state } = fixture(mode); expect((await provider.resumeCampaign(request(), pool)).error?.code).toBe('GOOGLE_UNKNOWN_OUTCOME'); expect((await provider.resumeCampaign(request('new-key'), pool)).success).toBe(false); expect(state.mutations).toHaveLength(1); expect((await pool.query("SELECT publish_status FROM provider_publishing_transactions WHERE operation_type='RESUME'")).rows[0].publish_status).toBe('RECONCILIATION_REQUIRED'); });
    it('rejects extra remote keywords beyond the approved creation revision', async () => { const { provider, state } = fixture('FOREIGN_KEYWORD'); expect((await provider.resumeCampaign(request(), pool)).success).toBe(false); expect(state.mutations).toHaveLength(0); });
    it('updates only the verified unshared budget with exact micros and durable evidence', async () => { const { provider, state } = fixture(); expect(await provider.updateBudget({ campaignId: 1, externalCampaignId: ids.campaign, newBudget: { currency: 'INR', minor_units: 1500 }, authorizedLimit: { currency: 'INR', minor_units: 999999 }, idempotencyKey: 'budget', correlationId: 'trace' }, pool)).toMatchObject({ success: true, newStatus: 'PAUSED' }); expect(state.mutations[0].mutateOperations).toEqual([{ campaignBudgetOperation: { update: { resourceName: ids.budget, amountMicros: '15000000' }, updateMask: 'amountMicros' } }]); expect((await pool.query("SELECT metadata FROM provider_entities WHERE entity_type='CAMPAIGN'")).rows[0].metadata.dailyBudgetMinor).toBe(1500); });
    it('rejects a shared budget before remote writes', async () => { const { provider, state } = fixture('SHARED_BUDGET'); expect((await provider.updateBudget({ campaignId: 1, externalCampaignId: ids.campaign, newBudget: { currency: 'INR', minor_units: 1500 }, authorizedLimit: { currency: 'INR', minor_units: 999999 }, idempotencyKey: 'budget', correlationId: 'trace' }, pool)).success).toBe(false); expect(state.mutations).toHaveLength(0); });
    it('retains uncertain claim after persistence failure', async () => { const { provider } = fixture(); const spy = vi.spyOn(ProviderOperationStore.prototype, 'complete').mockRejectedValueOnce(new Error('lost DB')); expect((await provider.resumeCampaign(request(), pool)).error?.code).toBe('GOOGLE_UNKNOWN_OUTCOME'); spy.mockRestore(); expect((await pool.query("SELECT publish_status FROM provider_publishing_transactions WHERE operation_type='RESUME'")).rows[0].publish_status).toBe('RECONCILIATION_REQUIRED'); });
});
