import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';
import {WorkforceInvitations,issueInvitationCommandSchema,type InvitationReceipt} from '../../lib/iam/workforceInvitations.js';
import {verifiedEmailHash,type OwnerIdentityEvidencePort} from '../../lib/iam/ownerBootstrap.js';
import {iamInvitationIdentityWriterGrants,iamInvitationRuntimeGrants,verifyIamInvitationCatalog} from '../../server/deployment/iamInvitationReadiness.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import type {PermissionCheckInput} from '../../lib/iam/authorizationPort.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';

describe('CR1 verified workforce invitations on isolated PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;
  let identity:pg.Pool;
  let service:WorkforceInvitations;
  const receiptHash=createHash('sha256').update('isolated-invitee-identity-receipt').digest('hex');
  const subjectHash=createHash('sha256').update('isolated-invitee-subject').digest('hex');
  const invitee=()=>parsePrincipalContext({actorKind:'ACCOUNT',accountId:93,assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'invitee-verified-test',operationId:'invitation-accept'});
  const proof:OwnerIdentityEvidencePort={verify:async input=>input.userId===93 && input.receiptHash===receiptHash?{
    userId:93,emailVerified:true,verifiedEmailHash:verifiedEmailHash('invitee@example.test'),receiptHash,verifiedSubjectHash:subjectHash,
    verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),source:'LOCAL_FIXTURE',
  }:null};
  beforeEach(async()=>{
    fixture=await createCr1IamFixture();
    await fixture.pool.query(`INSERT INTO users VALUES(93,'invitee@example.test','user'),(94,'different@example.test','user');
      CREATE ROLE cr1_iam_identity LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT SELECT(id,email),UPDATE(id) ON users TO cr1_iam_migrator;`);
    for (const grant of iamInvitationRuntimeGrants('cr1_iam_runtime')) await fixture.pool.query(grant);
    for (const grant of iamInvitationIdentityWriterGrants('cr1_iam_identity')) await fixture.pool.query(grant);
    identity=new pg.Pool({...fixture.pool.options,user:'cr1_iam_identity'});
    service=new WorkforceInvitations(fixture.runtime,{environment:'LOCAL',identityWriter:identity,identityEvidence:proof});
  },30000);
  afterEach(async()=>{await identity?.end();await fixture?.close();});

  function context(permission:'workforce.grant'|'workforce.invite'):PermissionCheckInput {
    return {principal:fixture.principals.maker,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission,
      resource:{target:{type:'WORKFORCE',id:fixture.organizationId},ancestors:[]},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}};
  }
  async function prepare(){
    const role=(await fixture.pool.query(`SELECT v.id,v.config_hash,jsonb_agg(p.permission_code ORDER BY p.permission_code) AS permissions
      FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id JOIN internal_role_permissions p ON p.role_version_id=v.id
      WHERE d.role_key='creative_policy_reviewer' GROUP BY v.id,v.config_hash`)).rows[0];
    const command=issueInvitationCommandSchema.parse({invitationId:randomUUID(),email:'invitee@example.test',environment:'LOCAL',expiresAt:new Date(Date.now()+3600000).toISOString(),
      grants:[{roleVersionId:role.id,roleHash:role.config_hash,permissionCodes:role.permissions,scope:{type:'ORGANIZATION',id:fixture.organizationId},environment:'LOCAL',provider:null,maxAmountMinor:null,validUntil:null}]});
    return {context:context('workforce.grant'),idempotencyKey:`invite:${command.invitationId}`,reason:'Reviewed exact creative reviewer scope for this employee.',command};
  }
  async function approve(input:Awaited<ReturnType<typeof prepare>>){
    const hash=service.issueActions.fingerprint(input);
    input.context.evidence.stepUpReceiptId=await fixture.issueFactor(fixture.principals.maker,hash);
    const request=await service.issueActions.request(input);
    const factor=await fixture.issueFactor(fixture.principals.checker,hash);
    await service.issueActions.approve({principal:fixture.principals.checker,organizationId:fixture.organizationId,authorizationId:request.receipt.id,expectedCommandHash:hash,reason:'Independent reviewer approved the exact workforce scope.',stepUpReceiptId:factor});
    input.context.evidence.actionAuthorizationId=request.receipt.id;
    return input;
  }
  const issue=async()=>service.issue(await approve(await prepare()));
  const accept=(value:{receipt:InvitationReceipt;invitationToken:string|null},overrides:Record<string,unknown>={})=>service.accept({principal:invitee(),invitationToken:value.invitationToken,expectedGrantBundleHash:value.receipt.grantBundleHash,identityReceiptHash:receiptHash,...overrides});

  it('bounds unavailable runtime connections without exposing database error text',async()=>{
    const unavailable=new Proxy(fixture.runtime,{get(target,key,receiver){
      if (key==='connect') return async()=>{throw new Error('postgres://private-credential@example.test');};
      return Reflect.get(target,key,receiver);
    }});
    const broken=new WorkforceInvitations(unavailable,{environment:'LOCAL',identityWriter:identity,identityEvidence:proof});
    await expect(broken.issue(await prepare())).rejects.toMatchObject({code:'STORE_UNAVAILABLE',message:'STORE_UNAVAILABLE'});
  });

  it('requires distinct approved authority before issuing and persists only the token digest',async()=>{
    const input=await prepare();
    await expect(service.issue(input)).rejects.toMatchObject({code:'STORE_UNAVAILABLE'});
    const result=await service.issue(await approve(input));
    expect(result.receipt.state).toBe('PENDING');expect(result.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored=(await fixture.pool.query('SELECT token_hash,grant_bundle FROM internal_organization_invitations WHERE id=$1',[result.receipt.invitationId])).rows[0];
    expect(stored.token_hash).toBe(createHash('sha256').update(result.invitationToken!).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(result.invitationToken!);
    expect(await service.issue(input)).toMatchObject({replayed:true,invitationToken:null,receipt:result.receipt});
    await expect(service.issue({...input,command:{...input.command,email:'different@example.test'}})).rejects.toMatchObject({code:'COMMAND_CONFLICT'});
  });

  it('accepts exact verified identity once, without changing account roles or issuing sessions/factors',async()=>{
    const result=await issue();
    const accepted=await accept(result);expect(accepted.outcome).toBe('ACCEPTED');
    expect(await accept(result)).toEqual({...accepted,outcome:'ALREADY_ACCEPTED'});
    const member=(await fixture.pool.query('SELECT user_id,status,accepted_invitation_id FROM internal_organization_memberships WHERE id=$1',[accepted.membershipId])).rows[0];
    expect(member).toMatchObject({user_id:93,status:'ACTIVE',accepted_invitation_id:result.receipt.invitationId});
    expect((await fixture.pool.query('SELECT role FROM users WHERE id=93')).rows[0].role).toBe('user');
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_staff_sessions WHERE membership_id=$1',[accepted.membershipId])).rows[0].count)).toBe(0);
    const grants=(await fixture.pool.query('SELECT role_version_id,scope_type,scope_id FROM internal_membership_grants WHERE membership_id=$1',[accepted.membershipId])).rows;
    expect(grants).toEqual([{role_version_id:result.receipt.grants[0].roleVersionId,scope_type:'ORGANIZATION',scope_id:fixture.organizationId}]);
    const events=(await fixture.pool.query("SELECT evidence FROM internal_iam_events WHERE event_type='WORKFORCE_INVITATION_ACCEPTED'")).rows;
    expect(events).toHaveLength(1);expect(JSON.stringify(events)).not.toContain('invitee@example.test');expect(JSON.stringify(events)).not.toContain(result.invitationToken!);
  });

  it('denies unknown identity, email mismatch, bundle tampering and different-account replay',async()=>{
    const result=await issue();
    await expect(accept(result,{identityReceiptHash:'f'.repeat(64)})).rejects.toMatchObject({code:'IDENTITY_UNVERIFIED'});
    await expect(accept(result,{expectedGrantBundleHash:'f'.repeat(64)})).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
    await fixture.pool.query("UPDATE users SET email='changed@example.test' WHERE id=93");
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
    await fixture.pool.query("UPDATE users SET email='invitee@example.test' WHERE id=93");
    await accept(result);
    await expect(accept(result,{principal:{...invitee(),accountId:94}})).rejects.toMatchObject({code:'IDENTITY_UNVERIFIED'});
    await expect(accept(result,{grants:result.receipt.grants})).rejects.toMatchObject({code:'INPUT_INVALID'});
  });

  it('prevents shared runtime from accepting invitations or writing identity evidence',async()=>{
    const result=await issue();
    const runtimeService=new WorkforceInvitations(fixture.runtime,{environment:'LOCAL',identityWriter:fixture.runtime,identityEvidence:proof});
    await expect(runtimeService.accept({principal:invitee(),invitationToken:result.invitationToken,expectedGrantBundleHash:result.receipt.grantBundleHash,identityReceiptHash:receiptHash})).rejects.toMatchObject({code:'IDENTITY_WRITER_UNAVAILABLE'});
    await expect(fixture.runtime.query("SELECT internal_iam_accept_invitation($1,$2,'{}','LOCAL','test')",['a'.repeat(64),'a'.repeat(64)])).rejects.toThrow('permission denied');
    await expect(identity.query('SELECT * FROM internal_organization_invitations')).rejects.toThrow('permission denied');
    const runtimeClient=await fixture.runtime.connect();const identityClient=await identity.connect();
    try {
      expect(await verifyIamInvitationCatalog(runtimeClient,'RUNTIME')).toMatchObject({ready:true});
      expect(await verifyIamInvitationCatalog(identityClient,'IDENTITY_WRITER')).toMatchObject({ready:true});
      await fixture.pool.query('GRANT SELECT(email) ON users TO cr1_iam_identity');
      expect(await verifyIamInvitationCatalog(identityClient,'IDENTITY_WRITER')).toMatchObject({ready:false,roleSafe:false});
      await expect(accept(result)).rejects.toMatchObject({code:'IDENTITY_WRITER_UNAVAILABLE'});
      await fixture.pool.query('REVOKE SELECT(email) ON users FROM cr1_iam_identity; REVOKE UPDATE(id) ON users FROM cr1_iam_migrator');
      expect(await verifyIamInvitationCatalog(identityClient,'IDENTITY_WRITER')).toMatchObject({ready:false,functionsSafe:false});
    }
    finally {runtimeClient.release();identityClient.release();}
  });

  it('serializes concurrent acceptance into one member, one grant and one identity receipt',async()=>{
    const result=await issue();
    const accepted=await Promise.all([accept(result),accept(result)]);
    expect(accepted.map(row=>row.outcome).sort()).toEqual(['ACCEPTED','ALREADY_ACCEPTED']);
    expect(new Set(accepted.map(row=>row.membershipId)).size).toBe(1);
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_invitation_identity_receipts')).rows[0].count)).toBe(1);
  });

  it('revalidates inviter authority and the exact role permission snapshot before accepting',async()=>{
    const result=await issue();
    await fixture.pool.query("INSERT INTO internal_role_permissions(role_version_id,permission_code) VALUES($1,'provider.activate')",[result.receipt.grants[0].roleVersionId]);
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_invitation_identity_receipts')).rows[0].count)).toBe(0);
  });

  it.each(['maker','checker'] as const)('refuses acceptance after the %s loses workforce authority',async actor=>{
    const result=await issue();
    await fixture.pool.query(`UPDATE internal_organization_memberships SET status='SUSPENDED',version=version+1,suspended_at=clock_timestamp(),changed_by=90,change_reason='Isolated authority withdrawal before invite acceptance.' WHERE id=$1`,[fixture.principals[actor].membershipId]);
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_organization_memberships WHERE user_id=93')).rows[0].count)).toBe(0);
  });

  it('fails closed when current policy changes after independently approved invitation',async()=>{
    const result=await issue();
    const policy=(await fixture.pool.query(`INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason)
      SELECT 2,config || '{"version":2}'::jsonb,repeat('0',64),approval_status,'Changed isolated operational policy requires new review.'
      FROM internal_iam_policy_versions WHERE version=1 RETURNING id`)).rows[0];
    await fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1',[policy.id]);
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
  });

  it('records expiry without accepting or granting access',async()=>{
    const input=await prepare();input.command.expiresAt=new Date(Date.now()+2000).toISOString();
    const result=await service.issue(await approve(input));
    await new Promise(resolve=>setTimeout(resolve,2050));
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_EXPIRED'});
    expect((await fixture.pool.query('SELECT status FROM internal_organization_invitations WHERE id=$1',[result.receipt.invitationId])).rows[0].status).toBe('EXPIRED');
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_invitation_identity_receipts')).rows[0].count)).toBe(0);
  },10000);

  it('rejects an unverified or expired independent identity receipt',async()=>{
    const result=await issue();
    const expired:OwnerIdentityEvidencePort={verify:async input=>{
      const value=await proof.verify(input);return value && {...value,verifiedAt:new Date(Date.now()-30000).toISOString(),expiresAt:new Date(Date.now()-10000).toISOString()};
    }};
    const boundary=new WorkforceInvitations(fixture.runtime,{environment:'LOCAL',identityWriter:identity,identityEvidence:expired});
    await expect(boundary.accept({principal:invitee(),invitationToken:result.invitationToken,expectedGrantBundleHash:result.receipt.grantBundleHash,identityReceiptHash:receiptHash})).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
  });

  it('recomputes exact command identity inside SQL rather than trusting a supplied authorization ID',async()=>{
    const input=await approve(await prepare());await service.issue(input);
    const client=await fixture.runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true)`,[
        String(fixture.principals.maker.accountId),fixture.organizationId,fixture.principals.maker.membershipId,fixture.principals.maker.sessionId]);
      await expect(client.query('SELECT internal_iam_issue_invitation($1::jsonb,$2,$3,$4)',[
        JSON.stringify({...input.command,invitationId:randomUUID(),email:'different@example.test'}),input.context.evidence.actionAuthorizationId,'a'.repeat(64),input.reason,
      ])).rejects.toThrow('IAM_INVITATION_AUTHORIZATION_INVALID');
    } finally {await client.query('ROLLBACK');client.release();}
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_organization_invitations')).rows[0].count)).toBe(1);
  });

  it('refuses a consumed approval reused from an earlier transaction even for the identical command',async()=>{
    const input=await approve(await prepare());
    const commandHash=service.issueActions.fingerprint(input);
    await new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL').runAuthorized({...input.context,conditions:{...input.context.conditions,commandHash}},async()=>null);
    const client=await fixture.runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true)`,[
        String(fixture.principals.maker.accountId),fixture.organizationId,fixture.principals.maker.membershipId,fixture.principals.maker.sessionId]);
      await expect(client.query('SELECT internal_iam_issue_invitation($1::jsonb,$2,$3,$4)',[JSON.stringify(input.command),input.context.evidence.actionAuthorizationId,'a'.repeat(64),input.reason])).rejects.toThrow('IAM_INVITATION_AUTHORIZATION_INVALID');
    } finally {await client.query('ROLLBACK');client.release();}
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_organization_invitations')).rows[0].count)).toBe(0);
  });

  it('reports unknown commit acknowledgement and resolves acceptance by exact replay',async()=>{
    const result=await issue();let fail=true;
    const transport=new Proxy(identity,{get(target,key){
      if(key==='connect') return async()=>{
        const client=await target.connect();
        return new Proxy(client,{get(connection,property){
          if(property==='query') return async(...args:unknown[])=>{
            const value=await Reflect.apply(connection.query,connection,args);
            if(args[0]==='COMMIT' && fail){fail=false;throw new Error('Isolated acknowledgement loss.');}return value;
          };
          const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;
        }});
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    const uncertain=new WorkforceInvitations(fixture.runtime,{environment:'LOCAL',identityWriter:transport,identityEvidence:proof});
    await expect(uncertain.accept({principal:invitee(),invitationToken:result.invitationToken,expectedGrantBundleHash:result.receipt.grantBundleHash,identityReceiptHash:receiptHash})).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
    expect(await accept(result)).toMatchObject({outcome:'ALREADY_ACCEPTED'});
  });

  it('detects permissive identity policies and public function exposure in readiness',async()=>{
    const client=await identity.connect();
    try {
      expect(await verifyIamInvitationCatalog(client,'IDENTITY_WRITER')).toMatchObject({ready:true});
      await fixture.pool.query('ALTER POLICY iam_identity_receipt_owner_insert ON internal_invitation_identity_receipts WITH CHECK(true)');
      expect(await verifyIamInvitationCatalog(client,'IDENTITY_WRITER')).toMatchObject({ready:false,identityPoliciesSafe:false});
      await fixture.pool.query('GRANT EXECUTE ON FUNCTION internal_iam_accept_invitation(TEXT,TEXT,JSONB,TEXT,TEXT) TO PUBLIC');
      expect(await verifyIamInvitationCatalog(client,'IDENTITY_WRITER')).toMatchObject({ready:false,functionsSafe:false});
    } finally {client.release();}
  });

  it('revokes an unaccepted invitation under a separate exact step-up command',async()=>{
    const result=await issue();
    const input={context:context('workforce.invite'),idempotencyKey:`revoke:${result.receipt.invitationId}`,reason:'The invitation is no longer required by operations.',
      command:{invitationId:result.receipt.invitationId,expectedGrantBundleHash:result.receipt.grantBundleHash,environment:'LOCAL' as const}};
    input.context.evidence.stepUpReceiptId=await fixture.issueFactor(fixture.principals.maker,service.revokeActions.fingerprint(input));
    const action=await service.revokeActions.request(input);input.context.evidence.actionAuthorizationId=action.receipt.id;
    expect(await service.revoke(input)).toMatchObject({receipt:{state:'REVOKED'},replayed:false});
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
  });

  it('rolls back invitation acceptance if immutable audit persistence fails',async()=>{
    const result=await issue();
    await fixture.pool.query(`CREATE FUNCTION reject_acceptance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='WORKFORCE_INVITATION_ACCEPTED' THEN RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_acceptance_audit BEFORE INSERT ON internal_iam_events FOR EACH ROW EXECUTE FUNCTION reject_acceptance_audit();`);
    await expect(accept(result)).rejects.toMatchObject({code:'INVITATION_UNAVAILABLE'});
    expect((await fixture.pool.query('SELECT status FROM internal_organization_invitations WHERE id=$1',[result.receipt.invitationId])).rows[0].status).toBe('PENDING');
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_organization_memberships WHERE user_id=93')).rows[0].count)).toBe(0);
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_invitation_identity_receipts')).rows[0].count)).toBe(0);
  });
});
