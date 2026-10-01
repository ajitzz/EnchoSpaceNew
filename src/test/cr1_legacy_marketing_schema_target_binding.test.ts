import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('R2-02 direct schema export binds authorization to its pool target', () => {
  it('rejects a remote-backed pool even when the environment is changed to a permitted test URL after import', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ENCHO_TEST_SANDBOX = '1';
    process.env.DATABASE_URL = 'postgresql://test:test@ep-remote.invalid/encho';

    const pg = await import('pg');
    const querySpy = vi.spyOn(pg.default.Pool.prototype, 'query')
      .mockRejectedValue(new Error('NETWORK_QUERY_FORBIDDEN'));
    const { ensureMarketingSchema } = await import('../../server.ts');
    querySpy.mockClear();

    // The pool above remains bound to ep-remote.invalid. This mutation must not
    // turn its direct-call schema writer into a local test operation.
    process.env.DATABASE_URL = 'postgresql://test:test@encho-test.invalid/encho_test';
    await expect(ensureMarketingSchema()).rejects.toThrow('LEGACY_SCHEMA_BOOTSTRAP_UNAVAILABLE');
    // The server's independent startup readiness task can issue ROLLBACK
    // asynchronously; this assertion targets the direct writer's DDL effect.
    const ddlCalls = querySpy.mock.calls.filter(call =>
      /\b(?:CREATE TABLE|CREATE INDEX|ALTER TABLE)\b/i.test(String(call[0])),
    );
    expect(ddlCalls).toHaveLength(0);
  });
});
