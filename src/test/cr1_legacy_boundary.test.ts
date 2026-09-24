import express from 'express';
import request from 'supertest';
import {beforeEach, describe, expect, it} from 'vitest';
import {legacyMarketingBoundary, retiredMarketingSurface} from '../server/marketing/legacyBoundary';
import {MetricsRegistry} from '../lib/observability/metricsRegistry';

describe('CR1 legacy route boundary parity', () => {
  beforeEach(() => MetricsRegistry.reset());
  const app = express();
  app.use(legacyMarketingBoundary);
  app.use((_req, res) => res.status(204).end());

  it.each([
    '/api/marketing/leads/webhook/', '/API/MARKETING/LEADS/WEBHOOK',
    '/api/telemetry/pixel-event/', '/API/TELEMETRY/PIXEL-EVENT',
    '/api/payments/geo-route/initiate/', '/api/admin/payments/escrow/release/',
    '/api/host/social-posts/123/boost/', '/api/marketing/campaigns/123/',
  ])('blocks equivalent Express path %s', async path => {
    expect((await request(app).post(path)).status).toBe(410);
  });

  it('preserves canonical v2 operations and records bounded caller evidence only', async () => {
    expect((await request(app).post('/API/MARKETING/V2/campaigns/123/publish')).status).toBe(204);
    expect((await request(app).post('/api/webhooks/marketing/v2/meta')).status).toBe(204);
    await request(app).post('/api/marketing/campaigns/private-id?token=must-not-record');
    await request(app).post('/api/marketing/campaigns/another-private-id');
    expect(MetricsRegistry.getSnapshot().deprecatedSurfaces).toEqual({CAMPAIGN_MUTATION: 2});
    expect(JSON.stringify(MetricsRegistry.getSnapshot())).not.toContain('private-id');
    expect(retiredMarketingSurface('GET', '/api/marketing/campaigns/123')).toBeNull();
  });
});
