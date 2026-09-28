import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createLocalPostgresFixture } from './postgres.js';
import { verifyRuntimeDatabaseAuthority } from '../../server/deployment/runtimeDatabaseAuthority.js';
import { databaseReadiness } from '../../server/deployment/databaseReadiness.js';

describe('runtime authority on actual disposable PostgreSQL LOGIN sessions', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>, runtime: pg.Pool;
  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query(`CREATE ROLE authority_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
      CREATE ROLE authority_parent NOLOGIN NOINHERIT;
      CREATE ROLE authority_grandparent NOLOGIN;
      GRANT authority_grandparent TO authority_parent;
      GRANT authority_parent TO authority_runtime;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO authority_runtime;
      CREATE TABLE public.listings(id INTEGER);
      CREATE FUNCTION public.authority_probe() RETURNS INT LANGUAGE SQL AS 'SELECT 1';
      CREATE TYPE public.authority_kind AS ENUM ('TEST');`);
    runtime = new pg.Pool({ ...fixture.pool.options, user: 'authority_runtime' });
  });
  afterAll(async () => { await runtime?.end(); await fixture?.close(); });
  async function inspect() {
    const client = await runtime.connect();
    try {
      await client.query('BEGIN READ ONLY');
      expect((await client.query('SELECT session_user, current_user')).rows[0])
        .toEqual({ session_user: 'authority_runtime', current_user: 'authority_runtime' });
      const result = await verifyRuntimeDatabaseAuthority(client);
      await client.query('COMMIT');
      return result;
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  it('accepts a restricted LOGIN with harmless NOINHERIT ancestors, within read-only transactions', async () => {
    expect(await inspect()).toEqual({ safe: true, known: true, roleBypassesRls: false, ownsObjects: false, canCreate: false });
  });
  it('denies unknown catalog results without inventing a bypass observation', async () => {
    const unavailable = { query: async () => ({ rows: [{}] }) } as unknown as pg.PoolClient;
    expect(await verifyRuntimeDatabaseAuthority(unavailable)).toEqual({ safe: false, known: false,
      roleBypassesRls: null, ownsObjects: null, canCreate: null });
  });
  const flagCases = ['SUPERUSER', 'BYPASSRLS', 'CREATEROLE', 'CREATEDB', 'REPLICATION'] as const;
  for (const role of ['authority_runtime', 'authority_grandparent']) {
    it.each(flagCases)(`rejects ${role} %s authority, even through NOINHERIT memberships`, async flag => {
      // Role names and flags are compile-time test constants, never caller input.
      await fixture.pool.query(`ALTER ROLE ${role} ${flag}`);
      try { expect((await inspect()).safe).toBe(false); }
      finally { await fixture.pool.query(`ALTER ROLE ${role} NO${flag}`); }
      expect((await inspect()).safe).toBe(true);
    });
  }
  it.each([
    ['schema', 'GRANT CREATE ON SCHEMA public TO authority_runtime', 'REVOKE CREATE ON SCHEMA public FROM authority_runtime'],
    ['database', 'GRANT CREATE ON DATABASE postgres TO authority_runtime', 'REVOKE CREATE ON DATABASE postgres FROM authority_runtime'],
    ['reachable schema', 'GRANT CREATE ON SCHEMA public TO authority_grandparent', 'REVOKE CREATE ON SCHEMA public FROM authority_grandparent'],
    ['reachable database', 'GRANT CREATE ON DATABASE postgres TO authority_grandparent', 'REVOKE CREATE ON DATABASE postgres FROM authority_grandparent'],
    ['PUBLIC schema', 'GRANT CREATE ON SCHEMA public TO PUBLIC', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC'],
  ])('rejects %s CREATE authority', async (_name, grant, revoke) => {
    await fixture.pool.query(grant);
    try { expect((await inspect()).safe).toBe(false); }
    finally { await fixture.pool.query(revoke); }
    expect((await inspect()).safe).toBe(true);
  });
  it.each([
    ['table', 'ALTER TABLE public.listings OWNER TO authority_runtime', 'ALTER TABLE public.listings OWNER TO harvo_test'],
    ['reachable table', 'ALTER TABLE public.listings OWNER TO authority_grandparent', 'ALTER TABLE public.listings OWNER TO harvo_test'],
    ['reachable function', 'ALTER FUNCTION public.authority_probe() OWNER TO authority_grandparent', 'ALTER FUNCTION public.authority_probe() OWNER TO harvo_test'],
    ['reachable type', 'ALTER TYPE public.authority_kind OWNER TO authority_grandparent', 'ALTER TYPE public.authority_kind OWNER TO harvo_test'],
    ['reachable schema', 'ALTER SCHEMA public OWNER TO authority_grandparent', 'ALTER SCHEMA public OWNER TO pg_database_owner'],
    ['reachable database', 'ALTER DATABASE postgres OWNER TO authority_grandparent', 'ALTER DATABASE postgres OWNER TO harvo_test'],
  ])('rejects %s ownership', async (_name, grant, revoke) => {
    await fixture.pool.query(grant);
    try { expect((await inspect()).ownsObjects).toBe(true); expect((await inspect()).safe).toBe(false); }
    finally { await fixture.pool.query(revoke); }
    expect((await inspect()).safe).toBe(true);
  });
  it('rejects privileged login identity concealed by SET ROLE to a restricted role', async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL ROLE authority_runtime');
      expect((await verifyRuntimeDatabaseAuthority(client)).safe).toBe(false);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  it('wires the guard into databaseReadiness and never lets a listings owner excuse BYPASSRLS', async () => {
    await fixture.pool.query('ALTER TABLE public.listings OWNER TO authority_runtime; ALTER ROLE authority_runtime BYPASSRLS');
    try {
      const result = await databaseReadiness(runtime);
      expect(result.ready).toBe(false);
      expect(result.roleBypassesRls).toBe(true);
      expect(result.authority).toMatchObject({ safe: false, known: true, ownsObjects: true });
    } finally { await fixture.pool.query('ALTER TABLE public.listings OWNER TO harvo_test; ALTER ROLE authority_runtime NOBYPASSRLS'); }
  });
});
