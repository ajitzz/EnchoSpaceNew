import { describe, expect, it } from 'vitest';
import {
  BoundedPilotHardeningEngine,
  type PilotDbClientPort,
  type PilotCharterInput,
  type PilotHealthMetricsInput,
  type PilotMilestoneAttestationPayload,
} from '../../lib/compliance/boundedPilotHardeningEngine.js';

describe('CR1 Phase 4.6: Bounded Commercial Pilot Hardening Adversarial Suite (Package P8.4 / PILOT-01 Gate)', () => {
  const engine = new BoundedPilotHardeningEngine();

  // Adversarial Scenario 1: Connection drops midway through pilot registration -> atomic rollback, 0 zombie records
  it('Scenario 1: Connection drops midway through pilot registration -> full atomic rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: PilotDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during pilot audit write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: PilotCharterInput = {
      listingId: '1', // Listing 1 (Wayanad Sanctuary)
      hostId: 'host_founder_wayanad',
      durationDays: 30,
      budgetCapPaise: 10000000, // ₹100,000 cap
      minRoas: 3.0,
      idempotencyKey: 'idemp_pilot_fail_001',
      operatorId: 'operator_pilot_lead_01',
    };

    await expect(engine.registerPilotCharterWithAudit(mockFailingClient, input)).rejects.toThrow(
      'ECONNRESET'
    );

    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(rolledBack).toBe(true);
    expect(executedQueries.filter((q) => q === 'COMMIT')).toHaveLength(0);
  });

  // Adversarial Scenario 2: Concurrent 5-click burst in 200ms
  it('Scenario 2: Concurrent 5-click burst in 200ms deduplicates to exactly 1 write and 4 replays', async () => {
    let writeCount = 0;
    const client: PilotDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO pilot_charter_registry')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: PilotCharterInput = {
      listingId: '1',
      hostId: 'host_founder_wayanad',
      durationDays: 30,
      budgetCapPaise: 10000000,
      minRoas: 3.0,
      idempotencyKey: 'idemp_pilot_burst_key_101',
      operatorId: 'operator_pilot_lead_01',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.registerPilotCharterWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('ACTIVE_BOUND');
    expect(nonReplays[0].budgetCapPaise).toBe(10000000);
  });

  // Adversarial Scenario 3: Pilot budget cap & duration boundary violations strictly fail closed
  it('Scenario 3: Pilot budget exceeding ₹100k cap or duration exceeding 30 days strictly fails closed', () => {
    // Case A: Excessive budget cap (> ₹100,000 / 10,000,000 paise)
    expect(() =>
      engine.validatePilotCharterBounds({
        listingId: '1',
        hostId: 'host_founder_wayanad',
        durationDays: 30,
        budgetCapPaise: 15000000, // ₹150,000 exceeds ₹100,000 limit
        minRoas: 3.0,
        idempotencyKey: 'idemp_test_exceed_budget',
        operatorId: 'operator_01',
      })
    ).toThrow('PILOT_BUDGET_CAP_EXCEEDED_EXCEPTION');

    // Case B: Excessive duration (> 30 days)
    expect(() =>
      engine.validatePilotCharterBounds({
        listingId: '1',
        hostId: 'host_founder_wayanad',
        durationDays: 45, // exceeds 30-day pilot bound
        budgetCapPaise: 10000000,
        minRoas: 3.0,
        idempotencyKey: 'idemp_test_exceed_days',
        operatorId: 'operator_01',
      })
    ).toThrow('PILOT_DURATION_EXCEEDED_EXCEPTION');

    // Case C: Compliant pilot bounds pass cleanly
    const valid = engine.validatePilotCharterBounds({
      listingId: '1',
      hostId: 'host_founder_wayanad',
      durationDays: 30,
      budgetCapPaise: 10000000,
      minRoas: 3.0,
      idempotencyKey: 'idemp_test_valid',
      operatorId: 'operator_01',
    });
    expect(valid).toBe(true);
  });

  // Adversarial Scenario 4: Stop-loss ROAS circuit breaker & lead containment enforcement
  it('Scenario 4: ROAS below 3.0x triggers stop-loss circuit breaker; lead leakage strictly quarantined', () => {
    // Case A: Sub-threshold ROAS triggers stop-loss pause
    const lowRoasInput: PilotHealthMetricsInput = {
      mediaSpendPaise: 2000000, // ₹20,000 spend
      realizedBookingPaise: 4000000, // ₹40,000 realized (2.0x ROAS < 3.0x min)
      hasOffPlatformLeadLeakage: false,
    };
    expect(() =>
      engine.evaluatePilotHealthMetrics(lowRoasInput)
    ).toThrow('PILOT_STOP_LOSS_TRIGGERED');

    // Case B: Off-platform contact leakage triggers security violation
    const leakingInput: PilotHealthMetricsInput = {
      mediaSpendPaise: 2000000,
      realizedBookingPaise: 8000000, // 4.0x ROAS
      hasOffPlatformLeadLeakage: true, // Contact leakage detected!
    };
    expect(() =>
      engine.evaluatePilotHealthMetrics(leakingInput)
    ).toThrow('PILOT_LEAD_LEAKAGE_SECURITY_VIOLATION');

    // Case C: High ROAS and zero lead leakage clears cleanly for flight
    const healthyInput: PilotHealthMetricsInput = {
      mediaSpendPaise: 2000000,
      realizedBookingPaise: 7000000, // 3.5x ROAS >= 3.0x
      hasOffPlatformLeadLeakage: false,
    };
    const health = engine.evaluatePilotHealthMetrics(healthyInput);
    expect(health.cleared).toBe(true);
    expect(health.status).toBe('CLEARED_FOR_FLIGHT');
    expect(health.roas).toBeCloseTo(3.5, 2);
  });

  // Adversarial Scenario 5: Monotonic milestone sequence fencing
  it('Scenario 5: Out-of-order pilot milestone sequence updates are safely rejected without state regression', async () => {
    const payloadSeq10: PilotMilestoneAttestationPayload = {
      pilotId: 'pilot_wayanad_001',
      sequenceNumber: 10,
      status: 'AUDIT_STAGE_CLEARED',
      appliedAt: Date.now(),
    };

    const payloadSeq7Outdated: PilotMilestoneAttestationPayload = {
      pilotId: 'pilot_wayanad_001',
      sequenceNumber: 7,
      status: 'CHARTER_PROPOSED',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applyMilestoneSequence(payloadSeq10);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(10);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applyMilestoneSequence(payloadSeq7Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(10);
    expect(res2.reason).toBe('STALE_PILOT_SEQUENCE_REJECTED');
  });
});
