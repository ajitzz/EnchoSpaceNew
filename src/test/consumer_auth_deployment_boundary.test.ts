import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import supertest from 'supertest';
import type {Express} from 'express';

const fixture = vi.hoisted(() => ({
  ready: true, throwProbe: false, operations: [] as string[],
  challenge: null as null | {digest: string; attempts: number}, deliveredCode: '',
}));

vi.mock('../server/auth/consumerAuthReadiness.js', () => ({
  consumerAuthReadiness: vi.fn(async (_pool: unknown, operation: string) => {
    fixture.operations.push(operation);
    if (fixture.throwProbe) throw new Error('postgres://secret@private-host.invalid/db');
    return fixture.ready;
  }),
}));
vi.mock('../lib/marketing/authentication.js', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/marketing/authentication.js')>(),
  verifyGoogleIdentity: vi.fn(async () => ({googleId: 'verified-subject',
    email: 'google-boundary@example.invalid', name: 'Google Boundary', authoritativeEmail: true})),
}));
vi.mock('@upstash/redis', () => ({Redis: class {
  async eval(script: string, _keys: string[], args: (string | number)[]) {
    if (script.startsWith('-- encho-phone-otp-ip-counter-v2')) return 1;
    if (script.startsWith('-- encho-phone-otp-issue-v2')) {
      fixture.challenge = {digest: String(args[0]), attempts: 0}; return 1;
    }
    if (script.startsWith('-- encho-phone-otp-verify-v2')) {
      if (!fixture.challenge) return 0;
      fixture.challenge.attempts += 1;
      const match = fixture.challenge.digest === args[0];
      if (match) fixture.challenge = null;
      return Number(match);
    }
    return 0;
  }
}}));

const pool = new pg.Pool();
let app: Express;
beforeAll(async () => {
  // This remote-looking URL never reaches a network: setup.ts replaces pg with
  // pg-mem. It forces the production read-only path instead of legacy DDL.
  vi.stubEnv('DATABASE_URL', 'postgres://fixture@ep-auth-boundary.invalid/encho?sslmode=require');
  vi.stubEnv('PHONE_OTP_REDIS_REST_URL', 'https://redis.invalid');
  vi.stubEnv('PHONE_OTP_REDIS_REST_TOKEN', 'fixture');
  vi.stubEnv('PHONE_OTP_HMAC_KEY', Buffer.alloc(32, 7).toString('base64url'));
  vi.stubEnv('PHONE_OTP_WHATSAPP_TOKEN', 'fixture-with-no-provider-authority');
  vi.stubEnv('PHONE_OTP_WHATSAPP_PHONE_NUMBER_ID', '982841698238647');
  vi.stubEnv('PHONE_OTP_WHATSAPP_TEMPLATE_NAME', 'encho_auth_code');
  vi.stubEnv('PHONE_OTP_WHATSAPP_TEMPLATE_LANGUAGE', 'en_US');
  vi.stubEnv('PHONE_OTP_WHATSAPP_GRAPH_VERSION', 'v25.0');
  vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    fixture.deliveredCode = payload.template.components[0].parameters[0].text;
    return Response.json({messages: [{id: 'fixture-delivery'}]});
  }));
  app = (await import('../../server.js')).default;
});
afterAll(async () => {await pool.end(); vi.unstubAllEnvs(); vi.unstubAllGlobals();});

describe('mounted consumer auth boundary during marketing drift', () => {
  it('keeps full health strict while password, Google and phone auth use only auth readiness', async () => {
    const hash = await bcrypt.hash('LocalPassword123!', 4);
    await pool.query('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4)',
      ['password-boundary@example.invalid', hash, 'Password Boundary', 'user']);
    const health = await supertest(app).get('/api/health/ready');
    expect(health.status).toBe(503);
    const password = await supertest(app).post('/api/auth/login')
      .send({email: 'password-boundary@example.invalid', password: 'LocalPassword123!'});
    expect(password.status).toBe(200);
    expect(password.body.token).toEqual(expect.any(String));
    const session = await supertest(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${password.body.token}`);
    expect(session.status).toBe(200);
    const registered = await supertest(app).post('/api/auth/register')
      .send({email: 'register-boundary@example.invalid', name: 'Registered Boundary', password: 'LocalPassword456!'});
    expect(registered.status).toBe(201);
    expect(registered.body.token).toEqual(expect.any(String));
    const google = await supertest(app).post('/api/auth/google').send({credential: 'locally-verified-identity'});
    expect(google.status).toBe(200);
    expect(google.body.user.email).toBe('google-boundary@example.invalid');
    const sent = await supertest(app).post('/api/auth/otp/send').send({phone: '+919199900156'});
    expect(sent.status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify')
      .send({phone: '+919199900156', otp: fixture.deliveredCode});
    expect(verified.status).toBe(200);
    expect(verified.body.token).toEqual(expect.any(String));
    expect(fixture.operations).toEqual(expect.arrayContaining(['READ', 'GOOGLE_LINK', 'ENROLL']));
  });

  it('never issues an auth token or provider OTP when the role/schema probe fails', async () => {
    fixture.ready = false;
    try {
      const before = vi.mocked(fetch).mock.calls.length;
      for (const [path, body] of [
        ['/api/auth/login', {email: 'password-boundary@example.invalid', password: 'LocalPassword123!'}],
        ['/api/auth/google', {credential: 'locally-verified-identity'}],
        ['/api/auth/otp/send', {phone: '+919199900157'}],
      ] as const) {
        const result = await supertest(app).post(path).send(body);
        expect(result.status).toBe(503);
        expect(result.body.token).toBeUndefined();
      }
      expect(vi.mocked(fetch).mock.calls.length).toBe(before);
    } finally {fixture.ready = true;}
  });

  it('does not put a failed probe or credential URL into an HTTP response', async () => {
    fixture.throwProbe = true;
    try {
      const result = await supertest(app).post('/api/auth/login')
        .send({email: 'password-boundary@example.invalid', password: 'LocalPassword123!'});
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain('secret@private-host');
    } finally {fixture.throwProbe = false;}
  });
});
