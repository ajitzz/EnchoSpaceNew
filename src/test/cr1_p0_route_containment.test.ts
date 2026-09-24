import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../server';

describe('CR1 P0 legacy route containment', () => {
  afterEach(() => {
    delete process.env.ENCHO_ALLOW_RUNTIME_DDL;
  });

  it.each([
    ['GET', '/api/admin/integration-inspection'],
    ['GET', '/api/admin/payments/overview'],
    ['POST', '/api/init-db'],
    ['POST', '/api/ai/curate-rules'],
    ['POST', '/api/ai/radar-scan'],
    ['POST', '/api/ai/suggest-sensory-tags'],
  ] as const)('%s %s requires a persisted account session', async (method, path) => {
    const response = await request(app)[method.toLowerCase() as 'get' | 'post'](path).send({});
    expect(response.status).toBe(401);
  });

  it('does not expose the unauthenticated mock upload sink', async () => {
    const response = await request(app).put('/api/mock-upload').send('untrusted bytes');
    expect(response.status).toBe(404);
  });

  it('does not convert an invalid checkout bearer into a fabricated guest account', async () => {
    const response = await request(app).post('/api/checkout/razorpay/order')
      .set('Authorization', 'Bearer invalid-account-token')
      .send({listingId: 1});
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('order_id');
  });

  it.each([
    '/api/marketing/leads/webhook',
    '/api/telemetry/pixel-event',
    '/api/payments/geo-route/initiate',
  ])('retires the legacy public mutation %s before its old handler', async (path) => {
    const response = await request(app).post(path).send({});
    expect(response.status).toBe(410);
    expect(response.body.code).toBe('HARVO_V2_REQUIRED');
  });

  it('retires the legacy geo-router projection with its false fixed-fee claims', async () => {
    const response = await request(app).get('/api/payments/geo-route/detect');
    expect(response.status).toBe(410);
    expect(response.body.code).toBe('HARVO_V2_REQUIRED');
    expect(response.body).not.toHaveProperty('optimization_fee_percent');
  });

  it.each(['/api/webhooks/meta', '/api/webhooks/ad-network'])('retires ambiguous legacy provider ingress %s', async (path) => {
    const response = await request(app).post(path).send({});
    expect(response.status).toBe(410);
    expect(response.body.code).toBe('HARVO_V2_REQUIRED');
  });

  it('does not reflect a raw database exception in the health response', async () => {
    const response = await request(app).get('/api/health/db');
    expect(JSON.stringify(response.body)).not.toContain('detail');
    expect(JSON.stringify(response.body)).not.toContain('DATABASE_URL');
  });
});
