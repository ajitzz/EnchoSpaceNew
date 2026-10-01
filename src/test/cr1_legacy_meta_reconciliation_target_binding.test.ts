import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('R2-02 legacy Meta reconciliation binds authorization to its pool target', () => {
  it('denies a remote-backed import even after the environment changes to a permitted test URL', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ENCHO_TEST_SANDBOX = '1';
    process.env.DATABASE_URL = 'postgresql://test:test@ep-remote.invalid/encho';

    // Server startup may run readiness asynchronously. These mocks guarantee
    // the fixture cannot connect to any database regardless of the candidate.
    const pg = await import('pg');
    vi.spyOn(pg.default.Pool.prototype, 'query').mockRejectedValue(new Error('NETWORK_QUERY_FORBIDDEN'));
    vi.spyOn(pg.default.Pool.prototype, 'connect').mockRejectedValue(new Error('NETWORK_CONNECT_FORBIDDEN'));
    const { processMetaReconciliation } = await import('../../server.ts');

    process.env.DATABASE_URL = 'postgresql://test:test@encho-test.invalid/encho_test';
    const fakePool = { connect: vi.fn(async () => { throw new Error('LOCK_CONNECT_FORBIDDEN'); }) };
    await expect(processMetaReconciliation(fakePool, 'synthetic_token'))
      .rejects.toThrow('LEGACY_RECONCILIATION_UNAVAILABLE');
    expect(fakePool.connect).not.toHaveBeenCalled();
  });
});
