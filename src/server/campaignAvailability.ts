import type { PoolClient } from 'pg';
import { dateDay } from '../../lib/stayQuote.js';
import { evaluateStayAvailability } from '../../lib/stayAvailability.js';

export async function projectCampaignAvailability(client: Pick<PoolClient, 'query'>, listing: any, scope: any) {
  const base = { checkedAt: new Date().toISOString(), externalAvailability: 'unknown', deliveryAuthorized: false };
  const unknown = (reason: string) => ({ ...base, state: 'unknown', reason, rooms: [] });
  if (!scope) return unknown('No advertised stay dates saved.');
  try {
    const nights = dateDay(scope.checkOut) - dateDay(scope.checkIn);
    if (nights < 1 || nights > 365 || !Array.isArray(scope.roomIds) || !scope.roomIds.length || scope.roomIds.length > 100 || new Set(scope.roomIds).size !== scope.roomIds.length) return unknown('Saved stay scope requires review.');
  } catch { return unknown('Saved stay dates require review.'); }
  // Caller already authorized campaign + listing. Bypass is local to its transaction.
  await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
  const schema = await client.query("SELECT to_regclass('public.stay_checkout_orders') AS relation");
  if (!schema.rows[0]?.relation) return unknown('Checkout hold tracking is not enabled; availability cannot be verified.');
  const bookings = await client.query("SELECT room_id, move_in_date, check_out_date FROM bookings WHERE listing_id=$1 AND lower(status) NOT IN ('cancelled','declined','expired')", [listing.id]);
  const holds = await client.query("SELECT room_id, check_in::text AS move_in_date, check_out::text AS check_out_date FROM stay_checkout_orders WHERE listing_id=$1 AND (state IN ('creating','review') OR (state='ready' AND expires_at > now()))", [listing.id]);
  const calendar = await client.query('SELECT status FROM calendar_prices WHERE listing_id=$1 AND date_string >= $2 AND date_string < $3', [listing.id, scope.checkIn, scope.checkOut]);
  const blocked = calendar.rows.some(row => ['booked', 'blocked'].includes(row.status));
  const rooms = scope.roomIds.map((id: string) => {
    const room = Array.isArray(listing.rooms) ? listing.rooms.find((r: any) => String(r.id) === id) : undefined;
    const result = !room ? { state: 'unknown', reason: 'Selected room no longer exists.' } : blocked || room.isAvailable === false
      ? { state: 'unavailable', remaining: 0 }
      : evaluateStayAvailability({ roomId: id, inventory: room.inventory_count, checkIn: scope.checkIn, checkOut: scope.checkOut, reservations: [...bookings.rows, ...holds.rows] });
    return { roomId: id, ...result };
  });
  return { ...base, state: rooms.some((room: any) => room.state === 'unknown') ? 'unknown' : rooms.every((room: any) => room.state === 'available') ? 'available' : 'unavailable', rooms };
}
