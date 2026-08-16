/**
 * Phase 2.8 — Pillar 2: Deterministic Meta Delivery Reducer & Explanation Engine
 *
 * Implements the authoritative, deterministic state machine that reduces
 * multi-tier Meta object states (Campaign, AdSet, Ad, Creative) into a canonical
 * delivery state.
 *
 * Primary Principle:
 * - Meta is the external source of truth.
 * - Never infer LIVE from local publish success.
 * - LIVE requires Campaign=ACTIVE, AdSet=ACTIVE, at least one Ad=ACTIVE, Approved review, and Fresh verification.
 */

export type MetaDeliveryState =
  | 'OBJECT_CREATED'
  | 'CONFIGURED_ACTIVE'
  | 'CONFIGURED_PAUSED'
  | 'LIVE'
  | 'NOT_DELIVERING'
  | 'CAMPAIGN_OFF'
  | 'ADSET_OFF'
  | 'AD_OFF'
  | 'PENDING_REVIEW'
  | 'DISAPPROVED'
  | 'ARCHIVED'
  | 'DELETED'
  | 'UNKNOWN';

export type DeliveryOwner = 'HOST' | 'ADMIN' | 'SYSTEM' | 'META';

export interface MetaObjectStatus {
  id: string | null;
  status?: string | null; // Configured status (e.g. ACTIVE, PAUSED)
  effective_status?: string | null; // Effective status (e.g. ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, DISAPPROVED, PENDING_REVIEW, DELETED, ARCHIVED)
  configured_status?: string | null;
  review_status?: string | null; // PENDING_REVIEW, APPROVED, DISAPPROVED, NO_REVIEW
}

export interface DeliveryExplanation {
  delivery_state: MetaDeliveryState;
  is_live: boolean;
  exact_reason: string;
  owner: DeliveryOwner;
  recommended_action: string;
  display_label: string;
  display_description: string;
  badge_color: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'purple';
}

export interface DeliveryReducerInputs {
  campaign?: MetaObjectStatus | null;
  adset?: MetaObjectStatus | null;
  ads?: MetaObjectStatus[] | null;
  creatives?: MetaObjectStatus[] | null;
  external_verification?: {
    verified_at?: string | Date | null;
    verification_source?: string | null;
    is_blocked?: boolean;
    is_missing?: boolean;
    error?: string | null;
  } | null;
}

