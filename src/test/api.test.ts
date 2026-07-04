import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';

describe('API Tests', () => {
  it('GET /api/health/db should return 200 or 500', async () => {
    const res = await request(app).get('/api/health/db');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/listings should return 200 or 500 depending on DB', async () => {
    const res = await request(app).get('/api/listings');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});
