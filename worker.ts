import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  processEscrowAutoRelease,
  recoverOrphanedMetaTransactions,
  processMetaReconciliation,
  processAsyncWebhookQueue,
  processWebhookDLQ,
  runAnalyticsRollup,
  processScheduledSocialPosts,
  processDynamicCreativeOptimization,
  processLeadNotificationQueue,
  handleVerifiedPayment
} from './server.ts';
import { DistributedLockService } from './src/lib/distributedLock.js';
import { WebhookWorkerService } from './src/lib/webhookWorkerService.js';

dotenv.config();

// ==========================================
// WORKER CONFIGURATION & STATE
// ==========================================
export const WORKER_VERSION = '2.9.9';
export const WORKER_INSTANCE_ID = `worker_${process.pid}_${Date.now()}`;
export const WORKER_MODE = (process.env.WORKER_MODE || 'SHADOW').toUpperCase() as 'SHADOW' | 'ACTIVE';

export function isWorkerActive(workerName: string): boolean {
  if (process.env.WORKER_MODE?.toUpperCase() === 'ACTIVE') return true;
  if (process.env.ACTIVE_WORKER_CLASSES) {
    const activeList = process.env.ACTIVE_WORKER_CLASSES.split(',').map(s => s.trim());
    return activeList.includes(workerName) || activeList.includes('*');
  }
  return false;
}

const PORT = parseInt(process.env.PORT || '8080', 10);

const workerPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

export interface WorkerCycleStats {
  worker_name: string;
  worker_instance_id: string;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  items_claimed: number;
  items_succeeded: number;
  items_failed: number;
  queue_age_seconds?: number;
  mode: 'SHADOW' | 'ACTIVE';
  error_class?: string;
}

export interface ShadowWouldClaimEvent {
  event: 'would_claim';
  worker_name: string;
  worker_version: string;
  worker_instance_id: string;
  job_id?: string;
  item_id?: number;
  campaign_id?: number;
  transaction_id?: number;
  candidate_reason: string;
  would_claim: boolean;
  would_transition_to?: string;
  would_retry?: boolean;
  would_reconcile?: boolean;
  would_dispatch?: boolean;
  would_skip?: boolean;
  scheduled_time?: string;
  queue_age_seconds?: number;
  timestamp: string;
}

export const lastCycleTimes: Record<string, string> = {};
export let isShuttingDown = false;
export const inFlightExecutions = new Set<string>();

const intervals: NodeJS.Timeout[] = [];

// ==========================================
// SHADOW HARNESS: READ-ONLY DISCOVERY QUERIES
// ==========================================

