import { describe, expect, it, vi } from 'vitest';
import { canonicalInventory } from '../../lib/roomInventory';
import { assertRoomIdentity } from '../server/roomIdentity';
vi.mock('../lib/metaControlPlaneService', () => ({ MetaControlPlaneService: { executeControlAction: vi.fn(async () => ({ success: true })) } }));
import { MetaControlPlaneService } from '../lib/metaControlPlaneService';
import { CalendarCircuitBreaker } from '../lib/calendarCircuitBreaker';

describe('Canonical room identity and inventory', () => {
  it('preserves zero and sums real inventory', () => {
    expect(canonicalInventory([{ id: 'a', inventory_count: 0 }])).toBe(0);
    expect(canonicalInventory([{ id: 'a', inventory_count: 0 }, { id: 'b', inventory_count: 3 }])).toBe(3);
  });
  it.each([null, [], [{ id: 'a' }], [{ id: 'a', inventory_count: '1' }], [{ id: 'a', inventory_count: -1 }], [{ id: 'a', inventory_count: 1 }, { id: 'a', inventory_count: 1 }]])('rejects unverified inventory: %j', rooms => expect(canonicalInventory(rooms)).toBeNull());
  it('allows retiring existing rooms with zero inventory, not deleting their IDs', async () => {
    const client = { query: vi.fn() } as any;
    const listing = { id: 42, rooms: [{ id: 'garden' }] };
    await expect(assertRoomIdentity(client, listing, [{ id: 'garden', inventory_count: 0 }])).resolves.toBeUndefined();
    await expect(assertRoomIdentity(client, listing, [{ id: 'new' }])).rejects.toThrow('Existing room IDs');
    expect(client.query).not.toHaveBeenCalled();
  });
  it('retains legacy normalized IDs on first canonical edit', async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: 9 }] })) } as any;
    await expect(assertRoomIdentity(client, { id: 42, rooms: [] }, [{ id: '9' }])).resolves.toBeUndefined();
    await expect(assertRoomIdentity(client, { id: 42, rooms: [] }, [{ id: 'other' }])).rejects.toThrow('Existing room IDs');
  });
  it.each([0, 2, null])('uses canonical stock %j without lifetime booking or normalized inventory reads', async inventory => {
    vi.mocked(MetaControlPlaneService.executeControlAction).mockClear();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM listings')) return { rows: [{ id: 42, rooms: inventory === null ? null : [{ id: 'garden', inventory_count: inventory }] }] };
      if (sql.includes('FROM host_marketing_campaigns')) return { rows: [{ id: 5, status: inventory === 0 ? 'active' : 'paused', pause_source: 'SYSTEM_AUTO_PAUSED', budget: 500, spent: 0 }] };
      throw new Error('Unexpected noncanonical inventory read');
    });
    const result = await CalendarCircuitBreaker.evaluateListingAvailability(42, { query }, { forceEvaluation: true });
    expect(result.is_fully_booked).toBe(inventory === 0 ? true : null);
    if (inventory === 0) expect(MetaControlPlaneService.executeControlAction).toHaveBeenCalledWith(5, 'CALENDAR_AUTO_PAUSE', expect.anything(), expect.anything(), expect.anything());
    else expect(MetaControlPlaneService.executeControlAction).not.toHaveBeenCalled();
  });
});
