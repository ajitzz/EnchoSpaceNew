import type { CampaignQuoteInput, CostPolicyV1 } from '../../lib/marketing/financeQuote.js';
export const testPolicy: CostPolicyV1 = {
  id: 'test-explicit-costs', version: 1, currency: 'INR', costCodes: [
    { code: 'META_MEDIA', kind: 'MEDIA', provider: 'META' }, { code: 'GOOGLE_MEDIA', kind: 'MEDIA', provider: 'GOOGLE' },
    { code: 'PROCESSING', kind: 'SERVICE' }, { code: 'COST_TAX', kind: 'NONRECOVERABLE_TAX' },
  ], accountingApprovalReference: 'isolated-test-accounting-reference', taxApprovalReference: 'isolated-test-tax-reference',
  costScopeReference: 'isolated-test-scope', rounding: 'HALF_UP', varianceHandling: 'PLATFORM_ABSORBS_OVERRUN', markupMinBps: 300, markupMaxBps: 500,
};
export function testQuoteInput(overrides: Partial<CampaignQuoteInput> = {}): CampaignQuoteInput {
  return { campaignId: 1, hostId: 10, listingId: 20, campaignRevision: 'revision-1',
    costs: [{ code: 'META_MEDIA', amountMinor: '50000' }, { code: 'GOOGLE_MEDIA', amountMinor: '40000' }, { code: 'PROCESSING', amountMinor: '9000' }, { code: 'COST_TAX', amountMinor: '1000' }],
    remittanceTaxMinor: '0', markupBps: 500, idempotencyKey: 'quote-1', expiresAt: '2099-01-01T00:00:00.000Z', ...overrides };
}
