import pkg from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';
import { installPoolIsolation } from '../deployment/poolIsolation.js';
export { installPoolIsolation };

dotenv.config();

const { Pool } = pkg;

export const rawDbUrl = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.NEON_DATABASE_URL ||
  ''
).trim();

export const isDbConfigured = Boolean(
  rawDbUrl &&
  !rawDbUrl.includes('dummy') &&
  (rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://'))
);

export const dbUrl = rawDbUrl;
export const envDbUrl = rawDbUrl;

if (isDbConfigured) {
  console.log('===> SERVER INIT: Database connection configured via environment connection string');
} else {
  console.warn('[DATABASE CONFIG WARNING] No valid DATABASE_URL or POSTGRES_URL configured. Database-dependent endpoints will return 503.');
}

export const shouldRunBackgroundWorkers = Boolean(
  process.env.NODE_ENV !== 'production' &&
  process.env.DISABLE_BACKGROUND_WORKERS !== 'true' &&
  !process.env.VERCEL &&
  !process.env.NOW_REGION &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  process.env.NODE_ENV !== 'test'
);

if (shouldRunBackgroundWorkers) {
  console.log('[WORKER ENGINE] Background worker timers enabled for long-running host.');
} else {
  console.log('[WORKER ENGINE] Background worker timers disabled (Serverless/Test runtime detected).');
}

export const rlsStorage = new AsyncLocalStorage<{ userId?: number | string | null; isRequest?: boolean; bypassRls?: boolean }>();

const poolConfig: any = {
  max: process.env.VERCEL ? 3 : 20,
  idleTimeoutMillis: process.env.VERCEL ? 10000 : 30000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 15000,
  query_timeout: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  allowExitOnIdle: true
};

if (isDbConfigured) {
  poolConfig.connectionString = dbUrl;
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  } else {
    poolConfig.ssl = false;
  }
}

export const pool = new Pool(poolConfig);
pool.on('error', (err: any) => {
  console.error('[DATABASE POOL ERROR] Unexpected error on idle client:', err?.message || err);
});

const readPoolConfig: any = {
  ...poolConfig,
  max: process.env.VERCEL ? 4 : 25
};
if (isDbConfigured) {
  readPoolConfig.connectionString = process.env.READ_DATABASE_URL || dbUrl;
}
export const readPool = new Pool(readPoolConfig);
readPool.on('error', (err: any) => {
  console.error('[DATABASE READ-POOL ERROR] Unexpected error on read replica idle client:', err?.message || err);
});

export async function queryAnalyticsRead(text: string, params?: any[]) {
  return await readPool.query(text, params);
}

// All reads, explicit clients and callbacks share the same transaction-local tenant boundary.
installPoolIsolation(pool, () => rlsStorage.getStore());
installPoolIsolation(readPool, () => rlsStorage.getStore());

export let dbConnectionError: string | null = null;
if (isDbConfigured) {
  pool.query('SELECT 1').then(() => {
    dbConnectionError = null;
  }).catch((err: any) => {
    dbConnectionError = (err as Error).message || String(err);
    console.error("CRITICAL DB STARTUP ERROR:", dbConnectionError);
  });
}

export function getDbConnectionError(): string | null {
  return dbConnectionError;
}

export function setDbConnectionError(err: string | null) {
  dbConnectionError = err;
}
