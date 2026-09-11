import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { observeStayPayment } from './stayPaymentObservation.js';
import { stayRecoveryDetails } from './stayRecoveryDetails.js';

/** Read-only triage. Never release a hold, retry a charge or mark money refunded here. */
export function createStayRecoveryRouter(deps: { pool: Pool; authenticate: RequestHandler; enabled: () => boolean; fetchPayments?: (orderId: string) => Promise<unknown> }) {
  const router = Router(); router.use(deps.authenticate);
  router.get('/', async (req: any, res) => {
    let client: PoolClient | undefined;
    try {
      if (!req.user?.id) return void res.status(401).json({ error: 'Authentication required.' });
      if (req.user.role !== 'admin') return void res.status(403).json({ error: 'Admin access required.' });
      if (!deps.enabled()) return void res.status(503).json({ code: 'RECOVERY_DISABLED', error: 'Checkout recovery rollout is not enabled.' });
      const before = req.query.before ?? null;
      if (before !== null && !z.string().uuid().safeParse(before).success) return void res.status(400).json({ error: 'Invalid recovery cursor.' });
      client = await deps.pool.connect(); await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','true',true)", [String(req.user.id)]);
      const rows = (await client.query(`SELECT id,listing_id,room_id,check_in::text,check_out::text,total_minor::text,currency,state,provider_order_id,payment_id,booking_id,created_at,expires_at,
        CASE WHEN state='creating' THEN 'order_creation_unresolved' WHEN state='review' THEN 'provider_outcome_unknown' ELSE 'expired_checkout_requires_payment_check' END AS reason
        FROM stay_checkout_orders WHERE (state IN ('creating','review','expired') OR (state='ready' AND expires_at<=clock_timestamp()))
        AND ($1::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM stay_checkout_orders WHERE id=$1))
        ORDER BY created_at DESC,id DESC LIMIT 51`, [before])).rows;
      const orders = rows.slice(0, 50); await client.query('COMMIT');
      res.json({ orders, nextCursor: rows.length > 50 ? orders[49].id : null, readOnly: true });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollback => console.error('[STAY RECOVERY ROLLBACK]', rollback));
      console.error('[STAY RECOVERY READ]', error); res.status(503).json({ error: 'Recovery queue is unavailable. No payment or inventory state was changed.' });
    } finally { client?.release(); }
  });
  router.post('/:checkoutId/observe', async (req: any, res) => {
    if (!req.user?.id) return void res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== 'admin') return void res.status(403).json({ error: 'Admin access required.' });
    if (!deps.enabled() || !deps.fetchPayments) return void res.status(503).json({ error: 'Payment observation is not enabled.' });
    const parsed = z.object({ operationId: z.string().uuid() }).strict().safeParse(req.body);
    if (!parsed.success || !z.string().uuid().safeParse(req.params.checkoutId).success) return void res.status(400).json({ error: 'Valid checkout and observation retry references are required.' });
    try {
      const observation = await observeStayPayment({ pool: deps.pool, fetchPayments: deps.fetchPayments }, { checkoutId: req.params.checkoutId, operationId: parsed.data.operationId, actorId: req.user.id });
      res.json({ observation, bookingChanged: false, holdReleased: false, refundIssued: false });
    } catch (error) {
      console.error('[ADMIN PAYMENT OBSERVATION]', { operationId: parsed.data.operationId, checkoutId: req.params.checkoutId, type: error instanceof Error ? error.name : 'Unknown', code: (error as { code?: string })?.code });
      res.status(503).json({ error: 'Payment observation could not be completed. No booking, hold or refund was changed. Retry with the same observation reference.' });
    }
  });
  router.get('/:checkoutId', stayRecoveryDetails(deps));
  return router;
}
