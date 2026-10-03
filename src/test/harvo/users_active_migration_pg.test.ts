import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';

const migration = readFileSync(fileURLToPath(new URL('../../migrations/048_users_active_account_authority.sql', import.meta.url)), 'utf8');

describe('migration 048 active-account authority on disposable PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
  }, 30_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('adds the column while preserving accounts already able to sign in', async () => {
    await fixture.pool.query('CREATE TABLE users(id INT PRIMARY KEY, role TEXT NOT NULL)');
    await fixture.pool.query("INSERT INTO users(id,role) VALUES(1,'admin'),(2,'user')");
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect((await fixture.pool.query('SELECT id,is_active FROM users ORDER BY id')).rows).toEqual([
      { id: 1, is_active: true }, { id: 2, is_active: true }
    ]);
    await fixture.pool.query("INSERT INTO users(id,role) VALUES(3,'user')");
    expect((await fixture.pool.query('SELECT is_active FROM users WHERE id=3')).rows[0].is_active).toBe(true);
  });

  it('preserves explicit deactivation and converts legacy NULL to fail-closed false', async () => {
    await fixture.pool.query('ALTER TABLE users ALTER COLUMN is_active DROP NOT NULL');
    await fixture.pool.query('ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT');
    await fixture.pool.query('INSERT INTO users(id,role,is_active) VALUES(4,$1,FALSE),(5,$1,NULL)', ['user']);
    await fixture.pool.query(migration);
    expect((await fixture.pool.query('SELECT id,is_active FROM users WHERE id IN (4,5) ORDER BY id')).rows).toEqual([
      { id: 4, is_active: false }, { id: 5, is_active: false }
    ]);
    const column = (await fixture.pool.query<{ is_nullable: string; column_default: string | null }>(
      "SELECT is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='is_active'"
    )).rows[0];
    expect(column.is_nullable).toBe('NO');
    expect(column.column_default).toContain('true');
  });
});
