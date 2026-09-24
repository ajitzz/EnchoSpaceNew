import {describe, expect, it} from 'vitest';
import {PlatformDomainError, publicApiErrorSchema, toPublicApiError} from '../shared/platform/apiError.js';
import {operationStatusSchema, projectOperationStatus} from '../shared/platform/operationStatus.js';

const context = {correlationId: 'journey:42', operationId: 'operation:17'};
const updatedAt = '2026-09-24T10:00:00Z';
const clock = {now: '2026-09-24T10:01:00Z', staleAfterMs: 300000};

describe('CR1 public error boundary', () => {
  it('returns a safe 500 for arbitrary provider, database, validation and lookalike errors', () => {
    for (const error of [
      new Error('postgres://admin:password@db/production guest@example.com'),
      {code: 'RATE_LIMITED', message: 'access_token=secret', details: {raw: 'private'}},
      {errors: [{value: 'private', stack: 'SQL customer row'}]},
      'Bearer secret', null,
    ]) {
      const response = toPublicApiError(error, context);
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({...context, code: 'INTERNAL_ERROR', details: {}, retryability: 'DO_NOT_RETRY'});
      expect(JSON.stringify(response)).not.toMatch(/password|guest@example|access_token|Bearer|SQL/);
    }
  });

  it('keeps ambiguous writes separate from a safely retryable dependency failure', () => {
    expect(toPublicApiError(new PlatformDomainError('OPERATION_OUTCOME_UNKNOWN'), context).body.retryability)
      .toBe('AFTER_RECONCILIATION');
    expect(toPublicApiError(new PlatformDomainError('DEPENDENCY_UNAVAILABLE', {retryAfterSeconds: 30}), context))
      .toMatchObject({status: 503, body: {retryability: 'AFTER_DELAY', details: {retryAfterSeconds: 30}}});
  });

  it('rejects raw fields, unrestricted text, excessive arrays and mismatched public copy', () => {
    expect(() => new PlatformDomainError('INVALID_REQUEST', JSON.parse('{"providerPayload":"secret"}'))).toThrow();
    expect(() => new PlatformDomainError('INVALID_REQUEST', JSON.parse('{"fieldErrors":[{"field":"guest@example.com","issue":"INVALID"}]}'))).toThrow();
    expect(() => new PlatformDomainError('INVALID_REQUEST', {
      fieldErrors: Array.from({length: 21}, () => ({field: 'body', issue: 'INVALID'} as const)),
    })).toThrow();
    const body = toPublicApiError(new PlatformDomainError('ACCESS_DENIED'), context).body;
    expect(publicApiErrorSchema.safeParse({...body, message: 'Sensitive raw detail'}).success).toBe(false);
    expect(publicApiErrorSchema.safeParse({...body, retryability: 'AFTER_DELAY'}).success).toBe(false);
  });

  it('snapshots valid details and validates diagnostic metadata independently of permission', () => {
    const details = {currentVersion: 3, expectedVersion: 2};
    const error = new PlatformDomainError('VERSION_CONFLICT', details);
    details.currentVersion = 999;
    const response = toPublicApiError(error, context);
    expect(response).toMatchObject({status: 409, body: {...context, details: {currentVersion: 3, expectedVersion: 2}}});
    expect(() => toPublicApiError(error, {...context, correlationId: 'bad\r\nheader'})).toThrow();
  });
});

describe('CR1 truthful asynchronous operation projection', () => {
  it('does not treat claim or submission as completed external work', () => {
    for (const state of ['QUEUED', 'CLAIMED', 'SUBMITTED'] as const) {
      const result = projectOperationStatus({operationId: context.operationId, state, updatedAt}, clock);
      expect(result).toMatchObject({outcome: 'PENDING', isPending: true, observation: null});
      expect(result.tone).not.toBe('SUCCESS');
      expect(result.label).not.toMatch(/live|delivered|paid/i);
    }
  });

  it('requires evidence for observed and reconciled states', () => {
    for (const state of ['OBSERVED', 'RECONCILED'] as const) {
      expect(operationStatusSchema.safeParse({operationId: context.operationId, state, updatedAt}).success).toBe(false);
    }
    expect(operationStatusSchema.safeParse({
      operationId: context.operationId, state: 'QUEUED', updatedAt,
      reconciliation: {outcome: 'SUCCEEDED', resolvedAt: updatedAt},
    }).success).toBe(false);
  });

  it('retains source/freshness separately and never turns old evidence into present delivery', () => {
    const status = {
      operationId: context.operationId, state: 'OBSERVED' as const, updatedAt,
      observation: {source: 'PROVIDER' as const, observedAt: '2026-09-24T09:50:00Z', outcome: 'IN_PROGRESS' as const},
    };
    expect(projectOperationStatus(status, clock)).toMatchObject({
      outcome: 'IN_PROGRESS', isPending: true,
      observation: {source: 'PROVIDER', observedAt: '2026-09-24T09:50:00Z', freshness: 'STALE'},
    });
    expect(projectOperationStatus(status, {...clock, now: '2026-09-24T09:49:00Z'}).observation?.freshness).toBe('CLOCK_SKEW');
  });

  it('requires reconciliation for an unknown write despite an older successful observation', () => {
    expect(projectOperationStatus({
      operationId: context.operationId, state: 'UNKNOWN', updatedAt,
      observation: {source: 'PROVIDER', observedAt: updatedAt, outcome: 'SUCCEEDED'},
    }, clock)).toMatchObject({outcome: 'UNKNOWN', requiresReconciliation: true, isPending: true, tone: 'WARNING'});
  });

  it('does not present unsuccessful reconciliation as success', () => {
    expect(projectOperationStatus({
      operationId: context.operationId, state: 'RECONCILED', updatedAt,
      reconciliation: {resolvedAt: updatedAt, outcome: 'FAILED'},
    }, clock)).toMatchObject({outcome: 'FAILED', isPending: false, tone: 'ERROR'});
  });
});
