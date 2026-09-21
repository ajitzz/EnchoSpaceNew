import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {chmodSync,mkdtempSync,readFileSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parse} from 'dotenv';
import type pg from 'pg';
import {provisionAttributionKey} from '../../../scripts/deployment/provision-attribution-key.mjs';
import {MarketingAttributionLinks} from '../../lib/marketing/portfolio/attribution.js';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {installInquirySchema} from './inquiryPgSchema.js';
import {deployedMigrationManifest} from '../../server/deployment/recoveryReadiness.js';
import {portfolioRolloutGrants,rehearsePortfolioRollout,stagedRehearsalConnection} from '../../server/deployment/portfolioRehearsal.js';

// Parsing explicit fixture bytes is pure; ambient dotenv file loading stays disabled.
vi.mock('dotenv',async()=>({parse:(await vi.importActual<typeof import('dotenv')>('dotenv')).parse,config:()=>({parsed:{}}),default:{config:()=>({parsed:{}})}}));

describe('explicit staging target before network access',()=>{
  const env = {HARVO_STAGING_CONFIRMED:'true',HARVO_STAGING_BRANCH_ID:'br-fixture',HARVO_STAGING_EXPECTED_HOST:'ep-fixture.neon.tech',HARVO_STAGING_EXPECTED_DATABASE:'fixture',HARVO_STAGING_RUNTIME_ROLE:'fixture_runtime',HARVO_STAGING_MIGRATION_URL:'postgresql://fixture:fixture@ep-fixture.neon.tech/fixture?sslmode=require&channel_binding=require'};
  it('pins the direct endpoint/database and preserves verified TLS',()=>{
    const config = stagedRehearsalConnection(env);
    expect(config.ssl).toEqual({rejectUnauthorized:true});expect(config.enableChannelBinding).toBe(true);
    expect(new URL(config.connectionString!).searchParams.has('sslmode')).toBe(false);
    expect(env.HARVO_STAGING_MIGRATION_URL).toContain('sslmode=require');
  });
  it.each([
    {HARVO_STAGING_CONFIRMED:''}, {HARVO_STAGING_BRANCH_ID:''}, {HARVO_STAGING_EXPECTED_HOST:'ep-other.neon.tech'},
    {HARVO_STAGING_EXPECTED_DATABASE:'other'}, {HARVO_STAGING_MIGRATION_URL:'postgresql://fixture:fixture@ep-fixture-pooler.neon.tech/fixture'},
    {HARVO_STAGING_MIGRATION_URL:env.HARVO_STAGING_MIGRATION_URL+'&options=endpoint%3Dother'},
  ])('rejects missing attestation or a mismatched target',override=>expect(()=>stagedRehearsalConnection({...env,...override})).toThrow());
});

describe('HARVO-034 private local signing key provision',()=>{
  const directory = mkdtempSync(join(tmpdir(),'harvo034-key-'));
  afterAll(()=>rmSync(directory,{recursive:true,force:true}));
  it('creates a runtime-valid 32-byte key once without returning its secret, and preserves it on repeat',()=>{
    const file = join(directory,'.env.attribution.local');
    const receipt = provisionAttributionKey(file);
    const before = readFileSync(file,'utf8');
    const ring = JSON.parse(parse(before).HARVO_ATTRIBUTION_KEYS);
    expect(receipt.status).toBe('CREATED');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(Buffer.from(ring.keys[ring.active],'base64url').length).toBe(32);
    expect(JSON.stringify(receipt)).not.toContain(ring.keys[ring.active]);
    const links = new MarketingAttributionLinks({} as pg.Pool,{id:90,role:'system'},'https://stage.encho.example',ring);
    expect(links.visitorSubject(links.createVisitor())).toMatch(/^[a-f0-9]{64}$/);
    expect(provisionAttributionKey(file).status).toBe('PRESERVED');
    expect(readFileSync(file,'utf8')).toBe(before);
  });
  it('refuses symlinks, public permissions and invalid existing keys without replacing them',()=>{
    const file = join(directory,'.env.invalid.local');
    writeFileSync(file,'HARVO_ATTRIBUTION_KEYS=invalid\n',{mode:0o600});
    expect(()=>provisionAttributionKey(file)).toThrow();
    expect(readFileSync(file,'utf8')).toBe('HARVO_ATTRIBUTION_KEYS=invalid\n');
    chmodSync(file,0o644);
    expect(()=>provisionAttributionKey(file)).toThrow('PRIVATE_SECRET_FILE_REQUIRED');
    const link = join(directory,'.env.symlink.local');symlinkSync(file,link);
    expect(()=>provisionAttributionKey(link)).toThrow();
    expect(()=>provisionAttributionKey(join(directory,'keys.json'))).toThrow('IGNORED_LOCAL_SECRET_FILE_REQUIRED');
  });
});

