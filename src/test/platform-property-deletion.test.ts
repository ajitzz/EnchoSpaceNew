import { describe, expect, it, vi } from 'vitest';
import { createPropertyDeletionHandler } from '../server/propertyDeletion';

function fixture({ history = false, checkout = false, fail = '', owner = 7 } = {}) {
  const query = vi.fn(async (sql: string, _values: any[] = []) => {
    if (fail && sql.startsWith(fail)) throw new Error('Injected failure');
    if (sql.startsWith('SELECT * FROM listings')) return { rows: [{ id: 42, user_id: owner, title: 'Garden Villa' }] };
    if (sql.startsWith('SELECT EXISTS')) return { rows: [{ present: history }] };
    if (sql.includes('to_regclass')) return { rows: [{ relation: checkout ? 'stay_checkout_orders' : null }] };
    if (sql.startsWith('SELECT 1 FROM stay_checkout_orders')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const afterDelete = vi.fn();
  const handler = createPropertyDeletionHandler({ pool: pool as any, enabled: () => true, afterDelete });
  async function call(id = '42', role = 'guest') {
    const res = { statusCode: 200, body: null as any, status(n: number) { this.statusCode = n; return this; }, json(body: any) { this.body = body; return this; } };
    await handler({ user: { id: 7, role }, params: { id }, ip: '127.0.0.1' } as any, res as any, vi.fn());
    return res;
  }
  return { query, pool, afterDelete, call };
}
describe('History-preserving property removal', () => {
  it.each(['demo', '0', '-1', '2147483648'])('rejects invalid IDs before SQL: %s', async id => {
    const f = fixture(); expect((await f.call(id)).statusCode).toBe(400); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('checks ownership under the property lock', async () => {
    const f = fixture({ owner: 8 }); expect((await f.call()).statusCode).toBe(403);
    expect(f.query).toHaveBeenCalledWith('SELECT * FROM listings WHERE id=$1 FOR UPDATE', ['42']);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  });
  it.each([{ history: true }, { checkout: true }])('preserves operational records: %j', async options => {
    const f = fixture(options); expect((await f.call()).statusCode).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    expect(f.afterDelete).not.toHaveBeenCalled();
  });
  it('snapshots unused property data and commits before notification', async () => {
    const f = fixture({ owner: 8 }); expect((await f.call('42', 'admin')).statusCode).toBe(200);
    const audit = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'))!;
    expect(JSON.parse(audit[1][4]).listing.id).toBe(42);
    const commit = f.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT');
    expect(f.afterDelete.mock.invocationCallOrder[0]).toBeGreaterThan(f.query.mock.invocationCallOrder[commit]);
  });
  it.each(['INSERT INTO admin_audit_logs', 'DELETE FROM listings'])('rolls back %s failures without notifying', async fail => {
    const f = fixture({ fail }); expect((await f.call()).statusCode).toBe(503);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT');
    expect(f.afterDelete).not.toHaveBeenCalled();
  });
});
