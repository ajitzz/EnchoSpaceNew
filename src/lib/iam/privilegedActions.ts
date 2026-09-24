import {createHash, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {permissionCheckInputSchema, type PermissionCheckInput} from './authorizationPort.js';
import {principalContextSchema, type PrincipalContext} from '../../shared/iam/principalContext.js';
import {workforceEnvironmentSchema, workforcePermissionCodeSchema, workforceResourceRefSchema} from '../../shared/iam/contracts.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonSchema = z.string().trim().min(10).max(2000);
const actorSchema = z.object({principal:principalContextSchema, organizationId:z.string().uuid()}).strict();
const reviewSchema = actorSchema.extend({
  authorizationId:z.string().uuid(), expectedCommandHash:hashSchema,
  reason:reasonSchema, stepUpReceiptId:z.string().uuid().optional(),
}).strict();
const readSchema = actorSchema.extend({authorizationId:z.string().uuid()}).strict();
const policySchema = z.object({
  permission_code:workforcePermissionCodeSchema, resource_type:z.string(), step_up_required:z.boolean(),
  checker_policy:z.enum(['NONE','DISTINCT_ACTOR']), config_hash:hashSchema,
  approval_status:z.enum(['PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED']), ttl_seconds:z.number().int().min(60).max(1800),
}).strict();
type Policy = z.infer<typeof policySchema>;
type Actor = z.infer<typeof actorSchema>;

export const privilegedActionReceiptSchema = z.object({
  id:z.string().uuid(), organizationId:z.string().uuid(), makerMembershipId:z.string().uuid(),
  permission:workforcePermissionCodeSchema, resource:workforceResourceRefSchema,
  environment:workforceEnvironmentSchema, provider:z.enum(['META','GOOGLE']).nullable(), amountMinor:z.string().nullable(),
  commandHash:hashSchema, policySnapshotHash:hashSchema,
  status:z.enum(['PENDING','APPROVED','REJECTED','EXPIRED','CONSUMED','CANCELLED']),
  version:z.number().int().positive(), requiredApprovals:z.number().int().min(0).max(3),
  stepUpReceiptId:z.string().uuid().nullable(), reason:reasonSchema,
  createdAt:z.string().datetime(), expiresAt:z.string().datetime(), expired:z.boolean(),
}).strict();
export type PrivilegedActionReceipt = z.infer<typeof privilegedActionReceiptSchema>;
export type PrivilegedActionResult = Readonly<{receipt:PrivilegedActionReceipt; replayed:boolean}>;

export type PrivilegedActionErrorCode = 'INPUT_INVALID' | 'PRINCIPAL_NOT_ELIGIBLE' | 'ENVIRONMENT_MISMATCH'
  | 'IAM_NOT_READY' | 'PERMISSION_DENIED' | 'ACTION_NOT_FOUND' | 'ACTION_EXPIRED' | 'POLICY_CHANGED'
  | 'STEP_UP_REQUIRED' | 'STEP_UP_INVALID' | 'MAKER_CHECKER_CONFLICT' | 'IDEMPOTENCY_CONFLICT'
  | 'COMMAND_CONFLICT' | 'DECISION_CONFLICT' | 'ACTION_STATE_CONFLICT' | 'OUTCOME_UNKNOWN' | 'STORE_UNAVAILABLE';

export class PrivilegedActionError extends Error {
  readonly status:number;
  constructor(readonly code:PrivilegedActionErrorCode, cause?:unknown) {
    super(code,{cause}); this.name='PrivilegedActionError';
    this.status=code==='INPUT_INVALID'?400:code==='ACTION_NOT_FOUND'?404:
      ['IAM_NOT_READY','OUTCOME_UNKNOWN','STORE_UNAVAILABLE'].includes(code)?503:
      ['PRINCIPAL_NOT_ELIGIBLE','ENVIRONMENT_MISMATCH','PERMISSION_DENIED','STEP_UP_REQUIRED','STEP_UP_INVALID','MAKER_CHECKER_CONFLICT'].includes(code)?403:409;
  }
}

function parse<T>(schema:z.ZodType<T>, value:unknown):T {
  const result=schema.safeParse(value);
  if (!result.success) throw new PrivilegedActionError('INPUT_INVALID');
  return result.data;
}

/** JSON-only stable representation: no Date/toJSON callbacks or mutable class instances. */
function canonicalJson(value:unknown, depth=0, budget={nodes:0}):string {
  if (depth>12 || ++budget.nodes>10000) throw new PrivilegedActionError('INPUT_INVALID');
  if (value===null) return 'null';
  if (typeof value==='string') {
    if (value.length>65536) throw new PrivilegedActionError('INPUT_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value==='boolean') return JSON.stringify(value);
  if (typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length>1000) throw new PrivilegedActionError('INPUT_INVALID');
    return `[${value.map(item=>canonicalJson(item,depth+1,budget)).join(',')}]`;
  }
  if (typeof value==='object' && value && Object.getPrototypeOf(value)===Object.prototype) {
    const entries=Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0);
    if (entries.length>1000 || entries.some(([key])=>key.length>512)) throw new PrivilegedActionError('INPUT_INVALID');
    return `{${entries.map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item,depth+1,budget)}`).join(',')}}`;
  }
  throw new PrivilegedActionError('INPUT_INVALID');
}
const digest = (text:string) => createHash('sha256').update(text).digest('hex');
function requestUuid(organization:string, membership:string, key:string):string {
  const bytes=createHash('sha256').update(canonicalJson(['encho:iam:request:v1',organization,membership,key])).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x80; bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const receiptProjection = `id,organization_id,maker_membership_id,permission_code,resource_type,resource_id,
  environment,provider,amount_minor::text,command_hash,policy_snapshot_hash,status,version,required_approvals,
  step_up_challenge_id,reason,created_at,expires_at,expires_at<=clock_timestamp() AS expired`;
function receipt(row:Record<string,unknown>):PrivilegedActionReceipt {
  const date=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
  return parse(privilegedActionReceiptSchema,{
    id:row.id,organizationId:row.organization_id,makerMembershipId:row.maker_membership_id,
    permission:row.permission_code,resource:{type:row.resource_type,id:row.resource_id},
    environment:row.environment,provider:row.provider,amountMinor:row.amount_minor,
    commandHash:row.command_hash,policySnapshotHash:row.policy_snapshot_hash,status:row.status,
    version:row.version,requiredApprovals:row.required_approvals,stepUpReceiptId:row.step_up_challenge_id,
    reason:row.reason,createdAt:date(row.created_at),expiresAt:date(row.expires_at),expired:row.expired,
  });
}

export type PrivilegedActionRequestInput<Command> = {
  context: PermissionCheckInput;
  idempotencyKey: string;
  reason: string;
  command: Command;
};

/** Creates review authority only. Domain execution belongs to runAuthorized(). */
export class PrivilegedActions<Command> {
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  private readonly commandKind:string;
  private readonly permission:z.infer<typeof workforcePermissionCodeSchema>;
  private readonly requestSchema: z.ZodType<PrivilegedActionRequestInput<Command>>;
  constructor(private readonly pool:pg.Pool, options:{environment:z.infer<typeof workforceEnvironmentSchema>; commandKind:string; permission:z.infer<typeof workforcePermissionCodeSchema>; commandSchema:z.ZodType<Command>}) {
    this.environment=parse(workforceEnvironmentSchema,options.environment);
    this.permission=parse(workforcePermissionCodeSchema,options.permission);
    this.commandKind=parse(z.string().regex(/^[a-z][a-z0-9_.:-]{2,79}$/),options.commandKind);
    this.requestSchema=z.object({context:permissionCheckInputSchema,idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),reason:reasonSchema,command:options.commandSchema}).strict();
  }

  /** Supply this exact fingerprint to the separate identity/factor adapter. */
  fingerprint(rawInput:unknown):string {
    const input=parse(this.requestSchema,rawInput);
    const context=input.context;
    if (context.permission!==this.permission || (context.conditions.amountMinor && BigInt(context.conditions.amountMinor)>9223372036854775807n)) throw new PrivilegedActionError('INPUT_INVALID');
    const canonical=canonicalJson({contract:'encho:privileged-command:v1',kind:this.commandKind,
      organizationId:context.tenant.organizationId,permission:context.permission,resource:context.resource,
      provider:context.conditions.provider??null,environment:context.conditions.environment,
      amountMinor:context.conditions.amountMinor??null,reason:input.reason,command:input.command});
    if (Buffer.byteLength(canonical,'utf8')>65536) throw new PrivilegedActionError('INPUT_INVALID');
    const hash=digest(canonical);
    if (context.conditions.commandHash && context.conditions.commandHash!==hash) throw new PrivilegedActionError('COMMAND_CONFLICT');
    return hash;
  }

  async request(rawInput:unknown):Promise<PrivilegedActionResult> {
    const input=parse(this.requestSchema,rawInput);
    const hash=this.fingerprint(input);
    const context=input.context;
    if (context.evidence.actionAuthorizationId) throw new PrivilegedActionError('INPUT_INVALID');
    const actor={principal:context.principal,organizationId:context.tenant.organizationId};
    return this.transaction(actor,async client=>{
      const policy=await this.currentPolicy(client,context.permission);
      await this.requireScope(client,actor,context.permission,context.resource.target.type,context.resource.target.id,context.conditions.provider??null,context.conditions.environment,context.conditions.amountMinor??null,policy);
      if (context.resource.assignmentId) {
        const assigned=await client.query(`SELECT id FROM internal_work_assignments WHERE id=$1 AND organization_id=$2 AND assignee_membership_id=$3 AND resource_type=$4 AND resource_id=$5 AND state='CLAIMED' AND lease_until>clock_timestamp() AND version=$6 AND fence=$7 AND environment=$8 AND required_permission_code=$9 AND provider IS NOT DISTINCT FROM $10::text`,[context.resource.assignmentId,actor.organizationId,actor.principal.membershipId,context.resource.target.type,context.resource.target.id,context.resource.assignmentVersion,context.resource.assignmentFence,this.environment,context.permission,context.conditions.provider??null]);
        if (!assigned.rowCount) throw new PrivilegedActionError('PERMISSION_DENIED');
      }
      const id=requestUuid(actor.organizationId,actor.principal.membershipId!,input.idempotencyKey);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('iam-request:'||$1,0))",[id]);
      const existing=(await client.query(`SELECT ${receiptProjection} FROM internal_action_authorizations WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if (existing) {
        const prior=receipt(existing);
        if (prior.commandHash!==hash || prior.stepUpReceiptId!==(context.evidence.stepUpReceiptId??null)) throw new PrivilegedActionError('IDEMPOTENCY_CONFLICT');
        this.assertCurrent(prior,policy);
        return {receipt:prior,replayed:true};
      }
      const factorExpiry=await this.requireFactor(client,actor,hash,context.evidence.stepUpReceiptId,policy.step_up_required);
      const inserted=await client.query(`INSERT INTO internal_action_authorizations(id,organization_id,permission_code,resource_type,resource_id,environment,provider,amount_minor,command_hash,policy_snapshot_hash,maker_membership_id,step_up_challenge_id,required_approvals,expires_at,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,LEAST(clock_timestamp()+$14::int*interval '1 second',COALESCE($15::timestamptz,'infinity'::timestamptz)),$16)
        ON CONFLICT(organization_id,maker_membership_id,command_hash) DO NOTHING RETURNING ${receiptProjection}`,
      [id,actor.organizationId,context.permission,context.resource.target.type,context.resource.target.id,this.environment,context.conditions.provider??null,context.conditions.amountMinor??null,hash,policy.config_hash,actor.principal.membershipId,context.evidence.stepUpReceiptId??null,policy.checker_policy==='DISTINCT_ACTOR'?1:0,policy.ttl_seconds,factorExpiry,input.reason]);
      if (!inserted.rowCount) throw new PrivilegedActionError('COMMAND_CONFLICT');
      let created=receipt(inserted.rows[0]);
      if (created.requiredApprovals===0) created=await this.transition(client,id,'APPROVED');
      await this.audit(client,actor,created,'PRIVILEGED_ACTION_REQUESTED',input.reason);
      return {receipt:created,replayed:false};
    });
  }

  approve(rawInput:unknown):Promise<PrivilegedActionResult> {return this.review(rawInput,'APPROVE');}
  reject(rawInput:unknown):Promise<PrivilegedActionResult> {return this.review(rawInput,'REJECT');}

  async read(rawInput:unknown):Promise<Readonly<{receipt:PrivilegedActionReceipt; authorityState:'CURRENT'|'POLICY_CHANGED'|'EXPIRED'|'TERMINAL'}>> {
    const input=parse(readSchema,rawInput);
    return this.transaction(input,async client=>{
      const action=await this.load(client,input.authorizationId);
      const policy=await this.currentPolicy(client,action.permission);
      await this.requireScope(client,input,action.permission,action.resource.type,action.resource.id,action.provider,action.environment,action.amountMinor,policy);
      const authorityState=action.expired?'EXPIRED':action.policySnapshotHash!==policy.config_hash?'POLICY_CHANGED':['REJECTED','EXPIRED','CONSUMED','CANCELLED'].includes(action.status)?'TERMINAL':'CURRENT';
      return {receipt:action,authorityState}; // A read result never grants execution.
    });
  }

  private async review(rawInput:unknown,decision:'APPROVE'|'REJECT'):Promise<PrivilegedActionResult> {
    const input=parse(reviewSchema,rawInput);
    return this.transaction(input,async client=>{
      const action=await this.load(client,input.authorizationId,true);
      const policy=await this.currentPolicy(client,action.permission);
      await this.requireScope(client,input,action.permission,action.resource.type,action.resource.id,action.provider,action.environment,action.amountMinor,policy);
      if (action.makerMembershipId===input.principal.membershipId) throw new PrivilegedActionError('MAKER_CHECKER_CONFLICT');
      if (action.commandHash!==input.expectedCommandHash) throw new PrivilegedActionError('COMMAND_CONFLICT');
      const prior=(await client.query<{decision:string;reason:string;step_up_challenge_id:string|null}>(`SELECT decision,reason,step_up_challenge_id FROM internal_action_approvals WHERE authorization_id=$1 AND checker_membership_id=$2`,[action.id,input.principal.membershipId])).rows[0];
      if (prior) {
        if (prior.decision!==decision || prior.reason!==input.reason || prior.step_up_challenge_id!==(input.stepUpReceiptId??null)) throw new PrivilegedActionError('DECISION_CONFLICT');
        return {receipt:action,replayed:true};
      }
      this.assertCurrent(action,policy);
      if (action.status!=='PENDING' || action.requiredApprovals===0) throw new PrivilegedActionError('ACTION_STATE_CONFLICT');
      await this.requireFactor(client,input,action.commandHash,input.stepUpReceiptId,policy.step_up_required);
      await client.query(`INSERT INTO internal_action_approvals(authorization_id,checker_membership_id,decision,command_hash,reason,step_up_challenge_id) VALUES($1,$2,$3,$4,$5,$6)`,[action.id,input.principal.membershipId,decision,action.commandHash,input.reason,input.stepUpReceiptId??null]);
      let updated:PrivilegedActionReceipt;
      if (decision==='REJECT') updated=await this.transition(client,action.id,'REJECTED');
      else {
        // The trigger has visibility over all approvals; a checker does not get
        // raw access to another reviewer's evidence merely to count approvals.
        await client.query('SAVEPOINT approval_threshold');
        try {updated=await this.transition(client,action.id,'APPROVED');await client.query('RELEASE SAVEPOINT approval_threshold');}
        catch (error) {
          if (!(error instanceof Error) || error.message!=='IAM_CHECKER_REQUIRED') throw error;
          await client.query('ROLLBACK TO SAVEPOINT approval_threshold');
          await client.query('RELEASE SAVEPOINT approval_threshold');
          updated=await this.load(client,action.id);
        }
      }
      await this.audit(client,input,updated,decision==='APPROVE'?'PRIVILEGED_ACTION_APPROVED':'PRIVILEGED_ACTION_REJECTED',input.reason);
      return {receipt:updated,replayed:false};
    });
  }

  private assertCurrent(action:PrivilegedActionReceipt,policy:Policy):void {
    if (action.expired || action.status==='EXPIRED') throw new PrivilegedActionError('ACTION_EXPIRED');
    if (action.policySnapshotHash!==policy.config_hash) throw new PrivilegedActionError('POLICY_CHANGED');
  }
  private async load(client:pg.PoolClient,id:string,lock=false):Promise<PrivilegedActionReceipt> {
    const row=(await client.query(`SELECT ${receiptProjection} FROM internal_action_authorizations WHERE id=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
    if (!row || row.permission_code!==this.permission) throw new PrivilegedActionError('ACTION_NOT_FOUND');
    return receipt(row);
  }
  private async transition(client:pg.PoolClient,id:string,status:'APPROVED'|'REJECTED'):Promise<PrivilegedActionReceipt> {
    const row=(await client.query(`UPDATE internal_action_authorizations SET status=$2,version=version+1 WHERE id=$1 RETURNING ${receiptProjection}`,[id,status])).rows[0];
    if (!row) throw new PrivilegedActionError('ACTION_NOT_FOUND');
    return receipt(row);
  }
  private async currentPolicy(client:pg.PoolClient,permission:string):Promise<Policy> {
    const row=(await client.query(`SELECT p.permission_code,p.resource_type,p.step_up_required,p.checker_policy,v.config_hash,v.approval_status,(v.config->>'stepUpTtlSeconds')::int AS ttl_seconds FROM internal_permission_catalog p CROSS JOIN internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE p.permission_code=$1 AND p.active AND cp.singleton`,[permission])).rows[0];
    const result=policySchema.safeParse(row);
    if (!result.success || (this.environment==='PRODUCTION' && result.data.approval_status!=='APPROVED')) throw new PrivilegedActionError('IAM_NOT_READY');
    return result.data;
  }
  private async requireScope(client:pg.PoolClient,actor:Actor,permission:string,resourceType:string,resourceId:string,provider:string|null,environment:string,amount:string|null,policy:Policy):Promise<void> {
    if (environment!==this.environment) throw new PrivilegedActionError('ENVIRONMENT_MISMATCH');
    if (resourceType!==policy.resource_type) throw new PrivilegedActionError('PERMISSION_DENIED');
    const allowed=(await client.query<{allowed:boolean}>('SELECT internal_iam_has_permission($1,$2,$3,$4,$5,$6,$7) AS allowed',[actor.organizationId,permission,resourceType,resourceId,provider,this.environment,amount])).rows[0];
    if (!allowed?.allowed) throw new PrivilegedActionError('PERMISSION_DENIED');
  }
  private async requireFactor(client:pg.PoolClient,actor:Actor,hash:string,id:string|undefined,required:boolean):Promise<string|null> {
    if (!required && !id) return null;
    if (!id) throw new PrivilegedActionError('STEP_UP_REQUIRED');
    const row=(await client.query<{expires_at:Date}>(`SELECT expires_at FROM internal_step_up_challenges WHERE id=$1 AND organization_id=$2 AND membership_id=$3 AND session_id=$4 AND action_hash=$5 AND status='VERIFIED' AND expires_at>clock_timestamp() AND verified_at<=clock_timestamp() AND (required_assurance='AAL2' OR achieved_assurance='PHISHING_RESISTANT')`,[id,actor.organizationId,actor.principal.membershipId,actor.principal.sessionId,hash])).rows[0];
    if (!row) throw new PrivilegedActionError('STEP_UP_INVALID');
    return row.expires_at.toISOString();
  }
  private async audit(client:pg.PoolClient,actor:Actor,action:PrivilegedActionReceipt,event:string,reason:string):Promise<void> {
    await client.query(`INSERT INTO internal_iam_events(id,organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,new_hash,evidence,correlation_id,causation_id,request_hash,reason)
      VALUES($1,$2,$3,$4,$5,'AUTHORIZATION',$6,$7,$8::jsonb,$9,$10,$11,$12)`,[randomUUID(),actor.organizationId,actor.principal.accountId,actor.principal.membershipId,event,action.id,action.policySnapshotHash,JSON.stringify({permission:action.permission,status:action.status,environment:action.environment,version:action.version}),actor.principal.correlationId,actor.principal.operationId,action.commandHash,reason]);
  }
  private async transaction<T>(actor:Actor,work:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
    const principal:PrincipalContext=actor.principal;
    if (principal.actorKind!=='STAFF' || principal.organizationId!==actor.organizationId) throw new PrivilegedActionError('PRINCIPAL_NOT_ELIGIBLE');
    const client=await this.pool.connect().catch((cause:unknown)=>{throw new PrivilegedActionError('STORE_UNAVAILABLE',cause);});
    let committing=false;
    let discarded=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      const safe=(await client.query<{safe:boolean}>(`SELECT NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR pg_has_role(current_user,c.relowner,'MEMBER') OR has_schema_privilege(current_user,'public','CREATE') OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))) AS safe FROM pg_roles r JOIN pg_class c ON c.oid='public.internal_organizations'::regclass WHERE r.rolname=current_user`)).rows[0];
      if (!safe?.safe) throw new PrivilegedActionError('IAM_NOT_READY');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true),set_config('app.workforce_environment',$5,true)`,[String(principal.accountId),actor.organizationId,principal.membershipId,principal.sessionId,this.environment]);
      if (!(await client.query<{valid:boolean}>('SELECT internal_iam_lock_authority() AS valid')).rows[0]?.valid) throw new PrivilegedActionError('PERMISSION_DENIED');
      const value=await work(client);committing=true;await client.query('COMMIT');return value;
    } catch (error) {
      try {await client.query('ROLLBACK');} catch {client.release(true);discarded=true;throw new PrivilegedActionError(committing?'OUTCOME_UNKNOWN':'STORE_UNAVAILABLE',error);}
      if (committing) throw new PrivilegedActionError('OUTCOME_UNKNOWN',error);
      if (error instanceof PrivilegedActionError) throw error;
      const code=error instanceof Error?error.message:'';
      if (code==='IAM_POLICY_CHANGED') throw new PrivilegedActionError('POLICY_CHANGED');
      if (code==='IAM_OPERATIONAL_POLICY_UNAPPROVED') throw new PrivilegedActionError('IAM_NOT_READY');
      if (code.includes('STEP_UP') || code==='IAM_FACTOR_TERMINAL') throw new PrivilegedActionError('STEP_UP_INVALID');
      if (code==='IAM_AUTHORIZATION_NOT_PENDING' || code==='IAM_AUTHORIZATION_TERMINAL' || code==='IAM_AUTHORIZATION_INVALID_TRANSITION') throw new PrivilegedActionError('ACTION_STATE_CONFLICT');
      if (code==='IAM_AUTHORIZATION_EXPIRED') throw new PrivilegedActionError('ACTION_EXPIRED');
      if (code==='IAM_MAKER_CHECKER_CONFLICT') throw new PrivilegedActionError('MAKER_CHECKER_CONFLICT');
      if (code.includes('PERMISSION_DENIED') || code==='IAM_CHECKER_INACTIVE') throw new PrivilegedActionError('PERMISSION_DENIED');
      throw new PrivilegedActionError('STORE_UNAVAILABLE',error);
    } finally {if (!discarded) client.release();}
  }
}
