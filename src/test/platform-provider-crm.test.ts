import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { LeadAlertingCrmService as CRM } from '../lib/leadAlertingCrmService';
import { GoogleAdsProvider } from '../lib/providers/google/GoogleAdsProvider';

afterEach(() => vi.unstubAllEnvs());
describe('CRM trust boundaries', () => {
  it('does not accept webhook signatures without an explicit secret', () => {
    vi.stubEnv('META_APP_SECRET', '');
    expect(CRM.verifyWebhookSignature(undefined, '{}')).toBe(false);
    expect(CRM.verifyWebhookSignature('sha256=' + 'a'.repeat(64), '{}')).toBe(false);
  });
  it('verifies a real HMAC and rejects a tampered payload', () => {
    vi.stubEnv('META_APP_SECRET', 'unit-test-secret');
    const signature = 'sha256=' + createHmac('sha256', 'unit-test-secret').update('{}').digest('hex');
    expect(CRM.verifyWebhookSignature(signature, '{}')).toBe(true);
    expect(CRM.verifyWebhookSignature(signature, '{"changed":true}')).toBe(false);
  });
  it('retains outbox entries rather than pretend to deliver without an adapter', async () => {
    const db = { query: vi.fn() };
    await expect(CRM.processLeadNotificationQueue(db)).rejects.toThrow('ADAPTER_UNAVAILABLE');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('never attaches an ad inquiry to an arbitrary guest account', async () => {
    const db = { query: vi.fn() };
    await expect(CRM.ensureLeadConversationThread({ leadId: 1, hostId: 2, listingId: 3, initialMessage: 'Inquiry', poolOrClient: db })).rejects.toThrow('IDENTITY_UNLINKED');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('uses actual account recipients without including guest contact data', async () => {
    const db = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM users') ? [{ email: 'owner@example.com', phone: '+919876543210' }] : [{ id: 1 }] })) };
    await CRM.createNotificationIntents({ id: 1, campaign_id: 2, host_id: 3, intent_score: 80, guest_email: 'guest@example.com' }, { title: 'Garden stay' }, db);
    const writes = db.query.mock.calls.filter(([sql]) => sql.includes('INSERT'));
    expect(writes).toHaveLength(3);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('guest@example.com');
  });
});
describe('Google production reporting and control boundaries', () => {
  it.each(['pauseCampaign', 'resumeCampaign', 'updateBudget'] as const)('%s does not falsely confirm a local-only mutation', async method => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('GOOGLE_ADS_SANDBOX_MODE', 'true');
    const provider = new GoogleAdsProvider(); const db = { query: vi.fn() };
    const result = await provider[method]({ campaignId: 1, externalCampaignId: 'customers/123/campaigns/456' } as any, db);
    expect(result.success).toBe(false); expect(db.query).not.toHaveBeenCalled();
  });
  it('does not invent live Google observations or metrics', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const provider = new GoogleAdsProvider();
    expect((await provider.fetchAuthoritativeDeliveryTruth('customers/123/campaigns/456')).isLive).toBe(false);
    await expect(provider.fetchTelemetrySnapshot('customers/123/campaigns/456', { startDate: '2026-01-01', endDate: '2026-01-02' })).rejects.toThrow('not connected');
  });
});
