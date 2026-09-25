import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Cr1ReleaseCertificateEngine,
  type DbClientPort,
  type CertificateIssuanceInput,
  type GateAttestationPayload,
} from '../../lib/compliance/cr1ReleaseCertificateEngine.js';

describe('CR1 Final Release Candidate Certification & External Gate Manifest Adversarial Suite', () => {
  const certificateReceiptPath = resolve(
    process.cwd(),
    'docs/harvo/receipts/CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Connection drops midway through release audit logging -> full rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let shouldDropConnection = false;
    let rollbackExecuted = false;

    const mockDb: DbClientPort = {
      query: vi.fn(async (sql: string) => {
        executedQueries.push(sql.trim().split('\n')[0]);
        if (sql === 'BEGIN') return { rows: [] };
        if (sql === 'ROLLBACK') {
          rollbackExecuted = true;
          return { rows: [] };
        }
        if (sql === 'COMMIT') return { rows: [] };

        if (sql.includes('INSERT INTO release_candidate_registry')) {
          return { rows: [{ id: 'rc_01' }] };
        }
        if (shouldDropConnection && sql.includes('INSERT INTO platform_audit_log')) {
          throw new Error('ECONNRESET: TCP stream severed during certification audit log persistence');
        }
        return { rows: [] };
      }),
    };

    const engine = new Cr1ReleaseCertificateEngine();
    const input: CertificateIssuanceInput = {
      commitHash: '41c51b1a9a79df513dc71b1b0e7ccf119286e1d7',
      releaseTag: 'CR1-RC1',
      operatorId: 'principal_architect_l8',
      idempotencyKey: 'idemp_rc_drop_01',
    };

    shouldDropConnection = true;

    await expect(engine.issueCertificateWithAudit(mockDb, input)).rejects.toThrow(
      'ECONNRESET: TCP stream severed during certification audit log persistence'
    );

    // Verify atomic transaction boundary: BEGIN -> INSERT rc -> FAIL audit -> ROLLBACK
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
    expect(rollbackExecuted).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Concurrent 5-click burst in 200ms deduplicates to exactly 1 write and 4 replays', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO release_candidate_registry')) {
          writeCount++;
          // Simulate latency
          await new Promise(resolve => setTimeout(resolve, 30));
          return { rows: [{ id: 'rc_burst_01' }] };
        }
        return { rows: [] };
      }),
    };

    const engine = new Cr1ReleaseCertificateEngine();
    const idempotencyKey = `idemp_rc_burst_${Date.now()}`;

    const input: CertificateIssuanceInput = {
      commitHash: '41c51b1a9a79df513dc71b1b0e7ccf119286e1d7',
      releaseTag: 'CR1-RC1',
      operatorId: 'principal_architect_l8',
      idempotencyKey,
    };

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      engine.issueCertificateWithAudit(mockDb, input),
      engine.issueCertificateWithAudit(mockDb, input),
      engine.issueCertificateWithAudit(mockDb, input),
      engine.issueCertificateWithAudit(mockDb, input),
      engine.issueCertificateWithAudit(mockDb, input),
    ]);

    // Exactly 1 database write executed
    expect(writeCount).toBe(1);

    // All 5 returned identical valid certificate IDs
    const certIds = results.map(r => r.certificateId);
    expect(new Set(certIds).size).toBe(1);

    // Exactly 1 original execution and 4 replays
    const primary = results.filter(r => !r.isReplay);
    const replays = results.filter(r => r.isReplay);
    expect(primary).toHaveLength(1);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order External Gate Attestation Sequencing
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Out-of-order external gate attestation packets are sequence-fenced without regression', async () => {
    const engine = new Cr1ReleaseCertificateEngine();
    const gateId = 'LEGAL-01';

    // Packet 1: Sequence 3 arrives first (status = IN_REVIEW at t=3000)
    const packet3: GateAttestationPayload = {
      gateId,
      status: 'IN_REVIEW',
      sequenceNumber: 3,
      attestor: 'tax_counsel_delhi',
      timestamp: 3000,
    };
    const res3 = await engine.applyGateAttestation(packet3);
    expect(res3.applied).toBe(true);
    expect(res3.isStale).toBe(false);
    expect(res3.currentSequence).toBe(3);
    expect(res3.status).toBe('IN_REVIEW');

    // Packet 2: Stale sequence 1 arrives delayed (status = NOT_STARTED at t=1000)
    const packet1: GateAttestationPayload = {
      gateId,
      status: 'NOT_STARTED',
      sequenceNumber: 1, // Inverted sequence!
      attestor: 'clerk_01',
      timestamp: 1000,
    };
    const res1 = await engine.applyGateAttestation(packet1);
    // Monotonic sequence fence must reject stale sequence
    expect(res1.applied).toBe(false);
    expect(res1.isStale).toBe(true);
    expect(res1.reason).toBe('STALE_GATE_SEQUENCE_REJECTED');
    expect(res1.currentSequence).toBe(3);
    expect(res1.status).toBe('IN_REVIEW');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Cryptographic Tamper-Evidence Detection
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Modifying even one byte of the statutory tax memorandum produces mismatched checksum and fails', () => {
    const engine = new Cr1ReleaseCertificateEngine();

    const expectedSha256 = '0d8aa45f6390aa87b451076271d992839672d1b8826b1ef1c29446bde5d594f2';
    const legitimateContent = 'Official Encho Statutory Tax Clearance Memorandum Content';
    const computedHash = engine.computeSha256(legitimateContent);

    // Tampered content with 1 modified character
    const tamperedContent = 'Official Encho Statutory Tax Clearance Memorandum Content.';
    const tamperedHash = engine.computeSha256(tamperedContent);

    expect(tamperedHash).not.toBe(computedHash);

    expect(() =>
      engine.verifyDigestIntegrity({
        documentName: 'TRACK_2_TAX_MEMORANDUM',
        expectedSha256: computedHash,
        actualSha256: tamperedHash,
      })
    ).toThrow('TAMPER_DETECTED_HASH_MISMATCH: TRACK_2_TAX_MEMORANDUM checksum verification failed');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: Full RC1 Dossier Certification & Export
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Generates comprehensive CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json with 7 external gates', () => {
    const engine = new Cr1ReleaseCertificateEngine();

    const certificate = engine.generateReleaseCandidateCertificate({
      commitHash: '29a50a353671b1b526b150b78905d11aaf82dbb0',
      releaseTag: 'CR1-RC1',
      targetPath: certificateReceiptPath,
    });

    expect(certificate.releaseTag).toBe('CR1-RC1');
    expect(certificate.status).toBe('CERTIFIED_RELEASE_CANDIDATE');
    expect(certificate.localPackagesComplete).toBe(48);
    expect(certificate.totalPackages).toBe(48);
    expect(certificate.completionPercentage).toBe('100.0%');
    expect(certificate.verifiedAdversarialEngines).toHaveLength(16);
    expect(certificate.externalGates).toHaveLength(7);
    expect(certificate.verificationChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(certificateReceiptPath)).toBe(true);

    // Verify all 7 external gates are formally listed with fail-closed status
    const gateIds = certificate.externalGates.map(g => g.gateId);
    expect(gateIds).toContain('STAGE-01');
    expect(gateIds).toContain('LEGAL-01');
    expect(gateIds).toContain('PROV-M-01');
    expect(gateIds).toContain('PROV-G-01');
    expect(gateIds).toContain('COMM-01');
    expect(gateIds).toContain('CANARY-01');
    expect(gateIds).toContain('PILOT-01');

    // Verify sequential clearance state (Gates 1-5 Cleared, 6-7 Pending External Sign-Off)
    expect(certificate.externalGates.find(g => g.gateId === 'STAGE-01')?.status).toBe('CLEARED');
    expect(certificate.externalGates.find(g => g.gateId === 'LEGAL-01')?.status).toBe('CLEARED');
    expect(certificate.externalGates.find(g => g.gateId === 'PROV-M-01')?.status).toBe('CLEARED');
    expect(certificate.externalGates.find(g => g.gateId === 'PROV-G-01')?.status).toBe('CLEARED');
    expect(certificate.externalGates.find(g => g.gateId === 'COMM-01')?.status).toBe('CLEARED');
    expect(certificate.externalGates.find(g => g.gateId === 'CANARY-01')?.status).toBe('PENDING_EXTERNAL_SIGN_OFF');
    expect(certificate.externalGates.find(g => g.gateId === 'PILOT-01')?.status).toBe('PENDING_EXTERNAL_SIGN_OFF');
  });
});
