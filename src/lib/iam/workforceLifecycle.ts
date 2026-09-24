import type pg from 'pg';
import {z} from 'zod';
import {PrivilegedActions} from './privilegedActions.js';
import {permissionCheckInputSchema} from './authorizationPort.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {isRestrictedWorkforceRuntime} from './runtimeBoundary.js';

export const workforceLifecycleCommandSchema=z.object({
  targetMembershipId:z.string().uuid(),expectedVersion:z.number().int().positive().max(2147483646),
  operation:z.enum(['SUSPEND','OFFBOARD','REVOKE_SESSIONS']),environment:workforceEnvironmentSchema,
}).strict();
const invocationSchema=z.object({context:permissionCheckInputSchema,idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),reason:z.string().trim().min(10).max(2000),command:workforceLifecycleCommandSchema}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema=z.object({
  authorization_id:z.string().uuid(),organization_id:z.string().uuid(),actor_membership_id:z.string().uuid(),target_membership_id:z.string().uuid(),
  operation:workforceLifecycleCommandSchema.shape.operation,environment:workforceEnvironmentSchema,command_hash:hash,policy_snapshot_hash:hash,
  previous_version:z.number().int().positive(),result_version:z.number().int().positive(),result_status:z.enum(['ACTIVE','SUSPENDED','OFFBOARDED']),
  effects:z.object({grantsRevoked:z.number().int().nonnegative(),sessionsRevoked:z.number().int().nonnegative(),factorsExpired:z.number().int().nonnegative(),assignmentsReleased:z.number().int().nonnegative(),authorizationsCancelled:z.number().int().nonnegative()}).strict(),
  reason:z.string(),created_at:z.string().datetime({offset:true}),
}).strict();
const storedResult=z.object({receipt:receiptSchema,replayed:z.boolean()}).strict();
export type WorkforceLifecycleResult=Readonly<{replayed:boolean;receipt:Readonly<{
  authorizationId:string;targetMembershipId:string;operation:z.infer<typeof workforceLifecycleCommandSchema>['operation'];
  version:number;status:'ACTIVE'|'SUSPENDED'|'OFFBOARDED';effects:z.infer<typeof receiptSchema>['effects'];commandHash:string;createdAt:string;
}>}>;
type LifecycleErrorCode='INPUT_INVALID'|'PERMISSION_DENIED'|'SELF_ACTION_DENIED'|'ENVIRONMENT_SCOPE_DENIED'|'IAM_NOT_READY'
  |'AUTHORIZATION_INVALID'|'COMMAND_CONFLICT'|'MEMBER_NOT_FOUND'|'CAS_CONFLICT'|'STATE_CONFLICT'
  |'OWNER_CHECKER_REQUIRED'|'OWNER_QUORUM_REQUIRED'|'OUTCOME_UNKNOWN'|'STORE_UNAVAILABLE';
export class WorkforceLifecycleError extends Error {
  readonly status:number;
  constructor(readonly code:LifecycleErrorCode,cause?:unknown){
    super(code,{cause});this.name='WorkforceLifecycleError';
    this.status=code==='INPUT_INVALID'?400:code==='MEMBER_NOT_FOUND'?404:
      ['IAM_NOT_READY','OUTCOME_UNKNOWN','STORE_UNAVAILABLE'].includes(code)?503:
      ['PERMISSION_DENIED','SELF_ACTION_DENIED','ENVIRONMENT_SCOPE_DENIED','AUTHORIZATION_INVALID','OWNER_CHECKER_REQUIRED'].includes(code)?403:409;
  }
}
const errors:Readonly<Record<string,LifecycleErrorCode>>={
  IAM_LIFECYCLE_INPUT_INVALID:'INPUT_INVALID',IAM_LIFECYCLE_PERMISSION_DENIED:'PERMISSION_DENIED',
  IAM_LIFECYCLE_SELF_ACTION_DENIED:'SELF_ACTION_DENIED',IAM_LIFECYCLE_ENVIRONMENT_SCOPE_DENIED:'ENVIRONMENT_SCOPE_DENIED',
  IAM_LIFECYCLE_NOT_READY:'IAM_NOT_READY',IAM_LIFECYCLE_AUTHORIZATION_INVALID:'AUTHORIZATION_INVALID',
  IAM_LIFECYCLE_COMMAND_CONFLICT:'COMMAND_CONFLICT',IAM_LIFECYCLE_NOT_FOUND:'MEMBER_NOT_FOUND',
  IAM_LIFECYCLE_CAS_CONFLICT:'CAS_CONFLICT',IAM_LIFECYCLE_STATE_CONFLICT:'STATE_CONFLICT',
  IAM_LIFECYCLE_OWNER_CHECKER_REQUIRED:'OWNER_CHECKER_REQUIRED',IAM_LIFECYCLE_OWNER_QUORUM_REQUIRED:'OWNER_QUORUM_REQUIRED',
  IAM_AUTHORIZATION_EXPIRED:'AUTHORIZATION_INVALID',IAM_MAKER_STEP_UP_REQUIRED:'AUTHORIZATION_INVALID',
  IAM_CHECKER_STEP_UP_REQUIRED:'AUTHORIZATION_INVALID',IAM_CHECKER_REQUIRED:'AUTHORIZATION_INVALID',
  IAM_MAKER_PERMISSION_DENIED:'PERMISSION_DENIED',IAM_POLICY_CHANGED:'AUTHORIZATION_INVALID',
};

