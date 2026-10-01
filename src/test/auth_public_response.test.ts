import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import supertest from 'supertest';
import type { Express } from 'express';
import { authUserSchema } from '../lib/auth/sessionContract.js';

// Exercise the real OTP service and HTTP routes against a shared local Redis
// command fixture. No live Redis, WhatsApp or database credential is inherited.
const otpRedis = vi.hoisted(() => ({
  challenges: new Map<string, { digest: string; generation: string; attempts: number }>(),
  counters: new Map<string, number>(), fail: false,
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    async eval(script: string, keys: string[], args: (string | number)[]): Promise<number> {
      if (otpRedis.fail) throw new Error('simulated shared-store outage');
      const increment = (key: string) => {
        const next = (otpRedis.counters.get(key) ?? 0) + 1;
        otpRedis.counters.set(key, next);
        return next;
      };
      if (script.startsWith('-- encho-phone-otp-ip-counter-v2')) {
        return Number(increment(keys[0]) <= Number(args[1]));
      }
      if (script.startsWith('-- encho-phone-otp-issue-v2')) {
        if (increment(keys[1]) > Number(args[3])) return 0;
        otpRedis.challenges.set(keys[0], { digest: String(args[0]), generation: String(args[1]), attempts: 0 });
        return 1;
      }
      if (script.startsWith('-- encho-phone-otp-verify-v2')) {
        const challenge = otpRedis.challenges.get(keys[0]);
        if (!challenge) return 0;
        challenge.attempts += 1;
        const matches = challenge.digest === args[0] && challenge.attempts <= Number(args[1]);
        if (matches || challenge.attempts >= Number(args[1])) otpRedis.challenges.delete(keys[0]);
        return Number(matches);
      }
      if (script.startsWith('-- encho-phone-otp-revoke-v1')) {
        const matches = otpRedis.challenges.get(keys[0])?.generation === args[0];
        if (matches) otpRedis.challenges.delete(keys[0]);
        return Number(matches);
      }
      throw new Error('Unexpected OTP command');
    }
  },
}));

const pool = new pg.Pool();
let app: Express;
let deliveredCode = '';
let deliveryMode: 'accepted' | 'unknown' | 'rejected' = 'accepted';