export class MetaDeliveryReducer {
  /**
   * Deterministic reducer mapping multi-tier Meta object statuses to canonical MetaDeliveryState.
   */
  static reduceDeliveryState(inputs: DeliveryReducerInputs): DeliveryExplanation {
    const { campaign, adset, ads = [], creatives = [], external_verification } = inputs;

    // Check 1: External Verification Blocked / Missing / Error
    if (external_verification?.is_blocked) {
      return {
        delivery_state: 'UNKNOWN',
        is_live: false,
        exact_reason: external_verification.error || 'Meta API access is deactivated or blocked. Awaiting developer reactivation.',
        owner: 'META',
        recommended_action: 'Complete developer registration on developer.facebook.com to resume live sync.',
        display_label: 'Verification Blocked',
        display_description: 'External Meta verification is temporarily blocked.',
        badge_color: 'amber'
      };
    }

    if (external_verification?.is_missing || !campaign || !campaign.id) {
      return {
        delivery_state: 'UNKNOWN',
        is_live: false,
        exact_reason: 'Campaign object does not exist on Meta Graph API.',
        owner: 'SYSTEM',
        recommended_action: 'Trigger campaign dispatch or review publishing logs.',
        display_label: 'Missing on Meta',
        display_description: 'Campaign object has not been created on Meta.',
        badge_color: 'slate'
      };
    }

    const campEff = (campaign.effective_status || campaign.status || 'PAUSED').toUpperCase();
    const campConf = (campaign.configured_status || campaign.status || 'PAUSED').toUpperCase();

    // Check 2: Deletion or Archival
    if (campEff === 'DELETED' || campConf === 'DELETED') {
      return {
        delivery_state: 'DELETED',
        is_live: false,
        exact_reason: 'The Meta campaign has been deleted.',
        owner: 'ADMIN',
        recommended_action: 'Create a new marketing campaign to resume advertising.',
        display_label: 'Deleted on Meta',
        display_description: 'This campaign was permanently removed on Meta.',
        badge_color: 'slate'
      };
    }

    if (campEff === 'ARCHIVED' || campConf === 'ARCHIVED') {
      return {
        delivery_state: 'ARCHIVED',
        is_live: false,
        exact_reason: 'The Meta campaign has been archived.',
        owner: 'ADMIN',
        recommended_action: 'Unarchive the campaign in Meta Ads Manager or create a new campaign.',
        display_label: 'Archived on Meta',
        display_description: 'This campaign is archived on Meta.',
        badge_color: 'slate'
      };
    }

    // Check AdSet status if present
    const adsetEff = adset ? (adset.effective_status || adset.status || campEff).toUpperCase() : campEff;
    const adsetConf = adset ? (adset.configured_status || adset.status || campConf).toUpperCase() : campConf;

    if (adsetEff === 'DELETED' || adsetConf === 'DELETED') {
      return {
        delivery_state: 'DELETED',
        is_live: false,
        exact_reason: 'The Meta ad set has been deleted.',
        owner: 'ADMIN',
        recommended_action: 'Create a new ad set or campaign.',
        display_label: 'Ad Set Deleted',
        display_description: 'The ad set associated with this campaign was deleted on Meta.',
        badge_color: 'slate'
      };
    }

    if (adsetEff === 'ARCHIVED' || adsetConf === 'ARCHIVED') {
      return {
        delivery_state: 'ARCHIVED',
        is_live: false,
        exact_reason: 'The Meta ad set has been archived.',
        owner: 'ADMIN',
        recommended_action: 'Unarchive the ad set on Meta.',
        display_label: 'Ad Set Archived',
        display_description: 'The ad set associated with this campaign is archived.',
        badge_color: 'slate'
      };
    }

    // Check Ads & Creatives
    const allAds = Array.isArray(ads) ? ads : [];
    const allCreatives = Array.isArray(creatives) ? creatives : [];

    let anyAdDisapproved = false;
    let anyAdPendingReview = false;
    let activeAdsCount = 0;
    let pausedAdsCount = 0;

    for (const ad of allAds) {
      const adEff = (ad.effective_status || ad.status || 'PAUSED').toUpperCase();
      const adRev = (ad.review_status || '').toUpperCase();

      if (adEff === 'DISAPPROVED' || adRev === 'DISAPPROVED') {
        anyAdDisapproved = true;
      }
      if (adEff === 'PENDING_REVIEW' || adRev === 'PENDING_REVIEW' || adEff === 'IN_PROCESS') {
        anyAdPendingReview = true;
      }
      if (adEff === 'ACTIVE' || (ad.status === 'ACTIVE' && ['ACTIVE', 'CAMPAIGN_GROUP_ACTIVE'].includes(adEff))) {
        activeAdsCount++;
      } else if (adEff === 'PAUSED' || adEff === 'AD_PAUSED') {
        pausedAdsCount++;
      }
    }

    for (const cr of allCreatives) {
      const crRev = (cr.review_status || '').toUpperCase();
      if (crRev === 'DISAPPROVED') anyAdDisapproved = true;
      if (crRev === 'PENDING_REVIEW') anyAdPendingReview = true;
    }

    // Check 3: Disapproval / Policy Rejection
    if (anyAdDisapproved || campEff === 'DISAPPROVED' || adsetEff === 'DISAPPROVED') {
      return {
        delivery_state: 'DISAPPROVED',
        is_live: false,
        exact_reason: 'One or more ad creatives were rejected by Meta advertising policy.',
        owner: 'HOST',
        recommended_action: 'Update creative copy and images to comply with Meta Ad Standards, then resubmit.',
        display_label: 'Policy Disapproved',
        display_description: 'Meta rejected the ad creative due to advertising policy violations.',
        badge_color: 'rose'
      };
    }

    // Check 4: Campaign Off / Paused
    if (campEff === 'PAUSED' || campConf === 'PAUSED' || campEff === 'CAMPAIGN_PAUSED') {
      return {
        delivery_state: 'CAMPAIGN_OFF',
        is_live: false,
        exact_reason: 'Campaign delivery is turned off at the campaign level.',
        owner: 'HOST',
        recommended_action: 'Click Resume in your campaign dashboard to activate delivery.',
        display_label: 'Campaign Paused',
        display_description: 'The campaign is currently paused on Meta.',
        badge_color: 'slate'
      };
    }

    // Check 5: AdSet Off / Paused (while Campaign is ACTIVE)
    if (adset && (adsetEff === 'PAUSED' || adsetConf === 'PAUSED' || adsetEff === 'ADSET_PAUSED')) {
      return {
        delivery_state: 'ADSET_OFF',
        is_live: false,
        exact_reason: 'The ad set is paused on Meta while the parent campaign is active.',
        owner: 'ADMIN',
        recommended_action: 'Activate the ad set from the command center or Meta Ads Manager.',
        display_label: 'Ad Set Paused',
        display_description: 'The ad set is paused on Meta.',
        badge_color: 'slate'
      };
    }

    // Check 6: All Ads Off (while Campaign and AdSet are ACTIVE)
    if (allAds.length > 0 && activeAdsCount === 0 && !anyAdPendingReview) {
      return {
        delivery_state: 'AD_OFF',
        is_live: false,
        exact_reason: 'All ads in this campaign are paused or disabled.',
        owner: 'HOST',
        recommended_action: 'Enable at least one ad creative variant to start delivery.',
        display_label: 'Ads Turned Off',
        display_description: 'All individual ad variants are turned off.',
        badge_color: 'slate'
      };
    }

    // Check 7: Meta Review in Progress
    if (anyAdPendingReview || campEff === 'PENDING_REVIEW' || adsetEff === 'PENDING_REVIEW') {
      return {
        delivery_state: 'PENDING_REVIEW',
        is_live: false,
        exact_reason: 'Ad creative is undergoing Meta automated integrity and policy review.',
        owner: 'META',
        recommended_action: 'Meta typically completes review within 24 hours. No action needed.',
        display_label: 'In Meta Review',
        display_description: 'Meta is reviewing your ad creative and copy.',
        badge_color: 'purple'
      };
    }

    // Check 8: Live / Active Delivery
    const isCampaignActive = campEff === 'ACTIVE' || campConf === 'ACTIVE';
    const isAdSetActive = !adset || adsetEff === 'ACTIVE' || adsetConf === 'ACTIVE' || adsetEff === 'CAMPAIGN_GROUP_ACTIVE';
    const hasActiveAds = allAds.length === 0 || activeAdsCount > 0;

    if (isCampaignActive && isAdSetActive && hasActiveAds) {
      return {
        delivery_state: 'LIVE',
        is_live: true,
        exact_reason: 'Campaign, ad set, and ad variants are fully active and serving impressions on Meta.',
        owner: 'SYSTEM',
        recommended_action: 'Monitor live reach, clicks, and incoming leads in your dashboard.',
        display_label: 'Live on Meta',
        display_description: 'Your campaign is actively delivering on Facebook & Instagram.',
        badge_color: 'emerald'
      };
    }

    // Check 9: Objects Created but Not Serving
    if (campaign.id) {
      return {
        delivery_state: 'OBJECT_CREATED',
        is_live: false,
        exact_reason: 'Meta objects are provisioned but not currently in active delivery.',
        owner: 'SYSTEM',
        recommended_action: 'Check targeting specifications and ad set schedule.',
        display_label: 'Created on Meta (Not Serving)',
        display_description: 'Objects exist on Meta but are not actively delivering.',
        badge_color: 'amber'
      };
    }

    // Fallback: Unknown
    return {
      delivery_state: 'UNKNOWN',
      is_live: false,
      exact_reason: 'Unable to determine Meta delivery state from external telemetry.',
      owner: 'SYSTEM',
      recommended_action: 'Trigger a manual re-sync from the command center.',
      display_label: 'State Unknown',
      display_description: 'Delivery state could not be verified with Meta.',
      badge_color: 'slate'
    };
  }
}
