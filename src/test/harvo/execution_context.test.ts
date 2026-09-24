import {describe, expect, it} from 'vitest';
import {
  EXECUTION_CAUSATION_HEADER,
  EXECUTION_CORRELATION_HEADER,
  ExecutionContextUnavailableError,
  createChildExecutionContext,
  createInboundExecutionContext,
  createRootExecutionContext,
  currentExecutionContext,
  executionContextSchema,
  executionPropagationHeaders,
  requireExecutionContext,
  runWithExecutionContext,
} from '../../lib/observability/executionContext.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

describe('shared execution correlation and causation context', () => {
  it('accepts a bounded inbound correlation and starts a distinct local operation', () => {
    const context = createInboundExecutionContext({
      'X-Correlation-Id': 'guest-request:42',
      'x-causation-id': 'edge-operation.17',
    });

    expect(context).toEqual({
      correlationId: 'guest-request:42',
      causationId: 'edge-operation.17',
      operationId: expect.stringMatching(uuid),
      source: 'HTTP',
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it.each([
    'bad header\nforged-log-entry',
    ' spaces are not allowed ',
    ' padded-id ',
    'a'.repeat(129),
  ])('replaces unsafe inbound identifiers instead of reflecting %j', correlationId => {
    const context = createInboundExecutionContext({
      [EXECUTION_CORRELATION_HEADER]: correlationId,
    });

    expect(context.correlationId).toMatch(uuid);
    expect(context.correlationId).not.toBe(correlationId.trim());
  });

  it('uses only the first valid value for duplicate inbound trace headers', () => {
    const context = createInboundExecutionContext({
      [EXECUTION_CORRELATION_HEADER]: ['first-correlation', 'untrusted-second-value'],
    }, 'WEBHOOK');

    expect(context).toMatchObject({correlationId: 'first-correlation', source: 'WEBHOOK'});
  });

  it('links a child to its immediate parent while retaining end-to-end correlation', () => {
    const parent = createRootExecutionContext({
      source: 'WORKER',
      correlationId: 'campaign-flight-91',
      operationId: 'claim-12',
    });
    const child = createChildExecutionContext(parent, 'SYSTEM');

    expect(child).toMatchObject({
      correlationId: 'campaign-flight-91',
      causationId: 'claim-12',
      source: 'SYSTEM',
    });
    expect(child.operationId).toMatch(uuid);
    expect(child.operationId).not.toBe(parent.operationId);
  });

  it('propagates the current operation as downstream causation', async () => {
    const context = createRootExecutionContext({source: 'SCHEDULER'});

    await runWithExecutionContext(context, async () => {
      await Promise.resolve();
      expect(currentExecutionContext()).toEqual(context);
      expect(executionPropagationHeaders()).toEqual({
        [EXECUTION_CORRELATION_HEADER]: context.correlationId,
        [EXECUTION_CAUSATION_HEADER]: context.operationId,
      });
    });

    expect(currentExecutionContext()).toBeUndefined();
  });

  it('isolates concurrent asynchronous execution chains', async () => {
    const first = createRootExecutionContext({source: 'WORKER', correlationId: 'first'});
    const second = createRootExecutionContext({source: 'WORKER', correlationId: 'second'});
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const firstWork = runWithExecutionContext(first, async () => {
      await firstGate;
      return requireExecutionContext().correlationId;
    });
    const secondWork = runWithExecutionContext(second, async () => {
      releaseFirst?.();
      await Promise.resolve();
      return requireExecutionContext().correlationId;
    });

    await expect(Promise.all([firstWork, secondWork])).resolves.toEqual(['first', 'second']);
  });

  it('restores the parent after nested work and rejects missing mandatory context', () => {
    const parent = createRootExecutionContext({source: 'HTTP'});
    const child = createChildExecutionContext(parent, 'WORKER');

    runWithExecutionContext(parent, () => {
      expect(requireExecutionContext()).toEqual(parent);
      runWithExecutionContext(child, () => expect(requireExecutionContext()).toEqual(child));
      expect(requireExecutionContext()).toEqual(parent);
    });

    expect(() => requireExecutionContext()).toThrow(ExecutionContextUnavailableError);
  });

  it('rejects unknown fields and invalid trusted root identifiers', () => {
    expect(executionContextSchema.safeParse({
      correlationId: 'correlation',
      operationId: 'operation',
      source: 'SYSTEM',
      secret: 'must-not-be-carried',
    }).success).toBe(false);
    expect(() => createRootExecutionContext({source: 'SYSTEM', correlationId: 'bad value'})).toThrow();
  });
});
