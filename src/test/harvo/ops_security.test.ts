import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CampaignAiReviewer,type AiEvaluation} from '../../lib/marketing/ai.js';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {createWorkflowPgFixture,workflowDraft} from './workflowPgFixture.js';
import {resolvePersistedSession,legacySocialPublishingEnabled,approveLegacySocialPost,socialApprovalPredicate} from '../../lib/marketing/legacyAuthorization.js';
import {issueLocalUpload,verifyLocalUpload,writeImmutableMedia} from '../../lib/marketing/localMedia.js';

const host={id:10,role:'host' as const},other={id:11,role:'host' as const};
describe('HARVO interrupted evaluation and persisted administrative authority on PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
 const evaluate=vi.fn();
 function service(timeout=1000){return new MarketingWorkflowService(fixture.pool,{ai:{evaluate} as unknown as CampaignAiReviewer,finance:{snapshot:async()=>({}),policy:()=>({currency:'INR',markupPercent:5,configured:false})} as unknown as WorkflowFinancePort,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[],evaluationTimeoutMs:timeout});}
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();await fixture.pool.query("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''; CREATE TABLE host_social_posts(id INT PRIMARY KEY,host_id INT,listing_id INT,caption TEXT,media_type TEXT,media_urls JSONB,hashtags JSONB,hero_index INT,scheduled_at TIMESTAMP,published_at TIMESTAMP,external_media_id TEXT,publish_attempt_count INT DEFAULT 0,status TEXT,admin_feedback TEXT); CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users(id),entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,ip_address TEXT)");});
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{await fixture.pool.query('TRUNCATE admin_audit_logs,host_social_posts');await fixture.reset();await fixture.pool.query("UPDATE users SET email=CASE id WHEN 10 THEN 'ajithsabzz@gmail.com' WHEN 11 THEN 'admin@encho.app' ELSE 'reviewer@example.test' END");evaluate.mockReset().mockImplementation(async(_d,_l,revision)=>({status:'PASSED',score:9,notes:['Verified fixture'],revision,evidenceHash:'fixture',mediaReviewed:['100'],model:'isolated',evaluatedAt:new Date().toISOString()}));});
 it('bounds a hanging evaluator and requires human review without issuing a pass',async()=>{
  const s=service(15),row=await s.create(host,workflowDraft());evaluate.mockImplementation(()=>new Promise(()=>{}));
  const result=await s.evaluate(row.campaign_id,host,1);expect(result.state).toBe('PENDING_ADMIN');expect(result.ai).toMatchObject({status:'REQUIRES_REVIEW',score:null,revision:1});
  expect((await fixture.pool.query("SELECT event_type FROM marketing_workflow_events WHERE campaign_id=$1 ORDER BY id",[row.campaign_id])).rows.map(r=>r.event_type)).toEqual(['DRAFT_CREATED','AI_REVIEW_STARTED','AI_REVIEW_COMPLETED']);
 });
 it('turns unexpected evaluator rejection into documented fallback instead of permanent EVALUATING',async()=>{
  const s=service(),row=await s.create(host,workflowDraft());evaluate.mockRejectedValue(new Error('PRIVATE_PROVIDER_BODY'));const result=await s.evaluate(row.campaign_id,host,1);expect(result.ai.status).toBe('REQUIRES_REVIEW');expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_BODY');
 });
 it('recovers an abandoned lease once and allows a new bounded evaluation',async()=>{
  const s=service(),row=await s.create(host,workflowDraft());await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='EVALUATING',ai=jsonb_build_object('evaluation',jsonb_build_object('id','abandoned','expiresAt',now()-interval '1 second')) WHERE campaign_id=$1",[row.campaign_id]);
  expect(await s.recoverExpiredEvaluations(host)).toBe(1);expect(await s.recoverExpiredEvaluations(host)).toBe(0);expect((await s.get(row.campaign_id,host)).ai.status).toBe('REQUIRES_REVIEW');
  expect((await s.evaluate(row.campaign_id,host,1)).ai.status).toBe('PASSED');
 });
 it('recovers old pre-lease EVALUATING rows while respecting tenant ownership',async()=>{
  const s=service(),row=await s.create(host,workflowDraft());await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='EVALUATING',updated_at=now()-interval '2 minutes' WHERE campaign_id=$1",[row.campaign_id]);
  expect(await s.recoverExpiredEvaluations(other)).toBe(0);expect((await s.workspace(host)).campaigns[0].ai.status).toBe('REQUIRES_REVIEW');
 });
 it('cannot let a late AI result overwrite a newer evaluation with the same campaign revision',async()=>{
  const s=service(),row=await s.create(host,workflowDraft());let release!:(value:AiEvaluation)=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  evaluate.mockImplementationOnce(()=>{started();return new Promise<AiEvaluation>(resolve=>{release=resolve;});});
  const stale=s.evaluate(row.campaign_id,host,1).then(()=>null,error=>error);await ready;
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET ai=jsonb_set(ai,'{evaluation,expiresAt}',to_jsonb((now()-interval '1 second')::text)) WHERE campaign_id=$1",[row.campaign_id]);
  await s.recoverExpiredEvaluations(host);const current=await s.evaluate(row.campaign_id,host,1);
  release({...current.ai,status:'REJECTED',score:0});expect((await stale).code).toBe('EVALUATION_SUPERSEDED');expect((await s.get(row.campaign_id,host)).ai.score).toBe(9);
 });
 it('does not reclaim a healthy lease or bypass the five-attempt host limit',async()=>{
  const s=service(),row=await s.create(host,workflowDraft());await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='EVALUATING',ai=jsonb_build_object('evaluation',jsonb_build_object('expiresAt',now()+interval '1 minute')) WHERE campaign_id=$1",[row.campaign_id]);
  expect(await s.recoverExpiredEvaluations(host)).toBe(0);await expect(s.evaluate(row.campaign_id,host,1)).rejects.toMatchObject({code:'CAMPAIGN_LOCKED'});
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='DRAFT' WHERE campaign_id=$1",[row.campaign_id]);for(let n=0;n<5;n++)await s.evaluate(row.campaign_id,host,1);await expect(s.evaluate(row.campaign_id,host,1)).rejects.toMatchObject({code:'AI_RATE_LIMIT'});
 });
 it('ignores email exceptions, stale admin claims and removed accounts',async()=>{
  for(const id of [10,11])expect(await resolvePersistedSession(fixture.pool,{id,role:'admin'})).toMatchObject({id,role:'host'});
  expect(await resolvePersistedSession(fixture.pool,{id:90,role:'host'})).toMatchObject({role:'admin'});await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");expect(await resolvePersistedSession(fixture.pool,{id:90,role:'admin'})).toMatchObject({role:'host'});
  await expect(resolvePersistedSession(fixture.pool,{id:999,role:'admin'})).rejects.toMatchObject({code:'SESSION_INVALID'});
  await fixture.pool.query('UPDATE users SET email=NULL WHERE id=10');expect(await resolvePersistedSession(fixture.pool,{id:10,role:"admin"})).toEqual({id:10,role:'host'});
 });
 async function social(){await fixture.pool.query("INSERT INTO host_social_posts(id,host_id,listing_id,caption,media_type,media_urls,hashtags,hero_index,status) VALUES(1,10,20,'Property tour','post','[\"https://media.example/a.jpg\"]','[\"stays\"]',0,'pending_approval')");}
 const eligible=async()=>(await fixture.pool.query(`SELECT p.id FROM host_social_posts p WHERE ${socialApprovalPredicate}`)).rows;
 it('requires a current persisted administrator and commits exact social review evidence atomically',async()=>{
  await social();await expect(approveLegacySocialPost(fixture.pool,1,10,null)).rejects.toMatchObject({code:'ADMIN_REQUIRED'});expect(await eligible()).toHaveLength(0);
  await approveLegacySocialPost(fixture.pool,1,90,null);expect(await eligible()).toHaveLength(1);await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");expect(await eligible()).toHaveLength(0);
 });
 it('invalidates social approval when any reviewed media or copy changes and prohibits attempted replay',async()=>{
  await social();await approveLegacySocialPost(fixture.pool,1,90,null);await fixture.pool.query("UPDATE host_social_posts SET caption='Different content' WHERE id=1");expect(await eligible()).toHaveLength(0);
  await fixture.pool.query('UPDATE host_social_posts SET publish_attempt_count=1 WHERE id=1');await expect(approveLegacySocialPost(fixture.pool,1,90,null)).rejects.toMatchObject({code:'SOCIAL_RECONCILIATION_REQUIRED'});
 });
});

