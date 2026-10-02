import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import pg from 'pg';
import {createLocalPostgresFixture} from './postgres.js';
import {consumerAuthReadiness} from '../../server/auth/consumerAuthReadiness.js';

describe('consumer auth readiness on a disposable PostgreSQL LOGIN', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let runtime: pg.Pool;
  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({schema: 'empty'});
    await fixture.pool.query(`
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE ROLE consumer_auth_probe LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY, email TEXT, password_hash TEXT, name TEXT NOT NULL,
        role TEXT NOT NULL, google_id TEXT, phone TEXT
      );
      GRANT USAGE ON SCHEMA public TO consumer_auth_probe;
      GRANT SELECT ON users TO consumer_auth_probe;
      GRANT INSERT(email,password_hash,name,role,phone,google_id) ON users TO consumer_auth_probe;
      GRANT UPDATE(google_id) ON users TO consumer_auth_probe;
      GRANT USAGE ON SEQUENCE users_id_seq TO consumer_auth_probe;
    `);
    runtime = new pg.Pool({...fixture.pool.options, user: 'consumer_auth_probe'});
  });
  afterAll(async () => {await runtime?.end(); await fixture?.close();});

  it('allows auth against a healthy users contract without any marketing tables', async () => {
    expect(await consumerAuthReadiness(runtime, 'READ')).toBe(true);
    expect(await consumerAuthReadiness(runtime, 'ENROLL')).toBe(true);
    expect(await consumerAuthReadiness(runtime, 'GOOGLE_LINK')).toBe(true);
    expect(await consumerAuthReadiness(fixture.pool, 'READ')).toBe(false);
  });

  it('checks the actual privileges needed by each auth operation', async () => {
    await fixture.pool.query('REVOKE USAGE ON SEQUENCE users_id_seq FROM consumer_auth_probe');
    try {
      expect(await consumerAuthReadiness(runtime, 'READ')).toBe(true);
      expect(await consumerAuthReadiness(runtime, 'ENROLL')).toBe(false);
    } finally {await fixture.pool.query('GRANT USAGE ON SEQUENCE users_id_seq TO consumer_auth_probe');}
    await fixture.pool.query('REVOKE UPDATE(google_id) ON users FROM consumer_auth_probe');
    try {
      expect(await consumerAuthReadiness(runtime, 'ENROLL')).toBe(true);
      expect(await consumerAuthReadiness(runtime, 'GOOGLE_LINK')).toBe(false);
    } finally {await fixture.pool.query('GRANT UPDATE(google_id) ON users TO consumer_auth_probe');}
    await fixture.pool.query('REVOKE INSERT(phone) ON users FROM consumer_auth_probe');
    try {
      expect(await consumerAuthReadiness(runtime, 'READ')).toBe(true);
      expect(await consumerAuthReadiness(runtime, 'ENROLL')).toBe(false);
      expect(await consumerAuthReadiness(runtime, 'GOOGLE_LINK')).toBe(true);
    } finally {await fixture.pool.query('GRANT INSERT(phone) ON users TO consumer_auth_probe');}
    await fixture.pool.query('REVOKE SELECT ON users FROM consumer_auth_probe');
    try {expect(await consumerAuthReadiness(runtime, 'READ')).toBe(false);}
    finally {await fixture.pool.query('GRANT SELECT ON users TO consumer_auth_probe');}
  });

  it('fails closed for missing identity columns and unsafe reachable roles', async () => {
    await fixture.pool.query('ALTER TABLE users DROP COLUMN google_id');
    try {expect(await consumerAuthReadiness(runtime, 'READ')).toBe(false);}
    finally {await fixture.pool.query('ALTER TABLE users ADD COLUMN google_id TEXT');}
    await fixture.pool.query('ALTER ROLE consumer_auth_probe BYPASSRLS');
    try {expect(await consumerAuthReadiness(runtime, 'READ')).toBe(false);}
    finally {await fixture.pool.query('ALTER ROLE consumer_auth_probe NOBYPASSRLS');}
    expect(await consumerAuthReadiness(runtime, 'READ')).toBe(true);
  });
});
