import {z} from 'zod';
import {
  workforceAssuranceLevelSchema,
  workforceEnvironmentSchema,
  workforcePermissionCodeSchema,
  workforceProviderSchema,
  workforceResourceRefSchema,
} from '../../shared/iam/contracts.js';
import {principalContextSchema, type PrincipalContext} from '../../shared/iam/principalContext.js';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({offset: true});
const amountMinorSchema = z.string().regex(/^(0|[1-9]\d{0,18})$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const authorizationTenantContextSchema = z.object({
  kind: z.literal('INTERNAL_ORGANIZATION'),
  organizationId: uuidSchema,
}).strict();
export type AuthorizationTenantContext = Readonly<z.infer<typeof authorizationTenantContextSchema>>;

/**
 * Canonical resource identity resolved by the owning domain service. Ancestors
 * support scoped grants, but their presence alone never grants authority.
 */
export const authorizationResourceContextSchema = z.object({
  target: workforceResourceRefSchema,
  ancestors: z.array(workforceResourceRefSchema).max(12).default([]),
  ownerAccountId: z.number().int().positive().safe().optional(),
  assignmentId: uuidSchema.optional(),
  assignmentVersion: z.number().int().positive().max(2147483647).optional(),
  assignmentFence: z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(value=>BigInt(value)<=9223372036854775807n).optional(),
  revision: z.string().trim().min(1).max(160).optional(),
}).strict().superRefine((value, context) => {
  if ((value.assignmentId!==undefined)!==(value.assignmentVersion!==undefined) || (value.assignmentId!==undefined)!==(value.assignmentFence!==undefined)) {
    context.addIssue({code:'custom',path:['assignmentId'],message:'Assignment identity requires its exact version and fence.'});
  }
  const keys = [value.target, ...value.ancestors].map(resource => `${resource.type}:${resource.id}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: 'custom',
      path: ['ancestors'],
      message: 'A canonical resource path cannot contain duplicate resources.',
    });
  }
});
export type AuthorizationResourceContext = Readonly<z.infer<typeof authorizationResourceContextSchema>>;

/** Bounded conditions that the policy authority must evaluate from fresh data. */
export const authorizationConditionContextSchema = z.object({
  environment: workforceEnvironmentSchema,
  provider: workforceProviderSchema.optional(),
  amountMinor: amountMinorSchema.optional(),
  commandHash: sha256Schema.optional(),
  requestedAt: timestampSchema,
}).strict();
export type AuthorizationConditionContext = Readonly<z.infer<typeof authorizationConditionContextSchema>>;

/**
 * These are references to canonical evidence, not client assertions that a
 * requirement was satisfied. The policy implementation must reload and verify
 * each referenced row, its action hash, expiry, session and consumption state.
 */
export const authorizationEvidenceRefsSchema = z.object({
  stepUpReceiptId: uuidSchema.optional(),
  actionAuthorizationId: uuidSchema.optional(),
}).strict().default({});

export const permissionCheckInputSchema = z.object({
  principal: principalContextSchema,
  tenant: authorizationTenantContextSchema,
  permission: workforcePermissionCodeSchema,
  resource: authorizationResourceContextSchema,
  conditions: authorizationConditionContextSchema,
  evidence: authorizationEvidenceRefsSchema,
}).strict().superRefine((value, context) => {
  if (value.principal.organizationId && value.principal.organizationId !== value.tenant.organizationId) {
    context.addIssue({
      code: 'custom',
      path: ['tenant', 'organizationId'],
      message: 'Principal and authorization tenant do not match.',
    });
  }
});
export type PermissionCheckInput = Readonly<z.infer<typeof permissionCheckInputSchema>>;

export const permissionDenyReasonSchema = z.enum([
  'INVALID_CONTEXT',
  'PRINCIPAL_NOT_ELIGIBLE',
  'NO_ACTIVE_MEMBERSHIP',
  'SESSION_REVOKED',
  'PERMISSION_DENIED',
  'RESOURCE_OUT_OF_SCOPE',
  'CONDITION_FAILED',
  'MAKER_CHECKER_CONFLICT',
  'POLICY_CHANGED',
  'IAM_NOT_READY',
  'POLICY_UNAVAILABLE',
  'POLICY_RESULT_INVALID',
]);
export type PermissionDenyReason = z.infer<typeof permissionDenyReasonSchema>;

export const authorizationRequirementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('STEP_UP'),
    actionHash: sha256Schema,
    requiredAssuranceLevel: workforceAssuranceLevelSchema.exclude(['AAL1']),
  }).strict(),
  z.object({
    kind: z.literal('CHECKER'),
    actionHash: sha256Schema,
    requiredApprovals: z.number().int().min(1).max(4),
    distinctFromMaker: z.literal(true),
    authorizationId: uuidSchema.optional(),
  }).strict(),
]);
export type AuthorizationRequirement = Readonly<z.infer<typeof authorizationRequirementSchema>>;

const evaluatedDecisionSchema = z.object({
  evaluatedAt: timestampSchema,
  decisionId: uuidSchema,
  policySnapshotHash: sha256Schema,
}).strict();

const localDenyDecisionSchema = z.object({
  evaluatedAt: timestampSchema,
  decisionId: uuidSchema.optional(),
  policySnapshotHash: sha256Schema.optional(),
}).strict();

export const permissionCheckResultSchema = z.discriminatedUnion('effect', [
  evaluatedDecisionSchema.extend({
    effect: z.literal('ALLOW'),
    allowed: z.literal(true),
  }).strict(),
  localDenyDecisionSchema.extend({
    effect: z.literal('DENY'),
    allowed: z.literal(false),
    reason: permissionDenyReasonSchema,
  }).strict(),
  evaluatedDecisionSchema.extend({
    effect: z.literal('REQUIREMENTS'),
    allowed: z.literal(false),
    requirements: z.array(authorizationRequirementSchema).min(1).max(2),
  }).strict().superRefine((value, context) => {
    const kinds = value.requirements.map(requirement => requirement.kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: 'Authorization requirements must be unique by kind.',
      });
    }
  }),
]);
export type PermissionCheckResult = Readonly<z.infer<typeof permissionCheckResultSchema>>;

/** Implemented by the SQL-backed P2 policy engine. */
export interface PermissionCheckPort {
  check(input: PermissionCheckInput): Promise<PermissionCheckResult>;
}

export class PermissionNotGrantedError extends Error {
  readonly code: PermissionDenyReason | 'STEP_UP_REQUIRED' | 'CHECKER_REQUIRED';
  readonly status = 403;
  readonly decisionId?: string;
  readonly requirements: readonly AuthorizationRequirement[];

  constructor(result: Exclude<PermissionCheckResult, {effect: 'ALLOW'}>) {
    const requirements = result.effect === 'REQUIREMENTS' ? result.requirements : [];
    const code = result.effect === 'DENY'
      ? result.reason
      : requirements.some(requirement => requirement.kind === 'STEP_UP')
        ? 'STEP_UP_REQUIRED'
        : 'CHECKER_REQUIRED';
    super(code === 'STEP_UP_REQUIRED'
      ? 'Additional identity verification is required for this action.'
      : code === 'CHECKER_REQUIRED'
        ? 'Independent approval is required for this action.'
        : 'This principal is not authorized for the requested action.');
    this.name = 'PermissionNotGrantedError';
    this.code = code;
    this.decisionId = result.decisionId;
    this.requirements = Object.freeze([...requirements]);
  }
}

export type PermissionAuthorizer = Readonly<{
  check(input: unknown): Promise<PermissionCheckResult>;
  requireAllowed(input: unknown): Promise<Extract<PermissionCheckResult, {effect: 'ALLOW'}>>;
}>;

export type PermissionAuthorizerOptions = Readonly<{
  now?: () => Date;
}>;

function localDeny(reason: PermissionDenyReason, now: () => Date): PermissionCheckResult {
  return Object.freeze({
    effect: 'DENY' as const,
    allowed: false as const,
    reason,
    evaluatedAt: now().toISOString(),
  });
}

/**
 * Validates both sides of the policy boundary and fails closed for missing,
 * throwing or malformed policy implementations. It intentionally has no role
 * shortcut: a persisted `users.role = admin` value cannot satisfy this port.
 */
export function createDenyByDefaultPermissionAuthorizer(
  delegate: PermissionCheckPort | undefined,
  options: PermissionAuthorizerOptions = {},
): PermissionAuthorizer {
  const now = options.now ?? (() => new Date());

  const check = async (rawInput: unknown): Promise<PermissionCheckResult> => {
    const parsed = permissionCheckInputSchema.safeParse(rawInput);
    if (!parsed.success) return localDeny('INVALID_CONTEXT', now);

    if (parsed.data.principal.actorKind === 'ACCOUNT') {
      return localDeny('PRINCIPAL_NOT_ELIGIBLE', now);
    }
    if (!delegate) return localDeny('POLICY_UNAVAILABLE', now);

    try {
      const result = permissionCheckResultSchema.safeParse(await delegate.check(parsed.data));
      return result.success
        ? Object.freeze(result.data)
        : localDeny('POLICY_RESULT_INVALID', now);
    } catch {
      return localDeny('POLICY_UNAVAILABLE', now);
    }
  };

  return Object.freeze({
    check,
    async requireAllowed(input: unknown) {
      const result = await check(input);
      if (result.effect !== 'ALLOW') throw new PermissionNotGrantedError(result);
      return result;
    },
  });
}

export type {PrincipalContext};
