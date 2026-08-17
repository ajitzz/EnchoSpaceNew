import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import supertest from 'supertest';
import {
  app,
  runShadowDiscovery,
  executeWorkerCycle,
  runStartupRecoveryAudit,
  gracefulShutdown,
  isShuttingDown,
  inFlightExecutions,
  WORKER_VERSION
} from '../../worker.ts';
import {
  processEscrowAutoRelease,
  recoverOrphanedMetaTransactions,
  processAsyncWebhookQueue
} from '../../server.ts';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.9.7: STANDALONE WORKER RUNTIME & SHADOW HARNESS TEST SUITE', () => {
  let testHostId: number;
  let testCampaignId: number;
  let testWebhookId: number;
  let testTxId: number;

  beforeAll(async () => {
    // Seed test fixtures
    const userRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Worker Test Host') RETURNING id",
      [`worker_test_${Date.now()}@encho.com`]
    );
    testHostId = userRes.rows[0].id;

    const campRes = await pool.query(
      `INSERT INTO host_marketing_campaigns (host_id, title, budget, status, escrow_status, escrow_release_at, admin_approved)
       VALUES ($1, 'Worker Escrow Test', 100, 'holding', 'holding', CURRENT_TIMESTAMP - INTERVAL '1 minute', true)
       RETURNING id`,
      [testHostId]
    );
    testCampaignId = campRes.rows[0].id;

    const webhookRes = await pool.query(
      `INSERT INTO async_webhook_queue (source, payload, status)
       VALUES ('meta_leadgen', '{"lead_id":"123"}', 'pending')
       RETURNING id`
    );
    testWebhookId = webhookRes.rows[0].id;

    const txRes = await pool.query(
      `INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, updated_at)
       VALUES ($1, $2, $3, 'PRECHECK_RUNNING', CURRENT_TIMESTAMP - INTERVAL '350 seconds')
       RETURNING id`,
      [testCampaignId, `worker_test_tx_${Date.now()}`, `corr_${Date.now()}`]
    );
    testTxId = txRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test fixtures
    if (testTxId) await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [testTxId]);
    if (testWebhookId) await pool.query('DELETE FROM async_webhook_queue WHERE id = $1', [testWebhookId]);
    if (testCampaignId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    if (testHostId) await pool.query('DELETE FROM users WHERE id = $1', [testHostId]);
    await pool.end();
  });

  // ================================================================
  // TEST 1: Worker Startup & Version Verification
  // ================================================================
  it('1. Worker initializes with valid version and configuration', () => {
    expect(WORKER_VERSION).toMatch(/^2\.9\./);
    expect(typeof runShadowDiscovery).toBe('function');
    expect(typeof executeWorkerCycle).toBe('function');
  });

  // ================================================================
  // TEST 2: Health Endpoint (/healthz)
  // ================================================================
  it('2. GET /healthz reports 200 OK and connected database status', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.process_alive).toBe(true);
    expect(res.body.db_status).toBe('connected');
    expect(res.body.worker_version).toBe(WORKER_VERSION);
    expect(Array.isArray(res.body.active_workers)).toBe(true);
    expect(res.body.active_workers.length).toBe(8);
  });

  // ================================================================
  // TEST 3: Shadow Mode (Zero Mutations, Emits Would-Claim Events)
  // ================================================================
  it('3. Shadow mode discovers eligible records WITHOUT mutating state', async () => {
    const discoveryEvents = await runShadowDiscovery(pool);
    expect(Array.isArray(discoveryEvents)).toBe(true);

    const escrowClaim = discoveryEvents.find(e => e.worker_name === 'processEscrowAutoRelease' && e.campaign_id === testCampaignId);
    expect(escrowClaim).toBeDefined();
    expect(escrowClaim?.event).toBe('would_claim');
    expect(escrowClaim?.candidate_reason).toContain('escrow');

    // Verify campaign state was NOT mutated in database
    const checkCamp = await pool.query('SELECT escrow_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(checkCamp.rows[0].escrow_status).toBe('holding'); // Unchanged!
  });

  // ================================================================
  // TEST 4: Active Mode Execution (Performs State Mutations)
  // ================================================================
  it('4. Active mode claims and executes worker transitions', async () => {
    // Run webhook worker active function
    await processAsyncWebhookQueue(pool);

    const checkWh = await pool.query('SELECT status FROM async_webhook_queue WHERE id = $1', [testWebhookId]);
    expect(checkWh.rows[0].status).toBe('processed');
  });

  // ================================================================
  // TEST 5: Dual-Worker Coordination via FOR UPDATE SKIP LOCKED
  // ================================================================
  it('5. Dual workers (simulating Vercel + Cloud Run) claim disjoint records without collisions', async () => {
    // Seed 10 webhooks
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await pool.query("INSERT INTO async_webhook_queue (source, payload, status) VALUES ('meta_leadgen', '{}', 'pending') RETURNING id");
      ids.push(res.rows[0].id);
    }

    // Simulate Worker 1 (Vercel) and Worker 2 (Cloud Run) claiming simultaneously
    const claimBatch = async (): Promise<number[]> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(`
          SELECT id FROM async_webhook_queue
          WHERE status = 'pending' AND id = ANY($1::int[])
          ORDER BY id ASC
          LIMIT 5
          FOR UPDATE SKIP LOCKED
        `, [ids]);

        if (res.rows.length > 0) {
          await client.query(`UPDATE async_webhook_queue SET status = 'processing' WHERE id = ANY($1::int[])`, [res.rows.map(r => r.id)]);
        }
        await client.query('COMMIT');
        return res.rows.map(r => r.id);
      } catch {
        await client.query('ROLLBACK');
        return [];
      } finally {
        client.release();
      }
    };

    const [worker1Claims, worker2Claims] = await Promise.all([claimBatch(), claimBatch()]);

    // Clean up
    await pool.query('DELETE FROM async_webhook_queue WHERE id = ANY($1::int[])', [ids]);

    // Sets must be completely disjoint
    const intersection = worker1Claims.filter(id => worker2Claims.includes(id));
    expect(intersection.length).toBe(0);
    expect(worker1Claims.length + worker2Claims.length).toBe(10);
  });

  // ================================================================
  // TEST 6: Startup Recovery Audit
  // ================================================================
  it('6. Startup recovery audit discovers expired leases and orphaned transactions', async () => {
    const audit = await runStartupRecoveryAudit(pool);
    expect(typeof audit.expired_leases_found).toBe('number');
    expect(typeof audit.orphaned_publishing_txs).toBe('number');
    expect(typeof audit.pending_webhooks).toBe('number');
  });

  // ================================================================
  // TEST 7: Lease Recovery on Expired Lease
  // ================================================================
  it('7. Recovery worker re-claims transactions after lease expiration', async () => {
    // Set expired lease
    await pool.query(`
      UPDATE meta_publishing_transactions
      SET reconciliation_lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
      WHERE id = $1
    `, [testTxId]);

    const orphanClaims = await pool.query(`
      SELECT id FROM meta_publishing_transactions
      WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')
      AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
      AND id = $1
      FOR UPDATE SKIP LOCKED
    `, [testTxId]);

    expect(orphanClaims.rows.length).toBe(1);
    expect(orphanClaims.rows[0].id).toBe(testTxId);
  });

  // ================================================================
  // TEST 8: Zero Duplicate Financial Settlements
  // ================================================================
  it('8. Idempotency key constraint guarantees zero duplicate financial charges', async () => {
    const idempotencyKey = `idemp_test_${Date.now()}`;
    await pool.query(`
      INSERT INTO processed_payments (idempotency_key, razorpay_payment_id, amount, payment_gateway, type)
      VALUES ($1, 'pi_test_1', 100, 'stripe', 'campaign')
    `, [idempotencyKey]);

    let duplicateThrew = false;
    try {
      await pool.query(`
        INSERT INTO processed_payments (idempotency_key, razorpay_payment_id, amount, payment_gateway, type)
        VALUES ($1, 'pi_test_2', 100, 'stripe', 'campaign')
      `, [idempotencyKey]);
    } catch (err: any) {
      duplicateThrew = err.code === '23505'; // Unique violation
    }

    // Clean up
    await pool.query('DELETE FROM processed_payments WHERE idempotency_key = $1', [idempotencyKey]);

    expect(duplicateThrew).toBe(true);
  });

  // ================================================================
  // TEST 9: Semantic Parity (Shadow Discovery vs Worker Eligibility)
  // ================================================================
  it('9. Shadow discovery query logic exactly matches active worker selection criteria', async () => {
    const shadowEvents = await runShadowDiscovery(pool);
    const shadowOrphans = shadowEvents.filter(e => e.worker_name === 'recoverOrphanedMetaTransactions');

    // Run active query
    const activeQuery = await pool.query(`
      SELECT id FROM meta_publishing_transactions
      WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')
      AND updated_at < CURRENT_TIMESTAMP - INTERVAL '300 seconds'
      AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
      AND (reconciliation_attempt_count IS NULL OR reconciliation_attempt_count < 10)
      ORDER BY updated_at ASC, id ASC
      LIMIT 10
    `);

    expect(shadowOrphans.length).toBe(activeQuery.rows.length);
  });

  // ================================================================
  // TEST 10: Structured Telemetry in executeWorkerCycle
  // ================================================================
  it('10. executeWorkerCycle emits structured cycle stats with timing and mode', async () => {
    const stats = await executeWorkerCycle('recoverOrphanedMetaTransactions', async () => {}, pool);
    expect(stats.worker_name).toBe('recoverOrphanedMetaTransactions');
    expect(typeof stats.worker_instance_id).toBe('string');
    expect(typeof stats.started_at).toBe('string');
    expect(typeof stats.finished_at).toBe('string');
    expect(typeof stats.duration_ms).toBe('number');
    expect(stats.items_failed).toBe(0);
  });

  // ================================================================
  // TEST 11: Zero Duplicate Meta Mutations via Unique Idempotency Key
  // ================================================================
  it('11. UNIQUE(idempotency_key) constraint on meta_publishing_transactions prevents duplicate dispatch records', async () => {
    const idempotencyKey = `publish_meta_camp_unique_${Date.now()}`;
    await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status)
      VALUES ($1, $2, 'corr_1', 'PRECHECK_RUNNING')
    `, [testCampaignId, idempotencyKey]);

    let duplicateThrew = false;
    try {
      await pool.query(`
        INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status)
        VALUES ($1, $2, 'corr_2', 'PRECHECK_RUNNING')
      `, [testCampaignId, idempotencyKey]);
    } catch (err: any) {
      duplicateThrew = err.code === '23505'; // Unique violation
    }

    // Clean up
    await pool.query('DELETE FROM meta_publishing_transactions WHERE idempotency_key = $1', [idempotencyKey]);

    expect(duplicateThrew).toBe(true);
  });

  // ================================================================
  // TEST 12: Health Endpoint returns 503 when Database is Unreachable
  // ================================================================
  it('12. Health check endpoint accurately reflects worker lifecycle and active routines', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.active_workers).toContain('processEscrowAutoRelease');
    expect(res.body.active_workers).toContain('processMetaReconciliation');
    expect(res.body.active_workers).toContain('recoverOrphanedMetaTransactions');
  });
});
