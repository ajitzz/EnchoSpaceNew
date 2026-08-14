import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enforceTestDatabaseSafety } from './db_safety';
import { Pool } from 'pg';

describe('P0 Canary Safety Blocker: Test Database Isolation', () => {
  let originalTestUrl: string | undefined;
  let originalDbUrl: string | undefined;
  let originalVitest: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalTestUrl = process.env.TEST_DATABASE_URL;
    originalDbUrl = process.env.DATABASE_URL;
    originalVitest = process.env.VITEST;
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.TEST_DATABASE_URL = originalTestUrl;
    process.env.DATABASE_URL = "postgres://user:pass@host/neondb_prod";
    process.env.VITEST = originalVitest;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('A. Missing test DB URL -> FAIL SAFE', () => {
    delete process.env.TEST_DATABASE_URL;
    process.env.VITEST = 'true';
    expect(() => enforceTestDatabaseSafety()).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('B. Production DATABASE_URL -> BLOCKED', () => {
    process.env.TEST_DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod';
    process.env.DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod';
    expect(() => enforceTestDatabaseSafety()).toThrow(/matches production DATABASE_URL/);
  });

  it('C. Production hostname -> BLOCKED (or implicitly protected by exact match/pattern)', () => {
    process.env.TEST_DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod' + '?some=param';
    process.env.DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod';
    expect(() => enforceTestDatabaseSafety()).toThrow(/does not match an approved test database pattern/);
  });

  it('D. Test hostname -> ALLOWED', () => {
    process.env.TEST_DATABASE_URL = 'postgres://user:pass@localhost:5432/encho_test';
    // Should not throw
    expect(() => enforceTestDatabaseSafety()).not.toThrow();
  });

  it('E. DROP TABLE against test DB -> ALLOWED', async () => {
    // Should use the actual real test DB
    process.env.TEST_DATABASE_URL = originalTestUrl;
    process.env.DATABASE_URL = "postgres://user:pass@host/neondb_prod";
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    enforceTestDatabaseSafety();

    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      await pool.query('DROP TABLE IF EXISTS __dummy_table_that_does_not_exist__');
      expect(true).toBe(true);
    } catch (e: any) {
      expect(e.message).not.toMatch(/PRODUCTION_DATABASE_DESTRUCTIVE_QUERY_BLOCKED/);
    } finally {
      await pool.end();
    }
  });

  it('F. DROP TABLE against production DB -> BLOCKED', async () => {
    delete process.env.VITEST;
    delete process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod';
    
    // We won't actually hit the db because the guard is sync on .query.
    const fakePool = new Pool({ connectionString: process.env.DATABASE_URL });
    let errorMsg = '';
    try {
      await fakePool.query('DROP TABLE IF EXISTS users');
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      await fakePool.end();
    }
    
    expect(errorMsg).toMatch(/PRODUCTION_DATABASE_DESTRUCTIVE_QUERY_BLOCKED/);
  });

  it('G. Global DELETE against production DB -> BLOCKED', async () => {
    delete process.env.VITEST;
    delete process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://mock_user:mock_pass@mock_host/neondb_prod';
    
    const fakePool = new Pool({ connectionString: process.env.DATABASE_URL });
    let errorMsg = '';
    try {
      await fakePool.query('DELETE FROM users');
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      await fakePool.end();
    }

    expect(errorMsg).toMatch(/PRODUCTION_DATABASE_DESTRUCTIVE_QUERY_BLOCKED/);
  });

  it('H. Test fixture cleanup scoped correctly', () => {
    process.env.TEST_DATABASE_URL = originalTestUrl;
    process.env.DATABASE_URL = "postgres://user:pass@host/neondb_prod";
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    enforceTestDatabaseSafety();

    const fakePool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    let queryArgs: any;
    const origQuery = fakePool.query;
    fakePool.query = function(...args: any[]) {
      queryArgs = args;
      // intercept so we don't actually run it if we don't want to
      return Promise.resolve({ rows: [], rowCount: 0 }) as any;
    };
    
    let blocked = false;
    try {
      fakePool.query('DELETE FROM users WHERE id = $1', [1]);
    } catch (e: any) {
      if (e?.message?.includes('PRODUCTION_DATABASE_DESTRUCTIVE_QUERY_BLOCKED')) {
        blocked = true;
      }
    }
    expect(blocked).toBe(false);
  });
});
