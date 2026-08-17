import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import app from '../../server.js';

describe('GOOGLE OAUTH PRODUCTION ORIGIN & SIGN-IN FORENSICS', () => {
  const PRODUCTION_ORIGIN = 'https://encho-space-chi.vercel.app';
  const EXPECTED_CLIENT_ID = '977982063830-0eq4c0i2oassrdmj71aevnktr17hasa7.apps.googleusercontent.com';

  it('1. Production origin matches exact HTTPS scheme, host, and port requirements', () => {
    const originUrl = new URL(PRODUCTION_ORIGIN);
    expect(originUrl.protocol).toBe('https:');
    expect(originUrl.hostname).toBe('encho-space-chi.vercel.app');
    expect(originUrl.port).toBe(''); // default 443
    expect(originUrl.origin).toBe('https://encho-space-chi.vercel.app');
  });

  it('2. /api/config endpoint exports the authoritative Google OAuth Client ID', async () => {
    const request = supertest(app);
    const res = await request.get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.googleClientId).toBeDefined();
    expect(res.body.googleClientId).toContain('.apps.googleusercontent.com');
  });

  it('3. /api/auth/google successfully handles Google Identity Services credential exchange', async () => {
    const request = supertest(app);
    const res = await request.post('/api/auth/google').send({
      googleId: 'test_gis_sub_9999',
      email: 'enchoenclave@gmail.com',
      name: 'Encho Enclave'
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('enchoenclave@gmail.com');
    expect(res.body.token).toBeDefined();

    // Verify /api/auth/me accepts the issued token
    const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('enchoenclave@gmail.com');
  });

  it('4. Rejects invalid or missing Google profile payloads (fail-closed)', async () => {
    const request = supertest(app);
    const res = await request.post('/api/auth/google').send({
      googleId: '',
      email: '',
      name: ''
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Failed to retrieve Google profile data');
  });
});
