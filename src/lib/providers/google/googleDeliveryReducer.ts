/**
 * Google Ads Delivery Truth Reducer
 * ENCHO Advertising Operating System
 *
 * Normalizes Google Ads API status, primary_status, primary_status_reasons,
 * and asset policy summaries into canonical NormalizedDeliveryTruth.
 */

import { NormalizedDeliveryState, NormalizedDeliveryTruth } from '../types.js';

export interface GoogleRawStateInput {
  status?: string; // ENABLED, PAUSED, REMOVED
  primary_status?: string; // ELIGIBLE, PAUSED, PENDING, NOT_ELIGIBLE, MISCONFIGURED, ENDED, UNKNOWN
  primary_status_reasons?: string[]; // e.g. ['POLICY_SUMMARY_REVIEW', 'CAMPAIGN_PAUSED', 'BUDGET_TOO_LOW']
  ad_group_status?: string;
  ad_status?: string;
  asset_policy_summaries?: Array<{
    asset_id: string;
    approval_status: 'APPROVED' | 'DISAPPROVED' | 'REVIEW_IN_PROGRESS' | 'APPROVED_LIMITED';
    policy_topic_entries?: Array<{ topic: string; type: string }>;
  }>;
  is_network_timeout?: boolean;
  http_status?: number;
}

export interface GoogleDeliveryReductionOutput {
  normalizedState: NormalizedDeliveryState;
  isLive: boolean;
  isServingImpressions: boolean;
  reasonCode: string;
  humanExplanation: string;
  responsibleSubsystem: 'GOOGLE_POLICY' | 'GOOGLE_BILLING' | 'GOOGLE_SERVING' | 'ENCHO_CONTROL' | 'NETWORK';
  recommendedAction: string;
  disapprovalReasons?: string[];
  reconciliationRequired: boolean;
}

