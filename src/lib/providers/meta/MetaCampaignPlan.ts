import { hasAsciiControl } from '../../intentionalText.js';
import { isIP } from 'node:net';
import type { ProviderPublishRequest } from '../types.js';
import { semanticFingerprint } from '../ProviderOperationStore.js';
import { MetaAdsError } from './MetaAdsClient.js';
export interface MetaWebsiteConfig {
    version: 1;
    countries: string[];
    placements: Array<'FACEBOOK_FEED' | 'FACEBOOK_REELS' | 'INSTAGRAM_FEED' | 'INSTAGRAM_REELS'>;
    specialAdCategories: Array<'HOUSING'>;
    thumbnailUrl?: string;
}
const fail = (message: string): never => { throw new MetaAdsError('META_INVALID_ARGUMENT', message); };
export function mediaUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048)
        return fail('An approved public HTTPS media URL is required.');
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        return fail('Invalid public HTTPS URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || isIP(url.hostname.replace(/[[\]]/g, '')) ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(url.hostname))
        return fail('A public HTTPS domain is required.');
    return url.href;
}
export function buildMetaCampaignPlan(request: ProviderPublishRequest, origin: string, identity: {
    accountId: string;
    pageId: string;
    pixelId: string;
    instagramId?: string;
}) {
    if (!request || ![request.campaignId, request.hostId, request.listingId, request.budget?.minor_units].every(n => Number.isSafeInteger(n) && n > 0) || !['INR', 'USD'].includes(request.budget.currency))
        return fail('A valid campaign identity and positive INR/USD budget are required.');
    if (request.objective !== 'BOOKINGS')
        return fail('The website campaign requires the BOOKINGS objective.');
    const text = (value: unknown, max: number): string => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !hasAsciiControl(value) ? value : fail('Intentional campaign copy is required.');
    const title = text(request.title, 100);
    const headline = text(request.creativeAssets?.headline, 100);
    const message = text(request.creativeAssets?.primaryText ?? request.creativeAssets?.description, 5000);
    const landing = mediaUrl(request.creativeAssets.landingPageUrl);
    const destination = new URL(landing);
    const trusted = new URL(mediaUrl(origin));
    if (trusted.pathname !== '/' || trusted.search || destination.origin !== trusted.origin || destination.search || !/^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination.pathname))
        return fail('Campaign must link to a canonical property page on the configured origin.');
    const asset = mediaUrl(request.creativeAssets.mediaUrl);
    if (!['IMAGE', 'VIDEO'].includes(request.creativeAssets.mediaType ?? ''))
        return fail('Choose an actual image or video asset.');
    const config = request.metadata?.metaWebsite as MetaWebsiteConfig;
    if (!config || config.version !== 1 || !Array.isArray(config.countries) || !config.countries.length || config.countries.length > 20 || config.countries.some(c => !/^[A-Z]{2}$/.test(c)) ||
        !Array.isArray(config.specialAdCategories) || (config.specialAdCategories.length > 0 && JSON.stringify(config.specialAdCategories) !== '["HOUSING"]'))
        return fail('Explicit country targeting and policy category selection are required.');
    if (Object.keys(config).some(key => !['version','countries','placements','specialAdCategories','thumbnailUrl'].includes(key)) || new Set(config.countries).size !== config.countries.length)
        return fail('Campaign configuration contains unsupported or duplicate targeting settings.');
    if (!Array.isArray(config.placements) || !config.placements.length || new Set(config.placements).size !== config.placements.length ||
        config.placements.some(p => !['FACEBOOK_FEED', 'FACEBOOK_REELS', 'INSTAGRAM_FEED', 'INSTAGRAM_REELS'].includes(p)))
        return fail('Explicit supported placements are required.');
    if (config.placements.some(p => p.startsWith('INSTAGRAM')) && !identity.instagramId)
        return fail('An authorized Encho Instagram identity is required for Instagram placements.');
    if (config.placements.some(p => p.endsWith('REELS')) && request.creativeAssets.mediaType !== 'VIDEO')
        return fail('Reels require an approved video.');
    if (request.targetAudience?.ageMin !== undefined || request.targetAudience?.ageMax !== undefined || request.targetAudience?.genders?.length || request.targetAudience?.interests?.length)
        return fail('Demographic/interest overrides are unsupported in this website campaign version.');
    const start = Date.parse(request.startTime ?? '');
    const end = Date.parse(request.endTime ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !/(?:Z|[+-]\d{2}:\d{2})$/.test(request.startTime!) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(request.endTime!))
        return fail('A bounded campaign schedule with explicit time zones is required.');
    const thumbnail = request.creativeAssets.mediaType === 'VIDEO' ? mediaUrl(config.thumbnailUrl) : undefined;
    const fb = config.placements.filter(p => p.startsWith('FACEBOOK')).map(p => p.endsWith('REELS') ? 'facebook_reels' : 'feed');
    const ig = config.placements.filter(p => p.startsWith('INSTAGRAM')).map(p => p.endsWith('REELS') ? 'reels' : 'stream');
    const targeting = { geo_locations: { countries: config.countries }, publisher_platforms: [...(fb.length ? ['facebook'] : []), ...(ig.length ? ['instagram'] : [])], ...(fb.length ? { facebook_positions: fb } : {}), ...(ig.length ? { instagram_positions: ig } : {}) };
    const campaign = { name: `Encho ${request.campaignId} — ${title}`, objective: 'OUTCOME_SALES', status: 'PAUSED', buying_type: 'AUCTION', special_ad_categories: config.specialAdCategories, ...(config.specialAdCategories.length ? { special_ad_category_country: config.countries } : {}), is_adset_budget_sharing_enabled: false };
    const adset = { name: `Encho ${request.campaignId} — Website bookings`, status: 'PAUSED', lifetime_budget: request.budget.minor_units.toString(),
        start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), billing_event: 'IMPRESSIONS', optimization_goal: 'OFFSITE_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE',
        promoted_object: { pixel_id: identity.pixelId, custom_event_type: 'PURCHASE' }, targeting };
    const { idempotencyKey, correlationId, ...semanticRequest } = request;
    const fingerprint = semanticFingerprint({ request: semanticRequest, identity, campaign, adset, origin: trusted.origin });
    return { campaign, adset, fingerprint, asset, thumbnail, landing, headline, message, mediaType: request.creativeAssets.mediaType!,
        creative: (videoId?: string) => ({ name: `Encho ${request.campaignId} — ${headline}`, object_story_spec: { page_id: identity.pageId, ...(ig.length ? { instagram_user_id: identity.instagramId } : {}),
                ...(videoId ? { video_data: { video_id: videoId, image_url: thumbnail, title: headline, message, call_to_action: { type: 'BOOK_TRAVEL', value: { link: landing } } } } : { link_data: { link: landing, name: headline, message, picture: asset, call_to_action: { type: 'BOOK_TRAVEL', value: { link: landing } } } }) } }) };
}
