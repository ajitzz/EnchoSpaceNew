import {z} from 'zod';
import type pg from 'pg';
import {WorkforceLifecycle, workforceLifecycleCommandSchema} from '../../lib/iam/workforceLifecycle.js';
import {StaffSessionReader, WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {PrivilegedActionError,privilegedActionReceiptSchema} from '../../lib/iam/privilegedActions.js';
import {permissionCheckInputSchema} from '../../lib/iam/authorizationPort.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {verifyIamCatalog} from '../deployment/iamReadiness.js';
import {verifyIamLifecycleCatalog} from '../deployment/iamLifecycleReadiness.js';

const reason=z.string().trim().min(10).max(2000);
const envelope=z.object({authority:z.enum(['STANDARD','PROTECTED']),reason,
  idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),
  command:workforceLifecycleCommandSchema.omit({environment:true}),
}).strict();
export const workforceCommandRequestSchema=z.discriminatedUnion('action',[
  envelope.extend({action:z.literal('PREPARE')}),
  envelope.extend({action:z.literal('REQUEST'),stepUpReceiptId:z.uuid()}),
  envelope.extend({action:z.literal('EXECUTE'),authorizationId:z.uuid(),stepUpReceiptId:z.uuid()}),
  z.object({action:z.enum(['APPROVE','REJECT']),authority:z.enum(['STANDARD','PROTECTED']),authorizationId:z.uuid(),
    expectedCommandHash:z.string().regex(/^[a-f0-9]{64}$/),reason,stepUpReceiptId:z.uuid(),
    commandReason:reason,command:workforceLifecycleCommandSchema.omit({environment:true})}).strict(),
  z.object({action:z.literal('READ'),authority:z.enum(['STANDARD','PROTECTED']),authorizationId:z.uuid()}).strict(),
]);
export type WorkforceCommandRequest=z.infer<typeof workforceCommandRequestSchema>;
const publicAuthorizationReceipt=privilegedActionReceiptSchema.omit({stepUpReceiptId:true}).strip();
const lifecycleReceipt=z.object({authorizationId:z.uuid(),targetMembershipId:z.uuid(),
  operation:workforceLifecycleCommandSchema.shape.operation,version:z.number().int().positive(),
  status:z.enum(['ACTIVE','SUSPENDED','OFFBOARDED']),commandHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.iso.datetime({offset:true}),
  effects:z.object({grantsRevoked:z.number().int().nonnegative(),sessionsRevoked:z.number().int().nonnegative(),
    factorsExpired:z.number().int().nonnegative(),assignmentsReleased:z.number().int().nonnegative(),authorizationsCancelled:z.number().int().nonnegative()}).strict(),
}).strict();
export const workforceCommandResponseSchema=z.union([
  z.object({status:z.literal('STEP_UP_REQUIRED'),commandHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({receipt:publicAuthorizationReceipt,replayed:z.boolean()}).strict(),
  z.object({receipt:publicAuthorizationReceipt,authorityState:z.enum(['CURRENT','POLICY_CHANGED','EXPIRED','TERMINAL'])}).strict(),
  z.object({receipt:lifecycleReceipt,replayed:z.boolean()}).strict(),
]);
export type WorkforceCommandResponse=z.infer<typeof workforceCommandResponseSchema>;
export interface WorkforceCommandPort {dispatch(authorization:string,request:WorkforceCommandRequest):Promise<WorkforceCommandResponse>}

/** Adapter only: canonical services own transactions, policy/factor checks,
 * maker/checker separation, durable idempotency and lost-COMMIT reconciliation. */
export class CanonicalWorkforceCommands implements WorkforceCommandPort {
  private readonly reader:StaffSessionReader;
  private readonly lifecycle:WorkforceLifecycle;
  private readonly organizationId:string;
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  constructor(pool:pg.Pool,options:{organizationId:string;environment:z.infer<typeof workforceEnvironmentSchema>}){
    this.organizationId=z.uuid().parse(options.organizationId);
    this.environment=workforceEnvironmentSchema.parse(options.environment);
    this.reader=new StaffSessionReader(pool,this.environment);
    this.lifecycle=new WorkforceLifecycle(pool,this.environment);
  }
  async dispatch(authorization:string,raw:WorkforceCommandRequest):Promise<WorkforceCommandResponse>{
    const input=workforceCommandRequestSchema.parse(raw);
    const permission=input.authority==='PROTECTED'?'workforce.grant':'workforce.suspend';
    const principal=await this.reader.read(authorization,async(client,actor)=>{
      if(actor.organizationId!==this.organizationId)throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      if(!(await verifyIamCatalog(client)).ready||!(await verifyIamLifecycleCatalog(client)).ready)throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      const allowed=(await client.query<{allowed:boolean}>(
        "SELECT internal_iam_has_permission($1::uuid,$2::text,'WORKFORCE',$1::text,NULL::text,$3::text,NULL::bigint) AS allowed",
        [this.organizationId,permission,this.environment])).rows[0]?.allowed;
      if(!allowed)throw new PrivilegedActionError('PERMISSION_DENIED');
      return actor;
    });
    const actions=input.authority==='PROTECTED'?this.lifecycle.protectedActions:this.lifecycle.standardActions;
    const actor={principal,organizationId:this.organizationId};
    const contextFor=(evidence:Record<string,string>={})=>permissionCheckInputSchema.parse({principal,
      tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:this.organizationId},permission,
      resource:{target:{type:'WORKFORCE',id:this.organizationId}},
      conditions:{environment:this.environment,requestedAt:new Date().toISOString()},evidence});
    if(input.action==='READ'){
      const value=await actions.read({...actor,authorizationId:input.authorizationId});
      if(value.receipt.permission!==permission||value.receipt.resource.type!=='WORKFORCE'||value.receipt.resource.id!==this.organizationId)throw new PrivilegedActionError('PERMISSION_DENIED');
      return workforceCommandResponseSchema.parse(value);
    }
    if(input.action==='APPROVE'||input.action==='REJECT'){
      // Reviewer supplies the original command and its maker reason. A generic
      // hash approval must not turn this lifecycle endpoint into an invitation,
      // finance or provider authorization endpoint.
      const hash=actions.fingerprint({context:contextFor(),idempotencyKey:`review:${input.authorizationId}`,
        reason:input.commandReason,command:{...input.command,environment:this.environment}});
      if(hash!==input.expectedCommandHash)throw new PrivilegedActionError('COMMAND_CONFLICT');
      const review={...actor,authorizationId:input.authorizationId,expectedCommandHash:input.expectedCommandHash,
        reason:input.reason,stepUpReceiptId:input.stepUpReceiptId};
      return workforceCommandResponseSchema.parse(await (input.action==='APPROVE'?actions.approve(review):actions.reject(review)));
    }
    if(!('idempotencyKey' in input))throw new PrivilegedActionError('INPUT_INVALID');
    const context=contextFor({...('stepUpReceiptId' in input?{stepUpReceiptId:input.stepUpReceiptId}:{}),
      ...(input.action==='EXECUTE'?{actionAuthorizationId:input.authorizationId}:{})});
    const command={...input.command,environment:this.environment};
    const invocation={context,idempotencyKey:input.idempotencyKey,reason:input.reason,command};
    if(input.action==='PREPARE')return {commandHash:actions.fingerprint(invocation),status:'STEP_UP_REQUIRED'};
    if(input.action==='REQUEST')return workforceCommandResponseSchema.parse(await actions.request(invocation));
    // The session read above is only a projection. Execution reauthorizes on a
    // new held transaction and consumes exact reviewed authority atomically.
    return workforceCommandResponseSchema.parse(await this.lifecycle.execute(invocation));
  }
}