beforeAll(async () => {
  // The legacy project's pg-mem driver intercepts this local-looking URL;
  // scripts/testing/run.mjs strips any real DATABASE_URL before Vitest starts.
  vi.stubEnv('DATABASE_URL', 'postgres://localhost/encho-auth-fixture');
  vi.stubEnv('META_API_TOKEN', 'local-fixture-token');
  vi.stubEnv('PHONE_OTP_REDIS_REST_URL', 'https://redis.invalid');
  vi.stubEnv('PHONE_OTP_REDIS_REST_TOKEN', 'local-fixture-token');
  vi.stubEnv('PHONE_OTP_HMAC_KEY', Buffer.alloc(32, 5).toString('base64url'));
  vi.stubEnv('PHONE_OTP_WHATSAPP_TOKEN', 'local-fixture-token-with-no-live-authority');
  vi.stubEnv('PHONE_OTP_WHATSAPP_PHONE_NUMBER_ID', '982841698238647');
  vi.stubEnv('PHONE_OTP_WHATSAPP_TEMPLATE_NAME', 'encho_auth_code');
  vi.stubEnv('PHONE_OTP_WHATSAPP_TEMPLATE_LANGUAGE', 'en_US');
  vi.stubEnv('PHONE_OTP_WHATSAPP_GRAPH_VERSION', 'v25.0');
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe('https://graph.facebook.com/v25.0/982841698238647/messages');
    const payload = JSON.parse(String(init?.body)) as { type: string; template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> } };
    expect(payload.type).toBe('template');
    expect(payload.template.name).toBe('encho_auth_code');
    deliveredCode = payload.template.components[0].parameters[0].text;
    expect(payload.template.components[1].parameters[0].text).toBe(deliveredCode);
    if (deliveryMode !== 'accepted') {
      return new Response(JSON.stringify({ error: 'local simulated response' }), {
        status: deliveryMode === 'unknown' ? 503 : 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ messages: [{ id: 'local-delivery' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  app = (await import('../../server.js')).default;
});

afterAll(async () => { await pool.end(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('consumer sign-in response minimization', () => {
  it('exposes a mounted notification route as unavailable to an authenticated account when rollout is disabled', async () => {
    const phone = '+919199900141';
    expect((await supertest(app).post('/api/auth/otp/send').send({phone})).status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({phone, otp: deliveredCode});
    expect(verified.status).toBe(200);
    for (const path of ['/api/conversations/v1/notifications/preferences', '/api/conversations/v1/notifications/evidence']) {
      const response = await supertest(app).get(path).set('Authorization', `Bearer ${verified.body.token}`);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('FEATURE_UNAVAILABLE');
    }
    const disabledWrite = await supertest(app).put('/api/conversations/v1/notifications/preferences')
      .set('Authorization', `Bearer ${verified.body.token}`)
      .set('X-Encho-Conversation-Command', '1')
      .send({requestId: '11111111-1111-4111-8111-111111111111', expectedVersion: '0', inAppAlerts: false});
    expect(disabledWrite.status).toBe(503);
    expect(disabledWrite.body.code).toBe('FEATURE_UNAVAILABLE');
  });

  it('does not send internal columns for an existing phone account', async () => {
    const phone = '+919199900123';
    await pool.query(
      `INSERT INTO users (phone,email,name,role,password_hash,google_id,wallet_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [phone, 'phone-fixture@example.invalid', 'Phone Fixture', 'user', 'private-password-hash', 'private-google-sub', 7123.45],
    );
    const sent = await supertest(app).post('/api/auth/otp/send').send({ phone });
    expect(sent.status).toBe(200);
    expect(sent.body.deliveryStatus).toBe('ACCEPTED');
    expect(deliveredCode).toMatch(/^\d{6}$/);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode });
    expect(verified.status).toBe(200);
    expect(verified.body.token).toEqual(expect.any(String));
    expect(verified.body.user).toEqual({
      id: expect.any(Number), email: 'phone-fixture@example.invalid',
      name: 'Phone Fixture', role: 'user', phone,
    });
    expect(JSON.stringify(verified.body)).not.toContain('private-password-hash');
    expect(JSON.stringify(verified.body)).not.toContain('private-google-sub');
    expect(JSON.stringify(verified.body)).not.toContain('7123.45');
  });

  it('does not send a code or mint a session during a shared-store outage', async () => {
    const fetchCalls = vi.mocked(fetch).mock.calls.length;
    otpRedis.fail = true;
    try {
      const sent = await supertest(app).post('/api/auth/otp/send').send({ phone: '+919199900124' });
      const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone: '+919199900124', otp: '123456' });
      expect(sent.status).toBe(503);
      expect(verified.status).toBe(503);
      expect(verified.body).not.toHaveProperty('token');
      expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCalls);
    } finally { otpRedis.fail = false; }
  });

  it('preserves an unknown-delivery code but revokes a definitive rejection', async () => {
    const phone = '+919199900123';
    deliveryMode = 'unknown';
    try {
      const unknown = await supertest(app).post('/api/auth/otp/send').send({ phone });
      expect(unknown.status).toBe(503);
      expect(unknown.body.deliveryStatus).toBe('UNKNOWN');
      expect(unknown.body.error).toMatch(/unknown/i);
      const uncertainCode = deliveredCode;
      const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: uncertainCode });
      expect(verified.status).toBe(200);

      deliveryMode = 'rejected';
      const rejected = await supertest(app).post('/api/auth/otp/send').send({ phone });
      expect(rejected.status).toBe(503);
      const rejectedCode = deliveredCode;
      const replay = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: rejectedCode });
      expect(replay.status).toBe(400);
    } finally { deliveryMode = 'accepted'; }
  });

  it('enrolls a canonical new phone but does not duplicate a digit-only legacy account', async () => {
    const newPhone = '+919199900126';
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone: newPhone })).status).toBe(200);
    const enrolled = await supertest(app).post('/api/auth/otp/verify').send({ phone: newPhone, otp: deliveredCode, name: 'New Guest' });
    expect(enrolled.status).toBe(200);
    expect(enrolled.body.user).toMatchObject({ phone: newPhone, name: 'New Guest', role: 'user' });

    const legacyPhone = '+919199900127';
    await pool.query('INSERT INTO users (phone,email,name,role) VALUES ($1,$2,$3,$4)',
      [legacyPhone.slice(1), 'legacy-phone@example.invalid', 'Legacy Guest', 'user']);
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone: legacyPhone })).status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone: legacyPhone, otp: deliveredCode });
    expect(verified.status).toBe(503);
    expect(verified.body).not.toHaveProperty('token');
    const count = await pool.query('SELECT COUNT(*) AS count FROM users WHERE email = $1 OR phone = $2',
      ['legacy-phone@example.invalid', legacyPhone]);
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('does not match blank legacy phones for an unrelated international number', async () => {
    const phone = '+447911123456';
    await pool.query('INSERT INTO users (phone,email,name,role) VALUES ($1,$2,$3,$4)',
      [' ', 'blank-legacy@example.invalid', 'Blank Legacy', 'user']);
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode, name: 'UK Guest' });
    expect(verified.status).toBe(200);
    expect(verified.body.user).toMatchObject({ phone, email: null, role: 'user' });
    expect(authUserSchema.safeParse(verified.body.user).success).toBe(true);
    const me = await supertest(app).get('/api/auth/me').set('Authorization', `Bearer ${verified.body.token}`);
    expect(me.status).toBe(200);
    expect(authUserSchema.safeParse(me.body.user).success).toBe(true);
    expect(me.body.user.email).toBeNull();
  });

  it('does not let a pre-registered synthetic email deny phone-only enrollment', async () => {
    const phone = '+919199900132';
    await pool.query('INSERT INTO users (email,name,role) VALUES ($1,$2,$3)',
      [`${phone.slice(1)}@enchospace.local`, 'Unrelated Registration', 'user']);
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode });
    expect(verified.status).toBe(200);
    expect(verified.body.user).toMatchObject({ phone, email: null, role: 'user' });
  });

  it('never upgrades consumer phone verification into an admin-role session', async () => {
    const phone = '+919199900128';
    await pool.query('INSERT INTO users (phone,email,name,role) VALUES ($1,$2,$3,$4)',
      [phone, 'admin-phone@example.invalid', 'Admin Fixture', 'admin']);
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    const response = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode });
    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('user');
  });

  it('locks a challenge after four wrong codes without creating a session', async () => {
    const phone = '+919199900129';
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    const validCode = deliveredCode;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });
      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('token');
    }
    const replay = await supertest(app).post('/api/auth/otp/verify').send({ phone, otp: validCode });
    expect(replay.status).toBe(400);
    expect(replay.body).not.toHaveProperty('token');
  });

  it('enforces a shared per-phone send budget without a sixth provider call', async () => {
    const phone = '+919199900130';
    const before = vi.mocked(fetch).mock.calls.length;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    }
    const blocked = await supertest(app).post('/api/auth/otp/send').send({ phone });
    expect(blocked.status).toBe(429);
    expect(vi.mocked(fetch).mock.calls.length).toBe(before + 5);
  });

  it('allows only one concurrent HTTP verification of a code', async () => {
    const phone = '+919199900131';
    expect((await supertest(app).post('/api/auth/otp/send').send({ phone })).status).toBe(200);
    const [first, second] = await Promise.all([
      supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode }),
      supertest(app).post('/api/auth/otp/verify').send({ phone, otp: deliveredCode }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    expect([first.body.token, second.body.token].filter(Boolean)).toHaveLength(1);
  });

  it('does not send a code when the deployed users schema cannot enroll a phone-only identity', async () => {
    // This file's pg-mem pool is disposable. Identify it to the repository's
    // destructive-query guard as the sanitizer's named test URL for this DDL.
    vi.stubEnv('DATABASE_URL', process.env.TEST_DATABASE_URL);
    let constrained = false;
    try {
      await pool.query("UPDATE users SET email = 'local-fixture-' || CAST(id AS text) || '@example.invalid' WHERE email IS NULL");
      await pool.query('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
      constrained = true;
      const before = vi.mocked(fetch).mock.calls.length;
      const sent = await supertest(app).post('/api/auth/otp/send').send({ phone: '+447911123457' });
      expect(sent.status).toBe(503);
      expect(vi.mocked(fetch).mock.calls.length).toBe(before);
    } finally {
      if (constrained) await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
      vi.stubEnv('DATABASE_URL', 'postgres://localhost/encho-auth-fixture');
    }
  });

  it('does not make disabled notification preferences depend on the chat mutation quota', async () => {
    const phone = '+919199900142';
    expect((await supertest(app).post('/api/auth/otp/send').send({phone})).status).toBe(200);
    const verified = await supertest(app).post('/api/auth/otp/verify').send({phone, otp: deliveredCode});
    expect(verified.status).toBe(200);
    const bearer = `Bearer ${verified.body.token}`;
    let exhausted = false;
    for (let attempt = 0; attempt < 105; attempt += 1) {
      const response = await supertest(app).post('/api/messages').set('Authorization', bearer).send({});
      if (response.status === 429) {exhausted = true; break;}
    }
    expect(exhausted).toBe(true);
    const response = await supertest(app).put('/api/conversations/v1/notifications/preferences')
      .set('Authorization', bearer).set('X-Encho-Conversation-Command', '1')
      .send({requestId: '22222222-2222-4222-8222-222222222222', expectedVersion: '0', inAppAlerts: false});
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('FEATURE_UNAVAILABLE');
  });
});
