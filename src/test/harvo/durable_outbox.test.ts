import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLocalPostgresFixture } from './postgres.js';
import { DurableOutbox, DurableOutboxError, durableRequestFingerprint } from '../../lib/platform/durableOutbox.js';

const payloadSchema = z.object({
  aggregateId: z.string().uuid(),
  operation: z.enum(['NOTIFY', 'SYNC']),
}).strict();

const ddl = `
  CREATE TABLE cr1_test_outbox (
    id UUID PRIMARY KEY,
    topic TEXT NOT NULL,
    partition_key TEXT NOT NULL,
    dedupe_key TEXT UNIQUE NOT NULL,
    request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
    payload JSONB NOT NULL,
    execution_class TEXT NOT NULL CHECK(execution_class IN ('LOCAL_EFFECT','IDEMPOTENT_EXTERNAL','AMBIGUOUS_EXTERNAL')),
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','RETRY','SUCCEEDED','DEAD','RECONCILIATION_REQUIRED')),
    priority INT NOT NULL DEFAULT 50 CHECK(priority BETWEEN 0 AND 100),
    fence BIGINT NOT NULL DEFAULT 0 CHECK(fence>=0),
    attempts INT NOT NULL DEFAULT 0 CHECK(attempts>=0),
    max_attempts INT NOT NULL CHECK(max_attempts>0),
    lease_until TIMESTAMPTZ,
    available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    claimed_by TEXT,
    correlation_id TEXT NOT NULL,
    causation_id TEXT,
    principal_id TEXT,
    organization_id TEXT,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    CHECK((state='RUNNING')=(lease_until IS NOT NULL AND claimed_by IS NOT NULL))
  );
  CREATE INDEX cr1_test_outbox_ready ON cr1_test_outbox(priority DESC,available_at,id) WHERE state IN ('PENDING','RETRY');
  CREATE TABLE cr1_test_outbox_events (
    id BIGSERIAL PRIMARY KEY,
    outbox_id UUID NOT NULL REFERENCES cr1_test_outbox(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    reason TEXT,
    evidence JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
`;

