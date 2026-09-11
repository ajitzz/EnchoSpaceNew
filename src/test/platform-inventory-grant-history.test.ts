import { describe, expect, it, vi } from 'vitest';
import { createInventoryConnectionGrantsRouter } from '../server/inventoryConnectionGrants';
function fixture() {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT id,user_id') ? [{ id: 10, user_id: 7 }] : sql.startsWith('SELECT g.id,g.provider') ? Array.from({ length: 51 }, (_, i) => ({ id: `row-${i}` })) : [] }));
  const router = createInventoryConnectionGrantsRouter({ pool: { connect: async () => ({ query, release: vi.fn() }) } as any, authenticate: vi.fn(), enabled: () => true });
  async function call(role = 'admin', before?: string) {
    const handler = (router.stack.find((item: any) => item.route?.methods.get) as any).route.stack[0].handle;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ user: { id: 3, role }, params: { listingId: '10' }, query: { before } }, res); return res;
  }
  return { call, query };
}
describe('Admin-only authorization history', () => {
  it('rejects non-Admin before SQL', async () => { const f = fixture(); expect((await f.call('guest')).code).toBe(403); expect(f.query).not.toHaveBeenCalled(); });
  it('bounds history and returns a cursor without verification claims', async () => {
    const f = fixture(); const r = await f.call(); expect(r.body.grants).toHaveLength(50); expect(r.body.nextCursor).toBe('row-49'); expect(r.body.checkoutAuthorized).toBe(false);
    const sql = f.query.mock.calls.find(([sql]) => sql.startsWith('SELECT g.id,g.provider'))![0];
    expect(sql).toContain('g.listing_id=$1'); expect(sql).toContain('ORDER BY g.approved_at DESC,g.id DESC LIMIT 51'); expect(sql).toContain('ownership_changed');
    expect(f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  });
  it('rejects malformed pagination', async () => expect((await fixture().call('admin', 'malformed')).code).toBe(400));
});
