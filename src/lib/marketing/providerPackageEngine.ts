/**
 * CR1 Phase P6: Provider Programs, Expert Studios & Finance Control Engine
 *
 * Implements master-account provider dispatch, zero-spend paused campaign creation,
 * Housing special ad category enforcement, and adversarial protections
 * (idempotent burst deduplication, monotonic telemetry spend guard, and transactional rollbacks).
 */

export interface ProviderPublishingPayload {
  campaignName: string;
  dailyBudgetPaise: number;
  status: 'PAUSED' | 'ACTIVE';
  specialAdCategory?: 'HOUSING' | 'NONE';
}

export interface ProviderCampaignState {
  campaignId: string;
  cumulativeSpendPaise: number;
  status: 'PAUSED' | 'ACTIVE' | 'CIRCUIT_BREAKER_PAUSED';
  lastReportedSequence: number;
}

export interface ProviderWebhookSpendPayload {
  sequence: number;
  cumulativeSpendPaise: number;
  reportedStatus: 'PAUSED' | 'ACTIVE';
}

export interface ProviderPublishResult {
  providerCampaignId: string;
  status: string;
  remoteSpendPaise: number;
  isReplay?: boolean;
}

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export class ProviderPackageEngine {
  private inFlightOperations = new Map<string, Promise<ProviderPublishResult>>();
  private completedStore = new Map<string, ProviderPublishResult>();
  private readonly STOP_LOSS_THRESHOLD_PAISE = 4750000; // ₹47,500 INR (95% of ₹50,000 cap)

  /**
   * Executes provider transaction insertion inside an explicit transaction with fail-closed rollback.
   */
  async executeProviderPublishTransaction(
    dbClient: DbClientPort,
    payload: {
      campaignId: string;
      hostId: string;
      provider: 'META' | 'GOOGLE';
      allocatedSpendPaise: number;
    }
  ): Promise<unknown> {
    await dbClient.query('BEGIN');
    try {
      const result = await dbClient.query(
        `INSERT INTO provider_publishing_transactions (campaign_id, host_id, provider, allocated_spend_paise)
         VALUES ('${payload.campaignId}', '${payload.hostId}', '${payload.provider}', ${payload.allocatedSpendPaise})`
      );
      await dbClient.query('COMMIT');
      return result;
    } catch (err: unknown) {
      await dbClient.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Processes a provider publishing request with strict idempotency and burst deduplication.
   */
  async processProviderPublishIdempotent(params: {
    idempotencyKey: string;
    campaignId: string;
    provider: 'META' | 'GOOGLE';
    payload: {
      campaignName: string;
      dailyBudgetPaise: number;
    };
    handler: () => Promise<Omit<ProviderPublishResult, 'isReplay'>>;
  }): Promise<ProviderPublishResult> {
    const { idempotencyKey, handler } = params;

    if (!idempotencyKey) {
      throw new Error('MISSING_IDEMPOTENCY_KEY: Provider operation requires a valid idempotency key');
    }

    // 1. Check if completed result exists
    if (this.completedStore.has(idempotencyKey)) {
      const cached = this.completedStore.get(idempotencyKey)!;
      return { ...cached, isReplay: true };
    }

    // 2. Check if identical request is currently in-flight (5-click burst within 200ms)
    if (this.inFlightOperations.has(idempotencyKey)) {
      const activePromise = this.inFlightOperations.get(idempotencyKey)!;
      const result = await activePromise;
      return { ...result, isReplay: true };
    }

    // 3. Execute handler under promise guard
    const executionPromise = (async (): Promise<ProviderPublishResult> => {
      try {
        const outcome = await handler();
        const finalResult: ProviderPublishResult = { ...outcome, isReplay: false };
        this.completedStore.set(idempotencyKey, finalResult);
        return finalResult;
      } finally {
        this.inFlightOperations.delete(idempotencyKey);
      }
    })();

    this.inFlightOperations.set(idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Ingests provider spend telemetry and enforces monotonic cumulative spend + circuit breaker.
   */
  handleProviderSpendWebhook(
    currentState: ProviderCampaignState,
    event: ProviderWebhookSpendPayload
  ): {
    updatedState: ProviderCampaignState;
    isStale: boolean;
  } {
    const isStale = event.sequence < currentState.lastReportedSequence;
    const monotonicSpend = Math.max(
      currentState.cumulativeSpendPaise,
      event.cumulativeSpendPaise
    );

    let newStatus = currentState.status;

    // Terminal stop-loss lock: Once tripped, remains paused
    if (currentState.status === 'CIRCUIT_BREAKER_PAUSED') {
      newStatus = 'CIRCUIT_BREAKER_PAUSED';
    } else if (monotonicSpend >= this.STOP_LOSS_THRESHOLD_PAISE) {
      newStatus = 'CIRCUIT_BREAKER_PAUSED';
    } else if (!isStale) {
      newStatus = event.reportedStatus;
    }

    const updatedState: ProviderCampaignState = {
      campaignId: currentState.campaignId,
      cumulativeSpendPaise: monotonicSpend,
      status: newStatus,
      lastReportedSequence: Math.max(currentState.lastReportedSequence, event.sequence),
    };

    return {
      updatedState,
      isStale,
    };
  }

  /**
   * Validates provider campaign creation payload against Zero-Spend & Housing Category rules.
   */
  validateProviderPayload(
    provider: 'META' | 'GOOGLE',
    payload: ProviderPublishingPayload
  ): {
    valid: boolean;
    error?: string;
  } {
    // Invariant 1: Canary & initial creation must strictly be in PAUSED state
    if (payload.status !== 'PAUSED') {
      return {
        valid: false,
        error: 'ACTIVE_CREATION_FORBIDDEN: Campaigns must be initially created in PAUSED status',
      };
    }

    // Invariant 2: Meta hospitality campaigns mandate HOUSING special ad category
    if (provider === 'META' && payload.specialAdCategory !== 'HOUSING') {
      return {
        valid: false,
        error: 'HOUSING_CATEGORY_REQUIRED: Meta hospitality campaigns must declare special_ad_categories: [HOUSING]',
      };
    }

    return { valid: true };
  }
}
