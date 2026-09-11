import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export interface InventoryBindingReader {
  provider: string;
  read(propertyId: string, roomId: string, signal: AbortSignal): Promise<{ propertyId: string; roomId: string; evidenceHash: string }>;
}
/** Internal worker boundary only. Connection resolver is trusted server configuration,
 * never an HTTP-supplied URL/key/adapter. No network is performed inside DB locks. */
export async function ingestInventoryBinding(deps: {
  pool: Pool; resolveReader: (connectionId: string) => InventoryBindingReader | undefined;
}, input: { listingId: number; grantId: string; roomId: string; operationId: string; signal: AbortSignal }) {
  z.number().int().positive().max(2147483647).parse(input.listingId);
  z.string().uuid().parse(input.grantId); z.string().uuid().parse(input.operationId);
  z.string().min(1).max(200).parse(input.roomId);
  input.signal.throwIfAborted();
  async function locked<T>(operation: (client: PoolClient, grant: any) => Promise<T>) {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.bypass_rls','true',true)");
      const listing = (await client.query('SELECT id,user_id FROM listings WHERE id=$1 FOR UPDATE', [input.listingId])).rows[0];
      const grant = (await client.query(`SELECT g.* FROM inventory_connection_grants g WHERE g.id=$1 AND g.listing_id=$2
        AND g.approved_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM inventory_connection_revocations r WHERE r.grant_id=g.id)`, [input.grantId, input.listingId])).rows[0];
      if (!listing || !grant || String(grant.owner_id) !== String(listing.user_id)) throw new Error('Inventory authorization is no longer valid');
      const result = await operation(client, grant); await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(rollback => console.error('[INVENTORY ATTESTATION ROLLBACK]', rollback)); throw error;
    } finally { client.release(); }
  }
  const prepared = await locked(async (client, grant) => {
    const prior = (await client.query('SELECT grant_id,provider_room_id FROM inventory_binding_attestations WHERE id=$1', [input.operationId])).rows[0];
    if (prior && (prior.grant_id !== input.grantId || prior.provider_room_id !== input.roomId)) throw new Error('Attestation operation ID conflict');
    return { grant, replayed: Boolean(prior) };
  });
  if (prepared.replayed) return { id: input.operationId, replayed: true };
  const reader = deps.resolveReader(prepared.grant.connection_id);
  if (!reader || reader.provider !== prepared.grant.provider) throw new Error('Verified server provider connection is unavailable');
  // Use request START, not completion, to avoid treating a slow response as fresh.
  const observedAt = new Date();
  const evidence = await reader.read(prepared.grant.provider_property_id, input.roomId, input.signal);
  input.signal.throwIfAborted();
  if (evidence.propertyId !== prepared.grant.provider_property_id || evidence.roomId !== input.roomId || !/^[a-f0-9]{64}$/.test(evidence.evidenceHash)) throw new Error('Provider binding evidence mismatch');
  return locked(async (client, grant) => {
    if (grant.connection_id !== prepared.grant.connection_id || grant.provider !== reader.provider || grant.provider_property_id !== evidence.propertyId) throw new Error('Provider binding changed during verification');
    await client.query(`INSERT INTO inventory_binding_attestations(id,grant_id,provider_property_id,provider_room_id,observed_at,received_at,expires_at,evidence_hash)
      VALUES($1,$2,$3,$4,$5,clock_timestamp(),$5::timestamptz+interval '5 minutes',$6) ON CONFLICT(id) DO NOTHING`, [input.operationId, input.grantId, evidence.propertyId, evidence.roomId, observedAt, evidence.evidenceHash]);
    const stored = (await client.query('SELECT grant_id,provider_room_id,evidence_hash FROM inventory_binding_attestations WHERE id=$1', [input.operationId])).rows[0];
    if (!stored || stored.grant_id !== input.grantId || stored.provider_room_id !== input.roomId || stored.evidence_hash !== evidence.evidenceHash) throw new Error('Attestation operation ID conflict');
    return { id: input.operationId, replayed: false };
  });
}
