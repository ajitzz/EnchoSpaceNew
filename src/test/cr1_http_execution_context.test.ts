import express from 'express';
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {requireExecutionContext} from '../lib/observability/executionContext.js';
import {
  createHttpExecutionContextMiddleware,
  type HttpExecutionCompletion,
  type HttpExecutionRequest,
} from '../server/observability/httpExecutionContext.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function testApp(completions: HttpExecutionCompletion[] = []) {
  const app = express();
  app.use(createHttpExecutionContextMiddleware({
    onFinish: completion => completions.push(completion),
  }));
  app.get('/context', async (req, res) => {
    await new Promise<void>(resolve => setImmediate(resolve));
    const context = requireExecutionContext();
    const contextualRequest = req as HttpExecutionRequest;
    res.json({
      correlationId: context.correlationId,
      operationId: context.operationId,
      causationId: context.causationId ?? null,
      requestCorrelationId: contextualRequest.correlationId,
      requestId: contextualRequest.requestId,
    });
  });
  return app;
}

describe('CR1 HTTP execution context boundary', () => {
  it('does not reflect invalid inbound correlation, causation, or request identifiers', async () => {
    const response = await request(testApp())
      .get('/context')
      .set('x-correlation-id', 'forged correlation')
      .set('x-causation-id', 'forged causation')
      .set('x-request-id', 'attacker-controlled-request');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(uuid);
    expect(response.headers['x-correlation-id']).not.toBe('forged correlation');
    expect(response.headers['x-request-id']).toMatch(uuid);
    expect(response.headers['x-request-id']).not.toBe('attacker-controlled-request');
    expect(response.headers['x-causation-id']).toBeUndefined();
    expect(response.body.causationId).toBeNull();
  });

  it('propagates one stable context through asynchronous request work and completion', async () => {
    const completions: HttpExecutionCompletion[] = [];
    const response = await request(testApp(completions))
      .get('/context')
      .set('x-correlation-id', 'guest-flow:42')
      .set('x-causation-id', 'edge-operation:17');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('guest-flow:42');
    expect(response.headers['x-causation-id']).toBe('edge-operation:17');
    expect(response.body).toMatchObject({
      correlationId: 'guest-flow:42',
      causationId: 'edge-operation:17',
      requestCorrelationId: 'guest-flow:42',
      requestId: response.headers['x-request-id'],
      operationId: response.headers['x-request-id'],
    });
    expect(completions).toHaveLength(1);
    expect(completions[0].context.correlationId).toBe(response.headers['x-correlation-id']);
    expect(completions[0].context.operationId).toBe(response.headers['x-request-id']);
  });

  it('creates a distinct local operation for requests sharing one correlation', async () => {
    const app = testApp();
    const [first, second] = await Promise.all([
      request(app).get('/context').set('x-correlation-id', 'shared-journey'),
      request(app).get('/context').set('x-correlation-id', 'shared-journey'),
    ]);

    expect(first.headers['x-correlation-id']).toBe('shared-journey');
    expect(second.headers['x-correlation-id']).toBe('shared-journey');
    expect(first.headers['x-request-id']).toMatch(uuid);
    expect(second.headers['x-request-id']).toMatch(uuid);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
});
