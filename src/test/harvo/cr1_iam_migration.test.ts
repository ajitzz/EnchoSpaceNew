import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PostgresWorkforceAuthorization } from '../../lib/iam/postgresAuthorization.js';
import { StaffSessionReader } from '../../lib/iam/staffSessions.js';
import { projectOperationsWorkspace } from '../../lib/iam/workspaceProjection.js';
import { createRootExecutionContext, runWithExecutionContext } from '../../lib/observability/executionContext.js';
import { permissionCheckInputSchema } from '../../lib/iam/authorizationPort.js';

import { iamRolloutGrants, verifyIamCatalog } from '../../server/deployment/iamReadiness.js';
import { deployedMigrationManifest, verifyMigrationHistory } from '../../server/deployment/recoveryReadiness.js';
import { runMigrations } from '../../migrations/runner.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';
import { createLocalPostgresFixture } from './postgres.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const ownerMembershipId = '11111111-1111-4111-8111-111111111111';
const checkerMembershipId = '22222222-2222-4222-8222-222222222222';
const checkerSessionId = '77777777-7777-4777-8777-777777777777';
const ownerSessionId = '33333333-3333-4333-8333-333333333333';
const ownerProductionSessionId = '93333333-3333-4333-8333-333333333333';
const hash = (character: string) => character.repeat(64);

