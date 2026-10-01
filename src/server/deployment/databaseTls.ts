import pg from 'pg';

export type DatabaseTargetLabel = 'primary' | 'read_replica' | 'marketing_worker' | string;

export interface DatabaseTlsOptions {
  targetLabel?: DatabaseTargetLabel;
  env?: NodeJS.ProcessEnv;
}

export interface NormalizedDatabaseConnection {
  /** In-memory normalized connection string (with sslmode=verify-full on remote targets). */
  connectionString: string;
  /** Normalized hostname (lower-cased, IPv6 brackets preserved). */
  hostname: string;
  /** Whether the target points to a local loopback/sandbox host. */
  isLoopback: boolean;
  /** Normalized SSL options for pg.PoolConfig / pg.ClientConfig. */
  ssl: { rejectUnauthorized: true } | false;
}

export interface ValidatedPoolConfigResult<T extends pg.PoolConfig = pg.PoolConfig> {
  normalized: NormalizedDatabaseConnection;
  poolConfig: T & { connectionString: string; ssl: { rejectUnauthorized: true } | false };
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const ALLOWED_REMOTE_QUERY_PARAMS = new Set(['sslmode', 'channel_binding']);

/**
 * Checks whether a given hostname refers to local loopback or a valid test sandbox.
 * The synthetic domain 'encho-test.invalid' is accepted only when sanitized test
 * environment variables are explicitly satisfied (NODE_ENV=test and ENCHO_TEST_SANDBOX=1).
 */
export function isDatabaseLoopbackHost(hostname: string, env?: NodeJS.ProcessEnv): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'encho-test.invalid') {
    const effectiveEnv = env || process.env;
    return effectiveEnv.NODE_ENV === 'test' && effectiveEnv.ENCHO_TEST_SANDBOX === '1';
  }
  return LOOPBACK_HOSTS.has(normalized);
}

/**
 * Validates a PostgreSQL connection URL and normalizes it for safe TLS execution:
 * - Rejects non-postgres protocols, malformed URLs, and dummy placeholders.
 * - For local loopback hosts, permits plain connections (ssl: false).
 * - The synthetic test host 'encho-test.invalid' strictly requires sanitized test context.
 * - For remote targets:
 *   - Enforces certificate verification.
 *   - Normalizes deployed `sslmode=require` in-memory to `sslmode=verify-full` so it
 *     remains stable across pg 8 and pg 9 without emitting deprecation warnings.
 *   - Enforces strict query parameter allowlist ('sslmode', 'channel_binding'); rejects
 *     any other query options (e.g. 'options', 'uselibpqcompat', 'ssl').
 *   - Rejects missing sslmode and downgrade modes (disable, allow, prefer, no-verify).
 * - Masks credentials so secrets (username, password) are never exposed in error messages.
 */
export function validateAndNormalizeDatabaseUrl(
  rawUrl: string,
  options?: DatabaseTlsOptions
): NormalizedDatabaseConnection {
  const label = options?.targetLabel || 'database';
  const effectiveEnv = options?.env || process.env;

  if (!rawUrl || typeof rawUrl !== 'string') {
    const error = new Error(`Database connection URL is required for ${label}`);
    (error as any).code = 'INVALID_DATABASE_URL';
    throw error;
  }

  const trimmed = rawUrl.trim();
  if (/dummy|placeholder|example\.com/i.test(trimmed)) {
    const error = new Error(`Dummy or placeholder database URL is rejected for ${label}`);
    (error as any).code = 'INVALID_DATABASE_URL';
    throw error;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    const error = new Error(`Malformed database URL for ${label}`);
    (error as any).code = 'INVALID_DATABASE_URL';
    throw error;
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    const error = new Error(`Invalid database protocol for ${label}: expected postgres: or postgresql:`);
    (error as any).code = 'INVALID_DATABASE_PROTOCOL';
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    const error = new Error(`Missing database hostname for ${label}`);
    (error as any).code = 'INVALID_DATABASE_HOST';
    throw error;
  }

  // Test-only synthetic domain guard: must require sanitized test harness context
  if (hostname === 'encho-test.invalid') {
    if (effectiveEnv.NODE_ENV !== 'test' || effectiveEnv.ENCHO_TEST_SANDBOX !== '1') {
      const error = new Error(`Synthetic test database host '${hostname}' requires sanitized test context (NODE_ENV=test and ENCHO_TEST_SANDBOX=1) for ${label}`);
      (error as any).code = 'INVALID_TEST_ENVIRONMENT';
      throw error;
    }
  }

  const isLoopback = isDatabaseLoopbackHost(hostname, effectiveEnv);

  if (isLoopback) {
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslmode === 'require') {
      const normalizedUrl = new URL(parsed.toString());
      normalizedUrl.searchParams.set('sslmode', 'verify-full');
      return {
        connectionString: normalizedUrl.toString(),
        hostname,
        isLoopback: true,
        ssl: { rejectUnauthorized: true },
      };
    }
    if (sslmode === 'verify-full') {
      return {
        connectionString: parsed.toString(),
        hostname,
        isLoopback: true,
        ssl: { rejectUnauthorized: true },
      };
    }
    return {
      connectionString: parsed.toString(),
      hostname,
      isLoopback: true,
      ssl: false,
    };
  }

  // Remote target: strict query parameter allowlist
  for (const key of parsed.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    if (!ALLOWED_REMOTE_QUERY_PARAMS.has(normalizedKey)) {
      const error = new Error(`Unexpected database connection option '${key}' is rejected on remote target for ${label}`);
      (error as any).code = 'DATABASE_TLS_DOWNGRADE_REJECTED';
      throw error;
    }
  }

  const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
  if (!sslmode) {
    const error = new Error(`Remote database target requires verified TLS (sslmode=verify-full or sslmode=require) for ${label}`);
    (error as any).code = 'REMOTE_DATABASE_TLS_REQUIRED';
    throw error;
  }

  if (['disable', 'allow', 'prefer', 'no-verify'].includes(sslmode)) {
    const error = new Error(`Insecure database sslmode '${sslmode}' is rejected on remote target for ${label}`);
    (error as any).code = 'DATABASE_TLS_DOWNGRADE_REJECTED';
    throw error;
  }

  if (sslmode !== 'require' && sslmode !== 'verify-full') {
    const error = new Error(`Unsupported database sslmode '${sslmode}' for ${label}: expected verify-full or require`);
    (error as any).code = 'DATABASE_TLS_DOWNGRADE_REJECTED';
    throw error;
  }

  // Normalize deployed sslmode=require in-memory to verify-full
  let normalizedUrlString: string;
  if (sslmode === 'require') {
    const normalizedUrl = new URL(parsed.toString());
    normalizedUrl.searchParams.set('sslmode', 'verify-full');
    normalizedUrlString = normalizedUrl.toString();
  } else {
    normalizedUrlString = parsed.toString();
  }

  return {
    connectionString: normalizedUrlString,
    hostname,
    isLoopback: false,
    ssl: { rejectUnauthorized: true },
  };
}

