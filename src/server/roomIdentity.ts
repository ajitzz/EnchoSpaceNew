import type { PoolClient } from 'pg';

// Caller holds the listing lock. Legacy IDs are retained, never guessed by name/order.
export async function assertRoomIdentity(client: Pick<PoolClient, 'query'>, listing: any, rooms: any[]) {
  const existing = Array.isArray(listing.rooms) && listing.rooms.length
    ? listing.rooms
    : (await client.query('SELECT id FROM room_types WHERE listing_id=$1 ORDER BY id', [listing.id])).rows;
  const ids = new Set(rooms.map(room => String(room.id)));
  if (existing.some((room: any) => room.id == null || !ids.has(String(room.id)))) {
    throw new Error('Existing room IDs must be retained. Set room inventory to zero to stop selling it.');
  }
}
