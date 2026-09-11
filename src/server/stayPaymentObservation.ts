import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
export const paymentObservationPaymentSchema = z.object({
  id: z.string().min(1).max(100), order_id: z.string().min(1).max(100),
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().length(3),
  status: z.enum(['created','authorized','captured','refunded','failed']),
  amount_refunded: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export function summarizeOrderPayments(value: unknown, order: { provider_order_id: string; total_minor: string; currency: string }) {
  const parsed = z.object({ count: z.number().int().nonnegative().max(100), items: z.array(paymentObservationPaymentSchema).max(100) }).safeParse(value);
  if (!parsed.success || parsed.data.count !== parsed.data.items.length) throw new Error('Provider payment collection is incomplete or invalid');
  const payments = parsed.data.items;
  if (new Set(payments.map(payment => payment.id)).size !== payments.length) throw new Error('Provider payment identities are duplicated');
  if (!/^\d+$/.test(String(order.total_minor))) throw new Error('Stored checkout amount is invalid');
  const mismatch = payments.some(payment => payment.order_id !== order.provider_order_id || BigInt(payment.amount) !== BigInt(order.total_minor) || payment.currency !== order.currency || payment.amount_refunded > payment.amount);
  const captured = payments.filter(payment => payment.status === 'captured');
  const classification = mismatch || captured.length > 1 ? 'provider_review'
    : payments.some(payment => payment.amount_refunded > 0 || payment.status === 'refunded') ? 'refund_review'
    : captured.length === 1 ? 'captured_observed' : 'no_capture_observed';
  return { classification, payments };
}

/** Read-only provider lookup + immutable observation. Never a booking/refund/hold transition. */
export async function observeStayPayment(deps: { pool: Pool; fetchPayments: (orderId: string) => Promise<unknown> }, input: { checkoutId: string; operationId: string; actorId: number }) {
  z.string().uuid().parse(input.checkoutId); z.string().uuid().parse(input.operationId); z.number().int().positive().parse(input.actorId);
  async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','true',true)", [String(input.actorId)]);
      const result = await run(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(rollback => console.error('[PAYMENT OBSERVATION ROLLBACK]', rollback)); throw error; }
    finally { client.release(); }
  }
  async function prior(client: PoolClient) {
    const row = (await client.query('SELECT * FROM stay_payment_observations WHERE id=$1', [input.operationId])).rows[0];
    if (row && (String(row.actor_id) !== String(input.actorId) || row.checkout_id !== input.checkoutId)) throw new Error('Payment observation retry conflict');
    return row;
  }
  const initial = await transaction(async client => {
    const existing = await prior(client); if (existing) return { existing, order: null };
    const order = (await client.query('SELECT id,listing_id,provider_order_id,total_minor::text,currency FROM stay_checkout_orders WHERE id=$1', [input.checkoutId])).rows[0];
    if (!order?.provider_order_id) throw new Error('Stored provider order is missing; do not create another payment order');
    return { existing: null, order };
  });
  if (initial.existing) return initial.existing;
  const original = initial.order;
  const observedAt = new Date();
  const result = summarizeOrderPayments(await deps.fetchPayments(original.provider_order_id), original);
  return transaction(async client => {
    await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [original.listing_id]);
    const current = (await client.query('SELECT provider_order_id,total_minor::text,currency FROM stay_checkout_orders WHERE id=$1 FOR UPDATE', [input.checkoutId])).rows[0];
    if (!current || current.provider_order_id !== original.provider_order_id || String(current.total_minor) !== String(original.total_minor) || current.currency !== original.currency) throw new Error('Checkout changed during provider observation');
    const existing = await prior(client); if (existing) return existing;
    const saved = (await client.query(`INSERT INTO stay_payment_observations(id,checkout_id,actor_id,provider_order_id,classification,payments,observed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.operationId, input.checkoutId, input.actorId, original.provider_order_id, result.classification, JSON.stringify(result.payments), observedAt])).rows[0];
    await client.query("INSERT INTO stay_checkout_events(checkout_id,actor_id,event_type) VALUES($1,$2,'PROVIDER_PAYMENT_OBSERVED')", [input.checkoutId, input.actorId]);
    return saved;
  });
}
