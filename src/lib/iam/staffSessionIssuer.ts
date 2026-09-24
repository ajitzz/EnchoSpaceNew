import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {GoogleWorkforceIdentityError,workforceGoogleClientIdSchema,verifiedGoogleWorkforceIdentitySchema,type GoogleWorkforceIdentityPort} from './googleWorkforceIdentity.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const secret=z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(value=>Buffer.from(value,'base64url').toString('base64url')===value);
const trace=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const timestamp=z.iso.datetime({offset:true});
const completeSchema=z.object({challengeId:z.uuid(),browserVerifier:secret,credential:z.string().min(100).max(16000),correlationId:trace}).strict();
const sessionSchema=z.object({sessionId:z.uuid(),organizationId:z.uuid(),membershipId:z.uuid(),accountId:z.number().int().positive(),
  assuranceLevel:z.literal('AAL1'),authenticatedAt:timestamp,expiresAt:timestamp}).strict();
export type IssuedStaffSession=z.infer<typeof sessionSchema>;
export const workforceIdentityPolicyConfigSchema=z.object({googleClientId:workforceGoogleClientIdSchema,
  challengeTtlSeconds:z.number().int().min(60).max(600),idTokenMaxAgeSeconds:z.number().int().min(60).max(600),
  allowGmail:z.boolean(),allowedHostedDomains:z.array(z.string().regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/)).max(20),
  maximumActiveSessions:z.number().int().min(1).max(10),maximumStartsPerMinute:z.number().int().min(1).max(1200),
}).strict().refine(value=>new Set(value.allowedHostedDomains).size===value.allowedHostedDomains.length);

const errors=['INPUT_INVALID','LOGIN_NOT_CONFIGURED','LOGIN_RATE_LIMITED','LOGIN_CHALLENGE_INVALID','IDENTITY_INVALID','IDENTITY_UNAVAILABLE',
  'MEMBERSHIP_UNAVAILABLE','SESSION_LIMIT_REACHED','ISSUER_UNAVAILABLE','OUTCOME_UNKNOWN'] as const;
export class StaffSessionIssuerError extends Error {constructor(readonly code:typeof errors[number]){super(code);}}
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new StaffSessionIssuerError('INPUT_INVALID');return result.data;}
const mappedSqlErrors:Record<string,typeof errors[number]>={IAM_LOGIN_NOT_CONFIGURED:'LOGIN_NOT_CONFIGURED',IAM_LOGIN_RATE_LIMITED:'LOGIN_RATE_LIMITED',
  IAM_LOGIN_CHALLENGE_INVALID:'LOGIN_CHALLENGE_INVALID',IAM_LOGIN_IDENTITY_INVALID:'IDENTITY_INVALID',IAM_LOGIN_MEMBERSHIP_UNAVAILABLE:'MEMBERSHIP_UNAVAILABLE',IAM_LOGIN_SESSION_LIMIT:'SESSION_LIMIT_REACHED'};

