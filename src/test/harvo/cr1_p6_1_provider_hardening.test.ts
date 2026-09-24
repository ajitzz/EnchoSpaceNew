import { describe, expect, it } from 'vitest';
import {
  ProviderSecurityHardeningEngine,
  type ProviderDbClientPort,
  type MetaAccountBindingInput,
  type GoogleMccBindingInput,
  type ProviderCapabilityAttestationPayload,
} from '../../lib/compliance/providerSecurityHardeningEngine.js';

describe('CR1 Phase 4.3: Provider Accounts & Capability Hardening Adversarial Suite (Package P6.1 / PROV-M-01 & PROV-G-01)', () => {
  const engine = new ProviderSecurityHardeningEngine();

  // Adversarial Scenario 1: Connection drops midway through provider account registration
  it('Scenario 1: Connection drops midway through provider account registration -> full atomic rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: ProviderDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during provider audit write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: MetaAccountBindingInput = {
      operatorId: 'operator_adtech_lead_01',
      businessManagerId: 'bm_encho_master_999',
      adAccountId: 'act_1029384756',
      specialAdCategory: 'HOUSING',
      idempotencyKey: 'idemp_provider_reg_fail_001',
    };

    await expect(engine.registerMetaMasterAccountWithAudit(mockFailingClient, input)).rejects.toThrow(
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
    const client: ProviderDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO provider_account_registry')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: MetaAccountBindingInput = {
      operatorId: 'operator_adtech_lead_01',
      businessManagerId: 'bm_encho_master_999',
      adAccountId: 'act_1029384756',
      specialAdCategory: 'HOUSING',
      idempotencyKey: 'idemp_provider_burst_key_777',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.registerMetaMasterAccountWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('REGISTERED');
  });

  // Adversarial Scenario 3: Meta Housing Category violation strictly fails closed
  it('Scenario 3: Meta Housing Category omission or demographic targeting violation strictly fails closed', () => {
    // Case A: Missing HOUSING category for property stay
    expect(() =>
      engine.validateMetaHousingCompliance({
        specialAdCategory: 'NONE',
        hasAgeFilter: false,
        hasGenderFilter: false,
        hasPostalCodeFilter: false,
      })
    ).toThrow('META_HOUSING_CATEGORY_POLICY_VIOLATION');

    // Case B: Discriminatory age filtering on housing
    expect(() =>
      engine.validateMetaHousingCompliance({
        specialAdCategory: 'HOUSING',
        hasAgeFilter: true,
        hasGenderFilter: false,
        hasPostalCodeFilter: false,
      })
    ).toThrow('META_HOUSING_CATEGORY_POLICY_VIOLATION');

    // Case C: Prohibited postal code targeting on housing
    expect(() =>
      engine.validateMetaHousingCompliance({
        specialAdCategory: 'HOUSING',
        hasAgeFilter: false,
        hasGenderFilter: false,
        hasPostalCodeFilter: true,
      })
    ).toThrow('META_HOUSING_CATEGORY_POLICY_VIOLATION');

    // Case D: Compliant housing configuration passes cleanly
    const compliant = engine.validateMetaHousingCompliance({
      specialAdCategory: 'HOUSING',
      hasAgeFilter: false,
      hasGenderFilter: false,
      hasPostalCodeFilter: false,
    });
    expect(compliant).toBe(true);
  });

  // Adversarial Scenario 4: Out-of-order provider capability attestation sequencing
  it('Scenario 4: Out-of-order provider capability sequence updates are safely rejected without state regression', async () => {
    const payloadSeq6: ProviderCapabilityAttestationPayload = {
      providerId: 'META_MASTER_AD_ACCOUNT',
      sequenceNumber: 6,
      status: 'VERIFIED',
      appliedAt: Date.now(),
    };

    const payloadSeq4Outdated: ProviderCapabilityAttestationPayload = {
      providerId: 'META_MASTER_AD_ACCOUNT',
      sequenceNumber: 4,
      status: 'PENDING_APPROVAL',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applyCapabilitySequence(payloadSeq6);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(6);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applyCapabilitySequence(payloadSeq4Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(6);
    expect(res2.reason).toBe('STALE_PROVIDER_SEQUENCE_REJECTED');
  });

  // Adversarial Scenario 5: Google Ads MCC malformed developer token or customer ID fails closed
  it('Scenario 5: Malformed Google Ads MCC developer token or invalid customer ID strictly fails closed', () => {
    // Invalid customer ID (wrong format / length)
    expect(() =>
      engine.validateGoogleMccCredentials({
        mccCustomerId: 'invalid-id-123',
        developerToken: 'AbCdEfGhIjKlMnOpQrStUv',
        managerAccountId: 'mgr_9876543210',
      })
    ).toThrow('INVALID_GOOGLE_MCC_CREDENTIALS');

    // Invalid developer token (too short)
    expect(() =>
      engine.validateGoogleMccCredentials({
        mccCustomerId: '123-456-7890',
        developerToken: 'too-short',
        managerAccountId: 'mgr_9876543210',
      })
    ).toThrow('INVALID_GOOGLE_MCC_CREDENTIALS');

    // Valid Google MCC credentials pass cleanly
    const valid = engine.validateGoogleMccCredentials({
      mccCustomerId: '123-456-7890',
      developerToken: 'AbCdEfGhIjKlMnOpQrStUvWxYz',
      managerAccountId: 'mgr_9876543210',
    });
    expect(valid).toBe(true);
  });
});
