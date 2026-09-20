import pg from 'pg';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {createWorkflowPgFixture,workflowConfig} from './workflowPgFixture.js';
import {installPoolIsolation} from '../../server/deployment/poolIsolation.js';
import {actorPool,inTransaction} from '../../lib/marketing/database.js';
import {enqueue,MarketingJobQueue} from '../../lib/marketing/jobs.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import type {Actor} from '../../lib/marketing/domain.js';

describe('forced operational RLS on a reused non-bypass application connection',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,pool:pg.Pool;
 const host:Actor={id:10,role:'host'},other:Actor={id:11,role:'host'},service:Actor={id:90,role:'system'};
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();
  await fixture.pool.query('CREATE ROLE operational_client LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO operational_client; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO operational_client; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO operational_client');
  pool=new pg.Pool({...fixture.pool.options,user:'operational_client',max:1});installPoolIsolation(pool,()=>undefined);
 });
 beforeEach(async()=>{
  await fixture.reset();
  await fixture.pool.query("INSERT INTO host_marketing_campaigns(id,host_id,listing_id) VALUES(101,10,20),(102,11,21)");
  await fixture.pool.query("INSERT INTO marketing_campaign_workflows(campaign_id,host_id,listing_id,revision,provider,state,draft,listing_snapshot,listing_hash) VALUES(101,10,20,1,'GOOGLE','DRAFT','{}','{}','fixture-a'),(102,11,21,1,'META','DRAFT','{}','{}','fixture-b')");
 });
 afterAll(async()=>{await pool?.end();await fixture?.close();});
 const queueFor=(actor:Actor)=>new MarketingJobQueue(actorPool(pool,actor));
 const add=(actor:Actor,campaignId:number,key:string)=>inTransaction(pool,actor,c=>enqueue(c,{campaignId,revision:1,kind:'TELEMETRY',key}));
 it('denies anonymous reads and enqueue, while each host sees only their receipt',async()=>{
  const a=await add(host,101,'host-a'),b=await add(other,102,'host-b');
  const rows=(actor:Actor)=>inTransaction(pool,actor,async c=>(await c.query('SELECT id FROM marketing_jobs')).rows.map(row=>row.id));
  expect(await rows(host)).toEqual([a]);expect(await rows(other)).toEqual([b]);
  expect((await pool.query('SELECT * FROM marketing_jobs')).rows).toEqual([]);
  await expect(enqueue(pool,{kind:'PAYMENT',key:'anonymous'})).rejects.toMatchObject({code:'42501'});
 });
 it('rejects cross-host, outdated revision and already-completed job inserts',async()=>{
  await expect(add(host,102,'cross-host')).rejects.toMatchObject({code:'42501'});
  await expect(inTransaction(pool,host,c=>enqueue(c,{campaignId:101,revision:2,kind:'TELEMETRY',key:'stale'}))).rejects.toMatchObject({code:'42501'});
  await expect(inTransaction(pool,host,c=>c.query("INSERT INTO marketing_jobs(campaign_id,revision,kind,dedupe_key,state) VALUES(101,1,'TELEMETRY','fake-success','SUCCEEDED')"))).rejects.toMatchObject({code:'42501'});
 });
 it('allows hosts to enqueue but only trusted service context can claim and finish',async()=>{
  const id=await add(host,101,'owned');expect(await queueFor(host).claim()).toBeNull();
  const queued=queueFor(service),job=await queued.claim();expect(job?.id).toBe(id);
  await expect(queueFor(host).complete(job!)).rejects.toMatchObject({code:'STALE_WORKER'});
  await queued.heartbeat(job!);await queued.complete(job!);
  expect((await inTransaction(pool,host,c=>c.query('SELECT state FROM marketing_jobs WHERE id=$1',[id]))).rows[0].state).toBe('SUCCEEDED');
  expect((await pool.query('SELECT * FROM marketing_jobs')).rows).toEqual([]);
 });
 it('keeps global payment/Meta jobs service-only with original dedupe identity',async()=>{
  const scoped=actorPool(pool,service),input={kind:'PAYMENT' as const,key:'signed-payment-fixture',payload:{eventId:'fixture'}};
  const id=await enqueue(scoped,input);expect(await enqueue(scoped,input)).toBe(id);
  expect((await inTransaction(pool,host,c=>c.query('SELECT * FROM marketing_jobs'))).rows).toEqual([]);
  const job=await queueFor(service).claim();expect(job?.id).toBe(id);
  await queueFor(service).fail(job!,'FIXTURE_RETRY');
  expect((await scoped.query('SELECT state,dedupe_key FROM marketing_jobs')).rows[0]).toEqual({state:'RETRY',dedupe_key:input.key});
 });
 it('binds AI attempts to the owned campaign and retains immutable quota evidence',async()=>{
  await inTransaction(pool,host,c=>c.query('INSERT INTO marketing_ai_attempts(host_id,campaign_id,revision) VALUES(10,101,1)'));
  await expect(inTransaction(pool,host,c=>c.query('INSERT INTO marketing_ai_attempts(host_id,campaign_id,revision) VALUES(10,102,1)'))).rejects.toMatchObject({code:'42501'});
  expect((await inTransaction(pool,other,c=>c.query('SELECT * FROM marketing_ai_attempts'))).rows).toEqual([]);
  expect((await inTransaction(pool,host,c=>c.query('DELETE FROM marketing_ai_attempts'))).rowCount).toBe(0);
  await expect(fixture.pool.query('DELETE FROM marketing_ai_attempts')).rejects.toThrow('append-only');
 });
 it('preserves administrative preference history and refreshes the real version through service scope',async()=>{
  await inTransaction(pool,service,c=>c.query("INSERT INTO marketing_commercial_preferences(markup_bps,actor_id,reason) VALUES(400,90,'Fixture policy revision')"));
  expect((await inTransaction(pool,host,c=>c.query('SELECT * FROM marketing_commercial_preferences'))).rows).toEqual([]);
  await expect(inTransaction(pool,host,c=>c.query("INSERT INTO marketing_commercial_preferences(markup_bps,actor_id,reason) VALUES(300,10,'Unauthorized revision')"))).rejects.toMatchObject({code:'42501'});
  const finance=new WorkflowFinance(pool,workflowConfig,new CampaignPaymentGateway(pool,{origin:workflowConfig.origin}));
  await finance.refreshPreference();expect(finance.policy()).toMatchObject({markupPercent:4,version:1});
  await expect(fixture.pool.query('UPDATE marketing_commercial_preferences SET markup_bps=500')).rejects.toThrow('append-only');
  expect((await pool.query('SELECT * FROM marketing_commercial_preferences')).rows).toEqual([]);
 });
 it('retains jobs on host or service delete attempts',async()=>{
  await add(host,101,'retain-evidence');
  for(const actor of [host,service])expect((await inTransaction(pool,actor,c=>c.query('DELETE FROM marketing_jobs'))).rowCount).toBe(0);
  expect((await fixture.pool.query('SELECT id FROM marketing_jobs')).rows).toHaveLength(1);
 });
});
