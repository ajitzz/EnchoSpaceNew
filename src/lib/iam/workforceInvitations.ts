import {createHash, randomBytes} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {permissionCheckInputSchema, type PermissionCheckInput} from './authorizationPort.js';
import {PostgresWorkforceAuthorization} from './postgresAuthorization.js';
import {PrivilegedActions} from './privilegedActions.js';
import {isRestrictedWorkforceRuntime} from './runtimeBoundary.js';
import {ownerIdentityEvidenceSchema, type OwnerIdentityEvidencePort} from './ownerBootstrap.js';
import {principalContextSchema} from '../../shared/iam/principalContext.js';
import {workforceEnvironmentSchema, workforcePermissionCodeSchema, workforceResourceRefSchema} from '../../shared/iam/contracts.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const reason=z.string().trim().min(10).max(2000);
const timestamp=z.iso.datetime({offset:true});
const tokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(value=>Buffer.from(value,'base64url').length===32 && Buffer.from(value,'base64url').toString('base64url')===value);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');

export const invitationGrantSchema=z.object({
  roleVersionId:z.uuid(),roleHash:hash,permissionCodes:z.array(workforcePermissionCodeSchema).min(1).max(60),
  scope:workforceResourceRefSchema,environment:workforceEnvironmentSchema,
  provider:z.enum(['META','GOOGLE']).nullable(),
  maxAmountMinor:z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(value=>BigInt(value)<=9223372036854775807n).nullable(),
  validUntil:timestamp.nullable(),
}).strict().superRefine((value,ctx)=>{
  if (JSON.stringify(value.permissionCodes)!==JSON.stringify([...new Set(value.permissionCodes)].sort())) ctx.addIssue({code:'custom',message:'Permission snapshot must be unique and sorted.'});
});
export const issueInvitationCommandSchema=z.object({
  invitationId:z.uuid(),email:z.string().trim().toLowerCase().email().max(254),
  environment:workforceEnvironmentSchema,expiresAt:timestamp,grants:z.array(invitationGrantSchema).min(1).max(20),
}).strict().superRefine((value,ctx)=>{
  if (value.grants.some(grant=>grant.environment!==value.environment)) ctx.addIssue({code:'custom',message:'Grant environment mismatch.'});
  const keys=value.grants.map(grant=>JSON.stringify([grant.roleVersionId,grant.scope,grant.provider,grant.environment]));
  if (new Set(keys).size!==keys.length) ctx.addIssue({code:'custom',message:'Duplicate invitation grants.'});
});
export const revokeInvitationCommandSchema=z.object({invitationId:z.uuid(),expectedGrantBundleHash:hash,environment:workforceEnvironmentSchema}).strict();
const invocation=<T>(command:z.ZodType<T>)=>z.object({context:permissionCheckInputSchema,idempotencyKey:z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),reason,command}).strict();
const issueSchema=invocation(issueInvitationCommandSchema);
const revokeSchema=invocation(revokeInvitationCommandSchema);
const acceptSchema=z.object({principal:principalContextSchema,invitationToken:tokenSchema,expectedGrantBundleHash:hash,identityReceiptHash:hash}).strict();

export const invitationReceiptSchema=z.object({
  invitationId:z.uuid(),organizationId:z.uuid(),environment:workforceEnvironmentSchema,
  state:z.enum(['PENDING','ACCEPTED','REVOKED','EXPIRED']),grantBundleHash:hash,commandHash:hash,
  grants:z.array(invitationGrantSchema),expiresAt:timestamp,
}).strict();
export type InvitationReceipt=z.infer<typeof invitationReceiptSchema>;
const acceptanceSchema=z.discriminatedUnion('outcome',[
  z.object({outcome:z.enum(['ACCEPTED','ALREADY_ACCEPTED']),invitationId:z.uuid(),organizationId:z.uuid(),membershipId:z.uuid()}).strict(),
  z.object({outcome:z.literal('EXPIRED'),invitationId:z.uuid(),organizationId:z.uuid()}).strict(),
]);

const errorCodes=['INPUT_INVALID','PERMISSION_DENIED','INVITATION_UNAVAILABLE','IDENTITY_UNVERIFIED','IDENTITY_WRITER_UNAVAILABLE','COMMAND_CONFLICT','INVITATION_EXPIRED','OUTCOME_UNKNOWN','STORE_UNAVAILABLE'] as const;
export class WorkforceInvitationError extends Error {
  constructor(readonly code:typeof errorCodes[number]) {super(code);this.name='WorkforceInvitationError';}
}
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);if (!result.success) throw new WorkforceInvitationError('INPUT_INVALID');return result.data;
}
function receipt(row:Record<string,unknown>):InvitationReceipt {
  return parse(invitationReceiptSchema,{invitationId:row.id,organizationId:row.organization_id,environment:row.environment,
    state:row.status,grantBundleHash:row.grant_bundle_hash,commandHash:row.command_hash,grants:row.grant_bundle,
    expiresAt:row.expires_at instanceof Date?row.expires_at.toISOString():row.expires_at});
}
const projection='id,organization_id,environment,status,grant_bundle_hash,command_hash,grant_bundle,expires_at';