/** Exact approved governance command, never a session or identity issuer. */
export class WorkforceLifecycle {
  readonly standardActions:PrivilegedActions<z.infer<typeof workforceLifecycleCommandSchema>>;
  readonly protectedActions:PrivilegedActions<z.infer<typeof workforceLifecycleCommandSchema>>;
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  constructor(private readonly runtime:pg.Pool,environment:z.infer<typeof workforceEnvironmentSchema>){
    this.environment=workforceEnvironmentSchema.parse(environment);
    this.standardActions=new PrivilegedActions(runtime,{environment:this.environment,permission:'workforce.suspend',commandKind:'workforce.lifecycle.v1',commandSchema:workforceLifecycleCommandSchema});
    this.protectedActions=new PrivilegedActions(runtime,{environment:this.environment,permission:'workforce.grant',commandKind:'workforce.lifecycle.v1',commandSchema:workforceLifecycleCommandSchema});
  }
  async execute(raw:unknown):Promise<WorkforceLifecycleResult>{
    const parsed=invocationSchema.safeParse(raw);
    if(!parsed.success)throw new WorkforceLifecycleError('INPUT_INVALID');
    const input=parsed.data;const context=input.context;
    if(context.principal.actorKind!=='STAFF' || context.tenant.organizationId!==context.principal.organizationId)throw new WorkforceLifecycleError('PERMISSION_DENIED');
    if(!['workforce.suspend','workforce.grant'].includes(context.permission)
      || context.conditions.environment!==this.environment || input.command.environment!==this.environment
      || context.resource.target.type!=='WORKFORCE' || context.resource.target.id!==context.tenant.organizationId
      || context.resource.ancestors.length || context.resource.ownerAccountId || context.resource.assignmentId || context.resource.revision
      || context.conditions.provider || context.conditions.amountMinor)throw new WorkforceLifecycleError('INPUT_INVALID');
    const actions=context.permission==='workforce.suspend'?this.standardActions:this.protectedActions;
    actions.fingerprint(input); // Validate exact semantic identity before any write.
    if(!context.evidence.actionAuthorizationId)throw new WorkforceLifecycleError('AUTHORIZATION_INVALID');
    const client=await this.runtime.connect().catch((cause:unknown)=>{throw new WorkforceLifecycleError('STORE_UNAVAILABLE',cause);});
    let committing=false;let discarded=false;
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      if(!await isRestrictedWorkforceRuntime(client))throw new WorkforceLifecycleError('IAM_NOT_READY');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true),set_config('app.workforce_environment',$5,true)`,[String(context.principal.accountId),context.tenant.organizationId,context.principal.membershipId,context.principal.sessionId,this.environment]);
      // Do not pre-acquire a shared authority lock here. The rare safety command
      // takes the exclusive policy barrier and consumes approval atomically.
      const row=(await client.query<{result:unknown}>('SELECT internal_iam_apply_workforce_lifecycle($1::jsonb,$2,$3,$4,$5) AS result',[JSON.stringify(input.command),context.evidence.actionAuthorizationId,input.reason,context.principal.correlationId,context.principal.operationId])).rows[0];
      const result=storedResult.parse(row?.result);committing=true;await client.query('COMMIT');
      const receipt=result.receipt;
      return {replayed:result.replayed,receipt:{authorizationId:receipt.authorization_id,targetMembershipId:receipt.target_membership_id,operation:receipt.operation,version:receipt.result_version,status:receipt.result_status,effects:receipt.effects,commandHash:receipt.command_hash,createdAt:receipt.created_at}};
    }catch(error){
      try{await client.query('ROLLBACK');}catch{client.release(true);discarded=true;throw new WorkforceLifecycleError(committing?'OUTCOME_UNKNOWN':'STORE_UNAVAILABLE',error);}
      if(committing)throw new WorkforceLifecycleError('OUTCOME_UNKNOWN',error);
      if(error instanceof WorkforceLifecycleError)throw error;
      throw new WorkforceLifecycleError(error instanceof Error?(errors[error.message]??'STORE_UNAVAILABLE'):'STORE_UNAVAILABLE',error);
    }finally{if(!discarded)client.release();}
  }
}
