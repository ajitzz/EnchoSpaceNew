import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PrivilegedActions} from '../../lib/iam/privilegedActions.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {permissionCheckInputSchema} from '../../lib/iam/authorizationPort.js';
import type {PrincipalContext} from '../../shared/iam/principalContext.js';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';

const commandSchema=z.object({targetMembershipId:z.string().uuid(),role:z.literal('support_analyst'),revision:z.number().int().positive()}).strict();

describe('CR1 exact-command privileged action service on real PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;
  let actions:PrivilegedActions<z.infer<typeof commandSchema>>;
  beforeAll(async()=>{
    fixture=await createCr1IamFixture();
    actions=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',commandKind:'workforce.grant.v1',permission:'workforce.grant',commandSchema});
  });
  afterAll(async()=>{await fixture?.close();});

  const request=(revision:number,idempotencyKey=`request-test-${revision}`,principal:PrincipalContext=fixture.principals.maker)=>({
    context:permissionCheckInputSchema.parse({principal,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'workforce.grant',resource:{target:{type:'WORKFORCE',id:fixture.organizationId}},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}}),
    idempotencyKey,reason:'Grant only the exact reviewed support scope.',
    command:{targetMembershipId:fixture.principals.outsider.membershipId!,role:'support_analyst' as const,revision},
  });
  async function pending(revision:number) {
    const raw=request(revision);
    const hash=actions.fingerprint(raw);
    const proof=await fixture.issueFactor(fixture.principals.maker,hash);
    const input={...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof}}};
    return {input,result:await actions.request(input),hash,proof};
  }
  async function reviewInput(id:string,hash:string,principal=fixture.principals.checker) {
    return {principal,organizationId:fixture.organizationId,authorizationId:id,expectedCommandHash:hash,reason:'Independent exact command review completed.',stepUpReceiptId:await fixture.issueFactor(principal,hash)};
  }
  const readInput=(id:string,principal=fixture.principals.maker)=>({principal,organizationId:fixture.organizationId,authorizationId:id});

  it('creates exact pending authority with stable hashing, atomic audit and idempotent replay',async()=>{
    const {input,result,hash}=await pending(1);
    expect(result).toMatchObject({replayed:false,receipt:{status:'PENDING',commandHash:hash,requiredApprovals:1}});
    const reversed={...input,command:{revision:1,role:'support_analyst' as const,targetMembershipId:input.command.targetMembershipId}};
    expect(actions.fingerprint(reversed)).toBe(hash);
    expect(await actions.request(reversed)).toEqual({...result,replayed:true});
    const count=(await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE entity_id=$1 AND event_type='PRIVILEGED_ACTION_REQUESTED'",[result.receipt.id])).rows[0].count;
    expect(count).toBe(1);
    expect(await actions.read(readInput(result.receipt.id))).toMatchObject({authorityState:'CURRENT',receipt:{status:'PENDING'}});
    await expect(actions.request({...input,command:{...input.command,unexpected:true}})).rejects.toMatchObject({code:'INPUT_INVALID'});
    await expect(actions.request({...input,command:{...input.command,revision:2}})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    await expect(actions.request({...input,idempotencyKey:'different-request-key'})).rejects.toMatchObject({code:'COMMAND_CONFLICT'});
  });

  it('requires real action/session-bound factors and never manufactures assurance',async()=>{
    const raw=request(3);
    await expect(actions.request(raw)).rejects.toMatchObject({code:'STEP_UP_REQUIRED'});
    const wrong=await fixture.issueFactor(fixture.principals.maker,'0'.repeat(64));
    await expect(actions.request({...raw,context:{...raw.context,evidence:{stepUpReceiptId:wrong}}})).rejects.toMatchObject({code:'STEP_UP_INVALID'});
    const otherActor=await fixture.issueFactor(fixture.principals.checker,actions.fingerprint(raw));
    await expect(actions.request({...raw,context:{...raw.context,evidence:{stepUpReceiptId:otherActor}}})).rejects.toMatchObject({code:'STEP_UP_INVALID'});
    const consumed=await fixture.issueFactor(fixture.principals.maker,actions.fingerprint(raw));
    await fixture.pool.query("UPDATE internal_step_up_challenges SET status='CONSUMED',consumed_at=clock_timestamp() WHERE id=$1",[consumed]);
    await expect(actions.request({...raw,context:{...raw.context,evidence:{stepUpReceiptId:consumed}}})).rejects.toMatchObject({code:'STEP_UP_INVALID'});
  });

  it('pins each service to its server-selected permission and bounds canonical hashing work',async()=>{
    const {result,hash}=await pending(15);
    const otherDesk=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',commandKind:'workforce.read.v1',permission:'workforce.member.read',commandSchema});
    expect(()=>otherDesk.fingerprint(request(16))).toThrow('INPUT_INVALID');
    await expect(otherDesk.read(readInput(result.receipt.id))).rejects.toMatchObject({code:'ACTION_NOT_FOUND'});
    await expect(otherDesk.approve(await reviewInput(result.receipt.id,hash))).rejects.toMatchObject({code:'ACTION_NOT_FOUND'});
    const bounded=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',commandKind:'workforce.grant.v1',permission:'workforce.grant',commandSchema:z.object({items:z.array(z.string())}).strict()});
    expect(()=>bounded.fingerprint({...request(17),command:{items:Array.from({length:1001},()=> 'item')}})).toThrow('INPUT_INVALID');
    expect(()=>bounded.fingerprint({...request(18),command:{items:['x'.repeat(65537)]}})).toThrow('INPUT_INVALID');
  });

  it('rejects self-review and changed command hashes before recording a decision',async()=>{
    const {result,hash}=await pending(4);
    await expect(actions.approve(await reviewInput(result.receipt.id,hash,fixture.principals.maker))).rejects.toMatchObject({code:'MAKER_CHECKER_CONFLICT'});
    await expect(actions.approve(await reviewInput(result.receipt.id,'0'.repeat(64)))).rejects.toMatchObject({code:'COMMAND_CONFLICT'});
    await expect(actions.approve({...await reviewInput(result.receipt.id,hash),stepUpReceiptId:undefined})).rejects.toMatchObject({code:'STEP_UP_REQUIRED'});
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_action_approvals WHERE authorization_id=$1',[result.receipt.id])).rows[0].count).toBe(0);
  });

  it('serializes concurrent exact reviews, emits one audit and integrates with one-use domain execution',async()=>{
    const {input,result,hash,proof}=await pending(5);
    const review=await reviewInput(result.receipt.id,hash);
    const outcomes=await Promise.all([actions.approve(review),actions.approve(review)]);
    expect(outcomes.map(item=>item.replayed).sort()).toEqual([false,true]);
    expect(outcomes.every(item=>item.receipt.status==='APPROVED')).toBe(true);
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE entity_id=$1 AND event_type='PRIVILEGED_ACTION_APPROVED'",[result.receipt.id])).rows[0].count).toBe(1);
    const execution={...input.context,conditions:{...input.context.conditions,commandHash:hash},evidence:{actionAuthorizationId:result.receipt.id,stepUpReceiptId:proof}};
    const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');
    let writes=0;
    await authority.runAuthorized(execution,async()=>{writes++;});
    expect(writes).toBe(1);
    await expect(authority.runAuthorized(execution,async()=>{writes++;})).rejects.toMatchObject({code:'POLICY_CHANGED'});
    expect(writes).toBe(1);
    expect(await actions.read(readInput(result.receipt.id))).toMatchObject({authorityState:'TERMINAL',receipt:{status:'CONSUMED'}});
    expect(await actions.approve(review)).toMatchObject({replayed:true,receipt:{status:'CONSUMED'}});
  });

  it('persists rejection without permitting reversal or a second contradictory checker decision',async()=>{
    const {result,hash}=await pending(6);
    const review=await reviewInput(result.receipt.id,hash);
    expect(await actions.reject(review)).toMatchObject({receipt:{status:'REJECTED'},replayed:false});
    expect(await actions.reject(review)).toMatchObject({receipt:{status:'REJECTED'},replayed:true});
    await expect(actions.approve(review)).rejects.toMatchObject({code:'DECISION_CONFLICT'});
  });

  it('denies unknown/inaccessible receipts, missing scope, pending production policy and caller-selected environments',async()=>{
    await expect(actions.read(readInput(randomUUID()))).rejects.toMatchObject({code:'ACTION_NOT_FOUND'});
    const {result}=await pending(7);
    await expect(actions.read(readInput(result.receipt.id,fixture.principals.outsider))).rejects.toMatchObject({code:'ACTION_NOT_FOUND'});
    await expect(actions.request(request(8,'request-outsider-8',fixture.principals.outsider))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    const production=new PrivilegedActions(fixture.runtime,{environment:'PRODUCTION',commandKind:'workforce.grant.v1',permission:'workforce.grant',commandSchema});
    const input=request(9);
    await expect(production.request({...input,context:{...input.context,conditions:{...input.context.conditions,environment:'PRODUCTION'}}})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    const productionPrincipal=await fixture.environmentSession(fixture.principals.maker,'PRODUCTION');
    await expect(production.request({...input,context:{...input.context,principal:productionPrincipal,conditions:{...input.context.conditions,environment:'PRODUCTION'}}})).rejects.toMatchObject({code:'IAM_NOT_READY'});
    await expect(actions.request({...input,context:{...input.context,conditions:{...input.context.conditions,environment:'PRODUCTION'}}})).rejects.toMatchObject({code:'ENVIRONMENT_MISMATCH'});
  });

  it('rolls back the action if its immutable audit cannot commit',async()=>{
    const raw=request(10);
    const proof=await fixture.issueFactor(fixture.principals.maker,actions.fingerprint(raw));
    const input={...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof}}};
    const before=(await fixture.pool.query('SELECT count(*)::int AS count FROM internal_action_authorizations')).rows[0].count;
    await fixture.pool.query('REVOKE INSERT ON internal_iam_events FROM cr1_iam_runtime');
    try {await expect(actions.request(input)).rejects.toMatchObject({code:'STORE_UNAVAILABLE'});}
    finally {await fixture.pool.query('GRANT INSERT ON internal_iam_events TO cr1_iam_runtime');}
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_action_authorizations')).rows[0].count).toBe(before);
    expect(await actions.request(input)).toMatchObject({replayed:false,receipt:{status:'PENDING'}});
  });

  it('preserves a committed request after an ambiguous commit acknowledgement and resolves it by exact replay',async()=>{
    const raw=request(12);
    const proof=await fixture.issueFactor(fixture.principals.maker,actions.fingerprint(raw));
    const input={...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof}}};
    let failCommit=true;
    const transport=new Proxy(fixture.runtime,{get(target,property){
      if (property==='connect') return async()=>{
        const client=await target.connect();
        return new Proxy(client,{get(connection,key){
          if (key==='query') return async(...args:unknown[])=>{
            const result=await Reflect.apply(connection.query,connection,args);
            if (args[0]==='COMMIT' && failCommit) {failCommit=false;throw new Error('Simulated acknowledgement loss after durable commit');}
            return result;
          };
          const value=Reflect.get(connection,key);
          return typeof value==='function'?value.bind(connection):value;
        }});
      };
      const value=Reflect.get(target,property);
      return typeof value==='function'?value.bind(target):value;
    }});
    const uncertain=new PrivilegedActions(transport,{environment:'LOCAL',commandKind:'workforce.grant.v1',permission:'workforce.grant',commandSchema});
    await expect(uncertain.request(input)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
    expect(await actions.request(input)).toMatchObject({replayed:true,receipt:{status:'PENDING'}});
  });

  it('reports expired action evidence and does not renew or reset the immutable request',async()=>{
    const raw=request(13);
    const hash=actions.fingerprint(raw);
    const proof=await fixture.issueFactor(fixture.principals.maker,hash,1);
    const input={...raw,context:{...raw.context,evidence:{stepUpReceiptId:proof}}};
    const result=await actions.request(input);
    await new Promise(resolve=>setTimeout(resolve,1100));
    await expect(actions.request(input)).rejects.toMatchObject({code:'ACTION_EXPIRED'});
    await expect(actions.approve(await reviewInput(result.receipt.id,hash))).rejects.toMatchObject({code:'ACTION_EXPIRED'});
    expect(await actions.read(readInput(result.receipt.id))).toMatchObject({authorityState:'EXPIRED',receipt:{expired:true,status:'PENDING'}});
  });

  it('rechecks a revoked checker grant before persisting a review',async()=>{
    const {result,hash}=await pending(14);
    const review=await reviewInput(result.receipt.id,hash);
    await fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
      SELECT id,90,'Revoke the local checker scope before review.' FROM internal_membership_grants WHERE membership_id=$1 AND environment='LOCAL'`,[fixture.principals.checker.membershipId]);
    await expect(actions.approve(review)).rejects.toMatchObject({code:'ACTION_NOT_FOUND'});
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_action_approvals WHERE authorization_id=$1',[result.receipt.id])).rows[0].count).toBe(0);
    // Restoring authority is a new, independently recorded immutable grant in
    // the disposable fixture, never deletion of the revocation evidence.
    await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
      SELECT organization_id,membership_id,role_version_id,scope_type,scope_id,environment,encode(sha256(convert_to(grant_hash||':replacement','UTF8')),'hex'),90,'New local fixture grant after explicit revocation.' FROM internal_membership_grants WHERE membership_id=$1 AND environment='LOCAL'`,[fixture.principals.checker.membershipId]);
  });

  it('reports stale policy explicitly and does not carry a prior review into a new policy release',async()=>{
    const {input,result,hash}=await pending(11);
    const previous=(await fixture.pool.query('SELECT version_id FROM internal_iam_current_policy')).rows[0].version_id as string;
    const next=(await fixture.pool.query(`INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason)
      SELECT 2,jsonb_set(config,'{version}','2'::jsonb),config_hash,approval_status,'Disposable policy release for stale receipt validation.' FROM internal_iam_policy_versions WHERE id=$1 RETURNING id`,[previous])).rows[0].id as string;
    await fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1',[next]);
    try {
      await expect(actions.request(input)).rejects.toMatchObject({code:'POLICY_CHANGED'});
      await expect(actions.approve(await reviewInput(result.receipt.id,hash))).rejects.toMatchObject({code:'POLICY_CHANGED'});
      expect(await actions.read(readInput(result.receipt.id))).toMatchObject({authorityState:'POLICY_CHANGED',receipt:{status:'PENDING'}});
    } finally {await fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1',[previous]);}
  });
});
