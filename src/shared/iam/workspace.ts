import { z } from 'zod';
import { workforcePermissionCodeSchema,workforceResourceTypeSchema } from './contracts.js';
import { principalTraceIdSchema } from './principalContext.js';

export const operationsDeskIds = ['my-work', 'strategy', 'creative', 'flight', 'provider', 'finance', 'service', 'incident', 'audit', 'workforce'] as const;
export const operationsDeskIdSchema = z.enum(operationsDeskIds);
export type OperationsDeskId = z.infer<typeof operationsDeskIdSchema>;
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const displayText = z.string().trim().min(1).max(240);
const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
export const assignmentActionIds = ['OPEN', 'CLAIM', 'RELEASE', 'HANDOFF'] as const;
export const assignmentActionIdSchema = z.enum(assignmentActionIds);
export type AssignmentActionId = z.infer<typeof assignmentActionIdSchema>;

export const operationsAssignmentSchema = z.object({
  id: uuid,
  deskId: operationsDeskIdSchema,
  title: displayText,
  resourceLabel: displayText,
  resource:z.object({type:workforceResourceTypeSchema,id:z.string().min(1).max(160)}).strict().optional(),
  state: z.enum(['ASSIGNED', 'CLAIMED', 'RELEASED', 'COMPLETED', 'CANCELLED']),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']),
  version: z.number().int().positive().safe(),
  fence: z.string().regex(/^(0|[1-9]\d{0,18})$/),
  assignedAt: timestamp,
  dueAt: timestamp.nullable(),
  leaseExpiresAt: timestamp.nullable(),
  permittedActions: z.array(assignmentActionIdSchema).max(4),
  blockers: z.array(displayText).max(8),
}).strict().superRefine((value, context) => {
  if (!unique(value.permittedActions)) context.addIssue({ code: 'custom', path: ['permittedActions'], message: 'Duplicate assignment action.' });
  if ((value.state === 'CLAIMED') !== (value.leaseExpiresAt !== null)) {
    context.addIssue({ code: 'custom', path: ['leaseExpiresAt'], message: 'Only claimed assignments carry a lease.' });
  }
  if (['RELEASED', 'COMPLETED', 'CANCELLED'].includes(value.state)
    && value.permittedActions.some(action => action !== 'OPEN')) {
    context.addIssue({ code: 'custom', path: ['permittedActions'], message: 'Terminal work cannot expose mutation actions.' });
  }
});
export type OperationsAssignment = z.infer<typeof operationsAssignmentSchema>;

/** Presentation evidence only. Every HTTP command must reload server authority. */
export const operationsWorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: timestamp,
  freshUntil: timestamp,
  correlationId: principalTraceIdSchema,
  organization: z.object({ id: uuid, displayName: displayText }).strict(),
  member: z.object({ membershipId: uuid, displayName: displayText.optional(), state: z.enum(['ACTIVE', 'SUSPENDED', 'OFFBOARDED']) }).strict(),
  session: z.object({id:uuid.optional(), state: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']), expiresAt: timestamp }).strict(),
  desks: z.array(z.object({ id: operationsDeskIdSchema, permittedActions: z.array(workforcePermissionCodeSchema).max(50) }).strict()).max(10),
  work: z.object({ items: z.array(operationsAssignmentSchema).max(100), nextCursor: z.string().min(1).max(512).nullable(), total: z.number().int().nonnegative().safe().nullable() }).strict(),
  audit: z.object({ state: z.enum(['AVAILABLE', 'UNAVAILABLE', 'NOT_PERMITTED']), latestReceiptAt: timestamp.nullable() }).strict(),
  workforce: z.object({ state: z.enum(['ACTIVE', 'REVIEW_REQUIRED', 'RESTRICTED']), explanation: displayText.nullable() }).strict(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.freshUntil) <= Date.parse(value.generatedAt)) context.addIssue({ code: 'custom', path: ['freshUntil'], message: 'Freshness must end after evidence generation.' });
  if (!unique(value.desks.map(desk => desk.id))) context.addIssue({ code: 'custom', path: ['desks'], message: 'Duplicate desk.' });
  if (value.desks.some(desk => !unique(desk.permittedActions))) context.addIssue({ code: 'custom', path: ['desks'], message: 'Duplicate desk action.' });
  if (!unique(value.work.items.map(item => item.id))) context.addIssue({ code: 'custom', path: ['work', 'items'], message: 'Duplicate assignment.' });
  const desks = new Set(value.desks.map(desk => desk.id));
  if (value.work.items.some(item => !desks.has(item.deskId))) context.addIssue({ code: 'custom', path: ['work', 'items'], message: 'Assignment is outside projected desk access.' });
  if (value.work.total !== null && value.work.total < value.work.items.length) context.addIssue({ code: 'custom', path: ['work', 'total'], message: 'Total cannot be smaller than the page.' });
  if (value.audit.state !== 'AVAILABLE' && value.audit.latestReceiptAt !== null) context.addIssue({ code: 'custom', path: ['audit'], message: 'Unavailable audit data cannot expose receipt metadata.' });
});
export type OperationsWorkspace = z.infer<typeof operationsWorkspaceSchema>;

export const assignmentActionRequestSchema = z.object({
  assignmentId: uuid,
  action: assignmentActionIdSchema,
  expectedVersion: z.number().int().positive().safe(),
  expectedFence: z.string().regex(/^(0|[1-9]\d{0,18})$/),
  idempotencyKey: uuid,
}).strict();
export type AssignmentActionRequest = z.infer<typeof assignmentActionRequestSchema>;

export const assignmentActionResponseSchema=z.object({
  status:z.literal('ACCEPTED'),replayed:z.boolean(),
  receipt:z.object({id:uuid,assignmentId:uuid,operation:z.enum(['CLAIM','RELEASE']),
    version:z.number().int().positive(),fence:z.string().regex(/^(0|[1-9]\d{0,18})$/),
    state:z.enum(['CLAIMED','RELEASED']),leaseUntil:timestamp.nullable(),createdAt:timestamp,
    commandHash:z.string().regex(/^[a-f0-9]{64}$/),policySnapshotHash:z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
