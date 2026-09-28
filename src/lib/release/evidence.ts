import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
export const releaseGateIds = ['ENV-01', 'DB-01', 'LEGAL-01', 'PROV-M-01', 'PROV-G-01', 'COMM-01', 'IAM-01', 'OPS-01', 'PRIV-01', 'CANARY-01', 'PILOT-01'] as const;

export const evidenceSubjectSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/), sourceTree: digest, worktreeDiff: digest,
  artifactManifest: digest, migrationManifest: digest, lockfile: digest, configuration: digest,
  environment: z.enum(['LOCAL', 'STAGING', 'PRODUCTION']), environmentId: identity,
  provider: z.enum(['META', 'GOOGLE']).nullable(), accountRef: identity.nullable(),
}).strict();

export const releaseEvidenceSchema = z.object({
  schemaVersion: z.literal(1), evidenceId: identity, packageId: z.string().regex(/^R[0-7]-0[1-4]$/),
  runId: identity, producer: identity, recordedAt: timestamp, expiresAt: timestamp,
  findingIds: z.array(z.string().regex(/^A(?:0[1-9]|1[0-5])$/)).max(15),
  classification: z.enum(['FIXTURE', 'LOCAL_OBSERVATION', 'EXTERNAL_OBSERVATION']),
  kind: z.enum(['UNIT', 'DATABASE', 'BROWSER', 'BUILD', 'DEPLOYMENT', 'PROVIDER', 'PROFESSIONAL_APPROVAL', 'PILOT']),
  subject: evidenceSubjectSchema,
  // This identifier locates an independent attestation. It is not an authenticated:true assertion.
  provenanceRef: identity,
  collection: z.object({ method: identity, toolVersion: identity, startedAt: timestamp, finishedAt: timestamp, databaseContacted: z.boolean(), providerContacted: z.boolean() }).strict(),
  privacy: z.object({ classification: z.enum(['REDACTED', 'RESTRICTED']), retentionPolicyRef: identity, accessPolicyRef: identity }).strict(),
  artifacts: z.array(z.object({ ref: identity, sha256: digest }).strict()).min(1).max(100),
  commands: z.array(z.object({ command: identity, exitCode: z.number().int(), failed: z.number().int().nonnegative(), skippedRequired: z.number().int().nonnegative() }).strict()).max(100),
  predicates: z.array(z.object({ id: identity, result: z.enum(['PASS', 'FAIL', 'UNKNOWN', 'NOT_RUN']) }).strict()).min(1).max(200),
  dependencies: z.array(z.object({ evidenceId: identity, digest }).strict()).max(100),
}).strict();

export type ReleaseEvidence = z.infer<typeof releaseEvidenceSchema>;
export type EvidenceSubject = z.infer<typeof evidenceSubjectSchema>;

/** Stable representation used only for content binding; hashing never authenticates an author. */
export function evidenceDigest(value: unknown): string {
  const canonical = (input: unknown): string => {
    if (input === null || typeof input !== 'object') {
      const encoded = JSON.stringify(input);
      if (encoded === undefined) throw new Error('EVIDENCE_NOT_JSON');
      return encoded;
    }
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
    const record = input as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  };
  return createHash('sha256').update(canonical(value)).digest('hex');
}

const attestationSchema = z.object({
  receiptDigest: digest, producer: identity, reviewer: identity, observedAt: timestamp, validUntil: timestamp,
  environment: z.enum(['LOCAL', 'STAGING', 'PRODUCTION']), environmentId: identity,
  authority: z.enum(['LOCAL_REVIEW', 'EXTERNAL_COLLECTOR']),
  disposition: z.enum(['ACCEPTED', 'REJECTED', 'REVOKED']),
  predicateIds: z.array(identity).min(1), artifactDigests: z.array(digest).min(1),
}).strict();
export type VerifiedEvidenceAttestation = z.infer<typeof attestationSchema>;

/**
 * Injected by the release operator, never selected by a receipt or HTTP caller.
 * Implementation must verify independent workload/reviewer provenance and fetch
 * artifact bytes to verify digests. No production implementation is configured yet.
 */
