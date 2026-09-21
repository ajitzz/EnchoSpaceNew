import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {rehearseAdtechRollout} from '../../server/deployment/adtechRehearsal.js';
import {adtechRolloutGrants,verifyAdtechCatalog} from '../../server/deployment/adtechReadiness.js';
import {deployedMigrationManifest} from '../../server/deployment/recoveryReadiness.js';

describe('ADT local migration rehearsal and hostile catalog drift',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool;
 const role='adtech_release_runtime';
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();
  await fixture.pool.query(`CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users,entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,created_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL);
   CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
   GRANT USAGE ON SCHEMA public TO ${role};GRANT SELECT ON users,schema_migrations TO ${role};`);
  // Synthetic history isolates exact 032–035 rehearsal; this is not a 001–035 bootstrap claim.
  for(const m of deployedMigrationManifest().filter(m=>Number(m.version.slice(0,3))<32))await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',[m.version,m.checksum]);
  runtime=new pg.Pool({...fixture.pool.options,user:role});
 });
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 const rehearse=async()=>{const c=await fixture.pool.connect();try{return await rehearseAdtechRollout(c,role);}finally{c.release();}};
 const inspect=async()=>{const c=await runtime.connect();try{return await verifyAdtechCatalog(c);}finally{c.release();}};
 it('applies all four exact migrations and minimum grants on one held connection, then rolls them back',async()=>{
  const result=await rehearse();expect(result.executed).toHaveLength(4);expect(result.catalog.ready).toBe(true);
  expect((await fixture.pool.query("SELECT to_regclass('marketing_adtech_tier_profiles') AS table")).rows[0].table).toBeNull();
  expect((await fixture.pool.query("SELECT count(*)::int n FROM schema_migrations WHERE version>='032'")).rows[0].n).toBe(0);
 });
 it('refuses a second migration owner while the advisory lock is held',async()=>{
  const c=await fixture.pool.connect();try{await c.query('SELECT pg_advisory_lock(82749102)');await expect(rehearse()).rejects.toThrow('MIGRATION_LOCK_BUSY');}finally{await c.query('SELECT pg_advisory_unlock(82749102)');c.release();}
 });
 it('refuses changed prerequisite checksums before creating registry tables',async()=>{
  const m=deployedMigrationManifest().find(m=>m.version.startsWith('031'))!;
  await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',['drift',m.version]);try{await expect(rehearse()).rejects.toThrow('MIGRATION_HISTORY_MISSING_OR_DRIFTED');}finally{await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',[m.checksum,m.version]);}
 });
 it('bootstraps seed profiles with a non-superuser, non-BYPASSRLS migration owner',async()=>{
  await fixture.pool.query(`CREATE ROLE adtech_migration_owner NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   GRANT USAGE,CREATE ON SCHEMA public TO adtech_migration_owner;
   GRANT SELECT,REFERENCES ON users,marketing_campaign_revisions TO adtech_migration_owner;
   GRANT TRIGGER ON admin_audit_logs TO adtech_migration_owner;`);
  const c=await fixture.pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE adtech_migration_owner');for(const m of deployedMigrationManifest().filter(m=>/^(032|033|034|035)_/.test(m.version)))await c.query(readFileSync('src/migrations/'+m.version,'utf8'));await c.query('RESET ROLE');expect((await c.query('SELECT count(*)::int n FROM marketing_adtech_profile_versions')).rows[0].n).toBe(3);}finally{await c.query('ROLLBACK');c.release();}
 });
 it('accepts the persisted local catalog through a fresh non-owner connection',async()=>{
  const c=await fixture.pool.connect();try{await c.query('BEGIN');for(const m of deployedMigrationManifest().filter(m=>/^(032|033|034|035)_/.test(m.version))){await c.query(readFileSync('src/migrations/'+m.version,'utf8'));await c.query('INSERT INTO schema_migrations VALUES($1,$2)',[m.version,m.checksum]);}for(const sql of adtechRolloutGrants(role))await c.query(sql);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  expect(await inspect()).toEqual({ready:true,policyValid:true,privileges:true,immutable:true,integrity:true});
 });
 it.each([
  ['extra permissive policy','CREATE POLICY attacker ON marketing_adtech_profile_versions USING(true)','DROP POLICY attacker ON marketing_adtech_profile_versions'],
  ['missing FORCE RLS','ALTER TABLE marketing_corridor_inference_jobs NO FORCE ROW LEVEL SECURITY','ALTER TABLE marketing_corridor_inference_jobs FORCE ROW LEVEL SECURITY'],
  ['mutable history grant',`GRANT UPDATE ON marketing_adtech_strategy_audits TO ${role}`,`REVOKE UPDATE ON marketing_adtech_strategy_audits FROM ${role}`],
  ['public access','GRANT SELECT ON marketing_corridor_inference_proposals TO PUBLIC','REVOKE SELECT ON marketing_corridor_inference_proposals FROM PUBLIC'],
  ['disabled immutability','ALTER TABLE marketing_corridor_inference_proposals DISABLE TRIGGER marketing_inference_proposal_immutable','ALTER TABLE marketing_corridor_inference_proposals ENABLE TRIGGER marketing_inference_proposal_immutable'],
  ['sequence manipulation',`GRANT UPDATE ON SEQUENCE marketing_corridor_inference_jobs_id_seq TO ${role}`,`REVOKE UPDATE ON SEQUENCE marketing_corridor_inference_jobs_id_seq FROM ${role}`],
 ])('rejects %s',async(_name,damage,restore)=>{await fixture.pool.query(damage);try{expect((await inspect()).ready).toBe(false);}finally{await fixture.pool.query(restore);}expect((await inspect()).ready).toBe(true);});
 it('rejects an administrative predicate replaced with unconditional true',async()=>{
  await fixture.pool.query('CREATE OR REPLACE FUNCTION marketing_adtech_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$');
  try{expect((await inspect()).ready).toBe(false);}finally{const sql=readFileSync('src/migrations/032_marketing_adtech_registry.sql','utf8').match(/CREATE FUNCTION marketing_adtech_is_admin\(\)[^]*?\$\$;/)![0];await fixture.pool.query(sql.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));}
  expect((await inspect()).ready).toBe(true);
 });
});
