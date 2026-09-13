import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { MetaAdsClient } from '../../lib/providers/meta/MetaAdsClient.js';
import { MetaAdProvider } from '../../lib/providers/meta/MetaAdProvider.js';
import { ProviderOperationStore, type ProviderAuthorizationGuard } from '../../lib/providers/ProviderOperationStore.js';
import type { ProviderPublishRequest, ProviderControlRequest } from '../../lib/providers/types.js';
import { createLocalPostgresFixture } from './postgres.js';
const origin = 'https://encho.example.com';
const media = 'https://assets.example.com/property.jpg';
const ids = { campaign: '1001', adset: '1002', creative: '1003', ad: '1004', video: '1005' };
const credentials = { accessToken: 'test-access', appSecret: 'test-secret', accountId: '123456789', pageId: '2001', pixelId: '3001', instagramId: '4001' };
const authorized: ProviderAuthorizationGuard = async (context, client) => { expect((await client.query('SELECT txid_current()')).rows).toHaveLength(1); return { authorizationId: 'test-auth-' + context.operation }; };
function request(): ProviderPublishRequest { return { campaignId: 1, hostId: 10, listingId: 20, title: 'Lake House', objective: 'BOOKINGS', budget: { currency: 'INR', minor_units: 10000 }, startTime: '2026-10-01T00:00:00+05:30', endTime: '2026-10-10T23:59:59+05:30', targetAudience: { locations: ['India'] }, creativeAssets: { headline: 'Lake House Stay', primaryText: 'Explore the rooms and choose your stay dates.', mediaUrl: media, mediaType: 'IMAGE', landingPageUrl: origin + '/stay/lake-house' }, idempotencyKey: 'meta-publish-1', correlationId: 'meta-trace-1', metadata: { metaWebsite: { version: 1, countries: ['IN'], placements: ['FACEBOOK_FEED', 'INSTAGRAM_FEED'], specialAdCategories: [] } } }; }
function fixture(mode = 'OK', authorize: ProviderAuthorizationGuard | undefined = authorized) {
    const state = { posts: [] as {
            path: string;
            payload: any;
        }[], campaign: 'PAUSED', adset: 'PAUSED', ad: 'PAUSED', budget: '10000', promoted: {pixel_id:'3001',custom_event_type:'PURCHASE'} as Record<string,string>, creative: {} as any, videoReady: mode !== 'VIDEO_PROCESSING' };
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'x-fb-trace-id': 'safe-trace' } });
    const transport = vi.fn(async (input: any, init: any) => {
        const url = new URL(String(input));
        expect(url.hostname).toBe('graph.facebook.com');
        expect(url.pathname.startsWith('/v26.0/')).toBe(true);
        expect(init.headers.Authorization).toBe('Bearer test-access');
        const path = url.pathname.slice('/v26.0/'.length);
        if (init.method === 'POST') {
            const payload = Object.fromEntries(new URLSearchParams(init.body));
            for (const [key, value] of Object.entries(payload)) {
                if (typeof value === 'string' && ['{', '['].includes(value[0]))
                    payload[key] = JSON.parse(value);
            }
            state.posts.push({ path, payload });
            if (mode === 'LOST_CREATE' && path.endsWith('/campaigns'))
                throw new Error('private response lost');
            if (mode === 'REJECT_ADSET' && path.endsWith('/adsets'))
                return json({ error: { message: 'private host secret' } }, 400);
            if (path.endsWith('/campaigns'))
                return json({ id: mode === 'FAKE_ID' ? 'made-up-id' : ids.campaign });
            if (path.endsWith('/adsets')) {
                state.budget = String(payload.lifetime_budget);
                state.promoted = payload.promoted_object as unknown as Record<string,string>;
                return json({ id: ids.adset });
            }
            if (path.endsWith('/adcreatives')) {
                state.creative = payload;
                return json({ id: ids.creative });
            }
            if (path.endsWith('/ads'))
                return json({ id: ids.ad });
            if (path.endsWith('/advideos'))
                return json({ id: ids.video });
            if (path === ids.campaign)
                state.campaign = String(payload.status);
            if (path === ids.adset) {
                if (payload.status)
                    state.adset = String(payload.status);
                if (payload.lifetime_budget)
                    state.budget = String(payload.lifetime_budget);
            }
            if (path === ids.ad)
                state.ad = String(payload.status);
            if (mode === 'LOST_CONTROL')
                throw new Error('private timeout');
            return json({ success: true });
        }
        if (path === 'act_123456789')
            return json({ id: path, account_id: '123456789', account_status: 1, currency: mode === 'CURRENCY' ? 'USD' : 'INR', timezone_name: 'Asia/Kolkata' });
        if (path === '2001')
            return json({ id: path, instagram_business_account: { id: '4001' } });
        if (path === '3001')
            return json({ id: path });
        if(path===`${ids.campaign}/insights`)return json({data:[{account_currency:'INR',impressions:mode==='BAD_METRICS'?'':'1000',clicks:'20',spend:'123.45',...(mode==='NO_ACTIONS'?{}:{actions:[{action_type:'offsite_conversion.fb_pixel_purchase',value:'2'}]})}]});
        if (path === ids.video)
            return json({ id: path, status: { video_status: state.videoReady ? 'ready' : 'processing' } });
        if (mode === 'READ_FAILURE')
            return json({}, 503);
        const base = { id: path, account_id: mode === 'FOREIGN_ACCOUNT' ? '999999999' : '123456789' };
        if (path === ids.campaign)
            return json({ ...base, status: mode === 'ACTIVE_CREATED' ? 'ACTIVE' : state.campaign, effective_status: state.campaign });
        if (path === ids.adset)
            return json({ ...base, campaign_id: ids.campaign, status: state.adset, effective_status: state.adset, lifetime_budget: mode === 'WRONG_BUDGET' ? '1' : state.budget, promoted_object: state.promoted });
        if (path === ids.creative)
            return json({ ...base, object_story_spec: state.creative.object_story_spec });
        if (path === ids.ad)
            return json({ ...base, campaign_id: ids.campaign, adset_id: mode === 'FOREIGN_PARENT' ? '999' : ids.adset, creative: { id: ids.creative }, status: state.ad, effective_status: state.ad });
        throw new Error('Unexpected test request');
    });
    const client = new MetaAdsClient(credentials, { fetch: transport as typeof fetch });
    return { provider: new MetaAdProvider(client, { publicOrigin: origin, authorize }), state, transport };
}
describe('Meta website publishing and controls with isolated PostgreSQL', () => {
    let pool: Pool;
    let close: () => Promise<void>;
    beforeAll(async () => { ({ pool, close } = await createLocalPostgresFixture()); await pool.query("CREATE TABLE media_assets (id SERIAL PRIMARY KEY,entity_type TEXT,entity_id INT,url TEXT,moderation_status TEXT)"); });
    afterAll(async () => { await close?.(); });
    beforeEach(async () => { await pool.query('TRUNCATE provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings,media_assets RESTART IDENTITY CASCADE'); await pool.query("INSERT INTO listings VALUES(20,10,'Lake House','lake-house','published')"); await pool.query('INSERT INTO host_marketing_campaigns VALUES(1,10,20)'); await pool.query("INSERT INTO media_assets(entity_type,entity_id,url,moderation_status)VALUES('listing',20,$1,'approved')", [media]); });
    it('blocks remote budget drift before activation and records explicit reporting availability',async()=>{
        const {provider,state}=fixture();expect((await provider.createCampaignHierarchy(request(),pool)).success).toBe(true);
        state.budget='20000';const initialPosts=state.posts.length;
        expect((await provider.resumeCampaign({campaignId:1,externalCampaignId:ids.campaign,action:'RESUME',actorType:'admin',actorId:1,idempotencyKey:'drift-resume',correlationId:'trace'},pool)).success).toBe(false);
        expect(state.posts.length).toBe(initialPosts);
        const metrics=await provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-09-01',endDate:'2026-09-13'},pool);
        expect(metrics).toMatchObject({impressions:1000,clicks:20,spend:{minor_units:12345},providerMetadata:{conversionDataAvailable:true,dataAsOf:null}});
        expect((await fixture('NO_ACTIONS').provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-09-01',endDate:'2026-09-13'},pool)).providerMetadata).toMatchObject({conversionDataAvailable:false});
        await expect(fixture('BAD_METRICS').provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-09-01',endDate:'2026-09-13'},pool)).rejects.toMatchObject({code:'META_TELEMETRY_UNAVAILABLE'});
    });
    it.each([{pixel_id:'9999',custom_event_type:'PURCHASE'},{pixel_id:'3001',custom_event_type:'LEAD'},{pixel_id:'3001'}])('rejects observed conversion destination drift before spending but permits safety pause: %j',async promoted=>{
        const {provider,state}=fixture();expect((await provider.createCampaignHierarchy(request(),pool)).success).toBe(true);
        state.promoted=promoted;const before=state.posts.length;
        const control:ProviderControlRequest={campaignId:1,externalCampaignId:ids.campaign,action:'RESUME',actorType:'admin',actorId:1,idempotencyKey:'pixel-drift-resume',correlationId:'trace'};
        expect(await provider.resumeCampaign(control,pool)).toMatchObject({success:false,error:{code:'META_CONVERSION_DESTINATION_MISMATCH'}});
        expect(state.posts).toHaveLength(before);
        expect(await provider.pauseCampaign({...control,action:'PAUSE',idempotencyKey:'pixel-drift-pause'},pool)).toMatchObject({success:true,newStatus:'PAUSED'});
    });
    it('creates only provider-returned paused identities and actual website creative', async () => {
        const { provider, state } = fixture();
        const result = await provider.createCampaignHierarchy(request(), pool);
        expect(result).toMatchObject({ success: true, externalCampaignId: ids.campaign, externalContainerId: ids.adset, externalCreativeId: ids.creative, externalAdId: ids.ad, rawResponse: { creationState: 'PAUSED', deliveryConfirmed: false } });
        expect(state.posts).toHaveLength(4);
        expect(state.posts[0].payload).toMatchObject({ status: 'PAUSED', objective: 'OUTCOME_SALES' });
        expect(state.posts[1].payload).toMatchObject({ status: 'PAUSED', lifetime_budget: '10000', optimization_goal: 'OFFSITE_CONVERSIONS' });
        expect(state.posts[1].payload.daily_budget).toBeUndefined();
        expect(state.creative.object_story_spec).toMatchObject({ page_id: '2001', instagram_user_id: '4001', link_data: { picture: media, link: origin + '/stay/lake-house' } });
        expect((await pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows[0]).toEqual({ publish_status: 'COMMITTED', is_unknown_outcome: false });
        expect((await pool.query('SELECT external_id FROM provider_entities')).rows).toHaveLength(4);
    });
    it('claims once across concurrent submissions and replays only committed matching requests', async () => {
        const { provider, state } = fixture();
        const results = await Promise.all(Array.from({ length: 8 }, () => provider.createCampaignHierarchy(request(), pool)));
        expect(results.some(r => r.success)).toBe(true);
        expect(state.posts).toHaveLength(4);
        expect(await provider.createCampaignHierarchy(request(), pool)).toMatchObject({ success: true, isDuplicate: true });
        const changed = request();
        changed.creativeAssets.headline = 'Changed';
        expect((await provider.createCampaignHierarchy(changed, pool)).success).toBe(false);
        expect(state.posts).toHaveLength(4);
    });
    it.each(['LOST_CREATE', 'REJECT_ADSET', 'FAKE_ID', 'READ_FAILURE', 'ACTIVE_CREATED', 'FOREIGN_ACCOUNT', 'FOREIGN_PARENT', 'WRONG_BUDGET'])('quarantines %s and never retries creation with a fresh key', async (mode) => {
        const { provider, state } = fixture(mode);
        expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false);
        const count = state.posts.length;
        expect(count).toBeGreaterThan(0);
        const row = (await pool.query('SELECT publish_status,is_unknown_outcome,response FROM provider_publishing_transactions')).rows[0];
        expect(row.publish_status).toBe('RECONCILIATION_REQUIRED');
        expect(row.is_unknown_outcome).toBe(true);
        expect(row.response.creationState).toBe('PAUSED');
        const retry = request();
        retry.idempotencyKey = 'retry';
        expect((await provider.createCampaignHierarchy(retry, pool)).success).toBe(false);
        expect(state.posts).toHaveLength(count);
    });
    it('rejects absent trusted authorization without HTTP', async () => { const { provider, transport } = fixture('OK', undefined); const actual = new MetaAdProvider(new MetaAdsClient(credentials, { fetch: transport as typeof fetch }), { publicOrigin: origin }); expect((await actual.createCampaignHierarchy(request(), pool)).success).toBe(false); expect(transport).not.toHaveBeenCalled(); });
    it('rejects unapproved or foreign property media before HTTP', async () => { const { provider, transport } = fixture(); await pool.query("UPDATE media_assets SET moderation_status='pending_review'"); expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false); expect(transport).not.toHaveBeenCalled(); });
    it('rejects account currency mismatch before writes', async () => { const { provider, state } = fixture('CURRENCY'); expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(false); expect(state.posts).toHaveLength(0); });
    it('retains uploaded video identity when asynchronous processing is incomplete', async () => { const { provider, state } = fixture('VIDEO_PROCESSING'); const req = request(); req.creativeAssets.mediaType = 'VIDEO'; req.metadata!.metaWebsite.placements = ['INSTAGRAM_REELS']; req.metadata!.metaWebsite.thumbnailUrl = media; expect((await provider.createCampaignHierarchy(req, pool)).success).toBe(false); expect(state.posts).toHaveLength(1); const tx = (await pool.query('SELECT response FROM provider_publishing_transactions')).rows[0]; expect(tx.response.ids.video).toBe(ids.video); });
    it('continues confirmed video processing without uploading twice', async () => {
        const { provider, state } = fixture('VIDEO_PROCESSING'); const req = request();
        req.creativeAssets.mediaType = 'VIDEO'; req.metadata!.metaWebsite.placements = ['INSTAGRAM_REELS']; req.metadata!.metaWebsite.thumbnailUrl = media;
        expect((await provider.createCampaignHierarchy(req, pool)).error?.code).toBe('META_ASSET_PROCESSING');
        expect((await pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows[0]).toEqual({ publish_status:'ASSET_PREPARING',is_unknown_outcome:false });
        const wrongKey={...req,idempotencyKey:'new-video-request'};
        expect((await provider.createCampaignHierarchy(wrongKey,pool)).success).toBe(false);
        state.videoReady=true;
        expect(await provider.createCampaignHierarchy(req,pool)).toMatchObject({success:true,externalCampaignId:ids.campaign});
        expect(state.posts.filter(p=>p.path.endsWith('/advideos'))).toHaveLength(1);
        expect(state.posts).toHaveLength(5);
        expect(state.creative.object_story_spec.video_data.video_id).toBe(ids.video);
    });
    it('preserves remote evidence after persistence failure', async () => { const { provider } = fixture(); const spy = vi.spyOn(ProviderOperationStore.prototype, 'complete').mockRejectedValueOnce(new Error('private DB error')); expect((await provider.createCampaignHierarchy(request(), pool)).error?.code).toBe('META_UNKNOWN_OUTCOME'); spy.mockRestore(); expect((await pool.query('SELECT response FROM provider_publishing_transactions')).rows[0].response.ids.ad).toBe(ids.ad); });
    it('activates only with trusted authorization and reports configured status without a LIVE claim', async () => { const { provider, state } = fixture(); expect((await provider.createCampaignHierarchy(request(), pool)).success).toBe(true); const control: ProviderControlRequest = { campaignId: 1, externalCampaignId: ids.campaign, action: 'RESUME', actorType: 'admin', actorId: 1, idempotencyKey: 'activate-1', correlationId: 'trace' }; expect(await provider.resumeCampaign(control, pool)).toMatchObject({ success: true, newStatus: 'ACTIVE', normalizedDeliveryState: 'UNKNOWN' }); expect(state.posts.slice(-3).map(p => p.path)).toEqual([ids.ad, ids.adset, ids.campaign]); expect(await provider.resumeCampaign(control, pool)).toMatchObject({ success: true }); expect(state.posts).toHaveLength(7); expect(await provider.pauseCampaign({ ...control, action: 'PAUSE', idempotencyKey: 'pause-1' }, pool)).toMatchObject({ success: true, newStatus: 'PAUSED', normalizedDeliveryState: 'PAUSED' }); });
    it('blocks a forged actor label when the trusted guard rejects it', async () => { const good = fixture(); await good.provider.createCampaignHierarchy(request(), pool); const bad = fixture('OK', async () => { throw new Error('authorization denied'); }); const control: ProviderControlRequest = { campaignId: 1, externalCampaignId: ids.campaign, action: 'RESUME', actorType: 'admin', actorId: 1, idempotencyKey: 'forged', correlationId: 'trace' }; expect((await bad.provider.resumeCampaign(control, pool)).success).toBe(false); expect(bad.transport).not.toHaveBeenCalled(); });
});