describe('CR1 migration 036 workforce IAM authority', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let runtime: pg.Pool;
  let migrator: pg.Pool;
  let policyHash: string;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query(`
      CREATE TABLE users(id INT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);
      INSERT INTO users(id,email,role) VALUES
        (10,'host@example.test','user'),
        (90,'owner@example.test','admin'),
        (91,'checker@example.test','admin');
      CREATE TABLE schema_migrations(
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        checksum TEXT
      );
      CREATE ROLE cr1_iam_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE cr1_iam_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT USAGE,CREATE ON SCHEMA public TO cr1_iam_migrator;
      GRANT SELECT,INSERT,UPDATE ON schema_migrations TO cr1_iam_migrator;
      GRANT REFERENCES ON users TO cr1_iam_migrator;
      GRANT USAGE ON SCHEMA public TO cr1_iam_runtime;
      GRANT SELECT ON users,schema_migrations TO cr1_iam_runtime;
      CREATE TABLE cr1_iam_domain_probe(id TEXT PRIMARY KEY);
      GRANT SELECT,INSERT ON cr1_iam_domain_probe TO cr1_iam_runtime;
    `);

    const manifest = deployedMigrationManifest();
    for (const migration of manifest.filter(item => !item.version.startsWith('036_'))) {
      await fixture.pool.query(
        'INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',
        [migration.version, migration.checksum],
      );
    }

    migrator = new pg.Pool({ ...fixture.pool.options, user: 'cr1_iam_migrator' });
    await applyIsolatedMigration(migrator,'036_internal_organization_iam.sql');

    for (const statement of iamRolloutGrants('cr1_iam_runtime')) await fixture.pool.query(statement);

    const platformOwnerVersion = (await fixture.pool.query<{ id: string }>(`
      SELECT v.id
      FROM internal_role_versions v
      JOIN internal_role_definitions r ON r.id=v.role_id
      WHERE r.role_key='platform_owner' AND v.version=1
    `)).rows[0].id;
    await fixture.pool.query(`
      INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,changed_by,change_reason)
      VALUES($1,$3,90,'ACTIVE',clock_timestamp(),90,'Reviewed local owner bootstrap only.'),
            ($2,$3,91,'ACTIVE',clock_timestamp(),90,'Reviewed local checker bootstrap only.')
    `, [ownerMembershipId, checkerMembershipId, organizationId]);
    await fixture.pool.query(`
      INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,grant_hash,granted_by,reason)
      VALUES($3,$1,$4,'WORKFORCE',$3::uuid::text,$5,90,'Reviewed local workforce owner authority.'),
            ($3,$1,$4,'ORGANIZATION',$3::uuid::text,$6,90,'Reviewed local organization owner authority.'),
            ($3,$2,$4,'WORKFORCE',$3::uuid::text,$7,90,'Reviewed local checker workforce authority.')
    `, [ownerMembershipId, checkerMembershipId, organizationId, platformOwnerVersion, hash('a'), hash('b'), hash('c')]);
    await fixture.pool.query(`
      INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours'),
            ($5,$2,$6,$7,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours')
    `, [ownerSessionId, organizationId, ownerMembershipId, hash('d'), checkerSessionId, checkerMembershipId, hash('8')]);
    await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at,environment)
      SELECT $1,organization_id,membership_id,$2,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at,'PRODUCTION' FROM internal_staff_sessions WHERE id=$3`,[ownerProductionSessionId,hash('f'),ownerSessionId]);
    policyHash = (await fixture.pool.query('SELECT config_hash FROM internal_iam_policy_versions WHERE version=1')).rows[0].config_hash;

    runtime = new pg.Pool({ ...fixture.pool.options, user: 'cr1_iam_runtime' });
  }, 30_000);

  afterAll(async () => {
    await runtime?.end();
    await migrator?.end();
    await fixture?.close();
  });

  async function withOwnerContext<T>(work: (client: pg.PoolClient) => Promise<T>) {
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT
        set_config('app.current_user_id','90',true),
        set_config('app.organization_id',$1,true),
        set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','PRODUCTION',true)`, [organizationId, ownerMembershipId, ownerProductionSessionId]);
      const result = await work(client);
      await client.query('ROLLBACK');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('records the exact isolated migration and detects checksum drift from a restricted connection', async () => {
    const manifest = deployedMigrationManifest();
    const expected = manifest.find(item => item.version === '036_internal_organization_iam.sql')!;
    expect(expected).toBeDefined();
    const recorded = (await fixture.pool.query(
      'SELECT version,checksum FROM schema_migrations WHERE version=$1',
      [expected.version],
    )).rows[0];
    expect(recorded).toEqual(expected);

    const client = await runtime.connect();
    try {
      expect(await verifyMigrationHistory(client)).toBe(true);
      await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', [hash('0'), expected.version]);
      expect(await verifyMigrationHistory(client)).toBe(false);
      await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', [expected.checksum, expected.version]);
      expect(await verifyMigrationHistory(client)).toBe(true);
    } finally {
      client.release();
    }

    const secondRun = await runMigrations(migrator);
    expect(secondRun.find(result => result.file === expected.version)?.status).toBe('skipped');
  });

  it('passes exact readiness checks under a non-owner, non-BYPASSRLS role', async () => {
    const readinessClient = await runtime.connect();
    const result = await verifyIamCatalog(readinessClient);
    readinessClient.release();
    expect(result).toEqual({
      ready: true,
      privilegeValid: true,
      policyValid: true,
      permissionCatalogValid: true,
      safeDefaults: true,
      operationalPolicyApproved: false,
      runtimeRoleSafe: true,
      immutableEvidence: true,
      lifecycleTriggers: true,
      functionSafety: true,
      criticalConstraints: true,
      sequenceValid: true,
    });

    const role = (await fixture.pool.query(`
      SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
      FROM pg_roles WHERE rolname='cr1_iam_runtime'
    `)).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
  });

  it('denies absent and malformed staff context while honoring an active scoped grant', async () => {
    const client = await runtime.connect();
    try {
      expect((await client.query('SELECT count(*)::int AS count FROM internal_organizations')).rows[0].count).toBe(0);
      await client.query('BEGIN');
      await client.query(`SELECT
        set_config('app.current_user_id','10',true),
        set_config('app.organization_id','not-a-uuid',true),
        set_config('app.membership_id','not-a-uuid',true),
        set_config('app.staff_session_id','not-a-uuid',true)`);
      expect((await client.query('SELECT count(*)::int AS count FROM internal_organization_memberships')).rows[0].count).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }

    await withOwnerContext(async owner => {
      expect((await owner.query('SELECT count(*)::int AS count FROM internal_permission_catalog')).rows[0].count).toBe(42);
      expect((await owner.query(`SELECT internal_iam_has_permission(
        $1::uuid,'workforce.grant','WORKFORCE',$1::uuid::text,NULL,'PRODUCTION',NULL
      ) AS allowed`, [organizationId])).rows[0].allowed).toBe(true);
      expect((await owner.query(`SELECT internal_iam_has_permission(
        $1,'finance.refund','FINANCIAL_CONTRACT','contract:1',NULL,'PRODUCTION',100
      ) AS allowed`, [organizationId])).rows[0].allowed).toBe(false);
    });
  });

  it('keeps released roles and audit evidence immutable and enforces distinct checker evidence', async () => {
    const authorizationId = '44444444-4444-4444-8444-444444444444';
    await fixture.pool.query(`
      INSERT INTO internal_action_authorizations(
        id,organization_id,permission_code,resource_type,resource_id,environment,
        command_hash,policy_snapshot_hash,maker_membership_id,required_approvals,status,expires_at,reason
      ) VALUES($1,$2,'workforce.grant','WORKFORCE',$2::uuid::text,'PRODUCTION',$3,$4,$5,1,'PENDING',clock_timestamp()+interval '1 hour','Review an exact workforce grant command.');
    `, [authorizationId, organizationId, hash('e'), policyHash, ownerMembershipId]);

    await expect(fixture.pool.query(`
      INSERT INTO internal_action_approvals(
        authorization_id,checker_membership_id,decision,command_hash,reason
      ) VALUES($1,$2,'APPROVE',$3,'Maker cannot approve their own workforce command.')
    `, [authorizationId, ownerMembershipId, hash('e')])).rejects.toThrow('IAM_MAKER_CHECKER_CONFLICT');

    await expect(fixture.pool.query(`
      INSERT INTO internal_action_approvals(
        authorization_id,checker_membership_id,decision,command_hash,reason
      ) VALUES($1,$2,'APPROVE',$3,'Checker evidence must bind to the exact command hash.')
    `, [authorizationId, checkerMembershipId, hash('9')])).rejects.toThrow('IAM_COMMAND_HASH_MISMATCH');

    const checkerChallenge = '88888888-8888-4888-8888-888888888888';
    await fixture.pool.query(`INSERT INTO internal_step_up_challenges(id,organization_id,membership_id,session_id,action_hash,required_assurance,achieved_assurance,status,provider_receipt_hash,expires_at,verified_at)
      VALUES($1,$2,$3,$4,$5,'AAL2','AAL2','VERIFIED',$6,clock_timestamp()+interval '10 minutes',clock_timestamp())`,
    [checkerChallenge,organizationId,checkerMembershipId,checkerSessionId,hash('e'),hash('7')]);
    const approvalId = (await fixture.pool.query<{ id: string }>(`
      INSERT INTO internal_action_approvals(
        authorization_id,checker_membership_id,decision,command_hash,reason,step_up_challenge_id
      ) VALUES($1,$2,'APPROVE',$3,'Independent checker approved the exact reviewed command.',$4)
      RETURNING id
    `, [authorizationId, checkerMembershipId, hash('e'), checkerChallenge])).rows[0].id;
    await expect(fixture.pool.query(
      "UPDATE internal_action_approvals SET decision='REJECT' WHERE id=$1",
      [approvalId],
    )).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');

    await fixture.pool.query(`
      INSERT INTO internal_iam_events(
        organization_id,actor_user_id,actor_membership_id,event_type,entity_type,
        entity_id,new_hash,evidence,correlation_id,request_hash,reason
      ) VALUES($1,90,$2,'WORKFORCE_GRANT_APPROVED','AUTHORIZATION',$3,$4,'{}',$5,$6,'Record immutable independent checker evidence.')
    `, [organizationId, ownerMembershipId, authorizationId, hash('1'), '55555555-5555-4555-8555-555555555555', hash('2')]);
    await expect(fixture.pool.query(
      "UPDATE internal_iam_events SET reason='Attempted evidence rewrite is prohibited.'",
    )).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');

    await expect(fixture.pool.query(
      "UPDATE internal_role_versions SET reason='Attempted released role rewrite is prohibited.'",
    )).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');
  });

  it('does not let the shared runtime mint authentication, factor, grant or policy evidence', async () => {
    const statements = [
      `INSERT INTO internal_staff_sessions(organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at)
       VALUES('${organizationId}','${ownerMembershipId}','${hash('0')}','ACTIVE','PHISHING_RESISTANT',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
      `INSERT INTO internal_step_up_challenges(organization_id,membership_id,session_id,action_hash,required_assurance,achieved_assurance,status,provider_receipt_hash,expires_at,verified_at)
       VALUES('${organizationId}','${ownerMembershipId}','${ownerSessionId}','${hash('0')}','AAL2','AAL2','VERIFIED','${hash('0')}',clock_timestamp()+interval '10 minutes',clock_timestamp())`,
      'UPDATE internal_iam_current_policy SET updated_at=clock_timestamp()',
      'UPDATE internal_staff_sessions SET idle_expires_at=absolute_expires_at',
      'INSERT INTO internal_membership_grants SELECT * FROM internal_membership_grants LIMIT 1',
    ];
    for (const statement of statements) await expect(withOwnerContext(client => client.query(statement))).rejects.toMatchObject({ code: '42501' });
  });

  async function createFactor(membership: string, session: string, commandHash: string) {
    const id = randomUUID();
    await fixture.pool.query(`INSERT INTO internal_step_up_challenges(id,organization_id,membership_id,session_id,action_hash,required_assurance,achieved_assurance,status,provider_receipt_hash,expires_at,verified_at)
      VALUES($1,$2,$3,$4,$5,'AAL2','AAL2','VERIFIED',$6,clock_timestamp()+interval '10 minutes',clock_timestamp())`,
    [id,organizationId,membership,session,commandHash,hash('6')]);
    return id;
  }
  async function createAction(commandHash: string, factor: string | null) {
    const id = randomUUID();
    await fixture.pool.query(`INSERT INTO internal_action_authorizations(id,organization_id,permission_code,resource_type,resource_id,environment,command_hash,policy_snapshot_hash,maker_membership_id,step_up_challenge_id,required_approvals,expires_at,reason)
      VALUES($1,$2,'workforce.grant','WORKFORCE',$2::uuid::text,'LOCAL',$3,$4,$5,$6,1,clock_timestamp()+interval '10 minutes','Review exact local test authority command.')`,
    [id,organizationId,commandHash,policyHash,ownerMembershipId,factor]);
    return id;
  }

  it('rejects action creation with forged approval, stale policy or downgraded checker rules', async () => {
    for (const [status,required,policy,expected] of [
      ['APPROVED',1,policyHash,'IAM_AUTHORIZATION_INITIAL_STATE'],
      ['PENDING',0,policyHash,'IAM_CHECKER_POLICY_MISMATCH'],
      ['PENDING',1,hash('0'),'IAM_POLICY_CHANGED'],
    ] as const) {
      await expect(fixture.pool.query(`INSERT INTO internal_action_authorizations(organization_id,permission_code,resource_type,resource_id,environment,command_hash,policy_snapshot_hash,maker_membership_id,required_approvals,status,expires_at,reason)
        VALUES($1,'workforce.grant','WORKFORCE',$1::uuid::text,'PRODUCTION',$2,$3,$4,$5,$6,clock_timestamp()+interval '1 hour','Reject a forged authority initialization.')`,
      [organizationId,hash('0'),policy,ownerMembershipId,required,status])).rejects.toThrow(expected);
    }
  });

  it('enforces checker and action-bound factor proof and consumes it once', async () => {
    // LOCAL grants are explicit; production scope cannot bleed into local/test work.
    await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
      SELECT organization_id,membership_id,role_version_id,scope_type,scope_id,'LOCAL',encode(sha256(convert_to(grant_hash||':local','UTF8')),'hex'),90,'Explicit local scope for receipt lifecycle tests.'
      FROM internal_membership_grants WHERE scope_type='WORKFORCE'`);
    const commandHash = hash('3');
    const makerFactor = await createFactor(ownerMembershipId,ownerSessionId,commandHash);
    const actionId = await createAction(commandHash,makerFactor);
    await expect(fixture.pool.query("UPDATE internal_action_authorizations SET status='APPROVED',version=version+1 WHERE id=$1",[actionId])).rejects.toThrow('IAM_CHECKER_REQUIRED');
    await expect(fixture.pool.query(`INSERT INTO internal_action_approvals(authorization_id,checker_membership_id,decision,command_hash,reason)
      VALUES($1,$2,'APPROVE',$3,'This attempt has no independently verified factor.')`,[actionId,checkerMembershipId,commandHash])).rejects.toThrow('IAM_CHECKER_STEP_UP_REQUIRED');
    const checkerFactor = await createFactor(checkerMembershipId,checkerSessionId,commandHash);
    await fixture.pool.query(`INSERT INTO internal_action_approvals(authorization_id,checker_membership_id,decision,command_hash,reason,step_up_challenge_id)
      VALUES($1,$2,'APPROVE',$3,'Independent exact command and verified factor.',$4)`,[actionId,checkerMembershipId,commandHash,checkerFactor]);
    await fixture.pool.query("UPDATE internal_action_authorizations SET status='APPROVED',version=version+1 WHERE id=$1",[actionId]);
    await fixture.pool.query("UPDATE internal_action_authorizations SET status='CONSUMED',consumed_at=clock_timestamp(),version=version+1 WHERE id=$1",[actionId]);
    const factors = (await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=ANY($1::uuid[])',[ [makerFactor,checkerFactor] ])).rows;
    expect(factors).toEqual([{status:'CONSUMED'},{status:'CONSUMED'}]);
    await expect(fixture.pool.query("UPDATE internal_action_authorizations SET status='APPROVED',consumed_at=NULL,version=version+1 WHERE id=$1",[actionId])).rejects.toThrow('IAM_AUTHORIZATION_TERMINAL');
    await expect(fixture.pool.query(`INSERT INTO internal_action_approvals(authorization_id,checker_membership_id,decision,command_hash,reason,step_up_challenge_id)
      VALUES($1,$2,'APPROVE',$3,'Cannot append approvals after consumption.',$4)`,[actionId,checkerMembershipId,commandHash,checkerFactor])).rejects.toThrow('IAM_AUTHORIZATION_NOT_PENDING');
  });

  it('binds factor proofs to the same membership/session and rejects assurance downgrades', async () => {
    await expect(createFactor(ownerMembershipId,checkerSessionId,hash('4'))).rejects.toMatchObject({code:'23503'});
    await expect(fixture.pool.query(`INSERT INTO internal_step_up_challenges(organization_id,membership_id,session_id,action_hash,required_assurance,achieved_assurance,status,provider_receipt_hash,expires_at,verified_at)
      VALUES($1,$2,$3,$4,'PHISHING_RESISTANT','AAL2','VERIFIED',$4,clock_timestamp()+interval '10 minutes',clock_timestamp())`,
    [organizationId,ownerMembershipId,ownerSessionId,hash('4')])).rejects.toMatchObject({code:'23514'});
  });

  it('fences revocation against an in-flight restricted-runtime command', async () => {
    const command = await runtime.connect();
    const revoke = await fixture.pool.connect();
    try {
      await command.query('BEGIN');
      await command.query(`SELECT set_config('app.current_user_id','90',true),set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),set_config('app.staff_session_id',$3,true)`,[organizationId,ownerMembershipId,ownerSessionId]);
      expect((await command.query('SELECT internal_iam_lock_authority() AS valid')).rows[0].valid).toBe(true);
      await revoke.query('BEGIN');
      await revoke.query("SET LOCAL lock_timeout='100ms'");
      await expect(revoke.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
        SELECT id,90,'Revocation must wait for the protected transaction.' FROM internal_membership_grants WHERE grant_hash=$1`,[hash('a')])).rejects.toMatchObject({code:'55P03'});
      await revoke.query('ROLLBACK');
      await command.query('COMMIT');
      await revoke.query('BEGIN');
      await revoke.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
        SELECT id,90,'Revocation proceeds after the protected command releases.' FROM internal_membership_grants WHERE grant_hash=$1`,[hash('a')]);
      await revoke.query('ROLLBACK');
    } finally {
      await command.query('ROLLBACK'); await revoke.query('ROLLBACK');
      command.release(); revoke.release();
    }
  });

  const serviceInput = (environment: 'LOCAL' | 'PRODUCTION' = 'LOCAL') => permissionCheckInputSchema.parse({
    principal: {accountId:90,actorKind:'STAFF',organizationId,membershipId:ownerMembershipId,sessionId:environment==='PRODUCTION'?ownerProductionSessionId:ownerSessionId,assuranceLevel:'AAL2',authenticatedAt:new Date().toISOString(),correlationId:'iam-real-pg-correlation',operationId:'iam-real-pg-operation'},
    tenant:{kind:'INTERNAL_ORGANIZATION',organizationId},
    permission:'workforce.member.read',resource:{target:{type:'WORKFORCE',id:organizationId}},
    conditions:{environment,requestedAt:new Date().toISOString(),commandHash:hash('5')},evidence:{},
  });

  it('keeps pending production approval and runtime environment boundaries fail-closed in the service adapter', async () => {
    const production = new PostgresWorkforceAuthorization(runtime,'PRODUCTION');
    expect(await production.check(serviceInput('PRODUCTION'))).toMatchObject({effect:'DENY',reason:'IAM_NOT_READY'});
    expect(await production.check({...serviceInput('PRODUCTION'),principal:serviceInput().principal})).toMatchObject({effect:'DENY',reason:'SESSION_REVOKED'});
    const local = new PostgresWorkforceAuthorization(runtime,'LOCAL');
    await expect(local.check(serviceInput('PRODUCTION'))).rejects.toMatchObject({code:'CONDITION_FAILED'});
    expect(await local.check(serviceInput())).toMatchObject({effect:'ALLOW',allowed:true,policySnapshotHash:policyHash});
  });

  it('consumes exact maker/checker authority and factor receipts inside the restricted-runtime command transaction', async () => {
    const commandHash = hash('9');
    const makerFactor = await createFactor(ownerMembershipId,ownerSessionId,commandHash);
    const checkerFactor = await createFactor(checkerMembershipId,checkerSessionId,commandHash);
    const actionId = await createAction(commandHash,makerFactor);
    await fixture.pool.query(`INSERT INTO internal_action_approvals(authorization_id,checker_membership_id,decision,command_hash,reason,step_up_challenge_id)
      VALUES($1,$2,'APPROVE',$3,'Independent approval for restricted runtime consumption.',$4)`,[actionId,checkerMembershipId,commandHash,checkerFactor]);
    await fixture.pool.query("UPDATE internal_action_authorizations SET status='APPROVED',version=version+1 WHERE id=$1",[actionId]);
    const input = permissionCheckInputSchema.parse({...serviceInput(),permission:'workforce.grant',conditions:{...serviceInput().conditions,commandHash},evidence:{actionAuthorizationId:actionId,stepUpReceiptId:makerFactor}});
    const local = new PostgresWorkforceAuthorization(runtime,'LOCAL');
    await local.runAuthorized(input, async client => {await client.query("INSERT INTO cr1_iam_domain_probe(id) VALUES('critical-command')");});
    expect((await fixture.pool.query('SELECT status FROM internal_action_authorizations WHERE id=$1',[actionId])).rows[0].status).toBe('CONSUMED');
    expect((await fixture.pool.query('SELECT status FROM internal_step_up_challenges WHERE id=$1',[makerFactor])).rows[0].status).toBe('CONSUMED');
    await expect(local.runAuthorized(input, async () => {throw new Error('CALLBACK_MUST_NOT_RUN');})).rejects.toMatchObject({code:'POLICY_CHANGED'});
  });

  it('preserves an unknown result when COMMIT succeeds but its response is lost',async()=>{
    const uncertainPool=new Proxy(runtime,{get(target,key){
      if(key==='connect')return async()=>{
        const client=await target.connect();
        return new Proxy(client,{get(c,k){
          if(k==='query')return async(sql:string,values?:unknown[])=>{
            const result=await c.query(sql,values);
            if(sql==='COMMIT')throw new Error('INJECTED_LOST_COMMIT_RESPONSE');
            return result;
          };
          const value=Reflect.get(c,k,c);return typeof value==='function'?value.bind(c):value;
        }});
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    const local=new PostgresWorkforceAuthorization(uncertainPool,'LOCAL');
    await expect(local.runAuthorized(serviceInput(),async client=>{
      await client.query("INSERT INTO cr1_iam_domain_probe(id) VALUES('commit-response-lost')");
    })).rejects.toMatchObject({code:'OUTCOME_UNKNOWN',status:503});
    expect((await fixture.pool.query("SELECT id FROM cr1_iam_domain_probe WHERE id='commit-response-lost'")).rowCount).toBe(1);
  });

  it('commits domain command and audit atomically, rolls back callback failure, and rechecks revocation', async () => {
    const local = new PostgresWorkforceAuthorization(runtime,'LOCAL');
    const before = (await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE event_type='AUTHORIZED_COMMAND'")).rows[0].count;
    await local.runAuthorized(serviceInput(), async client => {
      await client.query("INSERT INTO cr1_iam_domain_probe(id) VALUES('committed')");
    });
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE event_type='AUTHORIZED_COMMAND'")).rows[0].count).toBe(before+1);
    const receipt = (await fixture.pool.query("SELECT correlation_id,causation_id FROM internal_iam_events WHERE event_type='AUTHORIZED_COMMAND' ORDER BY sequence DESC LIMIT 1")).rows[0];
    expect(receipt).toEqual({correlation_id:'iam-real-pg-correlation',causation_id:'iam-real-pg-operation'});
    await expect(local.runAuthorized(serviceInput(), async client => {
      await client.query("INSERT INTO cr1_iam_domain_probe(id) VALUES('rolled-back')");
      throw new Error('INJECTED_DOMAIN_FAILURE');
    })).rejects.toThrow('INJECTED_DOMAIN_FAILURE');
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM cr1_iam_domain_probe WHERE id='rolled-back'")).rows[0].count).toBe(0);
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM internal_iam_events WHERE event_type='AUTHORIZED_COMMAND'")).rows[0].count).toBe(before+1);
    await fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
      SELECT id,90,'Revoke local test authority before command execution.' FROM internal_membership_grants WHERE membership_id=$1 AND environment='LOCAL'`,[ownerMembershipId]);
    let invoked = false;
    await expect(local.runAuthorized(serviceInput(), async () => {invoked=true;})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    expect(invoked).toBe(false);
  });

  it('does not expose another identity’s IAM evidence from guessed selectors or legacy bypass flags', async () => {
    await withOwnerContext(async client => {
      await client.query("SELECT set_config('app.current_user_id','10',true),set_config('app.bypass_rls','true',true),set_config('app.marketing_admin','true',true)");
      expect((await client.query('SELECT internal_iam_lock_authority() AS valid')).rows[0].valid).toBe(false);
      for (const table of ['internal_membership_grants','internal_staff_sessions','internal_action_authorizations','internal_action_approvals']) {
        expect((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count).toBe(0);
      }
      await client.query("SELECT set_config('app.current_user_id','9999999999',true)");
      expect((await client.query('SELECT internal_iam_current_user_id() AS id')).rows[0].id).toBeNull();
    });
  });

  it('enforces terminal membership lifecycle, optimistic versions, and safe pending thresholds', async () => {
    await expect(fixture.pool.query(`
      UPDATE internal_organization_memberships
      SET status='SUSPENDED',suspended_at=clock_timestamp(),version=version+2
      WHERE id=$1
    `, [checkerMembershipId])).rejects.toThrow('IAM_MEMBERSHIP_VERSION_CONFLICT');

    await fixture.pool.query(`
      UPDATE internal_organization_memberships
      SET status='OFFBOARDED',offboarded_at=clock_timestamp(),version=version+1
      WHERE id=$1
    `, [checkerMembershipId]);
    await expect(fixture.pool.query(`
      UPDATE internal_organization_memberships
      SET status='ACTIVE',offboarded_at=NULL,version=version+1
      WHERE id=$1
    `, [checkerMembershipId])).rejects.toThrow('IAM_OFFBOARDING_TERMINAL');

    const policy = (await fixture.pool.query(`
      SELECT v.approval_status,v.config->'amountThresholds' AS thresholds
      FROM internal_iam_current_policy p
      JOIN internal_iam_policy_versions v ON v.id=p.version_id
    `)).rows[0];
    expect(policy).toEqual({
      approval_status: 'PENDING_FOUNDER_OPERATIONAL_APPROVAL',
      thresholds: { refundMinor: null, settlementMinor: null },
    });
  });

  it('authenticates an independent opaque session and projects only current staff work under RLS', async () => {
    const token = `wfs_${randomBytes(32).toString('base64url')}`;
    const digest = createHash('sha256').update(token).digest('hex');
    const session = randomUUID();
    await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,
      assurance_level,authenticated_at,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,'AAL1',clock_timestamp(),clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '1 hour')`,
    [session,organizationId,ownerMembershipId,digest]);
    const context = createRootExecutionContext({source:'SYSTEM'});
    const local = new StaffSessionReader(runtime,'LOCAL');
    const read = () => runWithExecutionContext(context, () => local.read(`Bearer ${token}`,
      (client,principal,expires) => projectOperationsWorkspace(client,principal,expires,'LOCAL')));
    const workspace = await read();
    expect(workspace.member).toEqual({membershipId:ownerMembershipId,state:'ACTIVE'});
    expect(workspace.work.items).toEqual([]);
    expect(workspace.workforce.state).toBe('REVIEW_REQUIRED');
    expect(JSON.stringify(workspace)).not.toContain(digest);
    expect(JSON.stringify(workspace)).not.toContain('owner@example.test');
    await expect(runWithExecutionContext(context, () => new StaffSessionReader(runtime,'PRODUCTION')
      .read(`Bearer ${token}`,async () => 'MUST_NOT_RUN'))).rejects.toMatchObject({code:'STAFF_SESSION_REQUIRED'});
    await expect(runWithExecutionContext(context, () => new StaffSessionReader(fixture.pool,'LOCAL')
      .read(`Bearer ${token}`,async () => 'MUST_NOT_RUN'))).rejects.toMatchObject({code:'WORKFORCE_UNAVAILABLE'});
    await fixture.pool.query(`UPDATE internal_staff_sessions SET status='REVOKED',revoked_at=clock_timestamp(),
      revoked_by=90,revoke_reason='Revoked during local authentication verification.' WHERE id=$1`,[session]);
    await expect(read()).rejects.toMatchObject({code:'STAFF_SESSION_REQUIRED'});
    expect((await runtime.query('SELECT * FROM internal_iam_authenticate_session($1)',[hash('0')])).rows).toEqual([]);
    expect((await runtime.query('SELECT * FROM internal_iam_authenticate_session($1)',["' OR true --"])).rows).toEqual([]);
  });
});
