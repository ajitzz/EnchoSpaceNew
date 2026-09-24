import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluatePilotBudgetCap,
  validatePilotPropertyBoundary,
  processPilotTopUpIdempotent,
  handlePilotTelemetrySpendEvent,
  executePilotDbTransactionWithFallback,
  generatePilotReceipt,
  PILOT_CONSTRAINTS,
} from '../../../scripts/deployment/pilot-tranche-monitor.mjs';

describe('CR1 Phase P8.4 & Track 4: Bounded Commercial Pilot Tranche & Stop-Loss Harness', () => {
  const receiptPath = resolve(
    process.cwd(),
    'docs/harvo/receipts/CR1_PILOT_GO_NOGO_RECEIPT.json'
  );

  afterAll(() => {
    // Preserve disk hygiene in test environment
    if (existsSync(receiptPath)) {
      try {
        unlinkSync(receiptPath);
      } catch {
        // Ignored
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Adversarial Failure Mode — Database Connection Drops Halfway
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through', () => {
    it('executes atomic rollback, creates 0 zombie records, and rejects the operation', async () => {
      let rollbacksCount = 0;
      let commitsCount = 0;
      const recordsInserted: string[] = [];

      const mockDbClient = {
        query: vi.fn(async (sql: string) => {
          if (sql === 'BEGIN') return {};
          if (sql === 'ROLLBACK') {
            rollbacksCount++;
            recordsInserted.length = 0;
            return {};
          }
          if (sql === 'COMMIT') {
            commitsCount++;
            return {};
          }
          if (sql.includes('INSERT INTO host_marketing_campaigns')) {
            recordsInserted.push('campaign_record');
            // Simulate sudden network termination halfway through
            throw new Error('ECONNRESET: Connection dropped by peer at step 2 of transaction');
          }
          return {};
        }),
      };

      await expect(
        executePilotDbTransactionWithFallback(mockDbClient as any, {
          hostId: 'pilot_host_wayanad',
          listingId: 'listing_1',
          budgetPaise: 200000,
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbacksCount).toBe(1);
      expect(commitsCount).toBe(0);
      expect(recordsInserted.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: Adversarial Failure Mode — Host Clicks Submit 5 Times in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host Clicks Submit 5 Times in 200 Milliseconds', () => {
    it('deduplicates rapid burst submissions via idempotency key, allowing exactly 1 execution', async () => {
      const idempotencyKey = 'idemp_burst_test_' + Date.now();
      const sharedStore = new Map<string, any>();

      let executions = 0;
      const executeTopUp = async () => {
        return processPilotTopUpIdempotent({
          store: sharedStore,
          idempotencyKey,
          hostId: 'pilot_host_wayanad',
          listingId: 'listing_1',
          amountPaise: 200000, // ₹2,000 INR
          handler: async () => {
            executions++;
            return {
              status: 'SUCCESS',
              transactionId: 'txn_' + executions,
              creditedPaise: 200000,
            };
          },
        });
      };

      // Fire 5 identical requests concurrently within 200ms
      const results = await Promise.all([
        executeTopUp(),
        executeTopUp(),
        executeTopUp(),
        executeTopUp(),
        executeTopUp(),
      ]);

      // Exactly ONE actual execution must have happened
      expect(executions).toBe(1);

      // All 5 responses must return identical successful output with deduplicated replay flag
      for (const res of results) {
        expect(res.status).toBe('SUCCESS');
        expect(res.creditedPaise).toBe(200000);
      }
      const replays = results.filter((r) => r.isReplay === true);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: Adversarial Failure Mode — Out-Of-Order Telemetry Webhook
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Telemetry Spend Webhook Arrives Out of Order', () => {
    it('maintains monotonic cumulative spend and trips circuit breaker correctly', () => {
      let state = {
        cumulativeSpendPaise: 0,
        status: 'ACTIVE',
        lastTelemetryTimestamp: 1000,
      };

      // Event 1: Correct arrival (Day 1 spend = ₹1,000 = 100,000 paise at t=1000)
      state = handlePilotTelemetrySpendEvent(state, {
        timestamp: 1000,
        reportedCumulativeSpendPaise: 100000,
      });
      expect(state.cumulativeSpendPaise).toBe(100000);
      expect(state.status).toBe('ACTIVE');

      // Event 3 arrives before Event 2: (Day 3 spend = ₹48,000 = 4,800,000 paise at t=3000)
      // Note: 4,800,000 paise is > 95% of 5,000,000 paise (₹47,500 = 4,750,000 paise)
      state = handlePilotTelemetrySpendEvent(state, {
        timestamp: 3000,
        reportedCumulativeSpendPaise: 4800000,
      });
      expect(state.cumulativeSpendPaise).toBe(4800000);
      expect(state.status).toBe('CIRCUIT_BREAKER_PAUSED'); // Must auto-trip 95% threshold!

      // Event 2 arrives late: (Day 2 spend = ₹20,000 = 2,000,000 paise at t=2000)
      state = handlePilotTelemetrySpendEvent(state, {
        timestamp: 2000,
        reportedCumulativeSpendPaise: 2000000,
      });

      // Monotonic guard: Cumulative spend must NOT regress to 2,000,000 paise!
      expect(state.cumulativeSpendPaise).toBe(4800000);
      // Status must remain CIRCUIT_BREAKER_PAUSED
      expect(state.status).toBe('CIRCUIT_BREAKER_PAUSED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: Hard Budget Stop-Loss Cap & Daily Spend Constraints
  // ──────────────────────────────────────────────────────────────────────────
  describe('Budget Stop-Loss & Financial Guardrails', () => {
    it('enforces hard ₹50,000 INR aggregate cap and ₹2,000 INR daily cap', () => {
      expect(PILOT_CONSTRAINTS.MAX_AGGREGATE_BUDGET_PAISE).toBe(5000000); // ₹50,000 INR
      expect(PILOT_CONSTRAINTS.MAX_DAILY_BUDGET_PAISE).toBe(200000); // ₹2,000 INR
      expect(PILOT_CONSTRAINTS.CIRCUIT_BREAKER_THRESHOLD_PERCENT).toBe(95);

      // Rejects aggregate budget exceeding ₹50,000 INR
      const excessiveAggregate = evaluatePilotBudgetCap({
        existingCommittedPaise: 4900000,
        requestedNewPaise: 200000, // Total would be 5,100,000 > 5,000,000
        dailyRequestedPaise: 100000,
      });
      expect(excessiveAggregate.allowed).toBe(false);
      expect(excessiveAggregate.reason).toContain('EXCEEDS_PILOT_AGGREGATE_CAP');

      // Rejects daily budget exceeding ₹2,000 INR
      const excessiveDaily = evaluatePilotBudgetCap({
        existingCommittedPaise: 1000000,
        requestedNewPaise: 100000,
        dailyRequestedPaise: 250000, // ₹2,500 > ₹2,000
      });
      expect(excessiveDaily.allowed).toBe(false);
      expect(excessiveDaily.reason).toContain('EXCEEDS_PILOT_DAILY_CAP');

      // Valid allocation within both caps passes cleanly
      const validAllocation = evaluatePilotBudgetCap({
        existingCommittedPaise: 1000000,
        requestedNewPaise: 100000,
        dailyRequestedPaise: 150000,
      });
      expect(validAllocation.allowed).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 5: Single Property Scope Boundary
  // ──────────────────────────────────────────────────────────────────────────
  describe('Pilot Scope & Property Exclusivity Boundary', () => {
    it('strictly restricts pilot to Listing 1 (Wayanad Sanctuary)', () => {
      expect(PILOT_CONSTRAINTS.AUTHORIZED_LISTING_ID).toBe('listing_1');

      const validProperty = validatePilotPropertyBoundary('listing_1');
      expect(validProperty.valid).toBe(true);

      const invalidProperty = validatePilotPropertyBoundary('listing_99_unauthorized');
      expect(invalidProperty.valid).toBe(false);
      expect(invalidProperty.error).toBe('UNAUTHORIZED_PILOT_PROPERTY');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 6: Receipt Artifact Generation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Pilot Receipt Artifact Generation', () => {
    it('generates immutable CR1_PILOT_GO_NOGO_RECEIPT.json on disk', () => {
      const receipt = generatePilotReceipt({
        auditTimestamp: '2026-09-24T20:00:00.000Z',
        gitCommit: 'a2d31c6',
        listingId: 'listing_1',
        propertyName: 'Wayanad Sanctuary',
        aggregateSpendPaise: 4200000, // ₹42,000
        aggregateSpendInr: 42000,
        maxCapInr: 50000,
        stopLossTriggered: false,
        roasAchieved: 3.4,
        inquiriesGenerated: 18,
        bookingsCaptured: 4,
        grossBookingValueInr: 142800,
        taxRemittedGstr8: true,
        zeroDataLeakageVerified: true,
        boardVerdict: 'GO_FOR_EXPANDED_STAGE',
      });

      expect(receipt.status).toBe('CERTIFIED');
      expect(receipt.constraints.maxAggregateCapInr).toBe(50000);
      expect(existsSync(receiptPath)).toBe(true);
    });
  });
});
