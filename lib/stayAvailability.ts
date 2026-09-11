import { dateDay } from './stayQuote.js';

export interface StayReservationRange { room_id?: string | null; move_in_date: string; check_out_date: string }
export type StayAvailability = { state: 'available' | 'unavailable'; remaining: number } | { state: 'unknown'; reason: string };

/** Internal inventory only. This never attests external-channel freshness or authorizes ad delivery. */
export function evaluateStayAvailability(input: {
  roomId: string; inventory: number; checkIn: string; checkOut: string;
  reservations: StayReservationRange[];
}): StayAvailability {
  if (!input.roomId?.trim() || input.roomId.includes(',') || !Number.isSafeInteger(input.inventory) || input.inventory < 0) return { state: 'unknown', reason: 'Room identity or inventory is invalid.' };
  let start: number, end: number;
  try { start = dateDay(input.checkIn); end = dateDay(input.checkOut); }
  catch { return { state: 'unknown', reason: 'Requested stay dates are invalid.' }; }
  if (end <= start || end - start > 365) return { state: 'unknown', reason: 'Requested stay length is invalid.' };
  const ranges: [number, number][] = [];
  for (const reservation of input.reservations) {
    // Legacy records without a room identity conservatively occupy every room category.
    if (reservation.room_id && !String(reservation.room_id).split(',').map(id => id.trim()).includes(input.roomId)) continue;
    try {
      const a = dateDay(reservation.move_in_date), b = dateDay(reservation.check_out_date);
      if (b <= a) return { state: 'unknown', reason: 'Existing reservation dates require review.' };
      ranges.push([a, b]);
    } catch { return { state: 'unknown', reason: 'Existing reservation dates require review.' }; }
  }
  let remaining = input.inventory;
  for (let day = start; day < end; day++) {
    remaining = Math.min(remaining, Math.max(0, input.inventory - ranges.filter(([a, b]) => a <= day && day < b).length));
  }
  return { state: remaining > 0 ? 'available' : 'unavailable', remaining };
}
