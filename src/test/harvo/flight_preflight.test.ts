import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {accountLocalTime,flightScheduleSchema,longWeekendFlight} from '../../shared/marketingFlight.js';
import {draftSchema} from '../../lib/marketing/domain.js';
import {MarketingPreflight,economicsScenario,economicsInput} from '../../lib/marketing/portfolio/preflight.js';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {MarketingJobQueue} from '../../lib/marketing/jobs.js';
import {MarketingEngine} from '../../lib/marketing/engine.js';
const host={id:10,role:'host' as const},admin={id:90,role:'admin' as const};
describe('SP4 India flight contract and advisory planning',()=>{
 it('uses India calendar rollover and moves past an already-started Wednesday',()=>{
  expect(longWeekendFlight(new Date('2026-09-22T23:00:00Z')).startsAt).toBe('2026-09-23T06:00:00+05:30');
  expect(longWeekendFlight(new Date('2026-09-23T00:30:00Z')).startsAt).toBe('2026-09-30T06:00:00+05:30');
  const flight=longWeekendFlight(new Date('2026-12-29T00:00:00Z'));
  expect(flight.endsAt).toBe('2027-01-04T23:59:59+05:30');
  expect(accountLocalTime(flight.startsAt,'Asia/Calcutta')).toBe('2026-12-30 06:00:00');
 });
 it('rejects wrong zones, offsets, impossible dates and mismatched draft dates',()=>{
  const flight=longWeekendFlight(new Date('2099-01-01T00:00:00Z'));
  for(const changed of [{timeZone:'America/New_York'},{startsAt:flight.startsAt.replace('+05:30','Z')},{startsAt:'2099-02-30T06:00:00+05:30'}])expect(flightScheduleSchema.safeParse({...flight,...changed}).success).toBe(false);
  expect(draftSchema.safeParse(workflowDraft({flightSchedule:flight})).success).toBe(false);
  expect(draftSchema.parse(workflowDraft({flightSchedule:flight,startDate:flight.startsAt.slice(0,10),endDate:flight.endsAt.slice(0,10)})).flightSchedule).toEqual(flight);
 });
 it('uses exact minor-unit arithmetic and does not fabricate measured CAC',()=>{
  const input=economicsInput.parse({listingId:20,flightDays:6,mediaBudgetMinor:'1500000',nightsPerBooking:2,retainedMarginBps:4000,targetBookings:2});
  const result=economicsScenario('5000.01',input);
  expect(result).toMatchObject({nightlyRateMinor:'500001',grossBookingRevenueMinor:'1000002',contributionBeforeAdvertisingMinor:'400000',plannedAcquisitionCostMinor:'750000',measuredAcquisitionCostMinor:null,warning:'ABOVE_BREAK_EVEN',dailyScenarioRangeMinor:{low:'33333',high:'66666'}});
  expect(economicsScenario('5000',{...input,retainedMarginBps:0}).warning).toBe('NO_CONTRIBUTION');
  expect(()=>economicsScenario('Infinity',input)).toThrow();
 });
});
describe('SP4 durable scheduling and scoped preflight integration',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,workflow:MarketingWorkflowService,engine:MarketingEngine,preflight:MarketingPreflight;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.pool.query(readFileSync('src/migrations/026_search_portfolio_shadow.sql','utf8'));
  const gateway=new CampaignPaymentGateway(fixture.pool,{origin:workflowConfig.origin});
  const finance=new WorkflowFinance(fixture.pool,workflowConfig,gateway);
  // Scheduling mechanics only: real money authority is independently exercised in finance suites.
  vi.spyOn(finance,'authorize').mockResolvedValue();
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance,publishingEnabled:true,activationEnabled:true,fundingEnabled:false,configurationReasons:[]});
  engine=new MarketingEngine(fixture.pool,workflow,workflowConfig,gateway);
  preflight=new MarketingPreflight(fixture.pool,{id:90,role:'system'});
 });
 beforeEach(async()=>{await fixture.reset();vi.spyOn(workflow.options.finance,'authorize').mockResolvedValue();});afterAll(async()=>{await fixture?.close();});
 async function campaign(now:string){const flight=longWeekendFlight(new Date(now));return workflow.create(host,workflowDraft({flightSchedule:flight,startDate:flight.startsAt.slice(0,10),endDate:flight.endsAt.slice(0,10)}));}
 it('delays explicitly authorized activation and never auto-activates a funded draft',async()=>{
  const row=await campaign('2099-01-01T00:00:00Z');
  await fixture.pool.query(`UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED',content_approval='{"status":"APPROVED","revision":1}' WHERE campaign_id=$1`,[row.campaign_id]);
  await expect(workflow.schedule(row.campaign_id,host,1,'ACTIVATE','host-no-authority')).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  await workflow.schedule(row.campaign_id,admin,1,'ACTIVATE','timed-admin-authorization');
  const job=(await fixture.pool.query('SELECT * FROM marketing_jobs')).rows[0];
  expect(new Date(job.run_after).toISOString()).toBe(new Date(row.draft.flightSchedule.startsAt).toISOString());
  expect(await new MarketingJobQueue(fixture.pool).claim()).toBeNull();
 });
 it('cancels an undispatched timed activation while retaining provider pause verification',async()=>{
  const row=await campaign('2099-01-01T00:00:00Z');
  await fixture.pool.query(`UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED',content_approval='{"status":"APPROVED","revision":1}' WHERE campaign_id=$1`,[row.campaign_id]);
  await workflow.schedule(row.campaign_id,admin,1,'ACTIVATE','timed-start-to-cancel');
  await workflow.schedule(row.campaign_id,host,1,'PAUSE','cancel-delayed-start');
  expect((await fixture.pool.query("SELECT state FROM marketing_jobs WHERE kind='ACTIVATE'")).rows[0].state).toBe('DEAD');
  expect((await fixture.pool.query("SELECT count(*)::int AS n FROM marketing_jobs WHERE kind='PAUSE'")).rows[0].n).toBe(1);
  expect((await workflow.get(row.campaign_id,host)).state).toBe('PAUSE_QUEUED');
  await workflow.schedule(row.campaign_id,host,1,'PAUSE','cancel-delayed-start');
  expect((await fixture.pool.query("SELECT count(*)::int AS n FROM marketing_jobs WHERE kind='PAUSE'")).rows[0].n).toBe(1);
 });
 it('does not cancel or overwrite an activation that a worker has already claimed',async()=>{
  const row=await campaign('2099-01-01T00:00:00Z');
  await fixture.pool.query(`UPDATE marketing_campaign_workflows SET state='PROVIDER_PAUSED',content_approval='{"status":"APPROVED","revision":1}' WHERE campaign_id=$1`,[row.campaign_id]);
  await workflow.schedule(row.campaign_id,admin,1,'ACTIVATE','claimed-activation');
  await fixture.pool.query("UPDATE marketing_jobs SET run_after=now() WHERE kind='ACTIVATE'");
  const queue=new MarketingJobQueue(fixture.pool);expect((await queue.claim())?.kind).toBe('ACTIVATE');
  await expect(workflow.schedule(row.campaign_id,host,1,'PAUSE','cancel-claimed')).rejects.toMatchObject({code:'CONTROL_IN_PROGRESS'});
  expect((await fixture.pool.query("SELECT state FROM marketing_jobs WHERE kind='ACTIVATE'")).rows[0].state).toBe('RUNNING');
 });
 it('coalesces concurrent overdue stop sweeps without restarting paused campaigns',async()=>{
  const row=await campaign('2020-01-01T00:00:00Z');
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='LIVE' WHERE campaign_id=$1",[row.campaign_id]);
  await Promise.all([engine.scheduleFlightStops(),engine.scheduleFlightStops()]);
  expect((await fixture.pool.query('SELECT kind FROM marketing_jobs')).rows).toEqual([{kind:'PAUSE'}]);
  expect((await workflow.get(row.campaign_id,host)).state).toBe('PAUSE_QUEUED');
  await expect(workflow.schedule(row.campaign_id,admin,1,'ACTIVATE','expired-activation')).rejects.toThrow();
 });
 it('uses canonical owned price and never reveals a peer in the host advisory',async()=>{
  const row=await campaign('2099-01-01T00:00:00Z');
  const input={listingId:20,flightDays:6,mediaBudgetMinor:'100000',nightsPerBooking:2,retainedMarginBps:4000,targetBookings:2};
  expect(await preflight.economics(host,input)).toMatchObject({nightlyRateMinor:'500000',currency:'INR'});
  await expect(preflight.economics({id:11,role:'host'},input)).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});
  await expect(preflight.economics({id:10,role:'admin'},input)).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  await fixture.pool.query(`INSERT INTO marketing_search_conflict_assessments(id,campaign_id,revision,analyzer_version,mode,input_hash,evidence,actor_id) VALUES(gen_random_uuid(),$1,1,'shadow-v1','SHADOW_ONLY',repeat('a',64),$2,90)`,[row.campaign_id,JSON.stringify({conflicts:[{campaignId:999,hostId:11,sharedKeywords:['Private competitor detail']}],version:1,mode:'SHADOW_ONLY',blocking:false,authority:'OBSERVATION_ONLY'})]);
  const view=await preflight.portfolio(host,row.campaign_id,1);expect(view).toMatchObject({status:'POSSIBLE_OVERLAP',blocking:false});
  expect(JSON.stringify(view)).not.toMatch(/999|hostId|Private competitor/);
  await expect(preflight.portfolio({id:11,role:'host'},row.campaign_id,1)).rejects.toMatchObject({code:'CAMPAIGN_NOT_FOUND'});
 });
});