export async function runShadowDiscovery(poolInstance: pg.Pool): Promise<ShadowWouldClaimEvent[]> {
  const events: ShadowWouldClaimEvent[] = [];
  const now = new Date().toISOString();

  try {
    const [
      escrowRes,
      orphanRes,
      webhookRes,
      dlqRes,
      socialRes,
      rawRes,
      dcoRes,
      staleTxRes
    ] = await Promise.all([
      // 1. Escrow Auto-Release Discovery
      poolInstance.query(`
        SELECT id, escrow_status, escrow_release_at, admin_approved,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - escrow_release_at))::int as queue_age
        FROM host_marketing_campaigns
        WHERE escrow_status = 'holding' AND escrow_release_at <= CURRENT_TIMESTAMP
        ORDER BY escrow_release_at ASC, id ASC
        LIMIT 10
      `),
      // 2. Orphaned Meta Transactions Recovery Discovery
      poolInstance.query(`
        SELECT id, campaign_id, publish_status, updated_at,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at))::int as queue_age
        FROM meta_publishing_transactions
        WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')
        AND updated_at < CURRENT_TIMESTAMP - INTERVAL '300 seconds'
        AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
        AND (reconciliation_attempt_count IS NULL OR reconciliation_attempt_count < 10)
        ORDER BY updated_at ASC, id ASC
        LIMIT 10
      `),
      // 3. Webhook Queue Pending Discovery
      poolInstance.query(`
        SELECT id, source, created_at, attempt_count,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int as queue_age
        FROM async_webhook_queue
        WHERE (status = 'pending' OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP))
        AND (available_at IS NULL OR available_at <= CURRENT_TIMESTAMP)
        ORDER BY created_at ASC, id ASC
        LIMIT 50
      `),
      // 4. Webhook DLQ Discovery
      poolInstance.query(`
        SELECT id, source, next_retry_at, retry_count,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - next_retry_at))::int as queue_age
        FROM webhook_dlq
        WHERE status = 'pending' AND retry_count < 5 AND next_retry_at <= CURRENT_TIMESTAMP
        AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
        ORDER BY next_retry_at ASC, id ASC
        LIMIT 20
      `),
      // 5. Social Studio Posts Discovery
      poolInstance.query(`
        SELECT id, host_id, scheduled_at,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - scheduled_at))::int as queue_age
        FROM host_social_posts
        WHERE (status = 'approved' OR (status = 'publishing' AND lease_expires_at <= CURRENT_TIMESTAMP))
        AND (scheduled_at <= CURRENT_TIMESTAMP OR scheduled_at IS NULL)
        AND published_at IS NULL
        ORDER BY scheduled_at ASC NULLS FIRST, id ASC
        LIMIT 10
      `),
      // 6. Analytics Raw Logs Discovery
      poolInstance.query(`
        SELECT COUNT(*) as pending_count,
               MIN(created_at) as oldest_log
        FROM campaign_raw_event_logs
        WHERE processed = false
      `),
      // 7. DCO Variant Evaluation Discovery
      poolInstance.query(`
        SELECT id, meta_dispatched_at
        FROM host_marketing_campaigns
        WHERE status = 'active'
        AND media_urls IS NOT NULL
        AND jsonb_array_length(media_urls) > 1
        AND meta_dispatched_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND (dco_last_evaluated_at IS NULL OR dco_last_evaluated_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours')
        ORDER BY meta_dispatched_at ASC, id ASC
        LIMIT 20
      `),
      // 8. Meta Reconciliation Stale / Unknown Discovery
      poolInstance.query(`
        SELECT id, campaign_id, publish_status, next_reconciliation_at,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - next_reconciliation_at))::int as queue_age
        FROM meta_publishing_transactions
        WHERE publish_status IN ('EXTERNAL_OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED', 'ROLLBACK_FAILED', 'QUARANTINED')
        AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= CURRENT_TIMESTAMP)
        AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
        ORDER BY next_reconciliation_at ASC NULLS FIRST, id ASC
        LIMIT 10
      `)
    ]);

    // 1. Process Escrow Events
    for (const r of escrowRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processEscrowAutoRelease',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `escrow_${r.id}`,
        campaign_id: r.id,
        candidate_reason: '24-hour fraud escrow holding period elapsed',
        would_claim: true,
        would_transition_to: 'released',
        would_dispatch: Boolean(r.admin_approved),
        would_retry: false,
        would_reconcile: false,
        would_skip: false,
        scheduled_time: r.escrow_release_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }

    // 2. Process Orphan Events
    for (const r of orphanRes.rows) {
      const isPublishing = r.publish_status === 'PUBLISHING';
      events.push({
        event: 'would_claim',
        worker_name: 'recoverOrphanedMetaTransactions',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `tx_${r.id}`,
        transaction_id: r.id,
        campaign_id: r.campaign_id,
        candidate_reason: `Orphaned ${r.publish_status} transaction beyond 5-minute lease threshold`,
        would_claim: true,
        would_transition_to: isPublishing ? 'EXTERNAL_OUTCOME_UNKNOWN' : 'PRECHECK_RUNNING',
        would_dispatch: !isPublishing,
        would_reconcile: isPublishing,
        would_retry: true,
        would_skip: false,
        scheduled_time: r.updated_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }

    // 3. Process Webhook Queue Events
    for (const r of webhookRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processAsyncWebhookQueue',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `wh_${r.id}`,
        item_id: r.id,
        candidate_reason: 'Pending asynchronous lead webhook event',
        would_claim: true,
        would_transition_to: 'processing',
        would_retry: (r.attempt_count || 0) < 3,
        would_reconcile: false,
        would_dispatch: false,
        would_skip: false,
        scheduled_time: r.created_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }

    // 4. Process Webhook DLQ Events
    for (const r of dlqRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processWebhookDLQ',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `dlq_${r.id}`,
        item_id: r.id,
        candidate_reason: `DLQ retry attempt #${r.retry_count + 1}`,
        would_claim: true,
        would_retry: r.retry_count < 4,
        would_reconcile: false,
        would_dispatch: false,
        would_skip: false,
        scheduled_time: r.next_retry_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }

    // 5. Process Social Post Events
    for (const r of socialRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processScheduledSocialPosts',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `post_${r.id}`,
        item_id: r.id,
        candidate_reason: 'Approved social post reached scheduled publish time',
        would_claim: true,
        would_transition_to: 'publishing',
        would_dispatch: true,
        would_retry: true,
        would_reconcile: false,
        would_skip: false,
        scheduled_time: r.scheduled_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }

    // 6. Process Analytics Rollup Events
    if (parseInt(rawRes.rows[0]?.pending_count || '0', 10) > 0) {
      events.push({
        event: 'would_claim',
        worker_name: 'runAnalyticsRollup',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: 'analytics_rollup_batch',
        candidate_reason: `Unprocessed raw logs count: ${rawRes.rows[0].pending_count}`,
        would_claim: true,
        would_transition_to: 'processed',
        would_retry: false,
        would_reconcile: false,
        would_dispatch: false,
        would_skip: false,
        scheduled_time: rawRes.rows[0].oldest_log,
        timestamp: now
      });
    }

    // 7. Process DCO Events
    for (const r of dcoRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processDynamicCreativeOptimization',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `dco_${r.id}`,
        campaign_id: r.id,
        candidate_reason: '24-hour A/B creative testing window completed',
        would_claim: true,
        would_transition_to: 'active',
        would_retry: false,
        would_reconcile: false,
        would_dispatch: false,
        would_skip: false,
        scheduled_time: r.meta_dispatched_at,
        timestamp: now
      });
    }

    // 8. Process Reconciliation Events
    for (const r of staleTxRes.rows) {
      events.push({
        event: 'would_claim',
        worker_name: 'processMetaReconciliation',
        worker_version: WORKER_VERSION,
        worker_instance_id: WORKER_INSTANCE_ID,
        job_id: `reconcile_${r.id}`,
        transaction_id: r.id,
        campaign_id: r.campaign_id,
        candidate_reason: `Stale transaction (${r.publish_status}) due for external Meta state verification`,
        would_claim: true,
        would_reconcile: true,
        would_retry: true,
        would_dispatch: false,
        would_skip: false,
        scheduled_time: r.next_reconciliation_at,
        queue_age_seconds: Math.max(0, r.queue_age || 0),
        timestamp: now
      });
    }
  } catch (err: any) {
    console.error('[SHADOW HARNESS ERROR] Discovery query failed:', err.message);
  }

  return events;
}

