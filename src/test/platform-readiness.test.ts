import { describe, expect, it } from 'vitest';
import { assertCampaignReadyForPublication, getCampaignReadiness, hasObservedLiveDelivery, isCampaignAwaitingReview } from '../../lib/campaignReadiness';
import { canReplayOffline } from '../../lib/offlinePolicy';
import { isGoogleSandboxEnabled } from '../../lib/providerMode';

const ready = { status: 'approved', admin_approved: true, policy_cleared: true, payment_status: 'paid', payment_intent_id: 'recorded-payment-reference', escrow_status: 'released' };

describe('Campaign publication prerequisites', () => {
  it('requires all independently persisted prerequisites', () => {
    expect(getCampaignReadiness(ready).canPublish).toBe(true);
    for (const patch of [{ admin_approved: false }, { policy_cleared: false }, { payment_status: 'pending' }, { payment_intent_id: '' }, { escrow_status: 'holding' }, { status: 'rejected' }, { status: 'EXTERNAL_OUTCOME_UNKNOWN' }, { status: 'cancelled' }]) {
      expect(() => assertCampaignReadyForPublication({ ...ready, ...patch })).toThrow('Campaign publication blocked');
    }
  });
  it('rejects truthy strings in place of approval and policy booleans', () => {
    expect(getCampaignReadiness({ ...ready, admin_approved: 'false' as unknown as boolean }).canPublish).toBe(false);
  });
  it('does not consider future or malformed release times cleared', () => {
    expect(getCampaignReadiness({ ...ready, escrow_release_at: '2030-01-01' }, Date.parse('2026-09-09')).escrowReleased).toBe(false);
    expect(getCampaignReadiness({ ...ready, escrow_release_at: 'invalid' }).escrowReleased).toBe(false);
  });
  it('approval and payment alone never constitute observed network delivery', () => {
    expect(hasObservedLiveDelivery({})).toBe(false);
    const now = Date.parse('2026-09-09T10:00:00Z');
    expect(hasObservedLiveDelivery({ meta_effective_status: 'ACTIVE', external_status_verified_at: '2026-09-09T09:59:00Z' }, now)).toBe(true);
    expect(hasObservedLiveDelivery({ meta_effective_status: 'ACTIVE', external_status_verified_at: '2026-09-09T08:59:00Z' }, now)).toBe(false);
    expect(hasObservedLiveDelivery({ meta_effective_status: 'ACTIVE', external_status_verified_at: '2026-09-09T10:01:00Z' }, now)).toBe(false);
  });
  it('handles legacy review status casing without counting approved campaigns as pending', () => {
    expect(isCampaignAwaitingReview({ status: 'PENDING_APPROVAL' })).toBe(true);
    expect(isCampaignAwaitingReview({ status: 'pending', admin_approved: true })).toBe(false);
  });
});

describe('Offline mutation policy', () => {
  it.each(['/api/bookings', '/api/checkout/razorpay/order', '/api/user/bookings/12/cancel', '/api/admin/marketing/campaigns/12/approve', '/api/payments/geo-route/initiate'])('never queues or replays %s', url => {
    expect(canReplayOffline(url, 'POST')).toBe(false);
    expect(canReplayOffline(url, 'PUT')).toBe(false);
  });
  it('allows only local wishlist operations, excluding unrelated hosts or query strings', () => {
    expect(canReplayOffline('/api/wishlists', 'POST')).toBe(true);
    expect(canReplayOffline('/api/wishlists/2', 'DELETE')).toBe(true);
    expect(canReplayOffline('https://untrusted.test/api/wishlists', 'POST')).toBe(false);
    expect(canReplayOffline('/api/wishlists?redirect=payments', 'POST')).toBe(false);
  });
});

describe('Google sandbox separation', () => {
  it('missing credentials never implicitly enable simulation', () => expect(isGoogleSandboxEnabled({})).toBe(false));
  it('production cannot enable simulated publishing', () => expect(isGoogleSandboxEnabled({ NODE_ENV: 'production', GOOGLE_ADS_SANDBOX_MODE: 'true' })).toBe(false));
  it('allows explicitly selected development sandbox and test fixtures', () => {
    expect(isGoogleSandboxEnabled({ NODE_ENV: 'development', GOOGLE_ADS_SANDBOX_MODE: 'true' })).toBe(true);
    expect(isGoogleSandboxEnabled({ NODE_ENV: 'test' })).toBe(true);
  });
});
