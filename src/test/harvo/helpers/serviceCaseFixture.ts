import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createCr1IamFixture} from './cr1IamFixture.js';
import {conversationRuntimeGrants,conversationWorkerGrants} from '../../../server/deployment/conversationReadiness.js';
import {serviceCaseRolloutGrants} from '../../../server/deployment/serviceCaseReadiness.js';
import {parsePrincipalContext,type PrincipalContext} from '../../../shared/iam/principalContext.js';
import {ServiceCases} from '../../../lib/conversations/serviceCases.js';
import {AssignmentService} from '../../../lib/iam/assignmentService.js';

export async function createServiceCaseFixture(){
 const base=await createCr1IamFixture();let consumer:pg.Pool|undefined;
 const close=async()=>{await consumer?.end();await base.close();};
 try{
  await base.pool.query(`
   CREATE ROLE cr1_case_consumer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   CREATE ROLE cr1_case_notification_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   CREATE ROLE cr1_case_definer NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
   INSERT INTO users VALUES(10,'guest@example.test','user'),(20,'host@example.test','user'),(30,'other@example.test','user');
   SET ROLE cr1_iam_migrator;
   CREATE TABLE listings(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,publication_status TEXT,slug TEXT,image_url TEXT);
   CREATE TABLE experiences(id INTEGER PRIMARY KEY,host_id INTEGER,title TEXT,image_urls JSONB,status TEXT);
   CREATE TABLE threads(id SERIAL PRIMARY KEY,listing_id INTEGER,guest_id INTEGER REFERENCES users(id),host_id INTEGER REFERENCES users(id),last_message TEXT,unread_count_guest INTEGER DEFAULT 0,unread_count_host INTEGER DEFAULT 0,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,experience_id INTEGER);
   CREATE TABLE messages(id SERIAL PRIMARY KEY,booking_id INTEGER,sender_id INTEGER REFERENCES users(id),receiver_id INTEGER REFERENCES users(id),content TEXT NOT NULL,is_read BOOLEAN DEFAULT false,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,listing_id INTEGER,is_sanitized BOOLEAN DEFAULT false,client_event_id UUID,client_request_hash TEXT,UNIQUE(sender_id,client_event_id));
   INSERT INTO listings(id,user_id,title,publication_status,slug) VALUES(1,20,'Private test property','published','private-test-stay');
   INSERT INTO threads(id,listing_id,guest_id,host_id) VALUES(1,1,10,20),(2,1,30,20);
   SELECT setval('threads_id_seq',2);
   INSERT INTO messages(id,thread_id,sender_id,receiver_id,content) VALUES(1,1,10,20,'Historical private question'),(2,1,20,10,'Historical private answer');
   SELECT setval('messages_id_seq',2);
   RESET ROLE;
  `);
  const c=await base.migrator.connect();
  try{await c.query('BEGIN');for(const file of ['037_conversation_delivery.sql','038_service_cases.sql'])await c.query(readFileSync(new URL('../../../migrations/'+file,import.meta.url),'utf8'));await c.query('COMMIT');}
  catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  for(const sql of conversationRuntimeGrants('cr1_case_consumer'))await base.pool.query(sql);
  for(const sql of conversationWorkerGrants('cr1_case_notification_worker'))await base.pool.query(sql);
  for(const sql of serviceCaseRolloutGrants({consumerRole:'cr1_case_consumer',staffRole:'cr1_iam_runtime',definerRole:'cr1_case_definer',organizationId:base.organizationId,environment:'LOCAL',disclosureVersion:'encho-assisted-service-v1'}))await base.pool.query(sql);
  await base.pool.query('GRANT SELECT ON listings,experiences TO cr1_case_consumer');
  consumer=new pg.Pool({...base.pool.options,user:'cr1_case_consumer'});
  const principal=(accountId:number)=>parsePrincipalContext({actorKind:'ACCOUNT',accountId,assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'case-fixture',operationId:'case-operation'});
  const service=new ServiceCases(consumer,base.runtime,{organizationId:base.organizationId,environment:'LOCAL'});
  for(const p of [base.principals.maker,base.principals.checker])await base.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason) SELECT $1,$2,v.id,'ORGANIZATION',$1::uuid::text,'LOCAL',repeat($3,64),90,'Explicit service analyst authority in isolated test fixture.' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='support_analyst' AND v.version=1`,[base.organizationId,p.membershipId,p.accountId===90?'c':'d']);
  async function assign(caseId:string,p:PrincipalContext=base.principals.maker){
   const a=(await base.pool.query(`INSERT INTO internal_work_assignments(organization_id,queue_key,resource_type,resource_id,assignee_membership_id,environment,required_permission_code,assigned_by,reason) VALUES($1,'service_case','SERVICE_CASE',$2,$3,'LOCAL','service.read',90,'Explicit isolated assigned service case fixture.') RETURNING id`,[base.organizationId,caseId,p.membershipId])).rows[0];
   const claim=await new AssignmentService(base.runtime,'LOCAL').claim({principal:p,organizationId:base.organizationId,assignmentId:a.id,expectedVersion:1,expectedFence:'0',idempotencyKey:randomUUID(),reason:'Claim explicitly assigned service case in isolated test.'});
   return {caseId,assignmentId:a.id,assignmentVersion:claim.receipt.version,assignmentFence:claim.receipt.fence};
  }
  async function staffTransaction<T>(work:(c:pg.PoolClient)=>Promise<T>,p=base.principals.maker){const c=await base.runtime.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.service_environment','LOCAL',true),set_config('app.workforce_environment','LOCAL',true)",[String(p.accountId),p.organizationId,p.membershipId,p.sessionId]);const result=await work(c);await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
  return {...base,consumer,service,principal,assign,staffTransaction,close};
 }catch(error){await close();throw error;}
}
