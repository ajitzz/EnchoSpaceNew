import type pg from 'pg';
import {z} from 'zod';
import {principalContextSchema,type PrincipalContext} from '../../shared/iam/principalContext.js';
import {verifyServiceCaseCatalog} from '../../server/deployment/serviceCaseReadiness.js';
import {verifyIamCatalog} from '../../server/deployment/iamReadiness.js';

import {publicServiceCaseSchema,serviceCaseContentSchema,serviceCaseRequestSchema,serviceCaseReadSchema,serviceCaseNoteSchema,serviceCaseStatusSchema,serviceCaseWithdrawSchema,serviceCaseNoteResultSchema,type ServiceCaseContent} from '../../shared/conversation/serviceCases.js';
export {serviceCaseRequestSchema,serviceCaseReadSchema,serviceCaseNoteSchema,type ServiceCaseContent} from '../../shared/conversation/serviceCases.js';

type ErrorCode='INPUT_INVALID'|'PERMISSION_DENIED'|'ASSIGNMENT_REQUIRED'|'COMMITTED_RECEIPT_REQUIRED'|'IDEMPOTENCY_CONFLICT'|'VERSION_CONFLICT'|'POLICY_CHANGED'|'NOT_READY'|'STORE_UNAVAILABLE'|'OUTCOME_UNKNOWN';
export class ServiceCaseError extends Error {
 readonly status:number;
 constructor(readonly code:ErrorCode){super(`SERVICE_CASE_${code}`);this.name='ServiceCaseError';this.status=code==='INPUT_INVALID'?400:['PERMISSION_DENIED','ASSIGNMENT_REQUIRED','COMMITTED_RECEIPT_REQUIRED'].includes(code)?403:['IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','POLICY_CHANGED'].includes(code)?409:503;}
}
const errors:Readonly<Record<string,ErrorCode>>={SERVICE_CASE_PERMISSION_DENIED:'PERMISSION_DENIED',SERVICE_CASE_ASSIGNMENT_REQUIRED:'ASSIGNMENT_REQUIRED',SERVICE_CASE_COMMITTED_RECEIPT_REQUIRED:'COMMITTED_RECEIPT_REQUIRED',SERVICE_CASE_IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',SERVICE_CASE_VERSION_CONFLICT:'VERSION_CONFLICT',SERVICE_CASE_POLICY_CHANGED:'POLICY_CHANGED',SERVICE_CASE_INPUT_INVALID:'INPUT_INVALID'};

/** Separate account and workforce pools. Neither staff JWT role claims nor an
 * assignment alone grant access; SQL rechecks current fenced IAM authority. */
export class ServiceCases {
 private readonly options;
 constructor(private readonly participantPool:pg.Pool,private readonly staffPool:pg.Pool,options:{organizationId:string;environment:'LOCAL'|'STAGING'|'PRODUCTION'}){
  this.options=z.object({organizationId:z.string().uuid(),environment:z.enum(['LOCAL','STAGING','PRODUCTION'])}).strict().parse(options);
 }
 async request(principal:PrincipalContext,input:unknown){
  const body=this.parse(serviceCaseRequestSchema,input);
  return this.transaction(principal,'CONSUMER',async c=>publicServiceCaseSchema.parse((await c.query('SELECT service_case_request($1,$2,$3) AS result',[body.threadId,body.requestId,body.disclosureVersion])).rows[0].result));
 }
 async status(principal:PrincipalContext,threadId:unknown){
  const id=this.parse(z.number().int().positive().safe(),threadId);
  return this.transaction(principal,'CONSUMER',async c=>serviceCaseStatusSchema.parse((await c.query('SELECT service_case_status($1) AS result',[id])).rows[0].result));
 }
 async withdraw(principal:PrincipalContext,input:unknown){
  const body=this.parse(serviceCaseWithdrawSchema,input);
  return this.transaction(principal,'CONSUMER',async c=>publicServiceCaseSchema.parse((await c.query('SELECT service_case_withdraw($1,$2) AS result',[body.caseId,body.expectedVersion])).rows[0].result));
 }
 async read(principal:PrincipalContext,input:unknown):Promise<ServiceCaseContent>{
  const body=this.parse(serviceCaseReadSchema,input);
  // This first COMMIT is a privacy invariant, not a performance optimization.
  // Direct SQL callers cannot use a receipt born in their current transaction.
  const receipt=await this.transaction(principal,'STAFF',async c=>z.string().uuid().parse((await c.query('SELECT service_case_prepare_content($1,$2,$3,$4,$5,$6,$7) AS id',[body.caseId,body.assignmentId,body.assignmentVersion,body.assignmentFence,body.beforeSequence??null,body.limit,principal.correlationId])).rows[0].id));
  return this.transaction(principal,'STAFF',async c=>serviceCaseContentSchema.parse((await c.query('SELECT service_case_read_content($1) AS result',[receipt])).rows[0].result));
 }
 async addNote(principal:PrincipalContext,input:unknown){
  const body=this.parse(serviceCaseNoteSchema,input);
  return this.transaction(principal,'STAFF',async c=>serviceCaseNoteResultSchema.parse((await c.query('SELECT service_case_add_note($1,$2,$3,$4,$5,$6) AS result',[body.caseId,body.assignmentId,body.assignmentVersion,body.assignmentFence,body.requestId,body.body])).rows[0].result));
 }
 private parse<T>(schema:z.ZodType<T>,input:unknown):T{const p=schema.safeParse(input);if(!p.success)throw new ServiceCaseError('INPUT_INVALID');return p.data;}
 private async transaction<T>(rawPrincipal:PrincipalContext,kind:'CONSUMER'|'STAFF',work:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
  const principal=this.parse(principalContextSchema,rawPrincipal);
  if(kind==='CONSUMER'?principal.actorKind!=='ACCOUNT':principal.actorKind!=='STAFF'||principal.organizationId!==this.options.organizationId)throw new ServiceCaseError('PERMISSION_DENIED');
  const client=await(kind==='CONSUMER'?this.participantPool:this.staffPool).connect().catch(()=>{throw new ServiceCaseError('STORE_UNAVAILABLE');});
  let committing=false,discard=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='10s'");
   if(!(await verifyServiceCaseCatalog(client,kind)).ready||(kind==='STAFF'&&!(await verifyIamCatalog(client)).ready))throw new ServiceCaseError('NOT_READY');
   await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.service_environment',$5,true),set_config('app.workforce_environment',$5,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true)",[String(principal.accountId),this.options.organizationId,principal.membershipId??'',principal.sessionId??'',this.options.environment]);
   const result=await work(client);committing=true;await client.query('COMMIT');return result;
  }catch(error){
   try{await client.query('ROLLBACK');}catch{discard=true;}
   if(committing){discard=true;throw new ServiceCaseError('OUTCOME_UNKNOWN');}
   if(error instanceof ServiceCaseError)throw error;
   throw new ServiceCaseError(error instanceof Error?(errors[error.message]??'STORE_UNAVAILABLE'):'STORE_UNAVAILABLE');
  }finally{client.release(discard);}
 }
}
