import {GOOGLE_V25_STATUS, GOOGLE_V25_CAMPAIGN_PRIMARY, GOOGLE_V25_CHILD_PRIMARY, GOOGLE_V25_REVIEW, GOOGLE_V25_APPROVAL, META_V26_STATUS, META_V26_EFFECTIVE, knownStatus} from './deliveryStatusContracts.js';
import type {NormalizedDeliveryState, NormalizedDeliveryTruth} from './types.js';

export type DeliveryReadiness = 'ELIGIBLE' | 'LIMITED' | 'REVIEWING' | 'PENDING' | 'LEARNING' | 'BLOCKED' | 'PAUSED' | 'UNKNOWN';

function evidence(provider: 'GOOGLE' | 'META', externalCampaignId: string, rawStatus: string,
  rawEffectiveStatus: string, readiness: DeliveryReadiness, normalizedState: NormalizedDeliveryState): NormalizedDeliveryTruth {
  return {provider, externalCampaignId, rawStatus, rawEffectiveStatus, readiness, normalizedState,
    // Eligibility and cumulative impressions do not prove present-tense delivery.
    isLive: false, isServingImpressions: false, lastObservedAt: new Date().toISOString(),
    reconciliationRequired: readiness === 'UNKNOWN'};
}

/** Call only after exact account, hierarchy and parentage verification. */
export function googleHierarchyEvidence(id: string, row: {
  campaign: {status?: string; primaryStatus?: string}; adGroup: {status?: string; primaryStatus?: string};
  adGroupAd: {status?: string; primaryStatus?: string; policySummary?: {approvalStatus?: string; reviewStatus?: string}};
}, version = 'v25'): NormalizedDeliveryTruth {
  const statuses = [row.campaign.status, row.adGroup.status, row.adGroupAd.status];
  const primaries = [row.campaign.primaryStatus, row.adGroup.primaryStatus, row.adGroupAd.primaryStatus];
  const policy = row.adGroupAd.policySummary;
  const result = (readiness: DeliveryReadiness, state: NormalizedDeliveryState) => evidence('GOOGLE', id,
    row.campaign.status || 'UNKNOWN', row.adGroupAd.primaryStatus || 'UNKNOWN', readiness, state);
  if (version !== 'v25' || !statuses.every(value => knownStatus(GOOGLE_V25_STATUS,value))) return result('UNKNOWN', 'UNKNOWN');
  if (statuses[0] === 'PAUSED') return result('PAUSED', 'PAUSED');
  if (statuses.includes('PAUSED')) return result('BLOCKED', 'NOT_DELIVERING');
  if (statuses.includes('REMOVED')) return result('BLOCKED', 'NOT_DELIVERING');
  if (!knownStatus(GOOGLE_V25_CAMPAIGN_PRIMARY,primaries[0]) || !primaries.slice(1).every(value=>knownStatus(GOOGLE_V25_CHILD_PRIMARY,value))
    || !knownStatus(GOOGLE_V25_APPROVAL,policy?.approvalStatus) || !knownStatus(GOOGLE_V25_REVIEW,policy?.reviewStatus)) return result('UNKNOWN','UNKNOWN');
  if (policy?.approvalStatus === 'DISAPPROVED') return result('BLOCKED', 'DISAPPROVED');
  if (primaries.some(value => ['NOT_ELIGIBLE', 'MISCONFIGURED', 'ENDED', 'PAUSED', 'REMOVED'].includes(value || ''))) return result('BLOCKED', 'NOT_DELIVERING');
  if (['REVIEW_IN_PROGRESS', 'UNDER_APPEAL'].includes(policy?.reviewStatus || '')) return result('REVIEWING', 'REVIEWING');
  if (primaries.includes('PENDING')) return result('PENDING','UNKNOWN');
  if (primaries.includes('LIMITED') || policy?.approvalStatus !== 'APPROVED' || policy?.reviewStatus === 'ELIGIBLE_MAY_SERVE') return result('LIMITED','UNKNOWN');
  if (primaries[0] === 'LEARNING') return result('LEARNING','UNKNOWN');
  if (primaries.every(value => value === 'ELIGIBLE')) return result('ELIGIBLE','UNKNOWN');
  return result('UNKNOWN', 'UNKNOWN');
}

/** Identity is validated by the adapter before any status can be exposed. */
export function metaHierarchyEvidence(id: string, layers: Array<{status?: string; effective_status?: string}>, version = 'v26.0'): NormalizedDeliveryTruth {
  const statuses = layers.map(value => value.status), effective = layers.map(value => value.effective_status);
  const result = (readiness: DeliveryReadiness, state: NormalizedDeliveryState) => evidence('META', id,
    statuses[0] || 'UNKNOWN', effective[2] || 'UNKNOWN', readiness, state);
  if (version !== 'v26.0' || layers.length !== 3 || !statuses.every(value => knownStatus(META_V26_STATUS,value))) return result('UNKNOWN', 'UNKNOWN');
  if (statuses[0] === 'PAUSED') return result('PAUSED', 'PAUSED');
  if (!effective.every((value,index)=>knownStatus(META_V26_EFFECTIVE[index],value))) return result('UNKNOWN','UNKNOWN');
  // A paused child cannot establish that the entire external campaign is stopped.
  if (statuses.includes('PAUSED') || effective.some(value => ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(value || ''))) return result('BLOCKED', 'NOT_DELIVERING');
  if (effective.includes('DISAPPROVED')) return result('BLOCKED', 'DISAPPROVED');
  if ([...statuses, ...effective].some(value => ['DELETED', 'ARCHIVED', 'PENDING_BILLING_INFO', 'WITH_ISSUES'].includes(value || ''))) return result('BLOCKED', 'NOT_DELIVERING');
  if (effective.some(value => ['PENDING_REVIEW', 'PREAPPROVED', 'IN_PROCESS'].includes(value || ''))) return result('REVIEWING', 'REVIEWING');
  if (statuses.every(value => value === 'ACTIVE') && effective.every(value => value === 'ACTIVE')) return result('ELIGIBLE', 'UNKNOWN');
  return result('UNKNOWN', 'UNKNOWN');
}
