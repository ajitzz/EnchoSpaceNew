import { Router, type RequestHandler } from 'express';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertCapturedPayment, buildStayQuote, StayError, type StayQuote } from '../../lib/stayQuote.js';
import { evaluateStayAvailability } from '../../lib/stayAvailability.js';
import { confirmStayCapture } from './stayCaptureConfirmation.js';

interface Dependencies {
  pool: Pool; authenticate: RequestHandler; enabled: () => boolean;
  gateway: () => any; secret: () => string | undefined; keyId: () => string | undefined;
  onConfirmed?: (listingId: string, bookingId: string) => Promise<void>;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// External requests never run inside inventory transactions. All inventory writers
// in this router acquire the same listing row before a checkout row.
export function createStayCheckoutRouter(deps: Dependencies) {
  const router = Router();
  router.use(deps.authenticate);
  router.use((_req, res, next) => deps.enabled() ? next() : res.status(503).json({ code: 'CHECKOUT_NOT_ENABLED', error: 'Online checkout is temporarily unavailable while the secure booking upgrade is validated.' }));
  async function transaction<T>(userId: number, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      // Availability must include other guests. Bypass is transaction-local and
      // never derived from request input; every returned order remains owner-scoped.
      await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.bypass_rls', 'true', true)", [String(userId)]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  const guarded = (run: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await run(req, res); }
    catch (error) {
      console.error('[STAY CHECKOUT]', error instanceof StayError ? error.code : error);
      res.status(error instanceof StayError ? error.status : 503).json({ code: error instanceof StayError ? error.code : 'CHECKOUT_UNAVAILABLE', error: error instanceof StayError ? error.message : 'Checkout is temporarily unavailable. Retry with the same checkout attempt; contact support if payment was taken.' });
    }
  };
  async function quote(client: PoolClient, input: any, lock = false) {
    if (!/^\d+$/.test(String(input.listingId))) throw new StayError('INVALID_LISTING', 'Select a valid property.');
    const result = await client.query(`SELECT * FROM listings WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [input.listingId]);
    if (!result.rows[0]) throw new StayError('LISTING_NOT_FOUND', 'Property is no longer available.', 404);
    const settings = await client.query('SELECT commission_rate, tax_rate, system_fee FROM payment_settings ORDER BY id LIMIT 1');
    const resultQuote = buildStayQuote(result.rows[0], settings.rows[0], input);
    const calendar = await client.query('SELECT * FROM calendar_prices WHERE listing_id=$1 AND date_string >= $2 AND date_string < $3', [input.listingId, input.moveInDate, input.checkOutDate]);
    if (calendar.rows.some(r => r.status === 'blocked' || r.status === 'booked')) throw new StayError('DATES_UNAVAILABLE', 'One or more selected nights are unavailable.', 409);
    // Do not silently ignore date-specific pricing or promotions. Their quote
    // contract requires a separate verified adapter before this rollout opens.
    if (calendar.rows.some(r => r.price != null || r.offer_id != null)) throw new StayError('DATE_PRICING_REVIEW', 'These dates have a custom rate. Online checkout is not yet available for this rate.', 409);
    return resultQuote;
  }
  async function available(client: PoolClient, q: StayQuote, exclude?: string) {
    const bookings = await client.query("SELECT room_id, move_in_date, check_out_date FROM bookings WHERE listing_id=$1 AND lower(status) NOT IN ('cancelled','declined','expired')", [q.listingId]);
    const holds = await client.query("SELECT id, room_id, check_in::text AS move_in_date, check_out::text AS check_out_date FROM stay_checkout_orders WHERE listing_id=$1 AND (state IN ('creating','review') OR (state='ready' AND expires_at > now()))", [q.listingId]);
    const availability = evaluateStayAvailability({ roomId: q.roomId, inventory: q.inventory, checkIn: q.moveInDate, checkOut: q.checkOutDate,
      reservations: [...bookings.rows, ...holds.rows.filter(h => h.id !== exclude)] });
    if (availability.state === 'unknown') throw new StayError('INVENTORY_REVIEW', 'Existing reservation dates or inventory require host review before this room can be booked.', 409);
    if (availability.state === 'unavailable') throw new StayError('SOLD_OUT', 'This room is no longer available for all selected nights.', 409);
  }
  const view = (order: any) => ({ checkoutId: order.id, order_id: order.provider_order_id, quote: order.quote, amount: Number(order.total_minor), currency: order.currency, keyId: deps.keyId(), state: order.state, expiresAt: order.expires_at, bookingId: order.booking_id });
  router.post('/quote', guarded(async (req, res) => {
    const q = await transaction(req.user.id, async client => {
      const q = await quote(client, req.body);
      await available(client, q);
      return q;
    });
    res.json({ quote: q, quoteHash: hash(q) });
  }));
  router.post('/orders', guarded(async (req, res) => {
    if (!deps.gateway() || !deps.secret() || !deps.keyId()) throw new StayError('PAYMENT_UNAVAILABLE', 'Payment gateway is not configured.', 503);
    const key = req.get('X-Idempotency-Key');
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new StayError('IDEMPOTENCY_REQUIRED', 'A valid checkout attempt key is required.');
    const { name, phone } = req.body;
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 255 || typeof phone !== 'string' || !/^\+?[\d ()-]{7,30}$/.test(phone)) throw new StayError('GUEST_DETAILS_REQUIRED', 'Enter your real name and contact number.');
    const requestHash = hash(req.body);
    let created = false;
    const order = await transaction(req.user.id, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`stay:${req.user.id}:${key}`]);
      const prior = await client.query('SELECT * FROM stay_checkout_orders WHERE user_id=$1 AND idempotency_key=$2', [req.user.id, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new StayError('IDEMPOTENCY_CONFLICT', 'This attempt belongs to different booking details. Start a new attempt.', 409);
        return prior.rows[0];
      }
      const q = await quote(client, req.body, true);
      if (req.body.quoteHash !== hash(q)) throw new StayError('QUOTE_CHANGED', 'The price or room details changed. Refresh and review the quote before paying.', 409);
      await available(client, q);
      const id = randomUUID();
      const result = await client.query(`INSERT INTO stay_checkout_orders (id,user_id,listing_id,room_id,check_in,check_out,idempotency_key,request_hash,quote,guest_name,guest_phone,total_minor,currency,state,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'creating',now()+interval '15 minutes') RETURNING *`,
      [id, req.user.id, q.listingId, q.roomId, q.moveInDate, q.checkOutDate, key, requestHash, JSON.stringify(q), name.trim(), phone.trim(), q.totalMinor, q.currency]);
      await client.query("INSERT INTO stay_checkout_events (checkout_id,actor_id,event_type) VALUES ($1,$2,'ORDER_REQUESTED')", [id, req.user.id]);
      created = true;
      return result.rows[0];
    });
    if (!created) {
      if (order.state === 'ready' && new Date(order.expires_at).getTime() > Date.now()) return res.json(view(order));
      if (order.state === 'confirmed') return res.json(view(order));
      throw new StayError('ORDER_REVIEW_REQUIRED', 'This attempt is expired or awaiting payment reconciliation. Do not pay again; contact support with your checkout reference.', 409);
    }
    try {
      const external = await deps.gateway().orders.create({ amount: Number(order.total_minor), currency: order.currency, receipt: order.id, notes: { checkout_id: order.id, user_id: String(req.user.id) } });
      if (!external?.id || Number(external.amount) !== Number(order.total_minor) || external.currency !== order.currency) throw new Error('Gateway returned an invalid order');
      const saved = await transaction(req.user.id, async client => {
        const row = await client.query("UPDATE stay_checkout_orders SET provider_order_id=$1,state='ready' WHERE id=$2 AND user_id=$3 AND state='creating' RETURNING *", [external.id, order.id, req.user.id]);
        await client.query("INSERT INTO stay_checkout_events (checkout_id,actor_id,event_type) VALUES ($1,$2,'ORDER_READY')", [order.id, req.user.id]);
        return row.rows[0];
      });
      res.json(view(saved));
    } catch (error) {
      await transaction(req.user.id, async client => {
        await client.query("UPDATE stay_checkout_orders SET state='review' WHERE id=$1 AND user_id=$2 AND state='creating'", [order.id, req.user.id]);
        await client.query("INSERT INTO stay_checkout_events (checkout_id,actor_id,event_type) VALUES ($1,$2,'ORDER_OUTCOME_UNKNOWN')", [order.id, req.user.id]);
      });
      console.error('[STAY ORDER UNKNOWN OUTCOME]', order.id, error);
      throw new StayError('ORDER_REVIEW_REQUIRED', `Payment order needs reconciliation. Do not pay again. Reference: ${order.id}`, 503);
    }
  }));
  router.post('/verify', guarded(async (req, res) => {
    const { checkoutId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (typeof checkoutId !== 'string' || !/^[0-9a-f-]{36}$/i.test(checkoutId) || typeof paymentId !== 'string' || typeof signature !== 'string') throw new StayError('INVALID_PAYMENT', 'Payment verification details are incomplete.');
    const secret = deps.secret();
    if (!secret || !deps.gateway()) throw new StayError('PAYMENT_UNAVAILABLE', 'Payment verification is unavailable.', 503);
    const original = await transaction(req.user.id, async client => (await client.query('SELECT *,check_in::text,check_out::text FROM stay_checkout_orders WHERE id=$1 AND user_id=$2', [checkoutId, req.user.id])).rows[0]);
    if (!original?.provider_order_id) throw new StayError('ORDER_NOT_FOUND', 'Payment order not found.', 404);
    const expected = createHmac('sha256', secret).update(`${original.provider_order_id}|${paymentId}`).digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()))) throw new StayError('INVALID_SIGNATURE', 'Payment signature did not match.');
    const payment = await deps.gateway().payments.fetch(paymentId);
    assertCapturedPayment(payment, original);
    const { booking, newlyConfirmed } = await transaction(req.user.id, client => confirmStayCapture(client, { original, payment, paymentId, ownerId: req.user.id }));
    if (newlyConfirmed && deps.onConfirmed) deps.onConfirmed(String(booking.listing_id), String(booking.id)).catch(error => console.error('[STAY POST-CONFIRM RECONCILIATION]', booking.id, error));
    res.json({ success: true, booking });
  }));
  return router;
}
