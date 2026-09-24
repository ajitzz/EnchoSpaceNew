import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';
import {WorkforceReviewReader} from '../../lib/iam/workforceReview.js';
import {iamWorkforceReviewRuntimeGrants,verifyIamWorkforceReviewCatalog} from '../../server/deployment/iamWorkforceReviewReadiness.js';
import {iamInvitationRuntimeGrants} from '../../server/deployment/iamInvitationReadiness.js';
import {WorkforceInvitations,issueInvitationCommandSchema} from '../../lib/iam/workforceInvitations.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import type {PermissionCheckInput} from '../../lib/iam/authorizationPort.js';

describe('CR1 bounded workforce directory on disposable PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>,reader:WorkforceReviewReader;
  beforeEach(async()=>{
    fixture=await createCr1IamFixture();
    for(const grant of iamWorkforceReviewRuntimeGrants('cr1_iam_runtime'))await fixture.pool.query(grant);
    // Deployment preparation is explicit and outside migration-runner authority.
    await fixture.pool.query('ALTER ROLE cr1_iam_migrator NOLOGIN');
    reader=new WorkforceReviewReader(fixture.runtime,'LOCAL');
  },30000);
  afterEach(async()=>{await fixture?.close();});
  const read=()=>reader.read(fixture.principals.maker,{});

  it('reads exact organization membership and environment grants with a committed read receipt',async()=>{
    const result=await read();
    expect(result.members.total).toBe(3);expect(result.grants.total).toBe(2);
    expect(result.grants.items.every(grant=>grant.environment==='LOCAL')).toBe(true);
    expect(result.members.items.map(member=>member.accountId).sort()).toEqual([90,91,92]);
    expect(result.formalReviewAccepted).toBe(false);
    const event=(await fixture.pool.query('SELECT event_type,evidence FROM internal_iam_events WHERE id=$1',[result.receiptId])).rows[0];
    expect(event).toMatchObject({event_type:'AUTHORIZED_COMMAND',evidence:{permission:'workforce.member.read',environment:'LOCAL'}});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_access_reviews')).rows[0].count)).toBe(0);
    const serialized=JSON.stringify(result);
    for(const forbidden of ['@example.test','token_hash','session','grant_hash','change_reason','accepted_invitation_id'])expect(serialized).not.toContain(forbidden);
  });
  it('requires a NOLOGIN non-bypass owner, exact function body and no PUBLIC execute',async()=>{
    const client=await fixture.runtime.connect();
    try{
      expect(await verifyIamWorkforceReviewCatalog(client)).toEqual({ready:true,functionSafe:true,sourceSafe:true});
      await fixture.pool.query('ALTER ROLE cr1_iam_migrator LOGIN');
      expect((await verifyIamWorkforceReviewCatalog(client)).ready).toBe(false);
      await expect(read()).rejects.toMatchObject({code:'REVIEW_UNAVAILABLE'});
      await fixture.pool.query('ALTER ROLE cr1_iam_migrator NOLOGIN');
      await fixture.pool.query('GRANT EXECUTE ON FUNCTION internal_iam_project_workforce_review(uuid,text,uuid,uuid,uuid,int) TO PUBLIC');
      expect((await verifyIamWorkforceReviewCatalog(client)).ready).toBe(false);
      await fixture.pool.query('REVOKE EXECUTE ON FUNCTION internal_iam_project_workforce_review(uuid,text,uuid,uuid,uuid,int) FROM PUBLIC');
      const definition=(await fixture.pool.query<{definition:string}>("SELECT pg_get_functiondef('internal_iam_project_workforce_review(uuid,text,uuid,uuid,uuid,int)'::regprocedure) AS definition")).rows[0].definition;
      await fixture.pool.query(definition.replace('RETURN result;','RETURN result || jsonb_build_object(\'unexpectedSecret\',\'must-not-escape\');'));
      expect((await verifyIamWorkforceReviewCatalog(client)).ready).toBe(false);
      await expect(read()).rejects.toMatchObject({code:'REVIEW_UNAVAILABLE'});
    }finally{client.release();}
  });
  it('denies consumers, legacy admin accounts, ordinary staff and injected scope',async()=>{
    const account=parsePrincipalContext({actorKind:'ACCOUNT',accountId:90,assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'legacy-admin',operationId:'legacy-admin'});
    await expect(reader.read(account,{})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await expect(reader.read(fixture.principals.outsider,{})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    for(const payload of [{organizationId:randomUUID()},{permission:'audit.read'},{environment:'PRODUCTION'},{limit:51}])
      await expect(reader.read(fixture.principals.maker,payload)).rejects.toMatchObject({code:'INPUT_INVALID'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_iam_events')).rows[0].count)).toBe(0);
  });
  it('rejects revoked, expired and mismatched session authority before projection',async()=>{
    await expect(reader.read({...fixture.principals.maker,accountId:91},{})).rejects.toMatchObject({code:'SESSION_REVOKED'});
    await fixture.pool.query(`UPDATE internal_staff_sessions SET status='REVOKED',revoked_by=90,revoked_at=clock_timestamp(),revoke_reason='Revoked by isolated review test.' WHERE id=$1`,[fixture.principals.maker.sessionId]);
    await expect(read()).rejects.toMatchObject({code:'SESSION_REVOKED'});
  });
  it('denies a revoked member-read grant and does not reuse previous read evidence',async()=>{
    await read();
    await fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
      SELECT id,90,'Withdraw local review authority after one read.' FROM internal_membership_grants WHERE membership_id=$1 AND environment='LOCAL'`,[fixture.principals.maker.membershipId]);
    await expect(read()).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  });
  it('does not expose another organization or silently use a production grant',async()=>{
    const org=randomUUID();
    await fixture.pool.query(`INSERT INTO internal_organizations(id,organization_key,display_name) VALUES($1,'other-org','Other organization');
      `,[org]);
    await fixture.pool.query(`INSERT INTO internal_organization_memberships(organization_id,user_id,status,accepted_at,changed_by,change_reason)
      VALUES($1,92,'ACTIVE',clock_timestamp(),90,'Other organization evidence must remain isolated.')`,[org]);
    expect((await read()).members.total).toBe(3);
    await expect(reader.read({...fixture.principals.maker,organizationId:org},{})).rejects.toMatchObject({code:'SESSION_REVOKED'});
    const production=new WorkforceReviewReader(fixture.runtime,'PRODUCTION');
    await expect(production.read(fixture.principals.maker,{})).rejects.toMatchObject({code:'SESSION_REVOKED'});
    await expect(production.read(await fixture.environmentSession(fixture.principals.maker,'PRODUCTION'),{})).rejects.toMatchObject({code:'IAM_NOT_READY'});
  });
  it('makes independent keyset bounds/counts explicit without duplicated members',async()=>{
    const first=await reader.read(fixture.principals.maker,{limit:1});
    expect(first.members.items).toHaveLength(1);expect(first.members.total).toBe(3);expect(first.members.nextCursor).not.toBeNull();
    const second=await reader.read(fixture.principals.maker,{limit:1,memberAfter:first.members.nextCursor!});
    const third=await reader.read(fixture.principals.maker,{limit:1,memberAfter:second.members.nextCursor!});
    expect(new Set([...first.members.items,...second.members.items,...third.members.items].map(row=>row.id)).size).toBe(3);
    expect(third.members.nextCursor).toBeNull();expect(second.grants.items).toEqual(first.grants.items);
    const grants=await reader.read(fixture.principals.maker,{limit:1,grantAfter:first.grants.nextCursor!});
    expect(grants.grants.items[0].id).not.toBe(first.grants.items[0].id);
  });
  it('shows scope, cap, role release and revoked status without broadening direct table RLS',async()=>{
    const current=(await read()).grants.items.find(grant=>grant.membershipId===fixture.principals.checker.membershipId)!;
    await fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason) VALUES($1,90,'A revoked grant remains explicit review evidence.')`,[current.id]);
    const result=await read();expect(result.grants.items.find(grant=>grant.id===current.id)).toMatchObject({state:'REVOKED',scope:{type:'ORGANIZATION',id:fixture.organizationId},role:{name:'Platform Owner',version:1}});
    expect(result.protectedActions.find(action=>action.permission==='workforce.grant')).toMatchObject({stepUpRequired:true,independentApprovalRequired:true,execution:'SEPARATE_PROTECTED_COMMAND'});
    expect((await fixture.runtime.query('SELECT * FROM internal_membership_grants')).rows).toHaveLength(0);
    await expect(fixture.runtime.query("UPDATE internal_membership_grants SET scope_id='x'")).rejects.toThrow('permission denied');
    await expect(fixture.runtime.query('SELECT internal_iam_project_workforce_review($1,$2,NULL,NULL,NULL,25)',[fixture.organizationId,'LOCAL'])).rejects.toThrow('IAM_REVIEW_PERMISSION_DENIED');
  });
  it('distinguishes expired, future and membership-inactive grants at the observation time',async()=>{
    await fixture.pool.query("INSERT INTO users VALUES(93,'private-member@example.test','user')");
    const member=randomUUID();
    await fixture.pool.query(`INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,expires_at,changed_by,change_reason)
      VALUES($1,$2,93,'ACTIVE',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',90,'Expired membership remains review evidence only.')`,[member,fixture.organizationId]);
    const role=(await read()).grants.items[0].role.versionId;
    for(const [index,from,until] of [[0,"-interval '2 days'","-interval '1 day'"],[1,"+interval '1 day'","+interval '2 days'"],[2,"-interval '1 day'","+interval '1 day'"]] as const){
      await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason,valid_from,valid_until)
        VALUES($1,$2,$3,'CAMPAIGN',$4,'LOCAL',$5,90,'Bounded historical scope for directory evidence.',clock_timestamp()${from},clock_timestamp()${until})`,
      [fixture.organizationId,member,role,String(index+10),String(index+1).repeat(64)]);
    }
    const result=await read();expect(result.members.items.find(row=>row.id===member)?.effectiveState).toBe('EXPIRED');
    expect(result.grants.items.filter(row=>row.membershipId===member).map(row=>row.state).sort()).toEqual(['EXPIRED','MEMBERSHIP_INACTIVE','SCHEDULED']);
  });
  it('projects a genuinely issued pending invitation without its address, token or grant bundle',async()=>{
    for(const grant of iamInvitationRuntimeGrants('cr1_iam_runtime'))await fixture.pool.query(grant);
    await fixture.pool.query('GRANT SELECT(id,email),UPDATE(id) ON users TO cr1_iam_migrator');
    const service=new WorkforceInvitations(fixture.runtime,{environment:'LOCAL',identityWriter:fixture.runtime,identityEvidence:{verify:async()=>null}});
    const role=(await fixture.pool.query(`SELECT v.id,v.config_hash,jsonb_agg(p.permission_code ORDER BY p.permission_code) AS permissions
      FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id JOIN internal_role_permissions p ON p.role_version_id=v.id
      WHERE d.role_key='creative_policy_reviewer' GROUP BY v.id,v.config_hash`)).rows[0];
    const context:PermissionCheckInput={principal:fixture.principals.maker,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'workforce.grant',
      resource:{target:{type:'WORKFORCE',id:fixture.organizationId},ancestors:[]},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}};
    const command=issueInvitationCommandSchema.parse({invitationId:randomUUID(),email:'private-invitee@example.test',environment:'LOCAL',expiresAt:new Date(Date.now()+3600000).toISOString(),
      grants:[{roleVersionId:role.id,roleHash:role.config_hash,permissionCodes:role.permissions,scope:{type:'ORGANIZATION',id:fixture.organizationId},environment:'LOCAL',provider:null,maxAmountMinor:null,validUntil:null}]});
    const input={context,idempotencyKey:`invite:${command.invitationId}`,reason:'Review a legitimate pending invitation without leaking contact.',command};
    const hash=service.issueActions.fingerprint(input);context.evidence.stepUpReceiptId=await fixture.issueFactor(fixture.principals.maker,hash);
    const approval=await service.issueActions.request(input);
    await service.issueActions.approve({principal:fixture.principals.checker,organizationId:fixture.organizationId,authorizationId:approval.receipt.id,expectedCommandHash:hash,
      reason:'Independent approval of bounded invitation scope.',stepUpReceiptId:await fixture.issueFactor(fixture.principals.checker,hash)});
    context.evidence.actionAuthorizationId=approval.receipt.id;const issued=await service.issue(input);
    const result=await read();expect(result.invitations.total).toBe(1);expect(result.invitations.items[0]).toMatchObject({id:command.invitationId,status:'PENDING'});
    expect(JSON.stringify(result)).not.toContain(command.email);expect(JSON.stringify(result)).not.toContain(issued.invitationToken!);
    expect(JSON.stringify(result)).not.toContain('grant_bundle');
  });
});
