// Bounded operator observation, not a deployment/readiness certificate.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const {Pool} = require('pg');
const dotenv = require('dotenv');
const digest = value => createHash('sha256').update(value).digest('hex');
const manifest = directory => readdirSync(directory).filter(f => f.endsWith('.sql')).sort()
  .map(version => ({version, checksum: digest(readFileSync(path.join(directory, version)))}));
const receipt = {
  observedAt: new Date().toISOString(), scope: 'FOUNDER_AUTHORIZED_READ_ONLY_DOTENV_HISTORY',
  environment: 'UNVERIFIED_PRIMARY_NEON_CANDIDATE', branchIdentity: 'NOT_SUPPLIED',
  productionCertification: false, migrationApplyAuthorized: false,
  credentialSource: '.env:DATABASE_URL', tlsCertificateVerification: true,
  collectorSha256: digest(readFileSync(new URL(import.meta.url))),
  head: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  source: manifest(path.join(root, 'src/migrations')),
  packaged: manifest(path.join(root, 'build/server/src/migrations')),
};
let pool, client;
try {
  if (process.argv[2] !== '--approved-env-inspection') throw new Error('EXPLICIT_OBSERVATION_REQUIRED');
  const raw = dotenv.parse(readFileSync(path.join(root, '.env'))).DATABASE_URL;
  if (!raw || /dummy|placeholder|example\.com/i.test(raw)) throw new Error('CONNECTION_UNAVAILABLE');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password
    || !url.hostname.endsWith('.neon.tech') || url.hash
    || [...url.searchParams.keys()].some(k => !['sslmode', 'channel_binding'].includes(k))) {
    throw new Error('CONNECTION_IDENTITY_INVALID');
  }
  receipt.endpointSha256 = digest(url.hostname);
  receipt.databaseSha256 = digest(decodeURIComponent(url.pathname.slice(1)));
  receipt.loginSha256 = digest(decodeURIComponent(url.username));
  url.searchParams.delete('sslmode'); url.searchParams.delete('channel_binding');
  pool = new Pool({connectionString: url.toString(), ssl: {rejectUnauthorized: true}, max: 1,
    connectionTimeoutMillis: 12000, query_timeout: 15000, application_name: 'encho_readonly_history_observation'});
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  const lock = await client.query('SELECT pg_try_advisory_xact_lock_shared(82749102) AS acquired');
  if (lock.rows[0]?.acquired !== true) throw new Error('MIGRATION_LOCK_BUSY');
  const identity = (await client.query(`SELECT current_database() AS database, session_user AS login,
    current_user AS role, current_setting('transaction_read_only') AS read_only,
    r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  if (identity.read_only !== 'on' || digest(identity.database) !== receipt.databaseSha256
    || digest(identity.login) !== receipt.loginSha256) throw new Error('CONNECTED_IDENTITY_MISMATCH');
  receipt.connected = {transactionReadOnly: true, currentRoleSha256: digest(identity.role),
    superuser: identity.rolsuper, bypassRls: identity.rolbypassrls, createRole: identity.rolcreaterole,
    createDatabase: identity.rolcreatedb, replication: identity.rolreplication};
  const table = (await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists")).rows[0];
  receipt.historyTableExists = table.exists;
  if (table.exists) {
    receipt.history = (await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
    const source = new Map(receipt.source.map(row => [row.version, row.checksum]));
    const applied = new Map(receipt.history.map(row => [row.version, row.checksum]));
    receipt.pending = receipt.source.filter(row => !applied.has(row.version)).map(row => row.version);
    receipt.unknown = receipt.history.filter(row => !source.has(row.version));
    receipt.changed = receipt.history.filter(row => source.has(row.version) && source.get(row.version) !== row.checksum);
    receipt.invalidChecksums = receipt.history.filter(row => !/^[a-f0-9]{64}$/.test(row.checksum ?? '')).map(row => row.version);
    receipt.duplicateVersions = receipt.history.filter((row, i, all) => all.findIndex(r => r.version === row.version) !== i).map(row => row.version);
    receipt.exactSourceMatch = !receipt.pending.length && !receipt.unknown.length && !receipt.changed.length
      && !receipt.invalidChecksums.length && !receipt.duplicateVersions.length;
  }
  receipt.tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(r => r.tablename);
  await client.query('ROLLBACK');
  receipt.status = 'OBSERVED_READ_ONLY';
} catch (error) {
  receipt.status = 'OBSERVATION_FAILED';
  receipt.error = typeof error?.message === 'string' && /^[A-Z_]+$/.test(error.message)
    ? error.message : 'READ_ONLY_OBSERVATION_UNAVAILABLE';
  if (client) await client.query('ROLLBACK').catch(() => {});
  process.exitCode = 1;
} finally {
  if (client) client.release();
  if (pool) await pool.end();
  // No URL, password, customer content or untrusted driver message enters this receipt.
  writeFileSync(path.join(root, 'docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json'), JSON.stringify(receipt, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify({status: receipt.status, exactSourceMatch: receipt.exactSourceMatch ?? null,
    appliedCount: receipt.history?.length ?? null, pendingCount: receipt.pending?.length ?? null,
    unknownCount: receipt.unknown?.length ?? null, changedCount: receipt.changed?.length ?? null,
    error: receipt.error ?? null, productionCertification: false}));
}
