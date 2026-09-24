import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';
import {createGoogleWorkforceFixture,workforceAudience} from './helpers/googleWorkforceFixture.js';
import {StaffSessionIssuer,workforceIdentityPolicyConfigSchema} from '../../lib/iam/staffSessionIssuer.js';
import {staffSessionIssuerGrants,verifyStaffSessionIssuerCatalog} from '../../server/deployment/iamSessionIssuerReadiness.js';
import {PrivilegedActions} from '../../lib/iam/privilegedActions.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import type {PermissionCheckInput} from '../../lib/iam/authorizationPort.js';

describe('CR1 isolated workforce session issuer on real PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>;let pool:pg.Pool;let service:StaffSessionIssuer;
  const google=createGoogleWorkforceFixture();const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  const config=workforceIdentityPolicyConfigSchema.parse({googleClientId:workforceAudience,challengeTtlSeconds:120,idTokenMaxAgeSeconds:300,
    allowGmail:true,allowedHostedDomains:['encho.test'],maximumActiveSessions:3,maximumStartsPerMinute:20});
  const options=(environment='LOCAL')=>({environment,organizationId:fixture.organizationId,googleClientId:workforceAudience});
  beforeEach(async()=>{
    fixture=await createCr1IamFixture();
    await fixture.pool.query(`ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
      UPDATE users SET email='maker@gmail.com',google_id='google-staff-90' WHERE id=90;
      CREATE ROLE cr1_session_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT SELECT(id,email,google_id),UPDATE(id) ON users TO cr1_iam_migrator;`);
    for(const statement of staffSessionIssuerGrants('cr1_session_issuer'))await fixture.pool.query(statement);
    pool=new pg.Pool({...fixture.pool.options,user:'cr1_session_issuer'});
    service=new StaffSessionIssuer(pool,google.identity,options());
    const policy=(await fixture.pool.query(`INSERT INTO internal_workforce_identity_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason)
      VALUES($1,'LOCAL',1,$2::jsonb,repeat('0',64),'PENDING_FOUNDER_OPERATIONAL_APPROVAL',90,'Disposable local fixture identity policy, not production acceptance.') RETURNING id`,[fixture.organizationId,JSON.stringify(config)])).rows[0];
    await fixture.pool.query("INSERT INTO internal_workforce_current_identity_policy VALUES($1,'LOCAL',$2)",[fixture.organizationId,policy.id]);
  },30000);
  afterEach(async()=>{await pool?.end();await fixture?.close();});
  const completion=(start:Awaited<ReturnType<StaffSessionIssuer['begin']>>,claims:Record<string,unknown>={})=>({challengeId:start.public.challengeId,browserVerifier:start.private.browserVerifier,
    credential:google.credential(start.public.nonce,claims),correlationId:'staff-login-local-test'});
  const login=async()=>service.complete(completion(await service.begin()));

  it('issues a separately scoped AAL1 credential after verified identity, storing hashes and truthful evidence',async()=>{
    const start=await service.begin();const input=completion(start,{amr:['mfa']});const issued=await service.complete(input);
    expect(issued.private.credential).toMatch(/^wfs_[A-Za-z0-9_-]{43}$/);expect(issued.public).toMatchObject({accountId:90,assuranceLevel:'AAL1',membershipId:fixture.principals.maker.membershipId});
    const row=(await fixture.pool.query('SELECT * FROM internal_staff_sessions WHERE id=$1',[issued.public.sessionId])).rows[0];
    expect(row.token_hash).toBe(digest(issued.private.credential));expect(row.environment).toBe('LOCAL');
    const receipt=(await fixture.pool.query('SELECT * FROM internal_workforce_login_receipts WHERE session_id=$1',[issued.public.sessionId])).rows[0];
    expect(receipt.provider_authenticated_at).toBeNull();expect(receipt.token_hash).toBe(digest(input.credential));
    const challenge=(await fixture.pool.query('SELECT * FROM internal_workforce_login_challenges WHERE id=$1',[start.public.challengeId])).rows[0];
    expect(challenge).toMatchObject({status:'CONSUMED',nonce_hash:digest(start.public.nonce),browser_hash:digest(start.private.browserVerifier)});
    const serialized=JSON.stringify([row,receipt,challenge]);for(const secret of [issued.private.credential,start.public.nonce,start.private.browserVerifier,input.credential])expect(serialized).not.toContain(secret);
    const authenticated=await fixture.runtime.query('SELECT * FROM internal_iam_authenticate_session($1)',[digest(issued.private.credential)]);
    expect(authenticated.rows[0]).toMatchObject({account_id:90,assurance_level:'AAL1'});
  });
  it('consumes browser-bound challenges once and cannot upgrade a replay into a second session',async()=>{
    const start=await service.begin();const input=completion(start);
    await expect(service.complete({...input,browserVerifier:google.nonce()})).rejects.toMatchObject({code:'LOGIN_CHALLENGE_INVALID'});
    await service.complete(input);await expect(service.complete(input)).rejects.toMatchObject({code:'LOGIN_CHALLENGE_INVALID'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_login_receipts')).rows[0].count)).toBe(1);
  });
  it('serializes concurrent completions and grants exactly one credential',async()=>{
    const input=completion(await service.begin());const results=await Promise.allSettled([service.complete(input),service.complete(input)]);
    expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1);
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_login_receipts')).rows[0].count)).toBe(1);
  });
  it('requires exact prelinked subject and current email, without automatic account creation or linking',async()=>{
    const input=completion(await service.begin());await fixture.pool.query("UPDATE users SET google_id=NULL WHERE id=90");
    await expect(service.complete(input)).rejects.toMatchObject({code:'MEMBERSHIP_UNAVAILABLE'});
    await fixture.pool.query("UPDATE users SET google_id='google-staff-90',email='changed@gmail.com' WHERE id=90");
    await expect(service.complete(input)).rejects.toMatchObject({code:'MEMBERSHIP_UNAVAILABLE'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM users')).rows[0].count)).toBe(3);
  });
  it('rejects ambiguous or missing account email evidence even if the legacy account catalog drifts',async()=>{
    const input=completion(await service.begin());
    await fixture.pool.query("ALTER TABLE users ALTER COLUMN email DROP NOT NULL; UPDATE users SET email=NULL WHERE id=90");
    await expect(service.complete(input)).rejects.toMatchObject({code:'MEMBERSHIP_UNAVAILABLE'});
    await fixture.pool.query("UPDATE users SET email='maker@gmail.com' WHERE id=90; ALTER TABLE users DROP CONSTRAINT users_google_id_key; UPDATE users SET google_id='google-staff-90' WHERE id=91");
    await expect(service.complete(input)).rejects.toMatchObject({code:'MEMBERSHIP_UNAVAILABLE'});
  });
  it('rechecks membership after network verification and cannot issue against suspended staff',async()=>{
    const boundary=new StaffSessionIssuer(pool,{verify:async input=>{
      const proof=await google.identity.verify(input);
      await fixture.pool.query("UPDATE internal_organization_memberships SET status='SUSPENDED',suspended_at=clock_timestamp(),version=version+1,changed_by=90,change_reason='Local adversarial suspension during identity verification.' WHERE id=$1",[fixture.principals.maker.membershipId]);
      return proof;
    }},options());
    await expect(boundary.complete(completion(await boundary.begin()))).rejects.toMatchObject({code:'MEMBERSHIP_UNAVAILABLE'});
  });
  it('invalidates existing challenges when the identity policy changes',async()=>{
    const input=completion(await service.begin());
    const policy=(await fixture.pool.query(`INSERT INTO internal_workforce_identity_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason)
      SELECT organization_id,environment,2,config,repeat('0',64),approval_status,90,'Explicit local identity policy release changes the nonce binding.' FROM internal_workforce_identity_policies RETURNING id`)).rows[0];
    await fixture.pool.query('UPDATE internal_workforce_current_identity_policy SET policy_id=$1',[policy.id]);
    await expect(service.complete(input)).rejects.toMatchObject({code:'LOGIN_CHALLENGE_INVALID'});
  });
  it('denies production without an explicitly approved identity and IAM policy',async()=>{
    const prod=new StaffSessionIssuer(pool,google.identity,options('PRODUCTION'));
    await expect(prod.begin()).rejects.toMatchObject({code:'LOGIN_NOT_CONFIGURED'});
    const policy=(await fixture.pool.query(`INSERT INTO internal_workforce_identity_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason)
      VALUES($1,'PRODUCTION',1,$2,repeat('0',64),'PENDING_FOUNDER_OPERATIONAL_APPROVAL',90,'Unapproved production fixture intentionally cannot establish authority.') RETURNING id`,[fixture.organizationId,JSON.stringify(config)])).rows[0];
    await fixture.pool.query("INSERT INTO internal_workforce_current_identity_policy VALUES($1,'PRODUCTION',$2)",[fixture.organizationId,policy.id]);
    await expect(prod.begin()).rejects.toMatchObject({code:'LOGIN_NOT_CONFIGURED'});
  });
  it('enforces exact audience configuration and does not accept consumer JWTs',async()=>{
    const other=new StaffSessionIssuer(pool,google.identity,{...options(),googleClientId:'consumer-client.apps.googleusercontent.com'});
    await expect(other.begin()).rejects.toMatchObject({code:'LOGIN_NOT_CONFIGURED'});
    await expect(service.complete({...completion(await service.begin()),credential:'consumer-jwt-is-not-workforce-identity'.repeat(4)})).rejects.toMatchObject({code:'IDENTITY_INVALID'});
  });
  it('denies shared runtime, migration owner and accidental column-level issuer privileges',async()=>{
    await expect(new StaffSessionIssuer(fixture.runtime,google.identity,options()).begin()).rejects.toMatchObject({code:'ISSUER_UNAVAILABLE'});
    await expect(new StaffSessionIssuer(fixture.migrator,google.identity,options()).begin()).rejects.toMatchObject({code:'ISSUER_UNAVAILABLE'});
    const client=await pool.connect();try {
      expect(await verifyStaffSessionIssuerCatalog(client)).toMatchObject({ready:true});
      await fixture.pool.query('GRANT SELECT(email) ON users TO cr1_session_issuer');
      expect(await verifyStaffSessionIssuerCatalog(client)).toMatchObject({ready:false,roleSafe:false});
      await expect(service.begin()).rejects.toMatchObject({code:'ISSUER_UNAVAILABLE'});
    } finally {client.release();}
  });
  it('caps active sessions and rejects unapproved hosted domains',async()=>{
    await login();await login();await expect(login()).rejects.toMatchObject({code:'SESSION_LIMIT_REACHED'});
    const start=await service.begin();
    await expect(service.complete(completion(start,{email:'staff@other.test',hd:'other.test'}))).rejects.toMatchObject({code:'IDENTITY_INVALID'});
  });
  it('logout revokes only the exact session and is idempotent without requiring current policy approval',async()=>{
    const issued=await login();const original=fixture.principals.maker.sessionId;
    const principal=parsePrincipalContext({...fixture.principals.maker,sessionId:issued.public.sessionId,assuranceLevel:'AAL1',authenticatedAt:issued.public.authenticatedAt});
    const actions=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',permission:'workforce.invite',commandKind:'local.logout.fixture',commandSchema:z.object({operation:z.literal('INVITE')}).strict()});
    const context:PermissionCheckInput={principal,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'workforce.invite',
      resource:{target:{type:'WORKFORCE',id:fixture.organizationId},ancestors:[]},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}};
    const input={context,idempotencyKey:'local-session-logout-action',reason:'Local proof of revocation of an unconsumed privileged action.',command:{operation:'INVITE' as const}};
    const factor=await fixture.issueFactor(principal,actions.fingerprint(input));input.context.evidence.stepUpReceiptId=factor;
    const action=await actions.request(input);expect(action.receipt.status).toBe('APPROVED');
    await service.logout({credential:issued.private.credential,correlationId:'local-staff-logout'});
    expect(await service.logout({credential:issued.private.credential,correlationId:'local-staff-logout'})).toEqual({outcome:'LOGGED_OUT'});
    expect((await fixture.pool.query('SELECT status FROM internal_staff_sessions WHERE id=$1',[issued.public.sessionId])).rows[0].status).toBe('REVOKED');
    expect((await fixture.pool.query('SELECT status FROM internal_staff_sessions WHERE id=$1',[original])).rows[0].status).toBe('ACTIVE');
    expect((await fixture.runtime.query('SELECT * FROM internal_iam_authenticate_session($1)',[digest(issued.private.credential)])).rowCount).toBe(0);
    expect(Number((await fixture.pool.query("SELECT count(*) FROM internal_iam_events WHERE event_type='WORKFORCE_SESSION_LOGGED_OUT'")).rows[0].count)).toBe(1);
    expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[factor])).rows[0].status).toBe('EXPIRED');
    expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[action.receipt.id])).rows[0].status).toBe('CANCELLED');
  });

  it('rejects an expired durable challenge before identity verification',async()=>{
    const nonce=google.nonce(),browserVerifier=google.nonce(),challengeId=randomUUID();
    await fixture.pool.query(`INSERT INTO internal_workforce_login_challenges(id,organization_id,environment,policy_id,nonce_hash,browser_hash,created_at,expires_at)
      SELECT $1,organization_id,'LOCAL',id,$2,$3,clock_timestamp()-interval '121 seconds',clock_timestamp()-interval '1 second' FROM internal_workforce_identity_policies`,[challengeId,digest(nonce),digest(browserVerifier)]);
    await expect(service.complete({challengeId,browserVerifier,credential:google.credential(nonce),correlationId:'local-expired-challenge'})).rejects.toMatchObject({code:'LOGIN_CHALLENGE_INVALID'});
  });
  it('enforces a durable organization login-start quota',async()=>{
    await Promise.all(Array.from({length:config.maximumStartsPerMinute},()=>service.begin()));
    await expect(service.begin()).rejects.toMatchObject({code:'LOGIN_RATE_LIMITED'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_login_challenges')).rows[0].count)).toBe(config.maximumStartsPerMinute);
  });
  it('reports lost commit acknowledgement as unknown and never mints a replacement on replay',async()=>{
    const start=await service.begin();const input=completion(start);let fail=true;
    const transport=new Proxy(pool,{get(target,key){
      if(key==='connect')return async()=>{
        const client=await target.connect();let issued=false;
        return new Proxy(client,{get(connection,property){
          if(property==='query')return async(...args:unknown[])=>{
            const result=await Reflect.apply(connection.query,connection,args);
            if(String(args[0]).startsWith('SELECT internal_iam_issue_staff_session('))issued=true;
            if(args[0]==='COMMIT'&&issued&&fail){fail=false;throw new Error('injected lost acknowledgement');}return result;
          };
          const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;
        }});
      };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    await expect(new StaffSessionIssuer(transport,google.identity,options()).complete(input)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
    await expect(service.complete(input)).rejects.toMatchObject({code:'LOGIN_CHALLENGE_INVALID'});
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_login_receipts')).rows[0].count)).toBe(1);
  });
  it('rolls back nonce consumption and session creation if immutable audit cannot be persisted',async()=>{
    const input=completion(await service.begin());
    await fixture.pool.query(`CREATE FUNCTION fail_session_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='WORKFORCE_SESSION_ISSUED' THEN RAISE EXCEPTION 'local injected audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_session_audit BEFORE INSERT ON internal_iam_events FOR EACH ROW EXECUTE FUNCTION fail_session_audit();`);
    await expect(service.complete(input)).rejects.toMatchObject({code:'ISSUER_UNAVAILABLE'});
    expect((await fixture.pool.query('SELECT status FROM internal_workforce_login_challenges WHERE id=$1',[input.challengeId])).rows[0].status).toBe('PENDING');
    expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_login_receipts')).rows[0].count)).toBe(0);
  });
});
