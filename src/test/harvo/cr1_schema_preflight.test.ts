import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import pg from 'pg';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareMigrationHistory} from '../../migrations/history.js';
import {readMigrationManifest} from '../../migrations/manifest.js';
import {schemaPreflightConfiguration, verifyDeploymentSchema} from '../../server/deployment/schemaPreflight.js';
import {createLocalPostgresFixture} from './postgres.js';

const manifest = [
  {version: '001_first.sql', checksum: 'a'.repeat(64)},
  {version: '003_second.sql', checksum: 'b'.repeat(64)},
];
describe('read-only exact migration comparison', () => {
  it('allows only a valid prefix during apply and requires every entry during preflight', () => {
    expect(compareMigrationHistory(manifest, [])).toEqual(manifest);
    expect(compareMigrationHistory(manifest, [manifest[0]])).toEqual([manifest[1]]);
    expect(compareMigrationHistory(manifest, [...manifest].reverse(), {requireComplete: true})).toEqual([]);
    expect(() => compareMigrationHistory(manifest, [manifest[0]], {requireComplete: true})).toThrow('MIGRATION_HISTORY_INCOMPLETE');
  });
  it.each([
    [[manifest[1]], 'MIGRATION_HISTORY_OUT_OF_ORDER'],
    [[...manifest, {version: '004_unknown.sql', checksum: 'c'.repeat(64)}], 'MIGRATION_HISTORY_UNKNOWN'],
    [[manifest[0], manifest[0]], 'MIGRATION_HISTORY_DUPLICATE'],
    [[{...manifest[0], checksum: null}], 'MIGRATION_CHECKSUM_MISMATCH'],
    [[{...manifest[0], checksum: 'd'.repeat(64)}], 'MIGRATION_CHECKSUM_MISMATCH'],
  ])('rejects history defect %#', (history, code) => {
    expect(() => compareMigrationHistory(manifest, history)).toThrow(code as string);
  });
  it('rejects invalid manifests before opening a database connection', async () => {
    const connect = vi.fn();
    await expect(verifyDeploymentSchema({connect} as unknown as pg.Pool,
      {environment:'LOCAL',target:'test',expectedRole:'runtime',expectedDatabase:'test',expectedHost:'localhost'}, manifest,
      [{...manifest[0], checksum: 'c'.repeat(64)}, manifest[1]])).rejects.toThrow('MIGRATION_CHECKSUM_MISMATCH');
    expect(connect).not.toHaveBeenCalled();
  });
  it('never uses ambient application credentials or weak remote TLS', () => {
    expect(() => schemaPreflightConfiguration({DATABASE_URL:'postgresql://secret:secret@remote.test/db'})).toThrow('DEPLOYMENT_TARGET_CONFIGURATION_INVALID');
    const env = {ENCHO_DEPLOYMENT_ENVIRONMENT:'STAGING', ENCHO_DEPLOYMENT_TARGET:'isolated-a',
      ENCHO_DEPLOYMENT_EXPECTED_DATABASE:'db', ENCHO_DEPLOYMENT_EXPECTED_ROLE:'runtime',
      ENCHO_DEPLOYMENT_EXPECTED_HOST:'remote.test',
      ENCHO_DEPLOYMENT_DATABASE_URL:'postgresql://runtime:secret@remote.test/db?sslmode=disable'};
    const config = schemaPreflightConfiguration(env);
    expect(config.connection.ssl).toEqual({rejectUnauthorized:true});
    expect(config.connection.connectionString).not.toContain('sslmode');
    expect(() => schemaPreflightConfiguration({...env, ENCHO_DEPLOYMENT_EXPECTED_ROLE:'owner'})).toThrow('DEPLOYMENT_TARGET_IDENTITY_MISMATCH');
    expect(() => schemaPreflightConfiguration({...env, ENCHO_DEPLOYMENT_EXPECTED_HOST:'primary.test'})).toThrow('DEPLOYMENT_TARGET_IDENTITY_MISMATCH');
    expect(() => schemaPreflightConfiguration({...env, ENCHO_DEPLOYMENT_DATABASE_URL:'postgresql://runtime@localhost/db'})).toThrow('DEPLOYMENT_ENVIRONMENT_MISMATCH');
  });
  it('rejects malformed SQL filenames instead of silently omitting them from the artifact', () => {
    const directory=mkdtempSync(join(tmpdir(),'encho-manifest-'));
    try {
      writeFileSync(join(directory,'001_valid.sql'),'SELECT 1;');
      expect(readMigrationManifest(directory)).toHaveLength(1);
      writeFileSync(join(directory,'002-invalid.sql'),'SELECT 2;');
      expect(()=>readMigrationManifest(directory)).toThrow('MIGRATION_MANIFEST_INVALID');
    } finally {rmSync(directory,{recursive:true,force:true});}
  });
  it('keeps build separate from remote database preflight', () => {
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(pkg.scripts.build).not.toContain('verify-schema-sync');
    const cli=readFileSync('scripts/deployment/verify-schema-sync.mjs','utf8');
    expect(cli).not.toContain("from 'dotenv'");
    expect(cli).not.toContain('executeMigrations');
    expect(cli).not.toContain('process.env.DATABASE_URL');
  });
});

