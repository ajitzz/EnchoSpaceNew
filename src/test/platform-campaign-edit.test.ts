import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { canEditStayScope } from '../server/campaignStayScope';
const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const route = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'app.put' && node.expression.arguments[0]?.getText(ast) === "'/api/marketing/campaigns/:id'")!;
const code = ts.transpileModule(route.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(overrides = {}, fail = '') {
  const previous = { id: 5, host_id: 7, listing_id: 42, status: 'draft', title: 'Original', policy_cleared: true, ...overrides };
  const query = vi.fn(async (sql: string) => {
    if (fail && sql.startsWith(fail)) throw new Error('Injected failure');
    if (sql.startsWith('SELECT * FROM host_marketing_campaigns')) return { rows: [previous] };
    if (sql.includes('UPDATE host_marketing_campaigns')) return { rows: [{ ...previous, title: 'Edited', policy_cleared: false }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), query: vi.fn(() => { throw new Error('Query outside transaction'); }) };
  const transition = vi.fn(); const broadcast = vi.fn(); let handler: any;
  const dependencies = { app: { put: (_path: string, _auth: any, h: any) => { handler = h; } }, authenticateToken: vi.fn(), isDbConfigured: true, pool, campaignUpdateSchema: { safeParse: (data: any) => ({ success: true, data }) }, canEditStayScope, transitionCampaignState: transition, broadcastDbEvent: broadcast, console: { error: vi.fn() } };
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  async function call(body: any = { title: 'Edited', video_url: 'https://example.com/video.mp4' }) {
    const res = { code: 200, status(n: number) { this.code = n; return this; }, json: vi.fn() };
    await handler({ params: { id: '5' }, user: { id: 7, role: 'guest' }, body, ip: '127.0.0.1' }, res); return res;
  }
  return { call, query, pool, broadcast, transition };
}
describe('Atomic draft campaign editing', () => {
  it('locks before reading and never publishes property video', async () => {
    const f = fixture(); expect((await f.call()).code).toBe(200);
    expect(f.query.mock.calls[0][0]).toBe('BEGIN');
    expect(f.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(f.pool.query).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE listings'))).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'))).toBe(true);
  });
  it.each([{ status: 'approved' }, { status: 'active' }, { meta_campaign_id: 'provider-id' }, { admin_approved: true }])('blocks protected campaigns: %j', async campaign => {
    const f = fixture(campaign); expect((await f.call()).code).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE host_marketing_campaigns'))).toBe(false);
  });
  it('cannot request activation through generic status edits', async () => {
    const f = fixture(); expect((await f.call({ status: 'active' })).code).toBe(409); expect(f.transition).not.toHaveBeenCalled();
  });
  it('rolls back audit failures and emits no success event', async () => {
    const f = fixture({}, 'INSERT INTO admin_audit_logs'); expect((await f.call()).code).toBe(500);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT'); expect(f.broadcast).not.toHaveBeenCalled();
  });
});
