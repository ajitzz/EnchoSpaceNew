import { describe, it, expect, vi } from 'vitest';
import ConnectionParameters from 'pg/lib/connection-parameters.js';
import {
  validateAndNormalizeDatabaseUrl,
  resolveDatabasePoolConfig,
  isDatabaseLoopbackHost,
  createFailClosedPool,
  FailClosedPool,
} from '../server/deployment/databaseTls.js';
import { installPoolIsolation } from '../server/deployment/poolIsolation.js';

describe('R2-02 database TLS normalization and validation', () => {
  describe('Loopback host detection', () => {
    it('identifies standard loopback hosts and test sandbox domains', () => {
      expect(isDatabaseLoopbackHost('localhost')).toBe(true);
      expect(isDatabaseLoopbackHost('127.0.0.1')).toBe(true);
      expect(isDatabaseLoopbackHost('::1')).toBe(true);
      expect(isDatabaseLoopbackHost('[::1]')).toBe(true);
      expect(isDatabaseLoopbackHost('encho-test.invalid')).toBe(true);
      expect(isDatabaseLoopbackHost('LOCALHOST')).toBe(true);
    });

    it('rejects remote hosts as non-loopback', () => {
      expect(isDatabaseLoopbackHost('ep-test-12345.ap-southeast-1.aws.neon.tech')).toBe(false);
      expect(isDatabaseLoopbackHost('db.example.com')).toBe(false);
      expect(isDatabaseLoopbackHost('192.168.1.10')).toBe(false);
      expect(isDatabaseLoopbackHost('10.0.0.1')).toBe(false);
    });
  });

  describe('validateAndNormalizeDatabaseUrl - Remote Targets', () => {
    it('normalizes deployed sslmode=require in-memory to sslmode=verify-full without mutating other params', () => {
      const raw = 'postgresql://encho_user:s3cr3t_p%40ss@ep-cool-sample.ap-southeast-1.aws.neon.tech:5432/encho_production?sslmode=require&channel_binding=require';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(false);
      expect(result.hostname).toBe('ep-cool-sample.ap-southeast-1.aws.neon.tech');
      expect(result.ssl).toEqual({ rejectUnauthorized: true });

      const parsedNormalized = new URL(result.connectionString);
      expect(parsedNormalized.searchParams.get('sslmode')).toBe('verify-full');
      expect(parsedNormalized.searchParams.get('channel_binding')).toBe('require');
      expect(parsedNormalized.username).toBe('encho_user');
      expect(decodeURIComponent(parsedNormalized.password)).toBe('s3cr3t_p@ss');
    });

    it('preserves explicit sslmode=verify-full on remote targets', () => {
      const raw = 'postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production?sslmode=verify-full';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(false);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
      const parsedNormalized = new URL(result.connectionString);
      expect(parsedNormalized.searchParams.get('sslmode')).toBe('verify-full');
    });

    it('rejects remote target with missing sslmode', () => {
      const raw = 'postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production';
      expect(() => validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'REMOTE_DATABASE_TLS_REQUIRED',
          message: expect.stringContaining('Remote database target requires verified TLS')
        }));
    });

    it.each([
      ['no-verify', '?sslmode=no-verify'],
      ['disable', '?sslmode=disable'],
      ['allow', '?sslmode=allow'],
      ['prefer', '?sslmode=prefer'],
      ['verify-ca', '?sslmode=verify-ca'],
      ['unknown-mode', '?sslmode=unknown']
    ])('rejects insecure/downgrade sslmode %s on remote target', (_name, query) => {
      const raw = `postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production${query}`;
      expect(() => validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED'
        }));
    });

    it('rejects uselibpqcompat=true on remote target', () => {
      const raw = 'postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production?sslmode=require&uselibpqcompat=true';
      expect(() => validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED',
          message: expect.stringContaining('uselibpqcompat')
        }));
    });

    it.each([
      ['ssl=false', '?sslmode=require&ssl=false'],
      ['ssl=0', '?sslmode=require&ssl=0'],
      ['ssl=no-verify', '?sslmode=require&ssl=no-verify'],
      ['ssl=disable', '?sslmode=require&ssl=disable']
    ])('rejects downgrade query param %s on remote target', (_name, query) => {
      const raw = `postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production${query}`;
      expect(() => validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED'
        }));
    });

    it.each([
      ['options=-c row_security=off', '?sslmode=require&options=-c%20row_security=off'],
      ['OPTIONS uppercase', '?sslmode=require&OPTIONS=-c%20row_security=off'],
      ['application_name=rogue', '?sslmode=require&application_name=rogue'],
      ['search_path=public', '?sslmode=require&search_path=public'],
      ['statement_timeout=5000', '?sslmode=require&statement_timeout=5000']
    ])('rejects non-allowlisted query option %s on remote target', (_name, query) => {
      const raw = `postgresql://encho_user:secret@ep-cool-sample.ap-southeast-1.aws.neon.tech/encho_production${query}`;
      expect(() => validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED'
        }));
    });
  });

  describe('validateAndNormalizeDatabaseUrl - Local Targets', () => {
    it('permits localhost without sslmode (plain connection)', () => {
      const raw = 'postgresql://dev_user:pass@localhost:5432/encho_dev';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(true);
      expect(result.hostname).toBe('localhost');
      expect(result.ssl).toBe(false);
      expect(result.connectionString).toBe(raw);
    });

    it('permits 127.0.0.1 with sslmode=disable', () => {
      const raw = 'postgresql://dev_user:pass@127.0.0.1:5432/encho_dev?sslmode=disable';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(true);
      expect(result.hostname).toBe('127.0.0.1');
      expect(result.ssl).toBe(false);
    });

    it('permits IPv6 [::1] loopback', () => {
      const raw = 'postgresql://dev_user:pass@[::1]:5432/encho_dev';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(true);
      expect(result.ssl).toBe(false);
    });

    it('permits encho-test.invalid test sandbox domain', () => {
      const raw = 'postgresql://test:test@encho-test.invalid/encho_test';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(true);
      expect(result.ssl).toBe(false);
    });

    it('normalizes sslmode=require on loopback if explicitly requested', () => {
      const raw = 'postgresql://test:test@localhost:5432/encho_test?sslmode=require';
      const result = validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });

      expect(result.isLoopback).toBe(true);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
      expect(new URL(result.connectionString).searchParams.get('sslmode')).toBe('verify-full');
    });
  });

  describe('validateAndNormalizeDatabaseUrl - Malformed & Invalid', () => {
    it('rejects non-postgres protocols', () => {
      expect(() => validateAndNormalizeDatabaseUrl('mysql://root:secret@127.0.0.1/db'))
        .toThrowError(expect.objectContaining({
          code: 'INVALID_DATABASE_PROTOCOL'
        }));
      expect(() => validateAndNormalizeDatabaseUrl('http://custom-service.internal/db'))
        .toThrowError(expect.objectContaining({
          code: 'INVALID_DATABASE_PROTOCOL'
        }));
    });

    it('rejects placeholder or dummy URLs', () => {
      expect(() => validateAndNormalizeDatabaseUrl('postgresql://dummy:secret@localhost/db'))
        .toThrowError(expect.objectContaining({
          code: 'INVALID_DATABASE_URL'
        }));
      expect(() => validateAndNormalizeDatabaseUrl('postgresql://placeholder:secret@localhost/db'))
        .toThrowError(expect.objectContaining({
          code: 'INVALID_DATABASE_URL'
        }));
    });
  });

  describe('resolveDatabasePoolConfig', () => {
    it('configures pool with normalized URL and verified SSL for remote target', () => {
      const baseConfig = { max: 10, statement_timeout: 5000 };
      const raw = 'postgresql://user:pass@ep-remote.neon.tech/db?sslmode=require';
      const { poolConfig, normalized } = resolveDatabasePoolConfig(raw, baseConfig, { targetLabel: 'primary' });

      expect(normalized.isLoopback).toBe(false);
      expect(poolConfig.max).toBe(10);
      expect(poolConfig.statement_timeout).toBe(5000);
      expect(poolConfig.ssl).toEqual({ rejectUnauthorized: true });
      expect(new URL(poolConfig.connectionString).searchParams.get('sslmode')).toBe('verify-full');
    });

    it('rejects baseConfig with explicit ssl: false for remote target', () => {
      const baseConfig = { ssl: false };
      const raw = 'postgresql://user:pass@ep-remote.neon.tech/db?sslmode=require';
      expect(() => resolveDatabasePoolConfig(raw, baseConfig as any, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED',
          message: expect.stringContaining('Explicit ssl: false')
        }));
    });

    it('rejects baseConfig with explicit rejectUnauthorized: false for remote target', () => {
      const baseConfig = { ssl: { rejectUnauthorized: false } };
      const raw = 'postgresql://user:pass@ep-remote.neon.tech/db?sslmode=require';
      expect(() => resolveDatabasePoolConfig(raw, baseConfig as any, { targetLabel: 'primary' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED',
          message: expect.stringContaining('rejectUnauthorized: false')
        }));
    });

    it('configures pool without SSL for local loopback target', () => {
      const baseConfig = { max: 5 };
      const raw = 'postgresql://user:pass@127.0.0.1:5432/local_db';
      const { poolConfig, normalized } = resolveDatabasePoolConfig(raw, baseConfig, { targetLabel: 'primary' });

      expect(normalized.isLoopback).toBe(true);
      expect(poolConfig.ssl).toBe(false);
      expect(poolConfig.connectionString).toBe(raw);
    });
  });

  describe('Actual pg ConnectionParameters Verification', () => {
    it('produces certificate-verifying ConnectionParameters without emitting pg deprecation warnings for normalized require', () => {
      const warnSpy = vi.spyOn(process, 'emitWarning');

      const raw = 'postgresql://user:pass@ep-remote.neon.tech/db?sslmode=require';
      const { poolConfig } = resolveDatabasePoolConfig(raw, { max: 5 }, { targetLabel: 'primary' });
      const cp = new ConnectionParameters(poolConfig);

      // In pg@8, ConnectionParameters.ssl is {} when sslmode=verify-full, which tells Node tls.connect to verify certificates.
      expect(cp.ssl).toEqual({});
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'"),
        expect.anything()
      );

      warnSpy.mockRestore();
    });

    it('produces certificate-verifying ConnectionParameters for verify-full', () => {
      const raw = 'postgresql://user:pass@ep-remote.neon.tech/db?sslmode=verify-full';
      const { poolConfig } = resolveDatabasePoolConfig(raw, { max: 5 }, { targetLabel: 'primary' });
      const cp = new ConnectionParameters(poolConfig);

      expect(cp.ssl).toEqual({});
    });

    it('produces ssl: false ConnectionParameters for local loopback', () => {
      const raw = 'postgresql://user:pass@127.0.0.1:5432/local_db';
      const { poolConfig } = resolveDatabasePoolConfig(raw, { max: 5 }, { targetLabel: 'primary' });
      const cp = new ConnectionParameters(poolConfig);

      expect(cp.ssl).toBe(false);
    });
  });

  describe('Separate Read Replica Target', () => {
    it('independently validates separate READ_DATABASE_URL', () => {
      const primaryUrl = 'postgresql://writer:secret@ep-primary.neon.tech/db?sslmode=require';
      const readUrl = 'postgresql://reader:secret@ep-read.neon.tech/db?sslmode=verify-full';

      const primary = resolveDatabasePoolConfig(primaryUrl, { max: 20 }, { targetLabel: 'primary' });
      const read = resolveDatabasePoolConfig(readUrl, { max: 25 }, { targetLabel: 'read_replica' });

      expect(new URL(primary.poolConfig.connectionString).hostname).toBe('ep-primary.neon.tech');
      expect(new URL(read.poolConfig.connectionString).hostname).toBe('ep-read.neon.tech');
      expect(primary.poolConfig.ssl).toEqual({ rejectUnauthorized: true });
      expect(read.poolConfig.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('fails closed if READ_DATABASE_URL has insecure configuration without affecting primary', () => {
      const readUrl = 'postgresql://reader:secret@ep-read.neon.tech/db?sslmode=no-verify';
      expect(() => resolveDatabasePoolConfig(readUrl, { max: 25 }, { targetLabel: 'read_replica' }))
        .toThrowError(expect.objectContaining({
          code: 'DATABASE_TLS_DOWNGRADE_REJECTED'
        }));
    });
  });

  describe('Credential Safety (Zero Credential Leakage in Errors)', () => {
    it('never includes passwords, usernames, or full URLs in error messages', () => {
      const sensitivePassword = 'ultra_secret_unleakable_password_98765';
      const sensitiveUser = 'super_secret_admin_user_4321';
      const raw = `postgresql://${sensitiveUser}:${sensitivePassword}@ep-remote.neon.tech/db?sslmode=no-verify`;

      let caughtError: any;
      try {
        validateAndNormalizeDatabaseUrl(raw, { targetLabel: 'primary' });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).not.toContain(sensitivePassword);
      expect(caughtError.message).not.toContain(sensitiveUser);
      expect(caughtError.message).not.toContain('://');
      expect(JSON.stringify(caughtError)).not.toContain(sensitivePassword);
    });
  });

  describe('Synthetic test host encho-test.invalid context enforcement', () => {
    it('rejects encho-test.invalid if NODE_ENV is not test', () => {
      const raw = 'postgresql://test:test@encho-test.invalid/encho_test';
      expect(() => validateAndNormalizeDatabaseUrl(raw, {
        targetLabel: 'primary',
        env: { NODE_ENV: 'production', ENCHO_TEST_SANDBOX: '1' }
      })).toThrowError(expect.objectContaining({
        code: 'INVALID_TEST_ENVIRONMENT'
      }));

      expect(isDatabaseLoopbackHost('encho-test.invalid', {
        NODE_ENV: 'production',
        ENCHO_TEST_SANDBOX: '1'
      })).toBe(false);
    });

    it('rejects encho-test.invalid if ENCHO_TEST_SANDBOX is not 1', () => {
      const raw = 'postgresql://test:test@encho-test.invalid/encho_test';
      expect(() => validateAndNormalizeDatabaseUrl(raw, {
        targetLabel: 'primary',
        env: { NODE_ENV: 'test', ENCHO_TEST_SANDBOX: '0' }
      })).toThrowError(expect.objectContaining({
        code: 'INVALID_TEST_ENVIRONMENT'
      }));

      expect(isDatabaseLoopbackHost('encho-test.invalid', {
        NODE_ENV: 'test',
        ENCHO_TEST_SANDBOX: '0'
      })).toBe(false);

      expect(() => validateAndNormalizeDatabaseUrl(raw, {
        targetLabel: 'primary',
        env: { NODE_ENV: 'test' }
      })).toThrowError(expect.objectContaining({
        code: 'INVALID_TEST_ENVIRONMENT'
      }));

      expect(isDatabaseLoopbackHost('encho-test.invalid', {
        NODE_ENV: 'test'
      })).toBe(false);
    });

    it('permits encho-test.invalid only when NODE_ENV=test and ENCHO_TEST_SANDBOX=1', () => {
      const raw = 'postgresql://test:test@encho-test.invalid/encho_test';
      const result = validateAndNormalizeDatabaseUrl(raw, {
        targetLabel: 'primary',
        env: { NODE_ENV: 'test', ENCHO_TEST_SANDBOX: '1' }
      });
      expect(result.isLoopback).toBe(true);
      expect(result.ssl).toBe(false);
      expect(isDatabaseLoopbackHost('encho-test.invalid', {
        NODE_ENV: 'test',
        ENCHO_TEST_SANDBOX: '1'
      })).toBe(true);
    });
  });

  describe('Fail-Closed Pool & Ambient PGHOST Fallback Immunity', () => {
    it('creates FailClosedPool that never falls back to ambient PGHOST and rejects connect & query', async () => {
      const originalPgHost = process.env.PGHOST;
      try {
        process.env.PGHOST = 'unexpected.internal';

        const pool = createFailClosedPool('DATABASE_TLS_DOWNGRADE_REJECTED: Simulated invalid TLS configuration');
        expect(pool).toBeInstanceOf(FailClosedPool);
        // Explicit synthetic host overrides ConnectionParameters fallback to ambient PGHOST
        expect((pool as any).options.host).toBe('encho-failclosed.invalid');

        // Promise-based query rejection
        await expect(pool.query('SELECT 1')).rejects.toThrowError(expect.objectContaining({
          code: 'DATABASE_UNAVAILABLE',
          message: expect.stringContaining('Simulated invalid TLS configuration')
        }));

        // Callback-based query rejection
        await new Promise<void>((resolve, reject) => {
          pool.query('SELECT 1', (err: any) => {
            try {
              expect(err).toBeDefined();
              expect(err.code).toBe('DATABASE_UNAVAILABLE');
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });

        // Promise-based connect rejection
        await expect(pool.connect()).rejects.toThrowError(expect.objectContaining({
          code: 'DATABASE_UNAVAILABLE',
          message: expect.stringContaining('Simulated invalid TLS configuration')
        }));

        // Callback-based connect rejection
        await new Promise<void>((resolve, reject) => {
          pool.connect((err: any) => {
            try {
              expect(err).toBeDefined();
              expect(err.code).toBe('DATABASE_UNAVAILABLE');
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });

        // Shutdown cleanly resolves
        await expect(pool.end()).resolves.toBeUndefined();
      } finally {
        if (originalPgHost === undefined) {
          delete process.env.PGHOST;
        } else {
          process.env.PGHOST = originalPgHost;
        }
      }
    });

    it('remains fail-closed and rejects queries when wrapped by installPoolIsolation', async () => {
      const originalPgHost = process.env.PGHOST;
      try {
        process.env.PGHOST = 'unexpected.internal';

        const pool = createFailClosedPool('Database connection not configured');
        installPoolIsolation(pool, () => undefined);

        await expect(pool.connect()).rejects.toThrowError(expect.objectContaining({
          code: 'DATABASE_UNAVAILABLE'
        }));

        await expect(pool.query('SELECT 1')).rejects.toThrowError(expect.objectContaining({
          code: 'DATABASE_UNAVAILABLE'
        }));
      } finally {
        if (originalPgHost === undefined) {
          delete process.env.PGHOST;
        } else {
          process.env.PGHOST = originalPgHost;
        }
      }
    });
  });
});
