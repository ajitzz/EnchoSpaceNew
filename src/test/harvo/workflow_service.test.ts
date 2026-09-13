import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createWorkflowPgFixture, workflowConfig, workflowDraft, workflowPolicy } from './workflowPgFixture.js';
import { MarketingWorkflowService } from '../../lib/marketing/workflow.js';
import { WorkflowFinance } from '../../lib/marketing/financeBridge.js';
import { CampaignAiReviewer } from '../../lib/marketing/ai.js';
import type { CampaignPaymentGateway } from '../../lib/marketing/payments.js';
import { MarketingFinanceService, type VerifiedCapture } from '../../lib/marketing/financeService.js';
import { inTransaction } from '../../lib/marketing/database.js';
import { enqueue, MarketingJobQueue } from '../../lib/marketing/jobs.js';
import { calculateCampaignCosts, readMarketingConfig } from '../../lib/marketing/config.js';
import type { Actor } from '../../lib/marketing/domain.js';

const host: Actor = { id: 10, role: 'host' }, other: Actor = { id: 11, role: 'host' }, admin: Actor = { id: 90, role: 'admin' };
describe('HARVO workflow with real PostgreSQL financial authority', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>;
  let service: MarketingWorkflowService, bridge: WorkflowFinance, finance: MarketingFinanceService;
  const generate = vi.fn(async () => JSON.stringify({ score: 9, verdict: 'PASS', notes: ['Actual property copy and selected approved image reviewed.'], suggestions: [] }));
  const loadImage = vi.fn(async () => ({ data: Buffer.from('isolated image verifier result'), mimeType: 'image/jpeg', width: 1200, height: 1200 }));
  const checkout = vi.fn(async () => ({ url: 'https://checkout.stripe.com/isolated-test', status: 'AWAITING_CAPTURE' }));
  const verifyCapture = vi.fn(async (e: unknown) => e as VerifiedCapture);
  beforeAll(async () => { fixture = await createWorkflowPgFixture(); });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.reset(); generate.mockReset().mockResolvedValue(JSON.stringify({ score: 9, verdict: 'PASS', notes: ['Actual property copy and selected approved image reviewed.'], suggestions: [] }));
    checkout.mockClear(); loadImage.mockClear(); verifyCapture.mockReset().mockImplementation(async e => e as VerifiedCapture);
    await new MarketingFinanceService(fixture.pool, { actorContext: admin }).persistPolicy(workflowPolicy, admin.id);
    finance = new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'system' }, fundingEnabled: true, verifyCapture });
    bridge = new WorkflowFinance(fixture.pool, structuredClone(workflowConfig), { checkout } as unknown as CampaignPaymentGateway);
    service = new MarketingWorkflowService(fixture.pool, { ai: new CampaignAiReviewer({ model: 'isolated-reviewer', mediaOrigins: new Set(workflowConfig.mediaOrigins), generate, loadImage }), finance: bridge, publishingEnabled: true, activationEnabled: true, fundingEnabled: true, configurationReasons: [] });
  });
  async function approved(extra: Record<string, unknown> = {}) {
    const row = await service.create(host, workflowDraft(extra));
    await service.evaluate(row.campaign_id, host, 1);
    await service.submit(row.campaign_id, host, 1);
    return service.review(row.campaign_id, admin, { revision: 1, decision: 'APPROVE', note: 'Reviewed actual media, rights and provider policy.', policyConfirmed: true, mediaConfirmed: true });
  }
  async function quoted() { const row = await approved(); return service.quote(row.campaign_id, host, 1, 'quote-request'); }
  async function capture(row: any, ageHours = 25) {
    const q = (await fixture.pool.query('SELECT total_minor FROM marketing_finance_quotes WHERE id=$1', [row.quote_id])).rows[0];
    return finance.recordVerifiedCapture({ provider: 'RAZORPAY', accountId: 'isolated-recipient', eventId: `event-${row.campaign_id}`, paymentId: `payment-${row.campaign_id}`, orderId: `order-${row.campaign_id}`, quoteId: row.quote_id, currency: 'INR', amountMinor: q.total_minor, payloadHash: 'a'.repeat(64), capturedAt: new Date(Date.now() - ageHours * 3600000).toISOString() });
  }
  it('runs draft → evidence AI → explicit admin → additive quote → verified capture → reserved paused-publication job', async () => {
    const row = await quoted();
    expect(generate).toHaveBeenCalledOnce(); expect(loadImage).toHaveBeenCalledOnce();
    const initial = await service.project(row);
    expect(initial.quote).toMatchObject({ costMinor: '100000', profitMinor: '5000', totalMinor: '105000', markupPercent: 5 });
    expect(initial.funding).toMatchObject({ status: 'AWAITING_CAPTURE', released: false });
    await expect(service.fund(row.campaign_id, host, 1, 'checkout')).resolves.toMatchObject({ status: 'AWAITING_CAPTURE' });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
    await capture(row);
    const result = await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'publish');
    expect(result.state).toBe('PUBLISH_QUEUED');
    expect((await service.project(await service.get(row.campaign_id, host))).funding).toMatchObject({ status: 'RESERVED', capturedMinor: '105000', reservedMinor: '105000', released: true });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT kind,state FROM marketing_jobs')).rows).toEqual([{ kind: 'PUBLISH', state: 'PENDING' }]);
    expect((await fixture.pool.query("SELECT event_type FROM marketing_workflow_events WHERE event_type='ADMIN_CONTENT_REVIEW'")).rows).toHaveLength(1);
  });
  it('authenticated administrator approval and checkout return never manufacture captured or spendable money', async () => {
    const row = await quoted();
    await service.fund(row.campaign_id, host, 1, 'checkout');
    await expect(service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'bypass')).rejects.toMatchObject({ code: 'FINANCE_INSUFFICIENT_FUNDS' });
    const f = await bridge.snapshot(row); expect(f.funding).toMatchObject({ status: 'AWAITING_CAPTURE', released: false });
    for (const table of ['marketing_finance_captures', 'marketing_finance_reservations', 'marketing_finance_authorizations', 'marketing_jobs']) expect((await fixture.pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    const adminMoney = new MarketingFinanceService(fixture.pool, { actorContext: admin });
    await expect(adminMoney.recordVerifiedCapture({ verified: true, paymentStatus: 'PAID' })).rejects.toMatchObject({ code: 'FINANCE_FUNDING_DISABLED' });
  });
  it.each(['status', 'paymentStatus', 'providerCampaignId', 'externalCampaignId', 'contentApproval', 'funding', 'ai', 'hostId'])('rejects host-supplied authority field %s', async field => {
    await expect(service.create(host, workflowDraft({ [field]: 'CLIENT_APPROVED' }))).rejects.toThrow();
    expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toHaveLength(0);
  });
  it('holds newly captured funds for 24 hours while permitting only paused hierarchy preparation', async () => {
    const row = await quoted(); await capture(row, 1);
    await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'prepare');
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED' WHERE campaign_id=$1", [row.campaign_id]);
    await expect(service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'spend')).rejects.toMatchObject({ code: 'RISK_HOLD' });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toHaveLength(0);
  });
  it('issues exact provider spend authority only after capture hold and explicit activation', async () => {
    vi.stubEnv('META_AD_ACCOUNT_ID', 'act_987654321');
    try {
      const row = await quoted(); await capture(row); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'prepare');
      await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED' WHERE campaign_id=$1", [row.campaign_id]);
      await service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'spend');
      expect((await fixture.pool.query('SELECT provider,account_id,media_minor FROM marketing_finance_authorizations')).rows).toEqual([{ provider: 'META', account_id: '987654321', media_minor: '90000' }]);
      await service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'spend');
      expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toHaveLength(1);
      expect((await fixture.pool.query("SELECT * FROM marketing_jobs WHERE kind='ACTIVATE'")).rows).toHaveLength(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it('preserves quoted 5% terms while prospective administrator policy applies 3% to new campaigns', async () => {
    const first = await quoted();
    await bridge.setMarkup(90, { markupPercent: 3, expectedVersion: 0, reason: 'Initial founder-approved launch markup.' });
    const second = await quoted();
    const q1 = await bridge.snapshot(first), q2 = await bridge.snapshot(second);
    expect(q1.quote).toMatchObject({ profitMinor: '5000', totalMinor: '105000' });
    expect(q2.quote).toMatchObject({ profitMinor: '3000', totalMinor: '103000' });
    expect((await bridge.quote(first, 'retry')).id).toBe(first.quote_id);
    await expect(bridge.setMarkup(90, { markupPercent: 4, expectedVersion: 0, reason: 'A stale policy version request.' })).rejects.toMatchObject({ code: 'POLICY_VERSION_CONFLICT' });
  });
  it('invalidates AI and admin approval on a content revision and rejects stale writes', async () => {
    const row = await approved(); const updated = await service.update(row.campaign_id, host, 1, workflowDraft({ headline: 'Choose your villa stay' }));
    expect(updated).toMatchObject({ revision: 2, state: 'DRAFT', ai: { status: 'NOT_EVALUATED' }, content_approval: { status: 'PENDING' } });
    await expect(service.review(row.campaign_id, admin, { revision: 1, decision: 'APPROVE', note: 'This is stale approval evidence.', mediaConfirmed: true, policyConfirmed: true })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(service.quote(row.campaign_id, host, 1, 'stale')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await fixture.pool.query('SELECT * FROM marketing_campaign_revisions')).rows).toHaveLength(2);
    await expect(fixture.pool.query("UPDATE marketing_campaign_revisions SET draft='{}'")).rejects.toThrow(/append-only/);
  });
  it('rejects changed listing evidence before admin approval and unapproved media before creation', async () => {
    await expect(service.create(host, workflowDraft({ mediaIds: ['102'] }))).rejects.toMatchObject({ code: 'MEDIA_NOT_APPROVED' });
    await expect(service.create(host, workflowDraft({ mediaIds: ['101'] }))).rejects.toMatchObject({ code: 'MEDIA_NOT_APPROVED' });
    const row = await service.create(host, workflowDraft()); await service.evaluate(row.campaign_id, host, 1);
    await fixture.pool.query('UPDATE listings SET price=7000 WHERE id=20');
    await expect(service.review(row.campaign_id, admin, { revision: 1, decision: 'APPROVE', note: 'Trying stale price evidence.', policyConfirmed: true, mediaConfirmed: true })).rejects.toMatchObject({ code: 'LISTING_CHANGED' });
  });
  it('blocks changed property from publication and dispatches no provider job', async () => {
    const row = await quoted(); await capture(row); await fixture.pool.query('UPDATE listings SET price=7000 WHERE id=20');
    await expect(service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'stale-listing')).rejects.toMatchObject({ code: 'LISTING_CHANGED' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT available_minor,reserved_minor FROM marketing_finance_accounts WHERE host_id=10')).rows).toEqual([{ available_minor: '105000', reserved_minor: '0' }]);
  });
  it('projects returned reservations as closed funding rather than spendable reserved money', async () => {
    const row = await quoted(); await capture(row); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'prepare');
    const saved = await service.get(row.campaign_id, host);
    const settlement = new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'system' }, verifySettlement: async () => ({ reservationId: saved.reservation_id, evidenceId: 'isolated-final-release', evidenceHash: 'b'.repeat(64), closedAuthorizations: [], costs: workflowPolicy.costCodes.map(c => ({ code: c.code, amountMinor: '0' })), remittanceTaxMinor: '0', finalAt: new Date().toISOString() }) });
    await settlement.release({});
    const projection = await bridge.snapshot(saved);
    expect(projection.funding.status).not.toBe('RESERVED');
    expect(projection.funding.released).toBe(false);
    expect(projection.funding.reservedMinor).toBe('0');
  });
  it('does not report refunded captured money as ready to spend before a reservation exists', async () => {
    const row = await quoted(); const captured = await capture(row);
    const hostFinance = new MarketingFinanceService(fixture.pool, { actorContext: host });
    await hostFinance.requestRefund({ captureId: captured.captureId, hostId: 10, amountMinor: '105000', idempotencyKey: 'return-unreserved-funding' });
    const pending = await bridge.snapshot(row);
    expect(pending.funding.released).toBe(false);
    expect(pending.funding.status).not.toBe('CAPTURED');
  });
  it('atomically queues an original-payment refund once and exposes only the actual refundable balance', async () => {
    const row = await quoted(); await capture(row);
    expect((await bridge.snapshot(row)).funding.refundableMinor).toBe('105000');
    const results = await Promise.all(Array.from({ length: 8 }, () => bridge.requestRefund(row, host, '105000', 'same-refund-request')));
    expect(new Set(results.map(r => r.refundRequestId)).size).toBe(1);
    expect(results.every(r => r.status === 'REQUESTED')).toBe(true);
    expect((await fixture.pool.query("SELECT kind,payload FROM marketing_jobs WHERE kind='REFUND'")).rows).toEqual([{ kind: 'REFUND', payload: { refundRequestId: results[0].refundRequestId } }]);
    expect((await bridge.snapshot(row)).funding).toMatchObject({ refundableMinor: '0', pendingRefundMinor: '105000', released: false, status: 'REFUND_PENDING' });
    await expect(bridge.requestRefund(row, host, '100000', 'same-refund-request')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('does not release a paused campaign reservation without verified final spending evidence', async () => {
    const row = await quoted(); await capture(row); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'prepare');
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSED' WHERE campaign_id=$1", [row.campaign_id]);
    expect((await bridge.snapshot(row)).funding.refundableMinor).toBe('0');
    await expect(bridge.requestRefund(row, host, '1', 'pause-is-not-finality')).rejects.toMatchObject({ code: 'REFUND_FUNDS_UNAVAILABLE' });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_refunds')).rows).toHaveLength(0);
  });
  it('records the host refund reason immutably and binds idempotent replay to that exact reason', async () => {
    const row = await quoted(); await capture(row); const reason = 'The property is unavailable for the planned promotion.';
    const result = await bridge.requestRefund(row, host, '50000', 'reason-bound-refund', reason);
    expect((await bridge.requestRefund(row, host, '50000', 'reason-bound-refund', reason)).refundRequestId).toBe(result.refundRequestId);
    await expect(bridge.requestRefund(row, host, '50000', 'reason-bound-refund', 'A different refund justification.')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const audit = (await fixture.pool.query("SELECT evidence FROM marketing_workflow_events WHERE event_type='CAMPAIGN_REFUND_REQUESTED'")).rows;
    expect(audit).toHaveLength(1); expect(audit[0].evidence).toMatchObject({ reason, refundRequestId: result.refundRequestId, amountMinor: '50000' });
    await expect(fixture.pool.query("UPDATE marketing_workflow_events SET evidence='{}' WHERE event_type='CAMPAIGN_REFUND_REQUESTED'")).rejects.toThrow(/append-only/);
  });
  it('caps post-settlement refunds at that campaign unused amount even when other campaign deposits are available', async () => {
    const row = await quoted(); await capture(row); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'prepare');
    const saved = await service.get(row.campaign_id, host); const otherCampaign = await quoted(); await capture(otherCampaign);
    const policyQuote = (await fixture.pool.query('SELECT snapshot FROM marketing_finance_quotes WHERE id=$1', [row.quote_id])).rows[0].snapshot;
    await new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'system' }, verifySettlement: async () => ({ reservationId: saved.reservation_id, evidenceId: 'verified-partial-flight-costs', evidenceHash: 'c'.repeat(64), closedAuthorizations: [], costs: policyQuote.costs.map((line: any) => ({ ...line, amountMinor: line.code === 'META_MEDIA' ? '80000' : line.amountMinor })), remittanceTaxMinor: '0', finalAt: new Date().toISOString() }) }).reconcile({});
    expect((await bridge.snapshot(saved)).funding).toMatchObject({ status: 'SETTLED', refundableMinor: '10500', released: false });
    await expect(bridge.requestRefund(saved, host, '10501', 'too-much')).rejects.toMatchObject({ code: 'REFUND_FUNDS_UNAVAILABLE' });
    await bridge.requestRefund(saved, host, '10500', 'unused-final-amount');
    expect((await fixture.pool.query('SELECT available_minor,refund_pending_minor FROM marketing_finance_accounts WHERE host_id=10')).rows).toEqual([{ available_minor: '105000', refund_pending_minor: '10500' }]);
  });
  it('rolls back the refund obligation and journal when durable refund enqueue fails', async () => {
    const row = await quoted(); await capture(row);
    await fixture.pool.query("CREATE FUNCTION harvo_test_refund_queue_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='REFUND' THEN RAISE EXCEPTION 'isolated queue failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER harvo_test_refund_queue_failure BEFORE INSERT ON marketing_jobs FOR EACH ROW EXECUTE FUNCTION harvo_test_refund_queue_failure()");
    try { await expect(bridge.requestRefund(row, host, '105000', 'rollback-on-queue-failure')).rejects.toThrow(/isolated queue failure/); }
    finally { await fixture.pool.query('DROP TRIGGER harvo_test_refund_queue_failure ON marketing_jobs; DROP FUNCTION harvo_test_refund_queue_failure()'); }
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_refunds')).rows).toHaveLength(0);
    expect((await fixture.pool.query("SELECT * FROM marketing_finance_journals WHERE kind='REFUND_REQUEST'")).rows).toHaveLength(0);
    expect((await bridge.snapshot(row)).funding).toMatchObject({ refundableMinor: '105000', pendingRefundMinor: '0' });
    await expect(bridge.requestRefund(row, other, '1', 'foreign-owner')).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
  it('isolates host campaign/listing access and prohibits host publication approval', async () => {
    const row = await approved();
    await expect(service.get(row.campaign_id, other)).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    await expect(service.create(other, workflowDraft())).rejects.toMatchObject({ code: 'LISTING_NOT_AVAILABLE' });
    await expect(service.review(row.campaign_id, host, { revision: 1, decision: 'APPROVE', note: 'Host cannot approve own campaign.' })).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
    await expect(service.schedule(row.campaign_id, host, 1, 'PUBLISH', 'host')).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
    const workspace = await service.workspace(other); expect(workspace.campaigns).toHaveLength(0); expect(workspace.listings.map(l => l.id)).toEqual([21]);
  });
  it('enforces workflow and checkout row isolation for a non-superuser database role', async () => {
    const row = await approved();
    await fixture.pool.query('DO $$ BEGIN CREATE ROLE harvo_workflow_reader; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await fixture.pool.query('GRANT USAGE ON SCHEMA public TO harvo_workflow_reader');
    await fixture.pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO harvo_workflow_reader');
    await inTransaction(fixture.pool, other, async c => {
      await c.query('SET LOCAL ROLE harvo_workflow_reader');
      expect((await c.query('SELECT * FROM marketing_campaign_workflows')).rows).toHaveLength(0);
      expect((await c.query('SELECT * FROM marketing_workflow_events')).rows).toHaveLength(0);
      await c.query("SELECT set_config('app.current_user_id','10',true)");
      expect((await c.query('SELECT campaign_id FROM marketing_campaign_workflows')).rows).toEqual([{ campaign_id: row.campaign_id }]);
      expect((await c.query('SELECT * FROM marketing_workflow_events')).rows.length).toBeGreaterThan(0);
    });
  });
  it('routes uncertain AI and image failures to documented human review and never claims an AI pass', async () => {
    generate.mockRejectedValueOnce(new Error('isolated AI timeout'));
    const row = await service.create(host, workflowDraft()); const result = await service.evaluate(row.campaign_id, host, 1);
    expect(result).toMatchObject({ state: 'PENDING_ADMIN', ai: { status: 'REQUIRES_REVIEW', score: null } });
    await expect(service.review(row.campaign_id, admin, { revision: 1, decision: 'APPROVE', note: 'Missing explicit media verification.' })).rejects.toMatchObject({ code: 'REVIEW_EVIDENCE_REQUIRED' });
  });
  it('rejects under-eight AI results and serializes the five-per-hour host limit', async () => {
    generate.mockResolvedValue(JSON.stringify({ score: 7.9, verdict: 'PASS', notes: ['Insufficient approved copy quality.'], suggestions: [] }));
    const row = await service.create(host, workflowDraft()); const result = await service.evaluate(row.campaign_id, host, 1);
    expect(result).toMatchObject({ state: 'AI_REJECTED', ai: { status: 'REJECTED' } });
    await expect(service.submit(row.campaign_id, host, 1)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    for (let i = 0; i < 4; i++) await service.evaluate(row.campaign_id, host, 1);
    await expect(service.evaluate(row.campaign_id, host, 1)).rejects.toMatchObject({ code: 'AI_RATE_LIMIT' });
    expect(generate).toHaveBeenCalledTimes(5);
  });
  it('makes publication retries create one reservation journal and one durable job', async () => {
    const row = await quoted(); await capture(row);
    await Promise.all(Array.from({ length: 8 }, () => service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'same-request')));
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(1);
    expect((await fixture.pool.query("SELECT * FROM marketing_finance_journals WHERE kind='RESERVE'")).rows).toHaveLength(1);
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(1);
  });
  it('makes concurrent draft retries return one campaign and rejects changed content under the same creation key', async () => {
    const requestKey = randomUUID();
    const rows = await Promise.all(Array.from({ length: 8 }, () => service.create(host, workflowDraft(), requestKey)));
    expect(new Set(rows.map(row => row.campaign_id)).size).toBe(1);
    expect((await fixture.pool.query('SELECT * FROM marketing_campaign_revisions')).rows).toHaveLength(1);
    await expect(service.create(host, workflowDraft({ title: 'Different campaign content' }), requestKey)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('batches all 30 financial projections into one SQL read with constant workspace and AI-recovery overhead', async () => {
    const rows = await Promise.all(Array.from({ length: 30 }, (_, index) => service.create(host, workflowDraft({ title: `Measured workspace campaign ${index}` }), randomUUID())));
    const quotes = await Promise.all(rows.map(row => bridge.quote(row, 'isolated-fixture-quote')));
    await fixture.pool.query('UPDATE marketing_campaign_workflows w SET quote_id=x.quote_id FROM unnest($1::int[],$2::uuid[]) x(campaign_id,quote_id) WHERE x.campaign_id=w.campaign_id', [rows.map(r => r.campaign_id), quotes.map(q => q.id)]);
    const sql: string[] = []; const originalConnect = fixture.pool.connect.bind(fixture.pool);
    const connections = vi.spyOn(fixture.pool, 'connect').mockImplementation((async () => {
      const client = await originalConnect();
      return new Proxy(client, { get(target, property) {
        if (property === 'query') return (query: string, ...args: any[]) => { sql.push(query); return (target.query as any)(query, ...args); };
        const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as any);
    const single = vi.spyOn(bridge, 'snapshot'), batch = vi.spyOn(bridge, 'snapshots');
    const started = performance.now(); const workspace = await service.workspace(host); const elapsedMs = performance.now() - started;
    expect(workspace.campaigns).toHaveLength(30); expect(workspace.campaigns.every(c => c.quote?.totalMinor === '105000')).toBe(true);
    expect(single).not.toHaveBeenCalled(); expect(batch).toHaveBeenCalledOnce(); expect(connections).toHaveBeenCalledTimes(3);
    expect(sql.filter(s => /WITH requested AS/.test(s))).toHaveLength(1); expect(sql).toHaveLength(14);
    console.info(JSON.stringify({ verification: 'isolated-workspace-finance-batch', campaigns: 30, connections: connections.mock.calls.length, sqlStatements: sql.length, financialReads: 1, elapsedMs: Math.round(elapsedMs) }));
  });
  it('keeps batched finance projections tenant-bound under a non-superuser role and rejects forged quote associations', async () => {
    const row = await quoted(); await capture(row);
    const foreignDraft = await service.create(other, workflowDraft({ listingId: 21, mediaIds: ['101'] }));
    const foreignQuote = await bridge.quote(foreignDraft, 'foreign-fixture');
    const foreignRow = { ...foreignDraft, quote_id: foreignQuote.id };
    await fixture.pool.query('DO $$ BEGIN CREATE ROLE harvo_workflow_batch LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await fixture.pool.query('GRANT USAGE ON SCHEMA public TO harvo_workflow_batch');
    await fixture.pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO harvo_workflow_batch');
    const readerPool = new pg.Pool({ ...fixture.pool.options, user: 'harvo_workflow_batch' });
    try {
      const reader = new WorkflowFinance(readerPool, workflowConfig, { checkout } as unknown as CampaignPaymentGateway);
      expect((await reader.snapshots([row], host)).get(row.campaign_id).funding).toMatchObject({ capturedMinor: '105000', released: true });
      await expect(reader.snapshots([foreignRow], host)).rejects.toMatchObject({ code: 'FINANCE_SCOPE_INVALID' });
      expect((await reader.snapshots([{ ...foreignRow, host_id: 10 }], host)).get(foreignRow.campaign_id).quote).toBeNull();
      expect((await reader.snapshots([{ ...row, quote_id: foreignQuote.id }], host)).get(row.campaign_id).quote).toBeNull();
    } finally { await readerPool.end(); }
  });
});

describe('HARVO durable job lease fencing on real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>, queue: MarketingJobQueue;
  beforeAll(async () => { fixture = await createWorkflowPgFixture(); queue = new MarketingJobQueue(fixture.pool); });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => { await fixture.reset(); });
  it('claims a ready job exactly once under concurrent workers and verifies completion ownership', async () => {
    await enqueue(fixture.pool, { kind: 'TELEMETRY', key: 'metrics-1' });
    const claims = await Promise.all(Array.from({ length: 10 }, () => queue.claim()));
    const jobs = claims.filter((j): j is NonNullable<typeof j> => !!j); expect(jobs).toHaveLength(1);
    await queue.heartbeat(jobs[0]); await queue.complete(jobs[0]);
    await expect(queue.complete(jobs[0])).rejects.toMatchObject({ code: 'STALE_WORKER' });
  });
  it('quarantines expired irreversible publishing attempts instead of resending and fences the old worker', async () => {
    await enqueue(fixture.pool, { kind: 'PUBLISH', key: 'publish-unknown' }); const first = (await queue.claim())!;
    await fixture.pool.query("UPDATE marketing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    expect(await queue.claim()).toBeNull();
    const saved = (await fixture.pool.query('SELECT state,fence FROM marketing_jobs WHERE id=$1', [first.id])).rows[0];
    expect(saved).toMatchObject({ state: 'RECONCILIATION_REQUIRED', fence: '2' });
    await expect(queue.heartbeat(first)).rejects.toMatchObject({ code: 'STALE_WORKER' });
    await expect(queue.complete(first)).rejects.toMatchObject({ code: 'STALE_WORKER' });
    await expect(inTransaction(fixture.pool, admin, c => queue.assertFence(c, first))).rejects.toMatchObject({ code: 'STALE_WORKER' });
  });
  it('retries read-only work under a new fence and blocks stale completion', async () => {
    await enqueue(fixture.pool, { kind: 'TELEMETRY', key: 'metrics-retry' }); const first = (await queue.claim())!;
    await fixture.pool.query("UPDATE marketing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    await queue.claim(); await fixture.pool.query('UPDATE marketing_jobs SET run_after=now() WHERE id=$1', [first.id]);
    const next = (await queue.claim())!; expect(next.id).toBe(first.id); expect(BigInt(next.fence)).toBeGreaterThan(BigInt(first.fence));
    await expect(queue.complete(first)).rejects.toMatchObject({ code: 'STALE_WORKER' }); await queue.complete(next);
  });
  it('rejects reuse of durable job keys for changed payloads', async () => {
    const input = { kind: 'TELEMETRY' as const, key: 'same-key', payload: { date: '2099-01-01' } };
    const id = await enqueue(fixture.pool, input); expect(await enqueue(fixture.pool, input)).toBe(id);
    await expect(enqueue(fixture.pool, { ...input, payload: { date: '2099-01-02' } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('HARVO explicit campaign cost policy adapter', () => {
  it('leaves funding and publishing disabled without explicit operational policy', () => {
    const config = readMarketingConfig(''); expect(config).toMatchObject({ fundingEnabled: false, publishingEnabled: false, activationEnabled: false, financialPolicy: null });
  });
  it('charges configured costs plus profit on those costs and separately configured remittance tax', () => {
    const result = calculateCampaignCosts({ ...workflowConfig, remittanceTax: { base: 'PROFIT', rateBps: 1800 } }, 'META', '90000', 500);
    expect(result.costs).toEqual([{ code: 'META_MEDIA', amountMinor: '90000' }, { code: 'GOOGLE_MEDIA', amountMinor: '0' }, { code: 'PROCESSING', amountMinor: '9000' }, { code: 'COST_TAX', amountMinor: '1000' }]);
    expect(result.remittanceTaxMinor).toBe('900');
  });
  it('rejects incomplete expense policies rather than treating omitted charges as zero', () => {
    expect(() => calculateCampaignCosts({ ...workflowConfig, costRules: [] }, 'META', '90000', 500)).toThrow(/explicit calculation rule/);
  });
  it('rejects an ambiguous duplicate media cost category instead of multiplying authorized media spend', () => {
    const financialPolicy = { ...workflowPolicy, costCodes: [...workflowPolicy.costCodes, { code: 'OTHER_META_MEDIA', kind: 'MEDIA' as const, provider: 'META' as const }] };
    expect(() => calculateCampaignCosts({ ...workflowConfig, financialPolicy }, 'META', '90000', 500)).toThrow();
  });
  it('rejects a missing provider media category instead of quoting campaign expenses without its media budget', () => {
    const financialPolicy = { ...workflowPolicy, costCodes: workflowPolicy.costCodes.filter(c => c.provider !== 'META') };
    expect(() => calculateCampaignCosts({ ...workflowConfig, financialPolicy }, 'META', '90000', 500)).toThrow();
  });
});
