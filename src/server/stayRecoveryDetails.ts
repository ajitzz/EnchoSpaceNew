import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { paymentObservationPaymentSchema } from './stayPaymentObservation.js';

const querySchema = z.object({
  observationBefore: z.string().uuid().optional(),
  eventBefore: z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n).optional(),
}).strict();

/** Historical evidence only. No provider requests and no financial transitions. */
export function stayRecoveryDetails(deps: { pool: Pool; enabled: () => boolean }): RequestHandler {
  return async (req, res) => {
    const user = (req as typeof req & { user?: { id: number; role: string } }).user;
    if (!user?.id) return void res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'admin') return void res.status(403).json({ error: 'Admin access required.' });
    res.setHeader('Cache-Control', 'no-store');
    if (!deps.enabled()) return void res.status(503).json({ code: 'RECOVERY_DISABLED', error: 'Checkout recovery rollout is not enabled.' });
    const id = z.string().uuid().safeParse(req.params.checkoutId);
    const query = querySchema.safeParse(req.query);
    if (!id.success || !query.success) return void res.status(400).json({ error: 'Invalid checkout or history cursor.' });
    let client: PoolClient | undefined;
    try {
      client = await deps.pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','true',true)", [String(user.id)]);
      const order = (await client.query(`SELECT id,listing_id,room_id,check_in::text,check_out::text,total_minor::text,currency,state,
        provider_order_id,payment_id,booking_id,created_at,expires_at FROM stay_checkout_orders WHERE id=$1`, [id.data])).rows[0];
      if (!order) { await client.query('COMMIT'); return void res.status(404).json({ error: 'Checkout not found.' }); }
      const { observationBefore, eventBefore } = query.data;
      for (const [cursor, sql] of [
        [observationBefore, 'SELECT id FROM stay_payment_observations WHERE checkout_id=$1 AND id=$2'],
        [eventBefore, 'SELECT id FROM stay_checkout_events WHERE checkout_id=$1 AND id=$2'],
      ] as const) {
        if (cursor && !(await client.query(sql, [id.data, cursor])).rows.length) {
          await client.query('COMMIT'); return void res.status(400).json({ error: 'History cursor does not belong to this checkout.' });
        }
      }
      const observationRows = (await client.query(`SELECT id,actor_id,provider_order_id,classification,payments,observed_at,recorded_at
        FROM stay_payment_observations WHERE checkout_id=$1
        AND ($2::uuid IS NULL OR (recorded_at,id)<(SELECT recorded_at,id FROM stay_payment_observations WHERE checkout_id=$1 AND id=$2))
        ORDER BY recorded_at DESC,id DESC LIMIT 21`, [id.data, observationBefore ?? null])).rows;
      const eventRows = (await client.query(`SELECT id::text,actor_id,event_type,created_at FROM stay_checkout_events WHERE checkout_id=$1
        AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT 51`, [id.data, eventBefore ?? null])).rows;
      // Re-apply the allowlist on historical JSON: future fields must not leak through this API.
      const observations = observationRows.slice(0, 20).map(row => ({ ...row, payments: z.array(paymentObservationPaymentSchema).max(100).parse(row.payments) }));
      const events = eventRows.slice(0, 50);
      await client.query('COMMIT');
      res.json({ order, observations, events, readOnly: true,
        nextObservationCursor: observationRows.length > 20 ? observations[19].id : null,
        nextEventCursor: eventRows.length > 50 ? events[49].id : null });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollback => console.error('[STAY DETAIL ROLLBACK]', { type: rollback instanceof Error ? rollback.name : 'Unknown' }));
      console.error('[STAY RECOVERY DETAIL]', { checkoutId: id.data, type: error instanceof Error ? error.name : 'Unknown', code: (error as { code?: string })?.code });
      res.status(503).json({ error: 'Checkout history is unavailable. No booking, payment or inventory state was changed.' });
    } finally { client?.release(); }
  };
}
