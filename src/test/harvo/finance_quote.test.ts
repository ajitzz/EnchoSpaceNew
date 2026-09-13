import { describe, expect, it } from 'vitest';
import { buildCampaignQuote, type CampaignQuoteInput, type CostPolicyV1 } from '../../lib/marketing/financeQuote.js';

import { testPolicy, testQuoteInput } from './financeFixtures.js';

const quote = (input = testQuoteInput(), policy = testPolicy) => buildCampaignQuote(input, policy, '2026-09-13T00:00:00.000Z');
describe('M2 exact cost-plus quote', () => {
  it('adds 5% of the complete cost base and preserves separate explicit tax', () => {
    expect(quote(testQuoteInput({ remittanceTaxMinor: '8000' }))).toMatchObject({ costMinor: '100000', profitMinor: '5000', totalMinor: '113000', remittanceTaxMinor: '8000', mediaMinor: { META: '50000', GOOGLE: '40000' } });
  });
  it('uses 3% on costs and exact half-up rounding rather than 15/85 or a charge margin', () => {
    expect(quote(testQuoteInput({ markupBps: 300 })).totalMinor).toBe('103000');
    const input = testQuoteInput(); input.costs = input.costs.map(line => ({ ...line, amountMinor: line.code === 'META_MEDIA' ? '10' : '0' }));
    expect(quote(input)).toMatchObject({ costMinor: '10', profitMinor: '1', totalMinor: '11' });
  });
  it.each(['-1', '1.1', '01', '1e3', '', '9223372036854775808', 100, NaN])('rejects noninteger or oversized money %s', amount => {
    const input = testQuoteInput(); input.costs[0].amountMinor = amount as string;
    expect(() => quote(input)).toThrow();
  });
  it.each([undefined, 0, 299, 501, 500.5])('requires a policy-bounded explicit markup %s', markupBps => {
    expect(() => quote(testQuoteInput({ markupBps: markupBps as number }))).toThrow();
  });
  it('requires every explicit cost code and specialist reference', () => {
    expect(() => quote(testQuoteInput({ costs: [{ code: 'META_MEDIA', amountMinor: '100' }] }))).toThrow(/Every approved cost/);
    expect(() => quote(testQuoteInput(), { ...testPolicy, taxApprovalReference: '' })).toThrow(/taxApprovalReference/);
    expect(() => quote(testQuoteInput(), { ...testPolicy, varianceHandling: undefined as any })).toThrow(/variance/);
  });
  it('snapshots exact policy/revision and ignores only retry key/time', () => {
    const first = quote();
    expect(quote(testQuoteInput({ idempotencyKey: 'retry' })).fingerprint).toBe(first.fingerprint);
    expect(quote(testQuoteInput({ campaignRevision: 'revision-2' })).fingerprint).not.toBe(first.fingerprint);
    expect(quote(testQuoteInput(), { ...testPolicy, version: 2 }).fingerprint).not.toBe(first.fingerprint);
  });
});
