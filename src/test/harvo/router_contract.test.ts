import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketingRouter } from '../../server/marketing/router.js';
import { MarketingWorkflowService } from '../../lib/marketing/workflow.js';
import { CampaignAiReviewer } from '../../lib/marketing/ai.js';
import { WorkflowFinance } from '../../lib/marketing/financeBridge.js';
import { MarketingFinanceService, type VerifiedCapture } from '../../lib/marketing/financeService.js';
import type { CampaignPaymentGateway } from '../../lib/marketing/payments.js';
import { createWorkflowPgFixture, workflowConfig, workflowDraft, workflowPolicy } from './workflowPgFixture.js';
import {readFileSync} from 'node:fs';
import {MarketingSettlementService} from '../../lib/marketing/settlementService.js';
import {CampaignDraftGuidance} from '../../lib/marketing/guidance.js';
import {createConversionConsumer} from '../../lib/marketing/conversions/consumer.js';
import {MarketingTargetingService} from '../../lib/marketing/targeting.js';

/** Real router + PostgreSQL contracts; only auth, image/AI and checkout transports are injected.
 * No server startup, dotenv, external database, provider mutation or live payment is imported.
 */
describe('HARVO host/admin HTTP contracts against isolated PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>, app: Express;
  let service: MarketingWorkflowService, finance: MarketingFinanceService;
  const checkout = vi.fn(async () => ({ url: 'https://checkout.stripe.com/isolated-contract', status: 'AWAITING_CAPTURE' }));
  const generate = vi.fn(async () => JSON.stringify({ score: 9, verdict: 'PASS', notes: ['Isolated fixture review of selected media and property copy.'], suggestions: [] }));
  const authenticate: RequestHandler = (req: any, _res, next) => {
    if (req.get('X-Test-User')) req.user = { id: Number(req.get('X-Test-User')), role: req.get('X-Test-Claimed-Role') || 'host' };
    next();
  };
  beforeAll(async () => { fixture = await createWorkflowPgFixture();for(const file of ['012_harvo_marketing_settlement.sql','014_harvo_marketing_request_limits.sql'])await fixture.pool.query(readFileSync(new URL(`../../migrations/${file}`,import.meta.url),'utf8')); });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.reset(); checkout.mockClear();
    generate.mockReset().mockResolvedValue(JSON.stringify({ score: 9, verdict: 'PASS', notes: ['Isolated fixture review of selected media and property copy.'], suggestions: [] }));
    await new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'admin' } }).persistPolicy(workflowPolicy, 90);
    finance = new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'system' }, fundingEnabled: true, verifyCapture: async (input: unknown) => input as VerifiedCapture });
    const bridge = new WorkflowFinance(fixture.pool, structuredClone(workflowConfig), { checkout } as unknown as CampaignPaymentGateway);
    service = new MarketingWorkflowService(fixture.pool, {
      ai: new CampaignAiReviewer({ model: 'isolated-contract-reviewer', mediaOrigins: new Set(workflowConfig.mediaOrigins), generate,
        loadImage: async () => ({ data: Buffer.from('isolated selected image evidence'), mimeType: 'image/jpeg', width: 1200, height: 1200 }) }),
      finance: bridge, publishingEnabled: true, activationEnabled: true, fundingEnabled: true, configurationReasons: [],
    });
    app = express(); app.use(express.json({ limit: '20kb' }));
    const targeting=new MarketingTargetingService({getCustomerId:()=> '9876543210',searchStream:async()=>[],suggestGeoTargets:async()=>[]},['IN']);
    const settlement=new MarketingSettlementService(fixture.pool,{operatorIds:[90,91],policyReference:'isolated-documentary-close',providerAccounts:{},verifyStopped:async()=>{throw new Error('Fixture has no live settlement authority');}});
    app.use('/api/marketing/v2', createMarketingRouter(fixture.pool, service, bridge, authenticate,targeting,{settlement,conversions:createConversionConsumer(fixture.pool),guidance:new CampaignDraftGuidance({})}));
  });
  const get = (path: string, user = 10) => request(app).get(`/api/marketing/v2${path}`).set('X-Test-User', String(user));
  const post = (path: string, body: Record<string, unknown>, user = 10, key = 'isolated-contract-intent') => request(app).post(`/api/marketing/v2${path}`).set('X-Test-User', String(user)).set('Idempotency-Key', key).send(body);
  async function created(extra: Record<string, unknown> = {}, key = 'isolated-create-intent') {
    const response = await post('/campaigns', workflowDraft(extra), 10, key).expect(201); return response.body;
  }
  async function approved() {
    const row = await created();
    await post(`/campaigns/${row.id}/evaluate`, { revision: 1 }).expect(200);
    await post(`/campaigns/${row.id}/submit`, { revision: 1 }).expect(200);
    return (await post(`/campaigns/${row.id}/review`, { revision: 1, decision: 'APPROVE', note: 'Reviewed exact selected media, rights and provider policy.', policyConfirmed: true, mediaConfirmed: true }, 90).expect(200)).body;
  }
  async function quoted() { const row = await approved(); return (await post(`/campaigns/${row.id}/quote`, { revision: 1 }).expect(200)).body; }

  it('returns the studio workspace with only owned published media and explicit missing evidence', async () => {
    const row = await created({ listingId: '20' });
    const response = await get('/workspace').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.listings.map((l: any) => l.id)).toEqual([20]);
    expect(response.body.listings[0].media.map((m: any) => m.id)).toEqual(['100']);
    expect(response.body.campaigns[0]).toMatchObject({ id: row.id, revision: 1, mediaBudgetMinor: '90000', dailyBudgetMinor: '6000',
      ai: { status: 'NOT_EVALUATED', score: null }, quote: null, metrics: null,
      delivery: { configuredStatus: null, observedStatus: null, observedAt: null, externalCampaignId: null },
      funding: { released: false }, contentApproval: { status: 'PENDING' } });
    expect(response.body).toMatchObject({ policy: { currency: 'INR', markupPercent: 5 }, capabilities: { funding: true, publish: true, activate: true }, page: { limit: 30, mayHaveMore: false } });
  });
  it('exposes conversion blockers only to current administrators and never invents an accepted checkout source',async()=>{
    await get('/admin/readiness').expect(403);
    const result=await get('/admin/readiness',90).expect(200);
    expect(result.body.conversions).toMatchObject({enabled:false,canonicalSource:'NOT_CONNECTED',blockers:expect.arrayContaining(['CANONICAL_CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED','CANONICAL_ATTRIBUTION_CONSENT_AUTHORITY_REQUIRED'])});
  });
  it('keeps host settlement summaries tenant scoped and billing documents restricted to configured administrators',async()=>{
    const row=await created();expect((await get(`/campaigns/${row.id}/settlement`).expect(200)).body).toMatchObject({status:'AWAITING_BILLING_EVIDENCE',result:null});
    await get(`/campaigns/${row.id}/settlement`,11).expect(404);
    for(const path of ['/admin/settlements','/admin/settlements/documents'])await get(path).expect(403);
    await fixture.pool.query("UPDATE users SET role='admin' WHERE id=11");
    await get('/admin/settlements',11).expect(403);
  });
  it('rejects unowned guidance before quota consumption and returns unavailable when the model is not configured',async()=>{
    await post('/campaign-guidance',{listingId:20,provider:'GOOGLE'},11).expect(404);
    expect((await fixture.pool.query("SELECT * FROM marketing_request_limits WHERE scope='CAMPAIGN_GUIDANCE'")).rows).toHaveLength(0);
    const reply=await post('/campaign-guidance',{listingId:'20',provider:'GOOGLE'}).expect(200);
    expect(reply.body).toMatchObject({status:'UNAVAILABLE',suggestions:null,code:'GUIDANCE_NOT_CONFIGURED',requiresHumanReview:true});
    await post('/campaign-guidance',{listingId:20,provider:'GOOGLE',budgetMinor:'10'}).expect(422);
    expect((await fixture.pool.query("SELECT attempts FROM marketing_request_limits WHERE scope='CAMPAIGN_GUIDANCE'")).rows).toEqual([{attempts:1}]);
  });
  it('rejects malformed pagination and targeting query fields rather than accepting host scope overrides',async()=>{
    await get('/workspace?hostId=11').expect(422);await get('/workspace?before=-1').expect(422);
    await get('/targeting/google/locations?q=IN&resourceName=999').expect(422);
    expect((await get('/targeting/google/locations?q=Bengaluru').expect(200)).body).toEqual({locations:[]});
    expect((await post('/targeting/google/resolve',{locations:[],languages:[]}).expect(200)).body).toEqual({locations:[],languages:[]});
  });
  it('requires a persisted account and ignores a claimed administrator role from the authentication payload', async () => {
    await request(app).get('/api/marketing/v2/workspace').expect(401);
    await get('/workspace', 999).expect(401);
    const denied = await get('/admin/workspace').set('X-Test-Claimed-Role', 'admin').expect(403);
    expect(denied.body).toMatchObject({ code: 'ADMIN_REQUIRED', correlationId: expect.any(String) });
    await post('/admin/policy', { markupPercent: 3, expectedVersion: 0, reason: 'Attempted host policy promotion.' }).set('X-Test-Claimed-Role', 'admin').expect(403);
    await get('/admin/operations').expect(403);
  });
  it('rechecks database role changes on every admin request without granting ownership of another host’s property', async () => {
    await get('/admin/workspace', 90).expect(200);
    await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");
    await get('/admin/workspace', 90).set('X-Test-Claimed-Role', 'admin').expect(403);
    await fixture.pool.query("UPDATE users SET role='admin' WHERE id=11");
    await get('/admin/workspace', 11).set('X-Test-Claimed-Role', 'host').expect(200);
    await post('/campaigns', workflowDraft(), 11).expect(404);
    expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toHaveLength(0);
  });
  it('hides campaign, event and telemetry endpoints across host boundaries', async () => {
    const row = await created();
    for (const suffix of ['', '/events', '/advice']) await get(`/campaigns/${row.id}${suffix}`, 11).expect(404);
    await post(`/campaigns/${row.id}/refresh`, {}, 11).expect(404);
    await post(`/campaigns/${row.id}/pause`, { revision: 1 }, 11).expect(404);
    expect((await get('/workspace', 11).expect(200)).body.campaigns).toEqual([]);
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });
  it('deduplicates concurrent creation and rejects a changed body using the same user intent', async () => {
    const replies = await Promise.all(Array.from({ length: 6 }, () => post('/campaigns', workflowDraft(), 10, 'same-create-contract').expect(201)));
    expect(new Set(replies.map(r => r.body.id)).size).toBe(1);
    const conflict = await post('/campaigns', workflowDraft({ headline: 'Changed campaign headline' }), 10, 'same-create-contract').expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toHaveLength(1);
    expect((await fixture.pool.query('SELECT * FROM marketing_campaign_revisions')).rows).toHaveLength(1);
  });
  it('returns actionable field errors and rejects missing keys and client-supplied financial authority', async () => {
    const invalid = await post('/campaigns', workflowDraft({ description: 'x' })).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_INPUT', correlationId: expect.any(String), fields: expect.arrayContaining([expect.objectContaining({ path: 'description', message: expect.any(String) })]) });
    await request(app).post('/api/marketing/v2/campaigns').set('X-Test-User', '10').send(workflowDraft()).expect(422);
    for (const key of ['hostId', 'funding', 'providerCampaignId', 'ai', 'contentApproval']) {
      await post('/campaigns', workflowDraft({ [key]: 'CLIENT_APPROVED' })).expect(422);
    }
    expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toHaveLength(0);
  });
  it('round-trips Google Search’s explicit campaign contract without silently filling targeting', async () => {
    const googleSearch = { version: 1, dailyBudgetMinor: '6000', bidding: 'MAXIMIZE_CONVERSIONS', containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      headlines: ['Garden Villa Stays', 'Explore Our Guest Rooms', 'Choose Your Stay Dates'], descriptions: ['View our actual rooms and property details.', 'Choose available dates for your garden stay.'],
      keywords: [{ text: 'garden villa stays', matchType: 'EXACT' }, { text: 'villa stay Bengaluru', matchType: 'PHRASE' }],
      geoTargetConstants: ['geoTargetConstants/1007740'], languageConstants: ['languageConstants/1000'], geoMode: 'PRESENCE' };
    const row = await created({ provider: 'GOOGLE', headline: googleSearch.headlines[0], description: googleSearch.descriptions[0], googleSearch, dailyBudgetMinor: undefined, stayStartDate: '2099-02-01', stayEndDate: '2099-02-05' });
    expect(row).toMatchObject({ provider: 'GOOGLE', googleSearch, stayStartDate: '2099-02-01', stayEndDate: '2099-02-05' });
    expect(row.dailyBudgetMinor).toBe('6000');
    expect(row.delivery.externalCampaignId).toBeNull();
    const mismatch = await post('/campaigns', workflowDraft({ provider: 'GOOGLE', googleSearch, headline: 'A different primary headline' }), 10, 'different-google-creative').expect(422);
    expect(mismatch.body.code).toBe('INVALID_INPUT');
  });
  it('edits an exact revision, clears approval and refuses stale writes', async () => {
    const row = await approved();
    const patch = (revision: number) => request(app).patch(`/api/marketing/v2/campaigns/${row.id}`).set('X-Test-User', '10').set('Idempotency-Key', 'edit-contract-intent').send({ ...workflowDraft({ headline: 'Review this revised headline' }), revision });
    const changed = await patch(1).expect(200);
    expect(changed.body).toMatchObject({ revision: 2, status: 'DRAFT', ai: { status: 'NOT_EVALUATED' }, contentApproval: { status: 'PENDING' } });
    expect((await patch(1).expect(409)).body.code).toBe('REVISION_CONFLICT');
    expect((await post(`/campaigns/${row.id}/review`, { revision: 1, decision: 'APPROVE', note: 'These attestations belong to a stale revision.', policyConfirmed: true, mediaConfirmed: true }, 90).expect(409)).body.code).toBe('REVISION_CONFLICT');
  });
  it('requires explicit review attestations and keeps unavailable AI evidence distinct from a pass', async () => {
    generate.mockRejectedValueOnce(new Error('isolated AI unavailable'));
    const row = await created();
    expect((await post(`/campaigns/${row.id}/evaluate`, { revision: 1 }).expect(200)).body).toMatchObject({ status: 'PENDING_ADMIN', ai: { status: 'REQUIRES_REVIEW', score: null } });
    const review = { revision: 1, decision: 'APPROVE', note: 'Manual review of the actual media and property.', policyConfirmed: false, mediaConfirmed: true };
    await post(`/campaigns/${row.id}/review`, review, 90).expect(409);
    await post(`/campaigns/${row.id}/review`, { ...review, policyConfirmed: true }, 10).expect(403);
    const accepted = await post(`/campaigns/${row.id}/review`, { ...review, policyConfirmed: true }, 90).expect(200);
    expect(accepted.body).toMatchObject({ ai: { status: 'REQUIRES_REVIEW', score: null }, contentApproval: { status: 'APPROVED', aiFallback: true }, funding: { released: false }, metrics: null });
  });
  it('returns cost-plus quote strings and real checkout location without manufacturing captured funds', async () => {
    const row = await quoted();
    expect(row.quote).toMatchObject({ costMinor: '100000', profitMinor: '5000', totalMinor: '105000', markupPercent: 5, currency: 'INR' });
    expect(row.quote.lines.every((line: any) => typeof line.amountMinor === 'string')).toBe(true);
    const result = await post(`/campaigns/${row.id}/fund`, { revision: 1 }).expect(200);
    expect(result.body).toEqual({ url: 'https://checkout.stripe.com/isolated-contract', status: 'AWAITING_CAPTURE' });
    expect(checkout).toHaveBeenCalledOnce();
    expect((await get(`/campaigns/${row.id}`).expect(200)).body.funding).toMatchObject({ released: false, capturedMinor: null });
    const blocked = await post(`/campaigns/${row.id}/publish`, { revision: 1 }, 90).expect(409);
    expect(blocked.body.code).toBe('FINANCE_INSUFFICIENT_FUNDS');
    for (const table of ['marketing_finance_captures', 'marketing_finance_reservations', 'marketing_finance_authorizations', 'marketing_jobs']) expect((await fixture.pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  });
  it('returns publication as accepted queued work with no fabricated live observation after verified fixture capture', async () => {
    const row = await quoted(); const workflow = await service.get(row.id, { id: 10, role: 'host' });
    await finance.recordVerifiedCapture({ provider: 'RAZORPAY', accountId: 'isolated-account', eventId: 'isolated-event', paymentId: 'isolated-payment', orderId: 'isolated-order', quoteId: workflow.quote_id, currency: 'INR', amountMinor: row.quote.totalMinor, payloadHash: 'a'.repeat(64), capturedAt: new Date(Date.now() - 25 * 3600000).toISOString() });
    await post(`/campaigns/${row.id}/publish`, { revision: 1 }, 10).expect(403);
    const response = await post(`/campaigns/${row.id}/publish`, { revision: 1 }, 90).expect(202);
    expect(response.body).toMatchObject({ status: 'PUBLISH_QUEUED', delivery: { configuredStatus: null, observedStatus: null, observedAt: null, externalCampaignId: null }, metrics: null });
    await post(`/campaigns/${row.id}/publish`, { revision: 1 }, 90, 'second-browser-intent').expect(202);
    expect((await fixture.pool.query('SELECT kind,state FROM marketing_jobs')).rows).toEqual([{ kind: 'PUBLISH', state: 'PENDING' }]);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_authorizations')).rows).toHaveLength(0);
  });
  it('changes prospective markup only, rejects client expense rules and conflicting policy versions', async () => {
    const row = await quoted();
    await post('/admin/policy', { markupPercent: 3, expectedVersion: 0, reason: 'Founder approved introductory markup.', costItems: [{ label: 'Invented cost', amountMinor: '100' }] }, 90).expect(422);
    await post('/admin/policy', { markupPercent: 3, expectedVersion: 0, reason: 'Founder approved introductory markup.' }, 90).expect(200);
    expect((await get('/admin/workspace', 90).expect(200)).body.policy).toMatchObject({ markupPercent: 3, version: 1 });
    expect((await get(`/campaigns/${row.id}`).expect(200)).body.quote).toMatchObject({ profitMinor: '5000', totalMinor: '105000' });
    expect((await post('/admin/policy', { markupPercent: 4, expectedVersion: 0, reason: 'A stale simultaneous policy update.' }, 90).expect(409)).body.code).toBe('POLICY_VERSION_CONFLICT');
  });
  it('accepts only an owned, currently refundable balance and records pending refund instead of completed settlement', async () => {
    const row = await quoted(), workflow = await service.get(row.id, { id: 10, role: 'host' });
    await finance.recordVerifiedCapture({ provider: 'RAZORPAY', accountId: 'isolated-refund-account', eventId: 'isolated-refund-event', paymentId: 'isolated-refund-payment', orderId: 'isolated-refund-order', quoteId: workflow.quote_id, currency: 'INR', amountMinor: row.quote.totalMinor, payloadHash: 'd'.repeat(64), capturedAt: new Date(Date.now() - 25 * 3600000).toISOString() });
    const before = (await get(`/campaigns/${row.id}`).expect(200)).body;
    expect(before.funding).toMatchObject({ capturedMinor: '105000', refundableMinor: '105000', pendingRefundMinor: '0', refundedMinor: '0' });
    const body = { revision: row.revision, amountMinor: before.funding.refundableMinor, reason: 'Host requests the unused campaign funds back.' };
    await post(`/campaigns/${row.id}/refund`, body, 11, 'isolated-refund-key').expect(404);
    await post(`/campaigns/${row.id}/refund`, { ...body, revision: row.revision + 1 }, 10, 'isolated-refund-key').expect(409);
    await post(`/campaigns/${row.id}/refund`, { ...body, amountMinor: '105001' }, 10, 'isolated-refund-key').expect(409);
    const accepted = await post(`/campaigns/${row.id}/refund`, body, 10, 'isolated-refund-key').expect(202);
    expect(accepted.body).toMatchObject({ status: 'REQUESTED', refundRequestId: expect.any(String) });
    const repeated = await post(`/campaigns/${row.id}/refund`, body, 10, 'isolated-refund-key').expect(202);
    expect(repeated.body).toMatchObject({ status: 'REQUESTED', refundRequestId: accepted.body.refundRequestId, idempotent: true });
    await post(`/campaigns/${row.id}/refund`, { ...body, reason: 'Changed reason on an already recorded intent.' }, 10, 'isolated-refund-key').expect(409);
    expect((await get(`/campaigns/${row.id}`).expect(200)).body.funding).toMatchObject({ refundableMinor: '0', pendingRefundMinor: '105000', refundedMinor: '0', status: 'REFUND_PENDING' });
    expect((await fixture.pool.query("SELECT kind,state FROM marketing_jobs WHERE kind='REFUND'")).rows).toEqual([{ kind: 'REFUND', state: 'PENDING' }]);
    expect((await fixture.pool.query('SELECT status,amount_minor FROM marketing_finance_refunds')).rows).toEqual([{ status: 'REQUESTED', amount_minor: '105000' }]);
    expect((await get(`/campaigns/${row.id}/events`).expect(200)).body.events).toEqual(expect.arrayContaining([expect.objectContaining({ event_type: 'CAMPAIGN_REFUND_REQUESTED', evidence: expect.objectContaining({ reason: body.reason }) })]));
  });
});
