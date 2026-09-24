import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {createServiceCaseFixture} from './helpers/serviceCaseFixture.js';
import {verifyServiceCaseCatalog,serviceCaseRolloutGrants} from '../../server/deployment/serviceCaseReadiness.js';
import {verifyConversationCatalog} from '../../server/deployment/conversationReadiness.js';
import {ServiceCases} from '../../lib/conversations/serviceCases.js';

describe('CR1 scoped service case foundation on restricted PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof createServiceCaseFixture>>;
 beforeEach(async()=>{f=await createServiceCaseFixture();},30_000);
 afterEach(async()=>{await f?.close();});
 const input=(threadId=1,requestId=randomUUID())=>({threadId,requestId,disclosureVersion:'encho-assisted-service-v1',acceptAssistance:true as const});
 const request=()=>f.service.request(f.principal(10),input());
 const assigned=async()=>f.assign((await request()).id);
 type Assignment=Awaited<ReturnType<typeof assigned>>;
 const prepare=(a:Assignment,before:string|null=null,limit=10)=>f.staffTransaction(async c=>(await c.query('SELECT service_case_prepare_content($1,$2,$3,$4,$5,$6,$7) AS id',[a.caseId,a.assignmentId,a.assignmentVersion,a.assignmentFence,before,limit,'case.test'])).rows[0].id as string);
 const readReceipt=(receipt:string)=>f.staffTransaction(async c=>(await c.query('SELECT service_case_read_content($1) AS result',[receipt])).rows[0].result);
 const actor=async<T>(id:number,work:(client:pg.PoolClient)=>Promise<T>)=>{const c=await f.consumer.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.current_user_id',$1,true)",[String(id)]);const out=await work(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const catalog=async()=>{const c=await f.runtime.connect();try{return await verifyServiceCaseCatalog(c,'STAFF');}finally{c.release();}};

 it('verifies distinct roles and preserves exact participant readiness',async()=>{
  for(const [pool,kind] of [[f.consumer,'CONSUMER'],[f.runtime,'STAFF']] as const){const c=await pool.connect();try{expect(await verifyServiceCaseCatalog(c,kind)).toMatchObject({ready:true});}finally{c.release();}}
  const c=await f.consumer.connect();try{expect(await verifyConversationCatalog(c)).toMatchObject({ready:true});}finally{c.release();}
 });
 it('allows a participant request and claimed, audited content access without marking messages read',async()=>{
  const a=await assigned();const read=await f.service.read(f.principals.maker,{...a,limit:10});
  expect(read.messages.map(m=>m.content)).toEqual(['Historical private question','Historical private answer']);
  expect(read.internalNotes).toEqual([]);
  expect((await f.pool.query('SELECT id FROM service_case_content_access_receipts WHERE id=$1',[read.receiptId])).rowCount).toBe(1);
  expect((await f.pool.query("SELECT evidence_id FROM service_case_events WHERE event_type='CONTENT_ACCESS_AUTHORIZED'")).rows[0].evidence_id).toBe(read.receiptId);
  expect((await f.pool.query('SELECT count(*) FROM conversation_read_cursors')).rows[0].count).toBe('0');
 });
 it('projects only participant assistance status and the configured disclosure',async()=>{
  expect(await f.service.status(f.principal(10),1)).toEqual({case:null,disclosureVersion:'encho-assisted-service-v1'});
  const opened=await request();
  expect(await f.service.status(f.principal(20),1)).toEqual({case:opened,disclosureVersion:'encho-assisted-service-v1'});
  await expect(f.service.status(f.principal(30),1)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await f.service.withdraw(f.principal(10),{caseId:opened.id,expectedVersion:1});
  expect(await f.service.status(f.principal(10),1)).toMatchObject({case:{state:'WITHDRAWN',version:2}});
 });
 it('coalesces concurrent participant requests and preserves idempotency after withdrawal',async()=>{
  const body=input();const results=await Promise.all([f.service.request(f.principal(10),body),f.service.request(f.principal(10),body),f.service.request(f.principal(20),input())]);
  expect(new Set(results.map(row=>row.id)).size).toBe(1);
  expect((await f.pool.query("SELECT count(*) FROM service_case_events WHERE event_type='REQUESTED'")).rows[0].count).toBe('1');
  await f.service.withdraw(f.principal(20),{caseId:results[0].id,expectedVersion:1});
  expect(await f.service.request(f.principal(10),body)).toMatchObject({id:results[0].id,state:'WITHDRAWN'});
  expect((await request()).id).not.toBe(results[0].id);
 });
 it('rejects ambiguous request replay without creating a second case',async()=>{
  const body=input();await f.service.request(f.principal(20),body);
  await expect(f.service.request(f.principal(20),{...body,threadId:2})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect((await f.pool.query('SELECT count(*) FROM service_cases')).rows[0].count).toBe('1');
 });
 it('rejects outsiders, legacy admin identity, undisclosed requests and organization/environment mismatch',async()=>{
  for(const id of [30,90])await expect(f.service.request(f.principal(id),input())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(f.service.request(f.principals.maker,input())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(f.service.request(f.principal(10),{...input(),acceptAssistance:false})).rejects.toMatchObject({code:'INPUT_INVALID'});
  await expect(f.service.request(f.principal(10),{...input(),disclosureVersion:'invented-disclosure'})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  for(const options of [{organizationId:randomUUID(),environment:'LOCAL' as const},{organizationId:f.organizationId,environment:'STAGING' as const}])await expect(new ServiceCases(f.consumer,f.runtime,options).request(f.principal(10),input())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 });
 it('denies missing, different assignee, stale version and stale fence assignments',async()=>{
  const a=await assigned();
  for(const altered of [{...a,assignmentId:randomUUID()},{...a,assignmentVersion:a.assignmentVersion+1},{...a,assignmentFence:String(BigInt(a.assignmentFence)+1n)}])await expect(f.service.read(f.principals.maker,altered)).rejects.toMatchObject({code:'ASSIGNMENT_REQUIRED'});
  await expect(f.service.read(f.principals.checker,a)).rejects.toMatchObject({code:'ASSIGNMENT_REQUIRED'});
  await expect(f.service.read(f.principals.outsider,a)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  expect((await f.pool.query('SELECT count(*) FROM service_case_content_access_receipts')).rows[0].count).toBe('0');
 });
 it('keeps raw message, case and note access unavailable to staff and forged GUCs',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  for(const table of ['threads','messages','service_cases','service_case_internal_notes','service_case_content_access_receipts'])await expect(f.staffTransaction(async c=>{
   await c.query("SELECT set_config('app.bypass_rls','true',true),set_config('app.marketing_admin','true',true),set_config('app.service_case_id',$1,true),set_config('app.service_receipt_id',$2,true)",[a.caseId,receipt]);return c.query(`SELECT * FROM ${table}`);
  })).rejects.toThrow(/permission denied/);
  await expect(f.runtime.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,20,10,'Impersonated host')")).rejects.toThrow(/permission denied/);
  expect((await actor(30,async c=>{await c.query("SELECT set_config('app.service_case_id',$1,true),set_config('app.service_receipt_id',$2,true),set_config('app.bypass_rls','true',true)",[a.caseId,receipt]);return c.query('SELECT content FROM messages WHERE thread_id=1');})).rows).toEqual([]);
 });
 it('does not let consumer SQL invoke staff helpers or forge helper role identity',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await expect(actor(90,c=>c.query('SELECT service_case_read_content($1)',[receipt]))).rejects.toThrow(/permission denied/);
  await expect(f.consumer.query('SET ROLE cr1_case_definer')).rejects.toThrow(/permission denied/);
  expect((await actor(10,c=>c.query('SELECT service_case_context_allowed(1) AS allowed,service_case_message_allowed(1,1) AS message'))).rows[0]).toEqual({allowed:false,message:false});
 });
 it('rejects same-transaction receipt reads so rollback cannot erase the access authorization',async()=>{
  const a=await assigned();
  await expect(f.staffTransaction(async c=>{
   const receipt=(await c.query('SELECT service_case_prepare_content($1,$2,$3,$4,NULL,10,$5) AS id',[a.caseId,a.assignmentId,a.assignmentVersion,a.assignmentFence,'same-tx'])).rows[0].id;
   return c.query('SELECT service_case_read_content($1)',[receipt]);
  })).rejects.toThrow('SERVICE_CASE_COMMITTED_RECEIPT_REQUIRED');
  expect((await f.pool.query('SELECT count(*) FROM service_case_content_access_receipts')).rows[0].count).toBe('0');
 });
 it('pins the exact message and note window across later additions and retries',async()=>{
  const a=await assigned();const receipt=await prepare(a,null,1);
  await actor(10,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,10,20,'A later private message')"));
  await f.service.addNote(f.principals.maker,{...a,requestId:randomUUID(),body:'A later internal note'});
  const read=await readReceipt(receipt);
  expect(read.messages.map((m:{id:number})=>m.id)).toEqual([2]);expect(read.internalNotes).toEqual([]);
  expect(await readReceipt(receipt)).toEqual(read);
  expect((await readReceipt(await prepare(a,'2',10))).messages.map((m:{id:number})=>m.id)).toEqual([1]);
 });
 it('binds receipt to the original session, rejecting another valid session for the same staff member',async()=>{
  const a=await assigned();const receipt=await prepare(a);const another=await f.environmentSession(f.principals.maker,'LOCAL');
  await expect(f.staffTransaction(c=>c.query('SELECT service_case_read_content($1)',[receipt]),another)).rejects.toThrow('SERVICE_CASE_COMMITTED_RECEIPT_REQUIRED');
  expect((await readReceipt(receipt)).messages).toHaveLength(2);
 });
 it('rejects expired immutable receipt evidence without reading messages',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  // A trusted test writer constructs old evidence; runtime cannot insert or
  // rewrite receipt rows, and the original immutable receipt remains intact.
  const expired=(await f.pool.query(`INSERT INTO service_case_content_access_receipts(case_id,organization_id,environment,thread_id,actor_user_id,membership_id,session_id,assignment_id,assignment_version,assignment_fence,policy_hash,before_sequence,through_sequence,through_note_id,limit_count,creation_xid,correlation_id,created_at,expires_at)
   SELECT case_id,organization_id,environment,thread_id,actor_user_id,membership_id,session_id,assignment_id,assignment_version,assignment_fence,policy_hash,before_sequence,through_sequence,through_note_id,limit_count,creation_xid,correlation_id,clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '1 minute' FROM service_case_content_access_receipts WHERE id=$1 RETURNING id`,[receipt])).rows[0].id;
  await expect(readReceipt(expired)).rejects.toThrow('SERVICE_CASE_COMMITTED_RECEIPT_REQUIRED');
 });
 it('requires a new receipt after a policy publication',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await f.pool.query(`WITH next AS(INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason,created_by)
   SELECT v.version+1,jsonb_set(v.config,'{version}',to_jsonb(v.version+1)),repeat('0',64),v.approval_status,'Isolated policy publication test.',90 FROM internal_iam_policy_versions v JOIN internal_iam_current_policy c ON c.version_id=v.id RETURNING id)
   UPDATE internal_iam_current_policy SET version_id=next.id FROM next`);
  await expect(readReceipt(receipt)).rejects.toThrow('SERVICE_CASE_POLICY_CHANGED');
  expect((await f.service.read(f.principals.maker,a)).messages).toHaveLength(2);
 });
 it('fails fresh authorization when a claimed staff session is revoked',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await f.pool.query("UPDATE internal_staff_sessions SET status='REVOKED',revoked_by=90,revoked_at=clock_timestamp(),revoke_reason='Isolated security test revocation.' WHERE id=$1",[f.principals.maker.sessionId]);
  await expect(readReceipt(receipt)).rejects.toThrow('SERVICE_CASE_PERMISSION_DENIED');
  await expect(f.service.addNote(f.principals.maker,{...a,requestId:randomUUID(),body:'Not authorized'})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 });
 it('fails fresh authorization after the service role is revoked',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await f.pool.query("INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason) SELECT id,90,'Isolated test revoke every effective service grant.' FROM internal_membership_grants WHERE membership_id=$1",[f.principals.maker.membershipId]);
  await expect(readReceipt(receipt)).rejects.toThrow('SERVICE_CASE_PERMISSION_DENIED');
 });
 it('rejects a released assignment even when the receipt was committed first',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await f.pool.query("UPDATE internal_work_assignments SET state='RELEASED',version=version+1,fence=fence+1,lease_until=NULL WHERE id=$1",[a.assignmentId]);
  await expect(readReceipt(receipt)).rejects.toThrow('SERVICE_CASE_ASSIGNMENT_REQUIRED');
 });
 it('rejects receipts after case withdrawal and keeps withdrawal CAS/idempotency truthful',async()=>{
  const a=await assigned();const receipt=await prepare(a);
  await expect(f.service.withdraw(f.principal(30),{caseId:a.caseId,expectedVersion:1})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(f.service.withdraw(f.principal(20),{caseId:a.caseId,expectedVersion:2})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  const closed=await f.service.withdraw(f.principal(20),{caseId:a.caseId,expectedVersion:1});expect(closed).toMatchObject({state:'WITHDRAWN',version:2});
  expect(await f.service.withdraw(f.principal(10),{caseId:a.caseId,expectedVersion:1})).toEqual(closed);
  await expect(readReceipt(receipt)).rejects.toThrow('SERVICE_CASE_PERMISSION_DENIED');
 });
 it('writes one immutable, attributed internal note per request and never adds it to participant messages',async()=>{
  const a=await assigned();const command={...a,requestId:randomUUID(),body:'Internal escalation context'};
  const [one,two]=await Promise.all([f.service.addNote(f.principals.maker,command),f.service.addNote(f.principals.maker,command)]);expect(one).toEqual(two);
  await expect(f.service.addNote(f.principals.maker,{...command,body:'Changed command'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const row=(await f.pool.query('SELECT * FROM service_case_internal_notes WHERE id=$1',[one.id])).rows[0];
  expect(row).toMatchObject({session_id:f.principals.maker.sessionId,assignment_id:a.assignmentId,assignment_version:a.assignmentVersion,assignment_fence:a.assignmentFence});
  expect((await f.service.read(f.principals.maker,a)).internalNotes.map(n=>n.body)).toEqual([command.body]);
  expect(JSON.stringify((await actor(10,c=>c.query('SELECT content FROM messages'))).rows)).not.toContain(command.body);
  await expect(actor(10,c=>c.query('SELECT * FROM service_case_internal_notes'))).rejects.toThrow(/permission denied/);
 });
 it('makes context, notes, receipts and audit events immutable even for a privileged fixture writer',async()=>{
  const a=await assigned();await prepare(a);await f.service.addNote(f.principals.maker,{...a,requestId:randomUUID(),body:'Immutable note'});
  for(const sql of ["UPDATE service_cases SET thread_id=2","UPDATE service_case_internal_notes SET body='tampered'",'DELETE FROM service_case_content_access_receipts','DELETE FROM service_case_events','DELETE FROM service_case_requests','DELETE FROM service_cases'])await expect(f.pool.query(sql)).rejects.toThrow('SERVICE_CASE_IMMUTABLE');
 });
 it('rolls back authorization if its audit event cannot be persisted',async()=>{
  const a=await assigned();
  await f.pool.query("CREATE FUNCTION test_reject_case_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected audit storage failure'; END $$; CREATE TRIGGER test_reject_case_audit BEFORE INSERT ON service_case_events FOR EACH ROW WHEN(NEW.event_type='CONTENT_ACCESS_AUTHORIZED') EXECUTE FUNCTION test_reject_case_audit()");
  await expect(f.service.read(f.principals.maker,a)).rejects.toMatchObject({code:'STORE_UNAVAILABLE'});
  expect((await f.pool.query('SELECT count(*) FROM service_case_content_access_receipts')).rows[0].count).toBe('0');
 });
 it.each([1,2])('does not return content when commit acknowledgement %i is lost',async(commitToLose)=>{
  const a=await assigned();let commits=0;let contentQueries=0;
  const pool=new Proxy(f.runtime,{get(target,key){
   if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(c,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{if(sql.includes('SELECT service_case_read_content'))contentQueries++;const result=await c.query(sql,values);if(sql==='COMMIT'&&++commits===commitToLose)throw new Error('Injected lost acknowledgement');return result;};
    const value=Reflect.get(c,field,c);return typeof value==='function'?value.bind(c):value;
   }});};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  await expect(new ServiceCases(f.consumer,pool,{organizationId:f.organizationId,environment:'LOCAL'}).read(f.principals.maker,a)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
  expect(contentQueries).toBe(commitToLose-1);expect((await f.pool.query('SELECT count(*) FROM service_case_content_access_receipts')).rows[0].count).toBe('1');
 });
 it.each([
  ['widened receipt policy','ALTER POLICY service_case_message_content ON messages USING(true)'],
  ['widened participant boundary','ALTER POLICY conversation_message_boundary ON messages USING(true)'],
  ['mutable message source','ALTER TABLE messages DISABLE TRIGGER conversation_message_immutable'],
  ['disabled case audit protection','ALTER TABLE service_case_events DISABLE TRIGGER service_case_history_immutable'],
  ['definer can log in','ALTER ROLE cr1_case_definer LOGIN'],
  ['raw staff content grant','GRANT SELECT(content) ON messages TO cr1_iam_runtime'],
  ['unexpected definer message privilege','GRANT UPDATE(content) ON messages TO cr1_case_definer'],
  ['public helper invocation','GRANT EXECUTE ON FUNCTION service_case_read_content(uuid) TO PUBLIC'],
  ['missing sequence uniqueness','ALTER TABLE messages DROP CONSTRAINT conversation_message_sequence_unique'],
 ])('fails closed when %s changes the audited catalog',async(_label,sql)=>{
  await f.pool.query(sql);expect(await catalog()).toMatchObject({ready:false});
 });
 it('requires distinct explicit rollout identities and rejects SQL-shaped role names',()=>{
  const options={consumerRole:'safe_consumer',staffRole:'safe_staff',definerRole:'safe_definer',organizationId:f.organizationId,environment:'LOCAL',disclosureVersion:'test-v1'};
  expect(()=>serviceCaseRolloutGrants({...options,definerRole:options.staffRole})).toThrow('SERVICE_CASE_DISTINCT_ROLES_REQUIRED');
  expect(()=>serviceCaseRolloutGrants({...options,consumerRole:'unsafe;drop table messages'})).toThrow();
 });
});
