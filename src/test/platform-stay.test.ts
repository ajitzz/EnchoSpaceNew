import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildStayQuote, dateDay, intervalsOverlap, assertCapturedPayment } from '../../lib/stayQuote';
import { createStayCheckoutRouter } from '../server/stayCheckout';
import { canTransitionStay } from '../../lib/bookingLifecycle';

const selection = { listingId: '8', roomId: 'real-room', moveInDate: '2090-04-01', checkOutDate: '2090-04-04', guests: 2 };
const listing = { id: 8, currency: 'INR', rooms: [{ id: 'real-room', name: 'Garden room', price: 1000.25, capacity: 2, inventory_count: 1, inventory_source: 'encho_allocation' }] };
const rates = { commission_rate: 10, tax_rate: 18, system_fee: 150 };
describe('Authoritative stay quote', () => {
  it.each([undefined, 'unknown', 'external_sync', 'pretend_verified'])('blocks unverified inventory source %s', source => {
    expect(() => buildStayQuote({ ...listing, rooms: [{ ...listing.rooms[0], inventory_source: source }] }, rates, selection)).toThrow('inventory source is not ready');
  });
  it('requires payment for host confirmation and prevents terminal-state revival', () => {
    expect(canTransitionStay({ status: 'pending' }, 'confirmed')).toBe(false);
    expect(canTransitionStay({ status: 'pending', payment_intent_id: 'paid-reference' }, 'confirmed')).toBe(true);
    expect(canTransitionStay({ status: 'cancelled', payment_intent_id: 'paid-reference' }, 'confirmed')).toBe(false);
    expect(canTransitionStay({ status: 'confirmed', check_out_date: '2090-01-01' }, 'completed', '2026-09-09')).toBe(false);
    expect(canTransitionStay({ status: 'completed' }, 'cancelled')).toBe(false);
  });
  it('uses integer minor units and the exact configured fees', () => {
    expect(buildStayQuote(listing, rates, selection)).toMatchObject({ nights: 3, nightlyMinor: 100025, baseMinor: 300075, feeMinor: 30008, taxMinor: 54014, systemFeeMinor: 15000, totalMinor: 399097 });
  });
  it('preserves configured zero fees', () => expect(buildStayQuote(listing, { commission_rate: 0, tax_rate: 0, system_fee: 0 }, selection).totalMinor).toBe(300075));
  it.each(['2090-02-30', 'invalid', '2090-4-01', '2090-01-01T00:00:00Z'])('rejects malformed calendar dates: %s', date => expect(() => dateDay(date)).toThrow());
  it('rejects a checkout before arrival', () => expect(() => buildStayQuote(listing, rates, { ...selection, checkOutDate: '2090-03-30' })).toThrow());
  it('never chooses a different room for an invalid identifier', () => expect(() => buildStayQuote(listing, rates, { ...selection, roomId: 'invented-room' })).toThrow());
  it('enforces capacity', () => expect(() => buildStayQuote(listing, rates, { ...selection, guests: 3 })).toThrow());
  it('rejects missing pricing settings', () => expect(() => buildStayQuote(listing, undefined, selection)).toThrow());
  it('does not reinterpret another currency as INR', () => expect(() => buildStayQuote({ ...listing, currency: 'USD' }, rates, selection)).toThrow());
  it('does not replace sold-out inventory with one unit', () => expect(() => buildStayQuote({ ...listing, rooms: [{ ...listing.rooms[0], inventory_count: 0 }] }, rates, selection)).toThrow());
  it('treats checkout as exclusive, allowing adjacent stays', () => {
    expect(intervalsOverlap('2090-04-01', '2090-04-04', '2090-04-04', '2090-04-06')).toBe(false);
    expect(intervalsOverlap('2090-04-01', '2090-04-04', '2090-04-03', '2090-04-06')).toBe(true);
  });
  it.each([{ status: 'authorized' }, { order_id: 'other' }, { amount: 1 }, { currency: 'USD' }])('rejects unmatched or uncaptured payments: %j', overrides => {
    expect(() => assertCapturedPayment({ status: 'captured', order_id: 'order-real', amount: 100, currency: 'INR', ...overrides }, { provider_order_id: 'order-real', total_minor: 100, currency: 'INR' })).toThrow();
  });
});

function harness(overrides: Record<string, unknown> = {}) {
  const order = { id: '12345678-1234-1234-1234-123456789abc', user_id: 7, listing_id: 8, provider_order_id: 'order-real', total_minor: 100, currency: 'INR', state: 'ready', quote: buildStayQuote(listing, rates, selection) };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM stay_checkout_orders WHERE id=')) return { rows: [order] };
    if (sql.startsWith('SELECT * FROM listings')) return { rows: [listing] };
    if (sql.includes('FROM payment_settings')) return { rows: [rates] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const gateway = { orders: { create: vi.fn() }, payments: { fetch: vi.fn(async () => ({ status: 'captured', order_id: 'order-real', amount: 100, currency: 'INR' })) } };
  const deps = { pool: { connect: vi.fn(async () => client) }, authenticate: vi.fn(), enabled: () => true, gateway: () => gateway, keyId: () => 'test-key', secret: () => 'unit-test-secret', ...overrides };
  const router = createStayCheckoutRouter(deps as any);
  async function call(path: string, body: unknown, key?: string) {
    const handler: any = router.stack.find((s: any) => s.route?.path === path)!.route.stack[0].handle;
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await handler({ user: { id: 7 }, body, get: () => key }, res, vi.fn());
    return res;
  }
  return { deps, query, gateway, client, call };
}
describe('Stay checkout route boundary (injected, no database or provider)', () => {
  it('returns server quote without creating payment or booking', async () => {
    const f = harness(); const res = await f.call('/quote', selection);
    expect(res.statusCode).toBe(200); expect(res.body.quote.totalMinor).toBe(399097);
    expect(f.gateway.orders.create).not.toHaveBeenCalled();
    expect(f.client.release).toHaveBeenCalled();
  });
  it('fails before database/provider work without an idempotency key', async () => {
    const f = harness(); const res = await f.call('/orders', selection);
    expect(res.statusCode).toBe(400); expect(f.deps.pool.connect).not.toHaveBeenCalled();
  });
  it('fails closed without payment configuration', async () => {
    const f = harness({ secret: () => undefined });
    expect((await f.call('/orders', selection)).statusCode).toBe(503);
    expect(f.gateway.orders.create).not.toHaveBeenCalled();
  });
  it('rejects invented signatures before fetching payment', async () => {
    const f = harness(); const res = await f.call('/verify', { checkoutId: '12345678-1234-1234-1234-123456789abc', razorpay_payment_id: 'pay-real', razorpay_signature: 'sim_sig_not_valid' });
    expect(res.statusCode).toBe(400); expect(f.gateway.payments.fetch).not.toHaveBeenCalled();
  });
  it('rejects a valid signature for a payment with the wrong amount', async () => {
    const f = harness(); f.gateway.payments.fetch.mockResolvedValue({ status: 'captured', order_id: 'order-real', amount: 99, currency: 'INR' });
    const signature = createHmac('sha256', 'unit-test-secret').update('order-real|pay-real').digest('hex');
    const res = await f.call('/verify', { checkoutId: '12345678-1234-1234-1234-123456789abc', razorpay_payment_id: 'pay-real', razorpay_signature: signature });
    expect(res.statusCode).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO bookings'))).toBe(false);
  });
});
