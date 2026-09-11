/** Shared presentation and server publication prerequisites. Provider verification is separate. */
export interface CampaignReadinessInput {
  status?: string | null;
  admin_approved?: boolean | null;
  policy_cleared?: boolean | null;
  payment_status?: string | null;
  payment_intent_id?: string | null;
  escrow_status?: string | null;
  escrow_release_at?: string | Date | null;
}

export type CampaignBlocker = 'STATE_BLOCKED' | 'ADMIN_REVIEW_REQUIRED' | 'POLICY_REVIEW_REQUIRED' | 'PAYMENT_REQUIRED' | 'ESCROW_PENDING';

export function getCampaignReadiness(campaign: CampaignReadinessInput, now = Date.now()) {
  const status = (campaign.status || '').toLowerCase();
  const stateAllowed = ['approved', 'escrow', 'asset_prep', 'meta_api_push', 'active', 'campaign_live', 'paused', 'failed', 'failed_publish'].includes(status);
  const approved = campaign.admin_approved === true;
  const policyCleared = campaign.policy_cleared === true;
  const funded = campaign.payment_status === 'paid' && typeof campaign.payment_intent_id === 'string' && campaign.payment_intent_id.trim().length > 0;
  const releaseAt = campaign.escrow_release_at ? new Date(campaign.escrow_release_at).getTime() : null;
  const escrowReleased = campaign.escrow_status === 'released' && (releaseAt === null || (Number.isFinite(releaseAt) && releaseAt <= now));
  const blockers: CampaignBlocker[] = [];
  if (!stateAllowed) blockers.push('STATE_BLOCKED');
  if (!approved) blockers.push('ADMIN_REVIEW_REQUIRED');
  if (!policyCleared) blockers.push('POLICY_REVIEW_REQUIRED');
  if (!funded) blockers.push('PAYMENT_REQUIRED');
  if (!escrowReleased) blockers.push('ESCROW_PENDING');
  return { approved, policyCleared, funded, escrowReleased, blockers, canPublish: blockers.length === 0 };
}

export function assertCampaignReadyForPublication(campaign: CampaignReadinessInput) {
  const readiness = getCampaignReadiness(campaign);
  if (!readiness.canPublish) {
    const error = new Error(`Campaign publication blocked: ${readiness.blockers.join(', ')}`);
    Object.assign(error, { code: 'CAMPAIGN_NOT_READY', blockers: readiness.blockers, statusCode: 409 });
    throw error;
  }
  return readiness;
}

export function isCampaignAwaitingReview(campaign: CampaignReadinessInput) {
  return ['pending', 'pending_approval'].includes((campaign.status || '').toLowerCase()) && campaign.admin_approved !== true;
}

export function hasObservedLiveDelivery(campaign: { meta_effective_status?: string; external_status_verified_at?: string }, now = Date.now()) {
  const verifiedAt = Date.parse(campaign.external_status_verified_at || '');
  return campaign.meta_effective_status === 'ACTIVE' && Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 5 * 60_000;
}