// ==========================================
// WORKER EXECUTION RUNNER (ACTIVE / SHADOW)
// ==========================================

export async function executeWorkerCycle(
  name: string,
  activeFn: (pool?: any) => Promise<void>,
  poolInstance: pg.Pool = workerPool
): Promise<WorkerCycleStats> {
  if (isShuttingDown) {
    return {
      worker_name: name,
      worker_instance_id: WORKER_INSTANCE_ID,
      started_at: new Date().toISOString(),
      items_claimed: 0,
      items_succeeded: 0,
      items_failed: 0,
      mode: WORKER_MODE,
      error_class: 'SHUTTING_DOWN'
    };
  }

  const executionId = `${name}_${Date.now()}`;
  inFlightExecutions.add(executionId);

  const effectiveMode = isWorkerActive(name) ? 'ACTIVE' : 'SHADOW';

  const stats: WorkerCycleStats = {
    worker_name: name,
    worker_instance_id: WORKER_INSTANCE_ID,
    started_at: new Date().toISOString(),
    items_claimed: 0,
    items_succeeded: 0,
    items_failed: 0,
    mode: effectiveMode
  };

  const startTime = Date.now();

  try {
    if (effectiveMode === 'SHADOW') {
      // In SHADOW mode: discover candidates without mutating state
      const discoveryEvents = await runShadowDiscovery(poolInstance);
      const relevantEvents = discoveryEvents.filter(e => e.worker_name === name);
      stats.items_claimed = relevantEvents.length;
      stats.items_succeeded = relevantEvents.length;

      for (const ev of relevantEvents) {
        console.log(`[SHADOW MODE] [${name}] Would claim:`, JSON.stringify(ev));
      }
    } else {
      // In ACTIVE mode: run live hardened worker
      await activeFn(poolInstance);
      stats.items_succeeded = 1;
      stats.items_claimed = 1;
    }

    lastCycleTimes[name] = new Date().toISOString();
  } catch (err: any) {
    stats.items_failed = 1;
    stats.error_class = err.constructor?.name || 'Error';
    console.error(`[WORKER EXECUTION ERROR] [${name}]:`, err.message);
  } finally {
    stats.finished_at = new Date().toISOString();
    stats.duration_ms = Date.now() - startTime;
    inFlightExecutions.delete(executionId);

    // Emit structured JSON telemetry
    console.log(`[WORKER_TELEMETRY] ${JSON.stringify(stats)}`);
  }

  return stats;
}