export interface EvidenceTrustBoundary {
  verify(provenanceRef: string, receiptDigest: string): Promise<VerifiedEvidenceAttestation | null>;
}

export interface EvidenceRequirement {
  subject: EvidenceSubject;
  level: 'LOCAL' | 'EXTERNAL';
  predicateIds: readonly string[];
  kinds: readonly ReleaseEvidence['kind'][];
  protectedChange: boolean;
  maxAgeMs: number;
  now: Date;
  requiredDependencyIds: readonly string[];
  dependencies: ReadonlyMap<string, { digest: string; accepted: boolean; level: 'LOCAL' | 'EXTERNAL' }>;
}

export type EvidenceEvaluation = { accepted: boolean; level: 'LOCAL' | 'EXTERNAL'; reasons: string[]; evidenceId?: string; digest?: string };

export async function evaluateReleaseEvidence(raw: unknown, requirement: EvidenceRequirement, trust?: EvidenceTrustBoundary): Promise<EvidenceEvaluation> {
  const parsed = releaseEvidenceSchema.safeParse(raw);
  const reject = (...reasons: string[]): EvidenceEvaluation => ({ accepted: false, level: requirement.level, reasons });
  if (!parsed.success) return reject('EVIDENCE_SCHEMA_INVALID');
  const receipt = parsed.data;
  const reasons: string[] = [];
  const now = requirement.now.getTime();
  const recordedAt = Date.parse(receipt.recordedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  const startedAt = Date.parse(receipt.collection.startedAt);
  const finishedAt = Date.parse(receipt.collection.finishedAt);
  if (!Number.isFinite(now) || !Number.isFinite(requirement.maxAgeMs) || requirement.maxAgeMs <= 0) reasons.push('EVIDENCE_POLICY_INVALID');
  if (!requirement.predicateIds.length || !requirement.kinds.length) reasons.push('EVIDENCE_POLICY_INCOMPLETE');
  if (receipt.classification === 'FIXTURE') reasons.push('FIXTURE_CANNOT_SATISFY_GATE');
  if (requirement.level === 'EXTERNAL' && receipt.classification !== 'EXTERNAL_OBSERVATION') reasons.push('EXTERNAL_OBSERVATION_REQUIRED');
  if (receipt.classification === 'LOCAL_OBSERVATION' && receipt.subject.environment !== 'LOCAL') reasons.push('EVIDENCE_ENVIRONMENT_ESCALATION');
  if (evidenceDigest(receipt.subject) !== evidenceDigest(requirement.subject)) reasons.push('EVIDENCE_SUBJECT_MISMATCH');
  if (recordedAt > now || expiresAt <= now || expiresAt <= recordedAt || now - recordedAt > requirement.maxAgeMs) reasons.push('EVIDENCE_STALE_OR_FUTURE');
  if (startedAt > finishedAt || finishedAt > recordedAt || now - finishedAt > requirement.maxAgeMs) reasons.push('COLLECTION_WINDOW_INVALID');
  if (!requirement.kinds.includes(receipt.kind)) reasons.push('EVIDENCE_KIND_MISMATCH');
  if (receipt.kind === 'PROVIDER' && (!receipt.subject.provider || !receipt.subject.accountRef)) reasons.push('PROVIDER_SUBJECT_REQUIRED');
  if (receipt.kind === 'PROVIDER' && !receipt.collection.providerContacted) reasons.push('PROVIDER_OBSERVATION_REQUIRED');
  if (receipt.kind === 'DATABASE' && !receipt.collection.databaseContacted) reasons.push('DATABASE_OBSERVATION_REQUIRED');
  if (['UNIT', 'DATABASE', 'BROWSER', 'BUILD', 'DEPLOYMENT'].includes(receipt.kind) && !receipt.commands.length) reasons.push('COMMAND_EVIDENCE_REQUIRED');
  if (new Set(receipt.artifacts.map(artifact => artifact.ref)).size !== receipt.artifacts.length) reasons.push('DUPLICATE_ARTIFACT');
  if (receipt.commands.some(command => command.exitCode !== 0 || command.failed !== 0 || command.skippedRequired !== 0)) reasons.push('REQUIRED_COMMAND_NOT_PASSING');
  if (new Set(receipt.predicates.map(predicate => predicate.id)).size !== receipt.predicates.length) reasons.push('DUPLICATE_PREDICATE');
  if (receipt.predicates.some(predicate => predicate.result !== 'PASS')) reasons.push('OBSERVED_PREDICATE_NOT_PASSING');
  for (const predicateId of requirement.predicateIds) {
    if (!receipt.predicates.some(predicate => predicate.id === predicateId && predicate.result === 'PASS')) reasons.push('REQUIRED_PREDICATE_NOT_PASSING');
  }
  if (new Set(receipt.dependencies.map(dependency => dependency.evidenceId)).size !== receipt.dependencies.length) reasons.push('DUPLICATE_DEPENDENCY');
  if (requirement.requiredDependencyIds.some(id => !receipt.dependencies.some(dependency => dependency.evidenceId === id))) reasons.push('REQUIRED_DEPENDENCY_MISSING');
  for (const dependency of receipt.dependencies) {
    if (dependency.evidenceId === receipt.evidenceId) reasons.push('SELF_DEPENDENCY_FORBIDDEN');
    const accepted = requirement.dependencies.get(dependency.evidenceId);
    if (!accepted?.accepted || accepted.digest !== dependency.digest || (requirement.level === 'EXTERNAL' && accepted.level !== 'EXTERNAL')) reasons.push('DEPENDENCY_NOT_ACCEPTED');
  }
  const hash = evidenceDigest(receipt);
  if (!trust) return { ...reject(...reasons, 'TRUSTED_COLLECTOR_UNAVAILABLE'), evidenceId: receipt.evidenceId, digest: hash };
  if (reasons.length) return { ...reject(...new Set(reasons)), evidenceId: receipt.evidenceId, digest: hash };
  let attestation: VerifiedEvidenceAttestation | null;
  try { attestation = await trust.verify(receipt.provenanceRef, hash); }
  catch { return { ...reject('PROVENANCE_VERIFICATION_FAILED'), evidenceId: receipt.evidenceId, digest: hash }; }
  const verified = attestationSchema.safeParse(attestation);
  if (!verified.success) return { ...reject('PROVENANCE_NOT_AUTHENTICATED'), evidenceId: receipt.evidenceId, digest: hash };
  const provenance = verified.data;
  if (provenance.receiptDigest !== hash || provenance.producer !== receipt.producer) reasons.push('PROVENANCE_CONTENT_MISMATCH');
  if (provenance.environment !== receipt.subject.environment || provenance.environmentId !== receipt.subject.environmentId) reasons.push('PROVENANCE_ENVIRONMENT_MISMATCH');
  if (requirement.level === 'EXTERNAL' && provenance.authority !== 'EXTERNAL_COLLECTOR') reasons.push('PROVENANCE_AUTHORITY_INSUFFICIENT');
  if (provenance.disposition !== 'ACCEPTED') reasons.push('PROVENANCE_NOT_ACCEPTED');
  if (Date.parse(provenance.observedAt) > now || Date.parse(provenance.validUntil) <= now || Date.parse(provenance.observedAt) < recordedAt) reasons.push('PROVENANCE_STALE_OR_FUTURE');
  if (requirement.protectedChange && provenance.reviewer === receipt.producer) reasons.push('INDEPENDENT_REVIEW_REQUIRED');
  if (requirement.predicateIds.some(id => !provenance.predicateIds.includes(id))) reasons.push('PROVENANCE_SCOPE_INCOMPLETE');
  if (receipt.artifacts.some(artifact => !provenance.artifactDigests.includes(artifact.sha256))) reasons.push('ARTIFACT_NOT_AUTHENTICATED');
  return { accepted: reasons.length === 0, level: requirement.level, reasons: [...new Set(reasons)], evidenceId: receipt.evidenceId, digest: hash };
}
