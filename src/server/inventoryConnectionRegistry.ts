import type { PoolClient } from 'pg';
import type { InventoryBinding } from './externalInventoryMappings.js';

/** Caller has locked the listing and authorized Admin. No network I/O or credentials here.
 * Future grant/revocation writers MUST acquire that same listing lock before insertion.
 * This is only mapping eligibility, not inventory freshness or permission to sell. */
export async function verifyRegisteredInventoryBinding(client: PoolClient, binding: InventoryBinding, ownerId: number, listingId: number): Promise<boolean> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !Number.isSafeInteger(listingId) || listingId <= 0) return false;
  // A staged/missing registry never falls back to trusting caller-provided verification.
  const schema = (await client.query(`SELECT to_regclass('public.inventory_connection_grants') AS grants,
    to_regclass('public.inventory_connection_revocations') AS revocations,
    to_regclass('public.inventory_binding_attestations') AS attestations`)).rows[0];
  if (!schema?.grants || !schema.revocations || !schema.attestations) return false;
  const result = await client.query(`SELECT g.id FROM inventory_connection_grants g
    JOIN listings l ON l.id=g.listing_id AND l.user_id=g.owner_id
    WHERE g.connection_id=$1 AND g.provider=$2 AND g.listing_id=$3 AND g.owner_id=$4 AND g.provider_property_id=$5
      AND g.approved_at <= clock_timestamp() AND g.expires_at > clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM inventory_connection_revocations r WHERE r.grant_id=g.id)
      AND EXISTS(SELECT 1 FROM inventory_binding_attestations a WHERE a.grant_id=g.id
        AND a.provider_property_id=g.provider_property_id AND a.provider_room_id=$6
        AND a.observed_at <= a.received_at AND a.received_at <= clock_timestamp()
        AND a.observed_at >= clock_timestamp()-interval '5 minutes' AND a.expires_at > clock_timestamp())
    LIMIT 2`, [binding.connectionId, binding.provider, listingId, ownerId, binding.providerPropertyId, binding.providerRoomId]);
  // Duplicate valid authorizations require reconciliation instead of guessing a grant.
  return result.rows.length === 1;
}
