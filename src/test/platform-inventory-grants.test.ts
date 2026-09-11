import { describe, expect, it, vi } from 'vitest';
import { createInventoryConnectionGrantsRouter } from '../server/inventoryConnectionGrants';
const key = '028cfa5d-64cb-4679-872d-9c3d51ec8bc3';
const body = { ownerId: 7, requestKey: key, provider: 'fixture', connectionId: 'connection', providerPropertyId: 'property', authorizationReference: 'review-record-1', expiresAt: '2090-01-01T00:00:00Z' };
function fixture(options: { enabled?: boolean; validTime?: boolean; duplicate?: boolean; prior?: any; revoked?: any; failure?: boolean } = {}) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.startsWith('SELECT id,user_id')) return { rows: [{ id: 10, user_id: 7 }] };
    if (sql.startsWith('SELECT id,request_hash')) return { rows: options.prior ? [options.prior] : [] };
    if (sql.startsWith('SELECT $1::timestamptz')) return { rows: [{ valid: options.validTime ?? true }] };
    if (sql.startsWith('SELECT g.id')) return { rows: options.duplicate ? [{ id: key }] : [] };
    if (sql.startsWith('SELECT id FROM inventory_connection_grants')) return { rows: [{ id: key }] };
    if (sql.startsWith('SELECT actor_id,reason')) return { rows: options.revoked ? [options.revoked] : [] };
    if (options.failure && sql.startsWith('INSERT')) throw new Error('Write failed');
    return { rows: [] };
  });
  const router = createInventoryConnectionGrantsRouter({ pool: { connect: async () => ({ query, release: vi.fn() }) } as any, authenticate: vi.fn(), enabled: () => options.enabled ?? true });
  async function call(payload: any = body, revoke = false, role = 'admin') {
    const layer = router.stack.find((item: any) => item.route?.path === (revoke ? '/:listingId/grants/:grantId/revoke' : '/:listingId/grants')) as any;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await layer.route.stack[0].handle({ user: { id: 3, role }, params: { listingId: '10', grantId: key }, body: payload }, res); return res;
  }
  return { call, query };
}
describe('Admin inventory business authorization', () => {
  it('requires enabled rollout and Admin before database access', async () => {
    const off = fixture({ enabled: false }); expect((await off.call()).code).toBe(503); expect(off.query).not.toHaveBeenCalled();
    const host = fixture(); expect((await host.call(body, false, 'guest')).code).toBe(403); expect(host.query).not.toHaveBeenCalled();
  });
  it('records authorization but never provider evidence or sales permission', async () => {
    const f = fixture(); expect((await f.call()).body).toMatchObject({ providerVerified: false, checkoutAuthorized: false });
    const commands = f.query.mock.calls.map(([sql]) => sql);
    expect(commands.findIndex(sql => sql.includes('FOR UPDATE'))).toBeLessThan(commands.findIndex(sql => sql.includes('pg_advisory_xact_lock')));
    expect(commands.filter(sql => sql.startsWith('INSERT')).every(sql => sql.startsWith('INSERT INTO inventory_connection_grants'))).toBe(true);
    expect(commands.at(-1)).toBe('COMMIT');
  });
  it('rejects stale ownership and invalid lifetime', async () => {
    expect((await fixture().call({ ...body, ownerId: 8 })).code).toBe(409);
    expect((await fixture({ validTime: false }).call()).code).toBe(400);
  });
  it('rejects an existing provider-property authorization', async () => {
    const f = fixture({ duplicate: true }); expect((await f.call()).code).toBe(409); expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('replays identical retry keys without another grant', async () => {
    const options: { prior?: any } = {}; const f = fixture(options); await f.call();
    const values = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT'))![1]!;
    options.prior = { id: values[0], request_hash: values[10] }; f.query.mockClear();
    expect((await f.call()).body.replayed).toBe(true); expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect((await f.call({ ...body, authorizationReference: 'different' })).code).toBe(409);
  });
  it('revokes under the listing lock without deleting records or attestations', async () => {
    const f = fixture(); expect((await f.call({ reason: 'Access withdrawn' }, true)).body.revoked).toBe(true);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT')).every(([sql]) => sql.startsWith('INSERT INTO inventory_connection_revocations'))).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  });
  it('preserves original revocation on repeated or conflicting requests', async () => {
    const f = fixture({ revoked: { actor_id: 3, reason: 'Withdrawn' } });
    expect((await f.call({ reason: 'Withdrawn' }, true)).body.replayed).toBe(true);
    expect((await f.call({ reason: 'Different' }, true)).code).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('rolls back storage errors and rejects injected verification', async () => {
    const f = fixture({ failure: true }); expect((await f.call()).code).toBe(503); expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT');
    expect((await fixture().call({ ...body, providerVerified: true })).code).toBe(400);
  });
});
