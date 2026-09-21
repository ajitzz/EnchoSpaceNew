import type {ProviderStoryVerifier} from '../../lib/providers/spatialCreative.js';
import type {ProviderAuthorizationGuard} from '../../lib/providers/ProviderOperationStore.js';
import {vi} from 'vitest';
import {GoogleAdsClient} from '../../lib/providers/google/GoogleAdsClient.js';
import {GoogleAdsProvider} from '../../lib/providers/google/GoogleAdsProvider.js';
import type {ProviderPublishRequest} from '../../lib/providers/types.js';
export const customer = '9998887777';
export const root = `customers/${customer}`;
export const ids = { budget: `${root}/campaignBudgets/444`, campaign: `${root}/campaigns/555`, group: `${root}/adGroups/777`, ad: `${root}/adGroupAds/777~888` };
export const origin = 'https://encho.example.com';
export function request(): ProviderPublishRequest {
  return { campaignId: 1, hostId: 10, listingId: 20, title: 'Lake House campaign', objective: 'BOOKINGS',
    budget: { currency: 'INR', minor_units: 10000 }, startTime: '2026-10-01', endTime: '2026-10-10',
    targetAudience: { locations: ['India'] },
    creativeAssets: { headline: 'Lake House Stay', description: 'Review the property and choose your stay dates.', mediaUrl: '', landingPageUrl: `${origin}/stay/lake-house` },
    idempotencyKey: 'publish-1', correlationId: 'trace-1', metadata: { listingRevision: 'reviewed-fixture-revision', googleSearch: {
      version: 1, headlines: ['Lake House Stay', 'Book Your Stay', 'Explore This Property'],
      descriptions: ['Review the property and choose your stay dates.', 'See available rooms and booking details.'],
      keywords: [{ text: 'lake house stay', matchType: 'EXACT' }], geoTargetConstants: ['geoTargetConstants/2356'], languageConstants: ['languageConstants/1000'],
      geoMode: 'PRESENCE_OR_INTEREST', dailyBudgetMinor: 1000, bidding: 'MAXIMIZE_CONVERSIONS', containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    } } };
}
export function providerFixture(mode = 'OK', authorize?:ProviderAuthorizationGuard, verifySpatialStory?:ProviderStoryVerifier) {
  const state = { mutations: 0, calls: [] as { url: string; body: any }[], operations: [] as any[] };
  const json = (value: any, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'request-id': 'fixture-request-id' } });
  const transport = vi.fn(async (input: any, init: any) => {
    const url = String(input);
    const body = url.includes('oauth2') ? {} : JSON.parse(init.body);
    state.calls.push({ url, body });
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'fixture-access-token', expires_in: 3600 });
    if (!url.startsWith(`https://googleads.googleapis.com/v25/customers/${customer}/`)) throw new Error('Unexpected provider destination');
    if (url.endsWith('googleAds:mutate')) {
      state.mutations++;
      state.operations = body.mutateOperations;
      if (mode === 'TIMEOUT') throw new TypeError('fixture lost connection after request transmission');
      if (mode === 'REJECTED') return json({ error: { message: 'fixture rejection' } }, 400);
      const collections: Record<string, [string, string]> = {
        assetOperation:['assetResult',`${root}/assets/`],campaignAssetOperation:['campaignAssetResult',`${root}/campaignAssets/`],campaignBudgetOperation: ['campaignBudgetResult', ids.budget], campaignOperation: ['campaignResult', ids.campaign],
        adGroupOperation: ['adGroupResult', ids.group], adGroupAdOperation: ['adGroupAdResult', ids.ad],
        campaignCriterionOperation: ['campaignCriterionResult', `${root}/campaignCriteria/555~`], adGroupCriterionOperation: ['adGroupCriterionResult', `${root}/adGroupCriteria/777~`],
      };
      return json({ mutateOperationResponses: state.operations.map((op, i) => {
        const [key, initialResource] = collections[Object.keys(op)[0]];
        let resource=initialResource;
        if(op.assetOperation)resource+=String(i+1000);
        if(op.campaignAssetOperation)resource+=`555~${i+999}~${op.campaignAssetOperation.create.fieldType==='SITELINK'?13:26}`;
        return { [key]: { resourceName: mode === 'FOREIGN_ID' ? resource.replace(customer, '1234567890') : resource.endsWith('~') ? `${resource}${i + 100}` : resource } };
      }) });
    }
    if (!url.endsWith('googleAds:searchStream')) throw new Error('Unexpected provider operation');
    const query: string = body.query;
    if (query.includes('FROM customer')) return json([{ results: [{ customer: { id: customer, resourceName: `customers/${customer}`, manager: mode === 'MANAGER_ACCOUNT', currencyCode: mode === 'CURRENCY_MISMATCH' ? 'USD' : 'INR', timeZone: 'Asia/Kolkata' } }] }]);
    if (mode === 'READ_FAILURE') return json({ error: { message: 'fixture reporting unavailable' } }, 503);
    if(mode==='ADTECH'&&query.includes('FROM campaign_criterion'))return json([{results:state.operations.filter(op=>op.campaignCriterionOperation?.create.proximity||op.campaignCriterionOperation?.create.location||op.campaignCriterionOperation?.create.keyword).map(op=>({campaignCriterion:op.campaignCriterionOperation.create}))}]);
    if(mode==='ADTECH'&&query.includes('campaign.maximize_conversions'))return json([{results:[{campaign:{...state.operations.find(op=>op.campaignOperation)?.campaignOperation.create,resourceName:ids.campaign}}]}]);
    if(query.includes('FROM campaign_asset'))return json([{results:state.operations.flatMap((op,i)=>{if(!op.assetOperation)return [];const link=state.operations[i+1].campaignAssetOperation.create,a=op.assetOperation.create;return [{campaignAsset:{resourceName:`${root}/campaignAssets/555~${i+1000}~${link.fieldType==='SITELINK'?13:26}`,campaign:ids.campaign,asset:`${root}/assets/${i+1000}`,fieldType:link.fieldType,status:'ENABLED'},asset:{resourceName:`${root}/assets/${i+1000}`,type:a.sitelinkAsset?'SITELINK':'IMAGE',finalUrls:a.finalUrls,sitelinkAsset:a.sitelinkAsset?{linkText:mode==='STORY_DRIFT'?'Unapproved claim':a.sitelinkAsset.linkText}:undefined,imageAsset:a.imageAsset?{fullSize:{widthPixels:i===state.operations.length-4?'1080':'1200',heightPixels:i===state.operations.length-4?'1080':'628'}}:undefined}}];})}]);
    if (query.includes('FROM campaign_budget')) return json([{ results: [{ campaignBudget: { resourceName: ids.budget,
      ...(state.operations[0]?.campaignBudgetOperation?.create.period==='CUSTOM_PERIOD'?{period:mode==='TOTAL_WRONG_PERIOD'?'DAILY':'CUSTOM_PERIOD',totalAmountMicros:mode==='TOTAL_WRONG_AMOUNT'?'9999':'100000000'}:{amountMicros: mode === 'WRONG_BUDGET' ? '9999' : '10000000'}), explicitlyShared: false } }] }]);
    if (query.includes('FROM ad_group_ad')) return json([{ results: [{ campaign: { resourceName: ids.campaign, status: ['UNSAFE_STATUS','ELIGIBLE','DELIVERY_ELIGIBLE','POLICY_REVIEW'].includes(mode) ? 'ENABLED' : 'PAUSED', primaryStatus:'ELIGIBLE', campaignBudget: ids.budget,startDateTime:'2026-10-01 00:00:00',endDateTime:mode==='TOTAL_WRONG_DATES'?'2026-10-30 23:59:59':'2026-10-10 23:59:59' }, adGroup: { resourceName: ids.group, campaign: ids.campaign, status: ['GROUP_DRIFT','DELIVERY_ELIGIBLE','POLICY_REVIEW'].includes(mode) ? 'ENABLED' : 'PAUSED', primaryStatus:'ELIGIBLE' }, adGroupAd: { resourceName: ids.ad, status: mode === 'AD_DRIFT' ? 'REMOVED' : ['DELIVERY_ELIGIBLE','POLICY_REVIEW'].includes(mode)?'ENABLED':'PAUSED', primaryStatus:'ELIGIBLE', policySummary:{approvalStatus:'APPROVED',reviewStatus:mode==='POLICY_REVIEW'?'REVIEW_IN_PROGRESS':'REVIEWED'}, ad: { finalUrls: [`${origin}/stay/lake-house`] } } }] }]);
    if (query.includes('metrics.impressions')) return json([{ results: mode === 'EMPTY_METRICS' ? [] : [{ campaign: { resourceName: ids.campaign }, metrics: { impressions: '200', clicks: '20', costMicros: '1234567', conversions: mode === 'INVALID_METRICS' ? 'not-a-number' : 2.5 } }] }]);
    if (query.includes('FROM campaign')) return json([{ results: [{ campaign: { resourceName: ids.campaign, status: ['ELIGIBLE','DELIVERY_ELIGIBLE','POLICY_REVIEW'].includes(mode) ? 'ENABLED' : 'PAUSED', primaryStatus: ['ELIGIBLE','DELIVERY_ELIGIBLE','POLICY_REVIEW'].includes(mode) ? 'ELIGIBLE' : 'PAUSED' } }] }]);
    throw new Error('Unexpected GAQL query');
  });
  const client = new GoogleAdsClient({ clientId: 'fixture-client', clientSecret: 'fixture-secret', refreshToken: 'fixture-refresh', mccCustomerId: '1112223333', customerId: customer }, { fetch: transport as typeof fetch });
  return { provider: new GoogleAdsProvider(client, { publicOrigin: origin, authorize,verifySpatialStory }), state, transport };
}
