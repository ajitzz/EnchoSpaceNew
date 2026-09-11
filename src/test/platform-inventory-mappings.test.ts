import { describe, expect, it, vi } from 'vitest';
import { createExternalInventoryMappingsRouter } from '../server/externalInventoryMappings';

const binding = { provider: 'fixture', connectionId: 'connection', providerPropertyId: 'property', providerRoomId: 'room' };
const version = 'bf5477dc-cee5-475a-9d77-e8a81be17601';
const body = { version: null, requestKey: 'bf5477dc-cee5-475a-9d77-e8a81be17602', reason: 'Reviewed room identity', binding };
function fixture(options: { enabled?: boolean; verified?: boolean; current?: boolean; auditFailure?: boolean; source?: string; prior?: any } = {}) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.startsWith('SELECT id,user_id,rooms')) return { rows: [{ id: 10, user_id: 7, rooms: [{ id: 'suite', inventory_source: options.source ?? 'external_sync' }] }] };
    if (sql.startsWith('SELECT * FROM external_inventory_current')) return { rows: options.current ? [{ mapping_id: 'old-mapping' }] : [] };
    if (sql.startsWith('SELECT id FROM external_inventory_mapping_events')) return { rows: options.current ? [{ id: version }] : [] };
    if (sql.startsWith('SELECT request_hash')) return { rows: options.prior ? [options.prior] : [] };
    if (options.auditFailure && sql.startsWith('INSERT INTO external_inventory_mapping_events')) throw new Error('Audit unavailable');
    return { rows: [] };
  });
  const verifyBinding = vi.fn(async () => options.verified ?? true);
  const router = createExternalInventoryMappingsRouter({ pool: { connect: async () => ({ query, release: vi.fn() }) } as any, authenticate: vi.fn(), enabled: () => options.enabled ?? true, verifyBinding });
  async function call(method = 'put', payload: any = body, role = 'admin', userId = 3) {
    const handler = (router.stack.find((item: any) => item.route?.methods[method]) as any).route.stack[0].handle;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ params: { listingId: '10', roomId: 'suite' }, user: { id: userId, role }, body: payload }, res);
    return res;
  }
  return { query, verifyBinding, call };
}
describe('inventory mapping lifecycle', () => {
  it('stays disabled before database access', async () => { const f = fixture({ enabled: false }); expect((await f.call()).code).toBe(503); expect(f.query).not.toHaveBeenCalled(); });
  it('denies host writes even for the listing owner', async () => { const f = fixture(); expect((await f.call('put', body, 'guest', 7)).code).toBe(403); expect(f.query).not.toHaveBeenCalled(); });
  it('allows owner reads, denies other owners and never authorizes checkout', async () => {
    const f = fixture(); expect((await f.call('get', undefined, 'guest', 8)).code).toBe(404);
    expect((await f.call('get', undefined, 'guest', 7)).body).toMatchObject({ state: 'unmapped', checkoutAuthorized: false, deliveryAuthorized: false });
  });
  it('creates mapping and audit in the listing-locked transaction', async () => {
    const f = fixture(); const result = await f.call(); expect(result.code).toBe(200);
    expect(result.body).toMatchObject({ state: 'mapped_not_synchronized', checkoutAuthorized: false });
    expect(f.verifyBinding).toHaveBeenCalledWith(expect.anything(), binding, 7, 10);
    const commands = f.query.mock.calls.map(([sql]) => sql);
    expect(commands.findIndex(sql => sql.includes('FOR UPDATE'))).toBeLessThan(commands.findIndex(sql => sql.startsWith('INSERT')));
    expect(commands.findIndex(sql => sql.startsWith('INSERT INTO external_inventory_mapping_events'))).toBeLessThan(commands.indexOf('COMMIT'));
  });
  it.each([{ verified: false }, { source: 'encho_allocation' }])('does not trust unverified binding/source %j', async options => {
    const f = fixture(options); expect((await f.call()).code).toBe(503);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('rejects stale revisions before verifying provider binding', async () => {
    const f = fixture({ current: true }); expect((await f.call()).code).toBe(409); expect(f.verifyBinding).not.toHaveBeenCalled();
  });
  it('revokes only the current pointer and retains immutable mapping evidence', async () => {
    const f = fixture({ current: true }); const { binding: _binding, ...revoke } = body;
    const result = await f.call('delete', { ...revoke, version }); expect(result.body).toMatchObject({ state: 'unmapped', mappingId: null });
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('DELETE')).every(([sql]) => sql.startsWith('DELETE FROM external_inventory_current'))).toBe(true);
    expect(f.verifyBinding).not.toHaveBeenCalled();
  });
  it('rolls back current-pointer change when audit fails', async () => {
    const f = fixture({ auditFailure: true }); expect((await f.call()).code).toBe(503);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('rejects reused retry keys with different content', async () => {
    const f = fixture({ prior: { request_hash: 'different' } }); expect((await f.call()).code).toBe(409);
    expect(f.verifyBinding).not.toHaveBeenCalled();
  });
  it('replays the same operation without inserting a second mapping', async () => {
    const options: { prior?: any } = {};
    const f = fixture(options); await f.call();
    const values = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO external_inventory_mapping_events'))![1]!;
    options.prior = { request_hash: values[9], id: values[0], mapping_id: values[6] };
    f.query.mockClear(); f.verifyBinding.mockClear();
    expect((await f.call()).body.replayed).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(f.verifyBinding).not.toHaveBeenCalled();
  });
  it('rejects host-injected verification fields and missing retry keys', async () => {
    const f = fixture(); expect((await f.call('put', { ...body, verified: true })).code).toBe(400);
    expect((await f.call('put', { ...body, requestKey: undefined })).code).toBe(400); expect(f.query).not.toHaveBeenCalled();
  });
});