/** No raw-table rights or inherited administration are allowed on this connection. */
export async function isIsolatedStaffSessionIssuer(client:pg.PoolClient):Promise<boolean>{
  const row=(await client.query<{safe:boolean}>(`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE'))
    AND session_user=current_user
    AND NOT EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
      (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND has_function_privilege(current_user,'internal_iam_issue_staff_session(uuid,text,jsonb,text,text,text)','EXECUTE')
    AND NOT has_function_privilege(current_user,'internal_iam_issue_invitation(jsonb,uuid,text,text)','EXECUTE')
    AND NOT has_function_privilege(current_user,'internal_iam_accept_invitation(text,text,jsonb,text,text)','EXECUTE')
    AND NOT has_function_privilege(current_user,'internal_iam_apply_workforce_lifecycle(jsonb,uuid,text,text,text)','EXECUTE') AS safe
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  return row?.safe===true;
}

/**
 * All cookie material is private transport data for the trusted HTTP adapter.
 * Never JSON-serialize the entire return value to a browser or log the input.
 * Separate endpoint CSRF/Origin checks are mandatory; this class binds browser
 * nonce evidence but does not process HTTP cookies or consumer JWTs.
 */
export class StaffSessionIssuer {
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  private readonly organizationId:string;
  private readonly clientId:string;
  constructor(private readonly issuer:pg.Pool,private readonly identity:GoogleWorkforceIdentityPort,config:{environment:unknown;organizationId:unknown;googleClientId:unknown}){
    this.environment=parse(workforceEnvironmentSchema,config.environment);this.organizationId=parse(z.uuid(),config.organizationId);
    this.clientId=parse(workforceGoogleClientIdSchema,config.googleClientId);
  }
  async begin():Promise<{public:{challengeId:string;nonce:string;clientId:string;expiresAt:string};private:{browserVerifier:string}}> {
    const challengeId=randomUUID(),nonce=randomBytes(32).toString('base64url'),browserVerifier=randomBytes(32).toString('base64url');
    const response=await this.transaction(async client=>(await client.query<{result:unknown}>(
      'SELECT internal_iam_begin_workforce_login($1,$2,$3,$4,$5,$6) AS result',[
        this.organizationId,this.environment,this.clientId,challengeId,digest(nonce),digest(browserVerifier),
      ])).rows[0]?.result);
    const value=parse(z.object({challengeId:z.uuid(),expiresAt:timestamp,maximumAgeSeconds:z.number().int().min(60).max(600)}).strict(),response);
    return {public:{challengeId:value.challengeId,nonce,clientId:this.clientId,expiresAt:value.expiresAt},private:{browserVerifier}};
  }
  async complete(rawInput:unknown):Promise<{public:IssuedStaffSession;private:{credential:string}}> {
    const input=parse(completeSchema,rawInput);
    const response=await this.transaction(async client=>(await client.query<{result:unknown}>(
      'SELECT internal_iam_read_workforce_login($1,$2,$3,$4) AS result',[input.challengeId,digest(input.browserVerifier),this.environment,this.clientId])).rows[0]?.result,false);
    const challenge=parse(z.object({nonceHash:z.string().regex(/^[a-f0-9]{64}$/),maximumAgeSeconds:z.number().int().min(60).max(600)}).strict(),response);
    let verified:unknown;
    try {verified=await this.identity.verify({credential:input.credential,...challenge});}
    catch(error){throw new StaffSessionIssuerError(error instanceof GoogleWorkforceIdentityError && error.code==='IDENTITY_INVALID'?'IDENTITY_INVALID':'IDENTITY_UNAVAILABLE');}
    const proof=parse(verifiedGoogleWorkforceIdentitySchema,verified);
    if(proof.audience!==this.clientId || proof.nonceHash!==challenge.nonceHash || proof.tokenHash!==digest(input.credential))throw new StaffSessionIssuerError('IDENTITY_INVALID');
    const credential=`wfs_${randomBytes(32).toString('base64url')}`;
    const result=await this.transaction(async client=>(await client.query<{result:unknown}>(
      'SELECT internal_iam_issue_staff_session($1,$2,$3::jsonb,$4,$5,$6) AS result',[
        input.challengeId,digest(input.browserVerifier),JSON.stringify(proof),digest(credential),this.environment,input.correlationId,
      ])).rows[0]?.result);
    return {public:parse(sessionSchema,result),private:{credential}};
  }
  async logout(rawInput:unknown):Promise<{outcome:'LOGGED_OUT'}> {
    const input=parse(z.object({credential:z.string().regex(/^wfs_[A-Za-z0-9_-]{43}$/),correlationId:trace}).strict(),rawInput);
    const result=await this.transaction(async client=>(await client.query<{result:unknown}>(
      'SELECT internal_iam_logout_staff_session($1,$2,$3) AS result',[digest(input.credential),this.environment,input.correlationId])).rows[0]?.result);
    return parse(z.object({outcome:z.literal('LOGGED_OUT')}).strict(),result);
  }
  private async transaction<T>(work:(client:pg.PoolClient)=>Promise<T>,writes=true):Promise<T>{
    let client:pg.PoolClient;try{client=await this.issuer.connect();}catch{throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');}
    let discard=false;let committing=false;
    try {
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      if(!await isIsolatedStaffSessionIssuer(client))throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');
      await client.query("SELECT set_config('app.workforce_environment',$1,true)",[this.environment]);
      const value=await work(client);committing=writes;await client.query('COMMIT');committing=false;return value;
    } catch(error) {
      try{await client.query('ROLLBACK');}catch{discard=true;}
      if(committing)throw new StaffSessionIssuerError('OUTCOME_UNKNOWN');
      if(error instanceof StaffSessionIssuerError)throw error;
      throw new StaffSessionIssuerError(error instanceof Error && mappedSqlErrors[error.message] || 'ISSUER_UNAVAILABLE');
    } finally {client.release(discard);}
  }
}