describe('deployment preflight with actual restricted PostgreSQL login', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>, runtime:pg.Pool;
  beforeAll(async () => {
    fixture=await createLocalPostgresFixture({schema:'empty'});
    await fixture.pool.query(`CREATE ROLE schema_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
      GRANT USAGE ON SCHEMA public TO schema_runtime;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT);
      GRANT SELECT ON schema_migrations TO schema_runtime;`);
    runtime=new pg.Pool({...fixture.pool.options, user:'schema_runtime'});
  },30000);
  afterAll(async()=>{await runtime?.end();await fixture?.close();});
  beforeEach(async()=>{
    await fixture.pool.query('TRUNCATE schema_migrations');
    for(const row of manifest)await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',[row.version,row.checksum]);
  });
  const target=()=>({environment:'LOCAL',target:'disposable',expectedDatabase:String(fixture.pool.options.database),expectedRole:'schema_runtime',expectedHost:'localhost'});
  const verify=()=>verifyDeploymentSchema(runtime,target(),manifest,manifest);
  it('observes exact history without mutation from a real login',async()=>{
    const before=(await fixture.pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
    expect(await verify()).toMatchObject({status:'SCHEMA_IDENTITY_VERIFIED',migrationCount:2,productionCertification:false});
    expect((await fixture.pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows).toEqual(before);
  });
  it('rejects an extra migration that a subset checker would accept',async()=>{
    await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',['004_extra.sql','c'.repeat(64)]);
    await expect(verify()).rejects.toThrow('MIGRATION_HISTORY_UNKNOWN');
  });
  it('does not create or repair missing history',async()=>{
    await fixture.pool.query('ALTER TABLE schema_migrations RENAME TO saved_history');
    try {
      await expect(verify()).rejects.toThrow('MIGRATION_HISTORY_MISSING');
      expect((await fixture.pool.query("SELECT to_regclass('schema_migrations') AS name")).rows[0].name).toBeNull();
    } finally {await fixture.pool.query('ALTER TABLE saved_history RENAME TO schema_migrations');}
  });
  it('rejects owner login, wrong identity and mutable history',async()=>{
    const owner=String(fixture.pool.options.user);
    await expect(verifyDeploymentSchema(fixture.pool,{...target(),expectedRole:owner},manifest,manifest)).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');
    await expect(verifyDeploymentSchema(runtime,{...target(),expectedRole:'different'},manifest,manifest)).rejects.toThrow('DEPLOYMENT_TARGET_IDENTITY_MISMATCH');
    await fixture.pool.query('GRANT INSERT ON schema_migrations TO schema_runtime');
    try {await expect(verify()).rejects.toThrow('MIGRATION_HISTORY_MUTABLE');}
    finally {await fixture.pool.query('REVOKE INSERT ON schema_migrations FROM schema_runtime');}
  });
  it('rejects NOINHERIT membership capable of switching to an object owner',async()=>{
    await fixture.pool.query(`CREATE ROLE schema_owner NOLOGIN; CREATE TABLE owner_probe(id INT);
      ALTER TABLE owner_probe OWNER TO schema_owner; GRANT schema_owner TO schema_runtime;`);
    try {await expect(verify()).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');}
    finally {await fixture.pool.query('REVOKE schema_owner FROM schema_runtime');}
  });
  it('rejects NOINHERIT schema CREATE authority even without owned objects',async()=>{
    await fixture.pool.query(`CREATE ROLE schema_creator NOLOGIN; GRANT CREATE ON SCHEMA public TO schema_creator;
      GRANT schema_creator TO schema_runtime;`);
    try {await expect(verify()).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');}
    finally {await fixture.pool.query('REVOKE schema_creator FROM schema_runtime');}
  });
  it('rejects database ownership when public objects are owned separately',async()=>{
    // Database identifiers originate in the local fixture, quoted by format(%I).
    const command=(await fixture.pool.query("SELECT format('ALTER DATABASE %I OWNER TO schema_runtime',current_database()) AS sql")).rows[0].sql;
    const restore=(await fixture.pool.query("SELECT format('ALTER DATABASE %I OWNER TO %I',current_database(),current_user) AS sql")).rows[0].sql;
    await fixture.pool.query(command);
    try {await expect(verify()).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');}
    finally {await fixture.pool.query(restore);}
  });
  it('rejects NOINHERIT database CREATE authority',async()=>{
    await fixture.pool.query('CREATE ROLE database_creator NOLOGIN; GRANT database_creator TO schema_runtime');
    const command=(await fixture.pool.query("SELECT format('GRANT CREATE ON DATABASE %I TO database_creator',current_database()) AS sql")).rows[0].sql;
    await fixture.pool.query(command);
    try {await expect(verify()).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');}
    finally {await fixture.pool.query('REVOKE database_creator FROM schema_runtime');}
  });
  it.each(['INSERT(version)','UPDATE(checksum)','REFERENCES(version)'])('rejects history column privilege %s',async(privilege)=>{
    // Privilege clauses are fixed test cases, never request input.
    await fixture.pool.query(`GRANT ${privilege} ON schema_migrations TO schema_runtime`);
    try {await expect(verify()).rejects.toThrow('MIGRATION_HISTORY_MUTABLE');}
    finally {await fixture.pool.query(`REVOKE ${privilege} ON schema_migrations FROM schema_runtime`);}
  });
  it('rejects NOINHERIT history writer membership',async()=>{
    await fixture.pool.query(`CREATE ROLE history_writer NOLOGIN;
      GRANT UPDATE(checksum) ON schema_migrations TO history_writer; GRANT history_writer TO schema_runtime;`);
    try {await expect(verify()).rejects.toThrow('MIGRATION_HISTORY_MUTABLE');}
    finally {await fixture.pool.query('REVOKE history_writer FROM schema_runtime');}
  });
  it('cannot attest a schema while a migration holds the exclusive lock',async()=>{
    const client=await fixture.pool.connect();await client.query('SELECT pg_advisory_lock(82749102)');
    try {await expect(verify()).rejects.toThrow('MIGRATION_LOCK_BUSY');}
    finally {await client.query('SELECT pg_advisory_unlock(82749102)');client.release();}
    expect((await verify()).status).toBe('SCHEMA_IDENTITY_VERIFIED');
  });
});
