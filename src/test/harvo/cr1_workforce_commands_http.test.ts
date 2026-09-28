import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import express from 'express';
import request from 'supertest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';
import {CanonicalWorkforceCommands,type WorkforceCommandRequest} from '../../server/operations/workforceCommands.js';
import {createWorkforceCommandRouter} from '../../server/operations/workforceCommandRouter.js';
import {createAdminWorkforceRouter} from '../../server/admin/workforceRouter.js';
import {createHttpExecutionContextMiddleware} from '../../server/observability/httpExecutionContext.js';
import {iamLifecycleRuntimeGrants} from '../../server/deployment/iamLifecycleReadiness.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';

const origin='https://ops.encho.test';
describe('R1-02 mounted canonical workforce HTTP on restricted PostgreSQL LOGIN',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;
  let app:express.Express;let target:string;let credentials:Record<'maker'|'checker'|'outsider',string>;
  const mount=(organizationId:string,environment:'LOCAL'|'PRODUCTION'='LOCAL')=>{
    const api=express();api.use(createHttpExecutionContextMiddleware());
    api.use('/commands',createWorkforceCommandRouter(new CanonicalWorkforceCommands(fixture.runtime,{organizationId,environment}),origin));
    api.use('/legacy',createAdminWorkforceRouter(fixture.runtime));return api;
  };
  beforeEach(async()=>{
    fixture=await createCr1IamFixture();
    for(const sql of iamLifecycleRuntimeGrants('cr1_iam_runtime'))await fixture.pool.query(sql);
    credentials={maker:'',checker:'',outsider:''};
    for(const name of ['maker','checker','outsider'] as const){
      credentials[name]='wfs_'+randomBytes(32).toString('base64url');
      const sessionId=randomUUID();
      await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at)
        VALUES($1,$2,$3,$4,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours')`,
        [sessionId,fixture.organizationId,fixture.principals[name].membershipId,createHash('sha256').update(credentials[name]).digest('hex')]);
      fixture.principals[name]=parsePrincipalContext({...fixture.principals[name],sessionId});
    }
    target=randomUUID();
    await fixture.pool.query("INSERT INTO users VALUES(500,'target@example.test','user')");
    await fixture.pool.query(`INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,changed_by,change_reason)
      VALUES($1,$2,500,'ACTIVE',clock_timestamp(),90,'Disposable non-owner lifecycle target.')`,[target,fixture.organizationId]);
    app=mount(fixture.organizationId);
  },30_000);
  afterEach(async()=>{await fixture?.close();});
  const body=(authority:'STANDARD'|'PROTECTED'='STANDARD')=>({authority,reason:'Revoke exact reviewed workforce access for this local test.',
    idempotencyKey:randomUUID(),command:{targetMembershipId:target,expectedVersion:1,operation:'SUSPEND' as const}});
  const send=(input:string|object,name:'maker'|'checker'='maker',api=app)=>request(api).post('/commands')
    .set('Cookie',`__Host-encho_workforce=${credentials[name]}`).set('Origin',origin).set('X-Encho-Workforce-Command','1').send(input);
  const prepare=async(input:ReturnType<typeof body>)=>{
    const response=await send({...input,action:'PREPARE'});expect(response.status,response.text).toBe(200);
    const stepUpReceiptId=await fixture.issueFactor(fixture.principals.maker,response.body.commandHash);
    const requested=await send({...input,action:'REQUEST',stepUpReceiptId});expect(requested.status,requested.text).toBe(200);
    return {stepUpReceiptId,authorizationId:requested.body.receipt.id as string,commandHash:response.body.commandHash as string};
  };

  it('retires legacy reads and mutations without changing memberships or minting owners',async()=>{
    const before=(await fixture.pool.query('SELECT count(*)::int AS count FROM internal_membership_grants')).rows[0].count;
    for(const path of ['/overview','/roster','/authorizations','/audit'])expect((await request(app).get('/legacy'+path)).status).toBe(410);
    for(const path of ['/hire','/members/'+target+'/lifecycle','/emergency-freeze','/audit/verify-chain']){
      const response=await request(app).post('/legacy'+path).send({adminUserId:90,roleKey:'platform_owner'});
      expect(response.status).toBe(410);expect(response.body.code).toBe('LEGACY_WORKFORCE_AUTHORITY_RETIRED');
    }
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_membership_grants')).rows[0].count).toBe(before);
  });
  it('rejects consumer JWT, wrong origin and supplied authority fields before commands',async()=>{
    const input={...body(),action:'PREPARE'};
    expect((await request(app).post('/commands').set('Authorization','Bearer consumer-admin-jwt').send(input)).status).toBe(401);
    expect((await send(input).set('Origin','https://encho.test')).status).toBe(403);
    for(const injected of [{environment:'PRODUCTION'},{organizationId:fixture.organizationId},{principal:fixture.principals.maker}]){
      expect((await send({...input,...injected})).status).toBe(422);
    }
    expect((await send({...input,command:{...input.command,operation:'RESUME'}})).status).toBe(422);
    const oversized=await send({...input,reason:'private'.repeat(5000)});
    expect(oversized.status).toBe(413);expect(oversized.text).not.toContain('private');
  });
  it('executes exact authorized command once with durable receipt and unchanged consumer role',async()=>{
    const input=body();const auth=await prepare(input);
    const first=await send({...input,action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId});
    expect(first.status,first.text).toBe(200);expect(first.body.receipt).toMatchObject({status:'SUSPENDED',version:2});
    const replay=await send({...input,action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId});
    expect(replay.status,replay.text).toBe(200);expect(replay.body.replayed).toBe(true);
    expect((await fixture.pool.query('SELECT status,version FROM internal_organization_memberships WHERE id=$1',[target])).rows[0]).toEqual({status:'SUSPENDED',version:2});
    expect((await fixture.pool.query('SELECT count(*)::int AS count FROM internal_workforce_lifecycle_commands WHERE authorization_id=$1',[auth.authorizationId])).rows[0].count).toBe(1);
    expect((await fixture.pool.query('SELECT role FROM users WHERE id=500')).rows[0].role).toBe('user');
  });
  it('requires distinct checker and canonical factor for protected authority',async()=>{
    const input=body('PROTECTED');const auth=await prepare(input);
    const review={action:'APPROVE',authority:'PROTECTED',authorizationId:auth.authorizationId,expectedCommandHash:auth.commandHash,
      command:input.command,commandReason:input.reason,reason:'Independent personnel authority review of the exact command.',stepUpReceiptId:auth.stepUpReceiptId};
    expect((await send(review)).status).toBe(403);
    const checkerFactor=await fixture.issueFactor(fixture.principals.checker,auth.commandHash);
    expect((await send({...review,command:{...review.command,expectedVersion:2},stepUpReceiptId:checkerFactor},'checker')).status).toBe(409);
    const approved=await send({...review,stepUpReceiptId:checkerFactor},'checker');expect(approved.status,approved.text).toBe(200);
    expect(approved.body.receipt.status).toBe('APPROVED');
    const executed=await send({...input,action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId});
    expect(executed.status,executed.text).toBe(200);
  });
  it('rejects revocation between review and execution and stale membership version',async()=>{
    const input={...body(),command:{...body().command,expectedVersion:2}};const auth=await prepare(input);
    const stale=await send({...input,action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId});
    expect(stale.status,stale.text).toBe(409);expect(stale.body.code).toBe('CAS_CONFLICT');
    await fixture.pool.query("UPDATE internal_staff_sessions SET status='REVOKED',revoked_by=91,revoked_at=clock_timestamp(),revoke_reason='Local revocation regression.' WHERE id=$1",[fixture.principals.maker.sessionId]);
    expect((await send({...input,action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId})).status).toBe(401);
    expect((await fixture.pool.query('SELECT status,version FROM internal_organization_memberships WHERE id=$1',[target])).rows[0]).toEqual({status:'ACTIVE',version:1});
  });
  it('rejects wrong organization/environment and reusing a factor for altered command',async()=>{
    const input=body();const auth=await prepare(input);
    expect((await send({...input,action:'PREPARE'},'maker',mount(randomUUID()))).status).toBe(401);
    expect((await send({...input,action:'PREPARE'},'maker',mount(fixture.organizationId,'PRODUCTION'))).status).toBe(401);
    const changedAuthority=await send({...input,authority:'PROTECTED',action:'EXECUTE',stepUpReceiptId:auth.stepUpReceiptId,authorizationId:auth.authorizationId});
    expect(changedAuthority.status,changedAuthority.text).toBe(403);
    const altered:WorkforceCommandRequest={...input,reason:'A different request cannot reuse verified identity evidence.',idempotencyKey:randomUUID(),action:'REQUEST',stepUpReceiptId:auth.stepUpReceiptId};
    expect((await send(altered)).status).toBe(403);
  });
});
