import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import pg from 'pg';

/** A fresh local cluster, Unix socket only. Never reads database environment URLs. */
export async function createLocalPostgresFixture() {
  const configured = process.env.HARVO_POSTGRES_BIN?.trim();
  const candidates = configured ? [resolve(configured)] : [
    ...(process.env.PATH || '').split(delimiter).filter(Boolean), '/opt/homebrew/opt/postgresql@18/bin',
  ];
  const binaries = candidates.find(directory => {
    try {
      for (const name of ['initdb', 'pg_ctl', 'postgres']) accessSync(join(directory, name), constants.X_OK);
      return true;
    } catch { return false; }
  });
  if (!binaries) throw new Error('Local PostgreSQL binaries are required. Set HARVO_POSTGRES_BIN or add initdb/pg_ctl/postgres to PATH.');
  const directory = mkdtempSync(join(tmpdir(), 'harvo-pg-'));
  const data = join(directory, 'data');
  const socket = join(directory, 'socket');
  const port = randomInt(20000, 50000);
  mkdirSync(socket, { mode: 0o700 });
  let pool: pg.Pool | undefined;
  const command = (name: string, args: string[]) => execFileSync(join(binaries, name), args, {
    env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    stdio: 'pipe', timeout: 20000,
  });
  const close = async () => {
    try { await pool?.end(); }
    finally {
      try { if (existsSync(join(data, 'postmaster.pid'))) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); }
      finally { rmSync(directory, { recursive: true, force: true }); }
    }
  };
  try {
    command('initdb', ['-D', data, '-U', 'harvo_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h '' -k '${socket}' -p ${port}`, '-w', 'start']);
    pool = new pg.Pool({ host: socket, port, user: 'harvo_test', database: 'postgres', max: 15,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000 });

    // Exact current provider/financial DDL, read as text only. No application import.
    const serverSource = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    const extract = (table: string) => {
      const ddl = serverSource.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\s*\\);`))?.[0];
      if (!ddl) throw new Error(`Fixture schema missing: ${table}`);
      return ddl;
    };
    await pool.query('CREATE TABLE listings (id INT PRIMARY KEY, user_id INT NOT NULL, title TEXT NOT NULL, slug TEXT, publication_status TEXT NOT NULL)');
    await pool.query('CREATE TABLE host_marketing_campaigns (id INT PRIMARY KEY, host_id INT NOT NULL, listing_id INT NOT NULL)');
    for (const table of ['campaign_financial_contracts', 'provider_entities', 'provider_publishing_transactions']) {
      await pool.query(extract(table));
    }
    return { pool, close };
  } catch (error) {
    await close();
    throw error;
  }
}
