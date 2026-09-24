import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createLocalPostgresFixture} from './postgres.js';
import {executeMigrations,validateMigrationEntries,migrationStatementSurface,type MigrationEntry} from '../../migrations/execution.js';
import {migrationConnectionConfig,validateDatabaseUrl} from '../../migrations/runner.js';

const entry=(file:string,sql:string):MigrationEntry=>({file,sql,checksum:createHash('sha256').update(sql).digest('hex')});
const first=entry('001_first.sql','CREATE TABLE migration_probe(id INTEGER PRIMARY KEY); INSERT INTO migration_probe VALUES(1);');
const next=entry('002_next.sql','CREATE TABLE migration_next(id INTEGER PRIMARY KEY);');
describe('CR1 migration execution integrity on disposable PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createLocalPostgresFixture>>;
 beforeAll(async()=>{fixture=await createLocalPostgresFixture({schema:'empty'});},30000);
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{await fixture.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');});
 it('records exact checksums atomically and skips only matching history',async()=>{
  expect(await executeMigrations(fixture.pool,[first,next])).toEqual([{file:first.file,status:'applied'},{file:next.file,status:'applied'}]);
  expect((await fixture.pool.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows).toEqual([{version:first.file,checksum:first.checksum},{version:next.file,checksum:next.checksum}]);
  expect((await executeMigrations(fixture.pool,[first,next])).every(row=>row.status==='skipped')).toBe(true);
 });
 it('stops before pending DDL on checksum drift or missing checksum',async()=>{
  await executeMigrations(fixture.pool,[first]);
  for(const checksum of [null,'f'.repeat(64)]){
   await fixture.pool.query('UPDATE schema_migrations SET checksum=$1',[checksum]);
   await expect(executeMigrations(fixture.pool,[first,next])).rejects.toMatchObject({code:'MIGRATION_CHECKSUM_MISMATCH'});
   expect((await fixture.pool.query("SELECT to_regclass('migration_next') AS name")).rows[0].name).toBeNull();
  }
 });
 it('rejects unknown history and gaps instead of executing backward',async()=>{
  await executeMigrations(fixture.pool,[first,next]);
  await expect(executeMigrations(fixture.pool,[first])).rejects.toMatchObject({code:'MIGRATION_HISTORY_UNKNOWN'});
  await fixture.pool.query('DELETE FROM schema_migrations WHERE version=$1',[first.file]);
  await expect(executeMigrations(fixture.pool,[first,next])).rejects.toMatchObject({code:'MIGRATION_HISTORY_OUT_OF_ORDER'});
 });
 it('rolls back failed DDL and stops subsequent migrations with sanitized diagnostics',async()=>{
  const broken=entry('002_broken.sql',"CREATE TABLE temporary_probe(id INT); DO $$ BEGIN RAISE EXCEPTION 'private-host@example.test'; END $$;");
  const outcome=await executeMigrations(fixture.pool,[first,broken,entry('003_after.sql','CREATE TABLE after_failure(id INT);')]);
  expect(outcome).toHaveLength(2);expect(outcome[1]).toEqual({file:broken.file,status:'failed',error:'MIGRATION_STATEMENT_FAILED_P0001'});
  expect(JSON.stringify(outcome)).not.toContain('private-host');
  expect((await fixture.pool.query("SELECT to_regclass('temporary_probe') AS failed,to_regclass('after_failure') AS later")).rows[0]).toEqual({failed:null,later:null});
  expect((await fixture.pool.query('SELECT version FROM schema_migrations')).rows).toEqual([{version:first.file}]);
 });
 it('serializes concurrent runners on one held advisory lock',async()=>{
  const slow=entry('001_slow.sql','SELECT pg_sleep(0.15); CREATE TABLE migration_probe(id INT); INSERT INTO migration_probe VALUES(1);');
  const runs=await Promise.all([executeMigrations(fixture.pool,[slow]),executeMigrations(fixture.pool,[slow])]);
  expect(runs.flat().map(row=>row.status).sort()).toEqual(['applied','skipped']);
  expect((await fixture.pool.query('SELECT count(*) FROM migration_probe')).rows[0].count).toBe('1');
 });
 it('bounds lock acquisition without abandoning a pooled lock',async()=>{
  const held=await fixture.pool.connect();await held.query('SELECT pg_advisory_lock(82749102)');
  try{await expect(executeMigrations(fixture.pool,[first],{lockTimeoutMs:10})).rejects.toMatchObject({code:'MIGRATION_LOCK_TIMEOUT'});}
  finally{await held.query('SELECT pg_advisory_unlock(82749102)');held.release();}
  expect((await executeMigrations(fixture.pool,[first]))[0].status).toBe('applied');
 });
 it('quarantines a lost COMMIT acknowledgement and reconciles through matching history',async()=>{
  let lose=true;
  const wrapped=new Proxy(fixture.pool,{get(target,key){
   if(key!=='connect')return Reflect.get(target,key,target);
   return async()=>{
    const client=await target.connect();
    return new Proxy(client,{get(connection,field){
     if(field!=='query'){const value=Reflect.get(connection,field,connection);return typeof value==='function'?value.bind(connection):value;}
     return async(...args:unknown[])=>{const result=await Reflect.apply(connection.query,connection,args);if(args[0]==='COMMIT'&&lose){lose=false;throw new Error('Lost acknowledgement with private value');}return result;};
    }});
   };
  }});
  expect(await executeMigrations(wrapped,[first,next])).toEqual([{file:first.file,status:'unknown',error:'MIGRATION_COMMIT_UNKNOWN'}]);
  expect(await executeMigrations(fixture.pool,[first,next])).toEqual([{file:first.file,status:'skipped'},{file:next.file,status:'applied'}]);
 });
});

describe('CR1 migration manifest and connection boundaries',()=>{
 it('pins remote TLS and never mistakes credentials containing localhost for a local host',()=>{
  const config=migrationConnectionConfig('postgresql://owner:localhost@branch.neon.tech/database?sslmode=disable');
  expect(config.ssl).toEqual({rejectUnauthorized:true});expect(config.connectionString).not.toContain('sslmode');
  expect(migrationConnectionConfig('postgresql://owner@127.0.0.1/database').ssl).toBe(false);
  for(const url of ['postgresql://owner:secret@host/db?options=unsafe','postgresql://owner:secret@host/db?sslcert=/private','postgresql://','garbage-secret','postgresql://owner@remote.test/db']){
   const parsed=validateDatabaseUrl(url);expect(parsed.isValid).toBe(false);expect(parsed.error).not.toContain(url);
  }
 });
 it('rejects checksum fabrication, duplicate numbers and transaction escape scripts',()=>{
  expect(()=>validateMigrationEntries([{...first,checksum:'a'.repeat(64)}])).toThrow('MIGRATION_MANIFEST_CHECKSUM_INVALID');
  expect(()=>validateMigrationEntries([first,entry('001_duplicate.sql','SELECT 1')])).toThrow('MIGRATION_ORDER_INVALID');
  for(const sql of ['-- NON-TRANSACTIONAL\nCREATE INDEX foo ON probe(id);','CREATE INDEX CONCURRENTLY foo ON probe(id);','SELECT 1; COMMIT; CREATE TABLE unsafe(id INT);','BEGIN; SELECT 1;']){
   expect(()=>validateMigrationEntries([entry('001_unsafe.sql',sql)])).toThrow('MIGRATION_TRANSACTION_CONTRACT_INVALID');
  }
 });
 it('distinguishes function bodies and comments from executable transaction commands',()=>{
  const sql="/* outer /* COMMIT; */ comment */ DO $body$ BEGIN RAISE NOTICE 'CONCURRENTLY'; END $body$; -- BEGIN\n SELECT 'COMMIT;';";
  expect(validateMigrationEntries([entry('001_function.sql',sql)])).toHaveLength(1);
  expect(migrationStatementSurface("SELECT '\\'; COMMIT;")).toMatch(/COMMIT/);
  expect(()=>migrationStatementSurface('/* unterminated')).toThrow('MIGRATION_SQL_UNTERMINATED');
 });
});
