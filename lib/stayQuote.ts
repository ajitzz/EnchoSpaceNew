export class StayError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export interface StaySelection {
  listingId: string; roomId: string; moveInDate: string; checkOutDate: string;
  guests: number;
}
export interface StayQuote extends StaySelection {
  currency: 'INR'; configuration: string; nights: number; inventory: number;
  nightlyMinor: number; baseMinor: number; feeMinor: number; taxMinor: number;
  systemFeeMinor: number; totalMinor: number;
}

export function dateDay(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new StayError('INVALID_DATES', 'Select valid check-in and checkout dates.');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new StayError('INVALID_DATES', 'Select valid calendar dates.');
  return timestamp / 86400000;
}

export function intervalsOverlap(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return dateDay(start) < dateDay(otherEnd) && dateDay(otherStart) < dateDay(end);
}

function finite(value: unknown, label: string, min: number, max: number): number {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') throw new StayError('INVALID_CONFIGURATION', `${label} is not configured.`, 409);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new StayError('INVALID_CONFIGURATION', `${label} is invalid.`, 409);
  return n;
}

export function buildStayQuote(listing: any, rates: any, input: StaySelection, today = new Date().toISOString().slice(0, 10)): StayQuote {
  if (!input || !/^\d+$/.test(String(input.listingId)) || String(listing.id) !== String(input.listingId)) throw new StayError('INVALID_LISTING', 'Select a valid property.');
  const start = dateDay(input.moveInDate), end = dateDay(input.checkOutDate);
  if (start < dateDay(today) || end <= start || end - start > 365) throw new StayError('INVALID_DATES', 'Choose a future stay between 1 and 365 nights.');
  const rooms = typeof listing.rooms === 'string' ? JSON.parse(listing.rooms) : listing.rooms;
  const room = Array.isArray(rooms) ? rooms.find((r: any) => String(r.id) === String(input.roomId)) : undefined;
  if (!room || room.isAvailable === false) throw new StayError('ROOM_UNAVAILABLE', 'Select an available room listed by the host.', 409);
  if (room.inventory_source !== 'encho_allocation') throw new StayError('INVENTORY_SOURCE_UNVERIFIED', 'Instant booking requires verified Encho inventory. This room’s inventory source is not ready for online checkout.', 409);
  if (listing.currency !== 'INR') throw new StayError('CURRENCY_UNSUPPORTED', 'Online checkout for this currency is not available yet.', 409);
  const capacity = finite(room.capacity, 'Room capacity', 1, 1000);
  const inventory = finite(room.inventory_count, 'Room inventory', 0, 100000);
  if (!Number.isInteger(capacity) || !Number.isInteger(inventory) || inventory === 0) throw new StayError('ROOM_UNAVAILABLE', 'This room is not currently bookable.', 409);
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > capacity) throw new StayError('INVALID_GUESTS', `This room accommodates up to ${capacity} guests.`);
  if (room.min_stay_nights != null && end - start < finite(room.min_stay_nights, 'Minimum stay', 1, 365)) throw new StayError('MINIMUM_STAY', `This room requires at least ${room.min_stay_nights} nights.`);
  const nightlyMinor = Math.round(finite(room.price, 'Room price', 0.01, 10000000) * 100);
  const baseMinor = nightlyMinor * (end - start);
  const feeMinor = Math.round(baseMinor * finite(rates?.commission_rate, 'Service fee', 0, 100) / 100);
  const taxMinor = Math.round(baseMinor * finite(rates?.tax_rate, 'Tax rate', 0, 100) / 100);
  const systemFeeMinor = Math.round(finite(rates?.system_fee, 'Booking fee', 0, 10000000) * 100);
  const totalMinor = baseMinor + feeMinor + taxMinor + systemFeeMinor;
  if (!Number.isSafeInteger(totalMinor)) throw new StayError('INVALID_AMOUNT', 'The booking amount is outside supported limits.');
  return { listingId: String(listing.id), roomId: String(room.id), moveInDate: input.moveInDate, checkOutDate: input.checkOutDate, guests: input.guests, currency: 'INR', configuration: String(room.name), nights: end - start, inventory, nightlyMinor, baseMinor, feeMinor, taxMinor, systemFeeMinor, totalMinor };
}

export function assertCapturedPayment(payment: any, order: { provider_order_id: string; total_minor: number; currency: string }): void {
  if (payment?.status !== 'captured' || payment?.order_id !== order.provider_order_id || Number(payment?.amount) !== Number(order.total_minor) || payment?.currency !== order.currency) {
    throw new StayError('PAYMENT_NOT_CAPTURED', 'Payment is not captured for this exact order and amount. Please contact support if your account was debited.', 409);
  }
}
