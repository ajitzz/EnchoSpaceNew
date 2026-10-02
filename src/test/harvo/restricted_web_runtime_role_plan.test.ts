import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createWorkflowPgFixture } from './workflowPgFixture.js';
import { installInquirySchema } from './inquiryPgSchema.js';
import { restrictedWebRuntimeRolePlan } from '../../server/deployment/restrictedWebRuntimeRolePlan.js';
import { verifyRuntimeDatabaseAuthority } from '../../server/deployment/runtimeDatabaseAuthority.js';
import { verifyMigrationHistory, verifyRecoveryCatalog, deployedMigrationManifest } from '../../server/deployment/recoveryReadiness.js';
import { verifyPortfolioCatalog } from '../../server/deployment/portfolioReadiness.js';
import { verifyAdtechCatalog } from '../../server/deployment/adtechReadiness.js';
import { databaseReadiness } from '../../server/deployment/databaseReadiness.js';

const role = 'local_web_runtime';

describe('fresh web runtime role plan on a separate disposable PostgreSQL LOGIN', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>;
  let runtime: pg.Pool;

  beforeAll(async () => {
    fixture = await createWorkflowPgFixture();
      await installInquirySchema(fixture.pool);
      await fixture.pool.query(`
        ALTER TABLE users ADD COLUMN email TEXT, ADD COLUMN password_hash TEXT,
          ADD COLUMN phone TEXT, ADD COLUMN google_id TEXT, ADD COLUMN avatar TEXT,
          ADD COLUMN editorial_quote TEXT;
        CREATE SEQUENCE users_id_seq;
        ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');
        CREATE TABLE settings(key TEXT PRIMARY KEY,value JSONB);
        CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users,
          entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,created_at TIMESTAMPTZ DEFAULT now());
        CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL);
      `);
      // This ledger is synthetic fixture setup. It tests the role's read-only
      // history authority and is never a substitute for applying 001–047.
      for (const entry of deployedMigrationManifest()) {
        await fixture.pool.query('INSERT INTO schema_migrations VALUES($1,$2)', [entry.version, entry.checksum]);
      }
      for (const file of [
        '014_harvo_marketing_request_limits.sql',
        '023_marketing_product_facts.sql', '024_marketing_keyword_research.sql',
        '025_marketing_revision_products.sql', '026_search_portfolio_shadow.sql',
        '027_marketing_attribution_links.sql', '028_marketing_consent_touchpoints.sql',
        '029_marketing_destination_pools.sql', '030_marketing_spatial_stories.sql',
        '031_marketing_inquiry_attribution.sql', '032_marketing_adtech_registry.sql',
        '033_marketing_adtech_corridors.sql', '034_marketing_adtech_bindings.sql',
        '035_marketing_corridor_inference.sql',
      ]) {
        await fixture.pool.query(readFileSync(`src/migrations/${file}`, 'utf8'));
      }
      // The minimal workflow fixture predates the public guest catalogue.
      // Model only the relations whose SELECT grants this role plan declares.
      for (const name of ['calendar_prices', 'experiences', 'experience_wishlists',
        'room_types', 'media_assets', 'room_calendar_blocks', 'inventory_days', 'offers']) {
        await fixture.pool.query(`CREATE TABLE IF NOT EXISTS public.${name}(id integer primary key)`);
      }
      for (const statement of restrictedWebRuntimeRolePlan(role)) {
        await fixture.pool.query(statement);
      }
      runtime = new pg.Pool({ ...fixture.pool.options, user: role });
  }, 60_000);

  afterAll(async () => { await runtime?.end(); await fixture?.close(); });

  it('uses a separate non-owner LOGIN with no reachable privileged membership or CREATE', async () => {
    const client = await runtime.connect();
    try {
      expect((await client.query('SELECT session_user,current_user')).rows[0]).toEqual({ session_user: role, current_user: role });
      expect(await verifyRuntimeDatabaseAuthority(client)).toEqual({
        safe: true, known: true, roleBypassesRls: false, ownsObjects: false, canCreate: false,
      });
      expect((await client.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole
        FROM pg_roles WHERE rolname=current_user`)).rows[0]).toEqual({
        rolcanlogin: true, rolinherit: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false,
      });
    } finally { client.release(); }
  });

  it('passes exact recovery/portfolio/adtech catalogs and can read, never mutate, migration history', async () => {
    const client = await runtime.connect();
    try {
      expect(await verifyMigrationHistory(client)).toBe(true);
      expect((await verifyRecoveryCatalog(client)).ready).toBe(true);
      expect(await verifyPortfolioCatalog(client)).toEqual({ready:true,policyValid:true,privileges:true,immutable:true});
      expect(await verifyAdtechCatalog(client)).toEqual({ready:true,policyValid:true,privileges:true,immutable:true,integrity:true});
    } finally { client.release(); }
  });

  it('supports the real account SQL shape from login, registration and Google linking', async () => {
    const inserted = (await runtime.query(`INSERT INTO users(email,password_hash,name,role)
      VALUES($1,$2,$3,$4) RETURNING id,email,name,role`, ['local-only@example.test', 'isolated-hash', 'Fixture user', 'user'])).rows[0];
    expect(inserted).toMatchObject({ email: 'local-only@example.test', role: 'user' });
    const found = (await runtime.query('SELECT * FROM users WHERE email=$1', ['local-only@example.test'])).rows[0];
    expect(found.id).toBe(inserted.id);
    await runtime.query('UPDATE users SET google_id=$1 WHERE id=$2', ['isolated-google-id', inserted.id]);
    expect((await runtime.query('SELECT google_id FROM users WHERE id=$1', [inserted.id])).rows[0].google_id)
      .toBe('isolated-google-id');
    await runtime.query('SELECT value FROM settings WHERE key=$1', ['authorized_experience_hosts']);
    await runtime.query('SELECT id FROM calendar_prices LIMIT 0');
  });

  it('rejects schema writes, history edits, account privilege escalation and destructive evidence grants', async () => {
    const rejected = async (sql: string) => expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
    await rejected('CREATE TABLE role_escape(id INT)');
    await rejected(`INSERT INTO schema_migrations VALUES('999_unknown.sql',repeat('0',64))`);
    await rejected("UPDATE schema_migrations SET checksum='changed'");
    await rejected("UPDATE users SET role='admin' WHERE email='local-only@example.test'");
    await rejected('DELETE FROM users WHERE email=\'local-only@example.test\'');
    await rejected('UPDATE marketing_pause_recoveries SET campaign_id=campaign_id');
    await rejected('DELETE FROM marketing_pause_recovery_attempts');
    await rejected('UPDATE marketing_fact_snapshots SET fact_hash=fact_hash');
  });

  it('does not turn a partial/synthetic schema into full deployment readiness', async () => {
    const result = await databaseReadiness(runtime);
    expect(result.authority.safe).toBe(true);
    expect(result.migrationsValid).toBe(true);
    expect(result.recovery.ready).toBe(true);
    expect(result.portfolio.ready).toBe(true);
    expect(result.adtech.ready).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('rejects role names that could alter SQL structure', () => {
    expect(() => restrictedWebRuntimeRolePlan('runtime; DROP TABLE users')).toThrow('RUNTIME_ROLE_INVALID');
  });
});
