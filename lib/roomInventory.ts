/** Null means unverified inventory, never an invented room or evidence to resume ads. */
export function canonicalInventory(rooms: unknown): number | null {
  if (!Array.isArray(rooms) || !rooms.length) return null;
  const ids = new Set<string>();
  let total = 0;
  for (const room of rooms) {
    if (!room || !['string', 'number'].includes(typeof room.id) || !String(room.id).trim() || ids.has(String(room.id)) || !Number.isSafeInteger(room.inventory_count) || room.inventory_count < 0) return null;
    ids.add(String(room.id)); total += room.inventory_count;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
