import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import express,{type RequestHandler} from 'express';
import request from 'supertest';
import pg from 'pg';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createWorkflowPgFixture,workflowConfig,workflowDraft,workflowPolicy} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {MarketingFinanceService} from '../../lib/marketing/financeService.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import type {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {createMarketingRouter} from '../../server/marketing/router.js';
import {enqueue,MarketingJobQueue} from '../../lib/marketing/jobs.js';

/** Bounded local evidence: real HTTP/router/PostgreSQL, injected auth and no provider/payment calls. */
describe('HARVO local 30-request concurrency and PostgreSQL backup/replay drill',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,service:MarketingWorkflowService;
 let statements=0,counting=false;const report:Record<string,unknown>={scope:'ISOLATED_LOCAL_ACCEPTANCE_NOT_PRODUCTION_LOAD',concurrency:30,transports:'HTTP router and Unix-socket PostgreSQL; authentication injected; no external provider/payment requests',observedAt:new Date().toISOString()};
 const gateway={} as CampaignPaymentGateway;
 function build(pool:pg.Pool){const finance=new WorkflowFinance(pool,structuredClone(workflowConfig),gateway);const s=new MarketingWorkflowService(pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:['Isolated test']});return {finance,service:s};}
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.reset();await new MarketingFinanceService(fixture.pool,{actorContext:{id:90,role:'admin'}}).persistPolicy(workflowPolicy,90);
  // Instrument each actual client query once, including clients already created by the fixture.
  const tracked=new WeakSet<object>();const instrument=(c:pg.PoolClient)=>{if(tracked.has(c))return;tracked.add(c);const original=c.query.bind(c);c.query=((...args:any[])=>{if(counting)statements++;return (original as any)(...args);}) as typeof c.query;};
  const clients=await Promise.all(Array.from({length:15},()=>fixture.pool.connect()));for(const c of clients){instrument(c);c.release();}fixture.pool.on('connect',instrument);
  service=build(fixture.pool).service;report.postgresql=(await fixture.pool.query('SHOW server_version')).rows[0].server_version;
 });
 afterAll(async()=>{await fixture?.close();if(report.concurrentReads&&report.restoreReplay){const directory=new URL('../../../test-results/harvo/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('concurrency.json',directory),JSON.stringify(report,null,2)+'\n');}});
 async function concurrent(name:string,run:(index:number)=>PromiseLike<any>){
  const latencies:number[]=[];statements=0;counting=true;const start=performance.now();let results:any[];
  try{results=await Promise.all(Array.from({length:30},async(_,index)=>{const then=performance.now();const result=await run(index);latencies.push(performance.now()-then);return result;}));}
  finally{counting=false;}
  latencies.sort((a,b)=>a-b);report[name]={requests:30,totalMs:Math.round(performance.now()-start),p50Ms:Math.round(latencies[14]),p95Ms:Math.round(latencies[28]),maximumMs:Math.round(latencies[29]),sqlStatements:statements,sqlStatementsPerRequest:statements/30};return results!;
 }
 it('deduplicates 30 creates, fences 30 stale edits and serves 30 tenant-scoped workspace reads',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const app=express();app.use(express.json());const auth:RequestHandler=(req:any,_res,next)=>{req.user={id:Number(req.get('X-Test-User')||10),role:'host'};next();};const bridge=build(fixture.pool).finance;app.use('/api/marketing/v2',createMarketingRouter(fixture.pool,service,bridge,auth));
  const created=await concurrent('concurrentCreates',()=>request(app).post('/api/marketing/v2/campaigns').set('Idempotency-Key','m9-identical-create').send(workflowDraft()));
  expect(created.map(r=>r.status)).toEqual(Array(30).fill(201));expect(new Set(created.map(r=>r.body.id)).size).toBe(1);const id=created[0].body.id;
  expect((await fixture.pool.query('SELECT count(*)::int AS n FROM marketing_campaign_workflows')).rows[0].n).toBe(1);
  const edits=await concurrent('concurrentEdits',index=>request(app).patch(`/api/marketing/v2/campaigns/${id}`).set('Idempotency-Key',`m9-edit-${index}`).send({...workflowDraft({title:`Concurrent proposal ${index}`}),revision:1}));
  expect(edits.filter(r=>r.status===200)).toHaveLength(1);expect(edits.filter(r=>r.status===409&&r.body.code==='REVISION_CONFLICT')).toHaveLength(29);expect((await service.get(id,{id:10,role:'host'})).revision).toBe(2);
  for(let n=0;n<29;n++)await service.create({id:10,role:'host'},workflowDraft({title:`Workspace campaign ${n}`}),`m9-seed-${n}`);
  await service.create({id:11,role:'host'},workflowDraft({listingId:21,mediaIds:['101'],title:'Other host private campaign'}),'m9-other-host');
  const reads=await concurrent('concurrentReads',()=>request(app).get('/api/marketing/v2/workspace'));
  for(const r of reads){expect(r.status).toBe(200);expect(r.body.campaigns).toHaveLength(30);expect(r.body.campaigns.every((x:any)=>x.listingId===20)).toBe(true);expect(r.body.listings.map((x:any)=>x.id)).toEqual([20]);}
  expect((report.concurrentReads as any).sqlStatementsPerRequest).toBeLessThan(30);
  report.concurrentCorrectness={oneCreate:true,oneRevisionWinner:true,staleRevisionConflicts:29,workspaceCampaignRows:30,noCrossTenantRows:true};
 },45000);
 it('restores a real pg_dump and preserves create idempotency and uncertain mutation replay barriers',async()=>{
  const binaries=process.env.HARVO_POSTGRES_BIN||'/opt/homebrew/opt/postgresql@18/bin';if(!existsSync(join(binaries,'pg_dump')))throw new Error('pg_dump and pg_restore binaries are required for the local restore drill');
  const row=await service.create({id:10,role:'host'},workflowDraft(),'m9-restore-create');const jobId=await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'PUBLISH',key:'m9-restore-publish'});
  const queue=new MarketingJobQueue(fixture.pool),claimed=await queue.claim();expect(claimed?.id).toBe(jobId);
  await fixture.pool.query("UPDATE marketing_jobs SET lease_until=now()-interval '1 minute' WHERE id=$1",[jobId]);
  const directory=mkdtempSync(join(tmpdir(),'harvo-restore-')),dump=join(directory,'evidence.dump');const args=['-h',String(fixture.pool.options.host),'-p',String(fixture.pool.options.port),'-U','harvo_test'];let restored:pg.Pool|undefined;
  const command=(name:string,extra:string[])=>execFileSync(join(binaries,name),[...args,...extra],{env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:'pipe',timeout:20000});
  const start=performance.now();
  try{
   command('pg_dump',['-Fc','-d','postgres','-f',dump]);await fixture.pool.query('CREATE DATABASE harvo_restore TEMPLATE template0');command('pg_restore',['--exit-on-error','-d','harvo_restore',dump]);
   restored=new pg.Pool({...fixture.pool.options,database:'harvo_restore',max:5});
   const after=build(restored).service;const replay=await after.create({id:10,role:'host'},workflowDraft(),'m9-restore-create');expect(replay.campaign_id).toBe(row.campaign_id);
   expect(await new MarketingJobQueue(restored).claim()).toBe(null);expect((await restored.query('SELECT state,attempts FROM marketing_jobs WHERE id=$1',[jobId])).rows[0]).toMatchObject({state:'RECONCILIATION_REQUIRED',attempts:1});
   expect((await restored.query('SELECT count(*)::int AS n FROM marketing_create_requests WHERE request_key=$1',['m9-restore-create'])).rows[0].n).toBe(1);
   const relation=(await restored.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='marketing_campaign_workflows'")).rows[0];expect(relation).toEqual({relrowsecurity:true,relforcerowsecurity:true});
   await expect(restored.query("UPDATE marketing_workflow_events SET event_type='TAMPER'")).rejects.toThrow('append-only');
   report.restoreReplay={elapsedMs:Math.round(performance.now()-start),format:'PostgreSQL custom pg_dump / pg_restore into separate local database',sameCampaignIdentity:true,noDuplicateCreate:true,expiredPublishQuarantined:true,providerRequests:0,forcedRlsPreserved:true,immutableAuditTriggerPreserved:true};
  }finally{await restored?.end();await fixture.pool.query('DROP DATABASE IF EXISTS harvo_restore');rmSync(directory,{recursive:true,force:true});}
 },60000);
});
