import { describe, expect, it, vi } from 'vitest';
import { observeStayPayment, summarizeOrderPayments } from '../server/stayPaymentObservation';
const expected = { provider_order_id: 'order_fixture', total_minor: '12345', currency: 'INR' };
const payment = { id: 'pay_fixture', order_id: 'order_fixture', amount: 12345, currency: 'INR', status: 'captured', amount_refunded: 0, email: 'private@example.test', contact: 'private' };
describe('read-only payment observation', () => {
  it('recognizes exact capture and strips contact/payment-method details', () => {
    const result = summarizeOrderPayments({ count: 1, items: [payment] }, expected);
    expect(result.classification).toBe('captured_observed'); expect(result.payments[0]).not.toHaveProperty('email'); expect(result.payments[0]).not.toHaveProperty('contact');
  });
  it('does not interpret missing capture as payment failure', () => expect(summarizeOrderPayments({ count: 0, items: [] }, expected).classification).toBe('no_capture_observed'));
  it.each([{ order_id: 'other' }, { amount: 1 }, { currency: 'USD' }])('requires provider review for mismatched facts %j', change => expect(summarizeOrderPayments({ count: 1, items: [{ ...payment, ...change }] }, expected).classification).toBe('provider_review'));
  it('requires review for partial refunds and multiple captured payments', () => {
    expect(summarizeOrderPayments({ count: 1, items: [{ ...payment, amount_refunded: 1 }] }, expected).classification).toBe('refund_review');
    expect(summarizeOrderPayments({ count: 2, items: [payment, { ...payment, id: 'pay_other' }] }, expected).classification).toBe('provider_review');
  });
  it('rejects incomplete, duplicate and unsafe numeric collections', () => {
    for (const value of [{ count: 2, items: [payment] }, { count: 2, items: [payment,payment] }, { count: 1, items: [{ ...payment, amount: Number.MAX_SAFE_INTEGER+1 }] }]) expect(() => summarizeOrderPayments(value, expected)).toThrow();
  });
  it('calls provider outside locks then records evidence and audit without changing checkout', async () => {
    const commands: string[] = []; let saved: any;
    const checkoutId = '433eadf5-47df-4cd8-a403-82df56182f31', operationId = '443eadf5-47df-4cd8-a403-82df56182f31';
    const query = vi.fn(async (sql: string) => {
      commands.push(sql);
      if (sql.startsWith('SELECT * FROM stay_payment_observations')) return { rows: saved ? [saved] : [] };
      if (sql.startsWith('SELECT id,listing_id') || sql.startsWith('SELECT provider_order_id')) return { rows: [{ ...expected, id: checkoutId, listing_id: 10 }] };
      if (sql.startsWith('INSERT INTO stay_payment_observations')) { saved = { id: operationId, checkout_id: checkoutId, actor_id: 3 }; return { rows: [saved] }; }
      return { rows: [] };
    });
    const fetchPayments = vi.fn(async () => { commands.push('NETWORK'); return { count: 1, items: [payment] }; });
    const deps = { pool: { connect: async () => ({ query, release: vi.fn() }) } as any, fetchPayments };
    await observeStayPayment(deps, { checkoutId, operationId, actorId: 3 });
    expect(commands.indexOf('COMMIT')).toBeLessThan(commands.indexOf('NETWORK'));
    expect(commands.some(sql => /^(UPDATE|DELETE)/.test(sql))).toBe(false);
    expect(commands.some(sql => sql.includes('PROVIDER_PAYMENT_OBSERVED'))).toBe(true);
    await observeStayPayment(deps, { checkoutId, operationId, actorId: 3 }); expect(fetchPayments).toHaveBeenCalledTimes(1);
    await expect(observeStayPayment(deps, { checkoutId, operationId, actorId: 4 })).rejects.toThrow('retry conflict');
  });
});
