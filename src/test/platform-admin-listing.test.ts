import { describe, expect, it, vi } from 'vitest';
import { createAdminListingUpdateHandler } from '../server/adminListingUpdate';

function fixture(failAt = '') {
  const previous = { id: 42, user_id: 7, title: 'Garden Villa', price: '1500', currency: 'INR', host_philosophy: 'Original host description' };
  const updated = { ...previous, title: 'Updated Villa' };
  const query = vi.fn(async (sql: string, _values: any[] = []) => {
    if (failAt && sql.startsWith(failAt)) throw new Error('Injected persistence failure');
    if (sql.startsWith('SELECT * FROM listings')) return { rows: [previous] };
    if (sql.startsWith('UPDATE listings SET')) return { rows: [updated] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const afterUpdate = vi.fn(async () => undefined);
  const handler = createAdminListingUpdateHandler({ pool: pool as any, enabled: () => true, afterUpdate });
  async function call(body: any, role = 'admin') {
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(data: any) { this.body = data; return this; } };
    await handler({ user: { id: 3, role }, params: { id: '42' }, ip: '127.0.0.1', body } as any, res as any, vi.fn());
    return res;
  }
  return { query, pool, afterUpdate, call, client, previous, updated };
}
describe('Admin property editing transaction', () => {
  it('rejects unsupported inventory source declarations', async () => {
    const f = fixture(); expect((await f.call({ rooms: [{ id: 'garden', name: 'Garden', price: 1000, capacity: 2, inventory_count: 1, inventory_source: 'verified_provider' }] })).statusCode).toBe(400);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('rejects dropping existing IDs before updating the canonical listing', async () => {
    const f = fixture();
    Object.assign(f.previous, { rooms: [{ id: 'existing-room', inventory_count: 1 }] });
    expect((await f.call({ rooms: [{ id: 'new-room', name: 'Garden', price: 1000, capacity: 2, inventory_count: 0 }] })).statusCode).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE listings SET'))).toBe(false);
  });
  it('rejects a host before connecting', async () => {
    const f = fixture(); expect((await f.call({ title: 'Updated Villa' }, 'guest')).statusCode).toBe(403);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('updates only supplied fields and audits full before/after state', async () => {
    const f = fixture(); expect((await f.call({ title: 'Updated Villa' })).statusCode).toBe(200);
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE listings SET'));
    expect(update?.[0]).toBe('UPDATE listings SET title=$1 WHERE id=$2 RETURNING *');
    const audit = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'));
    expect(JSON.parse(audit![1][4])).toEqual(f.previous);
    expect(JSON.parse(audit![1][5])).toEqual(f.updated);
    const commitIndex = f.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT');
    expect(f.afterUpdate.mock.invocationCallOrder[0]).toBeGreaterThan(f.query.mock.invocationCallOrder[commitIndex]);
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('preserves zero inventory and IDs without recreating normalized rooms', async () => {
    const f = fixture(); const response = await f.call({ rooms: [{ id: 'room-one', name: 'Garden', price: 1000, capacity: 2, inventory_count: 0 }] });
    expect(response.statusCode).toBe(200);
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE listings SET'))!;
    expect(JSON.parse(update[1][0])[0]).toMatchObject({ id: 'room-one', inventory_count: 0 });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM room_types') || sql.startsWith('INSERT INTO room_types'))).toBe(false);
  });
  it.each(['UPDATE listings SET', 'INSERT INTO admin_audit_logs'])('rolls back on %s failure and never schedules provider work', async failAt => {
    const f = fixture(failAt);
    expect((await f.call({ rooms: [{ id: 'room-one', name: 'Garden', price: 1000, capacity: 2, inventory_count: 1 }] })).statusCode).toBe(503);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT');
    expect(f.afterUpdate).not.toHaveBeenCalled();
  });
  it.each([{ price: -1 }, { price: null }, { rooms: 'not-json' }, { lat: 100 }, { unexpected: 'value' }])('rejects invalid patches before connecting: %j', async body => {
    const f = fixture(); expect((await f.call(body)).statusCode).toBe(400); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('does not claim provider synchronization', async () => {
    const f = fixture(); expect((await f.call({ price: 1500 })).body.providerSync).toBe('unverified');
  });
});
