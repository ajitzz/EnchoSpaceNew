import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createLocalPostgresFixture } from './postgres.js';
import { verifyDeploymentSchema } from '../../server/deployment/schemaPreflight.js';

// Independent review regression: no remote URLs, isolated Unix-socket cluster.
describe('R2-02 database authority reviewer regression', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let owner: pg.Pool;
  const manifest = [{ version: '001_review.sql', checksum: 'a'.repeat(64) }];
  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query('CREATE ROLE isolated_db_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT');
    await fixture.pool.query('CREATE DATABASE review_owned OWNER isolated_db_owner');
    const setup = new pg.Pool({ ...fixture.pool.options, database: 'review_owned' });
    try {
      await setup.query(`ALTER SCHEMA public OWNER TO harvo_test;
        REVOKE ALL ON SCHEMA public FROM PUBLIC;
        GRANT USAGE ON SCHEMA public TO isolated_db_owner;
        CREATE TABLE public.schema_migrations(version TEXT PRIMARY KEY, checksum TEXT);
        GRANT SELECT ON public.schema_migrations TO isolated_db_owner;`);
      await setup.query('INSERT INTO public.schema_migrations VALUES($1,$2)', [manifest[0].version, manifest[0].checksum]);
    } finally { await setup.end(); }
    owner = new pg.Pool({ ...fixture.pool.options, database: 'review_owned', user: 'isolated_db_owner' });
  }, 30000);
  afterAll(async () => { await owner?.end(); await fixture?.close(); });
  it('rejects a database owner even when public/schema-history ownership and CREATE are removed', async () => {
    await expect(verifyDeploymentSchema(owner, { environment: 'LOCAL', target: 'review-disposable', expectedDatabase: 'review_owned', expectedRole: 'isolated_db_owner', expectedHost: 'localhost' }, manifest, manifest)).rejects.toThrow('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');
  });
});
