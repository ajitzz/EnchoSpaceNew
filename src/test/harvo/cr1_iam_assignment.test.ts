import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {AssignmentService} from '../../lib/iam/assignmentService.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {permissionCheckInputSchema} from '../../lib/iam/authorizationPort.js';
import {verifyIamCatalog} from '../../server/deployment/iamReadiness.js';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';

describe('CR1 own assignment lifecycle on restricted real PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;
  let service:AssignmentService;
  beforeAll(async()=>{
    fixture=await createCr1IamFixture();service=new AssignmentService(fixture.runtime,'LOCAL');
    for(const principal of [fixture.principals.maker,fixture.principals.checker]) {
      await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
        SELECT $1,$2,v.id,'ORGANIZATION',$1::uuid::text,'LOCAL',repeat($3,64),90,'Explicit campaign operator capability in disposable local fixture.' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='campaign_operator' AND v.version=1`,[fixture.organizationId,principal.membershipId,principal.accountId===90?'c':'d']);
    }
  });
  afterAll(async()=>{await fixture?.close();});
  const input=(assignmentId:string,key=randomUUID(),principal=fixture.principals.maker)=>({principal,organizationId:fixture.organizationId,assignmentId,expectedVersion:1,expectedFence:'0',idempotencyKey:key,reason:'Claim or release only this explicitly assigned campaign task.'});
  async function assignment(options:{member?:string;environment?:string;permission?:string|null;provider?:string|null}={}) {
    return (await fixture.pool.query(`INSERT INTO internal_work_assignments(organization_id,queue_key,resource_type,resource_id,assignee_membership_id,environment,required_permission_code,provider,assigned_by,reason)
      VALUES($1,'campaign_prepare','CAMPAIGN',$2,$3,$4,$5,$6,90,'Canonical task assigned explicitly in local fixture.') RETURNING *`,[fixture.organizationId,randomUUID(),options.member??fixture.principals.maker.membershipId,options.environment??'LOCAL',options.permission===undefined?'campaign.prepare':options.permission,options.provider??null])).rows[0];
  }
  const execution=(work:Record<string,unknown>,version:number,fence:string,provider?:'META'|'GOOGLE')=>permissionCheckInputSchema.parse({
    principal:fixture.principals.maker,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'campaign.prepare',
    resource:{target:{type:'CAMPAIGN',id:work.resource_id},assignmentId:work.id,assignmentVersion:version,assignmentFence:fence},
    conditions:{environment:'LOCAL',provider,requestedAt:new Date().toISOString(),commandHash:'f'.repeat(64)},evidence:{},
  });

  it('verifies FORCE RLS and narrow runtime grants with no direct assignment/receipt writes',async()=>{
    const client=await fixture.runtime.connect();
    try {
      expect(await verifyIamCatalog(client)).toMatchObject({ready:true,privilegeValid:true,policyValid:true,functionSafety:true});
      expect((await client.query("SELECT has_table_privilege(current_user,'internal_work_assignments','UPDATE') AS updates,has_table_privilege(current_user,'internal_assignment_commands','INSERT') AS creates")).rows[0]).toEqual({updates:false,creates:false});
      await expect(client.query("UPDATE internal_work_assignments SET state='CANCELLED'")).rejects.toMatchObject({code:'42501'});
      await expect(client.query('INSERT INTO internal_assignment_commands DEFAULT VALUES')).rejects.toMatchObject({code:'42501'});
      await fixture.pool.query('REVOKE EXECUTE ON FUNCTION internal_iam_command_assignment(uuid,text,integer,bigint,text,text,text,text,text) FROM cr1_iam_runtime');
      try {expect(await verifyIamCatalog(client)).toMatchObject({ready:false,functionSafety:false});}
      finally {await fixture.pool.query('GRANT EXECUTE ON FUNCTION internal_iam_command_assignment(uuid,text,integer,bigint,text,text,text,text,text) TO cr1_iam_runtime');}
    } finally {client.release();}
  });

  it('claims once with atomic audit, exact replay and bounded input validation',async()=>{
    const work=await assignment();const raw=input(work.id);
    const claimed=await service.claim(raw);
    expect(claimed).toMatchObject({replayed:false,receipt:{state:'CLAIMED',version:2,fence:'1'}});
    expect(await service.claim(raw)).toEqual({...claimed,replayed:true});
    const counts=(await fixture.pool.query("SELECT (SELECT count(*)::int FROM internal_assignment_commands WHERE assignment_id=$1) AS commands,(SELECT count(*)::int FROM internal_iam_events WHERE entity_id=$1::text AND event_type='WORK_ASSIGNMENT_CLAIMED') AS audits",[work.id])).rows[0];
    expect(counts).toEqual({commands:1,audits:1});
    await expect(service.claim({...raw,reason:'Change the semantics but reuse the same request.'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    await expect(service.claim({...raw,expectedFence:0})).rejects.toMatchObject({code:'INPUT_INVALID'});
    await expect(service.claim({...raw,leaseSeconds:9000})).rejects.toMatchObject({code:'INPUT_INVALID'});
  });

  it('serializes concurrent same-key claims and rejects independent stale claims without deadlocking',async()=>{
    const work=await assignment();const raw=input(work.id);
    const results=await Promise.all([service.claim(raw),service.claim(raw)]);
    expect(results.map(result=>result.replayed).sort()).toEqual([false,true]);
    await expect(service.claim({...raw,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'CAS_CONFLICT'});
    await expect(service.claim({...raw,idempotencyKey:randomUUID(),expectedVersion:2,expectedFence:'1'})).rejects.toMatchObject({code:'STATE_CONFLICT'});
  });

  it('releases terminally with increasing fence and invalidates previously authorized execution',async()=>{
    const work=await assignment();const raw=input(work.id);
    const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');
    expect(await authority.check(execution(work,1,'0'))).toMatchObject({effect:'DENY',reason:'RESOURCE_OUT_OF_SCOPE'});
    await service.claim(raw);
    expect(await authority.check(execution(work,2,'1'))).toMatchObject({effect:'ALLOW'});
    const releasedInput={...input(work.id),expectedVersion:2,expectedFence:'1'};
    const released=await service.release(releasedInput);
    expect(released).toMatchObject({replayed:false,receipt:{state:'RELEASED',version:3,fence:'2',leaseUntil:null}});
    expect(await service.release(releasedInput)).toEqual({...released,replayed:true});
    let executed=false;
    await expect(authority.runAuthorized(execution(work,2,'1'),async()=>{executed=true;})).rejects.toMatchObject({code:'RESOURCE_OUT_OF_SCOPE'});
    expect(executed).toBe(false);
    await expect(service.claim({...input(work.id),expectedVersion:3,expectedFence:'2'})).rejects.toMatchObject({code:'STATE_CONFLICT'});
    await expect(fixture.pool.query("UPDATE internal_work_assignments SET state='ASSIGNED',version=version+1,fence=fence+1 WHERE id=$1",[work.id])).rejects.toThrow('IAM_ASSIGNMENT_TERMINAL');
    expect(await service.claim(raw)).toMatchObject({replayed:true,receipt:{state:'CLAIMED',version:2}}); // historical receipt, never current authority
  });

  it('reclaims expired leases with a new fence, rejecting old worker versions and provider mismatches',async()=>{
    const work=await assignment({provider:'META'});await service.claim(input(work.id));
    // Test-clock setup only: shorten the lease through the fixture administrator,
    // then restore the lifecycle guard before exercising the restricted command.
    await fixture.pool.query('ALTER TABLE internal_work_assignments DISABLE TRIGGER internal_assignment_transition');
    try {await fixture.pool.query("UPDATE internal_work_assignments SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[work.id]);}
    finally {await fixture.pool.query('ALTER TABLE internal_work_assignments ENABLE TRIGGER internal_assignment_transition');}
    const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');
    expect(await authority.check(execution(work,2,'1','META'))).toMatchObject({effect:'DENY'});
    expect(await service.claim({...input(work.id),expectedVersion:2,expectedFence:'1'})).toMatchObject({receipt:{version:3,fence:'2',state:'CLAIMED'}});
    expect(await authority.check(execution(work,2,'1','META'))).toMatchObject({effect:'DENY'});
    expect(await authority.check(execution(work,3,'2','GOOGLE'))).toMatchObject({effect:'DENY'});
    expect(await authority.check(execution(work,3,'2','META'))).toMatchObject({effect:'ALLOW'});
  });

  it('denies unknown, other-assignee, unbound, wrong-environment and pending-production work',async()=>{
    await expect(service.claim(input(randomUUID()))).rejects.toMatchObject({code:'ASSIGNMENT_NOT_FOUND'});
    const other=await assignment({member:fixture.principals.checker.membershipId});
    await expect(service.claim(input(other.id))).rejects.toMatchObject({code:'ASSIGNMENT_NOT_FOUND'});
    const unbound=await assignment({permission:null});
    await expect(service.claim(input(unbound.id))).rejects.toMatchObject({code:'ASSIGNMENT_UNBOUND'});
    const mismatched=await assignment({permission:'strategy.draft'});
    await expect(service.claim(input(mismatched.id))).rejects.toMatchObject({code:'ASSIGNMENT_UNBOUND'});
    const production=await assignment({environment:'PRODUCTION'});
    await expect(service.claim(input(production.id))).rejects.toMatchObject({code:'ENVIRONMENT_MISMATCH'});
    await expect(new AssignmentService(fixture.runtime,'PRODUCTION').claim(input(production.id))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    const productionPrincipal=await fixture.environmentSession(fixture.principals.maker,'PRODUCTION');
    await expect(new AssignmentService(fixture.runtime,'PRODUCTION').claim(input(production.id,randomUUID(),productionPrincipal))).rejects.toMatchObject({code:'IAM_NOT_READY'});
  });

  it('does not treat assignment ownership as permission or accept forged session identity',async()=>{
    const work=await assignment({member:fixture.principals.outsider.membershipId});
    await expect(service.claim(input(work.id,randomUUID(),fixture.principals.outsider))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    const own=await assignment();const raw=input(own.id);
    await expect(service.claim({...raw,principal:{...raw.principal,accountId:91}})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    expect(permissionCheckInputSchema.safeParse({...execution(own,1,'0'),resource:{target:{type:'CAMPAIGN',id:own.resource_id},assignmentId:own.id}}).success).toBe(false);
  });

  it('requires both queue and exact resource capabilities, and rechecks revoked sessions',async()=>{
    const outsider=fixture.principals.outsider;
    await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
      SELECT $1,$2,v.id,'WORKFORCE',$1::uuid::text,'LOCAL',repeat('e',64),90,'Own queue capability without campaign prepare capability.' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='support_analyst' AND v.version=1`,[fixture.organizationId,outsider.membershipId]);
    const work=await assignment({member:outsider.membershipId});
    await expect(service.claim(input(work.id,randomUUID(),outsider))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
      SELECT $1,$2,v.id,'CAMPAIGN',$3,'LOCAL',repeat('f',64),90,'Only the exact assigned campaign resource is authorized.' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='campaign_operator' AND v.version=1`,[fixture.organizationId,outsider.membershipId,work.resource_id]);
    expect(await service.claim(input(work.id,randomUUID(),outsider))).toMatchObject({receipt:{state:'CLAIMED'}});
    const another=await assignment({member:outsider.membershipId});
    await expect(service.claim(input(another.id,randomUUID(),outsider))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await fixture.pool.query("UPDATE internal_staff_sessions SET status='REVOKED',revoked_at=clock_timestamp(),revoked_by=90,revoke_reason='Disposable session revoked before queue operation.' WHERE id=$1",[outsider.sessionId]);
    await expect(service.claim(input(work.id,randomUUID(),outsider))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  });

  it('fences concurrent release until a previously authorized local transaction finishes',async()=>{
    const work=await assignment();await service.claim(input(work.id));
    const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');
    let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});
    let unblock!:()=>void;const blocked=new Promise<void>(resolve=>{unblock=resolve;});
    const active=authority.runAuthorized(execution(work,2,'1'),async()=>{enter();await blocked;});
    await entered;
    let releaseDone=false;
    const release=service.release({...input(work.id),expectedVersion:2,expectedFence:'1'}).then(value=>{releaseDone=true;return value;});
    try {await new Promise(resolve=>setTimeout(resolve,40));expect(releaseDone).toBe(false);}
    finally {unblock();}
    await active;expect(await release).toMatchObject({receipt:{state:'RELEASED',fence:'2'}});
    expect(await authority.check(execution(work,2,'1'))).toMatchObject({effect:'DENY'});
  });

  it('resolves an ambiguous commit by replay without extending the durable lease',async()=>{
    const work=await assignment();const raw=input(work.id);let failCommit=true;
    const transport=new Proxy(fixture.runtime,{get(target,property){
      if(property==='connect') return async()=>{
        const client=await target.connect();
        return new Proxy(client,{get(connection,key){
          if(key==='query') return async(...args:unknown[])=>{
            const result=await Reflect.apply(connection.query,connection,args);
            if(args[0]==='COMMIT' && failCommit){failCommit=false;throw new Error('Assignment commit acknowledgement lost');}
            return result;
          };
          const value=Reflect.get(connection,key);return typeof value==='function'?value.bind(connection):value;
        }});
      };
      const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
    }});
    await expect(new AssignmentService(transport,'LOCAL').claim(raw)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
    const replay=await service.claim(raw);expect(replay).toMatchObject({replayed:true,receipt:{fence:'1'}});
    expect(await service.claim(raw)).toEqual(replay);
  });

  it('rolls back state and receipt when the immutable audit fails',async()=>{
    const work=await assignment();const raw=input(work.id);
    await fixture.pool.query(`CREATE FUNCTION public.cr1_test_reject_assignment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='WORK_ASSIGNMENT_CLAIMED' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER cr1_test_assignment_audit BEFORE INSERT ON internal_iam_events FOR EACH ROW EXECUTE FUNCTION public.cr1_test_reject_assignment_audit()`);
    try {await expect(service.claim(raw)).rejects.toMatchObject({code:'STORE_UNAVAILABLE'});}
    finally {await fixture.pool.query('DROP TRIGGER cr1_test_assignment_audit ON internal_iam_events;DROP FUNCTION public.cr1_test_reject_assignment_audit()');}
    expect((await fixture.pool.query('SELECT state,version,fence::text FROM internal_work_assignments WHERE id=$1',[work.id])).rows[0]).toEqual({state:'ASSIGNED',version:1,fence:'0'});
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_assignment_commands WHERE assignment_id=$1',[work.id])).rows[0].count).toBe(0);
    expect(await service.claim(raw)).toMatchObject({replayed:false});
  });

  it('rejects revoked grants after claim and preserves immutable command evidence',async()=>{
    const work=await assignment({member:fixture.principals.checker.membershipId});const raw=input(work.id,randomUUID(),fixture.principals.checker);
    const result=await service.claim(raw);
    await fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason) SELECT id,90,'Revoke checker capabilities before local release command.' FROM internal_membership_grants WHERE membership_id=$1 AND environment='LOCAL'`,[fixture.principals.checker.membershipId]);
    await expect(service.release({...raw,idempotencyKey:randomUUID(),expectedVersion:2,expectedFence:'1'})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await expect(service.claim(raw)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await expect(fixture.pool.query("UPDATE internal_assignment_commands SET reason='Cannot rewrite an immutable command receipt.' WHERE id=$1",[result.receipt.id])).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');
  });
});
