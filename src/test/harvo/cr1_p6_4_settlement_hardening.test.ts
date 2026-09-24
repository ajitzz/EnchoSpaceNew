import { describe, expect, it } from 'vitest';
import {
  AdTechSettlementHardeningEngine,
  type SettlementDbClientPort,
  type AdTechSettlementInput,
  type SettlementAttestationPayload,
  type VarianceReconciliationInput,
} from '../../lib/compliance/adTechSettlementHardeningEngine.js';

describe('CR1 Phase 4.4: AdTech SAC 998313 Markup Settlement Hardening Adversarial Suite (Package P6.4 / COMM-01 Gate)', () => {
  const engine = new AdTechSettlementHardeningEngine();

  // Adversarial Scenario 1: Connection drops midway through settlement write -> atomic rollback, 0 zombie records
  it('Scenario 1: Connection drops midway through settlement write -> full atomic rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: SettlementDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during settlement audit write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: AdTechSettlementInput = {
      campaignId: 'camp_wayanad_luxury_001',
      hostId: 'host_founder_wayanad',
      mediaSpendCostPaise: 5000000, // ₹50,000
      markupRate: 0.04, // 4% markup
      idempotencyKey: 'idemp_settle_fail_001',
      operatorId: 'operator_finance_01',
    };

    await expect(engine.settleCampaignMarkupWithAudit(mockFailingClient, input)).rejects.toThrow(
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
    const client: SettlementDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO adtech_settlement_ledger')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: AdTechSettlementInput = {
      campaignId: 'camp_wayanad_luxury_002',
      hostId: 'host_founder_wayanad',
      mediaSpendCostPaise: 10000000, // ₹100,000
      markupRate: 0.05, // 5% markup
      idempotencyKey: 'idemp_settle_burst_key_888',
      operatorId: 'operator_finance_01',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.settleCampaignMarkupWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('COMMITTED');
    expect(nonReplays[0].breakdown.markupPaise).toBe(500000); // 5% of ₹100k = ₹5,000 = 500,000 paise
    expect(nonReplays[0].breakdown.gstSac998313Paise).toBe(90000); // 18% of ₹5,000 = ₹900 = 90,000 paise
    expect(nonReplays[0].breakdown.totalHostChargedPaise).toBe(10590000); // ₹105,900 = 10,590,000 paise
  });

  // Adversarial Scenario 3: Bounded 3-5% markup invariant & SAC 998313 calculation
  it('Scenario 3: Out-of-bounds markup rates strictly fail closed; valid 3-5% rates compute exact SAC 998313 GST', () => {
    // Case A: Below 3% (e.g. 1%) fails closed
    expect(() =>
      engine.calculateSettlementBreakdown(5000000, 0.01)
    ).toThrow('INVALID_ADTECH_MARKUP_RATE_EXCEPTION');

    // Case B: Historical 15% fixed fee (superseded by HARVO-008/009) fails closed
    expect(() =>
      engine.calculateSettlementBreakdown(5000000, 0.15)
    ).toThrow('INVALID_ADTECH_MARKUP_RATE_EXCEPTION');

    // Case C: Valid lower bound 3% passes with exact breakdown
    const bound3 = engine.calculateSettlementBreakdown(5000000, 0.03); // ₹50,000 media spend
    expect(bound3.mediaSpendCostPaise).toBe(5000000);
    expect(bound3.markupRate).toBe(0.03);
    expect(bound3.markupPaise).toBe(150000); // ₹1,500
    expect(bound3.gstSac998313Paise).toBe(27000); // ₹270 (18% GST)
    expect(bound3.totalHostChargedPaise).toBe(5177000); // ₹51,770

    // Case D: Valid upper bound 5% passes with exact breakdown
    const bound5 = engine.calculateSettlementBreakdown(5000000, 0.05); // ₹50,000 media spend
    expect(bound5.mediaSpendCostPaise).toBe(5000000);
    expect(bound5.markupRate).toBe(0.05);
    expect(bound5.markupPaise).toBe(250000); // ₹2,500
    expect(bound5.gstSac998313Paise).toBe(45000); // ₹450 (18% GST)
    expect(bound5.totalHostChargedPaise).toBe(5295000); // ₹52,950
  });

  // Adversarial Scenario 4: Provider spend variance exceeding 5% fails closed
  it('Scenario 4: Provider spend variance exceeding 5% strictly fails closed to protect host escrow', () => {
    const acceptableVariance: VarianceReconciliationInput = {
      budgetCostPaise: 1000000, // ₹10,000
      actualProviderSpendPaise: 1040000, // ₹10,400 (+4% variance, within 5% tolerance)
    };
    const res = engine.validateProviderVariance(acceptableVariance);
    expect(res.isAcceptable).toBe(true);
    expect(res.variancePercentage).toBeCloseTo(4.0, 1);

    const excessiveVariance: VarianceReconciliationInput = {
      budgetCostPaise: 1000000, // ₹10,000
      actualProviderSpendPaise: 1100000, // ₹11,000 (+10% variance, exceeds 5% limit)
    };
    expect(() =>
      engine.validateProviderVariance(excessiveVariance)
    ).toThrow('EXCESSIVE_PROVIDER_VARIANCE_EXCEPTION');
  });

  // Adversarial Scenario 5: Monotonic settlement attestation sequence fencing
  it('Scenario 5: Out-of-order settlement attestation sequence updates are safely rejected without state regression', async () => {
    const payloadSeq8: SettlementAttestationPayload = {
      settlementId: 'settle_wayanad_001',
      sequenceNumber: 8,
      status: 'RECONCILED_CONFIRMED',
      appliedAt: Date.now(),
    };

    const payloadSeq5Outdated: SettlementAttestationPayload = {
      settlementId: 'settle_wayanad_001',
      sequenceNumber: 5,
      status: 'PENDING_RECONCILIATION',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applySettlementSequence(payloadSeq8);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(8);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applySettlementSequence(payloadSeq5Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(8);
    expect(res2.reason).toBe('STALE_SETTLEMENT_SEQUENCE_REJECTED');
  });
});
