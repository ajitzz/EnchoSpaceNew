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
  ['disabled RLS','ALTER TABLE marketing_pause_recovery_attempts NO FORCE ROW LEVEL SECURITY','ALTER TABLE marketing_pause_recovery_attempts FORCE ROW LEVEL SECURITY'],
  ['missing claim index','DROP INDEX marketing_pause_recovery_one_reader',"CREATE UNIQUE INDEX marketing_pause_recovery_one_reader ON marketing_pause_recovery_attempts(job_id) WHERE state='RUNNING'"],
 ])('rejects catalog drift: %s',async(_name,damage,restore)=>{
  await fixture.pool.query(damage);try{expect((await inspect()).ready).toBe(false);}finally{await fixture.pool.query(restore);}expect((await inspect()).ready).toBe(true);
 });
 it('compares recorded checksums to exact packaged SQL, with missing and changed entries rejected',async()=>{
  const c=await runtime.connect();try{
   expect(await verifyMigrationHistory(c)).toBe(false);
   // This test verifies the manifest comparison only, not execution of the complete migration chain.
   for(const item of deployedMigrationManifest())await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',[item.version,item.checksum]);
   expect(await verifyMigrationHistory(c)).toBe(true);
   await fixture.pool.query("UPDATE schema_migrations SET checksum=repeat('0',64) WHERE version='022_marketing_pause_recovery_attempts.sql'");
   expect(await verifyMigrationHistory(c)).toBe(false);
  }finally{c.release();}
 });
});