/**
 * Staffing authority remains separate from account authentication. The identity
 * writer pool is EXECUTE-only for the bounded acceptance function; never pass
 * the migration pool or shared workforce pool as that credential.
 */
export class WorkforceInvitations {
  readonly issueActions:PrivilegedActions<z.infer<typeof issueInvitationCommandSchema>>;
  readonly revokeActions:PrivilegedActions<z.infer<typeof revokeInvitationCommandSchema>>;
  private readonly authorization:PostgresWorkforceAuthorization;
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  constructor(private readonly runtime:pg.Pool,private readonly options:{
    environment:z.infer<typeof workforceEnvironmentSchema>;identityWriter:pg.Pool;identityEvidence:OwnerIdentityEvidencePort;
  }) {
    this.environment=parse(workforceEnvironmentSchema,options.environment);
    this.authorization=new PostgresWorkforceAuthorization(runtime,this.environment);
    this.issueActions=new PrivilegedActions(runtime,{environment:this.environment,permission:'workforce.grant',commandKind:'workforce.invitation.issue.v1',commandSchema:issueInvitationCommandSchema});
    this.revokeActions=new PrivilegedActions(runtime,{environment:this.environment,permission:'workforce.invite',commandKind:'workforce.invitation.revoke.v1',commandSchema:revokeInvitationCommandSchema});
  }

  async issue(rawInput:unknown):Promise<{receipt:InvitationReceipt;replayed:boolean;invitationToken:string|null}> {
    const input=parse(issueSchema,rawInput);
    this.validateContext(input.context,'workforce.grant',input.command.environment);
    const commandHash=this.issueActions.fingerprint(input);
    const replay=await this.readForReplay(input.context,input.command.invitationId);
    if (replay) {
      if (replay.commandHash!==commandHash) throw new WorkforceInvitationError('COMMAND_CONFLICT');
      return {receipt:replay,replayed:true,invitationToken:null};
    }
    const token=randomBytes(32).toString('base64url');
    try {
      const created=await this.authorization.runAuthorized({...input.context,conditions:{...input.context.conditions,commandHash}},async client=>{
        if (!input.context.evidence.actionAuthorizationId) throw new WorkforceInvitationError('PERMISSION_DENIED');
        await client.query('SELECT internal_iam_issue_invitation($1::jsonb,$2,$3,$4)',[JSON.stringify(input.command),input.context.evidence.actionAuthorizationId,digest(token),input.reason]);
        const row=(await client.query(`SELECT ${projection} FROM internal_organization_invitations WHERE id=$1`,[input.command.invitationId])).rows[0];
        if (!row) throw new WorkforceInvitationError('INVITATION_UNAVAILABLE');
        return receipt(row);
      });
      return {receipt:created,replayed:false,invitationToken:token};
    } catch (error) {
      // A lost commit acknowledgement can leave an issued invitation. Replay
      // proves that state but cannot recover the stored token digest's secret.
      const existing=await this.readForReplay(input.context,input.command.invitationId);
      if (existing?.commandHash===commandHash) return {receipt:existing,replayed:true,invitationToken:null};
      if (error instanceof WorkforceInvitationError) throw error;
      throw new WorkforceInvitationError('STORE_UNAVAILABLE');
    }
  }

  async revoke(rawInput:unknown):Promise<{receipt:InvitationReceipt;replayed:boolean}> {
    const input=parse(revokeSchema,rawInput);
    this.validateContext(input.context,'workforce.invite',input.command.environment);
    const commandHash=this.revokeActions.fingerprint(input);
    const existing=await this.readForReplay(input.context,input.command.invitationId);
    if (!existing || existing.grantBundleHash!==input.command.expectedGrantBundleHash) throw new WorkforceInvitationError('INVITATION_UNAVAILABLE');
    if (existing.state==='REVOKED') return {receipt:existing,replayed:true};
    try {
      const result=await this.authorization.runAuthorized({...input.context,conditions:{...input.context.conditions,commandHash}},async client=>{
        if (!input.context.evidence.actionAuthorizationId) throw new WorkforceInvitationError('PERMISSION_DENIED');
        await client.query('SELECT internal_iam_revoke_invitation($1::jsonb,$2,$3)',[JSON.stringify(input.command),input.context.evidence.actionAuthorizationId,input.reason]);
        const row=(await client.query(`SELECT ${projection} FROM internal_organization_invitations WHERE id=$1`,[input.command.invitationId])).rows[0];
        return receipt(row);
      });
      return {receipt:result,replayed:false};
    } catch (error) {
      if (error instanceof WorkforceInvitationError) throw error;
      throw new WorkforceInvitationError('STORE_UNAVAILABLE');
    }
  }

