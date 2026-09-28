import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createServiceCaseFixture } from './helpers/serviceCaseFixture.js';
import { verifyServiceCaseBoundaryCatalog, verifyServiceCaseCatalog } from '../../server/deployment/serviceCaseReadiness.js';

describe('service readiness uses actual restricted LOGIN and reachable authority', () => {
  let f: Awaited<ReturnType<typeof createServiceCaseFixture>>;
  beforeAll(async () => { f = await createServiceCaseFixture(); }, 30000);
  afterAll(async () => { await f?.close(); });
  async function inspect(pool: pg.Pool, kind: 'STAFF' | 'CONSUMER') {
    const c = await pool.connect();
    try { await c.query('BEGIN READ ONLY'); return await verifyServiceCaseCatalog(c, kind); }
    finally { await c.query('ROLLBACK'); c.release(); }
  }
  it('preserves both normal consumer and staff runtime scopes', async () => {
    expect((await inspect(f.consumer, 'CONSUMER')).ready).toBe(true);
    expect((await inspect(f.runtime, 'STAFF')).ready).toBe(true);
  });
  it('never treats migration-owner inspection as a ready runtime boundary', async () => {
    const c = await f.migrator.connect();
    try { expect((await verifyServiceCaseBoundaryCatalog(c)).ready).toBe(false); }
    finally { c.release(); }
  });
  it('rejects a privileged login hidden under SET ROLE', async () => {
    const c = await f.pool.connect();
    try {
      await c.query('BEGIN READ ONLY; SET LOCAL ROLE cr1_iam_runtime');
      expect((await verifyServiceCaseCatalog(c, 'STAFF')).ready).toBe(false);
    } finally { await c.query('ROLLBACK'); c.release(); }
  });
  it.each([
    ['staff replication', 'ALTER ROLE cr1_iam_runtime REPLICATION', 'ALTER ROLE cr1_iam_runtime NOREPLICATION'],
    ['definer replication', 'ALTER ROLE cr1_case_definer REPLICATION', 'ALTER ROLE cr1_case_definer NOREPLICATION'],
    ['staff database CREATE', 'GRANT CREATE ON DATABASE postgres TO cr1_iam_runtime', 'REVOKE CREATE ON DATABASE postgres FROM cr1_iam_runtime'],
    ['definer database CREATE', 'GRANT CREATE ON DATABASE postgres TO cr1_case_definer', 'REVOKE CREATE ON DATABASE postgres FROM cr1_case_definer'],
  ])('denies %s', async (_name, grant, revoke) => {
    await f.pool.query(grant);
    try { expect((await inspect(f.runtime, 'STAFF')).ready).toBe(false); }
    finally { await f.pool.query(revoke); }
    expect((await inspect(f.runtime, 'STAFF')).ready).toBe(true);
  });
  it.each([
    ['raw message column SELECT', 'STAFF', 'cr1_iam_runtime', 'GRANT SELECT(content) ON messages TO case_reachable', 'REVOKE SELECT(content) ON messages FROM case_reachable'],
    ['case DELETE', 'STAFF', 'cr1_iam_runtime', 'GRANT DELETE ON service_cases TO case_reachable', 'REVOKE DELETE ON service_cases FROM case_reachable'],
    ['staff calling consumer command', 'STAFF', 'cr1_iam_runtime', 'GRANT EXECUTE ON FUNCTION service_case_request(integer,uuid,text) TO case_reachable', 'REVOKE EXECUTE ON FUNCTION service_case_request(integer,uuid,text) FROM case_reachable'],
    ['consumer calling staff command', 'CONSUMER', 'cr1_case_consumer', 'GRANT EXECUTE ON FUNCTION service_case_read_content(uuid) TO case_reachable', 'REVOKE EXECUTE ON FUNCTION service_case_read_content(uuid) FROM case_reachable'],
  ] as const)('denies NOINHERIT %s', async (_name, kind, role, grant, revoke) => {
    await f.pool.query(`ALTER ROLE ${role} NOINHERIT; CREATE ROLE case_reachable NOLOGIN; GRANT case_reachable TO ${role}`);
    await f.pool.query(grant);
    const pool = kind === 'STAFF' ? f.runtime : f.consumer;
    try { expect((await inspect(pool, kind)).ready).toBe(false); }
    finally {
      await f.pool.query(revoke);
      await f.pool.query(`REVOKE case_reachable FROM ${role}; DROP ROLE case_reachable; ALTER ROLE ${role} INHERIT`);
    }
    expect((await inspect(pool, kind)).ready).toBe(true);
  });
});
