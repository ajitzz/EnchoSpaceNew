import { describe, expect, it } from 'vitest';
import { assertStayCaptureContract } from '../../lib/stayCaptureContract';
import { buildStayQuote } from '../../lib/stayQuote';
const quote = buildStayQuote({ id: 8, currency: 'INR', rooms: [{ id: 'room', name: 'Room', inventory_count: 1, inventory_source: 'encho_allocation', price: 100, capacity: 2 }] }, { commission_rate: 0, tax_rate: 0, system_fee: 0 }, { listingId: '8', roomId: 'room', moveInDate: '2090-01-01', checkOutDate: '2090-01-03', guests: 2 });
const order = { id: '11111111-1111-4111-8111-111111111111', user_id: 1, listing_id: 8, room_id: 'room', check_in: quote.moveInDate, check_out: quote.checkOutDate, provider_order_id: 'order-test', total_minor: String(quote.totalMinor), currency: 'INR', quote };
const payment = { id: 'pay-test', order_id: 'order-test', amount: quote.totalMinor, currency: 'INR', status: 'captured', amount_refunded: 0 };
describe('Locked stay capture contract', () => {
  it('accepts the exact stored contract and genuine zero refund amount', () => expect(assertStayCaptureContract(order, order, payment, 'pay-test')).toEqual(quote));
  it.each([{ provider_order_id: 'changed' }, { total_minor: '1' }, { user_id: 2 }, { listing_id: 9 }, { room_id: 'changed' }, { check_in: '2090-01-02' }, { quote: { ...quote, totalMinor: 1 } }])('rejects locked contract drift %j', change => expect(() => assertStayCaptureContract(order, { ...order, ...change }, payment, 'pay-test')).toThrow());
  it.each([{ id: 'other' }, { amount: String(quote.totalMinor) }, { amount_refunded: 1 }, { amount_refunded: undefined }, { status: 'authorized' }, { order_id: 'other' }])('rejects incomplete or conflicting payment evidence %j', change => expect(() => assertStayCaptureContract(order, order, { ...payment, ...change }, 'pay-test')).toThrow());
  it('rejects internally inconsistent persisted quotes even when unchanged', () => {
    for (const change of [{ roomId: 'other' }, { nights: 3 }, { baseMinor: 1 }, { checkOutDate: '2090-02-30' }]) {
      const broken = { ...order, quote: { ...quote, ...change } }; expect(() => assertStayCaptureContract(broken, broken, payment, 'pay-test')).toThrow();
    }
  });
});