  async accept(rawInput:unknown):Promise<Extract<z.infer<typeof acceptanceSchema>,{membershipId:string}>> {
    const input=parse(acceptSchema,rawInput);
    if (input.principal.actorKind!=='ACCOUNT') throw new WorkforceInvitationError('IDENTITY_UNVERIFIED');
    let rawEvidence:unknown;
    try {rawEvidence=await this.options.identityEvidence.verify({userId:input.principal.accountId,receiptHash:input.identityReceiptHash});}
    catch {throw new WorkforceInvitationError('IDENTITY_UNVERIFIED');}
    const proof=ownerIdentityEvidenceSchema.safeParse(rawEvidence);
    if (!proof.success || proof.data.userId!==input.principal.accountId || proof.data.receiptHash!==input.identityReceiptHash
      || (this.environment!=='LOCAL' && proof.data.source!=='TRUSTED_IDENTITY_SERVICE')) throw new WorkforceInvitationError('IDENTITY_UNVERIFIED');
    let client:pg.PoolClient;
    try {client=await this.options.identityWriter.connect();} catch {throw new WorkforceInvitationError('IDENTITY_WRITER_UNAVAILABLE');}
    let committing=false;let destroy=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      const safe=(await client.query<{safe:boolean}>(`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE'))
        AND session_user=current_user
        AND NOT EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))
        AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
        AND has_function_privilege(current_user,'internal_iam_accept_invitation(text,text,jsonb,text,text)','EXECUTE')
        AND NOT has_function_privilege(current_user,'internal_iam_issue_invitation(jsonb,uuid,text,text)','EXECUTE') AS safe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0]?.safe;
      if (!safe) throw new WorkforceInvitationError('IDENTITY_WRITER_UNAVAILABLE');
      const value=(await client.query<{result:unknown}>('SELECT internal_iam_accept_invitation($1,$2,$3::jsonb,$4,$5) AS result',[
        digest(input.invitationToken),input.expectedGrantBundleHash,JSON.stringify(proof.data),this.environment,input.principal.correlationId,
      ])).rows[0]?.result;
      const result=parse(acceptanceSchema,value);
      committing=true;await client.query('COMMIT');committing=false;
      if (result.outcome==='EXPIRED') throw new WorkforceInvitationError('INVITATION_EXPIRED');
      return result;
    } catch (error) {
      try {await client.query('ROLLBACK');} catch {destroy=true;}
      if (committing) throw new WorkforceInvitationError('OUTCOME_UNKNOWN');
      if (error instanceof WorkforceInvitationError) throw error;
      throw new WorkforceInvitationError('INVITATION_UNAVAILABLE');
    } finally {client.release(destroy);}
  }

  private validateContext(context:PermissionCheckInput,permission:'workforce.grant'|'workforce.invite',environment:string):void {
    if (context.permission!==permission || context.conditions.environment!==this.environment || environment!==this.environment
      || context.resource.target.type!=='WORKFORCE' || context.resource.target.id!==context.tenant.organizationId
      || context.resource.ancestors.length || context.resource.assignmentId || context.resource.revision
      || context.resource.ownerAccountId || context.conditions.provider || context.conditions.amountMinor) throw new WorkforceInvitationError('INPUT_INVALID');
  }
  private async readForReplay(context:PermissionCheckInput,id:string):Promise<InvitationReceipt|null> {
    let client:pg.PoolClient;
    try {client=await this.runtime.connect();} catch {throw new WorkforceInvitationError('STORE_UNAVAILABLE');}
    let destroy=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      if (!await isRestrictedWorkforceRuntime(client) || context.principal.actorKind!=='STAFF') throw new WorkforceInvitationError('PERMISSION_DENIED');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true)`,[
        String(context.principal.accountId),context.tenant.organizationId,context.principal.membershipId,context.principal.sessionId]);
      const allowed=(await client.query<{allowed:boolean}>(`SELECT internal_iam_lock_authority() AND internal_iam_has_permission($1,$2,'WORKFORCE',$1::uuid::text,NULL,$3,NULL)
        AND internal_iam_has_permission($1,'workforce.invite','WORKFORCE',$1::uuid::text,NULL,$3,NULL) AS allowed`,[context.tenant.organizationId,context.permission,this.environment])).rows[0]?.allowed;
      if (!allowed) throw new WorkforceInvitationError('PERMISSION_DENIED');
      const row=(await client.query(`SELECT ${projection} FROM internal_organization_invitations WHERE id=$1 AND organization_id=$2 AND environment=$3`,[id,context.tenant.organizationId,this.environment])).rows[0];
      await client.query('COMMIT');return row?receipt(row):null;
    } catch(error) {
      try {await client.query('ROLLBACK');} catch {destroy=true;}
      throw error instanceof WorkforceInvitationError?error:new WorkforceInvitationError('STORE_UNAVAILABLE');
    }
    finally {client.release(destroy);}
  }
}