describe('HARVO immutable local upload capabilities and legacy containment',()=>{
 const secret='isolated-local-upload-test-key';let directory:string;
 beforeAll(()=>{directory=mkdtempSync(join(tmpdir(),'harvo-upload-'));});afterAll(()=>rmSync(directory,{recursive:true,force:true}));
 it('only enables legacy social publication with an explicit exact opt-in',()=>{for(const value of [undefined,'1','TRUE','false'])expect(legacySocialPublishingEnabled({HARVO_LEGACY_SOCIAL_PUBLISHING_ENABLED:value})).toBe(false);expect(legacySocialPublishingEnabled({HARVO_LEGACY_SOCIAL_PUBLISHING_ENABLED:'true'})).toBe(true);});
 it('binds random paths to authenticated account, content type and expiry, rejecting tampering',()=>{
  const a=issueLocalUpload(secret,10,'image/jpeg',1000000),b=issueLocalUpload(secret,10,'image/jpeg',1000000);expect(a.key).not.toBe(b.key);expect(verifyLocalUpload(secret,a.ticket,1000001)).toMatchObject({userId:10,key:a.key,contentType:'image/jpeg'});
  expect(()=>verifyLocalUpload(secret,a.ticket,1600000)).toThrow();expect(()=>verifyLocalUpload(secret,a.ticket.replace(/.$/,'x'),1000001)).toThrow();expect(()=>issueLocalUpload(secret,10,'image/svg+xml')).toThrow();
 });
 it('uses exclusive file creation so replay cannot alter an approved URL',async()=>{
  const a=issueLocalUpload(secret,10,'image/jpeg');await writeImmutableMedia(directory,a.key,Buffer.from('original'));
  await expect(writeImmutableMedia(directory,a.key,Buffer.from('changed'))).rejects.toMatchObject({code:'UPLOAD_ALREADY_USED'});expect(readFileSync(join(directory,a.key),'utf8')).toBe('original');await expect(writeImmutableMedia(directory,'../escape.jpg',Buffer.from('bad'))).rejects.toMatchObject({code:'MEDIA_UPLOAD_INVALID'});
 });
 it('keeps server admin middleware authoritative and disables fake social success/automatic mutation replay',()=>{
  const source=readFileSync(new URL('../../../server.ts',import.meta.url),'utf8');expect(source).not.toContain('@ts-nocheck');expect(source).not.toMatch(/ajithsabzz@gmail\.com|admin@encho\.app/);
  const auth=source.slice(source.indexOf('export const authenticateToken'),source.indexOf('// Hardened CORS policy'));expect(auth).toContain('resolvePersistedSession(pool, claims)');expect(auth).not.toContain('req.user = claims');
  const publisher=source.slice(source.indexOf('const publishToInstagram'),source.indexOf('// Admin Reject Social Post'));expect(publisher).not.toMatch(/sim_ig_|Math\.random/);expect(publisher).toContain('legacySocialPublishingEnabled()');expect(publisher).toContain('socialApprovalPredicate');
  const worker=source.slice(source.indexOf('export const processScheduledSocialPosts'),source.indexOf('// Gap 18:',source.indexOf('export const processScheduledSocialPosts')));expect(worker).toContain('COALESCE(publish_attempt_count,0)=0');expect(worker).toContain('shouldRunBackgroundWorkers && legacySocialPublishingEnabled()');expect(worker).not.toContain("status = 'publishing' AND lease_expires_at");
 });
});
