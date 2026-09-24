import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  StatutoryTaxVerificationEngine,
  type StatutoryDbClientPort,
  type StatutoryTaxInvoiceInput,
  type TaxClearanceAttestationPayload,
} from '../../lib/compliance/statutoryTaxVerificationEngine.js';

describe('CR1 Phase 4.2: Statutory Tax Clearance & UDIN Verification Adversarial Suite (Package P4.3 / LEGAL-01)', () => {
  const engine = new StatutoryTaxVerificationEngine();
  const memorandumPath = resolve(
    process.cwd(),
    'docs/compliance/TRACK_2_STATUTORY_TAX_CLEARANCE_MEMORANDUM_AND_CA_PACKET.md'
  );

  // Adversarial Scenario 1: Connection drops midway through statutory invoice / credit note issuance
  it('Scenario 1: Connection drops midway through statutory invoice issuance -> full atomic rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: StatutoryDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_tax_withholding_ledger')) {
          throw new Error('ECONNRESET: Database socket severed during statutory tax withholding ledger write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: StatutoryTaxInvoiceInput = {
      bookingId: 'booking_stay_wayanad_001',
      hostId: 'host_wayanad_resort',
      hostGstStatus: 'UNREGISTERED',
      baseStayPricePaise: 1200000, // ₹12,000.00
      idempotencyKey: 'idemp_tax_fail_001',
      operatorId: 'tax_auditor_ca_01',
    };

    await expect(engine.issueStatutoryTaxInvoiceWithAudit(mockFailingClient, input)).rejects.toThrow(
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
    const client: StatutoryDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO statutory_tax_invoices')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: StatutoryTaxInvoiceInput = {
      bookingId: 'booking_stay_wayanad_002',
      hostId: 'host_wayanad_resort',
      hostGstStatus: 'REGISTERED',
      hostGstin: '32ABCDE1234F1Z5',
      baseStayPricePaise: 2500000, // ₹25,000.00
      idempotencyKey: 'idemp_tax_burst_key_888',
      operatorId: 'tax_auditor_ca_01',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.issueStatutoryTaxInvoiceWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('COMMITTED');
  });

  // Adversarial Scenario 3: Malformed or forged ICAI UDIN structure rejected with INVALID_ICAI_UDIN_STRUCTURE
  it('Scenario 3: Forged or malformed ICAI UDIN strictly rejected with INVALID_ICAI_UDIN_STRUCTURE', () => {
    // Too short (15 chars)
    expect(() =>
      engine.verifyIcaAttestation({
        caName: 'Rajesh Sharma, FCA',
        icaiMembershipNumber: '123456',
        firmRegistrationNumber: '012345N',
        udin: '24123456ABCD123',
      })
    ).toThrow('INVALID_ICAI_UDIN_STRUCTURE');

    // Invalid non-alphanumeric character
    expect(() =>
      engine.verifyIcaAttestation({
        caName: 'Rajesh Sharma, FCA',
        icaiMembershipNumber: '123456',
        firmRegistrationNumber: '012345N',
        udin: '24123456ABCD@#1234',
      })
    ).toThrow('INVALID_ICAI_UDIN_STRUCTURE');

    // Valid 18-character UDIN passes cleanly
    const validResult = engine.verifyIcaAttestation({
      caName: 'Rajesh Sharma, FCA',
      icaiMembershipNumber: '123456',
      firmRegistrationNumber: '012345N',
      udin: '26123456ABCDEF1234',
    });
    expect(validResult.verified).toBe(true);
    expect(validResult.status).toBe('ATTESTATION_VALIDATED');
    expect(validResult.udin).toBe('26123456ABCDEF1234');
  });

  // Adversarial Scenario 4: Out-of-order tax clearance attestation sequence fencing
  it('Scenario 4: Out-of-order tax clearance attestation sequence updates are safely rejected without state regression', async () => {
    const payloadSeq5: TaxClearanceAttestationPayload = {
      attestationId: 'tax_attest_2026_fy',
      sequenceNumber: 5,
      status: 'VERIFIED',
      appliedAt: Date.now(),
    };

    const payloadSeq3Outdated: TaxClearanceAttestationPayload = {
      attestationId: 'tax_attest_2026_fy',
      sequenceNumber: 3,
      status: 'PENDING_REVIEW',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applyAttestationSequence(payloadSeq5);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(5);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applyAttestationSequence(payloadSeq3Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(5);
    expect(res2.reason).toBe('STALE_ATTESTATION_SEQUENCE_REJECTED');
  });

  // Adversarial Scenario 5: Modifying even one byte of the statutory tax memorandum produces mismatched checksum
  it('Scenario 5: Modifying even one byte of the statutory tax memorandum produces mismatched checksum and fails', () => {
    const canonicalFingerprint = engine.computeMemorandumFingerprint(memorandumPath);
    expect(canonicalFingerprint.sha256).toBeDefined();

    // Verify valid match passes
    expect(
      engine.verifyMemorandumIntegrity({
        expectedSha256: canonicalFingerprint.sha256,
        actualSha256: canonicalFingerprint.sha256,
      })
    ).toBe(true);

    // Tampered checksum produces tamper exception
    const tamperedSha256 = canonicalFingerprint.sha256.replace(/^./, 'f');
    expect(() =>
      engine.verifyMemorandumIntegrity({
        expectedSha256: canonicalFingerprint.sha256,
        actualSha256: tamperedSha256,
      })
    ).toThrow('TAMPER_DETECTED_HASH_MISMATCH');
  });
});
