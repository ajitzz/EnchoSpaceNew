import type pg from 'pg';
import {z} from 'zod';
import {principalContextSchema} from '../../shared/iam/principalContext.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {isRestrictedWorkforceRuntime} from './runtimeBoundary.js';

const fenceSchema=z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(value=>BigInt(value)<9223372036854775807n);
export const assignmentCommandSchema=z.object({
  principal:principalContextSchema, organizationId:z.string().uuid(), assignmentId:z.string().uuid(),
  expectedVersion:z.number().int().positive().max(2147483646),expectedFence:fenceSchema,
  idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),reason:z.string().trim().min(10).max(2000),
}).strict();

const storedReceiptSchema=z.object({
  id:z.string().uuid(),organization_id:z.string().uuid(),assignment_id:z.string().uuid(),actor_membership_id:z.string().uuid(),
  idempotency_key_hash:z.string().regex(/^[a-f0-9]{64}$/),command_hash:z.string().regex(/^[a-f0-9]{64}$/),
  operation:z.enum(['CLAIM','RELEASE']),policy_snapshot_hash:z.string().regex(/^[a-f0-9]{64}$/),
  expected_version:z.number().int().positive(),expected_fence:z.string().regex(/^\d+$/),
  result_version:z.number().int().positive(),result_fence:z.string().regex(/^\d+$/),
  result_state:z.enum(['CLAIMED','RELEASED']),lease_until:z.string().datetime({offset:true}).nullable(),
  reason:z.string(),created_at:z.string().datetime({offset:true}),
}).strict();
const resultSchema=z.object({receipt:storedReceiptSchema,replayed:z.boolean()}).strict();
export type AssignmentCommandResult=Readonly<{
  replayed:boolean;
  receipt:Readonly<{id:string;assignmentId:string;operation:'CLAIM'|'RELEASE';version:number;fence:string;
    state:'CLAIMED'|'RELEASED';leaseUntil:string|null;createdAt:string;commandHash:string;policySnapshotHash:string}>;
}>;
type AssignmentErrorCode='INPUT_INVALID'|'PRINCIPAL_NOT_ELIGIBLE'|'PERMISSION_DENIED'|'ASSIGNMENT_NOT_FOUND'
  |'ENVIRONMENT_MISMATCH'|'ASSIGNMENT_UNBOUND'|'CAS_CONFLICT'|'STATE_CONFLICT'|'IDEMPOTENCY_CONFLICT'
  |'IAM_NOT_READY'|'OUTCOME_UNKNOWN'|'STORE_UNAVAILABLE';
export class AssignmentCommandError extends Error {
  readonly status:number;
  constructor(readonly code:AssignmentErrorCode,cause?:unknown) {
    super(code,{cause});this.name='AssignmentCommandError';
    this.status=code==='INPUT_INVALID'?400:code==='ASSIGNMENT_NOT_FOUND'?404:
      ['PRINCIPAL_NOT_ELIGIBLE','PERMISSION_DENIED','ENVIRONMENT_MISMATCH'].includes(code)?403:
      ['IAM_NOT_READY','OUTCOME_UNKNOWN','STORE_UNAVAILABLE'].includes(code)?503:409;
  }
}
const sqlErrors:Readonly<Record<string,AssignmentErrorCode>>={
  IAM_ASSIGNMENT_INPUT_INVALID:'INPUT_INVALID',IAM_ASSIGNMENT_PERMISSION_DENIED:'PERMISSION_DENIED',
  IAM_ASSIGNMENT_NOT_READY:'IAM_NOT_READY',IAM_ASSIGNMENT_NOT_FOUND:'ASSIGNMENT_NOT_FOUND',
  IAM_ASSIGNMENT_ENVIRONMENT_MISMATCH:'ENVIRONMENT_MISMATCH',IAM_ASSIGNMENT_UNBOUND:'ASSIGNMENT_UNBOUND',
  IAM_ASSIGNMENT_IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',IAM_ASSIGNMENT_CAS_CONFLICT:'CAS_CONFLICT',
  IAM_ASSIGNMENT_STATE_CONFLICT:'STATE_CONFLICT',IAM_ASSIGNMENT_TERMINAL:'STATE_CONFLICT',
};

/** Queue ownership only. A receipt is never a domain or provider execution grant. */
export class AssignmentService {
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  constructor(private readonly pool:pg.Pool,environment:z.infer<typeof workforceEnvironmentSchema>) {
    this.environment=workforceEnvironmentSchema.parse(environment);
  }
  claim(input:unknown):Promise<AssignmentCommandResult> {return this.execute(input,'CLAIM');}
  release(input:unknown):Promise<AssignmentCommandResult> {return this.execute(input,'RELEASE');}

  private async execute(raw:unknown,operation:'CLAIM'|'RELEASE'):Promise<AssignmentCommandResult> {
    const parsed=assignmentCommandSchema.safeParse(raw);
    if (!parsed.success) throw new AssignmentCommandError('INPUT_INVALID');
    const input=parsed.data;
    if (input.principal.actorKind!=='STAFF' || input.principal.organizationId!==input.organizationId) throw new AssignmentCommandError('PRINCIPAL_NOT_ELIGIBLE');
    const client=await this.pool.connect().catch((cause:unknown)=>{throw new AssignmentCommandError('STORE_UNAVAILABLE',cause);});
    let committing=false;
    let discarded=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      if (!await isRestrictedWorkforceRuntime(client)) throw new AssignmentCommandError('IAM_NOT_READY');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true),set_config('app.workforce_environment',$5,true)`,[String(input.principal.accountId),input.organizationId,input.principal.membershipId,input.principal.sessionId,this.environment]);
      // The SQL command acquires exclusive member authority before assignment
      // locks. Calling the shared preflight fence here would risk lock upgrades.
      const row=(await client.query<{result:unknown}>('SELECT internal_iam_command_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',[
        input.assignmentId,operation,input.expectedVersion,input.expectedFence,this.environment,input.idempotencyKey,input.reason,
        input.principal.correlationId,input.principal.operationId,
      ])).rows[0];
      const result=resultSchema.parse(row?.result);
      committing=true;await client.query('COMMIT');
      const saved=result.receipt;
      return {replayed:result.replayed,receipt:{id:saved.id,assignmentId:saved.assignment_id,operation:saved.operation,
        version:saved.result_version,fence:saved.result_fence,state:saved.result_state,leaseUntil:saved.lease_until,
        createdAt:saved.created_at,commandHash:saved.command_hash,policySnapshotHash:saved.policy_snapshot_hash}};
    } catch(error) {
      try {await client.query('ROLLBACK');} catch {client.release(true);discarded=true;throw new AssignmentCommandError(committing?'OUTCOME_UNKNOWN':'STORE_UNAVAILABLE',error);}
      if (committing) throw new AssignmentCommandError('OUTCOME_UNKNOWN',error);
      if (error instanceof AssignmentCommandError) throw error;
      throw new AssignmentCommandError(error instanceof Error?(sqlErrors[error.message]??'STORE_UNAVAILABLE'):'STORE_UNAVAILABLE',error);
    } finally {if(!discarded) client.release();}
  }
}
