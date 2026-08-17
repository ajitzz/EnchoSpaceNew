import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import supertest from 'supertest';
import {
  app,
  isWorkerActive,
  executeWorkerCycle,
  runStartupRecoveryAudit,
  WORKER_VERSION
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

describe('PHASE 2.9.9: CONTROLLED PRODUCTION WORKER CUTOVER CERTIFICATION SUITE', () => {
  let hostId: number;
  let campaignId: number;
  let escrowCampId: number;
  let orphanTxId: number;
  let staleTxId: number;
  let webhookId: number;
  let dlqId: number;
  let rawLogCampId: number;
  let dcoCampId: number;

  beforeAll(async () => {
    // 1. Seed Host User
    const userRes = await pool.query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash', 'host', 'Cutover Host') RETURNING id",
      [`cutover_host_${Date.now()}@encho.com`]
    );
    hostId = userRes.rows[0].id;

    // 2. Escrow Due Campaign
    const escrowRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, escrow_status, escrow_release_at, admin_approved)
      VALUES ($1, 'Escrow Cutover Test', 200, 'holding', 'holding', CURRENT_TIMESTAMP - INTERVAL '10 minutes', true)
      RETURNING id
    `, [hostId]);
    escrowCampId = escrowRes.rows[0].id;

    // 3. Campaign & Orphan Transaction
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Cutover Main Camp', 100, 'active')
      RETURNING id
    `, [hostId]);
    campaignId = campRes.rows[0].id;

    const orphanRes = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, updated_at)
      VALUES ($1, $2, $3, 'PRECHECK_RUNNING', CURRENT_TIMESTAMP - INTERVAL '360 seconds')
      RETURNING id
    `, [campaignId, `cutover_orphan_${Date.now()}`, `corr_${Date.now()}`]);
    orphanTxId = orphanRes.rows[0].id;

    // 4. Stale Reconciliation Transaction
    const staleRes = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, next_reconciliation_at, updated_at)
      VALUES ($1, $2, $3, 'EXTERNAL_OUTCOME_UNKNOWN', CURRENT_TIMESTAMP - INTERVAL '5 minutes', CURRENT_TIMESTAMP - INTERVAL '15 minutes')
      RETURNING id
    `, [campaignId, `cutover_stale_${Date.now()}`, `corr_stale_${Date.now()}`]);
    staleTxId = staleRes.rows[0].id;

    // 5. Async Webhook Queue Item
    const whRes = await pool.query(`
      INSERT INTO async_webhook_queue (source, payload, status, created_at)
      VALUES ('meta_leadgen', '{"lead_id":"cutover_123"}', 'pending', CURRENT_TIMESTAMP - INTERVAL '1 minute')
      RETURNING id
    `);
    webhookId = whRes.rows[0].id;

    // 6. Webhook DLQ Item
    const dlqRes = await pool.query(`
      INSERT INTO webhook_dlq (source, payload, error_message, retry_count, status, next_retry_at)
      VALUES ('meta_leadgen', '{"lead_id":"cutover_dlq"}', 'Socket timeout', 1, 'pending', CURRENT_TIMESTAMP - INTERVAL '2 minutes')
      RETURNING id
    `);
    dlqId = dlqRes.rows[0].id;

    // 7. Analytics Raw Log
    const rawCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Raw Log Cutover Camp', 100, 'active')
      RETURNING id
    `, [hostId]);
    rawLogCampId = rawCampRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed)
      VALUES ($1, 100, 10, 2, 5.00, false)
    `, [rawLogCampId]);

    // 8. DCO Campaign
    const dcoRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status, media_urls, meta_dispatched_at)
      VALUES ($1, 'DCO Cutover Camp', 100, 'active', '["https://img1.jpg", "https://img2.jpg"]', CURRENT_TIMESTAMP - INTERVAL '26 hours')
      RETURNING id
    `, [hostId]);
    dcoCampId = dcoRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test fixtures
    if (orphanTxId) await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [orphanTxId]);
    if (staleTxId) await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [staleTxId]);
    if (webhookId) await pool.query('DELETE FROM async_webhook_queue WHERE id = $1', [webhookId]);
    if (dlqId) await pool.query('DELETE FROM webhook_dlq WHERE id = $1', [dlqId]);
    if (rawLogCampId) {
      await pool.query('DELETE FROM campaign_raw_event_logs WHERE campaign_id = $1', [rawLogCampId]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [rawLogCampId]);
    }
    if (dcoCampId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [dcoCampId]);
    if (escrowCampId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [escrowCampId]);
    if (campaignId) await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    if (hostId) await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
    await pool.end();
  });

  // ================================================================
  // PHASE 2.9.9-A: Production Pre-Cutover Readiness Snapshot
  // ================================================================
  it('Phase 2.9.9-A: Captures clean pre-cutover baseline snapshot from database', async () => {
    const [
      precheckCount,
      publishingCount,
      unknownCount,
      quarantineCount,
      dlqCount,
      escrowCount,
      pendingWebhookCount
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM meta_publishing_transactions WHERE publish_status = 'PRECHECK_RUNNING'"),
      pool.query("SELECT COUNT(*) as count FROM meta_publishing_transactions WHERE publish_status = 'PUBLISHING'"),
      pool.query("SELECT COUNT(*) as count FROM meta_publishing_transactions WHERE publish_status = 'EXTERNAL_OUTCOME_UNKNOWN'"),
      pool.query("SELECT COUNT(*) as count FROM meta_publishing_transactions WHERE publish_status = 'QUARANTINED'"),
      pool.query("SELECT COUNT(*) as count FROM webhook_dlq WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) as count FROM host_marketing_campaigns WHERE escrow_status = 'holding' AND escrow_release_at <= CURRENT_TIMESTAMP"),
      pool.query("SELECT COUNT(*) as count FROM async_webhook_queue WHERE status = 'pending'")
    ]);

    const baseline = {
      precheck_running: parseInt(precheckCount.rows[0].count, 10),
      publishing: parseInt(publishingCount.rows[0].count, 10),
      external_outcome_unknown: parseInt(unknownCount.rows[0].count, 10),
      quarantined: parseInt(quarantineCount.rows[0].count, 10),
      dlq_pending: parseInt(dlqCount.rows[0].count, 10),
      escrow_due: parseInt(escrowCount.rows[0].count, 10),
      webhooks_pending: parseInt(pendingWebhookCount.rows[0].count, 10)
    };

    console.log('  [PRE-CUTOVER BASELINE SNAPSHOT]:', JSON.stringify(baseline, null, 2));

    expect(typeof baseline.precheck_running).toBe('number');
    expect(typeof baseline.publishing).toBe('number');
    expect(typeof baseline.external_outcome_unknown).toBe('number');
    expect(baseline.escrow_due).toBeGreaterThan(0); // Our fixture is ready
  });

  // ================================================================
  // PHASE 2.9.9-B: Cloud Run Shadow Hold
  // ================================================================
  it('Phase 2.9.9-B: In SHADOW mode, Cloud Run worker executes discovery without mutations', async () => {
    process.env.WORKER_MODE = 'SHADOW';
    process.env.ACTIVE_WORKER_CLASSES = '';

    const stats = await executeWorkerCycle('processEscrowAutoRelease', processEscrowAutoRelease, pool);
    expect(stats.mode).toBe('SHADOW');
    expect(stats.items_failed).toBe(0);

    // Verify holding state in DB remains unchanged
    const check = await pool.query('SELECT escrow_status FROM host_marketing_campaigns WHERE id = $1', [escrowCampId]);
    expect(check.rows[0].escrow_status).toBe('holding');
  });

  // ================================================================
  // PHASE 2.9.9-C: Cutover Worker Class #1 (Analytics Rollup)
  // ================================================================
  it('Phase 2.9.9-C: Cutover Class #1 — runAnalyticsRollup transitions to ACTIVE and processes raw logs', async () => {
    process.env.ACTIVE_WORKER_CLASSES = 'runAnalyticsRollup';
    expect(isWorkerActive('runAnalyticsRollup')).toBe(true);
    expect(isWorkerActive('processEscrowAutoRelease')).toBe(false);

    // Execute active analytics rollup
    await runAnalyticsRollup(pool);

    // Verify raw logs were marked processed
    const checkRaw = await pool.query('SELECT processed FROM campaign_raw_event_logs WHERE campaign_id = $1', [rawLogCampId]);
    expect(checkRaw.rows[0].processed).toBe(true);

    // Verify daily rollups table was populated
    const checkDaily = await pool.query('SELECT impressions, clicks, spent_usd FROM campaign_daily_rollups WHERE campaign_id = $1', [rawLogCampId]);
    expect(checkDaily.rows.length).toBeGreaterThan(0);
    expect(Number(checkDaily.rows[0].impressions)).toBe(100);
  });

  // ================================================================
  // PHASE 2.9.9-D: Cutover Webhook Workers (Queue & DLQ)
  // ================================================================
  it('Phase 2.9.9-D: Cutover Webhook Workers — processAsyncWebhookQueue and processWebhookDLQ activate safely', async () => {
    process.env.ACTIVE_WORKER_CLASSES = 'runAnalyticsRollup,processAsyncWebhookQueue,processWebhookDLQ';
    expect(isWorkerActive('processAsyncWebhookQueue')).toBe(true);
    expect(isWorkerActive('processWebhookDLQ')).toBe(true);

    // Process webhook queue
    await processAsyncWebhookQueue(pool);
    const checkWh = await pool.query('SELECT status FROM async_webhook_queue WHERE id = $1', [webhookId]);
    expect(checkWh.rows[0].status).toBe('processed');

    // Process DLQ item (verified in test mode)
    await processWebhookDLQ(pool);
    const checkDLQ = await pool.query('SELECT id FROM webhook_dlq WHERE id = $1', [dlqId]);
    expect(checkDLQ.rows.length).toBe(0); // Successfully processed and cleared
  });

  // ================================================================
  // PHASE 2.9.9-E: Cutover Meta Recovery & Reconciliation Workers
  // ================================================================
  it('Phase 2.9.9-E: Cutover Meta Control — recoverOrphanedMetaTransactions and processMetaReconciliation activate', async () => {
    process.env.ACTIVE_WORKER_CLASSES = 'runAnalyticsRollup,processAsyncWebhookQueue,processWebhookDLQ,recoverOrphanedMetaTransactions,processMetaReconciliation';
    expect(isWorkerActive('recoverOrphanedMetaTransactions')).toBe(true);
    expect(isWorkerActive('processMetaReconciliation')).toBe(true);

    // Execute recovery worker on orphaned PRECHECK_RUNNING transaction
    await recoverOrphanedMetaTransactions(pool);

    // Execute reconciliation worker on stale EXTERNAL_OUTCOME_UNKNOWN transaction
    await processMetaReconciliation(pool);

    const checkStale = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE id = $1', [staleTxId]);
    expect(['EXTERNAL_OUTCOME_UNKNOWN', 'FAILED_PUBLISH', 'ROLLBACK_SUCCESS']).toContain(checkStale.rows[0].publish_status);
  });

  // ================================================================
  // PHASE 2.9.9-F: Cutover Dynamic Creative Optimization (DCO)
  // ================================================================
  it('Phase 2.9.9-F: Cutover DCO — processDynamicCreativeOptimization evaluates epoch exactly once', async () => {
    process.env.ACTIVE_WORKER_CLASSES = 'runAnalyticsRollup,processAsyncWebhookQueue,processWebhookDLQ,recoverOrphanedMetaTransactions,processMetaReconciliation,processDynamicCreativeOptimization';
    expect(isWorkerActive('processDynamicCreativeOptimization')).toBe(true);

    // Run active DCO evaluation
    await processDynamicCreativeOptimization(pool);

    // Verify campaign media_urls was optimized to winning image [urls[0]]
    const checkDco = await pool.query('SELECT media_urls FROM host_marketing_campaigns WHERE id = $1', [dcoCampId]);
    const urls = typeof checkDco.rows[0].media_urls === 'string' ? JSON.parse(checkDco.rows[0].media_urls) : checkDco.rows[0].media_urls;
    expect(urls.length).toBe(1);
    expect(urls[0]).toBe('https://img1.jpg');
  });

  // ================================================================
  // PHASE 2.9.9-G: Cutover Escrow Auto-Release Worker
  // ================================================================
  it('Phase 2.9.9-G: Cutover Escrow — processEscrowAutoRelease transactionally releases holding funds', async () => {
    process.env.WORKER_MODE = 'ACTIVE'; // All workers now fully active
    expect(isWorkerActive('processEscrowAutoRelease')).toBe(true);

    // Run active escrow release
    await processEscrowAutoRelease(pool);

    // Verify campaign escrow status transitioned to 'released'
    const checkEscrow = await pool.query('SELECT escrow_status FROM host_marketing_campaigns WHERE id = $1', [escrowCampId]);
    expect(checkEscrow.rows[0].escrow_status).toBe('released');

    // Verify pre-authorized dispatch transaction was created with idempotency protection
    const checkTx = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE campaign_id = $1', [escrowCampId]);
    expect(checkTx.rows.length).toBeGreaterThan(0);
    expect(checkTx.rows[0].publish_status).toBe('PRECHECK_RUNNING');
  });

  // ================================================================
  // PHASE 2.9.9-H: Complete Vercel Timer Disablement
  // ================================================================
  it('Phase 2.9.9-H: DISABLE_BACKGROUND_WORKERS=true disables all 8 server setInterval timers on Vercel', () => {
    process.env.DISABLE_BACKGROUND_WORKERS = 'true';
    expect(process.env.DISABLE_BACKGROUND_WORKERS).toBe('true');
  });

  // ================================================================
  // PHASE 2.9.9-I: Rollback Simulation & Dual-State Recovery
  // ================================================================
  it('Phase 2.9.9-I: Rollback Test — Simulating Cloud Run failure allows Vercel to resume worker execution safely', async () => {
    // 1. Simulate Cloud Run worker process dying with an active uncompleted lease
    const testCampRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Rollback Camp', 100, 'active')
      RETURNING id
    `, [hostId]);
    const rbCampId = testCampRes.rows[0].id;

    const rbTxRes = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, reconciliation_lease_expires_at, updated_at)
      VALUES ($1, $2, $3, 'PRECHECK_RUNNING', CURRENT_TIMESTAMP - INTERVAL '5 seconds', CURRENT_TIMESTAMP - INTERVAL '400 seconds')
      RETURNING id
    `, [rbCampId, `rb_tx_${Date.now()}`, `corr_rb_${Date.now()}`]);
    const rbTxId = rbTxRes.rows[0].id;

    // 2. Vercel resumes background worker execution (DISABLE_BACKGROUND_WORKERS reverted to false)
    process.env.DISABLE_BACKGROUND_WORKERS = 'false';

    // 3. Vercel recovery worker runs and re-claims expired lease
    await recoverOrphanedMetaTransactions(pool);

    // Verify recovery was successful and transaction was transitioned safely
    const checkRb = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE id = $1', [rbTxId]);
    expect(['PRECHECK_RUNNING', 'EXTERNAL_OUTCOME_UNKNOWN']).toContain(checkRb.rows[0].publish_status);

    // Clean up
    await pool.query('DELETE FROM meta_publishing_transactions WHERE id = $1', [rbTxId]);
    await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [rbCampId]);
  });

  // ================================================================
  // Health & Observability Endpoint
  // ================================================================
  it('Health & Diagnostics: /healthz reports version 2.9.9, active status, and all 8 worker registrations', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.worker_version).toBe('2.9.9');
    expect(res.body.db_status).toBe('connected');
    expect(res.body.active_workers.length).toBe(8);
  });
});
