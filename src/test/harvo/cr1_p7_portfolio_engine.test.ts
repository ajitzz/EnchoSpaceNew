import { describe, expect, it, vi } from 'vitest';
import {
  PortfolioCampaignEngine,
  type CampaignFlightPayload,
  type FlightTelemetryPayload,
  type PortfolioFlightState,
  type DbClientPort,
} from '../../lib/marketing/portfolioEngine.js';

describe('CR1 Phase P7: Host Campaign Portfolio & Source-Aware Outcomes Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Database Connection Drops Halfway Through
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through Flight Allocation', () => {
    it('executes atomic rollback, creates 0 zombie flight records, and leaves portfolio budget uncommitted', async () => {
      let rollbacksCount = 0;
      let commitsCount = 0;
      const flightsInserted: string[] = [];

      const mockDbClient: DbClientPort = {
        query: vi.fn(async (sql: string) => {
          if (sql === 'BEGIN') return {};
          if (sql === 'ROLLBACK') {
            rollbacksCount++;
            flightsInserted.length = 0;
            return {};
          }
          if (sql === 'COMMIT') {
            commitsCount++;
            return {};
          }
          if (sql.includes('INSERT INTO marketing_portfolio_flights')) {
            flightsInserted.push('flight_row_1');
            // Simulate abrupt network socket termination midway through multi-table transaction
            throw new Error('ECONNRESET: Database connection abruptly closed during portfolio flight write');
          }
          return {};
        }),
      };

      const engine = new PortfolioCampaignEngine();

      await expect(
        engine.executeFlightAllocationTransaction(mockDbClient, {
          portfolioId: 'port_wayanad_01',
          listingId: 20,
          flightName: 'Monsoon Escape Flight',
          allocatedBudgetPaise: 1500000, // ₹15,000 INR
          intent: 'ROOM_RESERVATIONS',
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbacksCount).toBe(1);
      expect(commitsCount).toBe(0);
      expect(flightsInserted.length).toBe(0); // Zero orphaned/zombie flight records
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: Host Clicks Submit 5 Times in 200 Milliseconds
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host Clicks Submit 5 Times in 200 Milliseconds', () => {
    it('deduplicates rapid burst submissions via idempotency key, executing exactly 1 flight allocation', async () => {
      const engine = new PortfolioCampaignEngine();
      const idempotencyKey = 'idemp_flight_launch_' + Date.now();

      let allocationHandlerInvocations = 0;
      const triggerFlightLaunch = async () => {
        return engine.processFlightAllocationIdempotent({
          idempotencyKey,
          portfolioId: 'port_wayanad_01',
          flightName: 'Spring Awakening',
          handler: async () => {
            allocationHandlerInvocations++;
            await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms processing latency
            return {
              flightId: 'flight_p7_202',
              status: 'SCHEDULED' as const,
              allocatedBudgetPaise: 2500000,
            };
          },
        });
      };

      // Fire 5 identical requests within a 200ms burst window
      const burstResults = await Promise.all([
        triggerFlightLaunch(),
        triggerFlightLaunch(),
        triggerFlightLaunch(),
        triggerFlightLaunch(),
        triggerFlightLaunch(),
      ]);

      // Exactly 1 underlying handler execution must have occurred
      expect(allocationHandlerInvocations).toBe(1);

      // All 5 responses must return the same primary flight ID
      burstResults.forEach((res) => {
        expect(res.flightId).toBe('flight_p7_202');
        expect(res.status).toBe('SCHEDULED');
        expect(res.allocatedBudgetPaise).toBe(2500000);
      });

      // The 4 deduplicated replays must be flagged as isReplay: true
      const replays = burstResults.filter((r) => r.isReplay === true);
      const original = burstResults.filter((r) => r.isReplay === false);
      expect(original.length).toBe(1);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Telemetry / Spend Webhook Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Telemetry / Spend Webhook Arrives Out of Order', () => {
    it('maintains monotonic cumulative metrics and ignores delayed stale telemetry payloads', () => {
      const engine = new PortfolioCampaignEngine();

      const initialState: PortfolioFlightState = {
        flightId: 'flight_p7_202',
        cumulativeImpressions: 10000,
        cumulativeClicks: 320,
        cumulativeSpendPaise: 350000, // ₹3,500
        lastReportedSequence: 5,
        status: 'ACTIVE',
      };

      // Sequence 6 arrives with higher numbers
      const eventSeq6: FlightTelemetryPayload = {
        sequence: 6,
        cumulativeImpressions: 14500,
        cumulativeClicks: 460,
        cumulativeSpendPaise: 500000, // ₹5,000
        reportedStatus: 'ACTIVE',
      };

      const resultSeq6 = engine.handleTelemetryWebhook(initialState, eventSeq6);
      expect(resultSeq6.isStale).toBe(false);
      expect(resultSeq6.updatedState.cumulativeImpressions).toBe(14500);
      expect(resultSeq6.updatedState.cumulativeClicks).toBe(460);
      expect(resultSeq6.updatedState.cumulativeSpendPaise).toBe(500000);
      expect(resultSeq6.updatedState.lastReportedSequence).toBe(6);

      // Delayed Sequence 4 arrives AFTER Sequence 6 has been processed
      const eventSeq4: FlightTelemetryPayload = {
        sequence: 4,
        cumulativeImpressions: 8000,
        cumulativeClicks: 250,
        cumulativeSpendPaise: 280000,
        reportedStatus: 'ACTIVE',
      };

      const resultSeq4 = engine.handleTelemetryWebhook(resultSeq6.updatedState, eventSeq4);
      expect(resultSeq4.isStale).toBe(true);

      // Metrics must not regress to stale values
      expect(resultSeq4.updatedState.cumulativeImpressions).toBe(14500);
      expect(resultSeq4.updatedState.cumulativeClicks).toBe(460);
      expect(resultSeq4.updatedState.cumulativeSpendPaise).toBe(500000);
      expect(resultSeq4.updatedState.lastReportedSequence).toBe(6);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Four-Flight Portfolio Boundary & Bounded Control Invariants
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Four-Flight Portfolio Boundary & Bounded Control Invariants', () => {
    it('strictly enforces the 4-flight portfolio limit per listing', () => {
      const engine = new PortfolioCampaignEngine();

      const existingActiveFlights: PortfolioFlightState[] = [
        { flightId: 'f1', cumulativeImpressions: 1000, cumulativeClicks: 30, cumulativeSpendPaise: 50000, lastReportedSequence: 1, status: 'ACTIVE' },
        { flightId: 'f2', cumulativeImpressions: 2000, cumulativeClicks: 60, cumulativeSpendPaise: 100000, lastReportedSequence: 1, status: 'ACTIVE' },
        { flightId: 'f3', cumulativeImpressions: 1500, cumulativeClicks: 45, cumulativeSpendPaise: 75000, lastReportedSequence: 1, status: 'SCHEDULED' },
        { flightId: 'f4', cumulativeImpressions: 800, cumulativeClicks: 25, cumulativeSpendPaise: 40000, lastReportedSequence: 1, status: 'ACTIVE' },
      ];

      const validation = engine.validateFlightCreation(existingActiveFlights, {
        listingId: 20,
        flightName: '5th Flight Attempt',
        intent: 'ROOM_RESERVATIONS',
        targetRadiusKm: 50,
        budgetPaise: 100000,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('PORTFOLIO_CAPACITY_EXCEEDED: Maximum 4 concurrent active/scheduled flights allowed');
    });

    it('rejects out-of-bounds targeting radius (>500km)', () => {
      const engine = new PortfolioCampaignEngine();

      const existingActiveFlights: PortfolioFlightState[] = [];

      const validation = engine.validateFlightCreation(existingActiveFlights, {
        listingId: 20,
        flightName: 'Excessive Radius Flight',
        intent: 'BRAND_AWARENESS',
        targetRadiusKm: 850, // Exceeds 500km limit
        budgetPaise: 200000,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('TARGETING_RADIUS_EXCEEDED: Bounded targeting radius cannot exceed 500km');
    });

    it('isolates first-party consented outcomes from provider estimates', () => {
      const engine = new PortfolioCampaignEngine();

      const decorated = engine.decorateSourceAwareOutcomes({
        flightId: 'flight_p7_202',
        providerMetrics: {
          impressions: 14500,
          clicks: 460,
          estimatedReach: 12000,
        },
        firstPartyData: {
          consentedVisits: 380,
          inquiries: 14,
          unreadMessages: 2,
          confirmedBookings: 3,
        },
      });

      // Provider estimates and first-party conversions are separated by strict source contracts
      expect(decorated.providerTelemetry.source).toBe('EXTERNAL_PROVIDER_ESTIMATE');
      expect(decorated.firstPartyOutcomes.source).toBe('ENCHO_CONSENTED_EVENTS');
      expect(decorated.firstPartyOutcomes.confirmedBookings).toBe(3);
      expect(decorated.firstPartyOutcomes.inquiries).toBe(14);
      expect(decorated.firstPartyOutcomes.unreadMessages).toBe(2);
    });
  });
});
