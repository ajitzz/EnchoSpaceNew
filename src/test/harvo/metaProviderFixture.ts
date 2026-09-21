import type {ProviderStoryVerifier} from '../../lib/providers/spatialCreative.js';
import {expect,vi} from 'vitest';
import {MetaAdsClient} from '../../lib/providers/meta/MetaAdsClient.js';
import {MetaAdProvider} from '../../lib/providers/meta/MetaAdProvider.js';
import type {ProviderAuthorizationGuard} from '../../lib/providers/ProviderOperationStore.js';
import type {ProviderPublishRequest} from '../../lib/providers/types.js';
export const origin = 'https://encho.example.com';
export const media = 'https://assets.example.com/property.jpg';
export const ids = { campaign: '1001', adset: '1002', creative: '1003', ad: '1004', video: '1005' };
export const credentials = { accessToken: 'test-access', appSecret: 'test-secret', accountId: '123456789', pageId: '2001', pixelId: '3001', instagramId: '4001' };
export const authorized: ProviderAuthorizationGuard = async (context, client) => { expect((await client.query('SELECT txid_current()')).rows).toHaveLength(1); return { authorizationId: 'test-auth-' + context.operation }; };
export function request(): ProviderPublishRequest { return { campaignId: 1, hostId: 10, listingId: 20, title: 'Lake House', objective: 'BOOKINGS', budget: { currency: 'INR', minor_units: 10000 }, startTime: '2026-10-01T00:00:00+05:30', endTime: '2026-10-10T23:59:59+05:30', targetAudience: { locations: ['India'] }, creativeAssets: { headline: 'Lake House Stay', primaryText: 'Explore the rooms and choose your stay dates.', mediaUrl: media, mediaType: 'IMAGE', landingPageUrl: origin + '/stay/lake-house' }, idempotencyKey: 'meta-publish-1', correlationId: 'meta-trace-1', metadata: { metaWebsite: { version: 1, countries: ['IN'], placements: ['FACEBOOK_FEED', 'INSTAGRAM_FEED'], specialAdCategories: [] } } }; }
export function fixture(mode = 'OK', authorize: ProviderAuthorizationGuard | undefined = authorized,verifySpatialStory?:ProviderStoryVerifier) {
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
            if (mode === 'LOST_ADSET' && path.endsWith('/adsets')) throw new Error('fixture lost adset response');
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
            return json({ ...base, status: mode === 'ACTIVE_CREATED' ? 'ACTIVE' : state.campaign, effective_status: state.campaign, ...(mode==='ADTECH'?{...state.posts.find(p=>p.path.endsWith('/campaigns'))?.payload,status:state.campaign}:{}) });
        if (path === ids.adset)
            return json({ ...base, campaign_id: ids.campaign, status: state.adset, effective_status: state.adset, lifetime_budget: mode === 'WRONG_BUDGET' ? '1' : state.budget, promoted_object: state.promoted, ...(mode==='ADTECH'?{...state.posts.find(p=>p.path.endsWith('/adsets'))?.payload,status:state.adset}:{}) });
        if (path === ids.creative){const spec=structuredClone(state.creative.object_story_spec);if(mode==='STORY_DRIFT'&&spec?.link_data?.child_attachments)spec.link_data.child_attachments[0].name='Unapproved claim';return json({ ...base, object_story_spec:spec });}
        if (path === ids.ad)
            return json({ ...base, campaign_id: ids.campaign, adset_id: mode === 'FOREIGN_PARENT' ? '999' : ids.adset, creative: { id: ids.creative }, status: state.ad, effective_status: state.ad });
        throw new Error('Unexpected test request');
    });
    const client = new MetaAdsClient(credentials, { fetch: transport as typeof fetch });
    return { provider: new MetaAdProvider(client, { publicOrigin: origin, authorize,verifySpatialStory }), state, transport };
}
