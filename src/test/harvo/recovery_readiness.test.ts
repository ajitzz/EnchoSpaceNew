import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {deployedMigrationManifest,verifyMigrationHistory,verifyRecoveryCatalog} from '../../server/deployment/recoveryReadiness.js';

describe('recovery catalog readiness under a least-privilege non-bypass role',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();
  await fixture.pool.query(`CREATE ROLE readiness_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
   GRANT USAGE ON SCHEMA public TO readiness_runtime;
   GRANT SELECT,INSERT ON marketing_pause_recoveries TO readiness_runtime;
   GRANT SELECT,INSERT,UPDATE ON marketing_pause_recovery_attempts TO readiness_runtime;
   CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT);
   GRANT SELECT ON schema_migrations TO readiness_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'readiness_runtime'});
 });
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function inspect(){const c=await runtime.connect();try{await c.query('BEGIN READ ONLY');const result=await verifyRecoveryCatalog(c);await c.query('COMMIT');return result;}finally{await c.query('ROLLBACK');c.release();}}
 it('accepts the actual migration-created policies, trigger bodies, partial unique index and minimal grants',async()=>{
  expect(await inspect()).toEqual({ready:true,policyValid:true,immutable:true,privileges:true,claimIndex:true});
 });
 it.each([
  ['permissive policy',"CREATE POLICY attacker ON marketing_pause_recoveries USING(true)","DROP POLICY attacker ON marketing_pause_recoveries"],
  ['disabled trigger','ALTER TABLE marketing_pause_recoveries DISABLE TRIGGER marketing_pause_recovery_immutable','ALTER TABLE marketing_pause_recoveries ENABLE TRIGGER marketing_pause_recovery_immutable'],
  ['runtime deletion','GRANT DELETE ON marketing_pause_recovery_attempts TO readiness_runtime','REVOKE DELETE ON marketing_pause_recovery_attempts FROM readiness_runtime'],
  ['public access','GRANT SELECT ON marketing_pause_recoveries TO PUBLIC','REVOKE SELECT ON marketing_pause_recoveries FROM PUBLIC'],
  ['runtime truncation','GRANT TRUNCATE ON marketing_pause_recoveries TO readiness_runtime','REVOKE TRUNCATE ON marketing_pause_recoveries FROM readiness_runtime'],
  ['immutable column update','GRANT UPDATE(campaign_id) ON marketing_pause_recoveries TO readiness_runtime','REVOKE UPDATE(campaign_id) ON marketing_pause_recoveries FROM readiness_runtime'],
  ['immutable column references','GRANT REFERENCES(campaign_id) ON marketing_pause_recoveries TO readiness_runtime','REVOKE REFERENCES(campaign_id) ON marketing_pause_recoveries FROM readiness_runtime'],
  ['public column access','GRANT SELECT(campaign_id) ON marketing_pause_recoveries TO PUBLIC','REVOKE SELECT(campaign_id) ON marketing_pause_recoveries FROM PUBLIC'],
  ['disabled RLS','ALTER TABLE marketing_pause_recovery_attempts NO FORCE ROW LEVEL SECURITY','ALTER TABLE marketing_pause_recovery_attempts FORCE ROW LEVEL SECURITY'],
  ['missing claim index','DROP INDEX marketing_pause_recovery_one_reader',"CREATE UNIQUE INDEX marketing_pause_recovery_one_reader ON marketing_pause_recovery_attempts(job_id) WHERE state='RUNNING'"],
 ])('rejects catalog drift: %s',async(_name,damage,restore)=>{
  await fixture.pool.query(damage);try{expect((await inspect()).ready).toBe(false);}finally{await fixture.pool.query(restore);}expect((await inspect()).ready).toBe(true);
 });
 it.each([
  ['immutable column UPDATE','GRANT UPDATE(campaign_id) ON marketing_pause_recoveries TO recovery_reachable','REVOKE UPDATE(campaign_id) ON marketing_pause_recoveries FROM recovery_reachable'],
  ['attempt DELETE','GRANT DELETE ON marketing_pause_recovery_attempts TO recovery_reachable','REVOKE DELETE ON marketing_pause_recovery_attempts FROM recovery_reachable'],
  ['recovery ownership','ALTER TABLE marketing_pause_recoveries OWNER TO recovery_reachable','ALTER TABLE marketing_pause_recoveries OWNER TO harvo_test'],
 ])('rejects NOINHERIT reachable %s authority',async(_name,grant,revoke)=>{
  await fixture.pool.query('ALTER ROLE readiness_runtime NOINHERIT; CREATE ROLE recovery_reachable NOLOGIN; GRANT recovery_reachable TO readiness_runtime');
  await fixture.pool.query(grant);
  try { expect((await inspect()).ready).toBe(false); }
  finally { await fixture.pool.query(revoke); await fixture.pool.query('REVOKE recovery_reachable FROM readiness_runtime; DROP ROLE recovery_reachable; ALTER ROLE readiness_runtime INHERIT'); }
  expect((await inspect()).ready).toBe(true);
 });
 it('requires UPDATE in the current attempt-worker role; a NOINHERIT grant cannot satisfy it',async()=>{
  await fixture.pool.query(`ALTER ROLE readiness_runtime NOINHERIT; CREATE ROLE recovery_reachable NOLOGIN;
   GRANT recovery_reachable TO readiness_runtime; GRANT UPDATE ON marketing_pause_recovery_attempts TO recovery_reachable;
   REVOKE UPDATE ON marketing_pause_recovery_attempts FROM readiness_runtime`);
  try { expect((await inspect()).ready).toBe(false); }
  finally { await fixture.pool.query(`GRANT UPDATE ON marketing_pause_recovery_attempts TO readiness_runtime;
   REVOKE UPDATE ON marketing_pause_recovery_attempts FROM recovery_reachable;
   REVOKE recovery_reachable FROM readiness_runtime; DROP ROLE recovery_reachable; ALTER ROLE readiness_runtime INHERIT`); }
  expect((await inspect()).ready).toBe(true);
 });
 it('compares recorded checksums to exact packaged SQL, with missing and changed entries rejected',async()=>{
  const c=await runtime.connect();try{
   expect(await verifyMigrationHistory(c)).toBe(false);
   // This test verifies the manifest comparison only, not execution of the complete migration chain.
   for(const item of deployedMigrationManifest())await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',[item.version,item.checksum]);
   expect(await verifyMigrationHistory(c)).toBe(true);
   await fixture.pool.query('GRANT UPDATE(checksum) ON schema_migrations TO readiness_runtime');
   try{expect(await verifyMigrationHistory(c)).toBe(false);}finally{await fixture.pool.query('REVOKE UPDATE(checksum) ON schema_migrations FROM readiness_runtime');}
   await fixture.pool.query(`ALTER ROLE readiness_runtime NOINHERIT; CREATE ROLE history_modifier NOLOGIN;
    GRANT UPDATE(checksum) ON schema_migrations TO history_modifier; GRANT history_modifier TO readiness_runtime;`);
   try{expect(await verifyMigrationHistory(c)).toBe(false);}finally{await fixture.pool.query('REVOKE history_modifier FROM readiness_runtime');}
   expect(await verifyMigrationHistory(c)).toBe(true);
   await fixture.pool.query("INSERT INTO schema_migrations VALUES('999_unknown.sql',repeat('0',64))");
   expect(await verifyMigrationHistory(c)).toBe(false);
   await fixture.pool.query("DELETE FROM schema_migrations WHERE version='999_unknown.sql'");
   const owner=await fixture.pool.connect();
   try{expect(await verifyMigrationHistory(owner)).toBe(false);expect((await verifyRecoveryCatalog(owner)).ready).toBe(false);}finally{owner.release();}
   await fixture.pool.query("UPDATE schema_migrations SET checksum=repeat('0',64) WHERE version='022_marketing_pause_recovery_attempts.sql'");
   expect(await verifyMigrationHistory(c)).toBe(false);
  }finally{c.release();}
 });
});
