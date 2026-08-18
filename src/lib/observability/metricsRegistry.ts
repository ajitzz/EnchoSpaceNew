/**
 * ENCHO METRICS REGISTRY & OBSERVABILITY ENGINE
 * High-Throughput In-Memory Quantile Aggregator & Production Telemetry Registry
 */

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface ProviderMetricSummary {
  requestCount: number;
  successCount: number;
  error4xxCount: number;
  error5xxCount: number;
  rateLimit429Count: number;
  successRatePercent: number;
  latencyStats: LatencyStats;
}

export class MetricsRegistry {
  // API Metrics
  private static apiRequests: Map<string, number> = new Map();
  private static apiErrors: Map<string, number> = new Map();
  private static apiLatencies: number[] = [];

  // Webhook Metrics
  private static webhookIngestions: number = 0;
  private static webhookAckLatencies: number[] = [];
  private static webhookProcessingLatencies: number[] = [];
  private static webhookBacklog: number = 0;
  private static webhookRetries: number = 0;
  private static webhookDlqCount: number = 0;

  // Worker Metrics
  private static workerExecutions: Map<string, number> = new Map();
  private static workerDurations: Map<string, number[]> = new Map();
  private static workerFailures: Map<string, number> = new Map();
  private static workerLockSkips: Map<string, number> = new Map();
  private static workerLeaseRecoveries: number = 0;

  // Provider Metrics
  private static providerRequests: Map<string, {
    success: number;
    error4xx: number;
    error5xx: number;
    rateLimit429: number;
    latencies: number[];
  }> = new Map();

  // Financial Metrics
  private static ledgerImbalanceEvents: number = 0;
  private static duplicateTransactionAttempts: number = 0;
  private static refundAnomalies: number = 0;
  private static paymentAnomalies: number = 0;

  // Reconciliation Metrics
  private static driftDetectedCount: number = 0;
  private static driftRepairedCount: number = 0;
  private static unresolvedConflictCount: number = 0;

  private static maxHistogramSamples = 1000;

  /**
   * Records an API HTTP request outcome & latency
   */
  public static recordApiRequest(method: string, route: string, statusCode: number, durationMs: number) {
    const key = `${method} ${route} ${statusCode}`;
    this.apiRequests.set(key, (this.apiRequests.get(key) || 0) + 1);

    if (statusCode >= 400) {
      this.apiErrors.set(key, (this.apiErrors.get(key) || 0) + 1);
    }

    this.apiLatencies.push(durationMs);
    if (this.apiLatencies.length > this.maxHistogramSamples) {
      this.apiLatencies.shift();
    }
  }

  /**
   * Records Webhook Ingestion & Ack SLA
   */
  public static recordWebhookIngest(provider: string, ackDurationMs: number) {
    this.webhookIngestions++;
    this.webhookAckLatencies.push(ackDurationMs);
    if (this.webhookAckLatencies.length > this.maxHistogramSamples) {
      this.webhookAckLatencies.shift();
    }
  }

  public static setWebhookBacklog(count: number) {
    this.webhookBacklog = Math.max(0, count);
  }

  public static recordWebhookRetry() {
    this.webhookRetries++;
  }

  public static recordWebhookDlq() {
    this.webhookDlqCount++;
  }

  /**
   * Records Background Worker Executions
   */
  public static recordWorkerExecution(workerName: string, durationMs: number, success: boolean) {
    this.workerExecutions.set(workerName, (this.workerExecutions.get(workerName) || 0) + 1);

    if (!success) {
      this.workerFailures.set(workerName, (this.workerFailures.get(workerName) || 0) + 1);
    }

    const durations = this.workerDurations.get(workerName) || [];
    durations.push(durationMs);
    if (durations.length > this.maxHistogramSamples) durations.shift();
    this.workerDurations.set(workerName, durations);
  }

  public static recordWorkerLockSkip(workerName: string) {
    this.workerLockSkips.set(workerName, (this.workerLockSkips.get(workerName) || 0) + 1);
  }

  public static recordWorkerLeaseRecovery() {
    this.workerLeaseRecoveries++;
  }

  /**
   * Records Outbound Provider Mutations (Meta, Google, Stripe, Razorpay)
   */
  public static recordProviderCall(provider: string, endpoint: string, statusCode: number, durationMs: number) {
    const providerKey = provider.toUpperCase();
    const stats = this.providerRequests.get(providerKey) || {
      success: 0,
      error4xx: 0,
      error5xx: 0,
      rateLimit429: 0,
      latencies: []
    };

    if (statusCode === 429) {
      stats.rateLimit429++;
    } else if (statusCode >= 500) {
      stats.error5xx++;
    } else if (statusCode >= 400) {
      stats.error4xx++;
    } else {
      stats.success++;
    }

    stats.latencies.push(durationMs);
    if (stats.latencies.length > this.maxHistogramSamples) stats.latencies.shift();

    this.providerRequests.set(providerKey, stats);
  }

