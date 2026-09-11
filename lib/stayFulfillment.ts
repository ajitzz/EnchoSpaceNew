import { StayError, type StayQuote } from './stayQuote.js';

/** Revalidate fulfillment, not price. Caller holds the canonical listing lock. */
export function currentStayInventory(listing: { id: unknown; currency: unknown; rooms: unknown } | undefined, quote: StayQuote): number {
  if (!listing || String(listing.id) !== quote.listingId || listing.currency !== quote.currency) throw new StayError('INVENTORY_REVIEW', 'Property identity or currency changed. Payment requires reconciliation.', 409);
  let rooms: unknown = listing.rooms;
  if (typeof rooms === 'string') {
    try { rooms = JSON.parse(rooms); } catch { throw new StayError('INVENTORY_REVIEW', 'Room inventory requires review before confirmation.', 409); }
  }
  if (!Array.isArray(rooms)) throw new StayError('INVENTORY_REVIEW', 'Room inventory requires review before confirmation.', 409);
  const matches = rooms.filter((room: unknown): room is Record<string, unknown> => typeof room === 'object' && room !== null && String((room as Record<string, unknown>).id) === quote.roomId);
  if (matches.length !== 1) throw new StayError('INVENTORY_REVIEW', 'The booked room identity requires review before confirmation.', 409);
  const room = matches[0];
  if (room.isAvailable === false || room.inventory_source !== 'encho_allocation') throw new StayError('INVENTORY_REVIEW', 'This room is no longer allocated for Encho confirmation. Payment requires reconciliation.', 409);
  const count = (value: unknown, minimum: number, maximum: number) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !/^\d+$/.test(value))) return null;
    const number = Number(value); return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
  };
  const inventory = count(room.inventory_count, 0, 100000), capacity = count(room.capacity, 1, 1000);
  if (inventory === null || capacity === null || !Number.isInteger(quote.guests) || quote.guests < 1 || quote.guests > capacity) throw new StayError('INVENTORY_REVIEW', 'Current room stock or capacity requires review before confirmation.', 409);
  if (inventory === 0) throw new StayError('SOLD_OUT', 'This room is no longer available. Captured payment requires reconciliation.', 409);
  return inventory;
}
