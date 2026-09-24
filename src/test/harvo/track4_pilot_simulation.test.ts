import { describe, it, expect, vi, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PilotStopLossEngine,
  PILOT_STOP_LOSS_CONSTANTS,
  type DbClientPort,
} from '../../lib/compliance/pilotStopLossEngine';

describe('CR1 Track 4: Bounded Commercial Pilot Charter & Stop-Loss Simulation Harness', () => {
  const receiptPath = resolve(
    process.cwd(),
    'docs/harvo/receipts/CR1_PILOT_STOP_LOSS_SIMULATION_RECEIPT.json'
  );

  afterAll(() => {
    // Preserve disk hygiene in test sandbox if needed, or leave generated receipt
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL TEST 1: Mid-Transaction Connection Drop -> Atomic Rollback
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through Pilot Wallet Transaction', () => {
    it('executes atomic rollback, creates zero zombie records, and rejects cleanly', async () => {
      let rollbackInvoked = false;
      let commitInvoked = false;
      const executedQueries: string[] = [];

      const mockDb: DbClientPort = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          if (sql === 'BEGIN') return {};
          if (sql === 'ROLLBACK') {
            rollbackInvoked = true;
            return {};
          }
          if (sql === 'COMMIT') {
            commitInvoked = true;
            return {};
          }
          if (sql.includes('INSERT INTO host_marketing_campaigns')) {
            // Step 1 succeeds
            return { insertId: 'camp_123' };
          }
          if (sql.includes('INSERT INTO platform_wallet_ledger')) {
            // Step 2: Connection reset / database peer drop
            throw new Error('ECONNRESET: TCP connection terminated by peer midway through wallet mutation');
          }
          return {};
        }),
      };

      const engine = new PilotStopLossEngine();

      await expect(
        engine.fundPilotCampaignWithTransaction(mockDb, {
          hostId: 'pilot_host_wayanad',
          listingId: PILOT_STOP_LOSS_CONSTANTS.AUTHORIZED_LISTING_ID,
          amountPaise: 200000, // ₹2,000 INR
          idempotencyKey: 'idemp_conn_drop_test_01',
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbackInvoked).toBe(true);
      expect(commitInvoked).toBe(false);
      // Ensure ROLLBACK was the final query executed
      expect(executedQueries[executedQueries.length - 1]).toBe('ROLLBACK');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL TEST 2: 5-Click Burst Submission in 200ms -> Deduplication
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host Rapid Clicks 5 Times in 200 Milliseconds', () => {
    it('deduplicates in-flight concurrent burst submissions, executing exactly once with 4 replays', async () => {
      let executionCount = 0;

      const mockDb: DbClientPort = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('INSERT INTO host_marketing_campaigns')) {
            executionCount++;
            // Simulate slight asynchronous processing latency
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { rowCount: 1 };
          }
          return {};
        }),
      };

      const engine = new PilotStopLossEngine();
      const idempotencyKey = `idemp_burst_test_${Date.now()}`;

      const runTopUp = () =>
        engine.fundPilotCampaignWithTransaction(mockDb, {
          hostId: 'pilot_host_wayanad',
          listingId: PILOT_STOP_LOSS_CONSTANTS.AUTHORIZED_LISTING_ID,
          amountPaise: 150000, // ₹1,500 INR
          idempotencyKey,
        });

      // Fire 5 concurrent requests simultaneously
      const results = await Promise.all([
        runTopUp(),
        runTopUp(),
        runTopUp(),
        runTopUp(),
        runTopUp(),
      ]);

      // Exactly ONE DB execution
      expect(executionCount).toBe(1);

      // All 5 returned valid results
      for (const res of results) {
        expect(res.creditedPaise).toBe(150000);
        expect(res.listingId).toBe(PILOT_STOP_LOSS_CONSTANTS.AUTHORIZED_LISTING_ID);
        expect(res.status).toBe('COMMITTED');
      }

      // Exactly 1 primary execution and 4 deduplicated replays
      const primary = results.filter((r) => !r.isReplay);
      const replays = results.filter((r) => r.isReplay);
      expect(primary.length).toBe(1);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL TEST 3: Out-Of-Order Telemetry Webhook -> Monotonic Sequence Fencing
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Provider Spend Telemetry Arrives Out of Order', () => {
    it('enforces monotonic sequence fencing and preserves cumulative spend without backward drift', async () => {
      const engine = new PilotStopLossEngine();
      const campaignId = 'camp_telemetry_seq_01';

      // Packet 1: Sequence 1 (₹1,000 spend = 100,000 paise)
      const res1 = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 100000,
        sequenceNumber: 1,
        timestamp: 1000,
      });
      expect(res1.applied).toBe(true);
      expect(res1.isStale).toBe(false);
      expect(res1.cumulativeSpendPaise).toBe(100000);
      expect(res1.status).toBe('ACTIVE');

      // Packet 3 arrives before Packet 2: Sequence 3 (₹45,000 spend = 4,500,000 paise)
      const res3 = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 4500000,
        sequenceNumber: 3,
        timestamp: 3000,
      });
      expect(res3.applied).toBe(true);
      expect(res3.isStale).toBe(false);
      expect(res3.cumulativeSpendPaise).toBe(4500000);
      expect(res3.status).toBe('ACTIVE');

      // Packet 2 arrives late: Sequence 2 (₹20,000 spend = 2,000,000 paise)
      const res2 = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 2000000,
        sequenceNumber: 2,
        timestamp: 2000,
      });
      // Monotonic sequence fence must reject stale sequence
      expect(res2.applied).toBe(false);
      expect(res2.isStale).toBe(true);
      expect(res2.reason).toBe('STALE_TELEMETRY_SEQUENCE_REJECTED');
      expect(res2.currentSequence).toBe(3);
      // Cumulative spend remains at ₹45,000
      expect(res2.cumulativeSpendPaise).toBe(4500000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: 95% Stop-Loss Circuit Breaker Automatic Trip
  // ──────────────────────────────────────────────────────────────────────────
  describe('Stop-Loss Circuit Breaker (95% Rule)', () => {
    it('automatically transitions campaign to CIRCUIT_BREAKER_PAUSED when spend crosses 95%', async () => {
      const engine = new PilotStopLossEngine();
      const campaignId = 'camp_circuit_breaker_01';

      // 95% of ₹50,000 is ₹47,500 (4,750,000 paise)
      // Test at 94% (₹47,000 = 4,700,000 paise) -> Remains ACTIVE
      const resUnder = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 4700000,
        sequenceNumber: 1,
        timestamp: 1000,
      });
      expect(resUnder.status).toBe('ACTIVE');
      expect(resUnder.circuitBreakerTriggered).toBe(false);

      // Spend crosses 95% threshold: ₹47,500 (4,750,000 paise)
      const resTrip = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 4750000,
        sequenceNumber: 2,
        timestamp: 2000,
      });
      expect(resTrip.status).toBe('CIRCUIT_BREAKER_PAUSED');
      expect(resTrip.circuitBreakerTriggered).toBe(true);

      // Further spend updates remain paused
      const resFurther = await engine.ingestSpendTelemetry({
        campaignId,
        reportedCumulativeSpendPaise: 4800000,
        sequenceNumber: 3,
        timestamp: 3000,
      });
      expect(resFurther.status).toBe('CIRCUIT_BREAKER_PAUSED');
      expect(resFurther.cumulativeSpendPaise).toBe(4800000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 5: Pilot Guardrails, Scope Bounds & Overrun Rejections
  // ──────────────────────────────────────────────────────────────────────────
  describe('Pilot Scope Boundaries & Financial Stop-Loss Caps', () => {
    it('rejects unauthorized properties outside Listing 1 with UNAUTHORIZED_PILOT_PROPERTY', () => {
      const engine = new PilotStopLossEngine();

      expect(() => {
        engine.validatePilotProperty('listing_99_unauthorized');
      }).toThrow('UNAUTHORIZED_PILOT_PROPERTY');

      expect(() => {
        engine.validatePilotProperty(PILOT_STOP_LOSS_CONSTANTS.AUTHORIZED_LISTING_ID);
      }).not.toThrow();
    });

    it('rejects budget requests exceeding aggregate cap of ₹50,000 INR', () => {
      const engine = new PilotStopLossEngine();

      // Aggregate limit is 5,000,000 paise
      const checkOverrun = engine.evaluateBudgetAllocation({
        currentAggregateCommittedPaise: 4900000,
        requestedNewPaise: 150000, // Total 5,050,000 > 5,000,000
        dailyRequestedPaise: 100000,
      });

      expect(checkOverrun.allowed).toBe(false);
      expect(checkOverrun.reason).toBe('PILOT_BUDGET_CAP_EXCEEDED');

      // Daily limit is 200,000 paise (₹2,000 INR)
      const checkDailyOverrun = engine.evaluateBudgetAllocation({
        currentAggregateCommittedPaise: 1000000,
        requestedNewPaise: 50000,
        dailyRequestedPaise: 250000, // 250,000 > 200,000
      });

      expect(checkDailyOverrun.allowed).toBe(false);
      expect(checkDailyOverrun.reason).toBe('PILOT_DAILY_CAP_EXCEEDED');

      // Valid allocation within limits
      const checkValid = engine.evaluateBudgetAllocation({
        currentAggregateCommittedPaise: 1000000,
        requestedNewPaise: 100000,
        dailyRequestedPaise: 150000,
      });

      expect(checkValid.allowed).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 6: Simulation Runner & Cryptographic Receipt Generation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Stop-Loss Simulation Runner & Digest Generation', () => {
    it('runs full simulation cycle and writes cryptographic receipt to disk', () => {
      const engine = new PilotStopLossEngine();
      const charterPath = resolve(
        process.cwd(),
        'docs/compliance/TRACK_4_BOUNDED_PILOT_AGREEMENT_AND_STOP_LOSS_CHARTER.md'
      );

      const receipt = engine.executePilotSimulationAndGenerateReceipt({
        charterPath,
        receiptPath,
        simulatedHost: 'pilot_host_wayanad',
        simulatedListing: PILOT_STOP_LOSS_CONSTANTS.AUTHORIZED_LISTING_ID,
        simulatedFinalSpendPaise: 4760000, // Crossed 95%
        roasAchieved: 3.42,
        inquiriesGenerated: 24,
        bookingsCaptured: 6,
        grossBookingValuePaise: 16279200, // ₹162,792 INR (~3.42x ROAS)
      });

      expect(receipt.status).toBe('SIMULATION_CERTIFIED');
      expect(receipt.circuitBreakerTriggered).toBe(true);
      expect(receipt.charterSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(existsSync(receiptPath)).toBe(true);
    });
  });
});
