import {SearchPortfolioConflictAnalyzer} from '../../lib/marketing/portfolio/shadow.js';
import {KeywordResearchService} from '../../lib/marketing/portfolio/keywordResearch.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
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
import {MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';
import { normalizeMediaMeterEvidence } from '../../../components/marketing/StudioShared.js';
import { MarketingEngine } from '../../lib/marketing/engine.js';
import { enqueue } from '../../lib/marketing/jobs.js';
import type { AdProvider } from '../../lib/providers/AdProvider.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaBudgetMeter } from '../../../components/marketing/StudioShared.js';
import { ProviderReportPending } from '../../lib/providers/reporting.js';

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
  beforeAll(async () => { fixture = await createWorkflowPgFixture();await fixture.pool.query('ALTER TABLE listings ADD COLUMN amenities JSONB; ALTER TABLE room_types ADD COLUMN name TEXT,ADD COLUMN description TEXT,ADD COLUMN amenities JSONB');for(const file of ['012_harvo_marketing_settlement.sql','014_harvo_marketing_request_limits.sql','023_marketing_product_facts.sql','024_marketing_keyword_research.sql','026_search_portfolio_shadow.sql'])await fixture.pool.query(readFileSync(new URL(`../../migrations/${file}`,import.meta.url),'utf8')); });
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
    const pauseRecovery=new MarketingPauseRecovery(fixture.pool,async()=>{throw new Error('No provider pause is recoverable in this route fixture');});
    const facts=new CanonicalMarketingFacts(fixture.pool);
    const keywordResearch=new KeywordResearchService(fixture.pool,facts,{customerId:'9876543210',research:async()=>({source:'GOOGLE_KEYWORD_PLAN_IDEA',apiVersion:'v25',currency:'INR',observedAt:new Date().toISOString(),historical:true,truncated:false,ideas:[]})},workflowConfig.origin,{id:90,role:'system'},async()=>({}));
    app.use('/api/marketing/v2', createMarketingRouter(fixture.pool, service, bridge, authenticate,targeting,{portfolio:new SearchPortfolioConflictAnalyzer(fixture.pool,'9876543210'),settlement,pauseRecovery,facts,keywordResearch,conversions:createConversionConsumer(fixture.pool),guidance:new CampaignDraftGuidance({})}));
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

  it('exposes bounded owned fact capture with persisted-role authorization and explicit idempotency',async()=>{
    await get('/listings/20/marketing-facts',11).set('X-Test-Claimed-Role','admin').expect(404);
    const preview=await get('/listings/20/marketing-facts').expect(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    const body={listingId:20,expectedHash:preview.body.factHash,assets:[]};
    const saved=await post('/marketing-fact-snapshots',body).expect(201);
    const repeated=await post('/marketing-fact-snapshots',body).expect(201);expect(repeated.body.id).toBe(saved.body.id);
    await post('/marketing-fact-snapshots',{...body,hostId:11}).expect(422);
    await get('/listings/20/marketing-facts',90).expect(200);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
  });

  it('serves read-only keyword evidence with owned canonical facts, cache and shared-customer throttling',async()=>{
    const preview=await get('/listings/20/marketing-facts').expect(200);
    const body={listingId:20,factHash:preview.body.factHash,keywords:['garden villa'],geoTargetConstants:['geoTargetConstants/2356'],languageConstant:'languageConstants/1000'};
    await request(app).post('/api/marketing/v2/targeting/google/keyword-ideas').send(body).expect(401);
    await post('/targeting/google/keyword-ideas',body,11).expect(404);
    const first=await post('/targeting/google/keyword-ideas',body).expect(200);
    expect(first.headers['cache-control']).toBe('no-store');expect(first.body).toMatchObject({status:'EMPTY',cached:false});
    expect((await post('/targeting/google/keyword-ideas',body).expect(200)).body).toMatchObject({status:'EMPTY',cached:true});
    await post('/targeting/google/keyword-ideas',{...body,keywords:['another idea']}).expect(429);
    await post('/targeting/google/keyword-ideas',{...body,customerId:'9999999999'}).expect(422);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });

  it('restricts shadow inspection to persisted administrators and leaves the campaign unchanged',async()=>{
    const row=await created();
    await post(`/admin/campaigns/${row.id}/portfolio-shadow`,{revision:1}).expect(403);
    await post(`/admin/campaigns/${row.id}/portfolio-shadow`,{revision:1}).set('X-Test-Claimed-Role','admin').expect(403);
    const before=(await fixture.pool.query('SELECT * FROM marketing_campaign_workflows')).rows;
    await post(`/admin/campaigns/${row.id}/portfolio-shadow`,{revision:1},90).expect(422);
    expect((await fixture.pool.query('SELECT * FROM marketing_campaign_workflows')).rows).toEqual(before);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
  });

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
  it('keeps provider identities and internal event evidence administrative while host controls still work', async () => {
    const row=await created();
    const externalId='provider-private-campaign';
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED',provider_truth=$2 WHERE campaign_id=$1",[row.id,JSON.stringify({externalCampaignId:externalId,configuredStatus:'PAUSED',observedStatus:'PAUSED'})]);
    await fixture.pool.query("INSERT INTO marketing_workflow_events(campaign_id,host_id,revision,actor_id,actor_role,event_type,evidence) VALUES($1,10,1,'90','admin','PROVIDER_CONTROL_OBSERVED',$2)",[row.id,JSON.stringify({externalCampaignId:externalId,internalDiagnostic:'private-operator-payload'})]);
    for(const path of [`/campaigns/${row.id}`,'/workspace']) {
      const host=await get(path).set('X-Test-Claimed-Role','admin').expect(200);
      expect(JSON.stringify(host.body)).not.toContain(externalId);
      const view=path==='/workspace'?host.body.campaigns[0]:host.body;
      expect(view.delivery).toMatchObject({submitted:true,externalCampaignId:null});
      expect(JSON.stringify((await get(path,90).expect(200)).body)).toContain(externalId);
    }
    const events=(await get(`/campaigns/${row.id}/events`).expect(200)).body.events;
    expect(JSON.stringify(events)).not.toContain('private-operator-payload');
    expect(JSON.stringify(events)).not.toContain(externalId);
    expect(JSON.stringify((await get(`/campaigns/${row.id}/events`,90).expect(200)).body)).toContain(externalId);
    await post(`/campaigns/${row.id}/refresh`,{revision:1}).expect(202);
    const paused=await post(`/campaigns/${row.id}/pause`,{revision:1}).expect(202);
    expect(paused.body.delivery).toMatchObject({submitted:true,externalCampaignId:null});
    expect(JSON.stringify(paused.body)).not.toContain(externalId);
    await get(`/campaigns/${row.id}`,11).expect(404);
    await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");
    await get('/admin/workspace',90).set('X-Test-Claimed-Role','admin').expect(403);
    await get(`/campaigns/${row.id}`,90).set('X-Test-Claimed-Role','admin').expect(404);
  });
  it('exposes conversion blockers only to current administrators and never invents an accepted checkout source',async()=>{
    await get('/admin/readiness').expect(403);
    const result=await get('/admin/readiness',90).expect(200);
    expect(result.body.conversions).toMatchObject({enabled:false,canonicalSource:'NOT_CONNECTED',blockers:expect.arrayContaining(['CANONICAL_CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED','CANONICAL_ATTRIBUTION_CONSENT_AUTHORITY_REQUIRED'])});
  });
  it('requires current admin authority, exact input and request identity for pause recovery',async()=>{
    const row=await created(),path=`/admin/campaigns/${row.id}/recovery/adopt-pause`;
    const body={revision:1,reason:'Reviewed the original recorded pause operation.'};
    await request(app).post(`/api/marketing/v2${path}`).send(body).expect(401);
    await post(path,body).set('X-Test-Claimed-Role','admin').expect(403);
    await post(path,{...body,releaseFunds:true},90).expect(422);
    await post(path,{...body,reason:'retry'},90).expect(422);
    await request(app).post(`/api/marketing/v2${path}`).set('X-Test-User','90').send(body).expect(422);
    expect((await post(path,{...body,revision:2},90).expect(409)).body.code).toBe('REVISION_CONFLICT');
    expect((await post(path,body,90).expect(409)).body.code).toBe('PAUSE_RECOVERY_UNAVAILABLE');
    await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");
    await post(path,body,90).set('X-Test-Claimed-Role','admin').expect(403);
    expect((await fixture.pool.query('SELECT * FROM marketing_pause_recoveries')).rows).toHaveLength(0);
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
  it('accepts the studio refresh body and coalesces revision-bound read requests',async()=>{
    const row=await created();
    await fixture.pool.query('UPDATE marketing_campaign_workflows SET provider_truth=$2 WHERE campaign_id=$1',[row.id,JSON.stringify({externalCampaignId:'isolated-provider-1'})]);
    const first=await post(`/campaigns/${row.id}/refresh`,{revision:1}).expect(202);
    const again=await post(`/campaigns/${row.id}/refresh`,{revision:1}).expect(202);
    expect(first.body.jobId).toBe(again.body.jobId);expect(again.body.coalesced).toBe(true);
    await post(`/campaigns/${row.id}/refresh`,{revision:2}).expect(409);
    await post(`/campaigns/${row.id}/refresh`,{revision:1,reset:true}).expect(422);
  });
  it('restricts recovery inspection to current admins, preserves quarantine and excludes raw provider payloads',async()=>{
    const row=await created();
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='RECONCILIATION_REQUIRED' WHERE campaign_id=$1",[row.id]);
    await fixture.pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,publish_status,is_unknown_outcome,payload,error_details) VALUES($1,'META','CREATE_HIERARCHY','unknown-operation','UNKNOWN',true,$2,'private provider response')",[row.id,JSON.stringify({access_token:'private-token'})]);
    const before=(await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rows;
    await get(`/admin/campaigns/${row.id}/recovery?revision=1`,10).expect(403);
    await get(`/admin/campaigns/${row.id}/recovery?revision=2`,90).expect(409);
    const result=await get(`/admin/campaigns/${row.id}/recovery?revision=1`,90).expect(200);
    expect(result.body).toMatchObject({assessment:'QUARANTINED_REVIEW_REQUIRED',automaticRetryAllowed:false,revision:1});
    expect(JSON.stringify(result.body)).not.toMatch(/private-token|private provider response|access_token/);
    expect((await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rows).toEqual(before);
    expect((await fixture.pool.query('SELECT state FROM marketing_campaign_workflows WHERE campaign_id=$1',[row.id])).rows[0].state).toBe('RECONCILIATION_REQUIRED');
    await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");await get(`/admin/campaigns/${row.id}/recovery?revision=1`,90).expect(403);
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

  it('projects four distinct host flights through the authenticated workspace route with server-owned identity, independent pause and host isolation', async () => {
    // 1. Create four distinct flights for Host 10
    const f1 = await created({ title: 'Flight 1 · Active Monsoon', startDate: '2026-09-01', endDate: '2026-09-30' }, 'c-intent-1');
    const f2 = await created({ title: 'Flight 2 · Review Pending', startDate: '2026-10-01', endDate: '2026-10-15' }, 'c-intent-2');
    const f3 = await created({ title: 'Flight 3 · Stale Report', startDate: '2026-09-01', endDate: '2026-09-30' }, 'c-intent-3');
    const f4 = await created({ title: 'Flight 4 · Paused Zero', startDate: '2026-09-01', endDate: '2026-09-30' }, 'c-intent-4');

    // Populate provider truth & telemetry directly in database to simulate real workers/engine
    // Flight 1: Active with verified telemetry and server-owned identity (provider coherent with META draft)
    const t1 = {
      campaignId: f1.id,
      revision: f1.revision,
      budgetBasisMinor: '90000',
      source: 'META',
      accountTimeZone: 'Asia/Kolkata',
      report: { status: 'AVAILABLE', attemptedAt: new Date().toISOString(), dateStart: '2026-09-01', dateEnd: '2026-09-20' },
      currency: 'INR',
      spendMinor: '45000',
      impressions: 1000,
      clicks: 25,
      ctr: 0.025,
      observedAt: new Date().toISOString(),
      dateStart: '2026-09-01',
      dateEnd: '2026-09-20',
    };
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2,telemetry=$3 WHERE campaign_id=$1",
      [f1.id, JSON.stringify({ externalCampaignId: 'ext-f1', configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' }), JSON.stringify(t1)]
    );

    // Flight 2: Review pending / reporting NOT_STARTED
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='PENDING_ADMIN',telemetry=$2 WHERE campaign_id=$1",
      [f2.id, JSON.stringify({ report: { status: 'NOT_STARTED', attemptedAt: new Date().toISOString(), dateStart: '2026-10-01', dateEnd: '2026-10-15' } })]
    );

    // Flight 3: Refresh ERROR retaining compatible spend
    const t3 = {
      campaignId: f3.id,
      revision: f3.revision,
      budgetBasisMinor: '90000',
      source: 'META',
      accountTimeZone: 'Asia/Kolkata',
      report: { status: 'ERROR', attemptedAt: new Date().toISOString(), dateStart: '2026-09-01', dateEnd: '2026-09-20' },
      currency: 'INR',
      spendMinor: '30000',
      impressions: 600,
      clicks: 12,
      ctr: 0.02,
      observedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      dateStart: '2026-09-01',
      dateEnd: '2026-09-20',
    };
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2,telemetry=$3 WHERE campaign_id=$1",
      [f3.id, JSON.stringify({ externalCampaignId: 'ext-f3', configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' }), JSON.stringify(t3)]
    );

    // Flight 4: Paused with explicit provider zero
    const t4 = {
      campaignId: f4.id,
      revision: f4.revision,
      budgetBasisMinor: '90000',
      source: 'META',
      accountTimeZone: 'Asia/Kolkata',
      report: { status: 'AVAILABLE', attemptedAt: new Date().toISOString(), dateStart: '2026-09-01', dateEnd: '2026-09-20' },
      currency: 'INR',
      spendMinor: '0',
      impressions: 0,
      clicks: 0,
      ctr: null,
      observedAt: new Date().toISOString(),
      dateStart: '2026-09-01',
      dateEnd: '2026-09-20',
    };
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED',provider_truth=$2,telemetry=$3 WHERE campaign_id=$1",
      [f4.id, JSON.stringify({ externalCampaignId: 'ext-f4', configuredStatus: 'PAUSED', observedStatus: 'PAUSED', observedAt: new Date().toISOString(), deliveryConfirmed: false }), JSON.stringify(t4)]
    );

    // 2. Query authenticated workspace as Host 10
    const ws10 = await get('/workspace', 10).expect(200);
    expect(ws10.body.campaigns).toHaveLength(4);
    const c1 = ws10.body.campaigns.find((c: any) => c.id === f1.id);
    const c2 = ws10.body.campaigns.find((c: any) => c.id === f2.id);
    const c3 = ws10.body.campaigns.find((c: any) => c.id === f3.id);
    const c4 = ws10.body.campaigns.find((c: any) => c.id === f4.id);

    // Verify exact server-owned identity projected on Flight 1
    expect(c1.metrics).toMatchObject({
      campaignId: f1.id,
      revision: f1.revision,
      budgetBasisMinor: '90000',
      source: 'META',
      spendMinor: '45000',
      currency: 'INR',
      report: { status: 'AVAILABLE' },
    });
    expect(c1.delivery).toMatchObject({ observedStatus: 'ACTIVE', deliveryConfirmed: true, readiness: 'ELIGIBLE' });

    // Verify Flight 2 NOT_STARTED report status
    expect(c2.metrics?.report?.status).toBe('NOT_STARTED');

    // Verify Flight 3 ERROR with prior spend retained
    expect(c3.metrics).toMatchObject({
      campaignId: f3.id,
      revision: f3.revision,
      spendMinor: '30000',
      report: { status: 'ERROR' },
    });

    // Verify Flight 4 Paused with explicit zero
    expect(c4.metrics).toMatchObject({
      campaignId: f4.id,
      spendMinor: '0',
      report: { status: 'AVAILABLE' },
    });
    expect(c4.delivery).toMatchObject({ observedStatus: 'PAUSED' });

    // Verify each projected campaign is interpreted by the Studio meter normalizer.
    const m1 = normalizeMediaMeterEvidence(c1);
    expect(m1.status).toBe('AVAILABLE');
    expect(m1.utilizationPercent).toBe(50);
    expect(m1.reportedSpendMinor).toBe('45000');
    expect(m1.isAvailable).toBe(true);

    const m2 = normalizeMediaMeterEvidence(c2);
    expect(m2.status).toBe('NOT_STARTED');
    expect(m2.utilizationPercent).toBeNull();
    expect(m2.isAvailable).toBe(false);

    const m3 = normalizeMediaMeterEvidence(c3);
    expect(m3.status).toBe('STALE');
    expect(m3.statusLabel).toContain('older report retained');
    expect(m3.reportedSpendMinor).toBe('30000');
    expect(m3.utilizationPercent).toBe(33.33);

    const m4 = normalizeMediaMeterEvidence(c4);
    expect(m4.status).toBe('REPORTED_ZERO');
    expect(m4.utilizationPercent).toBe(0);
    expect(m4.isReportedZero).toBe(true);
    expect(m4.reportedSpendMinor).toBe('0');

    // 3. Verify Host 11 tenant isolation (host switching & hostile pause rejection)
    const ws11 = await get('/workspace', 11).expect(200);
    expect(ws11.body.campaigns).toHaveLength(0);

    // Host 11 attempts hostile pause on Host 10's Flight 1 -> 404 CAMPAIGN_NOT_FOUND
    await post(`/campaigns/${f1.id}/pause`, { revision: f1.revision }, 11, 'hostile-pause-intent').expect(404);
    const f1RowBefore = (await fixture.pool.query('SELECT state FROM marketing_campaign_workflows WHERE campaign_id=$1', [f1.id])).rows[0];
    expect(f1RowBefore.state).toBe('LIVE');
    const jobsForF1Before = (await fixture.pool.query("SELECT * FROM marketing_jobs WHERE campaign_id=$1 AND kind='PAUSE'", [f1.id])).rows;
    expect(jobsForF1Before).toHaveLength(0);

    // 4. Test independent pause on Flight 1 with strict isolation on other flights
    // Snapshot rows and jobs for flights 2, 3, 4 before Host 10 pauses flight 1
    const otherFlightsBefore = (await fixture.pool.query(
      'SELECT campaign_id, state, revision, pending_job_id FROM marketing_campaign_workflows WHERE campaign_id IN ($1, $2, $3) ORDER BY campaign_id',
      [f2.id, f3.id, f4.id]
    )).rows;
    const otherJobsBefore = (await fixture.pool.query(
      'SELECT id, campaign_id, kind, state FROM marketing_jobs WHERE campaign_id IN ($1, $2, $3) ORDER BY id',
      [f2.id, f3.id, f4.id]
    )).rows;

    const pauseRes = await post(`/campaigns/${f1.id}/pause`, { revision: f1.revision }, 10, 'pause-f1-intent').expect(202);
    expect(pauseRes.body).toMatchObject({ status: 'PAUSE_QUEUED' });

    // Verify Flight 1 is now PAUSE_QUEUED while Flight 3 remains unaffected LIVE
    const wsAfterPause = await get('/workspace', 10).expect(200);
    const c1After = wsAfterPause.body.campaigns.find((c: any) => c.id === f1.id);
    const c3After = wsAfterPause.body.campaigns.find((c: any) => c.id === f3.id);
    expect(c1After.status).toBe('PAUSE_QUEUED');
    expect(c3After.status).toBe('LIVE');

    // Verify Flights 2, 3, 4 database rows and jobs are 100% unchanged
    const otherFlightsAfter = (await fixture.pool.query(
      'SELECT campaign_id, state, revision, pending_job_id FROM marketing_campaign_workflows WHERE campaign_id IN ($1, $2, $3) ORDER BY campaign_id',
      [f2.id, f3.id, f4.id]
    )).rows;
    expect(otherFlightsAfter).toEqual(otherFlightsBefore);
    const otherJobsAfter = (await fixture.pool.query(
      'SELECT id, campaign_id, kind, state FROM marketing_jobs WHERE campaign_id IN ($1, $2, $3) ORDER BY id',
      [f2.id, f3.id, f4.id]
    )).rows;
    expect(otherJobsAfter).toEqual(otherJobsBefore);

    // 5. Test workspace pagination limits
    const wsPaged = await get(`/workspace?before=${f3.id}`, 10).expect(200);
    expect(wsPaged.body.campaigns.every((c: any) => c.id < f3.id)).toBe(true);
  });

  it('persists report-owned identity on provider telemetry fetch and honestly retains prior receipt on failed refresh', async () => {
    // 1. Setup inventory & room types to satisfy protection invariants
    await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(101, 20, 'INR', 'Sanctuary Suite', 'Sanctuary Suite Room') ON CONFLICT DO NOTHING");
    await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 101, d::date, 5 FROM generate_series('2026-10-01'::date, '2026-10-05'::date, interval '1 day') d ON CONFLICT DO NOTHING");

    // 2. Create campaign for Host 10 with matching stay dates
    const c = await created({
      title: 'Telemetry Provenance Flight',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
      stayStartDate: '2026-10-01',
      stayEndDate: '2026-10-03',
    }, 'c-telemetry-intent');

    // Set campaign to LIVE with provider truth
    const externalId = 'ext-prov-live-999';
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
      [c.id, JSON.stringify({ externalCampaignId: externalId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
    );
    await fixture.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id) VALUES($1,'META','CAMPAIGN',$2,$3)",[c.id,externalId,'act_live_999']);

    // 3. Stub provider with controllable success/failure
    let telemetryShouldFail = false;
    const mockProvider = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => ({
        provider: 'META',
        accountId: 'act_live_999',
        accountTimeZone: 'Asia/Kolkata',
      })),
      fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => {
        if (telemetryShouldFail) {
          throw new Error('Provider rate limit or temporary network failure');
        }
        return {
          provider: 'META',
          externalCampaignId: extId,
          dateStart: window.startDate,
          dateEnd: window.endDate,
          impressions: 1200,
          clicks: 30,
          ctr: 2.5,
          conversions: 1,
          cpc: 50,
          cpm: 1000,
          spend: { currency: 'INR', minor_units: 45000 },
          observedAt: new Date().toISOString(),
          dataFreshness: 'FRESH',
          providerMetadata: {
            accountId: 'act_live_999',
            accountTimeZone: 'Asia/Kolkata',
            dataAsOf: new Date().toISOString(),
            conversionDataAvailable: true,
          },
        };
      }),
    } as unknown as AdProvider;

    const gateway = { checkout: vi.fn(), verifyCapture: vi.fn() } as unknown as CampaignPaymentGateway;
    const engine = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockProvider);

    // 4. Enqueue TELEMETRY job and execute through engine worker
    await enqueue(fixture.pool, {
      campaignId: c.id,
      revision: c.revision,
      kind: 'TELEMETRY',
      key: `worker-telemetry-1:${c.id}:${c.revision}`,
    });
    const worked1 = await engine.runOnce();
    expect(worked1).toBe(true);

    // Assert PostgreSQL row persisted complete server-owned identity
    const dbTelemetrySuccess = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [c.id])).rows[0].telemetry;
    expect(dbTelemetrySuccess).toMatchObject({
      campaignId: c.id,
      revision: c.revision,
      budgetBasisMinor: '90000',
      externalCampaignId: externalId,
      spendMinor: '45000',
      currency: 'INR',
      report: { status: 'AVAILABLE' },
    });

    // Verify through authenticated /workspace route
    const ws1 = await get('/workspace', 10).expect(200);
    const proj1 = ws1.body.campaigns.find((item: any) => item.id === c.id);
    expect(proj1.metrics).toMatchObject({
      campaignId: c.id,
      revision: c.revision,
      budgetBasisMinor: '90000',
      spendMinor: '45000',
      report: { status: 'AVAILABLE' },
    });
    // Host projection must NOT leak provider internal externalCampaignId
    expect(proj1.metrics.externalCampaignId).toBeNull();

    // Verify route-to-normalizer calculation (calling normalizeMediaMeterEvidence on authenticated /workspace route response)
    const meter1 = normalizeMediaMeterEvidence(proj1);
    expect(meter1.status).toBe('AVAILABLE');
    expect(meter1.utilizationPercent).toBe(50);
    expect(meter1.reportedSpendMinor).toBe('45000');

    // 5. Simulate refresh failure: provider throws, worker retains prior receipt
    telemetryShouldFail = true;
    await enqueue(fixture.pool, {
      campaignId: c.id,
      revision: c.revision,
      kind: 'TELEMETRY',
      key: `worker-telemetry-2:${c.id}:${c.revision}`,
    });
    await engine.runOnce();

    // Assert PostgreSQL row retains prior spend and records ERROR status
    const dbTelemetryFailure = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [c.id])).rows[0].telemetry;
    expect(dbTelemetryFailure).toMatchObject({
      campaignId: c.id,
      revision: c.revision,
      budgetBasisMinor: '90000',
      externalCampaignId: externalId,
      spendMinor: '45000', // Preserved!
      report: { status: 'ERROR' },
    });

    // Verify route-to-normalizer projection for retained refresh error
    const ws2 = await get('/workspace', 10).expect(200);
    const proj2 = ws2.body.campaigns.find((item: any) => item.id === c.id);
    expect(proj2.metrics.spendMinor).toBe('45000');
    expect(proj2.metrics.report.status).toBe('ERROR');

    const meter2 = normalizeMediaMeterEvidence(proj2);
    expect(meter2.status).toBe('STALE');
    expect(meter2.statusLabel).toContain('older report retained');
    expect(meter2.reportedSpendMinor).toBe('45000');
    expect(meter2.utilizationPercent).toBe(50);

    // 6. Test legacy unbound telemetry row (no campaignId / revision / budgetBasisMinor)
    const legacyTelemetry = {
      source: 'META',
      currency: 'INR',
      spendMinor: '20000',
      report: { status: 'AVAILABLE', attemptedAt: new Date().toISOString(), dateStart: '2026-09-01', dateEnd: '2026-09-20' },
      dateStart: '2026-09-01',
      dateEnd: '2026-09-20',
    };
    await fixture.pool.query('UPDATE marketing_campaign_workflows SET telemetry=$2 WHERE campaign_id=$1', [c.id, JSON.stringify(legacyTelemetry)]);

    const ws3 = await get('/workspace', 10).expect(200);
    const proj3 = ws3.body.campaigns.find((item: any) => item.id === c.id);
    // Server projection must preserve missing fields as null rather than fabricating identity
    expect(proj3.metrics.campaignId).toBeNull();
    expect(proj3.metrics.revision).toBeNull();
    expect(proj3.metrics.budgetBasisMinor).toBeNull();

    // Route-to-normalizer must classify as HISTORICAL_UNVERIFIED without normal utilization percent, preserving durable spend
    const meter3 = normalizeMediaMeterEvidence(proj3, { now: Date.parse('2026-09-20T12:00:00Z') });
    expect(meter3.status).toBe('HISTORICAL_UNVERIFIED');
    expect(meter3.utilizationPercent).toBeNull();
    expect(meter3.reportedSpendMinor).toBe('20000');
    expect(meter3.statusLabel).toContain('unbound report identity');
  });

  it('bounds requested telemetry window by serving account calendar across UTC midnight (route-to-normalizer coverage)', async () => {
    // Simulated time: Oct 1, 2026 at 01:30 UTC
    const simulatedUtcTimestamp = '2026-10-01T01:30:00Z';
    const simulatedNow = Date.parse(simulatedUtcTimestamp);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(simulatedUtcTimestamp));

    try {
      // 1. Setup inventory & room types to satisfy protection invariants
      await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(102, 20, 'INR', 'Western Suite', 'Western Suite Room') ON CONFLICT DO NOTHING");
      await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 102, d::date, 5 FROM generate_series('2026-09-01'::date, '2026-10-15'::date, interval '1 day') d ON CONFLICT DO NOTHING");

      // 2. Case A: Western ad account (America/Los_Angeles, UTC-7).
      // At 01:30 UTC on Oct 1, local time is 18:30 on Sep 30 -> local calendar date is 2026-09-30.
      const cWest = await created({
        title: 'Western Account Flight',
        startDate: '2026-09-01',
        endDate: '2026-10-15',
        stayStartDate: '2026-10-01',
        stayEndDate: '2026-10-03',
      }, 'c-west-window-intent');

      const extWestId = 'ext-prov-west-777';
      await fixture.pool.query(
        "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
        [cWest.id, JSON.stringify({ externalCampaignId: extWestId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: simulatedUtcTimestamp, deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
      );

      let requestedWestWindow: any = null;
      const mockWestProvider = {
        fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
          provider: 'META',
          externalCampaignId: extId,
          normalizedState: 'LIVE',
          rawStatus: 'ACTIVE',
          rawEffectiveStatus: 'ACTIVE',
          isLive: true,
          isServingImpressions: true,
          lastObservedAt: simulatedUtcTimestamp,
          reconciliationRequired: false,
          readiness: 'ELIGIBLE',
        })),
        getServingAccountReportingCalendar: vi.fn(async () => ({
          provider: 'META',
          accountId: 'act_west_777',
          accountTimeZone: 'America/Los_Angeles',
        })),
        fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => {
          requestedWestWindow = { ...window };
          return {
            provider: 'META',
            externalCampaignId: extId,
            dateStart: window.startDate,
            dateEnd: window.endDate,
            impressions: 500,
            clicks: 15,
            ctr: 3.0,
            conversions: 0,
            cpc: 40,
            cpm: 1200,
            spend: { currency: 'INR', minor_units: 20000 },
            observedAt: simulatedUtcTimestamp,
            dataFreshness: 'FRESH',
            providerMetadata: {
              accountId: 'act_west_777',
              accountTimeZone: 'America/Los_Angeles',
              dataAsOf: simulatedUtcTimestamp,
              conversionDataAvailable: true,
            },
          };
        }),
      } as unknown as AdProvider;

      const gateway = { checkout: vi.fn(), verifyCapture: vi.fn() } as unknown as CampaignPaymentGateway;
      const engineWest = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockWestProvider);

      await enqueue(fixture.pool, {
        campaignId: cWest.id,
        revision: cWest.revision,
        kind: 'TELEMETRY',
        key: `worker-west:${cWest.id}:${cWest.revision}`,
      });
      const workedWest = await engineWest.runOnce();
      expect(workedWest).toBe(true);

      // Verify worker bounded requested end to account-local today (2026-09-30), NOT UTC (2026-10-01)
      expect(requestedWestWindow).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      // Verify persisted PostgreSQL row
      const dbWest = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [cWest.id])).rows[0].telemetry;
      expect(dbWest.report).toMatchObject({
        status: 'AVAILABLE',
        requestedDateStart: '2026-09-01',
        requestedDateEnd: '2026-09-30',
        dateStart: '2026-09-01',
        dateEnd: '2026-09-30',
      });

      // Verify route-to-normalizer projection: meter must NOT flag MISMATCH
      const wsWest = await get('/workspace', 10).expect(200);
      const projWest = wsWest.body.campaigns.find((item: any) => item.id === cWest.id);
      expect(projWest.metrics.requestedDateEnd).toBe('2026-09-30');
      expect(projWest.metrics.dateEnd).toBe('2026-09-30');

      const meterWest = normalizeMediaMeterEvidence(projWest, { now: simulatedNow });
      expect(meterWest.status).toBe('AVAILABLE');
      expect(meterWest.isAvailable).toBe(true);
      expect(meterWest.mismatchReason).toBeUndefined();

      // 3. Case B: India ad account (Asia/Kolkata, UTC+5:30).
      // At 01:30 UTC on Oct 1, local time is 07:00 on Oct 1 -> local calendar date is 2026-10-01.
      const cIndia = await created({
        title: 'India Account Flight',
        startDate: '2026-09-01',
        endDate: '2026-10-15',
        stayStartDate: '2026-10-01',
        stayEndDate: '2026-10-03',
      }, 'c-india-window-intent');

      const extIndiaId = 'ext-prov-india-888';
      await fixture.pool.query(
        "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
        [cIndia.id, JSON.stringify({ externalCampaignId: extIndiaId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: simulatedUtcTimestamp, deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
      );

      let requestedIndiaWindow: any = null;
      const mockIndiaProvider = {
        fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
          provider: 'META',
          externalCampaignId: extId,
          normalizedState: 'LIVE',
          rawStatus: 'ACTIVE',
          rawEffectiveStatus: 'ACTIVE',
          isLive: true,
          isServingImpressions: true,
          lastObservedAt: simulatedUtcTimestamp,
          reconciliationRequired: false,
          readiness: 'ELIGIBLE',
        })),
        getServingAccountReportingCalendar: vi.fn(async () => ({
          provider: 'META',
          accountId: 'act_india_888',
          accountTimeZone: 'Asia/Kolkata',
        })),
        fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => {
          requestedIndiaWindow = { ...window };
          return {
            provider: 'META',
            externalCampaignId: extId,
            dateStart: window.startDate,
            dateEnd: window.endDate,
            impressions: 800,
            clicks: 20,
            ctr: 2.5,
            conversions: 1,
            cpc: 45,
            cpm: 1100,
            spend: { currency: 'INR', minor_units: 30000 },
            observedAt: simulatedUtcTimestamp,
            dataFreshness: 'FRESH',
            providerMetadata: {
              accountId: 'act_india_888',
              accountTimeZone: 'Asia/Kolkata',
              dataAsOf: simulatedUtcTimestamp,
              conversionDataAvailable: true,
            },
          };
        }),
      } as unknown as AdProvider;

      const engineIndia = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockIndiaProvider);

      await enqueue(fixture.pool, {
        campaignId: cIndia.id,
        revision: cIndia.revision,
        kind: 'TELEMETRY',
        key: `worker-india:${cIndia.id}:${cIndia.revision}`,
      });
      const workedIndia = await engineIndia.runOnce();
      expect(workedIndia).toBe(true);

      // Verify worker requested up to India account-local today (2026-10-01)
      expect(requestedIndiaWindow).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-10-01',
      });

      // Verify route-to-normalizer projection
      const wsIndia = await get('/workspace', 10).expect(200);
      const projIndia = wsIndia.body.campaigns.find((item: any) => item.id === cIndia.id);
      expect(projIndia.metrics.requestedDateEnd).toBe('2026-10-01');
      expect(projIndia.metrics.dateEnd).toBe('2026-10-01');

      const meterIndia = normalizeMediaMeterEvidence(projIndia, { now: simulatedNow });
      expect(meterIndia.status).toBe('AVAILABLE');
      expect(meterIndia.isAvailable).toBe(true);
      expect(meterIndia.mismatchReason).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps requested window at scheduled flight end when observed after midnight (route-to-normalizer coverage)', async () => {
    // Simulated time: Oct 1, 2026 at 01:30 UTC
    const simulatedUtcTimestamp = '2026-10-01T01:30:00Z';
    const simulatedNow = Date.parse(simulatedUtcTimestamp);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(simulatedUtcTimestamp));

    try {
      // Setup inventory
      await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(103, 20, 'INR', 'Ended Suite', 'Ended Flight Suite') ON CONFLICT DO NOTHING");
      await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 103, d::date, 5 FROM generate_series('2026-09-01'::date, '2026-09-30'::date, interval '1 day') d ON CONFLICT DO NOTHING");

      // Campaign ended on 2026-09-30, now observed on 2026-10-01
      const cEnded = await created({
        title: 'Completed Flight Under Observation',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        stayStartDate: '2026-09-10',
        stayEndDate: '2026-09-15',
      }, 'c-ended-intent');

      const extEndedId = 'ext-prov-ended-666';
      await fixture.pool.query(
        "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
        [cEnded.id, JSON.stringify({ externalCampaignId: extEndedId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: simulatedUtcTimestamp, deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
      );

      let capturedWindow: any = null;
      const mockEndedProvider = {
        fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
          provider: 'META',
          externalCampaignId: extId,
          normalizedState: 'LIVE',
          rawStatus: 'ACTIVE',
          rawEffectiveStatus: 'ACTIVE',
          isLive: true,
          isServingImpressions: true,
          lastObservedAt: simulatedUtcTimestamp,
          reconciliationRequired: false,
          readiness: 'ELIGIBLE',
        })),
        getServingAccountReportingCalendar: vi.fn(async () => ({
          provider: 'META',
          accountId: 'act_ended_666',
          accountTimeZone: 'Asia/Kolkata',
        })),
        fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => {
          capturedWindow = { ...window };
          return {
            provider: 'META',
            externalCampaignId: extId,
            dateStart: window.startDate,
            dateEnd: window.endDate,
            impressions: 2500,
            clicks: 80,
            ctr: 3.2,
            conversions: 4,
            cpc: 35,
            cpm: 900,
            spend: { currency: 'INR', minor_units: 70000 },
            observedAt: simulatedUtcTimestamp,
            dataFreshness: 'FRESH',
            providerMetadata: {
              accountId: 'act_ended_666',
              accountTimeZone: 'Asia/Kolkata',
              dataAsOf: simulatedUtcTimestamp,
              conversionDataAvailable: true,
            },
          };
        }),
      } as unknown as AdProvider;

      const gateway = { checkout: vi.fn(), verifyCapture: vi.fn() } as unknown as CampaignPaymentGateway;
      const engineEnded = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockEndedProvider);

      await enqueue(fixture.pool, {
        campaignId: cEnded.id,
        revision: cEnded.revision,
        kind: 'TELEMETRY',
        key: `worker-ended:${cEnded.id}:${cEnded.revision}`,
      });
      const worked = await engineEnded.runOnce();
      expect(worked).toBe(true);

      // Verify window requested was capped at scheduled flight end (2026-09-30), NOT today (2026-10-01)
      expect(capturedWindow).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      // Verify route projection and meter: meter accepts final spend without MISMATCH
      const ws = await get('/workspace', 10).expect(200);
      const proj = ws.body.campaigns.find((item: any) => item.id === cEnded.id);
      expect(proj.metrics.requestedDateEnd).toBe('2026-09-30');
      expect(proj.metrics.dateEnd).toBe('2026-09-30');

      const meter = normalizeMediaMeterEvidence(proj, { now: simulatedNow });
      expect(meter.status).toBe('AVAILABLE');
      expect(meter.isAvailable).toBe(true);
      expect(meter.reportedSpendMinor).toBe('70000');
      expect(meter.mismatchReason).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies unstarted flight as NOT_STARTED without false zero or premature provider query (route-to-normalizer coverage)', async () => {
    // Simulated time: Oct 1, 2026 at 01:30 UTC
    const simulatedUtcTimestamp = '2026-10-01T01:30:00Z';
    const simulatedNow = Date.parse(simulatedUtcTimestamp);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(simulatedUtcTimestamp));

    try {
      await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(105, 20, 'INR', 'Future Suite', 'Future Flight Suite') ON CONFLICT DO NOTHING");
      await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 105, d::date, 5 FROM generate_series('2026-10-01'::date, '2026-10-20'::date, interval '1 day') d ON CONFLICT DO NOTHING");

      // Flight scheduled in future: 2026-10-05 to 2026-10-20
      const cFuture = await created({
        title: 'Unstarted Future Flight',
        startDate: '2026-10-05',
        endDate: '2026-10-20',
        stayStartDate: '2026-10-10',
        stayEndDate: '2026-10-15',
      }, 'c-future-intent');

      const extFutureId = 'ext-prov-future-555';
      await fixture.pool.query(
        "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
        [cFuture.id, JSON.stringify({ externalCampaignId: extFutureId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: simulatedUtcTimestamp, deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
      );

      const fetchTelemetrySnapshotSpy = vi.fn();
      const mockFutureProvider = {
        fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
          provider: 'META',
          externalCampaignId: extId,
          normalizedState: 'LIVE',
          rawStatus: 'ACTIVE',
          rawEffectiveStatus: 'ACTIVE',
          isLive: true,
          isServingImpressions: true,
          lastObservedAt: simulatedUtcTimestamp,
          reconciliationRequired: false,
          readiness: 'ELIGIBLE',
        })),
        getServingAccountReportingCalendar: vi.fn(async () => ({
          provider: 'META',
          accountId: 'act_future_555',
          accountTimeZone: 'Asia/Kolkata',
        })),
        fetchTelemetrySnapshot: fetchTelemetrySnapshotSpy,
      } as unknown as AdProvider;

      const gateway = { checkout: vi.fn(), verifyCapture: vi.fn() } as unknown as CampaignPaymentGateway;
      const engineFuture = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockFutureProvider);

      await enqueue(fixture.pool, {
        campaignId: cFuture.id,
        revision: cFuture.revision,
        kind: 'TELEMETRY',
        key: `worker-future:${cFuture.id}:${cFuture.revision}`,
      });
      const worked = await engineFuture.runOnce();
      expect(worked).toBe(true);

      // Provider fetchTelemetrySnapshot must NOT be called before start date
      expect(fetchTelemetrySnapshotSpy).not.toHaveBeenCalled();

      // Persisted row must have NOT_STARTED status with null requested/returned window bounds
      const dbFuture = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [cFuture.id])).rows[0].telemetry;
      expect(dbFuture.report.status).toBe('NOT_STARTED');
      expect(dbFuture.report.requestedDateStart).toBeNull();
      expect(dbFuture.report.requestedDateEnd).toBeNull();
      expect(dbFuture.report.dateStart).toBeNull();
      expect(dbFuture.report.dateEnd).toBeNull();

      // Verify route-to-normalizer: Studio meter shows NOT_STARTED without false zero spend
      const ws = await get('/workspace', 10).expect(200);
      const proj = ws.body.campaigns.find((item: any) => item.id === cFuture.id);
      expect(proj.metrics.report.status).toBe('NOT_STARTED');

      const meter = normalizeMediaMeterEvidence(proj, { now: simulatedNow });
      expect(meter.status).toBe('NOT_STARTED');
      expect(meter.isAvailable).toBe(false);
      expect(meter.reportedSpendMinor).toBeNull(); // No false zero!
      expect(meter.statusLabel).toContain('has not started');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed when provider returns window exceeding requested bounds or when account timezone is unavailable (route-to-normalizer coverage)', async () => {
    // 1. Setup inventory & room types
    await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(104, 20, 'INR', 'Security Suite', 'Security Suite Room') ON CONFLICT DO NOTHING");
    await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 104, d::date, 5 FROM generate_series('2026-09-01'::date, '2026-10-15'::date, interval '1 day') d ON CONFLICT DO NOTHING");

    const cExcess = await created({
      title: 'Exceeding Window Flight',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      stayStartDate: '2026-09-10',
      stayEndDate: '2026-09-15',
    }, 'c-excess-intent');

    const extExcessId = 'ext-prov-excess-444';
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
      [cExcess.id, JSON.stringify({ externalCampaignId: extExcessId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
    );

    // Provider returns dateEnd exceeding the requested bound (returns 2026-10-05 when asked for <= 2026-09-30)
    const mockExcessProvider = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => ({
        provider: 'META',
        accountId: 'act_excess_444',
        accountTimeZone: 'Asia/Kolkata',
      })),
      fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => ({
        provider: 'META',
        externalCampaignId: extId,
        dateStart: window.startDate,
        dateEnd: '2026-10-05', // Exceeds requested window bound!
        impressions: 100,
        clicks: 5,
        ctr: 5.0,
        conversions: 0,
        cpc: 20,
        cpm: 500,
        spend: { currency: 'INR', minor_units: 5000 },
        observedAt: new Date().toISOString(),
        dataFreshness: 'FRESH',
        providerMetadata: {
          accountId: 'act_excess_444',
          accountTimeZone: 'Asia/Kolkata',
        },
      })),
    } as unknown as AdProvider;

    const gateway = { checkout: vi.fn(), verifyCapture: vi.fn() } as unknown as CampaignPaymentGateway;
    const engineExcess = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockExcessProvider);

    await enqueue(fixture.pool, {
      campaignId: cExcess.id,
      revision: cExcess.revision,
      kind: 'TELEMETRY',
      key: `worker-excess:${cExcess.id}:${cExcess.revision}`,
    });
    // Worker catches TELEMETRY_WINDOW_MISMATCH, marks job failed, and fails closed
    const workedExcess = await engineExcess.runOnce();
    expect(workedExcess).toBe(false);
    const failedJob = (await fixture.pool.query("SELECT state, last_error FROM marketing_jobs WHERE campaign_id=$1 AND kind=$2", [cExcess.id, 'TELEMETRY'])).rows[0];
    expect(failedJob.state).toBe('RETRY');
    expect(failedJob.last_error).toBe('TELEMETRY_WINDOW_MISMATCH');

    // Telemetry in DB must NOT have been updated with the invalid snapshot
    const dbExcess = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [cExcess.id])).rows[0].telemetry;
    expect(dbExcess?.report?.status).not.toBe('AVAILABLE');

    // Mark protective pause job queued for cExcess as DEAD so it does not block subsequent tests
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cExcess.id]);

    // 2. Case: Missing/unavailable account timezone for fresh flight without prior spend
    const cNoTz = await created({
      title: 'Missing Timezone Flight',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
      stayStartDate: '2026-10-01',
      stayEndDate: '2026-10-05',
    }, 'c-notz-intent');

    const extNoTzId = 'ext-prov-notz-333';
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
      [cNoTz.id, JSON.stringify({ externalCampaignId: extNoTzId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
    );

    const mockNoTzProvider = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => {
        throw new Error('Timezone unavailable');
      }),
      fetchTelemetrySnapshot: vi.fn(),
    } as unknown as AdProvider;

    const engineNoTz = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockNoTzProvider);
    await enqueue(fixture.pool, {
      campaignId: cNoTz.id,
      revision: cNoTz.revision,
      kind: 'TELEMETRY',
      key: `worker-notz:${cNoTz.id}:${cNoTz.revision}`,
    });
    const workedNoTz = await engineNoTz.runOnce();
    expect(workedNoTz).toBe(true);

    // Persisted telemetry must record ACCOUNT_TIMEZONE_UNAVAILABLE with null window bounds
    const dbNoTz = (await fixture.pool.query('SELECT telemetry FROM marketing_campaign_workflows WHERE campaign_id=$1', [cNoTz.id])).rows[0].telemetry;
    expect(dbNoTz.report.status).toBe('ACCOUNT_TIMEZONE_UNAVAILABLE');
    expect(dbNoTz.report.requestedDateStart).toBeNull();
    expect(dbNoTz.report.requestedDateEnd).toBeNull();
    expect(dbNoTz.report.dateStart).toBeNull();
    expect(dbNoTz.report.dateEnd).toBeNull();

    // Route-to-normalizer: Studio meter displays UNAVAILABLE with explicit label and no spend
    const wsNoTz = await get('/workspace', 10).expect(200);
    const projNoTz = wsNoTz.body.campaigns.find((item: any) => item.id === cNoTz.id);
    expect(projNoTz.metrics.report.status).toBe('ACCOUNT_TIMEZONE_UNAVAILABLE');

    const meterNoTz = normalizeMediaMeterEvidence(projNoTz);
    expect(meterNoTz.status).toBe('UNAVAILABLE');
    expect(meterNoTz.statusLabel).toBe('Account time zone unavailable');
    expect(meterNoTz.reportedSpendMinor).toBeNull();

    // Mark protective pause job queued for cNoTz as DEAD so it does not block subsequent tests
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cNoTz.id]);

    // 3. Case: Prior valid spend retained on subsequent timezone lookup failure
    await fixture.pool.query("INSERT INTO room_types(id, listing_id, currency, name, description) VALUES(106, 20, 'INR', 'Retain Suite', 'Retain Suite Room') ON CONFLICT DO NOTHING");
    await fixture.pool.query("INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units) SELECT 20, 106, d::date, 5 FROM generate_series('2026-09-01'::date, '2026-10-20'::date, interval '1 day') d ON CONFLICT DO NOTHING");

    const cRetain = await created({
      title: 'Retained Spend Timezone Failure Flight',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
      stayStartDate: '2026-10-01',
      stayEndDate: '2026-10-05',
    }, 'c-retain-intent');

    const extRetainId = 'ext-prov-retain-222';
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
      [cRetain.id, JSON.stringify({ externalCampaignId: extRetainId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
    );
    await fixture.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id) VALUES($1,'META','CAMPAIGN',$2,$3)",[cRetain.id,extRetainId,'act_retain_222']);

    // Initial successful telemetry run with valid spend
    const freshTimestamp = new Date().toISOString();
    const mockRetainProviderSuccess = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: freshTimestamp,
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => ({
        provider: 'META',
        accountId: 'act_retain_222',
        accountTimeZone: 'Asia/Kolkata',
      })),
      fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => ({
        provider: 'META',
        externalCampaignId: extId,
        dateStart: window.startDate,
        dateEnd: window.endDate,
        impressions: 1200,
        clicks: 35,
        ctr: 2.9,
        conversions: 2,
        cpc: 30,
        cpm: 800,
        spend: { currency: 'INR', minor_units: 30000 },
        observedAt: freshTimestamp,
        dataFreshness: 'FRESH',
        providerMetadata: {
          accountId: 'act_retain_222',
          accountTimeZone: 'Asia/Kolkata',
          dataAsOf: freshTimestamp,
          conversionDataAvailable: true,
        },
      })),
    } as unknown as AdProvider;

    const engineRetain1 = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockRetainProviderSuccess);
    await enqueue(fixture.pool, {
      campaignId: cRetain.id,
      revision: cRetain.revision,
      kind: 'TELEMETRY',
      key: `worker-retain-1:${cRetain.id}:${cRetain.revision}`,
    });
    const workedRetain1 = await engineRetain1.runOnce();
    expect(workedRetain1).toBe(true);

    // A later empty insights response cannot erase an already bound report.
    const noNewReportProvider = {
      ...mockRetainProviderSuccess,
      fetchTelemetrySnapshot: vi.fn(async () => { throw new ProviderReportPending('NO_REPORT'); }),
    } as unknown as AdProvider;
    const noNewReportEngine = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => noNewReportProvider);
    await enqueue(fixture.pool, { campaignId: cRetain.id, revision: cRetain.revision, kind: 'TELEMETRY', key: `worker-retain-empty:${cRetain.id}` });
    expect(await noNewReportEngine.runOnce()).toBe(true);
    const noNewReportProjection = (await get('/workspace', 10).expect(200)).body.campaigns.find((item: any) => item.id === cRetain.id);
    expect(noNewReportProjection.metrics.report.status).toBe('NO_REPORT');
    expect(noNewReportProjection.metrics.spendMinor).toBe('30000');
    const noNewReportMarkup = renderToStaticMarkup(React.createElement(MediaBudgetMeter, { campaign: noNewReportProjection, compact: true }));
    expect(noNewReportMarkup).toContain('Media (Older report)');
    expect(noNewReportMarkup).toContain('role="progressbar"');

    // Ensure state remains LIVE and no protective pause blocks the next run
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cRetain.id]);
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='LIVE' WHERE campaign_id=$1", [cRetain.id]);

    // Subsequent telemetry run encounters timezone resolution failure
    const mockRetainProviderFailure = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => {
        throw new Error('Serving account calendar unavailable');
      }),
      fetchTelemetrySnapshot: vi.fn(),
    } as unknown as AdProvider;

    const engineRetain2 = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockRetainProviderFailure);
    await enqueue(fixture.pool, {
      campaignId: cRetain.id,
      revision: cRetain.revision,
      kind: 'TELEMETRY',
      key: `worker-retain-2:${cRetain.id}:${cRetain.revision}`,
    });
    const workedRetain2 = await engineRetain2.runOnce();
    expect(workedRetain2).toBe(true);

    // Mark protective pause job queued by ACCOUNT_TIMEZONE_UNAVAILABLE as DEAD so it does not block subsequent tests
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cRetain.id]);

    // Authenticated route output must also render through the actual Studio meter.
    const wsRetain = await get('/workspace', 10).expect(200);
    const projRetain = wsRetain.body.campaigns.find((item: any) => item.id === cRetain.id);
    expect(projRetain.metrics.report.status).toBe('ACCOUNT_TIMEZONE_UNAVAILABLE');
    expect(projRetain.metrics.spendMinor).toBe('30000');

    const meterRetain = normalizeMediaMeterEvidence(projRetain);
    expect(meterRetain.status).toBe('STALE');
    expect(meterRetain.isStale).toBe(true);
    expect(meterRetain.isAvailable).toBe(false);
    expect(meterRetain.reportedSpendMinor).toBe('30000');
    // A changed local serving-account binding invalidates the historical
    // receipt even when the campaign and authorized budget are unchanged.
    await fixture.pool.query("UPDATE provider_entities SET account_id=$2 WHERE campaign_id=$1 AND entity_type='CAMPAIGN'",[cRetain.id,'act_other_account']);
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'",[cRetain.id]);
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='LIVE' WHERE campaign_id=$1",[cRetain.id]);
    await enqueue(fixture.pool,{campaignId:cRetain.id,revision:cRetain.revision,kind:'TELEMETRY',key:`worker-retain-changed-account:${cRetain.id}`});
    expect(await engineRetain2.runOnce()).toBe(true);
    const changedAccount=(await get('/workspace',10).expect(200)).body.campaigns.find((item:any)=>item.id===cRetain.id);
    expect(changedAccount.metrics.report.status).toBe('ACCOUNT_TIMEZONE_UNAVAILABLE');
    expect(changedAccount.metrics.spendMinor).toBeNull();
    expect(normalizeMediaMeterEvidence(changedAccount).reportedSpendMinor).toBeNull();
    expect(meterRetain.statusLabel).toBe('Account time zone unavailable · older report retained');
    expect(meterRetain.isReportedZero).toBe(false);
    expect(meterRetain.dataAsOf).toBeNull();
    expect(meterRetain.utilizationPercent).not.toBeNull();
    const retainedMarkup = renderToStaticMarkup(React.createElement(MediaBudgetMeter, { campaign: projRetain, compact: true }));
    expect(retainedMarkup).toContain('Media (Older report)');
    expect(retainedMarkup).toContain('Refresh pending');
    expect(retainedMarkup).toContain('role="progressbar"');
    const changedAccountMarkup = renderToStaticMarkup(React.createElement(MediaBudgetMeter, { campaign: changedAccount, compact: true }));
    expect(changedAccountMarkup).not.toContain('role="progressbar"');

    // Mark protective pause job queued for cRetain as DEAD so it does not block subsequent tests
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cRetain.id]);

    // 4. Case: Incompatible prior evidence does NOT regain normal utilization on timezone failure
    const cMismatch = await created({
      title: 'Incompatible Telemetry Flight',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
    }, 'c-mismatch-intent');

    // Simulate an incompatible prior telemetry (revision mismatch between campaign and report)
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE', telemetry=$2 WHERE campaign_id=$1",
      [cMismatch.id, JSON.stringify({
        campaignId: cMismatch.id,
        revision: cMismatch.revision + 1, // REVISION MISMATCH!
        budgetBasisMinor: cMismatch.mediaBudgetMinor,
        currency: 'INR',
        source: 'META',
        spendMinor: '15000',
        report: { status: 'ACCOUNT_TIMEZONE_UNAVAILABLE', requestedDateStart: null, requestedDateEnd: null, dateStart: null, dateEnd: null },
      })]
    );

    const wsMismatch = await get('/workspace', 10).expect(200);
    const projMismatch = wsMismatch.body.campaigns.find((item: any) => item.id === cMismatch.id);
    const meterMismatch = normalizeMediaMeterEvidence(projMismatch);
    expect(meterMismatch.status).toBe('MISMATCH');
    expect(meterMismatch.utilizationPercent).toBeNull();
    expect(meterMismatch.reportedSpendMinor).toBeNull();

    // 5. Case: Snapshot timezone / account mismatch fails closed
    const cSnapMismatch = await created({
      title: 'Snapshot Mismatch Flight',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
      stayStartDate: '2026-10-01',
      stayEndDate: '2026-10-05',
    }, 'c-snap-mismatch-intent');

    const extSnapId = 'ext-prov-snap-111';
    await fixture.pool.query(
      "UPDATE marketing_campaign_workflows SET state='LIVE',provider_truth=$2 WHERE campaign_id=$1",
      [cSnapMismatch.id, JSON.stringify({ externalCampaignId: extSnapId, configuredStatus: 'ACTIVE', observedStatus: 'ACTIVE', observedAt: new Date().toISOString(), deliveryConfirmed: true, readiness: 'ELIGIBLE' })]
    );

    // Snapshot returns different timezone than calendar
    const mockSnapTzMismatchProvider = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => ({
        provider: 'META',
        accountId: 'act_snap_111',
        accountTimeZone: 'Asia/Kolkata',
      })),
      fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => ({
        provider: 'META',
        externalCampaignId: extId,
        dateStart: window.startDate,
        dateEnd: window.endDate,
        impressions: 100,
        clicks: 5,
        ctr: 5.0,
        conversions: 0,
        cpc: 20,
        cpm: 500,
        spend: { currency: 'INR', minor_units: 5000 },
        observedAt: new Date().toISOString(),
        dataFreshness: 'FRESH',
        providerMetadata: {
          accountId: 'act_snap_111',
          accountTimeZone: 'America/New_York', // Mismatch!
        },
      })),
    } as unknown as AdProvider;

    const engineSnapTz = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockSnapTzMismatchProvider);
    const snapTzJobId = await enqueue(fixture.pool, {
      campaignId: cSnapMismatch.id,
      revision: cSnapMismatch.revision,
      kind: 'TELEMETRY',
      key: `worker-snaptz:${cSnapMismatch.id}:${cSnapMismatch.revision}`,
    });
    const workedSnapTz = await engineSnapTz.runOnce();
    expect(workedSnapTz).toBe(false);
    const snapTzJob = (await fixture.pool.query("SELECT state, last_error FROM marketing_jobs WHERE id=$1", [snapTzJobId])).rows[0];
    expect(snapTzJob.state).toBe('RETRY');
    expect(snapTzJob.last_error).toBe('TELEMETRY_TIMEZONE_MISMATCH');

    // Mark pause job dead and reset workflow state to LIVE for second mismatch test
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'", [cSnapMismatch.id]);
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='LIVE' WHERE campaign_id=$1", [cSnapMismatch.id]);

    // Snapshot returns different accountId than calendar
    const mockSnapAccMismatchProvider = {
      fetchAuthoritativeDeliveryTruth: vi.fn(async (extId: string) => ({
        provider: 'META',
        externalCampaignId: extId,
        normalizedState: 'LIVE',
        rawStatus: 'ACTIVE',
        rawEffectiveStatus: 'ACTIVE',
        isLive: true,
        isServingImpressions: true,
        lastObservedAt: new Date().toISOString(),
        reconciliationRequired: false,
        readiness: 'ELIGIBLE',
      })),
      getServingAccountReportingCalendar: vi.fn(async () => ({
        provider: 'META',
        accountId: 'act_snap_111',
        accountTimeZone: 'Asia/Kolkata',
      })),
      fetchTelemetrySnapshot: vi.fn(async (extId: string, window: any) => ({
        provider: 'META',
        externalCampaignId: extId,
        dateStart: window.startDate,
        dateEnd: window.endDate,
        impressions: 100,
        clicks: 5,
        ctr: 5.0,
        conversions: 0,
        cpc: 20,
        cpm: 500,
        spend: { currency: 'INR', minor_units: 5000 },
        observedAt: new Date().toISOString(),
        dataFreshness: 'FRESH',
        providerMetadata: {
          accountId: 'act_wrong_account', // Mismatch!
          accountTimeZone: 'Asia/Kolkata',
        },
      })),
    } as unknown as AdProvider;

    const engineSnapAcc = new MarketingEngine(fixture.pool, service, workflowConfig, gateway, () => mockSnapAccMismatchProvider);
    const snapAccJobId = await enqueue(fixture.pool, {
      campaignId: cSnapMismatch.id,
      revision: cSnapMismatch.revision,
      kind: 'TELEMETRY',
      key: `worker-snapacc:${cSnapMismatch.id}:${cSnapMismatch.revision}`,
    });
    const workedSnapAcc = await engineSnapAcc.runOnce();
    expect(workedSnapAcc).toBe(false);
    const snapAccJob = (await fixture.pool.query("SELECT state, last_error FROM marketing_jobs WHERE id=$1", [snapAccJobId])).rows[0];
    expect(snapAccJob.state).toBe('RETRY');
    expect(snapAccJob.last_error).toBe('TELEMETRY_ACCOUNT_MISMATCH');

    // Missing metadata is not permission to assume the account matched.
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='PAUSE'",[cSnapMismatch.id]);
    await fixture.pool.query("UPDATE marketing_jobs SET state='DEAD' WHERE campaign_id=$1 AND kind='TELEMETRY' AND state='RETRY'",[cSnapMismatch.id]);
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='LIVE' WHERE campaign_id=$1",[cSnapMismatch.id]);
    const missingAccountProvider={...mockSnapAccMismatchProvider,
      fetchTelemetrySnapshot:vi.fn(async(extId:string,window:any)=>({
        provider:'META',externalCampaignId:extId,dateStart:window.startDate,dateEnd:window.endDate,
        impressions:100,clicks:5,ctr:0.05,conversions:0,cpc:20,cpm:500,
        spend:{currency:'INR',minor_units:5000},observedAt:new Date().toISOString(),dataFreshness:'FRESH',
        providerMetadata:{accountTimeZone:'Asia/Kolkata'},
      })),
    } as unknown as AdProvider;
    const missingEngine=new MarketingEngine(fixture.pool,service,workflowConfig,gateway,()=>missingAccountProvider);
    const missingJobId=await enqueue(fixture.pool,{campaignId:cSnapMismatch.id,revision:cSnapMismatch.revision,kind:'TELEMETRY',key:`worker-missing-account:${cSnapMismatch.id}`});
    expect(await missingEngine.runOnce()).toBe(false);
    expect((await fixture.pool.query('SELECT state,last_error FROM marketing_jobs WHERE id=$1',[missingJobId])).rows[0]).toMatchObject({state:'RETRY',last_error:'TELEMETRY_ACCOUNT_MISMATCH'});
    const missingProjection=(await get('/workspace',10).expect(200)).body.campaigns.find((item:any)=>item.id===cSnapMismatch.id);
    expect(missingProjection.metrics.report.status).toBe('ERROR');
    expect(missingProjection.metrics.spendMinor).toBeNull();
    expect(missingProjection.metrics).not.toHaveProperty('accountId');
  });
});
