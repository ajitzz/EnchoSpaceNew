import { describe, expect, it, vi } from 'vitest';
import { verifyRegisteredInventoryBinding } from '../server/inventoryConnectionRegistry';
const binding = { provider: 'fixture', connectionId: 'connection', providerPropertyId: 'property', providerRoomId: 'room' };
function fixture(count = 1, schema = true) {
  const query = vi.fn(async (sql: string) => sql.includes('to_regclass') ? { rows: [schema ? { grants: 'grants', revocations: 'revocations', attestations: 'attestations' } : {}] } : { rows: Array.from({ length: count }, () => ({ id: 'fixture-grant' })) });
  return { client: { query } as any, query };
}
describe('trusted inventory connection registry', () => {
  it('requires every registry table, without querying guessed fallback data', async () => {
    const f = fixture(1, false); expect(await verifyRegisteredInventoryBinding(f.client, binding, 7, 10)).toBe(false); expect(f.query).toHaveBeenCalledTimes(1);
  });
  it.each([0,2])('rejects %s eligible grants', async count => {
    const f = fixture(count); expect(await verifyRegisteredInventoryBinding(f.client, binding, 7, 10)).toBe(false);
  });
  it('binds listing, owner and exact provider tuple using parameterized SQL', async () => {
    const f = fixture(); expect(await verifyRegisteredInventoryBinding(f.client, binding, 7, 10)).toBe(true);
    expect(f.query).toHaveBeenLastCalledWith(expect.stringContaining('l.user_id=g.owner_id'), ['connection','fixture',10,7,'property','room']);
    const sql = f.query.mock.calls[1][0];
    expect(sql).toContain('inventory_connection_revocations'); expect(sql).toContain("interval '5 minutes'"); expect(sql).toContain('a.expires_at > clock_timestamp()');
  });
  it('does not query invalid local identities', async () => {
    const f = fixture(); expect(await verifyRegisteredInventoryBinding(f.client, binding, NaN, 10)).toBe(false); expect(f.query).not.toHaveBeenCalled();
  });
  it('propagates database failures so the mapping transaction rolls back', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('Database unavailable')) } as any;
    await expect(verifyRegisteredInventoryBinding(client, binding, 7, 10)).rejects.toThrow('Database unavailable');
  });
});
