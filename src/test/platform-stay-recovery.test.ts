import { describe, expect, it, vi } from 'vitest';
import { createStayRecoveryRouter } from '../server/stayRecovery';
function fixture(enabled = true) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT id,listing_id') ? Array.from({ length: 51 }, (_, i) => ({ id: `order-${i}` })) : [] }));
  const router = createStayRecoveryRouter({ pool: { connect: async () => ({ query, release: vi.fn() }) } as any, authenticate: vi.fn(), enabled: () => enabled });
  async function call(role = 'admin', before?: string) {
    const handler = (router.stack.find((item: any) => item.route) as any).route.stack[0].handle;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ user: { id: 3, role }, query: { before } }, res); return res;
  }
  return { query, call };
}
describe('Admin checkout recovery triage', () => {
  it('requires Admin and explicit rollout before SQL', async () => {
    const f = fixture(); expect((await f.call('guest')).code).toBe(403); expect(f.query).not.toHaveBeenCalled();
    const disabled = fixture(false); expect((await disabled.call()).code).toBe(503); expect(disabled.query).not.toHaveBeenCalled();
  });
  it('returns bounded records without customer contacts, secrets or mutations', async () => {
    const f = fixture(); const result = await f.call(); expect(result.body.orders).toHaveLength(50); expect(result.body.nextCursor).toBe('order-49'); expect(result.body.readOnly).toBe(true);
    const sql = f.query.mock.calls.find(([sql]) => sql.startsWith('SELECT id,listing_id'))![0];
    expect(sql).not.toContain('guest_phone'); expect(sql).not.toContain('guest_name'); expect(sql).toContain("state IN ('creating','review','expired')");
    expect(f.query.mock.calls.some(([sql]) => /^(UPDATE|DELETE|INSERT)/.test(sql))).toBe(false);
  });
  it('rejects malformed cursor before SQL', async () => { const f = fixture(); expect((await f.call('admin', 'bad')).code).toBe(400); expect(f.query).not.toHaveBeenCalled(); });
});
