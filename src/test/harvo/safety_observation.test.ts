import { ProviderReportPending } from '../../lib/providers/reporting.js';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {MarketingEngine} from '../../lib/marketing/engine.js';
import {enqueue} from '../../lib/marketing/jobs.js';
import type {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import type {AdProvider} from '../../lib/providers/AdProvider.js';

const host={id:10,role:'host' as const};
describe('independent local safety and durable fair observation scheduling',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,workflow:MarketingWorkflowService,engine:MarketingEngine;
 const truth=vi.fn(),telemetry=vi.fn(),mutate=vi.fn();
 const provider={fetchAuthoritativeDeliveryTruth:truth,fetchTelemetrySnapshot:telemetry,createCampaignHierarchy:mutate,pauseCampaign:mutate,resumeCampaign:mutate} as unknown as AdProvider;
 const gateway={} as CampaignPaymentGateway;
 const runner=()=>new MarketingEngine(fixture.pool,workflow,workflowConfig,gateway,()=>provider);
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();});afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{
  await fixture.reset();vi.restoreAllMocks();
  await fixture.pool.query("INSERT INTO room_types VALUES(1,20,'INR')");await fixture.pool.query("INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units) SELECT 20,1,d::date,2 FROM generate_series('2099-01-02'::date,'2099-01-03'::date,interval '1 day') d");
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:{} as WorkflowFinancePort,fundingEnabled:false,publishingEnabled:false,activationEnabled:false,configurationReasons:[]});engine=runner();
  truth.mockReset().mockImplementation(async(externalCampaignId:string)=>({provider:'META',externalCampaignId,normalizedState:'UNKNOWN',isLive:false,isServingImpressions:false,lastObservedAt:new Date().toISOString()}));
  telemetry.mockReset().mockImplementation(async()=>({dateStart:'2026-09-01',dateEnd:'2026-09-13',impressions:100,clicks:2,ctr:2,conversions:0,spend:{currency:'INR',minor_units:1000},observedAt:new Date().toISOString(),dataFreshness:'DELAYED'}));
  mutate.mockReset().mockRejectedValue(new Error('These read-only regressions must never mutate a provider.'));vi.spyOn(console,'error').mockImplementation(()=>undefined);
 });
 async function active(){const row=await workflow.create(host,workflowDraft({startDate:'2026-09-01',endDate:'2026-09-30',stayStartDate:'2099-01-02',stayEndDate:'2099-01-04'}));await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PROVIDER_REVIEW',provider_truth=$2,telemetry=$3 WHERE campaign_id=$1",[row.campaign_id,JSON.stringify({externalCampaignId:`isolated-provider-${row.campaign_id}`,configuredStatus:'ACTIVE',observedStatus:'UNKNOWN',observedAt:'2026-09-01T00:00:00Z',deliveryConfirmed:false}),JSON.stringify({impressions:7,clicks:1,spendMinor:'400',observedAt:'2026-09-01T00:00:00Z'})]);return row;}
 const pauses=async()=>(await fixture.pool.query("SELECT * FROM marketing_jobs WHERE kind='PAUSE'")).rows;
 it.each(['INVENTORY_UNAVAILABLE','LISTING_CHANGED'])('queues %s containment before a never-resolving report is attempted',async reason=>{
  const row=await active();truth.mockImplementation(()=>new Promise(()=>undefined));
  if(reason==='INVENTORY_UNAVAILABLE')await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units');else await fixture.pool.query('UPDATE listings SET price=price+100 WHERE id=20');
  await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:`local-${reason}`});expect(await engine.runOnce()).toBe(true);
  const current=await workflow.get(row.campaign_id,host);expect(current).toMatchObject({state:'PAUSE_QUEUED',last_error:reason,telemetry:{impressions:7,spendMinor:'400'},provider_truth:{configuredStatus:'ACTIVE',observedStatus:'UNKNOWN',deliveryConfirmed:false}});
  expect(truth).not.toHaveBeenCalled();expect(telemetry).not.toHaveBeenCalled();expect(mutate).not.toHaveBeenCalled();expect(await pauses()).toHaveLength(1);
  expect((await fixture.pool.query("SELECT evidence FROM marketing_workflow_events WHERE event_type='PROTECTION_PAUSE_QUEUED'")).rows[0].evidence).toEqual({reasons:[reason],observation:null});
 });
 it('rechecks local invalidation that occurs while actual reporting is in flight',async()=>{
  const row=await active();truth.mockImplementationOnce(async()=>{await fixture.pool.query('UPDATE listings SET price=price+100 WHERE id=20');return {provider:'META',externalCampaignId:`isolated-provider-${row.campaign_id}`,normalizedState:'UNKNOWN',isLive:false,isServingImpressions:false,lastObservedAt:new Date().toISOString()};});
  await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'changed-during-read'});expect(await engine.runOnce()).toBe(true);
  expect(await workflow.get(row.campaign_id,host)).toMatchObject({state:'PAUSE_QUEUED',last_error:'SPEND_OBSERVATION_STALE, LISTING_CHANGED'});expect(telemetry).toHaveBeenCalledOnce();expect(mutate).not.toHaveBeenCalled();
 });
 it('preserves recorded metrics and a queued host pause when reporting fails',async()=>{
  const row=await active();truth.mockImplementationOnce(async()=>{await workflow.schedule(row.campaign_id,host,1,'PAUSE','host-pause-during-read');throw Object.assign(new Error('Unavailable provider report'),{code:'PROVIDER_UNAVAILABLE'});});
  await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'unavailable-read'});expect(await engine.runOnce()).toBe(false);
  const paused=await workflow.get(row.campaign_id,host);expect(paused).toMatchObject({state:'PAUSE_QUEUED',telemetry:{impressions:7,spendMinor:'400',observedAt:'2026-09-01T00:00:00Z'}});expect(await pauses()).toHaveLength(1);expect((await pauses())[0].id).toBe(paused.pending_job_id);expect(mutate).not.toHaveBeenCalled();
 });
 it('does not let a stale observation worker create a safety action or rewrite evidence',async()=>{
  const row=await active();await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units');await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'PROTECTION',key:'stale-safety-worker'});
  const claim=engine.queue.claim.bind(engine.queue);vi.spyOn(engine.queue,'claim').mockImplementationOnce(async()=>{const job=await claim();await fixture.pool.query("UPDATE marketing_jobs SET fence=fence+1,state='RETRY',lease_until=NULL WHERE id=$1",[job!.id]);return job;});
  expect(await engine.runOnce()).toBe(false);expect(await pauses()).toHaveLength(0);expect(truth).not.toHaveBeenCalled();expect((await workflow.get(row.campaign_id,host)).state).toBe('PROVIDER_REVIEW');
 });
 it('persists fresh status and completes a no-report job without fabricating spend or retry exhaustion',async()=>{
  const row=await active();truth.mockResolvedValueOnce({provider:'META',externalCampaignId:`isolated-provider-${row.campaign_id}`,normalizedState:'REVIEWING',isLive:false,isServingImpressions:false,lastObservedAt:new Date().toISOString()});
  telemetry.mockRejectedValueOnce(new ProviderReportPending('NO_REPORT'));
  const jobId=await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'empty-report'});
  expect(await engine.runOnce()).toBe(true);
  const current=await workflow.get(row.campaign_id,host);
  expect(current).toMatchObject({state:'PAUSE_QUEUED',provider_truth:{observedStatus:'REVIEWING'},telemetry:{impressions:7,spendMinor:'400',report:{status:'NO_REPORT'}}});
  expect((await fixture.pool.query('SELECT state,attempts FROM marketing_jobs WHERE id=$1',[jobId])).rows[0]).toEqual({state:'SUCCEEDED',attempts:1});
  expect(mutate).not.toHaveBeenCalled();
 });
 it('does not mistake a fresh fetch for fresh source spend coverage',async()=>{
  const row=await active();await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'source-delayed'});
  expect(await engine.runOnce()).toBe(true);
  expect(await workflow.get(row.campaign_id,host)).toMatchObject({state:'PAUSE_QUEUED',last_error:'SPEND_OBSERVATION_STALE',telemetry:{report:{status:'AVAILABLE'},dataAsOf:null}});
 });
 it('coalesces concurrent host refreshes and preserves ownership and revision checks',async()=>{
  const row=await active();
  const [a,b]=await Promise.all([workflow.requestObservation(row.campaign_id,host,1),workflow.requestObservation(row.campaign_id,host,1)]);
  expect(a.jobId).toBe(b.jobId);expect(a.coalesced!==b.coalesced).toBe(true);
  await expect(workflow.requestObservation(row.campaign_id,{id:11,role:'host'},1)).rejects.toMatchObject({status:404});
  await expect(workflow.requestObservation(row.campaign_id,host,2)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect((await fixture.pool.query("SELECT id FROM marketing_jobs WHERE kind='TELEMETRY'")).rows).toHaveLength(1);
 });
 it('keeps the last confirmed delivery and recovery error when only reporting succeeds',async()=>{
  const row=await active();
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='RECONCILIATION_REQUIRED',last_error='EXTERNAL_STATE_UNKNOWN' WHERE campaign_id=$1",[row.campaign_id]);
  truth.mockResolvedValueOnce({provider:'META',externalCampaignId:`isolated-provider-${row.campaign_id}`,normalizedState:'UNKNOWN',isLive:false,isServingImpressions:false,lastObservedAt:null});
  await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'partial-observation'});
  expect(await engine.runOnce()).toBe(true);
  expect(await workflow.get(row.campaign_id,host)).toMatchObject({state:'RECONCILIATION_REQUIRED',last_error:'EXTERNAL_STATE_UNKNOWN',provider_truth:{statusCheck:'ERROR',observedAt:'2026-09-01T00:00:00Z',deliveryConfirmed:false},telemetry:{report:{status:'AVAILABLE'},impressions:100}});
 });
 it('advances through more than 100 persistently failing campaigns across scheduler restarts',async()=>{
  const row=await active();
  await fixture.pool.query('INSERT INTO host_marketing_campaigns(id,host_id,listing_id) SELECT n,10,20 FROM generate_series(2,205) n');
  await fixture.pool.query(`INSERT INTO marketing_campaign_workflows(campaign_id,host_id,listing_id,revision,provider,state,draft,listing_snapshot,listing_hash,provider_truth,updated_at) SELECT n,host_id,listing_id,revision,provider,'PAUSED',draft,listing_snapshot,listing_hash,jsonb_build_object('externalCampaignId','isolated-provider-'||n,'configuredStatus','PAUSED'),CASE WHEN n<=100 THEN '2000-01-01'::timestamptz ELSE '2020-01-01'::timestamptz END FROM marketing_campaign_workflows CROSS JOIN generate_series(2,205) n WHERE campaign_id=$1`,[row.campaign_id]);
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSED',updated_at='2000-01-01' WHERE campaign_id=1");
  await fixture.pool.query("INSERT INTO marketing_jobs(campaign_id,revision,kind,dedupe_key,state,created_at) SELECT n,1,'TELEMETRY','old-failed-'||n,'DEAD','1999-01-01'::timestamptz FROM generate_series(1,100) n");
  await engine.scheduleObservations();let pending=(await fixture.pool.query("SELECT campaign_id FROM marketing_jobs WHERE state='PENDING' ORDER BY campaign_id")).rows;expect(pending).toHaveLength(100);expect(pending[0].campaign_id).toBe(101);
  await runner().scheduleObservations();expect((await fixture.pool.query("SELECT id FROM marketing_jobs WHERE state='PENDING'")).rows).toHaveLength(200);
  await runner().scheduleObservations();pending=(await fixture.pool.query("SELECT campaign_id FROM marketing_jobs WHERE state='PENDING'")).rows;expect(pending).toHaveLength(205);expect(new Set(pending.map(x=>x.campaign_id)).size).toBe(205);
  await runner().scheduleObservations();expect((await fixture.pool.query("SELECT id FROM marketing_jobs WHERE state='PENDING'")).rows).toHaveLength(205);
  expect(truth).not.toHaveBeenCalled();expect(telemetry).not.toHaveBeenCalled();expect(mutate).not.toHaveBeenCalled();
 });
 it.each(['foreign-campaign','wrong-provider','stale','future'])('retains prior evidence when status readback is %s',async invalid=>{
  const row=await active();
  const evidence={provider:'META',externalCampaignId:`isolated-provider-${row.campaign_id}`,normalizedState:'LIVE',isLive:true,isServingImpressions:true,lastObservedAt:new Date().toISOString()};
  if(invalid==='foreign-campaign')evidence.externalCampaignId='foreign-campaign';
  if(invalid==='wrong-provider')evidence.provider='GOOGLE';
  if(invalid==='stale')evidence.lastObservedAt=new Date(Date.now()-120000).toISOString();
  if(invalid==='future')evidence.lastObservedAt=new Date(Date.now()+120000).toISOString();
  truth.mockResolvedValueOnce(evidence);
  await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:`invalid-${invalid}`});
  expect(await engine.runOnce()).toBe(true);
  expect((await workflow.get(row.campaign_id,host)).provider_truth).toMatchObject({observedStatus:'UNKNOWN',observedAt:'2026-09-01T00:00:00Z',statusCheck:'ERROR',deliveryConfirmed:false});
  const events=(await fixture.pool.query("SELECT event_type FROM marketing_workflow_events WHERE event_type IN ('DELIVERY_OBSERVED','DELIVERY_OBSERVATION_UNAVAILABLE')")).rows;
  expect(events).toEqual([{event_type:'DELIVERY_OBSERVATION_UNAVAILABLE'}]);
 });
 it('keeps an existing observation retry as the sole job owner across sweep windows',async()=>{
  const row=await active();await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'TELEMETRY',key:'owned-observation'});await fixture.pool.query("UPDATE marketing_jobs SET state='RETRY',created_at='1999-01-01',run_after=now()+interval '1 hour'");
  await engine.scheduleObservations();expect((await fixture.pool.query("SELECT id FROM marketing_jobs WHERE kind='TELEMETRY'")).rows).toHaveLength(1);
 });
});
