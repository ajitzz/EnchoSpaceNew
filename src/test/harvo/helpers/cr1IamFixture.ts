import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {createLocalPostgresFixture} from '../postgres.js';
import {applyIsolatedMigration} from './isolatedMigration.js';
import {deployedMigrationManifest} from '../../../server/deployment/recoveryReadiness.js';
import {iamRolloutGrants} from '../../../server/deployment/iamReadiness.js';
import {parsePrincipalContext, type PrincipalContext} from '../../../shared/iam/principalContext.js';

/** Disposable local-only identities; never reads a remote connection URL. */
export async function createCr1IamFixture() {
  const fixture=await createLocalPostgresFixture({schema:'empty'});
  const organizationId='00000000-0000-4000-8000-000000000001';
  const migrator=new pg.Pool({...fixture.pool.options,user:'cr1_iam_migrator'});
  const runtime=new pg.Pool({...fixture.pool.options,user:'cr1_iam_runtime'});
  const hash=(character:string)=>character.repeat(64);
  const principals:{maker:PrincipalContext;checker:PrincipalContext;outsider:PrincipalContext}={
    maker:parsePrincipalContext({actorKind:'STAFF',accountId:90,organizationId,membershipId:randomUUID(),sessionId:randomUUID(),assuranceLevel:'AAL2',authenticatedAt:new Date().toISOString(),correlationId:'iam-maker-test',operationId:'iam-maker-operation'}),
    checker:parsePrincipalContext({actorKind:'STAFF',accountId:91,organizationId,membershipId:randomUUID(),sessionId:randomUUID(),assuranceLevel:'AAL2',authenticatedAt:new Date().toISOString(),correlationId:'iam-checker-test',operationId:'iam-checker-operation'}),
    outsider:parsePrincipalContext({actorKind:'STAFF',accountId:92,organizationId,membershipId:randomUUID(),sessionId:randomUUID(),assuranceLevel:'AAL2',authenticatedAt:new Date().toISOString(),correlationId:'iam-outsider-test',operationId:'iam-outsider-operation'}),
  };
  const close=async()=>{await runtime.end();await migrator.end();await fixture.close();};
  try {
    await fixture.pool.query(`CREATE TABLE users(id INT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);
      INSERT INTO users VALUES(90,'maker@example.test','admin'),(91,'checker@example.test','user'),(92,'outsider@example.test','user');
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),checksum TEXT);
      CREATE ROLE cr1_iam_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      CREATE ROLE cr1_iam_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE,CREATE ON SCHEMA public TO cr1_iam_migrator;
      GRANT SELECT,INSERT,UPDATE ON schema_migrations TO cr1_iam_migrator;
      GRANT REFERENCES ON users TO cr1_iam_migrator;
      GRANT USAGE ON SCHEMA public TO cr1_iam_runtime;`);
    for (const entry of deployedMigrationManifest().filter(entry=>entry.version!=='036_internal_organization_iam.sql')) {
      await fixture.pool.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[entry.version,entry.checksum]);
    }
    await applyIsolatedMigration(migrator,'036_internal_organization_iam.sql');
    for (const grant of iamRolloutGrants('cr1_iam_runtime')) await fixture.pool.query(grant);
    const ownerRole=(await fixture.pool.query("SELECT v.id FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='platform_owner' AND v.version=1")).rows[0].id as string;
    for (const [index,principal] of Object.values(principals).entries()) {
      await fixture.pool.query(`INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,changed_by,change_reason) VALUES($1,$2,$3,'ACTIVE',clock_timestamp(),90,'Disposable local fixture identity bootstrap.')`,[principal.membershipId,organizationId,principal.accountId]);
      await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours')`,[principal.sessionId,organizationId,principal.membershipId,hash(String(index+1))]);
      if (principal===principals.outsider) continue;
      await fixture.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason) VALUES($1,$2,$3,'ORGANIZATION',$1::uuid::text,'LOCAL',$4,90,'Explicit local organization scope for testing.'),($1,$2,$3,'ORGANIZATION',$1::uuid::text,'PRODUCTION',$5,90,'Explicit production scope remains pending policy.')`,[organizationId,principal.membershipId,ownerRole,hash(String(index+4)),hash(String(index+6))]);
    }
    return {pool:fixture.pool,runtime,migrator,organizationId,principals,close,
      async environmentSession(principal:PrincipalContext,environment:'LOCAL'|'STAGING'|'PRODUCTION') {
        const sessionId=randomUUID();
        await fixture.pool.query(`INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at,environment) VALUES($1,$2,$3,$4,'ACTIVE','AAL2',clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours',$5)`,[sessionId,organizationId,principal.membershipId,createHash('sha256').update(sessionId).digest('hex'),environment]);
        return parsePrincipalContext({...principal,sessionId});
      },
      // A test-only trusted fixture administrator stands in for an external
      // authenticated factor adapter. Never import this helper from application code.
      async issueFactor(principal:PrincipalContext,commandHash:string,ttlSeconds=600) {
        const id=randomUUID();
        await fixture.pool.query(`INSERT INTO internal_step_up_challenges(id,organization_id,membership_id,session_id,action_hash,required_assurance,achieved_assurance,status,provider_receipt_hash,expires_at,verified_at)
          VALUES($1,$2,$3,$4,$5,'AAL2','AAL2','VERIFIED',$6,clock_timestamp()+$7::int*interval '1 second',clock_timestamp())`,[id,organizationId,principal.membershipId,principal.sessionId,commandHash,hash('a'),ttlSeconds]);
        return id;
      },
    };
  } catch (error) {await close();throw error;}
}
