/** Reviewed provider enums, not serving evidence. Unknown versions/values fail closed.
 * Sources and mapping rationale: docs/harvo/PROVIDER_STATUS_CONTRACTS.md.
 */
export const GOOGLE_V25_STATUS = ['UNSPECIFIED','UNKNOWN','ENABLED','PAUSED','REMOVED'] as const;
export const GOOGLE_V25_CAMPAIGN_PRIMARY = ['UNSPECIFIED','UNKNOWN','ELIGIBLE','PAUSED','REMOVED','ENDED','PENDING','MISCONFIGURED','LIMITED','LEARNING','NOT_ELIGIBLE'] as const;
export const GOOGLE_V25_CHILD_PRIMARY = ['UNSPECIFIED','UNKNOWN','ELIGIBLE','PAUSED','REMOVED','PENDING','LIMITED','NOT_ELIGIBLE'] as const;
export const GOOGLE_V25_REVIEW = ['UNSPECIFIED','UNKNOWN','REVIEW_IN_PROGRESS','REVIEWED','UNDER_APPEAL','ELIGIBLE_MAY_SERVE'] as const;
export const GOOGLE_V25_APPROVAL = ['UNSPECIFIED','UNKNOWN','APPROVED','APPROVED_LIMITED','DISAPPROVED','AREA_OF_INTEREST_ONLY'] as const;
export const META_V26_STATUS = ['ACTIVE','PAUSED','DELETED','ARCHIVED'] as const;
export const META_V26_EFFECTIVE = [
 ['ACTIVE','ARCHIVED','DELETED','IN_PROCESS','PAUSED','WITH_ISSUES'],
 ['ACTIVE','ARCHIVED','CAMPAIGN_PAUSED','DELETED','IN_PROCESS','PAUSED','WITH_ISSUES'],
 ['ACTIVE','ADSET_PAUSED','ARCHIVED','CAMPAIGN_PAUSED','DELETED','DISAPPROVED','IN_PROCESS','PAUSED','PENDING_BILLING_INFO','PENDING_REVIEW','PREAPPROVED','WITH_ISSUES'],
] as const;
export function knownStatus(values:readonly string[],value:unknown):value is string {
 return typeof value==='string' && values.includes(value) && value!=='UNKNOWN' && value!=='UNSPECIFIED';
}