/**
 * Validates and configures a pg.PoolConfig object:
 * - Checks baseConfig for explicit non-verifying TLS options on remote targets.
 * - Applies the validated/normalized connection string and safe SSL options.
 */
export function resolveDatabasePoolConfig<T extends pg.PoolConfig>(
  rawUrl: string,
  baseConfig: T,
  options?: DatabaseTlsOptions
): ValidatedPoolConfigResult<T> {
  const normalized = validateAndNormalizeDatabaseUrl(rawUrl, options);
  const label = options?.targetLabel || 'database';

  if (!normalized.isLoopback) {
    if (baseConfig.ssl === false) {
      const error = new Error(`Explicit ssl: false is rejected on remote target for ${label}`);
      (error as any).code = 'DATABASE_TLS_DOWNGRADE_REJECTED';
      throw error;
    }
    if (typeof baseConfig.ssl === 'object' && baseConfig.ssl !== null) {
      if ((baseConfig.ssl as any).rejectUnauthorized === false) {
        const error = new Error(`Explicit rejectUnauthorized: false is rejected on remote target for ${label}`);
        (error as any).code = 'DATABASE_TLS_DOWNGRADE_REJECTED';
        throw error;
      }
    }
  }

  const poolConfig: T & { connectionString: string; ssl: { rejectUnauthorized: true } | false } = {
    ...baseConfig,
    connectionString: normalized.connectionString,
    ssl: normalized.ssl,
  };

  return {
    normalized,
    poolConfig,
  };
}

/**
 * A fail-closed pg.Pool stub used when database configuration is missing or rejected:
 * - Rejects any .connect() or .query() invocation immediately with DATABASE_UNAVAILABLE.
 * - Never instantiates a pg Client and never falls back to ambient PGHOST/PGUSER env vars.
 * - Resolves .end() cleanly for shutdown safety.
 */
export class FailClosedPool extends pg.Pool {
  readonly failureReason: string;
  readonly host: string = 'encho-failclosed.invalid';

  constructor(reason: string) {
    // Setting explicit synthetic host ensures pg never reads ambient PGHOST from process.env
    super({ host: 'encho-failclosed.invalid', max: 0 });
    this.failureReason = reason;
    (this as any).options = {
      ...((this as any).options || {}),
      host: 'encho-failclosed.invalid',
      max: 0,
    };
  }

  override connect(cb?: (err: Error, client?: any, release?: any) => void): Promise<any> {
    const error = new Error(this.failureReason);
    (error as any).code = 'DATABASE_UNAVAILABLE';
    if (cb) {
      cb(error);
      return Promise.resolve(undefined as any);
    }
    return Promise.reject(error);
  }

  override query(text?: any, params?: any, cb?: any): Promise<any> {
    const callback = typeof params === 'function' ? params : typeof cb === 'function' ? cb : undefined;
    const error = new Error(this.failureReason);
    (error as any).code = 'DATABASE_UNAVAILABLE';
    if (callback) {
      callback(error);
      return Promise.resolve(undefined as any);
    }
    return Promise.reject(error);
  }

  override end(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Creates a fail-closed pool that safely fails any attempt to connect or query
 * without ever falling back to ambient process.env.PGHOST or unverified sockets.
 */
export function createFailClosedPool(reason: string): pg.Pool {
  return new FailClosedPool(reason);
}
