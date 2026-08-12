import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { executeMetaRollback } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('P0-1 — Rollback Semantics & Quarantine Invariants', () => {
  const correlationId = 'test-corr-p01-' + Date.now();

  beforeAll(async () => {
    process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test_token_p01';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('1. executeMetaRollback emits ZERO DELETE requests and uses POST PAUSE + GET VERIFY + POST RENAME + GET VERIFY', async () => {
    const fetchedUrls: { url: string; method: string; body?: any }[] = [];

    // Intercept fetch
    const originalFetch = global.fetch;
    global.fetch = async (url: any, options: any = {}) => {
      const urlStr = String(url);
      const method = (options.method || 'GET').toUpperCase();
      fetchedUrls.push({ url: urlStr, method, body: options.body });

      // Mock GET verification responses
      if (method === 'GET') {
        if (urlStr.includes('fields=id,status,name')) {
          if (urlStr.includes('mock_ad_123')) {
            const pauseCalled = fetchedUrls.some(c => c.method === 'POST' && c.url.includes('mock_ad_123') && c.url.includes('status=PAUSED'));
            const renameCalled = fetchedUrls.some(c => c.method === 'POST' && c.url.includes('mock_ad_123') && c.url.includes('FAILED_ROLLBACK'));
            if (renameCalled) return new Response(JSON.stringify({ id: 'mock_ad_123', status: 'PAUSED', name: `[FAILED_ROLLBACK_${correlationId}]_Ad_mock_ad_123` }), { status: 200 });
            if (pauseCalled) return new Response(JSON.stringify({ id: 'mock_ad_123', status: 'PAUSED', name: 'Original Active Ad' }), { status: 200 });
            return new Response(JSON.stringify({ id: 'mock_ad_123', status: 'ACTIVE', name: 'Original Active Ad' }), { status: 200 });
          }
          if (urlStr.includes('mock_camp_123')) {
            const pauseCalled = fetchedUrls.some(c => c.method === 'POST' && c.url.includes('mock_camp_123') && c.url.includes('status=PAUSED'));
            const renameCalled = fetchedUrls.some(c => c.method === 'POST' && c.url.includes('mock_camp_123') && c.url.includes('FAILED_ROLLBACK'));
            if (renameCalled) return new Response(JSON.stringify({ id: 'mock_camp_123', status: 'PAUSED', name: `[FAILED_ROLLBACK_${correlationId}]_Campaign_mock_camp_123` }), { status: 200 });
            if (pauseCalled) return new Response(JSON.stringify({ id: 'mock_camp_123', status: 'PAUSED', name: 'Original Active Campaign' }), { status: 200 });
            return new Response(JSON.stringify({ id: 'mock_camp_123', status: 'ACTIVE', name: 'Original Active Campaign' }), { status: 200 });
          }
        }
        return new Response(JSON.stringify({ id: 'mock_obj_999', status: 'PAUSED', name: 'mock_name' }), { status: 200 });
      }

      // Mock POST responses (PAUSE or RENAME)
      if (method === 'POST') {
        return new Response(JSON.stringify({ success: true, id: 'mock_obj_id' }), { status: 200 });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
      const res = await executeMetaRollback(
        {
          metaCampaignId: 'mock_camp_123',
          metaAdId: 'mock_ad_123'
        },
        correlationId,
        pool
      );

      // Rule 1: ZERO DELETE requests
      const deleteCalls = fetchedUrls.filter(u => u.method === 'DELETE');
      expect(deleteCalls.length).toBe(0);

      // Rule 2 & 3: PAUSE request emitted & GET verified
      const pausePostCalls = fetchedUrls.filter(u => u.method === 'POST' && u.url.includes('status=PAUSED'));
      expect(pausePostCalls.length).toBeGreaterThanOrEqual(2); // Ad & Campaign

      const getVerifyCalls = fetchedUrls.filter(u => u.method === 'GET' && u.url.includes('fields=id,status,name'));
      expect(getVerifyCalls.length).toBeGreaterThanOrEqual(4); // 2 verifications per object (pause + rename)

      // Rule 4 & 5: Rename request emitted & verified
      const renamePostCalls = fetchedUrls.filter(u => u.method === 'POST' && u.url.includes('FAILED_ROLLBACK'));
      expect(renamePostCalls.length).toBeGreaterThanOrEqual(2);

      // Rule 6: Quarantined objects persisted
      expect(res.quarantined).toBe(true);
      expect(res.quarantinedObjects.ad).toBe('mock_ad_123');
      expect(res.quarantinedObjects.campaign).toBe('mock_camp_123');

      // Rule 7: QUARANTINED is not converted into ROLLBACK_SUCCESS (success is false when objects are quarantined)
      expect(res.success).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('2. Partial quarantine failure is represented correctly with quarantined=false', async () => {
    const fetchedUrls: { url: string; method: string }[] = [];

    const originalFetch = global.fetch;
    global.fetch = async (url: any, options: any = {}) => {
      const urlStr = String(url);
      const method = (options.method || 'GET').toUpperCase();
      fetchedUrls.push({ url: urlStr, method });

      // Simulate failure on adset
      if (urlStr.includes('mock_failed_adset')) {
        if (method === 'POST') {
          return new Response(JSON.stringify({ error: { message: 'Meta Rate Limit Exceeded', code: 17 } }), { status: 400 });
        }
        return new Response(JSON.stringify({ status: 'ACTIVE', name: 'unpaused_adset' }), { status: 200 });
      }

      // Success on campaign
      if (method === 'GET') {
        return new Response(JSON.stringify({ id: 'mock_camp_part', status: 'PAUSED', name: `[FAILED_ROLLBACK_${correlationId}]_Campaign_mock_camp_part` }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
      const res = await executeMetaRollback(
        {
          metaCampaignId: 'mock_camp_part',
          metaAdSetId: 'mock_failed_adset'
        },
        correlationId,
        pool
      );

      // Failed object causes quarantined to be false
      expect(res.quarantined).toBe(false);
      expect(res.success).toBe(false);
      expect(res.details.some(d => d.includes('QUARANTINE_FAILED'))).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
