import { describe, expect, it } from 'vitest';
import { evidenceDigest, evaluateReleaseEvidence, type EvidenceRequirement, type EvidenceTrustBoundary, type ReleaseEvidence, type VerifiedEvidenceAttestation } from '../../lib/release/evidence.js';

const hash = 'a'.repeat(64);
const now = new Date('2026-09-28T10:00:00.000Z');
const receipt = (): ReleaseEvidence => ({
  schemaVersion: 1, evidenceId: 'unit-receipt', packageId: 'R0-02', runId: 'isolated-run', producer: 'implementation-agent', findingIds: ['A01'],
  recordedAt: '2026-09-28T09:59:00.000Z', expiresAt: '2026-09-28T11:00:00.000Z',
  classification: 'LOCAL_OBSERVATION', kind: 'UNIT', provenanceRef: 'configured-collector/reference',
  subject: { commit: 'a'.repeat(40), sourceTree: hash, worktreeDiff: hash, artifactManifest: hash, migrationManifest: hash, lockfile: hash, configuration: hash, environment: 'LOCAL', environmentId: 'disposable-local', provider: null, accountRef: null },
  collection: { method: 'isolated-node-test', toolVersion: 'node24', startedAt: '2026-09-28T09:58:00.000Z', finishedAt: '2026-09-28T09:59:00.000Z', databaseContacted: false, providerContacted: false },
  privacy: { classification: 'REDACTED', retentionPolicyRef: 'test-policy', accessPolicyRef: 'local-reviewers' },
  artifacts: [{ ref: 'restricted-log', sha256: hash }],
  commands: [{ command: 'node24 scripts/testing/run.mjs specific.test.ts', exitCode: 0, failed: 0, skippedRequired: 0 }],
  predicates: [{ id: 'fixture-denied', result: 'PASS' }], dependencies: [],
});
const requirement = (value = receipt()): EvidenceRequirement => ({
  subject: value.subject, level: 'LOCAL', predicateIds: ['fixture-denied'], kinds: ['UNIT'], protectedChange: true,
  maxAgeMs: 300000, now, dependencies: new Map(), requiredDependencyIds: [],
});
const attestation = (value: ReleaseEvidence): VerifiedEvidenceAttestation => ({
  receiptDigest: evidenceDigest(value), producer: value.producer, reviewer: 'independent-reviewer',
  observedAt: '2026-09-28T10:00:00.000Z', validUntil: '2026-09-28T10:05:00.000Z',
  environment: value.subject.environment, environmentId: value.subject.environmentId, authority: 'LOCAL_REVIEW', disposition: 'ACCEPTED',
  predicateIds: ['fixture-denied'], artifactDigests: [hash],
});
// Explicit local test double: this is NOT a configured production trust implementation.
const trust = (value: ReleaseEvidence, mutate?: (proof: VerifiedEvidenceAttestation) => void): EvidenceTrustBoundary => ({ verify: async () => { const proof = attestation(value); mutate?.(proof); return proof; } });

