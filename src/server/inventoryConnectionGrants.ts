import { Router, type RequestHandler } from 'express';
import type { PoolClient, Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const identity = z.string().min(1).max(200).refine(value => value.trim() === value);
const grantSchema = z.object({
  ownerId: z.number().int().positive(), requestKey: z.string().uuid(),
  provider: identity, connectionId: identity, providerPropertyId: identity,
  authorizationReference: identity, expiresAt: z.string().datetime({ offset: true }),
}).strict();
const revokeSchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();

/** Business authorization only: this route NEVER writes provider attestations. */
export function createInventoryConnectionGrantsRouter(deps: { pool: Pool; authenticate: RequestHandler; enabled: () => boolean }) {
  const router = Router(); router.use(deps.authenticate);
  const handle = (revoke: boolean): RequestHandler => async (req: any, res) => {
    let client: PoolClient | undefined;
    try {
      if (!deps.enabled()) return void res.status(503).json({ error: 'Connection authorization rollout is disabled.' });
      if (!req.user?.id) return void res.status(401).json({ error: 'Authentication required.' });
      if (req.user.role !== 'admin') return void res.status(403).json({ error: 'Only Admin can authorize or revoke connections.' });
      const listingId = Number(req.params.listingId);
      if (!/^[1-9]\d*$/.test(req.params.listingId) || !Number.isSafeInteger(listingId) || listingId > 2147483647) return void res.status(400).json({ error: 'Invalid property identity.' });
      const parsed = revoke ? revokeSchema.safeParse(req.body) : grantSchema.safeParse(req.body);
      if (!parsed.success || revoke && !z.string().uuid().safeParse(req.params.grantId).success) return void res.status(400).json({ error: 'Invalid authorization request.' });
      client = await deps.pool.connect(); await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','true',true)", [String(req.user.id)]);
      const listing = (await client.query('SELECT id,user_id FROM listings WHERE id=$1 FOR UPDATE', [listingId])).rows[0];
      if (!listing) { await client.query('ROLLBACK'); return void res.status(404).json({ error: 'Property not found.' }); }
      if (revoke) {
        const body = revokeSchema.parse(req.body);
        const grant = (await client.query('SELECT id FROM inventory_connection_grants WHERE id=$1 AND listing_id=$2', [req.params.grantId, listingId])).rows[0];
        if (!grant) { await client.query('ROLLBACK'); return void res.status(404).json({ error: 'Authorization not found.' }); }
        const previous = (await client.query('SELECT actor_id,reason FROM inventory_connection_revocations WHERE grant_id=$1', [grant.id])).rows[0];
        if (previous && (String(previous.actor_id) !== String(req.user.id) || previous.reason !== body.reason)) {
          await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Authorization was already revoked. Its original audit record is retained.' });
        }
        if (!previous) await client.query('INSERT INTO inventory_connection_revocations(grant_id,actor_id,reason) VALUES($1,$2,$3)', [grant.id, req.user.id, body.reason]);
        await client.query('COMMIT');
        return void res.json({ grantId: grant.id, revoked: true, replayed: Boolean(previous), providerVerified: false, checkoutAuthorized: false });
      }
      const body = grantSchema.parse(req.body);
      if (String(listing.user_id) !== String(body.ownerId)) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Property ownership changed. Refresh before authorizing.' }); }
      const fingerprint = createHash('sha256').update(JSON.stringify({ listingId, ...body })).digest('hex');
      const previous = (await client.query('SELECT id,request_hash FROM inventory_connection_grants WHERE approved_by=$1 AND request_key=$2', [req.user.id, body.requestKey])).rows[0];
      if (previous) {
        await client.query('ROLLBACK');
        return void res.status(previous.request_hash === fingerprint ? 200 : 409).json(previous.request_hash === fingerprint ? { grantId: previous.id, replayed: true, providerVerified: false, checkoutAuthorized: false } : { error: 'Retry key belongs to a different authorization request.' });
      }
      const validTime = (await client.query("SELECT $1::timestamptz > clock_timestamp() AND $1::timestamptz <= clock_timestamp()+interval '365 days' AS valid", [body.expiresAt])).rows[0]?.valid;
      if (!validTime) { await client.query('ROLLBACK'); return void res.status(400).json({ error: 'Authorization must expire in the future, within 365 days.' }); }
      // Cross-listing claims use the same resource lock after the listing lock.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([body.provider, body.connectionId, body.providerPropertyId])]);
      const duplicate = (await client.query(`SELECT g.id FROM inventory_connection_grants g
        WHERE g.provider=$1 AND g.connection_id=$2 AND g.provider_property_id=$3 AND g.expires_at > clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM inventory_connection_revocations r WHERE r.grant_id=g.id) LIMIT 1`, [body.provider, body.connectionId, body.providerPropertyId])).rows[0];
      if (duplicate) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'This provider property already has an authorization. Revoke it before replacing it.' }); }
      const id = randomUUID();
      await client.query(`INSERT INTO inventory_connection_grants(id,connection_id,provider,listing_id,owner_id,provider_property_id,approved_by,authorization_reference,expires_at,request_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, body.connectionId, body.provider, listingId, body.ownerId, body.providerPropertyId, req.user.id, body.authorizationReference, body.expiresAt, body.requestKey, fingerprint]);
      await client.query('COMMIT');
      res.json({ grantId: id, providerVerified: false, checkoutAuthorized: false });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollback => console.error('[INVENTORY AUTHORIZATION ROLLBACK]', rollback));
      console.error('[INVENTORY AUTHORIZATION]', error);
      res.status((error as { code?: string }).code === '23505' ? 409 : 503).json({ error: 'Authorization could not be saved. Retry with the same request key after checking its status.' });
    } finally { client?.release(); }
  };
  router.post('/:listingId/grants', handle(false));
  router.post('/:listingId/grants/:grantId/revoke', handle(true));
  router.get('/:listingId/grants', async (req: any, res) => {
    let client: PoolClient | undefined;
    try {
      if (!deps.enabled()) return void res.status(503).json({ code: 'INVENTORY_MAPPING_DISABLED', error: 'Connection authorization rollout is disabled.' });
      if (!req.user?.id) return void res.status(401).json({ error: 'Authentication required.' });
      if (req.user.role !== 'admin') return void res.status(403).json({ error: 'Admin access required.' });
      const listingId = Number(req.params.listingId), before = req.query.before ?? null;
      if (!/^[1-9]\d*$/.test(req.params.listingId) || !Number.isSafeInteger(listingId) || listingId > 2147483647 || before !== null && !z.string().uuid().safeParse(before).success) return void res.status(400).json({ error: 'Invalid property or cursor.' });
      client = await deps.pool.connect(); await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','true',true)", [String(req.user.id)]);
      const listing = (await client.query('SELECT id,user_id FROM listings WHERE id=$1', [listingId])).rows[0];
      if (!listing) { await client.query('ROLLBACK'); return void res.status(404).json({ error: 'Property not found.' }); }
      const rows = (await client.query(`SELECT g.id,g.provider,g.connection_id,g.provider_property_id,g.owner_id,g.approved_by,g.authorization_reference,g.approved_at,g.expires_at,
        r.actor_id AS revoked_by,r.reason AS revocation_reason,r.created_at AS revoked_at,
        CASE WHEN r.grant_id IS NOT NULL THEN 'revoked' WHEN g.owner_id<>$2 THEN 'ownership_changed'
          WHEN g.expires_at<=clock_timestamp() THEN 'expired' WHEN g.approved_at>clock_timestamp() THEN 'not_yet_valid' ELSE 'authorized' END AS status
        FROM inventory_connection_grants g LEFT JOIN inventory_connection_revocations r ON r.grant_id=g.id
        WHERE g.listing_id=$1 AND ($3::uuid IS NULL OR (g.approved_at,g.id)<
          (SELECT approved_at,id FROM inventory_connection_grants WHERE id=$3 AND listing_id=$1))
        ORDER BY g.approved_at DESC,g.id DESC LIMIT 51`, [listingId, listing.user_id, before])).rows;
      const grants = rows.slice(0, 50);
      await client.query('COMMIT');
      res.json({ grants, nextCursor: rows.length > 50 ? grants[49].id : null, providerVerification: 'unverified', checkoutAuthorized: false });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollback => console.error('[INVENTORY AUTHORIZATION READ ROLLBACK]', rollback));
      console.error('[INVENTORY AUTHORIZATION READ]', error); res.status(503).json({ error: 'Authorization history is unavailable.' });
    } finally { client?.release(); }
  });
  return router;
}
