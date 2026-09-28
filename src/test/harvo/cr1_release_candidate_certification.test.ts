import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cr1ReleaseCertificateEngine } from '../../lib/compliance/cr1ReleaseCertificateEngine.js';

// Supersedes tests that asserted source-generated clearance or wrote into historical
// receipt paths. Durable actual acceptance belongs to the release evidence boundary.
describe('CR1 retired certificate compatibility containment', () => {
  it('rejects issuance without touching any database, including concurrent/restarted callers', async () => {
    const query = vi.fn();
    const input = { commitHash: 'a'.repeat(40), releaseTag: "quote'payload", operatorId: 'operator', idempotencyKey: 'same-key' };
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => new Cr1ReleaseCertificateEngine().issueCertificateWithAudit({ query }, input)));
    expect(results.every(result => result.status === 'rejected' && String(result.reason).includes('RELEASE_CERTIFICATION_UNAVAILABLE'))).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
  it('never accepts arbitrary attestation status or sequence as external approval', async () => {
    const engine = new Cr1ReleaseCertificateEngine();
    for (const sequenceNumber of [3, 1, 999]) {
      await expect(engine.applyGateAttestation({ gateId: 'LEGAL-01', status: 'CLEARED', sequenceNumber, attestor: 'claimed-counsel', timestamp: Date.now() })).rejects.toThrow('EXTERNAL_ATTESTATION_UNAVAILABLE');
    }
  });
  it('retains digest comparison only as content integrity, not proof of source authority', () => {
    const engine = new Cr1ReleaseCertificateEngine();
    const hash = engine.computeSha256('original bytes');
    expect(engine.verifyDigestIntegrity({ documentName: 'test', expectedSha256: hash, actualSha256: hash })).toBe(true);
    expect(() => engine.verifyDigestIntegrity({ documentName: 'test', expectedSha256: hash, actualSha256: engine.computeSha256('changed bytes') })).toThrow('TAMPER_DETECTED_HASH_MISMATCH');
    expect(engine.assessment().productionReady).toBe(false);
  });
  it('rejects certificate file writes and leaves all original gate IDs unknown', () => {
    const engine = new Cr1ReleaseCertificateEngine();
    const dir = mkdtempSync(join(tmpdir(), 'encho-certificate-test-'));
    const path = join(dir, 'receipt.json');
    try {
      expect(() => engine.generateReleaseCandidateCertificate({ commitHash: 'a'.repeat(40), releaseTag: 'test', targetPath: path })).toThrow('RELEASE_CERTIFICATION_UNAVAILABLE');
      expect(existsSync(path)).toBe(false);
      const assessment = engine.assessment();
      expect(assessment.independentPackagesAccepted).toBeNull();
      expect(assessment.externalGates.every(gate => gate.status === 'UNKNOWN')).toBe(true);
      expect(assessment.externalGates.map(gate => gate.gateId)).toEqual(expect.arrayContaining(['ENV-01', 'DB-01', 'IAM-01', 'OPS-01', 'PRIV-01', 'LEGAL-01', 'PROV-M-01', 'PROV-G-01', 'COMM-01', 'CANARY-01', 'PILOT-01']));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
