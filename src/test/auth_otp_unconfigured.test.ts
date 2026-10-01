import { beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://localhost/encho-auth-unconfigured-fixture');
  vi.stubEnv('PHONE_OTP_REDIS_REST_URL', '');
  vi.stubEnv('PHONE_OTP_REDIS_REST_TOKEN', '');
  vi.stubEnv('PHONE_OTP_HMAC_KEY', '');
  app = (await import('../../server.js')).default;
});

describe('phone OTP shared authority readiness', () => {
  it('fails closed on both routes when no dedicated shared store is configured', async () => {
    const phone = '+919199900123';
    const sent = await supertest(app).post('/api/auth/otp/send').send({ phone });
    const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: '123456' });
    expect(sent.status).toBe(503);
    expect(verified.status).toBe(503);
    expect(JSON.stringify([sent.body, verified.body])).not.toContain('123456');
  });
});
