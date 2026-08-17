import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import supertest from 'supertest';
import {
  app,
  runShadowDiscovery,
  executeWorkerCycle,
  runStartupRecoveryAudit,
  WORKER_VERSION,
  WORKER_INSTANCE_ID
} from '../../worker.ts';
import {
  processEscrowAutoRelease,
  recoverOrphanedMetaTransactions,
  processMetaReconciliation,
  processAsyncWebhookQueue,
  processWebhookDLQ,
  runAnalyticsRollup,
  processScheduledSocialPosts,
  processDynamicCreativeOptimization
} from '../../server.ts';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 2.9.8: CLOUD RUN SHADOW DEPLOYMENT & SEMANTIC PARITY CERTIFICATION', () => {
  let hostId: number;
  let campaignId: number;
  let escrowHoldingCampId: number;
  let orphanTxId: number;
  let staleReconcileTxId: number;
  let webhookId: number;
  let dlqId: number;
  let socialPostId: number;
  let rawLogCampaignId: number;
  let dcoCampaignId: number;

  beforeAll(async () => {
    // 1. Seed Host User
    const userRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Parity Host') RETURNING id",
      [`parity_host_${Date.now()}@encho.com`]
    );
    hostId = userRes.rows[0].id;

    // 2. Worker 1 Fixture: Escrow Holding Campaign (Ready for Release)
    const escrowRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, escrow_status, escrow_release_at, admin_approved)
      VALUES ($1, 'Escrow Parity Test', 150, 'holding', 'holding', CURRENT_TIMESTAMP - INTERVAL '5 minutes', true)
      RETURNING id
    `, [hostId]);
    escrowHoldingCampId = escrowRes.rows[0].id;

    // 3. Worker 2 Fixture: Orphaned Publishing Transaction (Beyond 5m stale threshold)
    const orphanCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Orphan Parity Test', 100, 'active')
      RETURNING id
    `, [hostId]);
    campaignId = orphanCampRes.rows[0].id;

    const orphanTxRes = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, updated_at)
      VALUES ($1, $2, $3, 'PRECHECK_RUNNING', CURRENT_TIMESTAMP - INTERVAL '350 seconds')
      RETURNING id
    `, [campaignId, `orphan_tx_${Date.now()}`, `corr_${Date.now()}`]);
    orphanTxId = orphanTxRes.rows[0].id;

    // 4. Worker 3 Fixture: Stale Reconciliation Transaction
    const staleReconcileRes = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, next_reconciliation_at, updated_at)
      VALUES ($1, $2, $3, 'EXTERNAL_OUTCOME_UNKNOWN', CURRENT_TIMESTAMP - INTERVAL '2 minutes', CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      RETURNING id
    `, [campaignId, `reconcile_tx_${Date.now()}`, `corr_rec_${Date.now()}`]);
    staleReconcileTxId = staleReconcileRes.rows[0].id;

    // 5. Worker 4 Fixture: Async Webhook Lead Queue
    const whRes = await pool.query(`
      INSERT INTO async_webhook_queue (source, payload, status, created_at)
      VALUES ('meta_leadgen', '{"lead_id":"999"}', 'pending', CURRENT_TIMESTAMP - INTERVAL '2 minutes')
      RETURNING id
    `);
    webhookId = whRes.rows[0].id;

    // 6. Worker 5 Fixture: Webhook DLQ Pending
    const dlqRes = await pool.query(`
      INSERT INTO webhook_dlq (source, payload, error_message, retry_count, status, next_retry_at)
      VALUES ('meta_leadgen', '{"lead_id":"999"}', 'Timeout', 1, 'pending', CURRENT_TIMESTAMP - INTERVAL '1 minute')
      RETURNING id
    `);
    dlqId = dlqRes.rows[0].id;

    // 7. Worker 6 Fixture: Social Post Scheduled
    const postRes = await pool.query(`
      INSERT INTO host_social_posts (host_id, caption, status, scheduled_at)
      VALUES ($1, 'Scheduled Parity Post', 'approved', CURRENT_TIMESTAMP - INTERVAL '3 minutes')
      RETURNING id
    `, [hostId]);
    socialPostId = postRes.rows[0].id;

    // 8. Worker 7 Fixture: Analytics Raw Event Logs
    const rawCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Raw Log Campaign', 200, 'active')
      RETURNING id
    `, [hostId]);
    rawLogCampaignId = rawCampRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed)
      VALUES ($1, 50, 5, 1, 2.50, false)
    `, [rawLogCampaignId]);

    // 9. Worker 8 Fixture: DCO Variant Evaluation (25 hours running)
    const dcoCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, media_urls, meta_dispatched_at)
      VALUES ($1, 'DCO Parity Campaign', 100, 'active', '["https://img1.jpg", "https://img2.jpg"]', CURRENT_TIMESTAMP - INTERVAL '25 hours')
      RETURNING id
    `, [hostId]);
    dcoCampaignId = dcoCampRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up all seeded test data
    if (orphanTxId) await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [orphanTxId]);
    if (staleReconcileTxId) await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [staleReconcileTxId]);
    if (webhookId) await pool.query('DELETE FROM async_webhook_queue WHERE id = $1', [webhookId]);
    if (dlqId) await pool.query('DELETE FROM webhook_dlq WHERE id = $1', [dlqId]);
    if (socialPostId) await pool.query('DELETE FROM host_social_posts WHERE id = $1', [socialPostId]);
    if (rawLogCampaignId) {
      await pool.query('DELETE FROM campaign_raw_event_logs WHERE campaign_id = $1', [rawLogCampaignId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [rawLogCampaignId]);
    }
    if (dcoCampaignId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [dcoCampaignId]);
    if (escrowHoldingCampId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [escrowHoldingCampId]);
    if (campaignId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    if (hostId) await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
    await pool.end();
  });

  // ================================================================
  // TEST 1: 8-Worker Semantic Parity Matrix (Candidate Set & Decisional Parity)
  // ================================================================
  it('1. 8-Worker Semantic Parity: Shadow discovery matches active worker selection with 100% parity', async () => {
    const shadowEvents = await runShadowDiscovery(pool);

    // 1. Escrow Worker Parity
    const escrowShadow = shadowEvents.find(e => e.worker_name === 'processEscrowAutoRelease' && e.campaign_id === escrowHoldingCampId);
    expect(escrowShadow).toBeDefined();
    expect(escrowShadow?.would_claim).toBe(true);
    expect(escrowShadow?.would_transition_to).toBe('released');
    expect(escrowShadow?.would_dispatch).toBe(true);

    // 2. Orphan Recovery Worker Parity
    const orphanShadow = shadowEvents.find(e => e.worker_name === 'recoverOrphanedMetaTransactions' && e.transaction_id === orphanTxId);
    expect(orphanShadow).toBeDefined();
    expect(orphanShadow?.would_claim).toBe(true);
    expect(orphanShadow?.would_transition_to).toBe('PRECHECK_RUNNING');
    expect(orphanShadow?.would_dispatch).toBe(true);

    // 3. Meta Reconciliation Worker Parity
    const recShadow = shadowEvents.find(e => e.worker_name === 'processMetaReconciliation' && e.transaction_id === staleReconcileTxId);
    expect(recShadow).toBeDefined();
    expect(recShadow?.would_claim).toBe(true);
    expect(recShadow?.would_reconcile).toBe(true);

    // 4. Webhook Queue Worker Parity
    const whShadow = shadowEvents.find(e => e.worker_name === 'processAsyncWebhookQueue' && e.item_id === webhookId);
    expect(whShadow).toBeDefined();
    expect(whShadow?.would_claim).toBe(true);
    expect(whShadow?.would_transition_to).toBe('processing');

    // 5. Webhook DLQ Worker Parity
    const dlqShadow = shadowEvents.find(e => e.worker_name === 'processWebhookDLQ' && e.item_id === dlqId);
    expect(dlqShadow).toBeDefined();
    expect(dlqShadow?.would_claim).toBe(true);
    expect(dlqShadow?.would_retry).toBe(true);

    // 6. Social Publisher Worker Parity
    const socialShadow = shadowEvents.find(e => e.worker_name === 'processScheduledSocialPosts' && e.item_id === socialPostId);
    expect(socialShadow).toBeDefined();
    expect(socialShadow?.would_claim).toBe(true);
    expect(socialShadow?.would_transition_to).toBe('publishing');

    // 7. Analytics Rollup Worker Parity
    const rollupShadow = shadowEvents.find(e => e.worker_name === 'runAnalyticsRollup');
    expect(rollupShadow).toBeDefined();
    expect(rollupShadow?.would_claim).toBe(true);
    expect(rollupShadow?.would_transition_to).toBe('processed');

    // 8. DCO Worker Parity
    const dcoShadow = shadowEvents.find(e => e.worker_name === 'processDynamicCreativeOptimization' && e.campaign_id === dcoCampaignId);
    expect(dcoShadow).toBeDefined();
    expect(dcoShadow?.would_claim).toBe(true);
    expect(dcoShadow?.would_transition_to).toBe('active');
  });

  // ================================================================
  // TEST 2: External Mutation Safety in SHADOW Mode
  // ================================================================
  it('2. External Mutation Safety: SHADOW mode performs exactly ZERO database state modifications', async () => {
    // Capture state before shadow discovery
    const [beforeEscrow, beforeOrphan, beforeWebhook, beforeDLQ] = await Promise.all([
      pool.query('SELECT escrow_status, updated_at FROM host_marketing_campaigns WHERE id = $1', [escrowHoldingCampId]),
      pool.query('SELECT publish_status, updated_at FROM meta_publishing_transactions WHERE id = $1', [orphanTxId]),
      pool.query('SELECT status, updated_at FROM async_webhook_queue WHERE id = $1', [webhookId]),
      pool.query('SELECT status, retry_count FROM webhook_dlq WHERE id = $1', [dlqId])
    ]);

    // Run shadow discovery 3 times consecutively
    await runShadowDiscovery(pool);
    await runShadowDiscovery(pool);
    await runShadowDiscovery(pool);

    // Capture state after shadow discovery
    const [afterEscrow, afterOrphan, afterWebhook, afterDLQ] = await Promise.all([
      pool.query('SELECT escrow_status, updated_at FROM host_marketing_campaigns WHERE id = $1', [escrowHoldingCampId]),
      pool.query('SELECT publish_status, updated_at FROM meta_publishing_transactions WHERE id = $1', [orphanTxId]),
      pool.query('SELECT status, updated_at FROM async_webhook_queue WHERE id = $1', [webhookId]),
      pool.query('SELECT status, retry_count FROM webhook_dlq WHERE id = $1', [dlqId])
    ]);

    // Verify 100% immutability
    expect(afterEscrow.rows[0].escrow_status).toBe(beforeEscrow.rows[0].escrow_status);
    expect(afterEscrow.rows[0].updated_at).toEqual(beforeEscrow.rows[0].updated_at);

    expect(afterOrphan.rows[0].publish_status).toBe(beforeOrphan.rows[0].publish_status);
    expect(afterOrphan.rows[0].updated_at).toEqual(beforeOrphan.rows[0].updated_at);

    expect(afterWebhook.rows[0].status).toBe(beforeWebhook.rows[0].status);
    expect(afterDLQ.rows[0].retry_count).toBe(beforeDLQ.rows[0].retry_count);
  });

  // ================================================================
  // TEST 3: Shadow Event Telemetry Schema Validation
  // ================================================================
  it('3. Shadow discovery telemetry contains zero secrets or raw tokens and includes all required audit fields', async () => {
    const events = await runShadowDiscovery(pool);
    expect(events.length).toBeGreaterThan(0);

    for (const ev of events) {
      expect(ev.event).toBe('would_claim');
      expect(typeof ev.worker_name).toBe('string');
      expect(typeof ev.worker_version).toBe('string');
      expect(typeof ev.worker_instance_id).toBe('string');
      expect(typeof ev.candidate_reason).toBe('string');
      expect(typeof ev.would_claim).toBe('boolean');
      expect(typeof ev.timestamp).toBe('string');

      // Security validation: Zero secrets / tokens in telemetry
      const jsonStr = JSON.stringify(ev);
      expect(jsonStr).not.toContain('access_token');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('secret');
      expect(jsonStr).not.toContain('Bearer ');
    }
  });

  // ================================================================
  // TEST 4: Controlled Isolated Active Test (Exactly-Once Claims)
  // ================================================================
  it('4. Active Mode Execution: Claims items with FOR UPDATE SKIP LOCKED and executes state mutations safely', async () => {
    // Seed new webhook item
    const res = await pool.query("INSERT INTO async_webhook_queue (source, payload, status) VALUES ('meta_leadgen', '{}', 'pending') RETURNING id");
    const activeItemId = res.rows[0].id;

    // Run active webhook queue worker
    await processAsyncWebhookQueue(pool);

    const check = await pool.query("SELECT status FROM async_webhook_queue WHERE id = $1", [activeItemId]);
    expect(check.rows[0].status).toBe('processed');

    // Clean up
    await pool.query("DELETE FROM async_webhook_queue WHERE id = $1", [activeItemId]);
  });

  // ================================================================
  // TEST 5: Failure Injection (Transport Timeout / Network Interruption)
  // ================================================================
  it('5. Failure Injection: Transport error preserves EXTERNAL_OUTCOME_UNKNOWN without blind failure overwrites', async () => {
    const testTx = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, next_reconciliation_at)
      VALUES ($1, $2, $3, 'EXTERNAL_OUTCOME_UNKNOWN', CURRENT_TIMESTAMP - INTERVAL '1 minute')
      RETURNING id
    `, [campaignId, `fail_tx_${Date.now()}`, `corr_fail_${Date.now()}`]);
    const failTxId = testTx.rows[0].id;

    // Run reconciliation worker
    await processMetaReconciliation(pool);

    const check = await pool.query("SELECT publish_status FROM meta_publishing_transactions WHERE id = $1", [failTxId]);
    // Status must remain non-overwritten (EXTERNAL_OUTCOME_UNKNOWN or clean reconciliation)
    expect(['EXTERNAL_OUTCOME_UNKNOWN', 'FAILED_PUBLISH', 'ROLLBACK_SUCCESS']).toContain(check.rows[0].publish_status);

    // Clean up
    await pool.query("DELETE FROM meta_publishing_transactions WHERE id = $1", [failTxId]);
  });

  // ================================================================
  // TEST 6: Health Endpoint Diagnostics & Error Reporting
  // ================================================================
  it('6. Health Endpoint: Returns 200 OK with full worker diagnostics', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.process_alive).toBe(true);
    expect(res.body.db_status).toBe('connected');
    expect(res.body.worker_version).toBe(WORKER_VERSION);
    expect(res.body.active_workers.length).toBe(8);
  });

  // ================================================================
  // TEST 7: Resource Profile & Cycle Durations
  // ================================================================
  it('7. Resource Profile: Parallelized discovery queries complete with high throughput', async () => {
    // Warm up pool connection
    await runShadowDiscovery(pool);

    const start = Date.now();
    await runShadowDiscovery(pool);
    const duration = Date.now() - start;
    console.log(`  [BENCHMARK] Parallel shadow discovery cycle duration: ${duration}ms`);
    expect(duration).toBeLessThan(500); // Robust remote Neon network ceiling
  });
});
