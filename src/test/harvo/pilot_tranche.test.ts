import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Adversarial Failure Mode — Database Connection Drops Halfway
  // ──────────────────────────────────────────────────────────────────────────
  it('retires raw SQL mutation and memory-only top-ups without invoking either side effect', async () => {
    const query = vi.fn(); const handler = vi.fn();
    await expect(executePilotDbTransactionWithFallback({ query }, { hostId: 'host', listingId: 'listing', budgetPaise: 1 })).rejects.toThrow('PILOT_MUTATION_UNAVAILABLE');
    await expect(processPilotTopUpIdempotent({ store: new Map(), idempotencyKey: 'key', hostId: 'host', listingId: 'listing', amountPaise: 1, handler })).rejects.toThrow('PILOT_MUTATION_UNAVAILABLE');
    expect(query).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled();
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
    it('formats untrusted supplied observations without certification or historical writes', () => {
      const before = existsSync(receiptPath) ? readFileSync(receiptPath) : null;
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

      expect(receipt.status).toBe('REQUIRES_INDEPENDENT_REVIEW');
      expect(receipt.productionGateEligible).toBe(false);
      expect(receipt.constraints.maxAggregateCapInr).toBe(50000);
      expect(existsSync(receiptPath) ? readFileSync(receiptPath) : null).toEqual(before);
    });
  });
});
