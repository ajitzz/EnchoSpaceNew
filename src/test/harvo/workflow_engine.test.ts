import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowPgFixture, workflowConfig, workflowDraft, workflowPolicy } from './workflowPgFixture.js';
import { MarketingWorkflowService } from '../../lib/marketing/workflow.js';
import { WorkflowFinance } from '../../lib/marketing/financeBridge.js';
import { CampaignAiReviewer } from '../../lib/marketing/ai.js';
import { MarketingEngine } from '../../lib/marketing/engine.js';
import { MarketingFinanceService, type VerifiedCapture } from '../../lib/marketing/financeService.js';
import { enqueue } from '../../lib/marketing/jobs.js';
import type { CampaignPaymentGateway } from '../../lib/marketing/payments.js';
import type { ProviderAuthorizationGuard } from '../../lib/providers/ProviderOperationStore.js';
import type { AdProvider } from '../../lib/providers/AdProvider.js';
import type { ProviderControlRequest, ProviderPublishRequest } from '../../lib/providers/types.js';
import type pg from 'pg';
import { CampaignRefundGateway, type RazorpayRefundClient } from '../../lib/marketing/refunds.js';

const host = { id: 10, role: 'host' as const }, admin = { id: 90, role: 'admin' as const };
describe('HARVO engine durable execution boundaries on real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>, service: MarketingWorkflowService, engine: MarketingEngine;
  let guard: ProviderAuthorizationGuard;
  const publish = vi.fn(), pause = vi.fn(), resume = vi.fn(), truth = vi.fn(), telemetry = vi.fn(), verifyCapture = vi.fn();
  const provider = { createCampaignHierarchy: publish, pauseCampaign: pause, resumeCampaign: resume, fetchAuthoritativeDeliveryTruth: truth, fetchTelemetrySnapshot: telemetry } as unknown as AdProvider;
  beforeAll(async () => { fixture = await createWorkflowPgFixture(); });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.reset(); vi.stubEnv('META_AD_ACCOUNT_ID', 'act_987654321');
    await fixture.pool.query("INSERT INTO room_types VALUES(1,20,'INR')");
    await fixture.pool.query("INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units) SELECT 20,1,d::date,2 FROM generate_series('2099-01-02'::date,'2099-01-03'::date,interval '1 day') d");
    await new MarketingFinanceService(fixture.pool, { actorContext: admin }).persistPolicy(workflowPolicy, 90);
    const gateway = { checkout: vi.fn(), verifyCapture } as unknown as CampaignPaymentGateway;
    service = new MarketingWorkflowService(fixture.pool, { ai: new CampaignAiReviewer({ mediaOrigins: new Set() }), finance: new WorkflowFinance(fixture.pool, workflowConfig, gateway), fundingEnabled: true, publishingEnabled: true, activationEnabled: true, configurationReasons: [] });
    engine = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, (_row, authorization) => { guard = authorization; return provider; });
    publish.mockReset().mockImplementation(async (request: ProviderPublishRequest, pool: pg.Pool) => {
      await authorize(pool, request, 'CREATE_HIERARCHY');
      return { success: true, provider: 'META', externalCampaignId: 'verified-campaign-123', hierarchy: { campaignId: request.campaignId, provider: 'META', externalCampaignId: 'verified-campaign-123', entities: [] } };
    });
    for (const [mock, operation] of [[pause, 'PAUSE'], [resume, 'RESUME']] as const) mock.mockReset().mockImplementation(async (request: ProviderControlRequest, pool: pg.Pool) => {
      await authorize(pool, request, operation);
      return { success: true, provider: 'META', externalCampaignId: request.externalCampaignId, previousStatus: operation === 'PAUSE' ? 'ACTIVE' : 'PAUSED', newStatus: operation === 'PAUSE' ? 'PAUSED' : 'ACTIVE', normalizedDeliveryState: operation === 'PAUSE' ? 'PAUSED' : 'REVIEWING', modifiedAt: new Date().toISOString() };
    });
    truth.mockReset().mockImplementation(async () => ({ provider: 'META', externalCampaignId: 'verified-campaign-123', normalizedState: 'LIVE', rawStatus: 'ACTIVE', rawEffectiveStatus: 'ACTIVE', isLive: true, isServingImpressions: true, lastObservedAt: new Date().toISOString(), reconciliationRequired: false }));
    telemetry.mockReset().mockImplementation(async () => ({ provider: 'META', externalCampaignId: 'verified-campaign-123', dateStart: '2099-01-01', dateEnd: '2099-01-15', impressions: 1000, clicks: 20, ctr: 2, conversions: 3, cpc: 50, cpm: 1000, spend: { currency: 'INR', minor_units: 1000 }, observedAt: new Date().toISOString(), dataFreshness: 'FRESH' }));
    verifyCapture.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { vi.unstubAllEnvs(); });
  async function authorize(pool: pg.Pool, request: ProviderPublishRequest | ProviderControlRequest, operation: 'CREATE_HIERARCHY' | 'PAUSE' | 'RESUME') {
    const c = await pool.connect();
    try { await c.query('BEGIN'); await guard({ campaignId: request.campaignId, provider: 'META', operation, fingerprint: 'a'.repeat(64), idempotencyKey: request.idempotencyKey, correlationId: request.correlationId, ...('budget' in request ? { budgetMinor: request.budget.minor_units, currency: request.budget.currency, budgetKind: 'LIFETIME' as const } : { externalCampaignId: request.externalCampaignId }) }, c); await c.query('COMMIT'); }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function quoted() {
    const draft = workflowDraft({ startDate:'2026-09-01',endDate:'2026-09-30',stayStartDate: '2099-01-02', stayEndDate: '2099-01-04' });
    const row = await service.create(host, draft); await service.evaluate(row.campaign_id, host, 1); await service.submit(row.campaign_id, host, 1);
    await service.review(row.campaign_id, admin, { revision: 1, decision: 'APPROVE', note: 'Manual AI fallback review of actual media and policy.', mediaConfirmed: true, policyConfirmed: true });
    return service.quote(row.campaign_id, host, 1, 'funding-quote');
  }
  const evidence = (row: any): VerifiedCapture => ({ provider: 'RAZORPAY', accountId: 'verified-recipient', eventId: `capture-${row.campaign_id}`, paymentId: `pay_Test${row.campaign_id}`, orderId: `order-${row.campaign_id}`, quoteId: row.quote_id, currency: 'INR', amountMinor: '105000', payloadHash: 'a'.repeat(64), capturedAt: new Date(Date.now() - 25 * 3600000).toISOString() });
  async function funded() {
    const row = await quoted();
    await new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'system' }, fundingEnabled: true, verifyCapture: async () => evidence(row) }).recordVerifiedCapture({});
    return row;
  }
  async function prepared() {
    const row = await funded(); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'publish');
    expect(await engine.runOnce()).toBe(true); return service.get(row.campaign_id, host);
  }
  async function spending() {
    const row = await prepared(); await service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'activate'); expect(await engine.runOnce()).toBe(true); return service.get(row.campaign_id, host);
  }
  it('creates only paused provider hierarchy with the captured reservation and records exact approved asset data', async () => {
    const row = await prepared(); expect(row.state).toBe('PROVIDER_PAUSED');
    expect(row.provider_truth).toMatchObject({ configuredStatus: 'PAUSED', observedStatus: 'PAUSED', deliveryConfirmed: false, externalCampaignId: 'verified-campaign-123' });
    expect(publish).toHaveBeenCalledOnce(); const request = publish.mock.calls[0][0];
    expect(request).toMatchObject({ campaignId: row.campaign_id, hostId: 10, listingId: 20, budget: { currency: 'INR', minor_units: 90000 }, creativeAssets: { mediaUrl: 'https://media.encho.example/villa.jpg', landingPageUrl: 'https://encho.example/stay/garden-villa-20' } });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toHaveLength(0);
  });
  it('a forged queued publish without reservation cannot call the provider adapter', async () => {
    const row = await quoted(); await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PUBLISH_QUEUED' WHERE campaign_id=$1", [row.campaign_id]);
    await enqueue(fixture.pool, { campaignId: row.campaign_id, revision: 1, kind: 'PUBLISH', key: 'forged-unpaid-publish' });
    expect(await engine.runOnce()).toBe(false); expect(publish).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
  });
  it('consumes verified payment work once without letting an event payload choose its payment status', async () => {
    const row = await quoted(); verifyCapture.mockResolvedValue(evidence(row));
    await enqueue(fixture.pool, { kind: 'PAYMENT', key: 'verified-payment', payload: { rawSignedEvidenceReference: 'isolated-only' } });
    expect(await engine.runOnce()).toBe(true); expect(verifyCapture).toHaveBeenCalledOnce();
    expect((await fixture.pool.query('SELECT amount_minor FROM marketing_finance_captures')).rows).toEqual([{ amount_minor: '105000' }]);
    expect((await service.project(await service.get(row.campaign_id, host))).funding.status).toBe('CAPTURED');
  });
  it('holds activation behind actual stay inventory and cannot claim delivery from enablement alone', async () => {
    const row = await spending(); expect(row.state).toBe('PROVIDER_REVIEW');
    expect(row.provider_truth).toMatchObject({ configuredStatus: 'ACTIVE', observedStatus: 'REVIEWING', deliveryConfirmed: false });
    expect(resume).toHaveBeenCalledOnce();
    const second = await prepared(); await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units WHERE listing_id=20');
    await service.schedule(second.campaign_id, admin, 1, 'ACTIVATE', 'full-property'); expect(await engine.runOnce()).toBe(false);
    expect((await service.get(second.campaign_id, host)).state).toBe('RECONCILIATION_REQUIRED');
  });
  it('rechecks channel conversion authority for an already queued activation while preserving paused creation and safety pause', async () => {
    const reason = 'Meta advertising and canonical Purchase delivery must use the same verified pixel.';
    let unavailable = true;
    const blockers = vi.fn((channel: 'GOOGLE' | 'META') => unavailable && channel === 'META' ? [reason] : []);
    service.options.activationBlockers = blockers;
    const row = await prepared();
    expect(row.state).toBe('PROVIDER_PAUSED');
    expect(publish).toHaveBeenCalledOnce();
    await expect(service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'blocked-channel')).rejects.toMatchObject({ code: 'CONVERSION_AUTHORITY_REQUIRED' });
    expect((await fixture.pool.query("SELECT id FROM marketing_jobs WHERE kind='ACTIVATE'")).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT id FROM marketing_finance_authorizations')).rows).toHaveLength(0);

    unavailable = false;
    await service.schedule(row.campaign_id, admin, 1, 'ACTIVATE', 'queued-before-authority-loss');
    const financialState = async () => (await fixture.pool.query(`SELECT a.available_minor,a.reserved_minor,a.refund_pending_minor,r.status,r.remaining_minor
      FROM marketing_finance_accounts a JOIN marketing_finance_reservations r ON r.host_id=a.host_id AND r.currency=a.currency
      WHERE r.campaign_id=$1`, [row.campaign_id])).rows;
    const held = await financialState();
    expect(held).toEqual([{ available_minor: '0', reserved_minor: '105000', refund_pending_minor: '0', status: 'RESERVED', remaining_minor: '105000' }]);
    const existingAuthorization = (await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows;
    expect(existingAuthorization).toHaveLength(1);

    unavailable = true;
    const remoteMutation = vi.fn();
    resume.mockImplementationOnce(async (request: ProviderControlRequest, pool: pg.Pool) => {
      await authorize(pool, request, 'RESUME');
      remoteMutation();
      throw new Error('A blocked conversion destination reached the remote mutation boundary');
    });
    expect(await engine.runOnce()).toBe(false);
    expect(remoteMutation).not.toHaveBeenCalled();
    const saved = await service.get(row.campaign_id, host);
    expect(saved).toMatchObject({ state: 'RECONCILIATION_REQUIRED', last_error: 'CONVERSION_AUTHORITY_REQUIRED', provider_truth: { configuredStatus: 'PAUSED', observedStatus: 'PAUSED', deliveryConfirmed: false } });
    expect((await service.project(saved)).blockers).toContain(reason);
    expect(blockers.mock.calls.every(([channel]) => channel === 'META')).toBe(true);
    expect(await financialState()).toEqual(held);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toEqual(existingAuthorization);

    blockers.mockClear();
    await service.schedule(row.campaign_id, host, 1, 'PAUSE', 'safety-after-authority-loss');
    expect(await engine.runOnce()).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(blockers).not.toHaveBeenCalled();
    expect((await service.get(row.campaign_id, host)).state).toBe('PAUSED');
    expect(await financialState()).toEqual(held);
  });
  it('preserves provider conversions separately from verified guest bookings and reports unknown CRM leads', async () => {
    const row = await spending(); await enqueue(fixture.pool, { campaignId: row.campaign_id, revision: 1, kind: 'TELEMETRY', key: 'metrics' });
    expect(await engine.runOnce()).toBe(true); const saved = await service.get(row.campaign_id, host);
    expect(saved.telemetry).toMatchObject({ impressions: 1000, clicks: 20, providerAttributedConversions: 3, leads: null, bookings: null, spendMinor: '1000' });
    expect((await service.project(saved)).metrics).toMatchObject({ impressions: 1000, clicks: 20, leads: null, bookings: null });
  });
  it('queues and executes a protective pause when provider spend reaches the safety threshold', async () => {
    const row = await spending(); telemetry.mockResolvedValueOnce({ ...await telemetry(), spend: { currency: 'INR', minor_units: 85000 } });
    await enqueue(fixture.pool, { campaignId: row.campaign_id, revision: 1, kind: 'TELEMETRY', key: 'spend-threshold' });
    expect(await engine.runOnce()).toBe(true); expect((await service.get(row.campaign_id, host)).state).toBe('PAUSE_QUEUED');
    expect(await engine.runOnce()).toBe(true); expect((await service.get(row.campaign_id, host)).state).toBe('PAUSED');
    expect(pause).toHaveBeenCalledOnce();
  });
  it.each(['TELEMETRY', 'PROTECTION'] as const)('queues fail-closed pause when %s cannot obtain provider observations', async kind => {
    const row = await spending(); truth.mockRejectedValueOnce(Object.assign(new Error('Provider unavailable'), { code: 'PROVIDER_UNAVAILABLE' }));
    await enqueue(fixture.pool, { campaignId: row.campaign_id, revision: 1, kind, key: `unavailable-${kind}` });
    expect(await engine.runOnce()).toBe(false);
    expect((await service.get(row.campaign_id, host)).state).toBe('PAUSE_QUEUED');
    expect((await fixture.pool.query("SELECT * FROM marketing_jobs WHERE kind='PAUSE' AND state='PENDING'")).rows).toHaveLength(1);
  });
  it('a failed telemetry request cannot erase the host pause queued while its provider request was pending', async () => {
    const row = await spending();
    truth.mockImplementationOnce(async () => { await service.schedule(row.campaign_id, host, 1, 'PAUSE', 'host-stop'); throw Object.assign(new Error('Provider request timed out'), { code: 'PROVIDER_TIMEOUT' }); });
    await enqueue(fixture.pool, { campaignId: row.campaign_id, revision: 1, kind: 'TELEMETRY', key: 'racing-observation' });
    expect(await engine.runOnce()).toBe(false);
    expect((await service.get(row.campaign_id, host)).state).toBe('PAUSE_QUEUED');
    expect(await engine.runOnce()).toBe(true); expect((await service.get(row.campaign_id, host)).state).toBe('PAUSED');
  });
  it('does not let an expired worker completion or catch overwrite a newer campaign operation', async () => {
    const row = await funded(); await service.schedule(row.campaign_id, admin, 1, 'PUBLISH', 'stale-worker');
    publish.mockImplementationOnce(async () => {
      await fixture.pool.query("UPDATE marketing_jobs SET fence=fence+1,state='RECONCILIATION_REQUIRED',lease_until=NULL WHERE kind='PUBLISH'");
      await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSE_QUEUED',last_error='NEWER_STOP_REQUIRED' WHERE campaign_id=$1", [row.campaign_id]);
      throw Object.assign(new Error('Old worker request returned unknown'), { code: 'UNKNOWN_OUTCOME', unknownOutcome: true });
    });
    expect(await engine.runOnce()).toBe(false);
    expect(await service.get(row.campaign_id, host)).toMatchObject({ state: 'PAUSE_QUEUED', last_error: 'NEWER_STOP_REQUIRED' });
  });
  function refundEngine(row:any){
    let remote:any;
    const send=vi.fn(async(paymentId:string,input:any)=>(remote={id:'rfnd_EngineTest',payment_id:paymentId,amount:input.amount,currency:'INR',receipt:input.receipt,status:'processed'}));
    const read=vi.fn(async()=>({...remote}));
    const payment=vi.fn(async()=>({id:evidence(row).paymentId,amount:105000,currency:'INR',status:'captured'}));
    const razorpay:RazorpayRefundClient={payments:{fetch:payment,refund:send},refunds:{fetch:read}};
    const refunds=new CampaignRefundGateway(fixture.pool,{actorContext:{id:90,role:'system'},razorpay,razorpayAccountId:'verified-recipient'});
    return {runner:new MarketingEngine(fixture.pool,service,workflowConfig,{verifyCapture} as unknown as CampaignPaymentGateway,undefined,refunds),send,read,payment};
  }
  it('dispatches the atomically queued refund through a fenced original-payment provider call',async()=>{
    const row=await funded();const request=await (service.options.finance as WorkflowFinance).requestRefund(row,host,'50000','engine-refund','Unused campaign funds requested back.');
    const {runner,send}=refundEngine(row);expect(await runner.runOnce()).toBe(true);expect(send).toHaveBeenCalledOnce();
    expect((await fixture.pool.query('SELECT status FROM marketing_finance_refunds WHERE id=$1',[request.refundRequestId])).rows[0].status).toBe('SUCCEEDED');
    expect((await fixture.pool.query("SELECT state FROM marketing_jobs WHERE kind='REFUND'")).rows).toEqual([{state:'SUCCEEDED'}]);
  });
  it('recovers an orphan refund obligation and never duplicates POST across distinct sweep keys',async()=>{
    const row=await funded();const captured=(await fixture.pool.query('SELECT id FROM marketing_finance_captures WHERE quote_id=$1',[row.quote_id])).rows[0];
    const request=await new MarketingFinanceService(fixture.pool,{actorContext:host}).requestRefund({captureId:captured.id,hostId:10,amountMinor:'50000',idempotencyKey:'orphan-refund'});
    expect((await fixture.pool.query("SELECT * FROM marketing_jobs WHERE kind='REFUND'")).rows).toHaveLength(0);
    const {runner,send,read}=refundEngine(row);read.mockImplementationOnce(async()=>({id:'rfnd_EngineTest',payment_id:evidence(row).paymentId,amount:50000,currency:'INR',receipt:request.refundRequestId,status:'pending'}));
    await runner.scheduleRefunds();expect(await runner.runOnce()).toBe(false);
    expect((await fixture.pool.query('SELECT status FROM marketing_finance_refunds WHERE id=$1',[request.refundRequestId])).rows[0].status).toBe('REQUESTED');
    expect((await fixture.pool.query('SELECT refund_pending_minor FROM marketing_finance_accounts WHERE host_id=10')).rows[0].refund_pending_minor).toBe('50000');
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+300001);await runner.scheduleRefunds();
    expect((await fixture.pool.query("SELECT * FROM marketing_jobs WHERE kind='REFUND'")).rows).toHaveLength(2);
    expect(await runner.runOnce()).toBe(true);expect(send).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledTimes(2);
  });
  it('rejects an expired REFUND worker before its provider POST while retaining the held obligation',async()=>{
    const row=await funded();await (service.options.finance as WorkflowFinance).requestRefund(row,host,'50000','expired-refund-worker');
    const {runner,send,payment}=refundEngine(row);payment.mockImplementationOnce(async()=>{
      await fixture.pool.query("UPDATE marketing_jobs SET fence=fence+1,state='RETRY',lease_until=NULL WHERE kind='REFUND' AND state='RUNNING'");
      return {id:evidence(row).paymentId,amount:105000,currency:'INR',status:'captured'};
    });
    expect(await runner.runOnce()).toBe(false);expect(send).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_refund_operations')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT refund_pending_minor FROM marketing_finance_accounts WHERE host_id=10')).rows[0].refund_pending_minor).toBe('50000');
  });
});
