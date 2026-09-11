import { describe, expect, it, vi } from 'vitest';
import { canEditStayScope, createCampaignStayScopeRouter, scopeVersion, validateStayScope } from '../server/campaignStayScope';
const scope = { checkIn: '2090-04-01', checkOut: '2090-04-04', roomIds: ['garden'] };
function fixture(status = 'draft', failAudit = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT * FROM host_marketing_campaigns')) return { rows: [{ id: 5, host_id: 7, listing_id: 42, status, stay_scope: null }] };
    if (sql.includes('SELECT id, user_id, rooms')) return { rows: [{ id: 42, user_id: 7, rooms: [{ id: 'garden', name: 'Garden' }] }] };
    if (failAudit && sql.startsWith('INSERT INTO admin_audit_logs')) throw new Error('Audit failed');
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const router = createCampaignStayScopeRouter({ pool: { connect: async () => client } as any, authenticate: vi.fn(), enabled: () => true });
  async function call(userId = 7, version = scopeVersion(null)) {
    const route = router.stack.find((layer: any) => layer.route?.methods.put) as any;
    const res = { code: 200, body: null as any, status(n: number) { this.code = n; return this; }, json(v: any) { this.body = v; return this; } };
    await route.route.stack[0].handle({ params: { id: '5' }, user: { id: userId, role: 'guest' }, body: { scope, version }, ip: '127.0.0.1' }, res);
    return res;
  }
  return { call, query };
}
describe('Reviewed campaign stay scope', () => {
  it.each(['meta_campaign_id', 'google_campaign_id', 'meta_adset_id', 'meta_ad_id'])('blocks draft edits with persisted %s', field => expect(canEditStayScope({ status: 'draft', [field]: 'provider-reference' })).toBe(false));
  it.each([{ ...scope, checkOut: scope.checkIn }, { ...scope, roomIds: ['foreign'] }, { ...scope, roomIds: ['garden', 'garden'] }])('rejects invalid scope %j', value => expect(() => validateStayScope(value, [{ id: 'garden' }])).toThrow());
  it('saves only canonical property room IDs with audit before commit', async () => {
    const f = fixture(); const r = await f.call(); expect(r.code).toBe(200); expect(r.body.scope).toEqual(scope); expect(r.body.externalAvailability).toBe('unknown');
    expect(f.query.mock.calls.findIndex(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'))).toBeLessThan(f.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT'));
  });
  it('rejects foreign owners', async () => { const f = fixture(); expect((await f.call(8)).code).toBe(404); expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false); });
  it('rejects stale edits', async () => expect((await fixture().call(7, 'stale')).code).toBe(409));
  it.each(['pending_approval', 'approved', 'active'])('does not change scope in %s', async state => expect((await fixture(state).call()).code).toBe(409));
  it('rolls back audit failure', async () => { const f = fixture('draft', true); expect((await f.call()).code).toBe(503); expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT'); });
});