  /**
   * Records Financial Invariants
   */
  public static recordLedgerImbalance() {
    this.ledgerImbalanceEvents++;
  }

  public static recordDuplicateTransactionAttempt() {
    this.duplicateTransactionAttempts++;
  }

  public static recordRefundAnomaly() {
    this.refundAnomalies++;
  }

  public static recordPaymentAnomaly() {
    this.paymentAnomalies++;
  }

  /**
   * Records Reconciliation Outcomes
   */
  public static recordReconciliation(driftDetected: boolean, repaired: boolean) {
    if (driftDetected) {
      this.driftDetectedCount++;
      if (repaired) {
        this.driftRepairedCount++;
      } else {
        this.unresolvedConflictCount++;
      }
    }
  }

  /**
   * Calculates percentile latency metrics
   */
  private static calculateStats(samples: number[]): LatencyStats {
    if (samples.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    const getPercentile = (p: number) => {
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return sorted[idx];
    };

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: Math.round((sum / count) * 100) / 100,
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99)
    };
  }

  /**
   * Exports full production snapshot for API endpoints & Prometheus
   */
  public static getSnapshot() {
    const providerSummaries: Record<string, ProviderMetricSummary> = {};

    for (const [provider, stats] of this.providerRequests.entries()) {
      const total = stats.success + stats.error4xx + stats.error5xx + stats.rateLimit429;
      providerSummaries[provider] = {
        requestCount: total,
        successCount: stats.success,
        error4xxCount: stats.error4xx,
        error5xxCount: stats.error5xx,
        rateLimit429Count: stats.rateLimit429,
        successRatePercent: total > 0 ? Math.round((stats.success / total) * 10000) / 100 : 100,
        latencyStats: this.calculateStats(stats.latencies)
      };
    }

    return {
      timestamp: new Date().toISOString(),
      api: {
        totalRequests: Array.from(this.apiRequests.values()).reduce((a, b) => a + b, 0),
        totalErrors: Array.from(this.apiErrors.values()).reduce((a, b) => a + b, 0),
        latencyStats: this.calculateStats(this.apiLatencies)
      },
      webhooks: {
        totalIngested: this.webhookIngestions,
        currentBacklog: this.webhookBacklog,
        retries: this.webhookRetries,
        dlqCount: this.webhookDlqCount,
        ackLatencyStats: this.calculateStats(this.webhookAckLatencies)
      },
      workers: {
        executions: Object.fromEntries(this.workerExecutions),
        failures: Object.fromEntries(this.workerFailures),
        lockSkips: Object.fromEntries(this.workerLockSkips),
        leaseRecoveries: this.workerLeaseRecoveries
      },
      providers: providerSummaries,
      financial: {
        ledgerImbalanceEvents: this.ledgerImbalanceEvents,
        duplicateTransactionAttempts: this.duplicateTransactionAttempts,
        refundAnomalies: this.refundAnomalies,
        paymentAnomalies: this.paymentAnomalies
      },
      reconciliation: {
        driftDetected: this.driftDetectedCount,
        driftRepaired: this.driftRepairedCount,
        unresolvedConflicts: this.unresolvedConflictCount
      }
    };
  }

  /**
   * Resets all in-memory metrics (useful for testing)
   */
  public static reset() {
    this.apiRequests.clear();
    this.apiErrors.clear();
    this.apiLatencies = [];
    this.webhookIngestions = 0;
    this.webhookAckLatencies = [];
    this.webhookProcessingLatencies = [];
    this.webhookBacklog = 0;
    this.webhookRetries = 0;
    this.webhookDlqCount = 0;
    this.workerExecutions.clear();
    this.workerDurations.clear();
    this.workerFailures.clear();
    this.workerLockSkips.clear();
    this.workerLeaseRecoveries = 0;
    this.providerRequests.clear();
    this.ledgerImbalanceEvents = 0;
    this.duplicateTransactionAttempts = 0;
    this.refundAnomalies = 0;
    this.paymentAnomalies = 0;
    this.driftDetectedCount = 0;
    this.driftRepairedCount = 0;
    this.unresolvedConflictCount = 0;
  }
}
