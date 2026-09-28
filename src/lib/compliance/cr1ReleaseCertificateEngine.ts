import { createHash } from 'node:crypto';
import { releaseGateIds } from '../release/evidence.js';

/**
 * Compatibility shell for the retired source-generated certification demonstration.
 * It must not persist, accept external attestations or create release authority.
 * Use the separately trusted release evidence boundary for actual evaluation.
 */
export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface CertificateIssuanceInput {
  commitHash: string;
  releaseTag: string;
  operatorId: string;
  idempotencyKey: string;
}

export interface CertificateIssuanceResult {
  certificateId: string;
  commitHash: string;
  releaseTag: string;
  status: 'ISSUED';
  isReplay: boolean;
  timestamp: string;
}

export interface GateAttestationPayload {
  gateId: string;
  status: string;
  sequenceNumber: number;
  attestor: string;
  timestamp: number;
}

export interface GateAttestationResult {
  gateId: string;
  status: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  reason?: string;
}

export interface DigestVerificationInput {
  documentName: string;
  expectedSha256: string;
  actualSha256: string;
}

export interface ExternalGateHandoffToken {
  gateId: string;
  name: string;
  packageTarget: string;
  owner: string;
  status: 'PENDING_EXTERNAL_SIGN_OFF' | 'CLEARED';
  unlockCondition: string;
  failClosedFallback: string;
}

export interface ReleaseCandidateCertificate {
  schemaVersion: string;
  type: string;
  certificateId: string;
  releaseTag: string;
  commitHash: string;
  status: 'CERTIFIED_RELEASE_CANDIDATE';
  certifiedAt: string;
  localPackagesComplete: number;
  totalPackages: number;
  completionPercentage: string;
  verifiedAdversarialEngines: string[];
  operationalTrackReceipts: {
    track1StagingPreflight: string;
    track2TaxClearanceDigest: string;
    track3ProviderCanary: string;
    track4PilotSimulation: string;
  };
  externalGates: ExternalGateHandoffToken[];
  complianceGatesPosture: {
    STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE: 'true';
    POOL_EXECUTION_UNAVAILABLE: 'true';
  };
  verificationChecksum: string;
}

export class Cr1ReleaseCertificateEngine {
  /**
   * Computes SHA-256 fingerprint of a string payload.
   */
  computeSha256(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Verifies that two SHA-256 digests match; throws tamper exception if divergent.
   */
  verifyDigestIntegrity(input: DigestVerificationInput): boolean {
    if (input.expectedSha256 !== input.actualSha256) {
      throw new Error(
        `TAMPER_DETECTED_HASH_MISMATCH: ${input.documentName} checksum verification failed. Expected: ${input.expectedSha256}, Actual: ${input.actualSha256}`
      );
    }
    return true;
  }

  /**
   * Retired: unsigned in-memory sequence numbers never establish approval.
   */
  async applyGateAttestation(payload: GateAttestationPayload): Promise<GateAttestationResult> {
    throw new Error('EXTERNAL_ATTESTATION_UNAVAILABLE: source payloads cannot authenticate an external authority');
  }

  /**
   * Retired: demonstration Map-based idempotency and interpolated SQL are not persisted authority.
   */
  async issueCertificateWithAudit(
    dbClient: DbClientPort,
    input: CertificateIssuanceInput
  ): Promise<CertificateIssuanceResult> {
    throw new Error('RELEASE_CERTIFICATION_UNAVAILABLE: no canonical durable release acceptance service is configured');
  }

  /**
   * Retired: no file is generated or overwritten by this compatibility method.
   */
  generateReleaseCandidateCertificate(options: {
    commitHash: string;
    releaseTag: string;
    targetPath: string;
  }): ReleaseCandidateCertificate {
    throw new Error('RELEASE_CERTIFICATION_UNAVAILABLE: formatter output cannot certify a release');
  }

  assessment() {
    return {
      status: 'BLOCKED' as const,
      independentPackagesAccepted: null,
      productionReady: false,
      externalGates: releaseGateIds.map(gateId => ({ gateId, status: 'UNKNOWN' as const })),
    };
  }
}
