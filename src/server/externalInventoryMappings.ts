import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const identity = z.string().min(1).max(200).refine(value => value === value.trim());
const bindingSchema = z.object({ provider: identity, connectionId: identity, providerPropertyId: identity, providerRoomId: identity }).strict();
const mutationSchema = z.object({ version: z.string().uuid().nullable(), requestKey: z.string().uuid(), reason: z.string().trim().min(1).max(1000), binding: bindingSchema.optional() }).strict();
export type InventoryBinding = z.infer<typeof bindingSchema>;
interface Dependencies {
  pool: Pool; authenticate: RequestHandler; enabled: () => boolean;
  /** Trusted server-side registry check under this transaction; never Host input or network I/O.
   * Must attest the exact binding's ownership and current validity. Absent means unavailable. */
  verifyBinding?: (client: PoolClient, binding: InventoryBinding, ownerId: number, listingId: number) => Promise<boolean>;
}

export function createExternalInventoryMappingsRouter(deps: Dependencies) {
  const router = Router(); router.use(deps.authenticate);
  const handle = (action: 'read' | 'mapped' | 'revoked'): RequestHandler => async (req: any, res) => {
    let client: PoolClient | undefined;
    try {
      if (!deps.enabled()) return void res.status(503).json({ code: 'INVENTORY_MAPPING_DISABLED', error: 'Inventory mapping rollout is not enabled.' });
      const listingId = Number(req.params.listingId), roomId = req.params.roomId;
      if (!/^[1-9]\d*$/.test(req.params.listingId) || !Number.isSafeInteger(listingId) || listingId > 2147483647 || !identity.safeParse(roomId).success || roomId.includes(',')) return void res.status(400).json({ error: 'Invalid property or room identity.' });
      if (!req.user?.id) return void res.status(401).json({ error: 'Authentication required.' });
      if (action !== 'read' && req.user.role !== 'admin') return void res.status(403).json({ error: 'Only Admin can manage provider mappings.' });
      const parsed = action === 'read' ? null : mutationSchema.safeParse(req.body);
      if (parsed && (!parsed.success || (action === 'mapped') !== Boolean(parsed.data.binding))) return void res.status(400).json({ error: 'Provide a version, retry key, reason and binding only for creation.' });
      const body = parsed?.success ? parsed.data : null;
      client = await deps.pool.connect(); await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls',$2,true)", [String(req.user.id), String(req.user.role === 'admin')]);
      const listing = (await client.query('SELECT id,user_id,rooms FROM listings WHERE id=$1 FOR UPDATE', [listingId])).rows[0];
      if (!listing || req.user.role !== 'admin' && String(listing.user_id) !== String(req.user.id)) {
        await client.query('ROLLBACK'); return void res.status(404).json({ error: 'Property not found.' });
      }
      const rooms = Array.isArray(listing.rooms) ? listing.rooms.filter((room: any) => String(room.id) === roomId) : [];
      if (rooms.length !== 1) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Canonical room identity requires review.' }); }
      const current = (await client.query('SELECT * FROM external_inventory_current WHERE listing_id=$1 AND room_id=$2', [listingId, roomId])).rows[0] ?? null;
      const latest = (await client.query('SELECT id FROM external_inventory_mapping_events WHERE listing_id=$1 AND room_id=$2 ORDER BY sequence DESC LIMIT 1', [listingId, roomId])).rows[0];
      let version = latest?.id ?? null;
      let mappingId = current?.mapping_id ?? null;
      if (body) {
        const fingerprint = createHash('sha256').update(JSON.stringify({ listingId, roomId, action, ...body })).digest('hex');
        const prior = (await client.query('SELECT request_hash,id,mapping_id FROM external_inventory_mapping_events WHERE actor_id=$1 AND request_key=$2', [req.user.id, body.requestKey])).rows[0];
        if (prior) {
          await client.query('ROLLBACK');
          return void res.status(prior.request_hash === fingerprint ? 200 : 409).json(prior.request_hash === fingerprint ? { replayed: true, operationVersion: prior.id, version, mappingId, checkoutAuthorized: false, deliveryAuthorized: false } : { error: 'Retry key was already used for a different request.' });
        }
        if (body.version !== version) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Mapping changed. Refresh before editing.' }); }
        if (action === 'mapped') {
          if (rooms[0].inventory_source !== 'external_sync' || !deps.verifyBinding || !await deps.verifyBinding(client, body.binding!, Number(listing.user_id), listingId)) {
            await client.query('ROLLBACK'); return void res.status(503).json({ code: 'PROVIDER_BINDING_UNVERIFIED', error: 'A verified provider connection and reviewed external inventory source are required.' });
          }
          mappingId = randomUUID();
          const b = body.binding!;
          await client.query('INSERT INTO external_inventory_mappings(id,listing_id,room_id,provider,connection_id,provider_property_id,provider_room_id,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [mappingId, listingId, roomId, b.provider, b.connectionId, b.providerPropertyId, b.providerRoomId, req.user.id]);
          await client.query('DELETE FROM external_inventory_current WHERE listing_id=$1 AND room_id=$2', [listingId, roomId]);
          await client.query('INSERT INTO external_inventory_current(listing_id,room_id,mapping_id,provider,connection_id,provider_property_id,provider_room_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [listingId, roomId, mappingId, b.provider, b.connectionId, b.providerPropertyId, b.providerRoomId]);
        } else {
          if (!current) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'There is no current mapping to revoke.' }); }
          await client.query('DELETE FROM external_inventory_current WHERE listing_id=$1 AND room_id=$2', [listingId, roomId]); mappingId = null;
        }
        version = randomUUID();
        await client.query('INSERT INTO external_inventory_mapping_events(id,listing_id,room_id,actor_id,action,previous_mapping_id,mapping_id,reason,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [version, listingId, roomId, req.user.id, action, current?.mapping_id ?? null, mappingId, body.reason, body.requestKey, fingerprint]);
      }
      await client.query('COMMIT');
      res.json({ version, mappingId, state: mappingId ? 'mapped_not_synchronized' : 'unmapped', checkoutAuthorized: false, deliveryAuthorized: false });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollback => console.error('[INVENTORY MAPPING ROLLBACK]', rollback));
      console.error('[INVENTORY MAPPING]', error);
      const conflict = (error as { code?: string }).code === '23505';
      res.status(conflict ? 409 : 503).json({ error: conflict ? 'Provider room or retry key is already assigned. Refresh and review the mapping.' : 'Inventory mapping could not be processed.' });
    } finally { client?.release(); }
  };
  router.get('/:listingId/rooms/:roomId', handle('read'));
  router.put('/:listingId/rooms/:roomId', handle('mapped'));
  router.delete('/:listingId/rooms/:roomId', handle('revoked'));
  return router;
}
