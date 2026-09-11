import type { PoolClient } from 'pg';
import { assertStayCaptureContract } from '../../lib/stayCaptureContract.js';
import { currentStayInventory } from '../../lib/stayFulfillment.js';
import { evaluateStayAvailability } from '../../lib/stayAvailability.js';
import { StayError } from '../../lib/stayQuote.js';

/**
 * Server-only confirmation boundary. Caller authenticates the owner and supplies
 * genuine provider evidence after signature verification, outside this transaction.
 * Caller owns BEGIN/RLS/COMMIT; this routine locks listing before checkout and
 * atomically writes booking + checkout + audit. It never captures or refunds money.
 * Recovery states deliberately remain unsupported until their policy is implemented.
 */
export async function confirmStayCapture(client: PoolClient, input: {
  original: { id: string; listing_id: number; user_id: number };
  payment: unknown; paymentId: string; ownerId: number;
}) {
  const { original, payment, paymentId, ownerId } = input;
  if (original.user_id !== ownerId) throw new StayError('ORDER_NOT_FOUND', 'Payment order not found.', 404);
  const currentListing = (await client.query('SELECT id,currency,rooms FROM listings WHERE id=$1 FOR UPDATE', [original.listing_id])).rows[0];
  const locked = (await client.query('SELECT *,check_in::text,check_out::text FROM stay_checkout_orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [original.id, ownerId])).rows[0];
  const q = assertStayCaptureContract(original, locked, payment, paymentId);
  if (locked.state === 'confirmed') {
    if (locked.payment_id !== paymentId) throw new StayError('PAYMENT_CONFLICT', 'This booking was paid with a different payment.', 409);
    const booking = (await client.query('SELECT * FROM bookings WHERE id=$1 AND user_id=$2', [locked.booking_id, ownerId])).rows[0];
    if (!booking || String(booking.listing_id) !== q.listingId || booking.room_id !== q.roomId || booking.payment_intent_id !== paymentId) throw new StayError('CAPTURE_CONTRACT_REVIEW', 'The recorded booking requires reconciliation.', 409);
    return { booking, newlyConfirmed: false };
  }
  if (locked.state !== 'ready') throw new StayError('PAYMENT_REVIEW', 'Your payment requires reconciliation before booking confirmation.', 409);
  const inventory = currentStayInventory(currentListing, q);
  const calendar = await client.query('SELECT status FROM calendar_prices WHERE listing_id=$1 AND date_string >= $2 AND date_string < $3', [locked.listing_id, q.moveInDate, q.checkOutDate]);
  if (calendar.rows.some(row => row.status === 'blocked' || row.status === 'booked')) throw new StayError('DATES_UNAVAILABLE', 'Selected nights became unavailable. Captured payment requires reconciliation.', 409);
  const bookings = await client.query("SELECT room_id, move_in_date, check_out_date FROM bookings WHERE listing_id=$1 AND lower(status) NOT IN ('cancelled','declined','expired')", [q.listingId]);
  const holds = await client.query("SELECT id,room_id,check_in::text AS move_in_date,check_out::text AS check_out_date FROM stay_checkout_orders WHERE listing_id=$1 AND (state IN ('creating','review') OR (state='ready' AND expires_at > now()))", [q.listingId]);
  const availability = evaluateStayAvailability({ roomId: q.roomId, inventory, checkIn: q.moveInDate, checkOut: q.checkOutDate, reservations: [...bookings.rows, ...holds.rows.filter(hold => hold.id !== locked.id)] });
  if (availability.state === 'unknown') throw new StayError('INVENTORY_REVIEW', 'Existing reservation dates or inventory require review before confirmation.', 409);
  if (availability.state === 'unavailable') throw new StayError('SOLD_OUT', 'This room is no longer available for all selected nights.', 409);
  const booking = (await client.query(`INSERT INTO bookings (user_id,listing_id,room_id,move_in_date,check_out_date,configuration,name,phone,total_rent,status,payment_gateway,payment_intent_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed','razorpay',$10) RETURNING *`,
  [ownerId,q.listingId,q.roomId,q.moveInDate,q.checkOutDate,q.configuration,locked.guest_name,locked.guest_phone,q.totalMinor/100,paymentId])).rows[0];
  await client.query("UPDATE stay_checkout_orders SET state='confirmed',payment_id=$1,booking_id=$2 WHERE id=$3", [paymentId,booking.id,locked.id]);
  await client.query("INSERT INTO stay_checkout_events (checkout_id,actor_id,event_type) VALUES ($1,$2,'BOOKING_CONFIRMED')", [locked.id,ownerId]);
  return { booking, newlyConfirmed: true };
}
