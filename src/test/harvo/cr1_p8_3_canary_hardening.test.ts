import { describe, expect, it } from 'vitest';
import {
  PausedCanaryHardeningEngine,
  type CanaryDbClientPort,
  type CanaryExecutionInput,
  type ProviderReadbackPayload,
  type CanaryAttestationPayload,
} from '../../lib/compliance/pausedCanaryHardeningEngine.js';

describe('CR1 Phase 4.5: Paused Canary Execution & Zero-Spend Readback Hardening Adversarial Suite (Package P8.3 / CANARY-01 Gate)', () => {
  const engine = new PausedCanaryHardeningEngine();

  // Adversarial Scenario 1: Connection drops midway through canary registration -> atomic rollback, 0 zombie records
  it('Scenario 1: Connection drops midway through canary write -> full atomic rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: CanaryDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during canary audit write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: CanaryExecutionInput = {
      listingId: '1', // Listing 1 (Wayanad Sanctuary)
      provider: 'META_ADS',
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
      idempotencyKey: 'idemp_canary_fail_001',
      operatorId: 'operator_canary_lead_01',
    };

    await expect(engine.registerCanaryCampaignWithAudit(mockFailingClient, input)).rejects.toThrow(
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
    const client: CanaryDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO canary_execution_registry')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: CanaryExecutionInput = {
      listingId: '1',
      provider: 'GOOGLE_ADS',
      remoteCampaignId: 'goog_camp_canary_wayanad_002',
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
      idempotencyKey: 'idemp_canary_burst_key_999',
      operatorId: 'operator_canary_lead_01',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.registerCanaryCampaignWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('PAUSED');
    expect(nonReplays[0].dailyBudgetPaise).toBe(0);
  });

  // Adversarial Scenario 3: Zero-spend invariant & non-PAUSED status strictly fail closed
  it('Scenario 3: Non-PAUSED status or non-zero daily budget strictly fails closed', () => {
    // Case A: Attempting ACTIVE status fails closed
    expect(() =>
      engine.validateCanaryZeroSpendInvariant({
        campaignStatus: 'ACTIVE',
        dailyBudgetPaise: 0,
      })
    ).toThrow('CANARY_ZERO_SPEND_VIOLATION');

    // Case B: Attempting non-zero spend fails closed
    expect(() =>
      engine.validateCanaryZeroSpendInvariant({
        campaignStatus: 'PAUSED',
        dailyBudgetPaise: 50000,
      })
    ).toThrow('CANARY_ZERO_SPEND_VIOLATION');

    // Case C: Valid PAUSED with 0 spend passes cleanly
    const valid = engine.validateCanaryZeroSpendInvariant({
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
    });
    expect(valid).toBe(true);
  });

  // Adversarial Scenario 4: Provider exact readback verification
  it('Scenario 4: Mismatched remote provider status or remote spend detected during readback strictly fails closed', () => {
    const localConfig: CanaryExecutionInput = {
      listingId: '1',
      provider: 'META_ADS',
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
      idempotencyKey: 'idemp_canary_readback_001',
      operatorId: 'operator_canary_lead_01',
    };

    // Case A: Provider returned ACTIVE status instead of PAUSED
    const divergentStatusPayload: ProviderReadbackPayload = {
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      remoteStatus: 'ACTIVE',
      remoteDailyBudgetPaise: 0,
      provider: 'META_ADS',
    };
    expect(() =>
      engine.verifyProviderReadback(localConfig, divergentStatusPayload)
    ).toThrow('PROVIDER_READBACK_MISMATCH_EXCEPTION');

    // Case B: Provider returned non-zero spend
    const divergentBudgetPayload: ProviderReadbackPayload = {
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      remoteStatus: 'PAUSED',
      remoteDailyBudgetPaise: 100000, // ₹1,000 spend detected
      provider: 'META_ADS',
    };
    expect(() =>
      engine.verifyProviderReadback(localConfig, divergentBudgetPayload)
    ).toThrow('PROVIDER_READBACK_MISMATCH_EXCEPTION');

    // Case C: Exact match passes cleanly
    const exactMatchPayload: ProviderReadbackPayload = {
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      remoteStatus: 'PAUSED',
      remoteDailyBudgetPaise: 0,
      provider: 'META_ADS',
    };
    const verification = engine.verifyProviderReadback(localConfig, exactMatchPayload);
    expect(verification.verified).toBe(true);
    expect(verification.exactMatch).toBe(true);
  });

  // Adversarial Scenario 5: Monotonic canary sequence fencing
  it('Scenario 5: Out-of-order canary attestation sequence updates are safely rejected without state regression', async () => {
    const payloadSeq9: CanaryAttestationPayload = {
      canaryId: 'canary_wayanad_001',
      sequenceNumber: 9,
      status: 'VERIFIED_READBACK_MATCH',
      appliedAt: Date.now(),
    };

    const payloadSeq6Outdated: CanaryAttestationPayload = {
      canaryId: 'canary_wayanad_001',
      sequenceNumber: 6,
      status: 'PENDING_REMOTE_CHECK',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applyCanarySequence(payloadSeq9);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(9);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applyCanarySequence(payloadSeq6Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(9);
    expect(res2.reason).toBe('STALE_CANARY_SEQUENCE_REJECTED');
  });
});
