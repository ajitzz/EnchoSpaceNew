import {describe, expect, it} from 'vitest';
import request from 'supertest';
import app from '../../server.js';

describe('W1 exact offer workflow HTTP boundary', () => {
  it('requires a Host session before submitting an exact revision', async () => {
    const response = await request(app)
      .post('/api/offers/v1/11111111-1111-4111-8111-111111111111/revisions/1/submit')
      .send({expectedVersion: 1});
    expect(response.status).toBe(401);
  });

  it('requires an isolated workforce session before accepting an exact revision', async () => {
    const response = await request(app)
      .post('/api/operations/v1/offers/11111111-1111-4111-8111-111111111111/revisions/1/accept')
      .send({expectedVersion: 1});
    expect(response.status).toBe(401);
  });
});
