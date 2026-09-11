import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const route = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'app.post' && node.expression.arguments[0]?.getText(ast) === "'/api/listings/:id/calendar'");
if (!route) throw new Error('Calendar route missing');
const compiled = ts.transpileModule(route.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function run({ owner = 7, role = 'guest', body = {}, failAudit = false } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT user_id')) return { rows: [{ user_id: owner }] };
    if (sql.startsWith('INSERT INTO admin_audit_logs') && failAudit) throw new Error('Audit unavailable');
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const pause = vi.fn(async () => undefined);
  let handler: any;
  new Function('app', 'authenticateToken', 'isDbConfigured', 'pool', 'triggerSmartAutoPause', 'console', compiled)(
    { post: (_path: string, _auth: any, fn: any) => { handler = fn; } }, vi.fn(), true, pool, pause, { error: vi.fn() },
  );
  const res = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json: vi.fn() };
  await handler({ params: { id: '42' }, user: { id: 7, role }, ip: '127.0.0.1', body: { dates: ['2026-12-01'], price: 0, status: 'blocked', ...body } }, res);
  return { query, client, pool, pause, res };
}

describe('Calendar mutation boundary', () => {
  it('denies another host without writing calendar or audit data', async () => {
    const f = await run({ owner: 8 });
    expect(f.res.statusCode).toBe(404);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
    expect(f.pause).not.toHaveBeenCalled();
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it.each([{ dates: ['2026-02-30'] }, { dates: [] }, { price: -1 }, { price: '100' }, { status: 'unknown' }, { offer_id: 0 }])('rejects invalid input before connecting: %j', async body => {
    const f = await run({ body });
    expect(f.res.statusCode).toBe(400);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('allows the owner and audits before commit and post-commit pause', async () => {
    const f = await run();
    expect(f.res.statusCode).toBe(200);
    const sql = f.query.mock.calls.map(([q]) => q);
    expect(sql.findIndex(q => q.startsWith('INSERT INTO admin_audit_logs'))).toBeLessThan(sql.indexOf('COMMIT'));
    expect(f.pause).toHaveBeenCalledOnce();
    expect(f.query.mock.invocationCallOrder[sql.indexOf('COMMIT')]).toBeLessThan(f.pause.mock.invocationCallOrder[0]);
  });
  it('permits an admin to edit another owner property', async () => {
    expect((await run({ owner: 8, role: 'admin' })).res.statusCode).toBe(200);
  });
  it('rolls back a batch when auditing fails and does not invoke advertising', async () => {
    const f = await run({ failAudit: true, body: { dates: ['2026-12-01', '2026-12-02'] } });
    expect(f.res.statusCode).toBe(500);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK');
    expect(f.query).not.toHaveBeenCalledWith('COMMIT');
    expect(f.pause).not.toHaveBeenCalled();
  });
});
