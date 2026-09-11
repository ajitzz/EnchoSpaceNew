import { z } from 'zod';
import { dateDay, StayError, type StayQuote } from './stayQuote.js';

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quoteSchema = z.object({
  listingId: z.string().regex(/^[1-9]\d*$/), roomId: z.string().min(1),
  moveInDate: z.string(), checkOutDate: z.string(), guests: z.number().int().positive(),
  currency: z.literal('INR'), configuration: z.string(), nights: z.number().int().positive().max(365),
  inventory: z.number().int().nonnegative(), nightlyMinor: money, baseMinor: money,
  feeMinor: money, taxMinor: money, systemFeeMinor: money, totalMinor: money,
});
const orderSchema = z.object({
  id: z.string().uuid(), user_id: z.number().int().positive(), listing_id: z.number().int().positive(),
  room_id: z.string().min(1), check_in: z.string(), check_out: z.string(),
  provider_order_id: z.string().min(1), total_minor: z.union([money, z.string().regex(/^[1-9]\d*$/)]), currency: z.literal('INR'),
  quote: quoteSchema,
});

/** Call after the checkout lock. Dates must come from SQL DATE::text, never timezone conversion. */
export function assertStayCaptureContract(originalValue: unknown, lockedValue: unknown, paymentValue: unknown, paymentId: string): StayQuote {
  const original = orderSchema.safeParse(originalValue), locked = orderSchema.safeParse(lockedValue);
  if (!original.success || !locked.success) throw new StayError('CAPTURE_CONTRACT_REVIEW', 'Stored checkout details require reconciliation before confirmation.', 409);
  const before = original.data, after = locked.data, q = after.quote;
  const unchanged = before.id === after.id && before.user_id === after.user_id && before.listing_id === after.listing_id && before.room_id === after.room_id
    && before.check_in === after.check_in && before.check_out === after.check_out && before.provider_order_id === after.provider_order_id
    && BigInt(before.total_minor) === BigInt(after.total_minor) && before.currency === after.currency && JSON.stringify(before.quote) === JSON.stringify(after.quote);
  const bound = q.listingId === String(after.listing_id) && q.roomId === after.room_id && q.moveInDate === after.check_in && q.checkOutDate === after.check_out
    && q.currency === after.currency && BigInt(q.totalMinor) === BigInt(after.total_minor)
    && BigInt(q.nightlyMinor) * BigInt(q.nights) === BigInt(q.baseMinor)
    && BigInt(q.baseMinor) + BigInt(q.feeMinor) + BigInt(q.taxMinor) + BigInt(q.systemFeeMinor) === BigInt(q.totalMinor);
  let validDates = false;
  try { validDates = dateDay(q.checkOutDate) - dateDay(q.moveInDate) === q.nights; } catch { /* Invalid persisted dates fail the contract below. */ }
  if (!unchanged || !bound || !validDates) throw new StayError('CAPTURE_CONTRACT_REVIEW', 'Checkout identity, dates or amount changed. Payment requires reconciliation.', 409);
  const payment = z.object({ id: z.string().min(1), order_id: z.string(), status: z.literal('captured'), amount: money, currency: z.literal('INR'), amount_refunded: z.literal(0) }).safeParse(paymentValue);
  if (!payment.success || payment.data.id !== paymentId || payment.data.order_id !== after.provider_order_id || BigInt(payment.data.amount) !== BigInt(after.total_minor)) {
    throw new StayError('PAYMENT_REVIEW', 'Payment identity, captured amount or refund status requires reconciliation.', 409);
  }
  return q;
}