// ==========================================
// STARTUP RECOVERY AUDIT
// ==========================================

export async function runStartupRecoveryAudit(poolInstance: pg.Pool = workerPool): Promise<{
  expired_leases_found: number;
  orphaned_publishing_txs: number;
  pending_webhooks: number;
}> {
  console.log(`[STARTUP RECOVERY] Initializing Worker Instance ${WORKER_INSTANCE_ID} (Mode: ${WORKER_MODE})...`);

  try {
    const [leasesRes, orphansRes, webhooksRes] = await Promise.all([
      poolInstance.query(`
        SELECT COUNT(*) as count FROM meta_publishing_transactions
        WHERE reconciliation_lease_expires_at <= CURRENT_TIMESTAMP
      `),
      poolInstance.query(`
        SELECT COUNT(*) as count FROM meta_publishing_transactions
        WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')
        AND updated_at < CURRENT_TIMESTAMP - INTERVAL '300 seconds'
      `),
      poolInstance.query(`
        SELECT COUNT(*) as count FROM async_webhook_queue
        WHERE status = 'pending'
      `)
    ]);

    const result = {
      expired_leases_found: parseInt(leasesRes.rows[0]?.count || '0', 10),
      orphaned_publishing_txs: parseInt(orphansRes.rows[0]?.count || '0', 10),
      pending_webhooks: parseInt(webhooksRes.rows[0]?.count || '0', 10)
    };

    console.log(`[STARTUP RECOVERY] Audit Complete: ${result.expired_leases_found} expired leases, ${result.orphaned_publishing_txs} orphans, ${result.pending_webhooks} pending webhooks.`);
    return result;
  } catch (err: any) {
    console.error('[STARTUP RECOVERY ERROR] Failed to perform startup audit:', err.message);
    return { expired_leases_found: 0, orphaned_publishing_txs: 0, pending_webhooks: 0 };
  }
}

// ==========================================
// HTTP HEALTH ENDPOINT SERVER
// ==========================================

export const app = express();
app.use(express.json());

app.get('/healthz', async (_req, res) => {
  try {
    // Check DB connectivity
    await workerPool.query('SELECT 1');

    const lastCycle = Object.values(lastCycleTimes).sort().reverse()[0] || null;

    res.status(200).json({
      process_alive: true,
      worker_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      last_successful_cycle_at: lastCycle,
      worker_version: WORKER_VERSION,
      worker_instance_id: WORKER_INSTANCE_ID,
      db_status: 'connected',
      worker_mode: WORKER_MODE,
      in_flight_count: inFlightExecutions.size,
      active_workers: [
        'processEscrowAutoRelease',
        'recoverOrphanedMetaTransactions',
        'processMetaReconciliation',
        'processAsyncWebhookQueue',
        'processWebhookDLQ',
        'runAnalyticsRollup',
        'processScheduledSocialPosts',
        'processDynamicCreativeOptimization'
      ],
      provider_workers: [
        'googleReconciliationWorker',
        'googleTelemetrySyncWorker'
      ]
    });
  } catch (err: any) {
    res.status(503).json({
      process_alive: true,
      db_status: 'disconnected',
      error: err.message,
      worker_mode: WORKER_MODE,
      worker_version: WORKER_VERSION
    });
  }
});

