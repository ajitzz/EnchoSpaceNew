import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WorkforceLifecycle} from '../../lib/iam/workforceLifecycle.js';
import {PrivilegedActions} from '../../lib/iam/privilegedActions.js';
import {AssignmentService} from '../../lib/iam/assignmentService.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {permissionCheckInputSchema} from '../../lib/iam/authorizationPort.js';
import {parsePrincipalContext,type PrincipalContext} from '../../shared/iam/principalContext.js';
import {iamLifecycleRuntimeGrants,verifyIamLifecycleCatalog} from '../../server/deployment/iamLifecycleReadiness.js';
import {verifyIamCatalog} from '../../server/deployment/iamReadiness.js';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';

describe('CR1 workforce revocation and offboarding on real PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;let service:WorkforceLifecycle;let nextUser=200;
  beforeAll(async()=>{
    fixture=await createCr1IamFixture();service=new WorkforceLifecycle(fixture.runtime,'LOCAL');
    for(const statement of iamLifecycleRuntimeGrants('cr1_iam_runtime'))await fixture.pool.query(statement);
  });
  afterAll(async()=>{await fixture?.close();});
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  async function member(options:{role?:string;environments?:string[]}={}){
    const accountId=nextUser++;const membershipId=randomUUID();const sessionId=randomUUID();
    const principal=parsePrincipalContext({actorKind:'STAFF',accountId,organizationId:fixture.organizationId,membershipId,sessionId,assuranceLevel:'AAL2',authenticatedAt:new Date().toISOString(),correlationId:`staff-${accountId}`,operationId:`staff-operation-${accountId}`});
    await fixture.pool.query("INSERT INTO users VALUES($1,$2,'user')",[accountId,`staff-${accountId}@example.test`]);
    await fixture.pool.query(`INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,changed_by,change_reason) VALUES($1,$2,$3,'ACTIVE',clock_timestamp(),90,'Disposable local lifecycle test member.')`,[membershipId,fixture.organizationId,accountId]);
    await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours')`,[sessionId,fixture.organizationId,membershipId,digest(sessionId)]);
    for(const environment of options.environments??['LOCAL'])await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
      SELECT $1,$2,v.id,'ORGANIZATION',$1::uuid::text,$3,$4,90,'Explicit test member grant for this environment only.' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key=$5 AND v.version=1`,[fixture.organizationId,membershipId,environment,digest(membershipId+environment),options.role??'campaign_operator']);
    return principal;
  }
  const context=(principal:PrincipalContext,permission:'workforce.suspend'|'workforce.grant',environment:'LOCAL'|'PRODUCTION'='LOCAL')=>permissionCheckInputSchema.parse({principal,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission,resource:{target:{type:'WORKFORCE',id:fixture.organizationId}},conditions:{environment,requestedAt:new Date().toISOString()},evidence:{}});
  async function approved(target:string,options:{operation?:'SUSPEND'|'OFFBOARD'|'REVOKE_SESSIONS';version?:number;protected?:boolean;environment?:'LOCAL'|'PRODUCTION';principal?:PrincipalContext;reviewer?:PrincipalContext;reason?:string}={}){
    const environment=options.environment??'LOCAL';const current=new WorkforceLifecycle(fixture.runtime,environment);
    const actions=options.protected?current.protectedActions:current.standardActions;
    const principal=options.principal??(environment==='PRODUCTION'?await fixture.environmentSession(fixture.principals.maker,'PRODUCTION'):fixture.principals.maker);
    const raw={context:context(principal,options.protected?'workforce.grant':'workforce.suspend',environment),idempotencyKey:randomUUID(),reason:options.reason??'Revoke the exact staff access described by this reviewed command.',command:{targetMembershipId:target,expectedVersion:options.version??1,operation:options.operation??'SUSPEND',environment}};
    const hash=actions.fingerprint(raw);const proof=await fixture.issueFactor(principal,hash);
    const requested=await actions.request({...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof}}});
    if(options.protected){const checker=options.reviewer??(environment==='PRODUCTION'?await fixture.environmentSession(fixture.principals.checker,'PRODUCTION'):fixture.principals.checker);await actions.approve({principal:checker,organizationId:fixture.organizationId,authorizationId:requested.receipt.id,expectedCommandHash:hash,reason:'Independent review of this personnel safety command.',stepUpReceiptId:await fixture.issueFactor(checker,hash)});}
    return {service:current,input:{...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof,actionAuthorizationId:requested.receipt.id}}},hash,authorizationId:requested.receipt.id};
  }
  async function claimedWork(principal:PrincipalContext){
    const work=(await fixture.pool.query(`INSERT INTO internal_work_assignments(organization_id,queue_key,resource_type,resource_id,assignee_membership_id,environment,required_permission_code,assigned_by,reason) VALUES($1,'campaign_prepare','CAMPAIGN',$2,$3,'LOCAL','campaign.prepare',90,'Disposable canonical campaign work assignment.') RETURNING *`,[fixture.organizationId,randomUUID(),principal.membershipId])).rows[0];
    await new AssignmentService(fixture.runtime,'LOCAL').claim({principal,organizationId:fixture.organizationId,assignmentId:work.id,expectedVersion:1,expectedFence:'0',idempotencyKey:randomUUID(),reason:'Claim only this exact disposable campaign task.'});return work;
  }
  async function pendingWork(principal:PrincipalContext,resourceId:string){
    const action=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',permission:'campaign.prepare',commandKind:'campaign.fixture.v1',commandSchema:z.object({revision:z.literal(1)}).strict()});
    const input={context:permissionCheckInputSchema.parse({principal,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'campaign.prepare',resource:{target:{type:'CAMPAIGN',id:resourceId}},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}}),idempotencyKey:randomUUID(),reason:'Prepare one exact disposable campaign revision.',command:{revision:1}};
    return (await action.request(input)).receipt.id;
  }

  it('keeps FORCE RLS and raw mutation privileges denied',async()=>{
    const client=await fixture.runtime.connect();try{
      expect(await verifyIamCatalog(client)).toMatchObject({ready:true,policyValid:true});
      expect(await verifyIamLifecycleCatalog(client)).toMatchObject({ready:true});
      await expect(client.query("UPDATE internal_organization_memberships SET status='OFFBOARDED'")).rejects.toMatchObject({code:'42501'});
      await expect(client.query("UPDATE internal_staff_sessions SET status='REVOKED'")).rejects.toMatchObject({code:'42501'});
      await expect(client.query('INSERT INTO internal_workforce_lifecycle_commands DEFAULT VALUES')).rejects.toMatchObject({code:'42501'});
    }finally{client.release();}
  });
  it('rejects disabled immutable receipt enforcement during readiness',async()=>{
    await fixture.pool.query('ALTER TABLE internal_workforce_lifecycle_commands DISABLE TRIGGER internal_iam_immutable');
    const client=await fixture.runtime.connect();
    try{expect(await verifyIamLifecycleCatalog(client)).toMatchObject({ready:false,relationSafe:false});}
    finally{client.release();await fixture.pool.query('ALTER TABLE internal_workforce_lifecycle_commands ENABLE TRIGGER internal_iam_immutable');}
  });
  it('atomically suspends all access lanes, preserves account history and replays without duplicate effects',async()=>{
    const target=await member();const work=await claimedWork(target);const pending=await pendingWork(target,work.resource_id);
    const targetFactor=await fixture.issueFactor(target,'a'.repeat(64));const command=await approved(target.membershipId!);
    const result=await service.execute(command.input);
    expect(result).toMatchObject({replayed:false,receipt:{status:'SUSPENDED',version:2,effects:{grantsRevoked:1,sessionsRevoked:1,factorsExpired:1,assignmentsReleased:1,authorizationsCancelled:1}}});
    expect(await service.execute(command.input)).toEqual({...result,replayed:true});
    expect((await fixture.pool.query('SELECT state,version,fence::text FROM internal_work_assignments WHERE id=$1',[work.id])).rows[0]).toEqual({state:'RELEASED',version:3,fence:'2'});
    expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[pending])).rows[0].status).toBe('CANCELLED');
    expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[targetFactor])).rows[0].status).toBe('EXPIRED');
    expect((await fixture.pool.query('SELECT role FROM users WHERE id=$1',[target.accountId])).rows[0].role).toBe('user');
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE entity_id=$1 AND event_type='WORKFORCE_LIFECYCLE_APPLIED'",[target.membershipId])).rows[0].count).toBe(1);
    await expect(fixture.pool.query("UPDATE internal_workforce_lifecycle_commands SET reason='Attempt to rewrite irreversible evidence.' WHERE authorization_id=$1",[command.authorizationId])).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');
  });
  it('offboards suspended members terminally without restoring revoked grants',async()=>{
    const target=await member();await service.execute((await approved(target.membershipId!)).input);
    const offboard=await approved(target.membershipId!,{operation:'OFFBOARD',version:2});
    expect(await service.execute(offboard.input)).toMatchObject({receipt:{status:'OFFBOARDED',version:3,effects:{grantsRevoked:0}}});
    await expect(service.execute((await approved(target.membershipId!,{version:3})).input)).rejects.toMatchObject({code:'STATE_CONFLICT'});
    await expect(fixture.pool.query("UPDATE internal_organization_memberships SET status='ACTIVE',offboarded_at=NULL,version=version+1 WHERE id=$1",[target.membershipId])).rejects.toThrow('IAM_OFFBOARDING_TERMINAL');
  });
  it('revokes sessions without removing grants or inventing a new identity',async()=>{
    const target=await member();await claimedWork(target);
    const result=await service.execute((await approved(target.membershipId!,{operation:'REVOKE_SESSIONS'})).input);
    expect(result).toMatchObject({receipt:{status:'ACTIVE',version:2,effects:{grantsRevoked:0,sessionsRevoked:1,assignmentsReleased:1}}});
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_membership_grant_revocations x JOIN internal_membership_grants g ON g.id=x.grant_id WHERE g.membership_id=$1',[target.membershipId])).rows[0].count).toBe(0);
  });
  it('rejects absent/changed/previously consumed authority and stale membership versions',async()=>{
    const target=await member();const command=await approved(target.membershipId!);
    await expect(service.execute({...command.input,context:{...command.input.context,evidence:{}}})).rejects.toMatchObject({code:'AUTHORIZATION_INVALID'});
    await expect(service.execute({...command.input,command:{...command.input.command,operation:'OFFBOARD'}})).rejects.toMatchObject({code:'COMMAND_CONFLICT'});
    const stale=await approved(target.membershipId!,{version:2});
    await expect(service.execute(stale.input)).rejects.toMatchObject({code:'CAS_CONFLICT'});
    await new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL').runAuthorized({...command.input.context,conditions:{...command.input.context.conditions,commandHash:command.hash}},async()=>{});
    await expect(service.execute(command.input)).rejects.toMatchObject({code:'AUTHORIZATION_INVALID'});
  });
  it('rejects self-governance and permissionless or fabricated principals',async()=>{
    const self=await approved(fixture.principals.maker.membershipId!);
    await expect(service.execute(self.input)).rejects.toMatchObject({code:'SELF_ACTION_DENIED'});
    const target=await member();const command=await approved(target.membershipId!);
    await expect(service.execute({...command.input,context:{...command.input.context,principal:fixture.principals.outsider}})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await expect(service.execute({...command.input,context:{...command.input.context,principal:{...command.input.context.principal,accountId:91}}})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  });
  it('denies cross-environment global removal and unapproved production policy',async()=>{
    const actor=await member({role:'platform_owner'});const target=await member({environments:['PRODUCTION']});
    const scoped=await approved(target.membershipId!,{principal:actor});
    await expect(service.execute(scoped.input)).rejects.toMatchObject({code:'ENVIRONMENT_SCOPE_DENIED'});
    await expect(service.execute((await approved(target.membershipId!)).input)).rejects.toMatchObject({code:'ENVIRONMENT_SCOPE_DENIED'});
    await expect(approved(target.membershipId!,{environment:'PRODUCTION'})).rejects.toMatchObject({code:'IAM_NOT_READY'});
  });
  it('requires an independent owner checker even when standard suspension proof is valid',async()=>{
    const target=await member({role:'platform_owner'});
    await expect(service.execute((await approved(target.membershipId!)).input)).rejects.toMatchObject({code:'OWNER_CHECKER_REQUIRED'});
    const selfReviewed=await approved(target.membershipId!,{protected:true,reviewer:target});
    await expect(service.execute(selfReviewed.input)).rejects.toMatchObject({code:'OWNER_CHECKER_REQUIRED'});
    const checked=await approved(target.membershipId!,{protected:true,reason:'A separate checker reviewed this owner offboarding command.',operation:'OFFBOARD'});
    expect(await service.execute(checked.input)).toMatchObject({receipt:{status:'OFFBOARDED'}});
  });
  it('rolls back revocations, action consumption and factor consumption when final audit fails',async()=>{
    const target=await member();const command=await approved(target.membershipId!);
    await fixture.pool.query(`CREATE FUNCTION cr1_reject_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='WORKFORCE_LIFECYCLE_APPLIED' THEN RAISE EXCEPTION 'test lifecycle audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER cr1_reject_lifecycle_audit BEFORE INSERT ON internal_iam_events FOR EACH ROW EXECUTE FUNCTION cr1_reject_lifecycle_audit()`);
    try{await expect(service.execute(command.input)).rejects.toMatchObject({code:'STORE_UNAVAILABLE'});}
    finally{await fixture.pool.query('DROP TRIGGER cr1_reject_lifecycle_audit ON internal_iam_events;DROP FUNCTION cr1_reject_lifecycle_audit()');}
    expect((await fixture.pool.query('SELECT status,version FROM internal_organization_memberships WHERE id=$1',[target.membershipId])).rows[0]).toEqual({status:'ACTIVE',version:1});
    expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[command.authorizationId])).rows[0].status).toBe('APPROVED');
    expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[command.input.context.evidence.stepUpReceiptId])).rows[0].status).toBe('VERIFIED');
    expect(await service.execute(command.input)).toMatchObject({replayed:false});
  });
  it('waits for in-flight protected work then prevents every later execution by the revoked session',async()=>{
    const target=await member();const work=await claimedWork(target);const command=await approved(target.membershipId!);
    const check=permissionCheckInputSchema.parse({principal:target,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'campaign.prepare',resource:{target:{type:'CAMPAIGN',id:work.resource_id},assignmentId:work.id,assignmentVersion:2,assignmentFence:'1'},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString(),commandHash:'f'.repeat(64)},evidence:{}});
    const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');
    let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});let unblock!:()=>void;const blocked=new Promise<void>(resolve=>{unblock=resolve;});
    const running=authority.runAuthorized(check,async()=>{enter();await blocked;});await entered;
    let done=false;const revoke=service.execute(command.input).then(value=>{done=true;return value;});
    try{await new Promise(resolve=>setTimeout(resolve,40));expect(done).toBe(false);}finally{unblock();}
    await running;await revoke;
    expect(await authority.check(check)).toMatchObject({effect:'DENY',reason:'SESSION_REVOKED'});
  });
  it('enforces the approved minimum production owner quorum without inventing a threshold',async()=>{
    const target=await member({role:'platform_owner',environments:['LOCAL','PRODUCTION']});
    const original=(await fixture.pool.query('SELECT version_id FROM internal_iam_current_policy')).rows[0].version_id as string;
    async function policy(minimum:number){
      const created=(await fixture.pool.query(`INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason)
        SELECT (SELECT max(version)+1 FROM internal_iam_policy_versions),jsonb_set(jsonb_set(jsonb_set(config,'{version}',to_jsonb((SELECT max(version)+1 FROM internal_iam_policy_versions))),'{minimumOwnersForProduction}',to_jsonb($2::int)),'{operationalApproval}','"APPROVED"'::jsonb),repeat('0',64),'APPROVED','Disposable local policy fixture for owner quorum tests.' FROM internal_iam_policy_versions WHERE id=$1 RETURNING id`,[original,minimum])).rows[0].id as string;
      await fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1',[created]);
    }
    try{
      await policy(3);
      const denied=await approved(target.membershipId!,{protected:true,environment:'PRODUCTION',operation:'OFFBOARD'});
      await expect(denied.service.execute(denied.input)).rejects.toMatchObject({code:'OWNER_QUORUM_REQUIRED'});
      expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[denied.authorizationId])).rows[0].status).toBe('APPROVED');
      await policy(2);
      const allowed=await approved(target.membershipId!,{protected:true,environment:'PRODUCTION',operation:'OFFBOARD',reason:'Offboard owner under the newly reviewed disposable quorum policy.'});
      await expect(allowed.service.execute({...allowed.input,context:{...allowed.input.context,principal:fixture.principals.maker}})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
      expect(await allowed.service.execute(allowed.input)).toMatchObject({receipt:{status:'OFFBOARDED',effects:{grantsRevoked:2}}});
    }finally{await fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1',[original]);}
  });
  it('resolves lost commit acknowledgement through exact durable replay',async()=>{
    const target=await member();const command=await approved(target.membershipId!);let failCommit=true;
    const transport=new Proxy(fixture.runtime,{get(pool,property){
      if(property==='connect')return async()=>{
        const client=await pool.connect();return new Proxy(client,{get(connection,key){
          if(key==='query')return async(...args:unknown[])=>{
            const result=await Reflect.apply(connection.query,connection,args);
            if(args[0]==='COMMIT' && failCommit){failCommit=false;throw new Error('Lifecycle commit acknowledgement lost');}
            return result;
          };
          const value=Reflect.get(connection,key);return typeof value==='function'?value.bind(connection):value;
        }});
      };
      const value=Reflect.get(pool,property);return typeof value==='function'?value.bind(pool):value;
    }});
    await expect(new WorkforceLifecycle(transport,'LOCAL').execute(command.input)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
    const replay=await service.execute(command.input);
    expect(replay).toMatchObject({replayed:true,receipt:{status:'SUSPENDED',version:2}});
    expect(await service.execute(command.input)).toEqual(replay);
  });
});
