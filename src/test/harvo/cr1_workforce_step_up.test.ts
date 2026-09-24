import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createCr1IamFixture} from './helpers/cr1IamFixture.js';
import {createGoogleWorkforceFixture,workforceAudience} from './helpers/googleWorkforceFixture.js';
import {createPasskeyFixture} from './helpers/passkeyFixture.js';
import {StaffSessionIssuer} from '../../lib/iam/staffSessionIssuer.js';
import {staffSessionIssuerGrants} from '../../server/deployment/iamSessionIssuerReadiness.js';
import {WorkforceStepUp} from '../../lib/iam/factors/workforceStepUp.js';
import {PasskeyAssertionVerifier} from '../../lib/iam/factors/passkeyAssertion.js';
import {workforceFactorGrants,verifyWorkforceFactorCatalog} from '../../server/deployment/iamFactorReadiness.js';
import {PrivilegedActions} from '../../lib/iam/privilegedActions.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {permissionCheckInputSchema} from '../../lib/iam/authorizationPort.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';

describe('CR1 isolated action-bound passkey proof chain on real PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createCr1IamFixture>>,issuerPool:pg.Pool,factorPool:pg.Pool,service:WorkforceStepUp;
 let issued:Awaited<ReturnType<StaffSessionIssuer['complete']>>,key:ReturnType<typeof createPasskeyFixture>;
 const google=createGoogleWorkforceFixture();
 const identityConfig={googleClientId:workforceAudience,challengeTtlSeconds:120,idTokenMaxAgeSeconds:300,allowGmail:true,allowedHostedDomains:[],maximumActiveSessions:3,maximumStartsPerMinute:20};
 beforeEach(async()=>{
  fixture=await createCr1IamFixture();key=createPasskeyFixture();
  await fixture.pool.query(`ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;UPDATE users SET email='maker@gmail.com',google_id='google-staff-90' WHERE id=90;
   CREATE ROLE cr1_login_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   CREATE ROLE cr1_factor_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   GRANT SELECT(id,email,google_id),UPDATE(id) ON users TO cr1_iam_migrator;ALTER ROLE cr1_iam_migrator NOLOGIN;`);
  for(const grant of staffSessionIssuerGrants('cr1_login_writer'))await fixture.pool.query(grant);
  for(const grant of workforceFactorGrants('cr1_factor_writer'))await fixture.pool.query(grant);
  issuerPool=new pg.Pool({...fixture.pool.options,user:'cr1_login_writer'});factorPool=new pg.Pool({...fixture.pool.options,user:'cr1_factor_writer'});
  const ip=(await fixture.pool.query(`INSERT INTO internal_workforce_identity_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason) VALUES($1,'LOCAL',1,$2,repeat('0',64),'PENDING_FOUNDER_OPERATIONAL_APPROVAL',90,'Disposable local identity policy for factor integration.') RETURNING id`,[fixture.organizationId,JSON.stringify(identityConfig)])).rows[0];
  await fixture.pool.query("INSERT INTO internal_workforce_current_identity_policy VALUES($1,'LOCAL',$2)",[fixture.organizationId,ip.id]);
  const issuer=new StaffSessionIssuer(issuerPool,google.identity,{environment:'LOCAL',organizationId:fixture.organizationId,googleClientId:workforceAudience});
  const start=await issuer.begin();issued=await issuer.complete({challengeId:start.public.challengeId,browserVerifier:start.private.browserVerifier,credential:google.credential(start.public.nonce),correlationId:'local-factor-login'});
  const ir=(await fixture.pool.query('SELECT * FROM internal_workforce_login_receipts WHERE session_id=$1',[issued.public.sessionId])).rows[0];
  const fp=(await fixture.pool.query(`INSERT INTO internal_workforce_factor_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason) VALUES($1,'LOCAL',1,$2,repeat('0',64),'PENDING_FOUNDER_OPERATIONAL_APPROVAL',90,'Disposable local factor policy; no production enrollment approved.') RETURNING id`,[fixture.organizationId,JSON.stringify({rpId:key.policy.rpId,origin:key.policy.origin,allowSyncedPasskeys:false,challengeTtlSeconds:120,maximumStartsPerMinute:10})])).rows[0];
  await fixture.pool.query("INSERT INTO internal_workforce_current_factor_policy VALUES($1,'LOCAL',$2)",[fixture.organizationId,fp.id]);
  // Only the disposable test administrator stands in for a future independently
  // reviewed enrollment adapter. Application roles have NO enrollment INSERT.
  const credential={...key.credential,organizationId:fixture.organizationId,membershipId:issued.public.membershipId,identityReceiptHash:ir.token_hash};
  await fixture.pool.query(`INSERT INTO internal_workforce_passkey_enrollments(id,organization_id,membership_id,environment,credential,credential_id,identity_receipt_id,registration_receipt_hash,reviewed_by,registered_at,reviewed_at,reason)
   VALUES($1,$2,$3,'LOCAL',$4,$5,$6,$7,91,statement_timestamp(),statement_timestamp(),'Disposable signed authenticator fixture, not real enrollment authority.')`,[key.credential.recordId,fixture.organizationId,issued.public.membershipId,JSON.stringify(credential),key.credential.id,ir.challenge_id,key.credential.enrollmentReceiptHash]);
  await fixture.pool.query('INSERT INTO internal_workforce_passkey_state(enrollment_id,counter) VALUES($1,4)',[key.credential.recordId]);
  service=new WorkforceStepUp(factorPool,'LOCAL');
 },30000);
 afterEach(async()=>{await factorPool?.end();await issuerPool?.end();await fixture?.close();});
 const begin=(actionHash='d'.repeat(64))=>service.begin({credential:issued.private.credential,enrollmentId:key.credential.recordId,actionHash,correlationId:'local-factor-start'});
 const completion=(start:Awaited<ReturnType<WorkforceStepUp['begin']>>,counter=5)=>({credential:issued.private.credential,challengeId:start.challengeId,response:key.assertion({client:{challenge:start.publicKey.challenge},counter}),correlationId:'local-factor-complete'});
 const action=()=>{
  const principal=parsePrincipalContext({...fixture.principals.maker,sessionId:issued.public.sessionId,assuranceLevel:'AAL1',authenticatedAt:issued.public.authenticatedAt});
  const actions=new PrivilegedActions(fixture.runtime,{environment:'LOCAL',permission:'workforce.invite',commandKind:'local.factor.fixture',commandSchema:z.object({operation:z.literal('INVITE')}).strict()});
  const input={context:permissionCheckInputSchema.parse({principal,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:fixture.organizationId},permission:'workforce.invite',resource:{target:{type:'WORKFORCE',id:fixture.organizationId}},conditions:{environment:'LOCAL',requestedAt:new Date().toISOString()},evidence:{}}),
   command:{operation:'INVITE' as const},idempotencyKey:'local-passkey-action',reason:'Verify independent exact-action factor before privileged execution.'};
  return {actions,input};
 };
 it('uses real Google AAL1 plus independent ES256 proof to authorize one exact command',async()=>{
  const {actions,input}=action();const intent=actions.fingerprint(input);const start=await begin(intent);const proof=await service.complete(completion(start));
  expect(proof).toMatchObject({challengeId:start.challengeId,actionHash:intent,sessionId:issued.public.sessionId,assuranceLevel:'PHISHING_RESISTANT'});
  input.context.evidence.stepUpReceiptId=proof.challengeId;const accepted=await actions.request(input);expect(accepted.receipt.status).toBe('APPROVED');
  const authority=new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL');let writes=0;
  await authority.runAuthorized({...input.context,conditions:{...input.context.conditions,commandHash:intent},evidence:{stepUpReceiptId:proof.challengeId,actionAuthorizationId:accepted.receipt.id}},async()=>{writes++;});
  expect(writes).toBe(1);expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[proof.challengeId])).rows[0].status).toBe('CONSUMED');
  expect((await fixture.pool.query('SELECT assurance_level FROM internal_staff_sessions WHERE id=$1',[issued.public.sessionId])).rows[0].assurance_level).toBe('AAL1');
  const serialized=JSON.stringify((await fixture.pool.query('SELECT * FROM internal_workforce_passkey_receipts')).rows);
  expect(serialized).not.toContain(completion(start).response.response.signature);expect(serialized).not.toContain(start.publicKey.challenge);
 });
 it('grants only narrow EXECUTE and retains disabled enrollment/import authority',async()=>{
  const client=await factorPool.connect();try{expect(await verifyWorkforceFactorCatalog(client)).toMatchObject({ready:true});}finally{client.release();}
  await expect(new WorkforceStepUp(fixture.runtime,'LOCAL').begin({credential:issued.private.credential,enrollmentId:key.credential.recordId,actionHash:'d'.repeat(64),correlationId:'local-denied'})).rejects.toMatchObject({code:'FACTOR_STORE_UNAVAILABLE'});
  await expect(factorPool.query('SELECT credential FROM internal_workforce_passkey_enrollments')).rejects.toMatchObject({code:'42501'});
  await fixture.pool.query('GRANT SELECT(credential) ON internal_workforce_passkey_enrollments TO cr1_factor_writer');
  await expect(begin()).rejects.toMatchObject({code:'FACTOR_STORE_UNAVAILABLE'});
 });
 it('consumes one challenge once under concurrent completion and updates the counter atomically',async()=>{
  const start=await begin();const results=await Promise.allSettled([service.complete(completion(start)),service.complete(completion(start))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await fixture.pool.query('SELECT counter,version FROM internal_workforce_passkey_state')).rows[0]).toMatchObject({counter:'5',version:2});
  await expect(service.complete(completion(start))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
 });
 it('fences competing ceremonies sharing the same credential counter snapshot',async()=>{
  const first=await begin(),second=await begin('e'.repeat(64));
  const result=await Promise.allSettled([service.complete(completion(first)),service.complete(completion(second))]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_passkey_receipts')).rows[0].count)).toBe(1);
 });
 it('denies a different session, different action nonce and revoked credential before verification',async()=>{
  const first=await begin(),second=await begin('e'.repeat(64));
  await expect(service.complete({...completion(first),response:completion(second).response})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  await expect(service.complete({...completion(first),credential:`wfs_${'a'.repeat(43)}`})).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
  await fixture.pool.query("UPDATE internal_workforce_passkey_state SET revoked_at=clock_timestamp(),revoked_by=91,reason='Local adversarial credential revocation.',version=version+1");
  await expect(service.complete(completion(first))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
 });
 it('rechecks revoked workforce membership after cryptographic verification',async()=>{
  const verifier=new class extends PasskeyAssertionVerifier {override async verify(input:Parameters<PasskeyAssertionVerifier['verify']>[0]){
   const result=await super.verify(input);await fixture.pool.query("UPDATE internal_organization_memberships SET status='SUSPENDED',suspended_at=clock_timestamp(),version=version+1,changed_by=91,change_reason='Local membership revocation between verification and commit.' WHERE id=$1",[issued.public.membershipId]);return result;
  }};
  await expect(new WorkforceStepUp(factorPool,'LOCAL',verifier).complete(completion(await begin()))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
  expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_passkey_receipts')).rows[0].count)).toBe(0);
 });
 it('invalidates issued but unused proof when the credential is revoked',async()=>{
  const {actions,input}=action();const proof=await service.complete(completion(await begin(actions.fingerprint(input))));
  await fixture.pool.query("UPDATE internal_workforce_passkey_state SET revoked_at=clock_timestamp(),revoked_by=91,reason='Local removal invalidates unused factor evidence.',version=version+1");
  input.context.evidence.stepUpReceiptId=proof.challengeId;await expect(actions.request(input)).rejects.toMatchObject({code:'STEP_UP_INVALID'});
 });
 it('revocation after action approval prevents consumption and domain writes',async()=>{
  const {actions,input}=action();const intent=actions.fingerprint(input);const proof=await service.complete(completion(await begin(intent)));
  input.context.evidence.stepUpReceiptId=proof.challengeId;const accepted=await actions.request(input);
  await fixture.pool.query("UPDATE internal_workforce_passkey_state SET revoked_at=clock_timestamp(),revoked_by=91,reason='Local credential removal after independent action approval.',version=version+1");
  let writes=0;await expect(new PostgresWorkforceAuthorization(fixture.runtime,'LOCAL').runAuthorized({...input.context,conditions:{...input.context.conditions,commandHash:intent},evidence:{stepUpReceiptId:proof.challengeId,actionAuthorizationId:accepted.receipt.id}},async()=>{writes++;})).rejects.toThrow();
  expect(writes).toBe(0);expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[accepted.receipt.id])).rows[0].status).toBe('APPROVED');
 });
 it('rechecks revoked credential after signature verification before issuing proof',async()=>{
  const verifier=new class extends PasskeyAssertionVerifier {override async verify(input:Parameters<PasskeyAssertionVerifier['verify']>[0]){
   const proof=await super.verify(input);await fixture.pool.query("UPDATE internal_workforce_passkey_state SET revoked_at=clock_timestamp(),revoked_by=91,reason='Local credential revoked between signature verification and commit.',version=version+1");return proof;
  }};
  await expect(new WorkforceStepUp(factorPool,'LOCAL',verifier).complete(completion(await begin()))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
 });
 it('denies expired sessions and bounds durable ceremony creation per member',async()=>{
  await Promise.all(Array.from({length:10},()=>begin()));await expect(begin()).rejects.toMatchObject({code:'FACTOR_RATE_LIMITED'});
  const ceremony=(await fixture.pool.query('SELECT id FROM internal_workforce_passkey_ceremonies LIMIT 1')).rows[0];
  await fixture.pool.query("UPDATE internal_staff_sessions SET idle_expires_at=authenticated_at+interval '1 millisecond' WHERE id=$1",[issued.public.sessionId]);
  await expect(service.complete({credential:issued.private.credential,challengeId:ceremony.id,response:{},correlationId:'local-expired-factor-session'})).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
 });
 it('invalidates pending and verified ceremonies after an explicit policy release',async()=>{
  const first=await begin();const second=await begin('e'.repeat(64));await service.complete(completion(first));
  const newer=(await fixture.pool.query(`INSERT INTO internal_workforce_factor_policies(organization_id,environment,version,config,config_hash,approval_status,created_by,reason) SELECT organization_id,environment,2,config,repeat('0',64),approval_status,90,'Local factor policy changed and invalidates old receipts.' FROM internal_workforce_factor_policies RETURNING id`)).rows[0];
  await fixture.pool.query('UPDATE internal_workforce_current_factor_policy SET policy_id=$1',[newer.id]);
  await expect(service.complete(completion(second))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
  expect((await fixture.pool.query("SELECT internal_iam_valid_step_up($1,$2,$3,$4) AS valid",[first.challengeId,issued.public.membershipId,fixture.organizationId,'d'.repeat(64)])).rows[0].valid).toBe(false);
 });
 it('keeps production and missing enrollment unavailable instead of manufacturing a factor',async()=>{
  await expect(new WorkforceStepUp(factorPool,'PRODUCTION').begin({credential:issued.private.credential,enrollmentId:key.credential.recordId,actionHash:'d'.repeat(64),correlationId:'local-env-denial'})).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
  await expect(service.begin({credential:issued.private.credential,enrollmentId:randomUUID(),actionHash:'d'.repeat(64),correlationId:'local-enrollment-denial'})).rejects.toMatchObject({code:'FACTOR_ENROLLMENT_UNAVAILABLE'});
 });
 it('rolls back counter and factor verification if the immutable audit write fails',async()=>{
  const start=await begin();await fixture.pool.query(`CREATE FUNCTION fail_factor_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='PASSKEY_ASSERTION_VERIFIED' THEN RAISE EXCEPTION 'private database detail'; END IF;RETURN NEW;END $$;CREATE TRIGGER fail_factor_audit BEFORE INSERT ON internal_iam_events FOR EACH ROW EXECUTE FUNCTION fail_factor_audit();`);
  await expect(service.complete(completion(start))).rejects.toMatchObject({code:'FACTOR_STORE_UNAVAILABLE'});
  expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[start.challengeId])).rows[0].status).toBe('PENDING');
  expect((await fixture.pool.query('SELECT counter,version FROM internal_workforce_passkey_state')).rows[0]).toMatchObject({counter:'4',version:1});
 });
 it('reports unknown commit outcome and refuses to replay verified evidence',async()=>{
  const start=await begin();let fail=true;const transport=new Proxy(factorPool,{get(target,key){if(key==='connect')return async()=>{const client=await target.connect();let recorded=false;return new Proxy(client,{get(c,k){if(k==='query')return async(...args:unknown[])=>{const result=await Reflect.apply(c.query,c,args);if(String(args[0]).startsWith('SELECT internal_iam_record_passkey('))recorded=true;if(args[0]==='COMMIT'&&recorded&&fail){fail=false;throw new Error('lost local acknowledgement');}return result;};const value=Reflect.get(c,k);return typeof value==='function'?value.bind(c):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await expect(new WorkforceStepUp(transport,'LOCAL').complete(completion(start))).rejects.toMatchObject({code:'FACTOR_OUTCOME_UNKNOWN'});
  await expect(service.complete(completion(start))).rejects.toMatchObject({code:'FACTOR_CHALLENGE_INVALID'});
  expect(Number((await fixture.pool.query('SELECT count(*) FROM internal_workforce_passkey_receipts')).rows[0].count)).toBe(1);
 });
});
