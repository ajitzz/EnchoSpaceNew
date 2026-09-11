import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCampaignReadiness, hasObservedLiveDelivery } from '../../lib/campaignReadiness';
import { scopeVersion } from '../server/campaignStayScope';

// Execute the real route/function in a dependency-injected harness, without importing
// the monolithic server (which starts database setup and external service clients).
const server = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('server.ts', server, ts.ScriptTarget.Latest, true);
function routeText(path: string) {
  const statement = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.arguments[0]?.getText(ast) === `'${path}'`);
  if (!statement) throw new Error(`Route missing: ${path}`);
  return statement.getText(ast);
}
function functionText(name: string) {
  const statement = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!statement) throw new Error(`Function missing: ${name}`);
  return statement.getText(ast).replace(/^export /, '');
}
function evaluate(source: string, dependencies: Record<string, unknown>, returnExpression = '') {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\n${returnExpression ? `return ${returnExpression};` : ''}`)(...Object.values(dependencies));
}

function fixture(overrides = {}) {
  let campaign = { id: 42, status: 'pending_approval', host_id: 7, admin_approved: false, policy_cleared: false, payment_status: 'unpaid', payment_intent_id: null, escrow_status: 'holding', budget: 1000, ...overrides };
  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM host_marketing_campaigns')) return { rows: [{ ...campaign }] };
      if (sql.includes('INSERT INTO operation_idempotency_keys')) return { rows: [{ idempotency_key: 'approval-key' }] };
      if (sql.includes('UPDATE host_marketing_campaigns SET')) campaign = { ...campaign, admin_approved: true, policy_cleared: true };
      return { rows: [] };
    }),
  };
  const pool = { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [{ ...campaign }] })) };
  const transitionCampaignState = vi.fn(async ({ to }) => { campaign = { ...campaign, status: to }; });
  const dispatchMetaCampaign = vi.fn(async () => true);
  const dispatchGoogleAdsCampaign = vi.fn(async () => true);
  const dependencies = { pool, transitionCampaignState, dispatchMetaCampaign, dispatchGoogleAdsCampaign, getCampaignReadiness, hasObservedLiveDelivery, broadcastDbEvent: vi.fn(), console: { log: vi.fn(), error: vi.fn() } };
  const executeCampaignStateMachine = evaluate(functionText('executeCampaignStateMachine'), dependencies, 'executeCampaignStateMachine');
  return { ...dependencies, client, executeCampaignStateMachine, campaign: () => campaign };
}

beforeEach(() => vi.restoreAllMocks());

describe('Actual admin approval route', () => {
  async function approve(overrides = {}, role = 'admin', body = {}) {
    const f = fixture(overrides);
    let handler: (req: unknown, res: unknown) => Promise<unknown>;
    evaluate(routeText('/api/admin/marketing/campaigns/:id/approve'), {
      ...f, app: { post: (_path: string, _auth: unknown, callback: typeof handler) => { handler = callback; } },
      authenticateToken: vi.fn(), isDbConfigured: true,
      scopeVersion,
      computeCampaignApprovalHash: () => ({ hash: 'review-hash', snapshot: {} }),
    });
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await handler!({ user: { id: 3, role }, params: { id: '42' }, headers: { 'x-idempotency-key': 'approval-key' }, body, ip: '127.0.0.1' }, res);
    return { ...f, res };
  }
  it('records approval without paying, releasing escrow or publishing', async () => {
    const result = await approve();
    expect(result.res.statusCode).toBe(200);
    expect(result.res.body.campaign).toMatchObject({ admin_approved: true, status: 'approved', payment_status: 'unpaid', escrow_status: 'holding' });
    expect(result.dispatchMetaCampaign).not.toHaveBeenCalled();
    expect(result.dispatchGoogleAdsCampaign).not.toHaveBeenCalled();
    const update = result.client.query.mock.calls.find(([sql]) => sql.includes('UPDATE host_marketing_campaigns SET'))?.[0];
    expect(update).not.toMatch(/payment_status\s*=|escrow_status\s*=|subscription_active\s*=/);
    expect(result.client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO admin_audit_logs'))).toBe(true);
  });
  it('requires exact scope acknowledgement before approval or idempotency claim', async () => {
    const scope = { checkIn: '2090-04-01', checkOut: '2090-04-04', roomIds: ['garden'] };
    const stale = await approve({ stay_scope: scope }, 'admin', { reviewed_scope_version: 'stale' });
    expect(stale.res.statusCode).toBe(409);
    expect(stale.client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO operation_idempotency_keys'))).toBe(false);
    const accepted = await approve({ stay_scope: scope }, 'admin', { reviewed_scope_version: scopeVersion(scope) });
    expect(accepted.res.statusCode).toBe(200);
    expect(accepted.dispatchMetaCampaign).not.toHaveBeenCalled();
  });
  it('keeps a paid campaign in escrow until independent release', async () => {
    const result = await approve({ payment_status: 'paid', payment_intent_id: 'payment-real' });
    expect(result.res.body.readiness.canPublish).toBe(false);
    expect(result.dispatchMetaCampaign).not.toHaveBeenCalled();
  });
  it('only dispatches after approved, paid and released records coexist', async () => {
    const result = await approve({ payment_status: 'paid', payment_intent_id: 'payment-real', escrow_status: 'released' });
    expect(result.dispatchMetaCampaign).toHaveBeenCalledOnce();
    expect(result.campaign().status).toBe('META_API_PUSH');
    expect(result.res.body.message).not.toContain('dispatched live');
  });
  it('denies hosts before opening a database connection', async () => {
    const result = await approve({}, 'host');
    expect(result.res.statusCode).toBe(403);
    expect(result.pool.connect).not.toHaveBeenCalled();
  });
  it('rejects an unsubmitted draft', async () => {
    const result = await approve({ status: 'draft' });
    expect(result.res.statusCode).toBe(409);
    expect(result.dispatchMetaCampaign).not.toHaveBeenCalled();
  });
});

describe('Actual state-machine dispatch entry point', () => {
  it.each(['ADMIN_APPROVE', 'MANUAL_DISPATCH', 'PAYMENT_SUCCESS'])('%s cannot bypass persisted admin approval', async event => {
    const f = fixture({ status: 'approved', admin_approved: false, policy_cleared: true, payment_status: 'paid', payment_intent_id: 'payment-real', escrow_status: 'released' });
    await f.executeCampaignStateMachine(42, event, { user: { id: 3, role: 'admin' } });
    expect(f.dispatchMetaCampaign).not.toHaveBeenCalled();
    expect(f.dispatchGoogleAdsCampaign).not.toHaveBeenCalled();
    expect(f.transitionCampaignState).not.toHaveBeenCalled();
  });
  it('does not forcibly republish an already-running campaign', async () => {
    const f = fixture({ status: 'CAMPAIGN_LIVE', admin_approved: true, policy_cleared: true, payment_status: 'paid', payment_intent_id: 'payment-real', escrow_status: 'released' });
    await f.executeCampaignStateMachine(42, 'MANUAL_DISPATCH', { user: { role: 'admin' } });
    expect(f.dispatchMetaCampaign).not.toHaveBeenCalled();
  });
});
