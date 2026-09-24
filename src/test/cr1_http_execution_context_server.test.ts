import request from 'supertest';
import {describe, expect, it} from 'vitest';
import app from '../../server.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

describe('CR1 execution context mounted on the server boundary', () => {
  it('returns server-owned diagnostic identifiers for an invalid inbound request', async () => {
    const response = await request(app)
      .get('/api/config')
      .set('x-correlation-id', 'invalid correlation')
      .set('x-request-id', 'caller-request-id');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(uuid);
    expect(response.headers['x-request-id']).toMatch(uuid);
    expect(response.headers['x-request-id']).not.toBe('caller-request-id');
  });

  it('keeps a validated journey correlation stable without reusing a local operation', async () => {
    const response = await request(app)
      .get('/api/config')
      .set('x-correlation-id', 'guest-journey:92')
      .set('x-causation-id', 'edge-operation:31');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('guest-journey:92');
    expect(response.headers['x-causation-id']).toBe('edge-operation:31');
    expect(response.headers['x-request-id']).toMatch(uuid);
  });
});
