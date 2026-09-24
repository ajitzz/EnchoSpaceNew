import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createLocalPostgresFixture } from './postgres.js';
import {
  OperationalDrillEngine,
  type DrillExecutionRequest,
  type OperationalWebhookPayload,
} from '../../lib/platform/operationalDrillEngine.js';

describe('CR1 Phase P8.2: Operational Drills & Adversarial Certification Suite', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let engine: OperationalDrillEngine;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });

    // Transactional schema for isolated operational drills and emergency kill-switch verification
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS test_operational_drills (
        id UUID PRIMARY KEY,
        drill_type VARCHAR(100) NOT NULL,
        target_system VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
        sequence_version INT NOT NULL DEFAULT 1,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_operational_incidents (
        id UUID PRIMARY KEY,
        incident_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'DETECTED',
        sequence_version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_operational_webhooks (
        event_id VARCHAR(255) PRIMARY KEY,
        incident_id UUID REFERENCES test_operational_incidents(id),
        event_type VARCHAR(100) NOT NULL,
        sequence_number INT NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_drill_campaign_mock (
        id UUID PRIMARY KEY,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
      );
    `);

    engine = new OperationalDrillEngine(fixture.pool);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(async () => {
    await fixture.pool.query('DELETE FROM test_operational_webhooks');
    await fixture.pool.query('DELETE FROM test_operational_drills');
    await fixture.pool.query('DELETE FROM test_operational_incidents');
    await fixture.pool.query('DELETE FROM test_drill_campaign_mock');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Database Connection Drops Halfway Through Operational Drill
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Connection drops midway through drill execution -> clean rollback, 0 zombie rows', async () => {
    const drillId = randomUUID();
    const idempotencyKey = `idemp-drill-drop-${randomUUID()}`;

    const client = await fixture.pool.connect();
    client.on('error', () => {}); // Catch expected connection destruction
    let severed = false;

    try {
      await engine.executeDrillWithFaultInjection(client, {
        drillId,
        drillType: 'SIMULATED_FAILOVER',
        targetSystem: 'PAYMENT_ROUTER',
        idempotencyKey,
        parameters: { simulatedDelayMs: 50 },
        simulateSocketDrop: true,
      });
    } catch (err: unknown) {
      severed = true;
      expect((err as Error).message).toContain('ECONNRESET');
    } finally {
      client.release(true); // Discard broken client socket from pool
    }

    expect(severed).toBe(true);

    // Verify PostgreSQL invariant: transaction aborted cleanly, zero zombie rows
    const drillCheck = await fixture.pool.query(
      'SELECT * FROM test_operational_drills WHERE id = $1',
      [drillId]
    );
    expect(drillCheck.rows.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Concurrency Burst - Host/Operator Clicks Submit 5 Times in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Host clicks submit 5 times in 200ms -> exactly 1 execution, 4 deduplicated replays, 0 double-runs', async () => {
    const idempotencyKey = `burst-drill-${randomUUID()}`;
    const baseRequest: DrillExecutionRequest = {
      drillId: randomUUID(),
      drillType: 'STOP_LOSS_ACTIVATION',
      targetSystem: 'AD_BUDGET_CIRCUIT_BREAKER',
      idempotencyKey,
      parameters: { thresholdCents: 5000 },
    };

    // Fire 5 identical requests concurrently within a 200ms burst
    const requests = Array.from({ length: 5 }, () =>
      engine.submitDrill({
        ...baseRequest,
        drillId: randomUUID(), // Client assigns fresh UUID per attempt, but shares idempotencyKey
      })
    );

    const results = await Promise.all(requests);

    // Assert strict deduplication
    const freshExecutions = results.filter((r) => !r.replayed);
    const replayedExecutions = results.filter((r) => r.replayed);

    expect(freshExecutions.length).toBe(1);
    expect(replayedExecutions.length).toBe(4);

    // All 5 must report the exact same primary drill ID and status
    const primaryDrillId = freshExecutions[0].drillId;
    for (const res of results) {
      expect(res.drillId).toBe(primaryDrillId);
      expect(res.status).toBe('SCHEDULED');
    }

    // Database must hold strictly 1 record for this idempotency key
    const countCheck = await fixture.pool.query(
      'SELECT count(*) FROM test_operational_drills WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    expect(parseInt(countCheck.rows[0].count, 10)).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Webhook Payload Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Webhook arrives out of order -> monotonic state machine rejects regression', async () => {
    const incidentId = randomUUID();

    // 1. Seed incident with initial state (version 1)
    await fixture.pool.query(
      `INSERT INTO test_operational_incidents (id, incident_type, status, sequence_version)
       VALUES ($1, 'BUDGET_OVERRUN', 'DETECTED', 1)`,
      [incidentId]
    );

    // 2. Process RESOLVED webhook with sequence version 3
    const resolvedPayload: OperationalWebhookPayload = {
      eventId: `evt-res-${randomUUID()}`,
      incidentId,
      eventType: 'incident.resolved',
      sequenceNumber: 3,
    };
    const resolvedResult = await engine.processOperationalWebhook(resolvedPayload);
    expect(resolvedResult.status).toBe('RESOLVED');
    expect(resolvedResult.ignored).toBe(false);

    // 3. Delayed/stale sequence version 2 arrives (e.g. incident.mitigated)
    const stalePayload: OperationalWebhookPayload = {
      eventId: `evt-mit-${randomUUID()}`,
      incidentId,
      eventType: 'incident.mitigated',
      sequenceNumber: 2, // Inverted sequence!
    };
    const staleResult = await engine.processOperationalWebhook(stalePayload);

    // Stale payload must be safely dropped without regressing terminal RESOLVED state
    expect(staleResult.ignored).toBe(true);
    expect(staleResult.currentStatus).toBe('RESOLVED');

    // Verify DB remains strictly in RESOLVED terminal state
    const incidentCheck = await fixture.pool.query(
      'SELECT status, sequence_version FROM test_operational_incidents WHERE id = $1',
      [incidentId]
    );
    expect(incidentCheck.rows[0].status).toBe('RESOLVED');
    expect(incidentCheck.rows[0].sequence_version).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Emergency Kill-Switch & Stop-Loss Circuit Breaker Drill
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Emergency kill-switch trips -> pauses all active campaigns atomically in one transaction', async () => {
    // Seed 5 active test campaigns
    for (let i = 0; i < 5; i++) {
      await fixture.pool.query(
        `INSERT INTO test_drill_campaign_mock (id, status) VALUES ($1, 'ACTIVE')`,
        [randomUUID()]
      );
    }

    // Trigger emergency kill-switch
    const killResult = await engine.triggerEmergencyKillSwitch('ADMIN_SECURITY_BREACH_SIMULATION');
    expect(killResult.activated).toBe(true);
    expect(killResult.haltedCampaignsCount).toBe(5);

    // Verify all campaigns are immediately PAUSED in the database
    const campaignCheck = await fixture.pool.query(
      `SELECT count(*) FROM test_drill_campaign_mock WHERE status = 'PAUSED'`
    );
    expect(parseInt(campaignCheck.rows[0].count, 10)).toBe(5);
  });
});
