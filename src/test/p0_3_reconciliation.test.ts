import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { processMetaReconciliation, verifyMetaExternalObjectDetailed } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('P0-3 — Reconciliation Active Remediation & External-Truth Engine', () => {
  const correlationIdBase = 'test-p03-' + Date.now();
  let testUserId: number;

  beforeAll(async () => {
    process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'test_token_p03';
    
    // Seed test user
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'P03 Test Host')
      RETURNING id
    `, [`p03_host_${Date.now()}@test.com`]);
    testUserId = userRes.rows[0].id;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_publishing_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        correlation_id VARCHAR(255) NOT NULL,
        publish_status VARCHAR(50) DEFAULT 'PENDING',
        publish_attempt INTEGER DEFAULT 1,
        meta_campaign_id VARCHAR(255),
        meta_adset_id VARCHAR(255),
        meta_creative_id VARCHAR(255),
        meta_ad_id VARCHAR(255),
        rollback_status VARCHAR(50),
        quarantined_objects JSONB,
        last_reconciled_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_reconciliation_incidents (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
        mismatch_type VARCHAR(100),
        details JSONB,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM meta_reconciliation_incidents`);
    await pool.query(`DELETE FROM meta_publishing_transactions`);
    if (testUserId) {
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE host_id = $1`, [testUserId]);
    }
  });

  afterAll(async () => {
    if (testUserId) {
      await pool.query(`DELETE FROM meta_reconciliation_incidents`);
      await pool.query(`DELETE FROM meta_publishing_transactions`);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE host_id = $1`, [testUserId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    }
    await pool.end();
  });

  it('1. Deep External Verification (verifyMetaExternalObjectDetailed) distinguishes MISSING, EXISTS, and EXTERNAL_STATE_UNKNOWN', async () => {
    const originalFetch = global.fetch;

    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('missing_obj')) {
        return new Response(JSON.stringify({ error: { code: 100, message: 'Unsupported get request' } }), { status: 404, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('timeout_obj')) {
        throw new TypeError('fetch failed - Connection timeout');
      }
      if (urlStr.includes('active_obj_123')) {
        return new Response(JSON.stringify({ id: 'active_obj_123', status: 'ACTIVE', name: 'My Active Campaign', daily_budget: '5000' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: 'obj_999', status: 'PAUSED' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const vMissing = await verifyMetaExternalObjectDetailed('missing_obj', 'token');
      expect(vMissing.outcome).toBe('MISSING');

      const vTimeout = await verifyMetaExternalObjectDetailed('timeout_obj', 'token');
      expect(vTimeout.outcome).toBe('EXTERNAL_STATE_UNKNOWN');

      const vExists = await verifyMetaExternalObjectDetailed('active_obj_123', 'token');
      expect(vExists.outcome).toBe('EXISTS');
      expect(vExists.status).toBe('ACTIVE');
      expect(vExists.name).toBe('My Active Campaign');
      expect(vExists.dailyBudget).toBe(5000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('2. Orphan ACTIVE Campaign discovered on failed transaction → POST PAUSE + RENAME executed and persisted as QUARANTINED', async () => {
    const corr = `${correlationIdBase}-orphan-camp`;
    const txKey = `idemp-${corr}`;

    const txInsert = await pool.query(`
      INSERT INTO meta_publishing_transactions (idempotency_key, correlation_id, publish_status, meta_campaign_id)
      VALUES ($1, $2, 'EXTERNAL_OUTCOME_UNKNOWN', 'orphan_camp_999')
      RETURNING id
    `, [txKey, corr]);
    const txId = txInsert.rows[0].id;

    const fetchedCalls: { method: string; url: string; body?: any }[] = [];
    const originalFetch = global.fetch;

    global.fetch = async (url: any, opts: any = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();
      fetchedCalls.push({ method, url: urlStr, body: opts.body });

      if (method === 'GET') {
        if (urlStr.includes('orphan_camp_999')) {
          // First check: ACTIVE
          const wasPauseCalled = fetchedCalls.some(c => c.method === 'POST' && c.url.includes('status=PAUSED'));
          const wasRenameCalled = fetchedCalls.some(c => c.method === 'POST' && c.url.includes('FAILED_ROLLBACK'));

          if (wasRenameCalled) {
            return new Response(JSON.stringify({ id: 'orphan_camp_999', status: 'PAUSED', name: `[FAILED_ROLLBACK_${corr}]_Campaign_orphan_camp_999` }), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          if (wasPauseCalled) {
            return new Response(JSON.stringify({ id: 'orphan_camp_999', status: 'PAUSED', name: 'Original Name' }), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify({ id: 'orphan_camp_999', status: 'ACTIVE', name: 'Active Orphan Campaign' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: { code: 100 } }), { status: 404, headers: { 'content-type': 'application/json' } });
      }

      if (method === 'POST') {
        return new Response(JSON.stringify({ success: true, id: 'orphan_camp_999' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      await processMetaReconciliation(pool, 'test_token');

      // Check DB State
      // Documenting for Certification: QUARANTINED is the correct canonical terminal state,
      // not FAILED_PUBLISH. An orphaned ACTIVE campaign represents unsafe active spend.
      // The reconciliation engine must actively PAUSE and RENAME it, rendering it QUARANTINED.
      const updatedTx = await pool.query(`SELECT * FROM meta_publishing_transactions WHERE id = $1`, [txId]);
      expect(updatedTx.rows[0].publish_status).toBe('QUARANTINED');
      expect(updatedTx.rows[0].rollback_status).toBe('QUARANTINED');
      expect(updatedTx.rows[0].quarantined_objects).toEqual({ campaign: 'orphan_camp_999' });

      // Check incident logged
      const incidents = await pool.query(`SELECT * FROM meta_reconciliation_incidents WHERE transaction_id = $1`, [txId]);
      expect(incidents.rows.length).toBeGreaterThan(0);
      expect(incidents.rows[0].mismatch_type).toBe('ORPHAN_UNSAFE_OBJECT_QUARANTINED');
      expect(incidents.rows[0].details.remediation_result).toBe('QUARANTINED');

      // Zero DELETE calls
      expect(fetchedCalls.filter(c => c.method === 'DELETE').length).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('3. Already-quarantined object → no duplicate remediation requests emitted on repeated reconciliation', async () => {
    const corr = `${correlationIdBase}-already-quarantined`;
    const txKey = `idemp-${corr}`;

    const txInsert = await pool.query(`
      INSERT INTO meta_publishing_transactions (idempotency_key, correlation_id, publish_status, meta_campaign_id)
      VALUES ($1, $2, 'QUARANTINED', 'already_q_123')
      RETURNING id
    `, [txKey, corr]);
    const txId = txInsert.rows[0].id;

    const postCalls: string[] = [];
    const originalFetch = global.fetch;

    global.fetch = async (url: any, opts: any = {}) => {
      const urlStr = String(url);
      const method = (opts.method || 'GET').toUpperCase();
      if (method === 'POST') postCalls.push(urlStr);

      if (method === 'GET' && urlStr.includes('already_q_123')) {
        return new Response(JSON.stringify({ id: 'already_q_123', status: 'PAUSED', name: `[FAILED_ROLLBACK_${corr}]_Campaign_already_q_123` }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: { code: 100 } }), { status: 404, headers: { 'content-type': 'application/json' } });
    };

    try {
      await processMetaReconciliation(pool, 'test_token');

      // Verify ZERO POST mutation requests were sent
      expect(postCalls.length).toBe(0);

      const updatedTx = await pool.query(`SELECT publish_status FROM meta_publishing_transactions WHERE id = $1`, [txId]);
      expect(updatedTx.rows[0].publish_status).toBe('QUARANTINED');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('4. Meta timeout during reconciliation → preserves EXTERNAL_OUTCOME_UNKNOWN without failing transaction', async () => {
    const corr = `${correlationIdBase}-timeout`;
    const txKey = `idemp-${corr}`;

    const txInsert = await pool.query(`
      INSERT INTO meta_publishing_transactions (idempotency_key, correlation_id, publish_status, meta_campaign_id, updated_at)
      VALUES ($1, $2, 'EXTERNAL_OUTCOME_UNKNOWN', 'timeout_camp_555', NOW() - INTERVAL '10 minutes')
      RETURNING id
    `, [txKey, corr]);
    const txId = txInsert.rows[0].id;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new TypeError('fetch failed - ETIMEDOUT');
    };

    try {
      await processMetaReconciliation(pool, 'test_token');

      const updatedTx = await pool.query(`SELECT publish_status FROM meta_publishing_transactions WHERE id = $1`, [txId]);
      // State MUST remain EXTERNAL_OUTCOME_UNKNOWN, not converted to FAILED
      expect(updatedTx.rows[0].publish_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

      const incidents = await pool.query(`SELECT * FROM meta_reconciliation_incidents WHERE transaction_id = $1`, [txId]);
      expect(incidents.rows.length).toBeGreaterThan(0);
      expect(incidents.rows[0].mismatch_type).toBe('EXTERNAL_STATE_UNKNOWN');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('5. Configuration mismatch on SUCCESS transaction → recorded in meta_reconciliation_incidents', async () => {
    const corr = `${correlationIdBase}-config-mismatch`;
    const txKey = `idemp-${corr}`;

    // Create a mock campaign with budget 100.00
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, title, budget, status)
      VALUES ($1, 'Config Test Campaign', 100.00, 'CAMPAIGN_LIVE')
      RETURNING id
    `, [testUserId]);
    const campaignId = campRes.rows[0].id;

    const txInsert = await pool.query(`
      INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, meta_campaign_id)
      VALUES ($1, $2, $3, 'SUCCESS', 'camp_mismatch_888')
      RETURNING id
    `, [campaignId, txKey, corr]);
    const txId = txInsert.rows[0].id;

    const originalFetch = global.fetch;
    global.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('camp_mismatch_888')) {
        // Meta has budget 200000 cents ($2000.00), local has $100.00 (10000 cents)
        return new Response(JSON.stringify({ id: 'camp_mismatch_888', status: 'ACTIVE', name: 'Live Campaign', daily_budget: '200000' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: { code: 100 } }), { status: 404, headers: { 'content-type': 'application/json' } });
    };

    try {
      await processMetaReconciliation(pool, 'test_token');

      const incidents = await pool.query(`SELECT * FROM meta_reconciliation_incidents WHERE transaction_id = $1`, [txId]);
      expect(incidents.rows.length).toBeGreaterThan(0);
      expect(incidents.rows[0].mismatch_type).toBe('CONFIGURATION_MISMATCH');
      expect(incidents.rows[0].details.message).toContain('budget mismatch');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
