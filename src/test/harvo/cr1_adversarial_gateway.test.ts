import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createLocalPostgresFixture } from './postgres.js';
import { AdversarialCampaignGateway } from '../../lib/platform/adversarialGateway.js';

const ddl = `
  CREATE TABLE test_campaign_orders (
    id UUID PRIMARY KEY,
    host_id TEXT NOT NULL,
    amount_cents INT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED')),
    sequence_version INT NOT NULL DEFAULT 1,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
`;

describe('CR1 Adversarial Gateway: Extreme Failure & Concurrency Verification', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let gateway: AdversarialCampaignGateway;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
    await fixture.pool.query(ddl);
    gateway = new AdversarialCampaignGateway(fixture.pool);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(async () => {
    await fixture.pool.query('TRUNCATE TABLE test_campaign_orders CASCADE;');
  });

  // --------------------------------------------------------------------------
  // Scenario 1: What happens if the database connection drops halfway through?
  // --------------------------------------------------------------------------
  it('Scenario 1: Connection drops halfway through -> transaction cleanly rolls back, no zombie state', async () => {
    const orderId = randomUUID();
    const idempotencyKey = `idemp-${randomUUID()}`;

    // 1. Initial order is PENDING
    await fixture.pool.query(
      `INSERT INTO test_campaign_orders (id, host_id, amount_cents, status, sequence_version, idempotency_key)
       VALUES ($1, 'host_123', 50000, 'PENDING', 1, $2)`,
      [orderId, idempotencyKey]
    );

    // 2. Acquire a client and simulate sudden connection termination mid-flight
    const client = await fixture.pool.connect();
    // In Node.js, an EventEmitter emits 'error' if stream is destroyed. Catch expected drop:
    client.on('error', () => {});
    let errorCaught = false;

    try {
      await gateway.processMultiStepWithDropRisk(client, orderId, true);
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toMatch(/ECONNRESET|severed|Connection/i);
    } finally {
      client.release(true); // pass true to discard broken socket
    }

    expect(errorCaught).toBe(true);

    // 3. Inspect database state on a fresh connection: PostgreSQL must have rolled back the uncommitted change
    const check = await fixture.pool.query('SELECT status FROM test_campaign_orders WHERE id = $1', [orderId]);
    expect(check.rows[0].status).toBe('PENDING'); // MUST NOT be 'AUTHORIZED'
  });

  // --------------------------------------------------------------------------
  // Scenario 2: What happens if the host clicks the submit button 5 times in 200ms?
  // --------------------------------------------------------------------------
  it('Scenario 2: Host clicks submit 5 times in 200ms -> exactly 1 execution, 4 deduplicated replays, 0 double-spends', async () => {
    const orderId = randomUUID();
    const idempotencyKey = `double-click-burst-${randomUUID()}`;
    const req = {
      orderId,
      hostId: 'host_burst_99',
      amountCents: 150000,
      idempotencyKey,
    };

    // Simulate 5 simultaneous requests arriving concurrently within a 200ms window
    const results = await Promise.allSettled([
      gateway.submitOrder({ ...req, orderId: randomUUID() }),
      gateway.submitOrder({ ...req, orderId: randomUUID() }),
      gateway.submitOrder({ ...req, orderId: randomUUID() }),
      gateway.submitOrder({ ...req, orderId: randomUUID() }),
      gateway.submitOrder({ ...req, orderId: randomUUID() }),
    ]);

    // All 5 must succeed from the caller perspective (no unhandled 500 duplicate key error crashes)
    for (const res of results) {
      expect(res.status).toBe('fulfilled');
    }

    const fulfilledValues = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    // INVARIANT A: Exactly 1 request did the actual work (replayed: false)
    const freshExecutions = fulfilledValues.filter((v) => v.replayed === false);
    expect(freshExecutions.length).toBe(1);

    // INVARIANT B: The other 4 requests returned replayed: true
    const replayedExecutions = fulfilledValues.filter((v) => v.replayed === true);
    expect(replayedExecutions.length).toBe(4);

    // INVARIANT C: Exactly 1 row exists in the database
    const dbRows = await fixture.pool.query(
      'SELECT count(*)::int AS count FROM test_campaign_orders WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    expect(dbRows.rows[0].count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: What happens if the webhook payload arrives out of order?
  // --------------------------------------------------------------------------
  it('Scenario 3: Webhook payload arrives out of order -> monotonic state machine rejects regression', async () => {
    const orderId = randomUUID();
    const idempotencyKey = `webhook-order-${randomUUID()}`;

    // Setup an initial order
    await fixture.pool.query(
      `INSERT INTO test_campaign_orders (id, host_id, amount_cents, status, sequence_version, idempotency_key)
       VALUES ($1, 'host_meta_77', 10000, 'PENDING', 1, $2)`,
      [orderId, idempotencyKey]
    );

    // Event 2 (PAYMENT_CAPTURED, sequence 2) arrives FIRST
    const webhook2 = {
      orderId,
      eventType: 'PAYMENT_CAPTURED' as const,
      sequenceNumber: 2,
    };
    const res2 = await gateway.ingestWebhook(webhook2);
    expect(res2.applied).toBe(true);
    expect(res2.currentStatus).toBe('CAPTURED');

    // Event 1 (PAYMENT_AUTHORIZED, sequence 1) arrives SECOND (Late / Out of Order)
    const webhook1 = {
      orderId,
      eventType: 'PAYMENT_AUTHORIZED' as const,
      sequenceNumber: 1,
    };
    const res1 = await gateway.ingestWebhook(webhook1);

    // HARDENED INVARIANT: Late-arriving older webhook MUST NOT be applied, and must NOT regress status to 'AUTHORIZED'
    expect(res1.applied).toBe(false);

    // Verify database status in DB: MUST REMAIN 'CAPTURED'
    const dbCheck = await fixture.pool.query('SELECT status, sequence_version FROM test_campaign_orders WHERE id = $1', [orderId]);
    expect(dbCheck.rows[0].status).toBe('CAPTURED');
    expect(dbCheck.rows[0].sequence_version).toBe(2);
  });
});
