import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createWorkflowPgFixture,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';
import {enqueue,MarketingJobQueue} from '../../lib/marketing/jobs.js';
import {fingerprint} from '../../lib/marketing/domain.js';
import type {SettlementProviderBinding} from '../../lib/marketing/settlementService.js';
import {installPoolIsolation} from '../../server/deployment/poolIsolation.js';

const admin={id:90,role:'admin' as const},host={id:10,role:'host' as const};
const input={revision:1,reason:'Reviewed original committed pause and its retained operation receipt.'};
describe('committed pause recovery without replay or financial release',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtimePool:pg.Pool,service:MarketingPauseRecovery,campaignId:number,jobId:string,operationId:number;
 const reader=vi.fn();
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();
  await fixture.pool.query('CREATE ROLE pause_runtime LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO pause_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO pause_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO pause_runtime');
  runtimePool=new pg.Pool({...fixture.pool.options,user:'pause_runtime',max:2});installPoolIsolation(runtimePool,()=>undefined);
 });afterAll(async()=>{await runtimePool?.end();await fixture?.close();});
 beforeEach(async()=>{
  await fixture.reset();
  const workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:{} as WorkflowFinancePort,
   fundingEnabled:false,publishingEnabled:false,activationEnabled:false,configurationReasons:[]});
  const row=await workflow.create(host,workflowDraft());campaignId=row.campaign_id;
  jobId=await enqueue(fixture.pool,{campaignId,revision:1,kind:'PAUSE',key:`original-pause-${campaignId}`});
  await fixture.pool.query("UPDATE marketing_jobs SET state='RECONCILIATION_REQUIRED',fence=3,attempts=1,last_error='LOCAL_COMPLETION_LOST' WHERE id=$1",[jobId]);
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='RECONCILIATION_REQUIRED',pending_job_id=$2,provider_truth=$3,last_error='LOCAL_COMPLETION_LOST',quote_id=$4,reservation_id=$5 WHERE campaign_id=$1",[campaignId,jobId,JSON.stringify({externalCampaignId:'12345',configuredStatus:'ACTIVE'}),randomUUID(),randomUUID()]);
  await fixture.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id) VALUES($1,'META','CAMPAIGN','12345','act_123456')",[campaignId]);
  operationId=(await fixture.pool.query(`INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,correlation_id,publish_status,is_unknown_outcome,payload,response,external_campaign_id)
   VALUES($1,'META','PAUSE',$2,$3,'COMMITTED',FALSE,$4,$5,'12345') RETURNING id`,[campaignId,`original-pause-${campaignId}`,jobId,JSON.stringify({protocol:'HARVO_PROVIDER_OPERATION_V2'}),JSON.stringify({success:true,provider:'META',externalCampaignId:'12345',newStatus:'PAUSED',normalizedDeliveryState:'PAUSED'})])).rows[0].id;
  reader.mockReset().mockImplementation(async(binding:SettlementProviderBinding)=>({...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:fingerprint({fixture:'paused'})}));
  service=new MarketingPauseRecovery(runtimePool,reader);
 });
 async function state(){return (await fixture.pool.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1',[campaignId])).rows[0];}
 it('records fresh containment, preserves original keys and money references, and fences out the old worker',async()=>{
  const before=await state(),operation=(await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rows;
  const result=await service.adopt(admin,campaignId,input,'recover-pause-1');
  expect(result).toMatchObject({state:'PAUSED',jobId,operationId,idempotent:false});
  const after=await state();expect(after).toMatchObject({state:'PAUSED',pending_job_id:null,last_error:null,quote_id:before.quote_id,reservation_id:before.reservation_id,provider_truth:{observedStatus:'PAUSED',deliveryConfirmed:false}});
  expect((await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rows).toEqual(operation);
  expect((await fixture.pool.query('SELECT state,fence,dedupe_key,last_error FROM marketing_jobs')).rows[0]).toEqual({state:'SUCCEEDED',fence:'4',dedupe_key:`original-pause-${campaignId}`,last_error:'LOCAL_COMPLETION_LOST'});
  await expect(new MarketingJobQueue(fixture.pool).complete({id:jobId,fence:'3',campaign_id:campaignId,revision:1,kind:'PAUSE',dedupe_key:`original-pause-${campaignId}`,payload:{},attempts:1})).rejects.toMatchObject({code:'STALE_WORKER'});
  for(const table of ['marketing_finance_journals','marketing_finance_lines','marketing_finance_captures'])expect((await fixture.pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  expect((await fixture.pool.query("SELECT evidence FROM marketing_workflow_events WHERE event_type='COMMITTED_PAUSE_RECOVERED'")).rows[0].evidence.previousError).toBe('LOCAL_COMPLETION_LOST');
 });
 it('replays the same request without another provider read and rejects changed intent',async()=>{
  const first=await service.adopt(admin,campaignId,input,'recover-pause-1');
  expect(await service.adopt(admin,campaignId,input,'recover-pause-1')).toMatchObject({...first,idempotent:true});expect(reader).toHaveBeenCalledOnce();
  await expect(service.adopt(admin,campaignId,{...input,reason:'A different investigation with the same request identity.'},'recover-pause-1')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 });
 it('quarantines an expired pause worker and adopts only its existing committed receipt',async()=>{
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSE_QUEUED',last_error=NULL");
  await fixture.pool.query("UPDATE marketing_jobs SET state='RUNNING',lease_until=now()-interval '1 second'");
  const queue=new MarketingJobQueue(fixture.pool);expect(await queue.claim()).toBeNull();
  expect((await fixture.pool.query('SELECT state,last_error FROM marketing_jobs')).rows[0]).toEqual({state:'RECONCILIATION_REQUIRED',last_error:'WORKER_LEASE_EXPIRED'});
  expect(await service.adopt(admin,campaignId,input,'expired-recorded-pause')).toMatchObject({state:'PAUSED'});
 });
 it('leaves a distinct ambiguous operation quarantined even when a pause was committed',async()=>{
  await fixture.pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,publish_status,is_unknown_outcome) VALUES($1,'META','CREATE_HIERARCHY','other-uncertain-operation','RECONCILIATION_REQUIRED',TRUE)",[campaignId]);
  await expect(service.adopt(admin,campaignId,input,'other-operation')).rejects.toMatchObject({code:'PAUSE_RECOVERY_UNAVAILABLE'});
  expect(reader).not.toHaveBeenCalled();
 });
 it('preserves the independent safety reason after an expired protective pause',async()=>{
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSE_QUEUED',last_error='INVENTORY_UNAVAILABLE'");
  await fixture.pool.query("UPDATE marketing_jobs SET last_error='WORKER_LEASE_EXPIRED'");
  expect(await service.adopt(admin,campaignId,input,'protective-expired-pause')).toMatchObject({state:'PAUSED'});
  expect(await state()).toMatchObject({state:'PAUSED',last_error:'INVENTORY_UNAVAILABLE'});
 });
 it('does not adopt a v2 pause when legacy provider effects also exist',async()=>{
  await fixture.pool.query("INSERT INTO meta_publishing_transactions(campaign_id,idempotency_key,correlation_id) VALUES($1,'legacy-request','legacy-correlation')",[campaignId]);
  await expect(service.adopt(admin,campaignId,input,'legacy-effects')).rejects.toMatchObject({code:'PAUSE_RECOVERY_UNAVAILABLE'});
  expect(reader).not.toHaveBeenCalled();
 });
 it.each(['CLAIMED','EXTERNAL_OUTCOME_UNKNOWN','ASSET_PREPARING'])('does not ignore an unresolved %s claim with an inconsistent uncertainty flag',async status=>{
  await fixture.pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,publish_status,is_unknown_outcome) VALUES($1,'META','CREATE_HIERARCHY','other-unresolved-claim',$2,FALSE)",[campaignId,status]);
  await expect(service.adopt(admin,campaignId,input,'other-unresolved')).rejects.toMatchObject({code:'PAUSE_RECOVERY_UNAVAILABLE'});
  expect(reader).not.toHaveBeenCalled();
 });
 it.each(['same-key','other-admin'])('durably coalesces %s concurrent inspection before provider read',async mode=>{
  await fixture.pool.query("INSERT INTO users VALUES(91,'admin')");
  let finish!:()=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{finish=resolve;});
  reader.mockImplementationOnce(async(binding:SettlementProviderBinding)=>{entered();await gate;return {...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'a'.repeat(64)};});
  const first=service.adopt(admin,campaignId,input,'same-key-1');await started;
  try{
   await expect(service.adopt(mode==='same-key'?admin:{id:91,role:'admin'},campaignId,input,mode==='same-key'?'same-key-1':'other-admin-key')).rejects.toMatchObject({code:'RECOVERY_IN_PROGRESS'});
   await expect(service.adopt(admin,campaignId,{...input,reason:'Changed intent while a provider read remains in flight.'},'same-key-1')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
   expect(reader).toHaveBeenCalledOnce();
  }finally{finish();}
  const result=await first;
  expect(await service.adopt(admin,campaignId,input,'same-key-1')).toMatchObject({id:result.id,idempotent:true});
  expect((await fixture.pool.query('SELECT state FROM marketing_pause_recovery_attempts')).rows).toEqual([{state:'SUCCEEDED'}]);
 });
 it('times out read-only inspection, retains failed evidence, and permits a new key',async()=>{
  reader.mockImplementationOnce(()=>new Promise(()=>{}));
  await expect(new MarketingPauseRecovery(runtimePool,reader,20).adopt(admin,campaignId,input,'timeout-key')).rejects.toMatchObject({code:'RECOVERY_READ_TIMEOUT'});
  expect((await state()).state).toBe('RECONCILIATION_REQUIRED');
  expect((await fixture.pool.query('SELECT state,error_code FROM marketing_pause_recovery_attempts')).rows).toEqual([{state:'FAILED',error_code:'RECOVERY_READ_TIMEOUT'}]);
  await expect(service.adopt(admin,campaignId,input,'timeout-key')).rejects.toMatchObject({code:'RECOVERY_ATTEMPT_FINISHED'});
  expect(await service.adopt(admin,campaignId,input,'new-after-timeout')).toMatchObject({state:'PAUSED'});
 });
 it('expires an abandoned durable claim without deleting its evidence',async()=>{
  await fixture.pool.query(`INSERT INTO marketing_pause_recovery_attempts(id,campaign_id,revision,job_id,actor_id,request_key,request_fingerprint,candidate_fingerprint,created_at,lease_until)
   VALUES($1,$2,1,$3,90,'abandoned-key',repeat('a',64),repeat('b',64),now()-interval '2 minutes',now()-interval '1 minute')`,[randomUUID(),campaignId,jobId]);
  expect(await service.adopt(admin,campaignId,input,'after-abandoned')).toMatchObject({state:'PAUSED'});
  expect((await fixture.pool.query('SELECT state FROM marketing_pause_recovery_attempts ORDER BY created_at')).rows).toEqual([{state:'EXPIRED'},{state:'SUCCEEDED'}]);
 });
 it('rejects a late read after its claim has been expired and a successor has started',async()=>{
  reader.mockImplementationOnce(async(binding:SettlementProviderBinding)=>{
   await fixture.pool.query("UPDATE marketing_pause_recovery_attempts SET state='EXPIRED',error_code='RECOVERY_LEASE_EXPIRED',finished_at=clock_timestamp()");
   await fixture.pool.query(`INSERT INTO marketing_pause_recovery_attempts(id,campaign_id,revision,job_id,actor_id,request_key,request_fingerprint,candidate_fingerprint,lease_until)
    VALUES($1,$2,1,$3,90,'successor-key',repeat('a',64),repeat('b',64),clock_timestamp()+interval '60 seconds')`,[randomUUID(),campaignId,jobId]);
   return {...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'a'.repeat(64)};
  });
  await expect(service.adopt(admin,campaignId,input,'late-key')).rejects.toMatchObject({code:'RECOVERY_ATTEMPT_EXPIRED'});
  expect((await fixture.pool.query('SELECT state FROM marketing_pause_recovery_attempts ORDER BY created_at')).rows).toEqual([{state:'EXPIRED'},{state:'RUNNING'}]);
  expect((await state()).state).toBe('RECONCILIATION_REQUIRED');
 });
 it('replays migration and enforces immutable identity and terminal history under non-bypass RLS',async()=>{
  await fixture.pool.query(await readFile('src/migrations/022_marketing_pause_recovery_attempts.sql','utf8'));
  await service.adopt(admin,campaignId,input,'immutable-attempt');
  for(const sql of ["UPDATE marketing_pause_recovery_attempts SET state='RUNNING',finished_at=NULL", "UPDATE marketing_pause_recovery_attempts SET request_key='new-key'",'DELETE FROM marketing_pause_recovery_attempts'])await expect(fixture.pool.query(sql)).rejects.toThrow(/immutable|cannot be deleted/);
  const c=await runtimePool.connect();try{
   await c.query('BEGIN');await c.query("SELECT set_config('app.current_user_id','10',true),set_config('app.marketing_admin','false',true)");
   expect((await c.query('SELECT * FROM marketing_pause_recovery_attempts')).rows).toHaveLength(0);
   await expect(c.query(`INSERT INTO marketing_pause_recovery_attempts(id,campaign_id,revision,job_id,actor_id,request_key,request_fingerprint,candidate_fingerprint,lease_until) VALUES($1,$2,1,$3,10,'forged-host',repeat('a',64),repeat('b',64),clock_timestamp()+interval '60 seconds')`,[randomUUID(),campaignId,jobId])).rejects.toThrow(/row-level security/);
  }finally{await c.query('ROLLBACK');c.release();}
 });
 it.each(['unknown','uncommitted','activation','correlation','unrelated-error','running'])('does not recover %s evidence',async mode=>{
  if(mode==='unknown')await fixture.pool.query('UPDATE provider_publishing_transactions SET is_unknown_outcome=TRUE');
  if(mode==='uncommitted')await fixture.pool.query("UPDATE provider_publishing_transactions SET publish_status='RECONCILIATION_REQUIRED'");
  if(mode==='activation')await fixture.pool.query("UPDATE provider_publishing_transactions SET operation_type='RESUME'");
  if(mode==='correlation')await fixture.pool.query("UPDATE provider_publishing_transactions SET correlation_id='different-job'");
  if(mode==='unrelated-error')await fixture.pool.query("UPDATE marketing_campaign_workflows SET last_error='FINANCIAL_REVIEW_REQUIRED'");
  if(mode==='running')await fixture.pool.query("UPDATE marketing_jobs SET state='RUNNING',lease_until=now()+interval '1 minute'");
  await expect(service.adopt(admin,campaignId,input,'recover-rejected')).rejects.toMatchObject({code:'PAUSE_RECOVERY_UNAVAILABLE'});
  expect(reader).not.toHaveBeenCalled();expect((await state()).state).toBe('RECONCILIATION_REQUIRED');
 });
 it.each(['ACTIVE','stale','foreign'])('rejects %s readback',async mode=>{
  reader.mockImplementationOnce(async(binding:SettlementProviderBinding)=>({...binding,accountId:mode==='foreign'?'999':binding.accountId,configuredStatus:mode==='ACTIVE'?'ACTIVE':'PAUSED',observedAt:mode==='stale'?'2000-01-01T00:00:00Z':new Date().toISOString(),evidenceHash:'a'.repeat(64)}));
  await expect(service.adopt(admin,campaignId,input,'readback-rejected')).rejects.toMatchObject({code:'PAUSE_RECOVERY_NOT_VERIFIED'});
  expect((await state()).state).toBe('RECONCILIATION_REQUIRED');expect((await fixture.pool.query('SELECT id FROM marketing_pause_recoveries')).rows).toHaveLength(0);
 });
 it('revalidates role after remote read and rejects an unpersisted admin claim',async()=>{
  await expect(service.adopt({id:10,role:'admin'},campaignId,input,'false-role')).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  reader.mockImplementationOnce(async(binding:SettlementProviderBinding)=>{await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");return {...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'b'.repeat(64)};});
  await expect(service.adopt(admin,campaignId,input,'demoted-admin')).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
 });
 it('detects changed operation evidence while readback was in flight',async()=>{
  reader.mockImplementationOnce(async(binding:SettlementProviderBinding)=>{await fixture.pool.query('UPDATE marketing_jobs SET fence=fence+1');return {...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'c'.repeat(64)};});
  await expect(service.adopt(admin,campaignId,input,'changed-evidence')).rejects.toMatchObject({code:'RECOVERY_EVIDENCE_CHANGED'});
 });
 it('preserves immutable receipts and hides them from a nonowner runtime role',async()=>{
  await service.adopt(admin,campaignId,input,'immutable-receipt');
  await expect(fixture.pool.query("UPDATE marketing_pause_recoveries SET reason='tampered evidence now'")).rejects.toThrow(/append-only/i);
  await expect(fixture.pool.query('DELETE FROM marketing_pause_recoveries')).rejects.toThrow(/append-only/i);
  await fixture.pool.query('CREATE ROLE recovery_test_reader NOSUPERUSER NOBYPASSRLS');await fixture.pool.query('GRANT SELECT ON marketing_pause_recoveries TO recovery_test_reader');
  const client=await fixture.pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE recovery_test_reader');expect((await client.query('SELECT * FROM marketing_pause_recoveries')).rows).toHaveLength(0);}finally{await client.query('ROLLBACK');client.release();}
 });
});
