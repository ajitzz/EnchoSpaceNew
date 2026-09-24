import {z} from 'zod';
import {diagnosticIdSchema} from './apiError.js';

/** Command evidence vocabulary, not a replacement for domain workflow states. */
export const operationStateSchema = z.enum([
  'QUEUED', 'CLAIMED', 'SUBMITTED', 'OBSERVED', 'FAILED', 'UNKNOWN', 'RECONCILED',
]);
export type OperationState = z.infer<typeof operationStateSchema>;

const outcomeSchema = z.enum(['SUCCEEDED', 'FAILED', 'IN_PROGRESS']);
const observationSchema = z.object({
  source: z.enum(['FIRST_PARTY', 'PROVIDER']),
  observedAt: z.iso.datetime({offset: true}),
  outcome: outcomeSchema,
}).strict();
const reconciliationSchema = z.object({
  resolvedAt: z.iso.datetime({offset: true}),
  outcome: z.enum(['SUCCEEDED', 'FAILED']),
}).strict();

export const operationStatusSchema = z.object({
  operationId: diagnosticIdSchema,
  state: operationStateSchema,
  updatedAt: z.iso.datetime({offset: true}),
  observation: observationSchema.optional(),
  reconciliation: reconciliationSchema.optional(),
}).strict().superRefine((status, context) => {
  if (status.state === 'OBSERVED' && !status.observation) {
    context.addIssue({code: 'custom', path: ['observation'], message: 'Observed state requires observation evidence.'});
  }
  if (status.state === 'RECONCILED' && !status.reconciliation) {
    context.addIssue({code: 'custom', path: ['reconciliation'], message: 'Reconciled state requires a resolved outcome.'});
  }
  if (status.state !== 'RECONCILED' && status.reconciliation) {
    context.addIssue({code: 'custom', path: ['reconciliation'], message: 'Reconciliation evidence requires reconciled state.'});
  }
  if (status.observation && Date.parse(status.observation.observedAt) > Date.parse(status.updatedAt)) {
    context.addIssue({code: 'custom', path: ['observation'], message: 'Observation cannot postdate this status revision.'});
  }
  if (status.reconciliation && Date.parse(status.reconciliation.resolvedAt) > Date.parse(status.updatedAt)) {
    context.addIssue({code: 'custom', path: ['reconciliation'], message: 'Resolution cannot postdate this status revision.'});
  }
});
export type OperationStatus = z.infer<typeof operationStatusSchema>;

export type OperationStatusProjection = Readonly<{
  operationId: string;
  state: OperationState;
  label: string;
  tone: 'NEUTRAL' | 'PROGRESS' | 'SUCCESS' | 'WARNING' | 'ERROR';
  outcome: 'PENDING' | 'UNKNOWN' | z.infer<typeof outcomeSchema>;
  isPending: boolean;
  requiresReconciliation: boolean;
  observation: Readonly<{
    source: 'FIRST_PARTY' | 'PROVIDER';
    observedAt: string;
    freshness: 'FRESH' | 'STALE' | 'CLOCK_SKEW';
  }> | null;
}>;

/**
 * Success applies to this command only, never to campaign delivery, payment
 * settlement, message receipt or other business facts without their evidence.
 * Freshness is supplied by the consuming domain, not invented by this helper.
 */
export function projectOperationStatus(
  input: OperationStatus,
  freshness: {now: string; staleAfterMs: number},
): OperationStatusProjection {
  const status = operationStatusSchema.parse(input);
  const clock = z.object({
    now: z.iso.datetime({offset: true}),
    staleAfterMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict().parse(freshness);
  let outcome: OperationStatusProjection['outcome'] = 'PENDING';
  let label = 'Waiting to be processed';
  let tone: OperationStatusProjection['tone'] = 'NEUTRAL';

  switch (status.state) {
    case 'CLAIMED': label = 'Processing'; tone = 'PROGRESS'; break;
    case 'SUBMITTED': label = 'Submitted; awaiting confirmation'; tone = 'PROGRESS'; break;
    case 'UNKNOWN': outcome = 'UNKNOWN'; label = 'Outcome being checked'; tone = 'WARNING'; break;
    case 'FAILED': outcome = 'FAILED'; label = 'Operation failed'; tone = 'ERROR'; break;
    case 'OBSERVED': {
      outcome = status.observation!.outcome;
      label = outcome === 'SUCCEEDED' ? 'Operation confirmed' : outcome === 'FAILED' ? 'Failure confirmed' : 'Processing confirmed';
      tone = outcome === 'SUCCEEDED' ? 'SUCCESS' : outcome === 'FAILED' ? 'ERROR' : 'PROGRESS';
      break;
    }
    case 'RECONCILED': {
      outcome = status.reconciliation!.outcome;
      label = outcome === 'SUCCEEDED' ? 'Resolved; operation succeeded' : 'Resolved; operation failed';
      tone = outcome === 'SUCCEEDED' ? 'SUCCESS' : 'ERROR';
      break;
    }
  }

  const age = status.observation
    ? Date.parse(clock.now) - Date.parse(status.observation.observedAt)
    : null;
  return {
    operationId: status.operationId,
    state: status.state,
    label,
    tone,
    outcome,
    isPending: outcome === 'PENDING' || outcome === 'IN_PROGRESS' || outcome === 'UNKNOWN',
    requiresReconciliation: status.state === 'UNKNOWN',
    observation: status.observation ? {
      source: status.observation.source,
      observedAt: status.observation.observedAt,
      freshness: age! < 0 ? 'CLOCK_SKEW' : age! >= clock.staleAfterMs ? 'STALE' : 'FRESH',
    } : null,
  };
}
