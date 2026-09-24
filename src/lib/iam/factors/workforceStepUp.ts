import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {stepUpReceiptSchema,workforceEnvironmentSchema,type StepUpReceipt} from '../../../shared/iam/contracts.js';
import {PasskeyAssertionError,PasskeyAssertionVerifier,passkeyAssertionProofSchema,passkeyCeremonySchema,passkeyPolicySchema,reviewedPasskeyCredentialSchema} from './passkeyAssertion.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const token=z.string().regex(/^wfs_[A-Za-z0-9_-]{43}$/);
const trace=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const contextSchema=z.object({policy:passkeyPolicySchema,ceremony:passkeyCeremonySchema,credential:reviewedPasskeyCredentialSchema}).strict();
const codes=['FACTOR_INVALID','FACTOR_EXPIRED','FACTOR_POLICY_UNAVAILABLE','FACTOR_ENROLLMENT_UNAVAILABLE','FACTOR_CHALLENGE_INVALID','FACTOR_RATE_LIMITED','FACTOR_STORE_UNAVAILABLE','FACTOR_OUTCOME_UNKNOWN'] as const;
export class WorkforceStepUpError extends Error {constructor(readonly code:typeof codes[number]){super(code);}}
const parse=<T>(schema:z.ZodType<T>,input:unknown):T=>{const result=schema.safeParse(input);if(!result.success)throw new WorkforceStepUpError('FACTOR_INVALID');return result.data;};
const errors:Record<string,typeof codes[number]>={IAM_PASSKEY_CHALLENGE_INVALID:'FACTOR_CHALLENGE_INVALID',IAM_PASSKEY_PROOF_INVALID:'FACTOR_INVALID',IAM_PASSKEY_POLICY_UNAVAILABLE:'FACTOR_POLICY_UNAVAILABLE',IAM_PASSKEY_ENROLLMENT_UNAVAILABLE:'FACTOR_ENROLLMENT_UNAVAILABLE',IAM_PASSKEY_RATE_LIMITED:'FACTOR_RATE_LIMITED'};
export async function isIsolatedFactorWriter(client:pg.PoolClient):Promise<boolean>{
 return (await client.query<{safe:boolean}>(`SELECT session_user=current_user AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR has_schema_privilege(current_user,'public','CREATE'))
 AND NOT EXISTS(SELECT 1 FROM pg_roles x WHERE pg_has_role(current_user,x.oid,'MEMBER') AND (x.rolsuper OR x.rolbypassrls OR x.rolcreatedb OR x.rolcreaterole))
 AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 AND has_function_privilege(current_user,'internal_iam_record_passkey(text,uuid,jsonb,text,text)','EXECUTE')
 AND NOT has_function_privilege(current_user,'internal_iam_issue_staff_session(uuid,text,jsonb,text,text,text)','EXECUTE')
 AND NOT has_function_privilege(current_user,'internal_iam_accept_invitation(text,text,jsonb,text,text)','EXECUTE')
 AND NOT has_function_privilege(current_user,'internal_iam_apply_workforce_lifecycle(jsonb,uuid,text,text,text)','EXECUTE') AS safe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0]?.safe===true;
}
/** Uses only an already reviewed enrollment; registration/import/recovery are intentionally absent. */
export class WorkforceStepUp {
 private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
 constructor(private readonly pool:pg.Pool,environment:unknown,private readonly verifier=new PasskeyAssertionVerifier()){
  this.environment=parse(workforceEnvironmentSchema,environment);
 }
 async begin(raw:unknown):Promise<{challengeId:string;expiresAt:string;publicKey:{challenge:string;rpId:string;timeout:number;allowCredentials:Array<{id:string;type:'public-key'}>;userVerification:'required'}}> {
  const input=parse(z.object({credential:token,enrollmentId:z.uuid(),actionHash:z.string().regex(/^[a-f0-9]{64}$/),correlationId:trace}).strict(),raw);
  const challengeId=randomUUID(),challenge=randomBytes(32).toString('base64url');
  return this.transaction(async client=>{
   const context=parse(contextSchema,(await client.query<{result:unknown}>('SELECT internal_iam_begin_passkey($1,$2,$3,$4,$5,$6,$7) AS result',[hash(input.credential),input.enrollmentId,input.actionHash,challengeId,hash(challenge),this.environment,input.correlationId])).rows[0]?.result);
   return {challengeId,expiresAt:context.ceremony.expiresAt,publicKey:{challenge,rpId:context.policy.rpId,timeout:Math.max(1,Math.min(600000,Date.parse(context.ceremony.expiresAt)-Date.now())),allowCredentials:[{id:context.credential.id,type:'public-key' as const}],userVerification:'required' as const}};
  });
 }
 async complete(raw:unknown):Promise<StepUpReceipt>{
  const input=parse(z.object({credential:token,challengeId:z.uuid(),response:z.unknown(),correlationId:trace}).strict(),raw);
  const context=await this.transaction(async client=>parse(contextSchema,(await client.query<{result:unknown}>('SELECT internal_iam_read_passkey_ceremony($1,$2,$3) AS result',[hash(input.credential),input.challengeId,this.environment])).rows[0]?.result),false);
  let proof:unknown;try{proof=await this.verifier.verify({...context,response:input.response});}catch(error){throw new WorkforceStepUpError(error instanceof PasskeyAssertionError?error.code:'FACTOR_INVALID');}
  const verified=parse(passkeyAssertionProofSchema,proof);
  return this.transaction(async client=>parse(stepUpReceiptSchema,(await client.query<{result:unknown}>('SELECT internal_iam_record_passkey($1,$2,$3::jsonb,$4,$5) AS result',[hash(input.credential),input.challengeId,JSON.stringify(verified),this.environment,input.correlationId])).rows[0]?.result));
 }
 private async transaction<T>(work:(client:pg.PoolClient)=>Promise<T>,writes=true):Promise<T>{
  let client:pg.PoolClient;try{client=await this.pool.connect();}catch{throw new WorkforceStepUpError('FACTOR_STORE_UNAVAILABLE');}
  let committing=false,discard=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   if(!await isIsolatedFactorWriter(client))throw new WorkforceStepUpError('FACTOR_STORE_UNAVAILABLE');
   await client.query("SELECT set_config('app.workforce_environment',$1,true)",[this.environment]);
   const value=await work(client);committing=writes;await client.query('COMMIT');committing=false;return value;
  }catch(error){try{await client.query('ROLLBACK');}catch{discard=true;}
   if(committing)throw new WorkforceStepUpError('FACTOR_OUTCOME_UNKNOWN');if(error instanceof WorkforceStepUpError)throw error;
   throw new WorkforceStepUpError(error instanceof Error&&errors[error.message]||'FACTOR_STORE_UNAVAILABLE');
  }finally{client.release(discard);}
 }
}