describe('CR1 shared durable outbox foundation on real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let outbox: DurableOutbox<z.infer<typeof payloadSchema>>;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query(ddl);
    outbox = new DurableOutbox(fixture.pool, {
      tables: { outbox: 'cr1_test_outbox', events: 'cr1_test_outbox_events' },
      payloadSchema,
      baseBackoffSeconds: 5,
      maximumBackoffSeconds: 60,
      jitterRatio: 0.25,
    });
  });

  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.pool.query('TRUNCATE cr1_test_outbox_events,cr1_test_outbox RESTART IDENTITY');
  });

  it('fingerprints only persisted JSON meaning and rejects non-JSON/cyclic commands', () => {
    expect(durableRequestFingerprint({a: 1, optional: undefined})).toBe(durableRequestFingerprint({a: 1}));
    expect(durableRequestFingerprint({a: 1, optional: null})).not.toBe(durableRequestFingerprint({a: 1}));
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const invalid of [cyclic, {value: Infinity}, {value: 1n}, new Date(), [undefined]]) {
      expect(() => durableRequestFingerprint(invalid)).toThrow('Durable commands require bounded JSON values.');
    }
  });

  const command = (dedupeKey: string, overrides: Record<string, unknown> = {}) => ({
    topic: 'CRM.MESSAGE.NOTIFY',
    partitionKey: 'conversation:42',
    dedupeKey,
    payload: { aggregateId: '4a02e13f-5ab8-4bca-9ad5-ea62486985e7', operation: 'NOTIFY' as const },
    executionClass: 'IDEMPOTENT_EXTERNAL' as const,
    correlationId: 'corr-cr1-outbox-0001',
    principalId: 'user:10',
    maxAttempts: 3,
    ...overrides,
  });

  async function enqueue(dedupeKey: string, overrides: Record<string, unknown> = {}) {
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await outbox.enqueueInTransaction(client, command(dedupeKey, overrides));
      await client.query('COMMIT');
      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('commits domain work and intent atomically and rolls both back on failure', async () => {
    await fixture.pool.query('CREATE TABLE IF NOT EXISTS cr1_test_domain(id INT PRIMARY KEY)');
    await fixture.pool.query('TRUNCATE cr1_test_domain');
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO cr1_test_domain VALUES(1)');
      await outbox.enqueueInTransaction(client, command('atomic-rollback'));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await fixture.pool.query('SELECT * FROM cr1_test_domain')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT * FROM cr1_test_outbox')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT * FROM cr1_test_outbox_events')).rows).toHaveLength(0);
  });

  it('returns the canonical intent for an identical dedupe replay and rejects changed meaning', async () => {
    const first = await enqueue('same-command');
    const replay = await enqueue('same-command');
    expect(replay.id).toBe(first.id);
    expect((await fixture.pool.query('SELECT * FROM cr1_test_outbox')).rows).toHaveLength(1);
    expect((await fixture.pool.query("SELECT * FROM cr1_test_outbox_events WHERE event_type='ENQUEUED'")).rows).toHaveLength(1);
    await expect(enqueue('same-command', { partitionKey: 'conversation:99' })).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' } satisfies Partial<DurableOutboxError>);
  });

  it('uses SKIP LOCKED claims so concurrent workers never receive the same command', async () => {
    for (let index = 0; index < 6; index += 1) await enqueue(`concurrent-${index}`, { priority: index });
    const [first, second] = await Promise.all([
      outbox.claimBatch({ workerId: 'worker-a', limit: 3, leaseSeconds: 60 }),
      outbox.claimBatch({ workerId: 'worker-b', limit: 3, leaseSeconds: 60 }),
    ]);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(new Set([...first, ...second].map(row => row.id)).size).toBe(6);
    expect(new Set([...first.map(row => row.claimedBy), ...second.map(row => row.claimedBy)])).toEqual(new Set(['worker-a', 'worker-b']));
  });

  it('fences an expired local claim and prevents a stale worker from completing it', async () => {
    await enqueue('lease-expiry', { executionClass: 'LOCAL_EFFECT' });
    const original = (await outbox.claimBatch({ workerId: 'worker-old', limit: 1, leaseSeconds: 60 }))[0];
    await fixture.pool.query("UPDATE cr1_test_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [original.id]);
    const reclaimed = (await outbox.claimBatch({ workerId: 'worker-new', limit: 1, leaseSeconds: 60 }))[0];
    expect(BigInt(reclaimed.fence)).toBeGreaterThan(BigInt(original.fence));
    await expect(outbox.succeed(original, 'worker-old')).rejects.toMatchObject({ code: 'OUTBOX_CLAIM_LOST' } satisfies Partial<DurableOutboxError>);
    await expect(outbox.succeed(reclaimed, 'worker-new', { receipt: 'local-commit-1' })).resolves.toBeUndefined();
    expect((await fixture.pool.query('SELECT state FROM cr1_test_outbox WHERE id=$1', [original.id])).rows[0].state).toBe('SUCCEEDED');
  });

  it('routes an expired ambiguous external write to reconciliation instead of retrying it', async () => {
    const stored = await enqueue('ambiguous-expiry', { executionClass: 'AMBIGUOUS_EXTERNAL' });
    const claim = (await outbox.claimBatch({ workerId: 'provider-worker', limit: 1, leaseSeconds: 60 }))[0];
    await fixture.pool.query("UPDATE cr1_test_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [claim.id]);
    expect(await outbox.claimBatch({ workerId: 'provider-worker-2', limit: 1 })).toHaveLength(0);
    const unresolved = (await fixture.pool.query('SELECT state,fence FROM cr1_test_outbox WHERE id=$1', [stored.id])).rows[0];
    expect(unresolved.state).toBe('RECONCILIATION_REQUIRED');
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      const resolved = await outbox.resolveReconciliationInTransaction(client, {
        id: stored.id,
        fence: String(unresolved.fence),
        actorId: 'operator:90',
        reason: 'Provider readback proved that the exact request was accepted.',
        outcome: 'SUCCEEDED',
      });
      await client.query('COMMIT');
      expect(resolved.state).toBe('SUCCEEDED');
    } finally {
      client.release();
    }
  });

  it('applies bounded retry, DLQ, and audited manual replay semantics', async () => {
    const row = await enqueue('retry-and-replay', { maxAttempts: 1 });
    const claim = (await outbox.claimBatch({ workerId: 'notification-worker', limit: 1 }))[0];
    await expect(outbox.fail({ id: claim.id, fence: claim.fence, classification: 'TRANSIENT', errorCode: 'CHANNEL_UNAVAILABLE' }, 'notification-worker')).resolves.toBe('DEAD');
    const dead = (await fixture.pool.query('SELECT fence,state FROM cr1_test_outbox WHERE id=$1', [row.id])).rows[0];
    expect(dead.state).toBe('DEAD');
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      const replayed = await outbox.replayDeadInTransaction(client, {
        id: row.id,
        fence: String(dead.fence),
        actorId: 'operator:90',
        reason: 'The notification provider recovered and the payload remains valid.',
      });
      await client.query('COMMIT');
      expect(replayed).toMatchObject({ state: 'RETRY', attempts: 0 });
    } finally {
      client.release();
    }
    expect((await fixture.pool.query("SELECT actor_id,reason FROM cr1_test_outbox_events WHERE event_type='MANUAL_REPLAY'"))).toMatchObject({
      rows: [{ actor_id: 'operator:90', reason: 'The notification provider recovered and the payload remains valid.' }],
    });
  });
});
