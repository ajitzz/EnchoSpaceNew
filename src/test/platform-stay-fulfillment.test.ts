import { describe, expect, it } from 'vitest';
import { currentStayInventory } from '../../lib/stayFulfillment';
import { buildStayQuote } from '../../lib/stayQuote';
const room = { id: 'room', name: 'Suite', inventory_count: 4, inventory_source: 'encho_allocation', capacity: 2, price: 1000 };
const listing = { id: 8, currency: 'INR', rooms: [room] };
const quote = buildStayQuote(listing, { commission_rate: 0, tax_rate: 0, system_fee: 0 }, { listingId: '8', roomId: 'room', guests: 2, moveInDate: '2090-01-01', checkOutDate: '2090-01-03' });
describe('Current fulfillment versus contracted price', () => {
  it('uses current inventory without repricing the immutable quote', () => {
    expect(currentStayInventory({ ...listing, rooms: [{ ...room, inventory_count: 1, price: 9000 }] }, quote)).toBe(1);
    expect(quote.inventory).toBe(4); expect(quote.totalMinor).toBe(200000);
  });
  it.each([{ inventory_count: 0 }, { inventory_count: null }, { inventory_count: true }, { inventory_count: -1 }, { inventory_count: 1.5 }, { inventory_count: ' ' }, { capacity: 1 }, { isAvailable: false }, { inventory_source: 'external_sync' }, { inventory_source: 'unknown' }])('blocks changed or malformed room eligibility %j', change => {
    expect(() => currentStayInventory({ ...listing, rooms: [{ ...room, ...change }] }, quote)).toThrow();
  });
  it('fails closed on missing or ambiguous canonical identities and wrong currency', () => {
    for (const rooms of [[], [room, room], 'invalid-json', null]) expect(() => currentStayInventory({ ...listing, rooms }, quote)).toThrow();
    expect(() => currentStayInventory({ ...listing, currency: 'USD' }, quote)).toThrow();
    expect(() => currentStayInventory(undefined, quote)).toThrow();
    expect(currentStayInventory({ ...listing, rooms: JSON.stringify([room]) }, quote)).toBe(4);
  });
});
