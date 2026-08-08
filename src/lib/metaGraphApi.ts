/**
 * Phase 9 — Graph API Compatibility Layer
 * Centralized endpoint definitions, payload builders, and version configurations.
 * Allows seamless upgrading of Graph API versions with minimal code changes.
 */

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v19.0';
export const META_BASE_URL = process.env.META_BASE_URL || `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const MetaEndpoints = {
    campaigns: (adAccountId: string) => `${META_BASE_URL}/${adAccountId}/campaigns`,
    adsets: (adAccountId: string) => `${META_BASE_URL}/${adAccountId}/adsets`,
    adcreatives: (adAccountId: string) => `${META_BASE_URL}/${adAccountId}/adcreatives`,
    ads: (adAccountId: string) => `${META_BASE_URL}/${adAccountId}/ads`,
    adimages: (adAccountId: string) => `${META_BASE_URL}/${adAccountId}/adimages`,
    capiEvents: (pixelId: string) => `${META_BASE_URL}/${pixelId}/events`,
    node: (nodeId: string) => `${META_BASE_URL}/${nodeId}`,
};

export const MetaPayloadBuilders = {
    buildCampaignPayload: (name: string, objective = 'OUTCOME_AWARENESS', specialAdCategories = ['HOUSING']) => ({
        name,
        objective,
        special_ad_categories: specialAdCategories,
        special_ad_category_country: ['US', 'IN'],
        is_adset_budget_sharing_enabled: false,
        buying_type: 'AUCTION',
        status: 'PAUSED'
    }),
    
    buildAdSetPayload: (name: string, campaignId: string, dailyBudget = 1000, billingEvent = 'IMPRESSIONS', optimizationGoal = 'REACH', pageId: string, targeting = { geo_locations: { countries: ['US', 'IN'] } }) => ({
        name,
        campaign_id: campaignId,
        daily_budget: dailyBudget,
        billing_event: billingEvent,
        optimization_goal: optimizationGoal,
        promoted_object: { page_id: pageId },
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting,
        status: 'PAUSED'
    }),

    buildCreativePayload: (name: string, pageId: string, igAccountId: string | undefined, imageHash: string, body: string, headline: string, link: string, leadFormId?: string) => ({
        name,
        object_story_spec: {
            page_id: pageId,
            instagram_actor_id: igAccountId || undefined,
            link_data: {
                image_hash: imageHash,
                link,
                message: body,
                name: headline,
                description: body,
                call_to_action: {
                    type: 'BOOK_TRAVEL',
                    value: leadFormId ? { lead_gen_form_id: leadFormId, link } : { link }
                }
            }
        },
        degrees_of_freedom_spec: {
            creative_features_spec: {
                standard_enhancements: { enrollment_status: 'OPT_OUT' }
            }
        }
    }),

    buildAdPayload: (name: string, adsetId: string, creativeId: string) => ({
        name,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: 'PAUSED'
    })
};

export const MetaResponseParsers = {
    parseError: (data: any) => {
        const e = data.error;
        if (!e) return 'UNKNOWN_ERROR';
        if (e.code === 190) return 'AUTH_ERROR_TOKEN_EXPIRED';
        if (e.code === 100 && e.error_subcode === 1885016) return 'AD_ACCOUNT_DISABLED';
        if (e.is_transient) return 'TRANSIENT_NETWORK_ERROR';
        return 'API_ERROR';
    },
    parseId: (data: any) => data?.id || null
};
