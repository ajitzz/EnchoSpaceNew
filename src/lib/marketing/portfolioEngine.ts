/**
 * CR1 Phase P7: Host Campaign Portfolio & Source-Aware Outcomes Engine
 *
 * Implements bounded one-click flight creation, four-flight portfolio limit,
 * source-aware outcome aggregation (first-party consented vs third-party provider estimates),
 * and adversarial protections (idempotent burst deduplication, monotonic telemetry fence,
 * and fail-closed transactional rollbacks).
 */

export type CampaignIntent = 'ROOM_RESERVATIONS' | 'BRAND_AWARENESS' | 'SEASONAL_PROMO';

export interface CampaignFlightPayload {
  listingId: number;
  flightName: string;
  intent: CampaignIntent;
  targetRadiusKm: number;
  budgetPaise: number;
}

export interface PortfolioFlightState {
  flightId: string;
  cumulativeImpressions: number;
  cumulativeClicks: number;
  cumulativeSpendPaise: number;
  lastReportedSequence: number;
  status: 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface FlightTelemetryPayload {
  sequence: number;
  cumulativeImpressions: number;
  cumulativeClicks: number;
  cumulativeSpendPaise: number;
  reportedStatus: 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface FlightAllocationResult {
  flightId: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  allocatedBudgetPaise: number;
  isReplay?: boolean;
}

export interface ProviderMetricsInput {
  impressions: number;
  clicks: number;
  estimatedReach: number;
}

export interface FirstPartyDataInput {
  consentedVisits: number;
  inquiries: number;
  unreadMessages: number;
  confirmedBookings: number;
}

export interface SourceAwareOutcomesResult {
  flightId: string;
  providerTelemetry: {
    source: 'EXTERNAL_PROVIDER_ESTIMATE';
    impressions: number;
    clicks: number;
    estimatedReach: number;
  };
  firstPartyOutcomes: {
    source: 'ENCHO_CONSENTED_EVENTS';
    consentedVisits: number;
    inquiries: number;
    unreadMessages: number;
    confirmedBookings: number;
    observedAt: string;
  };
}

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export class PortfolioCampaignEngine {
  private inFlightOperations = new Map<string, Promise<FlightAllocationResult>>();
  private completedStore = new Map<string, FlightAllocationResult>();
  private readonly MAX_ACTIVE_FLIGHTS_PER_PORTFOLIO = 4;
  private readonly MAX_TARGET_RADIUS_KM = 500;

  /**
   * Executes portfolio flight allocation inside an explicit database transaction with atomic rollback.
   */
  async executeFlightAllocationTransaction(
    dbClient: DbClientPort,
    payload: {
      portfolioId: string;
      listingId: number;
      flightName: string;
      allocatedBudgetPaise: number;
      intent: CampaignIntent;
    }
  ): Promise<unknown> {
    await dbClient.query('BEGIN');
    try {
      const result = await dbClient.query(
        `INSERT INTO marketing_portfolio_flights (portfolio_id, listing_id, flight_name, allocated_budget_paise, intent)
         VALUES ('${payload.portfolioId}', ${payload.listingId}, '${payload.flightName}', ${payload.allocatedBudgetPaise}, '${payload.intent}')`
      );
      await dbClient.query('COMMIT');
      return result;
    } catch (err: unknown) {
      await dbClient.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Processes a flight allocation with strict idempotency and 200ms burst deduplication.
   */
  async processFlightAllocationIdempotent(params: {
    idempotencyKey: string;
    portfolioId: string;
    flightName: string;
    handler: () => Promise<Omit<FlightAllocationResult, 'isReplay'>>;
  }): Promise<FlightAllocationResult> {
    const { idempotencyKey, handler } = params;

    if (!idempotencyKey) {
      throw new Error('MISSING_IDEMPOTENCY_KEY: Flight operation requires a valid idempotency key');
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
    const executionPromise = (async (): Promise<FlightAllocationResult> => {
      try {
        const outcome = await handler();
        const finalResult: FlightAllocationResult = { ...outcome, isReplay: false };
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
   * Ingests provider flight telemetry and enforces monotonic cumulative metrics.
   */
  handleTelemetryWebhook(
    currentState: PortfolioFlightState,
    event: FlightTelemetryPayload
  ): {
    updatedState: PortfolioFlightState;
    isStale: boolean;
  } {
    const isStale = event.sequence < currentState.lastReportedSequence;

    const monotonicImpressions = Math.max(
      currentState.cumulativeImpressions,
      event.cumulativeImpressions
    );
    const monotonicClicks = Math.max(
      currentState.cumulativeClicks,
      event.cumulativeClicks
    );
    const monotonicSpend = Math.max(
      currentState.cumulativeSpendPaise,
      event.cumulativeSpendPaise
    );

    const newStatus = isStale ? currentState.status : event.reportedStatus;

    const updatedState: PortfolioFlightState = {
      flightId: currentState.flightId,
      cumulativeImpressions: monotonicImpressions,
      cumulativeClicks: monotonicClicks,
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
   * Validates flight creation payload against 4-flight portfolio boundary and bounded targeting controls.
   */
  validateFlightCreation(
    existingActiveFlights: PortfolioFlightState[],
    payload: CampaignFlightPayload
  ): {
    valid: boolean;
    error?: string;
  } {
    // Invariant 1: Four-flight portfolio constraint
    const activeOrScheduled = existingActiveFlights.filter(
      (f) => f.status === 'ACTIVE' || f.status === 'SCHEDULED'
    );
    if (activeOrScheduled.length >= this.MAX_ACTIVE_FLIGHTS_PER_PORTFOLIO) {
      return {
        valid: false,
        error: `PORTFOLIO_CAPACITY_EXCEEDED: Maximum ${this.MAX_ACTIVE_FLIGHTS_PER_PORTFOLIO} concurrent active/scheduled flights allowed per portfolio`,
      };
    }

    // Invariant 2: Bounded targeting radius control
    if (payload.targetRadiusKm > this.MAX_TARGET_RADIUS_KM) {
      return {
        valid: false,
        error: `TARGETING_RADIUS_EXCEEDED: Bounded targeting radius cannot exceed ${this.MAX_TARGET_RADIUS_KM}km (requested ${payload.targetRadiusKm}km)`,
      };
    }

    return { valid: true };
  }

  /**
   * Decorates flight details with strictly separated third-party provider metrics and first-party consented outcomes.
   */
  decorateSourceAwareOutcomes(params: {
    flightId: string;
    providerMetrics: ProviderMetricsInput;
    firstPartyData: FirstPartyDataInput;
  }): SourceAwareOutcomesResult {
    const { flightId, providerMetrics, firstPartyData } = params;

    return {
      flightId,
      providerTelemetry: {
        source: 'EXTERNAL_PROVIDER_ESTIMATE',
        impressions: providerMetrics.impressions,
        clicks: providerMetrics.clicks,
        estimatedReach: providerMetrics.estimatedReach,
      },
      firstPartyOutcomes: {
        source: 'ENCHO_CONSENTED_EVENTS',
        consentedVisits: firstPartyData.consentedVisits,
        inquiries: firstPartyData.inquiries,
        unreadMessages: firstPartyData.unreadMessages,
        confirmedBookings: firstPartyData.confirmedBookings,
        observedAt: new Date().toISOString(),
      },
    };
  }
}