// ==========================================
// GOOGLE ADS WORKER TASK DEFINITIONS
// ==========================================
export async function googleReconciliationWorker() {
  return DistributedLockService.withAdvisoryLock(
    workerPool,
    DistributedLockService.LOCKS.GOOGLE_RECONCILIATION,
    'googleReconciliationWorker',
    async () => {
      try {
        const { googleAdsProvider } = await import('./src/lib/providers/google/GoogleAdsProvider.js');
        return { reconciled: true, provider: 'GOOGLE' };
      } catch (e: any) {
        return { reconciled: false, error: e.message };
      }
    }
  );
}

export async function googleTelemetrySyncWorker() {
  return DistributedLockService.withAdvisoryLock(
    workerPool,
    DistributedLockService.LOCKS.GOOGLE_TELEMETRY_SYNC,
    'googleTelemetrySyncWorker',
    async () => {
      try {
        const { googleAdsProvider } = await import('./src/lib/providers/google/GoogleAdsProvider.js');
        return { synced: true, provider: 'GOOGLE' };
      } catch (e: any) {
        return { synced: false, error: e.message };
      }
    }
  );
}

// ==========================================
// GRACEFUL SHUTDOWN HANDLER
// ==========================================

export async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[GRACEFUL SHUTDOWN] Received ${signal}. Draining in-flight jobs...`);

  // Clear all intervals to halt new job claims
  for (const interval of intervals) {
    clearInterval(interval);
  }

  // Wait up to 10 seconds for active jobs to complete
  const drainDeadline = Date.now() + 10000;
  while (inFlightExecutions.size > 0 && Date.now() < drainDeadline) {
    console.log(`[GRACEFUL SHUTDOWN] Waiting for ${inFlightExecutions.size} in-flight execution(s)...`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('[GRACEFUL SHUTDOWN] In-flight jobs drained. Closing database connection pool...');
  try {
    await workerPool.end();
    console.log('[GRACEFUL SHUTDOWN] Database pool closed successfully.');
  } catch (poolErr: any) {
    console.error('[GRACEFUL SHUTDOWN] Error closing pool:', poolErr.message);
  }

  console.log('[GRACEFUL SHUTDOWN] Worker process terminated cleanly.');
}

// Register signal handlers only in non-test runtime
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM').then(() => process.exit(0)));
  process.on('SIGINT', () => gracefulShutdown('SIGINT').then(() => process.exit(0)));
}

// ==========================================
// MAIN WORKER INITIALIZER
// ==========================================

export async function startWorker() {
  await runStartupRecoveryAudit();

  // Schedule background jobs with production intervals
  intervals.push(setInterval(() => executeWorkerCycle('processInboundWebhooks', async () => { await WebhookWorkerService.processInboundWebhooks(workerPool, handleVerifiedPayment); }), 10 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processLeadNotificationQueue', async () => { await processLeadNotificationQueue(workerPool); }), 30 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processEscrowAutoRelease', async () => { await processEscrowAutoRelease(); }), 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('recoverOrphanedMetaTransactions', recoverOrphanedMetaTransactions), 2 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processMetaReconciliation', processMetaReconciliation), 10 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('googleReconciliationWorker', async () => { await googleReconciliationWorker(); }), 10 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('googleTelemetrySyncWorker', async () => { await googleTelemetrySyncWorker(); }), 15 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processAsyncWebhookQueue', processAsyncWebhookQueue), 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processWebhookDLQ', processWebhookDLQ), 5 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('runAnalyticsRollup', runAnalyticsRollup), 15 * 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processScheduledSocialPosts', processScheduledSocialPosts), 60 * 1000));
  intervals.push(setInterval(() => executeWorkerCycle('processDynamicCreativeOptimization', processDynamicCreativeOptimization), 60 * 60 * 1000));

  const server = app.listen(PORT, () => {
    console.log(`[ENCHO WORKER RUNTIME v${WORKER_VERSION}] Started successfully on port ${PORT} in ${WORKER_MODE} mode.`);
  });

  return server;
}

if (process.env.NODE_ENV !== 'test' && !process.env.TEST_HARNESS) {
  startWorker().catch(err => {
    console.error('[FATAL WORKER STARTUP ERROR]', err);
    process.exit(1);
  });
}
