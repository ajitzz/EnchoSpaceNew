import { z } from 'zod';

/**
 * Stable capability identifiers shared by the API, policy engine and clients.
 * PostgreSQL remains authoritative for risk, step-up and checker policy. A
 * readiness check must reject catalog drift between these identifiers and the
 * seeded database catalog before staff routes are enabled.
 */
export const workforcePermissionCodes = [
  'workforce.member.read',
  'workforce.invite',
  'workforce.grant',
  'workforce.suspend',
  'workforce.access_review',
  'work.assignment.read',
  'work.assignment.claim',
  'work.assignment.reassign',
  'listing.review',
  'listing.publish',
  'strategy.read',
  'strategy.draft',
  'strategy.publish',
  'strategy.rollback',
  'corridor.read',
  'corridor.draft',
  'corridor.publish',
  'creative.read',
  'creative.review',
  'campaign.read',
  'campaign.prepare',
  'campaign.approve',
  'provider.read',
  'provider.create_paused',
  'provider.readback',
  'provider.activate',
  'provider.pause',
  'provider.resume',
  'provider.recover',
  'finance.read',
  'finance.review',
  'finance.refund',
  'finance.settle',
  'service.read',
  'service.respond',
  'service.assign',
  'service.note',
  'audit.read',
  'incident.read',
  'incident.declare',
  'incident.pause_global',
  'incident.recover',
] as const;

export const workforcePermissionCodeSchema = z.enum(workforcePermissionCodes);
export type WorkforcePermissionCode = z.infer<typeof workforcePermissionCodeSchema>;

export const workforceResourceTypes = [
  'ORGANIZATION',
  'WORKFORCE',
  'HOST_ACCOUNT',
  'PROPERTY',
  'LISTING',
  'OFFER',
  'CAMPAIGN',
  'CREATIVE_PACKAGE',
  'STRATEGY',
  'CORRIDOR',
  'PROVIDER_ACCOUNT',
  'FINANCIAL_CONTRACT',
  'SETTLEMENT',
  'CONVERSATION',
  'SERVICE_CASE',
  'INCIDENT',
] as const;

export const workforceResourceTypeSchema = z.enum(workforceResourceTypes);
export type WorkforceResourceType = z.infer<typeof workforceResourceTypeSchema>;

export const workforceResourceRefSchema = z.object({
  type: workforceResourceTypeSchema,
  id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/),
}).strict();
export type WorkforceResourceRef = z.infer<typeof workforceResourceRefSchema>;

export const workforceEnvironmentSchema = z.enum(['LOCAL', 'STAGING', 'PRODUCTION']);
export const workforceProviderSchema = z.enum(['META', 'GOOGLE']);
export const workforceAssuranceLevelSchema = z.enum(['AAL1', 'AAL2', 'PHISHING_RESISTANT']);

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const amountMinor = z.string().regex(/^(0|[1-9]\d{0,18})$/);
const reason = z.string().trim().min(10).max(2000);

export const workforceRoleGrantInputSchema = z.object({
  roleKey: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/),
  scope: workforceResourceRefSchema,
  provider: workforceProviderSchema.optional(),
  environment: workforceEnvironmentSchema.default('PRODUCTION'),
  maxAmountMinor: amountMinor.optional(),
  validUntil: dateTime.optional(),
}).strict();

export const inviteWorkforceMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  grants: z.array(workforceRoleGrantInputSchema).min(1).max(20),
  reason,
}).strict().superRefine((value, context) => {
  const keys = value.grants.map(grant => JSON.stringify([
    grant.roleKey,
    grant.scope.type,
    grant.scope.id,
    grant.provider ?? null,
    grant.environment,
  ]));
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['grants'], message: 'Duplicate workforce grant.' });
  }
});
export type InviteWorkforceMember = z.infer<typeof inviteWorkforceMemberSchema>;

export const workforcePrincipalSchema = z.object({
  accountId: z.number().int().positive().safe(),
  actorKind: z.enum(['ACCOUNT', 'STAFF', 'SERVICE']),
  organizationId: uuid.optional(),
  membershipId: uuid.optional(),
  sessionId: uuid.optional(),
  assuranceLevel: workforceAssuranceLevelSchema,
  authenticatedAt: dateTime,
}).strict().superRefine((value, context) => {
  if (value.actorKind === 'STAFF' && (!value.organizationId || !value.membershipId || !value.sessionId)) {
    context.addIssue({ code: 'custom', path: ['membershipId'], message: 'Staff principals require organization, membership and session identity.' });
  }
  if (value.actorKind !== 'STAFF' && (value.membershipId || value.sessionId)) {
    context.addIssue({ code: 'custom', path: ['actorKind'], message: 'Only staff principals may carry workforce membership or session identity.' });
  }
});
export type WorkforcePrincipal = z.infer<typeof workforcePrincipalSchema>;

export const workforcePolicyInputSchema = z.object({
  permission: workforcePermissionCodeSchema,
  resource: workforceResourceRefSchema,
  provider: workforceProviderSchema.optional(),
  environment: workforceEnvironmentSchema,
  amountMinor: amountMinor.optional(),
  commandHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export type WorkforcePolicyInput = z.infer<typeof workforcePolicyInputSchema>;

export const privilegedActionRequestSchema = z.object({
  permission: workforcePermissionCodeSchema,
  resource: workforceResourceRefSchema,
  commandHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason,
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();
export type PrivilegedActionRequest = z.infer<typeof privilegedActionRequestSchema>;

export const stepUpReceiptSchema = z.object({
  challengeId: uuid,
  membershipId: uuid,
  sessionId: uuid,
  actionHash: z.string().regex(/^[a-f0-9]{64}$/),
  assuranceLevel: workforceAssuranceLevelSchema,
  verifiedAt: dateTime,
  expiresAt: dateTime,
  consumedAt: dateTime.nullable(),
}).strict().superRefine((value, context) => {
  const verified = Date.parse(value.verifiedAt);
  const expires = Date.parse(value.expiresAt);
  if (expires <= verified) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Step-up receipt must expire after verification.' });
  }
  if (value.consumedAt && Date.parse(value.consumedAt) < verified) {
    context.addIssue({ code: 'custom', path: ['consumedAt'], message: 'Step-up receipt cannot be consumed before verification.' });
  }
});
export type StepUpReceipt = z.infer<typeof stepUpReceiptSchema>;

export const workforceAuthorizationDecisionSchema = z.object({
  decisionId: uuid,
  allowed: z.boolean(),
  code: z.enum([
    'ALLOWED',
    'NO_ACTIVE_MEMBERSHIP',
    'SESSION_REVOKED',
    'PERMISSION_DENIED',
    'RESOURCE_OUT_OF_SCOPE',
    'CONDITION_FAILED',
    'STEP_UP_REQUIRED',
    'CHECKER_REQUIRED',
    'MAKER_CHECKER_CONFLICT',
    'POLICY_CHANGED',
  ]),
  policySnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  evaluatedAt: dateTime,
}).strict().superRefine((value, context) => {
  if (value.allowed !== (value.code === 'ALLOWED')) {
    context.addIssue({ code: 'custom', path: ['code'], message: 'Authorization code and allowed decision disagree.' });
  }
});
export type WorkforceAuthorizationDecision = z.infer<typeof workforceAuthorizationDecisionSchema>;

