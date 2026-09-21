import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import pg from 'pg';
import app from '../../server.js';

// Only Google's certificate retrieval is replaced. The route still verifies real
// RS256 signatures, issuer, audience, expiry and verified-email claims.
const fixture = vi.hoisted(() => ({privateKey: '', publicKey: ''}));
vi.mock('../lib/marketing/authentication.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/marketing/authentication.js')>();
  const {generateKeyPairSync} = await import('node:crypto');
  const pair = generateKeyPairSync('rsa', {modulusLength: 2048});
  fixture.privateKey = pair.privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
  fixture.publicKey = pair.publicKey.export({type: 'spki', format: 'pem'}).toString();
  return {...actual, verifyGoogleIdentity: (credential: unknown, audience?: string) =>
    actual.verifyGoogleIdentity(credential, audience, async () => ({fixture: fixture.publicKey}))};
});
const audience = 'fixture.apps.googleusercontent.com';
const pool = new pg.Pool();
function credential(claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}) {
  return jwt.sign({sub: 'signed-google-subject', email: 'signed-user@gmail.com', email_verified: true, name: 'Signed User', ...claims}, fixture.privateKey,
    {algorithm: 'RS256', keyid: 'fixture', audience, issuer: 'https://accounts.google.com', expiresIn: 300, ...options});
}

describe('Google sign-in HTTP contract', () => {
  beforeEach(() => {vi.stubEnv('GOOGLE_CLIENT_ID', audience); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', audience);});
  afterEach(() => vi.unstubAllEnvs());
  it('exports the configured public client ID', async () => {
    const res = await supertest(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.googleClientId).toBe(audience);
  });
  it('uses verified claims, ignores client identity/role overrides and issues a usable session', async () => {
    const res = await supertest(app).post('/api/auth/google').send({credential: credential(), googleId: 'forged', email: 'attacker@example.com', name: 'Forged', role: 'admin'});
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({email: 'signed-user@gmail.com', name: 'Signed User', role: 'user'});
    const me = await supertest(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(res.body.user.id);
    expect((await pool.query('SELECT google_id FROM users WHERE id=$1', [res.body.user.id])).rows[0].google_id).toBe('signed-google-subject');
  });
  it.each([
    ['unsigned profile', () => ({googleId: 'forged', email: 'unsigned@gmail.com'})],
    ['missing credential', () => ({})],
    ['malformed credential', () => ({credential: 'malformed'})],
    ['wrong audience', () => ({credential: credential({}, {audience: 'another-client'})})],
    ['wrong issuer', () => ({credential: credential({}, {issuer: 'https://attacker.example'})})],
    ['expired credential', () => ({credential: credential({}, {expiresIn: -10})})],
    ['unverified email', () => ({credential: credential({email_verified: false})})],
    ['symmetric signature substitution', () => ({credential: jwt.sign({sub: 'forged'}, 'untrusted-secret', {algorithm: 'HS256', keyid: 'fixture'})})],
  ])('rejects %s without issuing a session or changing users', async (_label, payload) => {
    const before = (await pool.query('SELECT id,email,google_id,role FROM users ORDER BY id')).rows;
    const res = await supertest(app).post('/api/auth/google').send(payload());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('IDENTITY_INVALID');
    expect(res.body.token).toBeUndefined();
    expect((await pool.query('SELECT id,email,google_id,role FROM users ORDER BY id')).rows).toEqual(before);
  });
  it('reports missing identity configuration as unavailable', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', ''); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const res = await supertest(app).post('/api/auth/google').send({credential: credential()});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IDENTITY_NOT_CONFIGURED');
    expect(res.body.token).toBeUndefined();
  });
});