export class GoogleDeliveryReducer {
  public static reduce(input: GoogleRawStateInput): GoogleDeliveryReductionOutput {
    // 1. Handle Network Timeouts / HTTP 5xx
    if (input.is_network_timeout || (input.http_status && input.http_status >= 500)) {
      return {
        normalizedState: 'UNKNOWN',
        isLive: false,
        isServingImpressions: false,
        reasonCode: 'NETWORK_TIMEOUT_OR_5XX',
        humanExplanation: 'Google Ads API gateway timeout or service disruption. Delivery truth unconfirmed.',
        responsibleSubsystem: 'NETWORK',
        recommendedAction: 'Wait for automated read-first reconciliation worker.',
        reconciliationRequired: true
      };
    }

    const campStatus = (input.status || 'UNKNOWN').toUpperCase();
    const primaryStatus = (input.primary_status || 'UNKNOWN').toUpperCase();
    const reasons = input.primary_status_reasons || [];
    const assetSummaries = input.asset_policy_summaries || [];

    // 2. Asset Policy Analysis (Partial vs Total Disapproval)
    let totalAssets = assetSummaries.length;
    let disapprovedAssets = assetSummaries.filter(a => a.approval_status === 'DISAPPROVED');
    let approvedAssets = assetSummaries.filter(a => a.approval_status === 'APPROVED' || a.approval_status === 'APPROVED_LIMITED');
    let pendingAssets = assetSummaries.filter(a => a.approval_status === 'REVIEW_IN_PROGRESS');

    const disapprovalTopics: string[] = [];
    disapprovedAssets.forEach(a => {
      a.policy_topic_entries?.forEach(e => disapprovalTopics.push(`Asset ${a.asset_id}: ${e.topic} (${e.type})`));
    });

    // 3. Status Mapping Logic

    // Rule A: Explicit Pause
    if (campStatus === 'PAUSED' || primaryStatus === 'PAUSED' || reasons.includes('CAMPAIGN_PAUSED')) {
      return {
        normalizedState: 'PAUSED',
        isLive: false,
        isServingImpressions: false,
        reasonCode: 'CAMPAIGN_PAUSED',
        humanExplanation: 'Campaign is paused by Host or Admin control plane.',
        responsibleSubsystem: 'ENCHO_CONTROL',
        recommendedAction: 'Click Resume in Encho Dashboard to reactivate ad delivery.',
        reconciliationRequired: false
      };
    }

    // Rule B: Policy Review Pending
    if (primaryStatus === 'PENDING' || reasons.includes('POLICY_SUMMARY_REVIEW') || (pendingAssets.length > 0 && approvedAssets.length === 0)) {
      return {
        normalizedState: 'REVIEWING',
        isLive: false,
        isServingImpressions: false,
        reasonCode: 'POLICY_UNDER_REVIEW',
        humanExplanation: 'Ad creative assets are currently under automated compliance review by Google Ads.',
        responsibleSubsystem: 'GOOGLE_POLICY',
        recommendedAction: 'Standard reviews take 24–48 hours. No action required.',
        reconciliationRequired: false
      };
    }

    // Rule C: Complete Disapproval
    if (
      primaryStatus === 'NOT_ELIGIBLE' && 
      (reasons.includes('POLICY_DISAPPROVED') || (totalAssets > 0 && approvedAssets.length === 0 && disapprovedAssets.length > 0))
    ) {
      return {
        normalizedState: 'DISAPPROVED',
        isLive: false,
        isServingImpressions: false,
        reasonCode: 'CAMPAIGN_POLICY_DISAPPROVED',
        humanExplanation: 'All ad creative assets were disapproved by Google policy filters.',
        responsibleSubsystem: 'GOOGLE_POLICY',
        recommendedAction: 'Edit ad headlines, descriptions, or destination URL to adhere to Google Ads Policies.',
        disapprovalReasons: disapprovalTopics.length > 0 ? disapprovalTopics : ['Violates Google Advertising Policies'],
        reconciliationRequired: false
      };
    }

    // Rule D: Misconfigured or Non-Delivering (Budget Exhausted, No Keywords/Ads, Ended)
    if (
      primaryStatus === 'MISCONFIGURED' ||
      primaryStatus === 'ENDED' ||
      reasons.includes('BUDGET_TOO_LOW') ||
      reasons.includes('NO_ACTIVE_ADS') ||
      reasons.includes('CAMPAIGN_ENDED')
    ) {
      return {
        normalizedState: 'NOT_DELIVERING',
        isLive: false,
        isServingImpressions: false,
        reasonCode: reasons[0] || 'CAMPAIGN_MISCONFIGURED',
        humanExplanation: 'Campaign is enabled but not actively serving impressions due to configuration or exhausted budget.',
        responsibleSubsystem: 'GOOGLE_SERVING',
        recommendedAction: 'Verify budget allocation or refuel campaign budget.',
        reconciliationRequired: true
      };
    }

    // Rule E: Eligible & Delivering (Partial Disapproval allowed if minimum required approved assets exist)
    if (campStatus === 'ENABLED' && primaryStatus === 'ELIGIBLE') {
      const isPartialDisapproval = disapprovedAssets.length > 0 && approvedAssets.length >= 2;
      return {
        normalizedState: 'LIVE',
        isLive: true,
        isServingImpressions: true,
        reasonCode: isPartialDisapproval ? 'LIVE_WITH_PARTIAL_ASSET_DISAPPROVAL' : 'CAMPAIGN_LIVE_DELIVERING',
        humanExplanation: isPartialDisapproval 
          ? 'Campaign is actively delivering using approved assets, though some optional headline assets were disapproved.'
          : 'Campaign is active and delivering impressions across the Google Ads Network.',
        responsibleSubsystem: 'GOOGLE_SERVING',
        recommendedAction: isPartialDisapproval ? 'Optional: Update flagged headline assets to maximize ad strength.' : 'Monitor performance metrics in Encho Control Center.',
        disapprovalReasons: isPartialDisapproval ? disapprovalTopics : undefined,
        reconciliationRequired: false
      };
    }

    // Fallback: Unknown
    return {
      normalizedState: 'UNKNOWN',
      isLive: false,
      isServingImpressions: false,
      reasonCode: 'UNRECOGNIZED_STATUS_COMBINATION',
      humanExplanation: `Unrecognized Google status combination: ${campStatus} / ${primaryStatus}`,
      responsibleSubsystem: 'GOOGLE_SERVING',
      recommendedAction: 'Trigger manual hierarchy reconciliation.',
      reconciliationRequired: true
    };
  }

  public static toNormalizedDeliveryTruth(
    externalCampaignId: string,
    input: GoogleRawStateInput
  ): NormalizedDeliveryTruth {
    const reduced = this.reduce(input);
    return {
      provider: 'GOOGLE',
      externalCampaignId,
      normalizedState: reduced.normalizedState,
      rawStatus: input.status || 'UNKNOWN',
      rawEffectiveStatus: input.primary_status || 'UNKNOWN',
      isLive: reduced.isLive,
      isServingImpressions: reduced.isServingImpressions,
      disapprovalReasons: reduced.disapprovalReasons,
      lastObservedAt: new Date().toISOString(),
      reconciliationRequired: reduced.reconciliationRequired
    };
  }
}