describe('HARVO-034 transactional migration rehearsal',()=>{
  let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
  const role = 'harvo034_runtime';
  beforeAll(async()=>{
    fixture=await createWorkflowPgFixture();
    await installInquirySchema(fixture.pool);
    for(const file of ['014_harvo_marketing_request_limits.sql','023_marketing_product_facts.sql','024_marketing_keyword_research.sql','025_marketing_revision_products.sql','026_search_portfolio_shadow.sql']) await fixture.pool.query(readFileSync(`src/migrations/${file}`,'utf8'));
    await fixture.pool.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO ${role};
      GRANT SELECT,INSERT ON marketing_fact_snapshots,marketing_revision_products,marketing_campaign_search_targets,marketing_campaign_search_scopes,marketing_search_conflict_assessments,marketing_search_conflict_reviews TO ${role};
      GRANT SELECT,INSERT,UPDATE,DELETE ON marketing_keyword_research TO ${role};
      GRANT SELECT,INSERT,UPDATE ON marketing_keyword_customer_slots TO ${role};
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL)`);
    // Synthetic history tests drift handling. This fixture is not a full 001–026 deployment rehearsal.
    for(const row of deployedMigrationManifest().filter(m=>Number(m.version.slice(0,3))<27)) await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)',[row.version,row.checksum]);
  });
  afterAll(async()=>{await fixture?.close();});
  async function rehearsal(runtime=role){const c=await fixture.pool.connect();try{return await rehearsePortfolioRollout(c,runtime);}finally{c.release();}}
  async function remainsUnchanged(){
    expect((await fixture.pool.query("SELECT to_regclass('marketing_attribution_links') AS relation")).rows[0].relation).toBeNull();
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version LIKE '027_%'")).rows[0].count).toBe(0);
    expect((await fixture.pool.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='messages' AND column_name='client_event_id'")).rows[0].count).toBe(0);
  }
  it('executes exact 027–031 and grants under a restricted role, then rolls back DDL and history',async()=>{
    const result=await rehearsal();
    expect(result.status).toBe('REHEARSED_ROLLED_BACK');
    expect(result.executed).toHaveLength(5);
    expect(result.portfolio).toEqual({ready:true,policyValid:true,privileges:true,immutable:true});
    await remainsUnchanged();
  });
  it('rejects missing or changed prerequisite checksums before any new DDL',async()=>{
    const row=deployedMigrationManifest().find(m=>m.version.startsWith('026_'))!;
    await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',['drift',row.version]);
    try {await expect(rehearsal()).rejects.toThrow('MIGRATION_HISTORY_MISSING_OR_DRIFTED');await remainsUnchanged();}
    finally {await fixture.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',[row.checksum,row.version]);}
  });
  it('refuses privileged runtime roles and inherited or SET ROLE paths to the owner',async()=>{
    await expect(rehearsal('harvo_test')).rejects.toThrow('RUNTIME_ROLE_UNSAFE');
    await fixture.pool.query(`CREATE ROLE harvo034_owner NOLOGIN; GRANT harvo_test TO harvo034_owner; GRANT harvo034_owner TO ${role}`);
    try {await expect(rehearsal()).rejects.toThrow('RUNTIME_ROLE_OWNER_OR_PRIVILEGED_MEMBER');}
    finally {await fixture.pool.query(`REVOKE harvo034_owner FROM ${role}`);}
    await remainsUnchanged();
  });
  it('refuses concurrent migration execution rather than waiting indefinitely',async()=>{
    const lock=await fixture.pool.connect();
    try {
      await lock.query('SELECT pg_advisory_lock(82749102)');
      await expect(rehearsal()).rejects.toThrow('MIGRATION_LOCK_BUSY');
    } finally {await lock.query('SELECT pg_advisory_unlock(82749102)');lock.release();}
    await remainsUnchanged();
  });
  it('rolls back new migrations when pre-existing default privileges overgrant the runtime',async()=>{
    await fixture.pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT UPDATE ON TABLES TO ${role}`);
    try {await expect(rehearsal()).rejects.toThrow('PORTFOLIO_CATALOG_REJECTED');await remainsUnchanged();}
    finally {await fixture.pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON TABLES FROM ${role}`);}
  });
  it('rejects unsafe identifier interpolation',()=>{
    expect(()=>portfolioRolloutGrants('runtime; DROP TABLE users')).toThrow('RUNTIME_ROLE_INVALID');
  });
});