describe('R0-04 strict evidence validation foundation (isolated fixtures)', () => {
  it('accepts scoped local evidence only at its local level through an independent test trust boundary', async () => {
    const value = receipt();
    expect(await evaluateReleaseEvidence(value, requirement(), trust(value))).toMatchObject({ accepted: true, level: 'LOCAL', reasons: [] });
  });
  it('has no default authority and rejects arbitrary authenticated:true fields', async () => {
    expect(await evaluateReleaseEvidence(receipt(), requirement())).toMatchObject({ accepted: false, reasons: ['TRUSTED_COLLECTOR_UNAVAILABLE'] });
    expect((await evaluateReleaseEvidence({ ...receipt(), authenticated: true }, requirement())).reasons).toContain('EVIDENCE_SCHEMA_INVALID');
  });
  it.each([
    ['fixture', (value: ReleaseEvidence) => { value.classification = 'FIXTURE'; }, 'FIXTURE_CANNOT_SATISFY_GATE'],
    ['failed command', (value: ReleaseEvidence) => { value.commands[0].exitCode = 1; }, 'REQUIRED_COMMAND_NOT_PASSING'],
    ['failed assertion', (value: ReleaseEvidence) => { value.commands[0].failed = 1; }, 'REQUIRED_COMMAND_NOT_PASSING'],
    ['skipped test', (value: ReleaseEvidence) => { value.commands[0].skippedRequired = 1; }, 'REQUIRED_COMMAND_NOT_PASSING'],
    ['unknown predicate', (value: ReleaseEvidence) => { value.predicates[0].result = 'UNKNOWN'; }, 'REQUIRED_PREDICATE_NOT_PASSING'],
    ['stale', (value: ReleaseEvidence) => { value.recordedAt = '2026-09-27T09:59:00.000Z'; }, 'EVIDENCE_STALE_OR_FUTURE'],
    ['future', (value: ReleaseEvidence) => { value.recordedAt = '2026-09-29T09:59:00.000Z'; }, 'EVIDENCE_STALE_OR_FUTURE'],
    ['expired', (value: ReleaseEvidence) => { value.expiresAt = '2026-09-28T09:59:30.000Z'; }, 'EVIDENCE_STALE_OR_FUTURE'],
    ['artifact', (value: ReleaseEvidence) => { value.subject.artifactManifest = 'b'.repeat(64); }, 'EVIDENCE_SUBJECT_MISMATCH'],
    ['migration', (value: ReleaseEvidence) => { value.subject.migrationManifest = 'b'.repeat(64); }, 'EVIDENCE_SUBJECT_MISMATCH'],
    ['environment', (value: ReleaseEvidence) => { value.subject.environmentId = 'another-deployment'; }, 'EVIDENCE_SUBJECT_MISMATCH'],
    ['provider', (value: ReleaseEvidence) => { value.subject.provider = 'GOOGLE'; }, 'EVIDENCE_SUBJECT_MISMATCH'],
    ['account', (value: ReleaseEvidence) => { value.subject.accountRef = 'different-account'; }, 'EVIDENCE_SUBJECT_MISMATCH'],
    ['duplicate predicate', (value: ReleaseEvidence) => { value.predicates.push(value.predicates[0]); }, 'DUPLICATE_PREDICATE'],
    ['missing command', (value: ReleaseEvidence) => { value.commands = []; }, 'COMMAND_EVIDENCE_REQUIRED'],
    ['duplicate artifact', (value: ReleaseEvidence) => { value.artifacts.push(value.artifacts[0]); }, 'DUPLICATE_ARTIFACT'],
    ['unknown dependency', (value: ReleaseEvidence) => { value.dependencies.push({ evidenceId: 'absent', digest: hash }); }, 'DEPENDENCY_NOT_ACCEPTED'],
  ] as const)('rejects %s without consulting an authority to manufacture success', async (_label, mutate, reason) => {
    const value = receipt(); mutate(value);
    expect((await evaluateReleaseEvidence(value, requirement(), trust(value))).reasons).toContain(reason);
  });
  it.each([
    ['tampered bytes', (proof: VerifiedEvidenceAttestation) => { proof.receiptDigest = 'b'.repeat(64); }, 'PROVENANCE_CONTENT_MISMATCH'],
    ['same author', (proof: VerifiedEvidenceAttestation) => { proof.reviewer = 'implementation-agent'; }, 'INDEPENDENT_REVIEW_REQUIRED'],
    ['revoked', (proof: VerifiedEvidenceAttestation) => { proof.disposition = 'REVOKED'; }, 'PROVENANCE_NOT_ACCEPTED'],
    ['wrong environment', (proof: VerifiedEvidenceAttestation) => { proof.environmentId = 'production'; }, 'PROVENANCE_ENVIRONMENT_MISMATCH'],
    ['uncovered artifacts', (proof: VerifiedEvidenceAttestation) => { proof.artifactDigests = ['b'.repeat(64)]; }, 'ARTIFACT_NOT_AUTHENTICATED'],
    ['uncovered scope', (proof: VerifiedEvidenceAttestation) => { proof.predicateIds = ['unrelated']; }, 'PROVENANCE_SCOPE_INCOMPLETE'],
    ['expired proof', (proof: VerifiedEvidenceAttestation) => { proof.validUntil = '2026-09-28T09:59:59.000Z'; }, 'PROVENANCE_STALE_OR_FUTURE'],
  ] as const)('rejects %s provenance', async (_label, mutate, reason) => {
    const value = receipt();
    expect((await evaluateReleaseEvidence(value, requirement(), trust(value, mutate))).reasons).toContain(reason);
  });
  it('rejects missing independent proof and verifier failure', async () => {
    expect((await evaluateReleaseEvidence(receipt(), requirement(), { verify: async () => null })).reasons).toContain('PROVENANCE_NOT_AUTHENTICATED');
    expect((await evaluateReleaseEvidence(receipt(), requirement(), { verify: async () => { throw new Error('external credentials must never be emitted'); } })).reasons).toEqual(['PROVENANCE_VERIFICATION_FAILED']);
  });
  it('cannot omit required dependencies or substitute a changed dependency digest', async () => {
    const value = receipt(); const policy = requirement(); policy.requiredDependencyIds = ['build'];
    expect((await evaluateReleaseEvidence(value, policy, trust(value))).reasons).toContain('REQUIRED_DEPENDENCY_MISSING');
    value.dependencies = [{ evidenceId: 'build', digest: hash }]; policy.dependencies = new Map([['build', { digest: 'b'.repeat(64), accepted: true, level: 'LOCAL' }]]);
    expect((await evaluateReleaseEvidence(value, policy, trust(value))).reasons).toContain('DEPENDENCY_NOT_ACCEPTED');
  });
  it('requires external authority independently of an external-looking receipt', async () => {
    const value = receipt(); value.classification = 'EXTERNAL_OBSERVATION'; value.kind = 'PROFESSIONAL_APPROVAL'; value.subject.environment = 'PRODUCTION';
    const policy = { ...requirement(value), level: 'EXTERNAL' as const, kinds: ['PROFESSIONAL_APPROVAL' as const] };
    expect((await evaluateReleaseEvidence(value, policy, trust(value))).reasons).toContain('PROVENANCE_AUTHORITY_INSUFFICIENT');
    // Even an 18-character attestation identifier is just unverified content.
    value.provenanceRef = '123456789012345678';
    expect((await evaluateReleaseEvidence(value, policy)).reasons).toContain('TRUSTED_COLLECTOR_UNAVAILABLE');
  });
  it('requires real-collection and exact provider/account predicates before external review', async () => {
    const value = receipt(); value.classification = 'EXTERNAL_OBSERVATION'; value.kind = 'PROVIDER'; value.subject.environment = 'STAGING';
    const policy = { ...requirement(value), level: 'EXTERNAL' as const, kinds: ['PROVIDER' as const] };
    const independentTestVerifier = trust(value, proof => { proof.authority = 'EXTERNAL_COLLECTOR'; });
    expect((await evaluateReleaseEvidence(value, policy, independentTestVerifier)).reasons).toEqual(expect.arrayContaining(['PROVIDER_SUBJECT_REQUIRED', 'PROVIDER_OBSERVATION_REQUIRED']));
    value.subject.provider = 'META'; value.subject.accountRef = 'approved-test-account'; value.collection.providerContacted = true;
    // This proves the validator contract only; no external collector or account was actually used.
    expect((await evaluateReleaseEvidence(value, policy, independentTestVerifier)).accepted).toBe(true);
  });
});
