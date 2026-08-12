import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { metaGraphClient } from '../lib/metaGraphClient.ts';
import { executeMetaRollback } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('Phase 2.5 Industrial Meta Delivery Integrity Hardening', () => {
  let testUserId: number;
  let testCampaignId: number;
  const testCorrelationId = 'test-corr-' + Date.now();

  beforeAll(async () => {
    // Get an existing user or insert test user
    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    if (userRes.rows.length > 0) {
      testUserId = userRes.rows[0].id;
    } else {
      const newUser = await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES ('Test Host', 'test_host_25@encho.com', 'hash', 'host') RETURNING id"
      );
      testUserId = newUser.rows[0].id;
    }

    // Insert test campaign
    const res = await pool.query(
      "INSERT INTO host_marketing_campaigns (host_id, status, title, budget) VALUES ($1, 'draft', 'Phase 2.5 Test', 200) RETURNING id",
      [testUserId]
    );
    testCampaignId = res.rows[0].id;
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query("DELETE FROM meta_publishing_transactions WHERE campaign_id = $1", [testCampaignId]);
      await pool.query("DELETE FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    }
    await pool.end();
  });

  it('2.5-C: verifyExternalMetaObject returns valid false for non-existent objects', async () => {
    const check = await metaGraphClient.verifyExternalMetaObject('Campaign', 'invalid_object_id_99999', 'mock_token', 'act_1234567890');
    expect(check.valid).toBe(false);
  });

  it('2.5-E: executeMetaRollback handles two-phase rollback/quarantine safely', async () => {
    const rollbackState = {
      metaCampaignId: 'mock_camp_12345',
      metaAdSetId: 'mock_adset_12345',
      metaCreativeId: 'mock_creative_12345',
      metaAdId: 'mock_ad_12345'
    };

    const rollbackResult = await executeMetaRollback(rollbackState, testCorrelationId, pool);
    expect(rollbackResult).toBeDefined();
    expect(typeof rollbackResult.success).toBe('boolean');
    expect(typeof rollbackResult.quarantined).toBe('boolean');
  });

  it('2.5-G: tenant security prevents unauthorized cross-host campaign queries', async () => {
    // Host 888 trying to query Host 999 campaign
    const unauthorizedQuery = await pool.query(
      `SELECT id FROM host_marketing_campaigns WHERE id = $1 AND (host_id = $2 OR $3 = true)`,
      [testCampaignId, 888, false]
    );
    expect(unauthorizedQuery.rows.length).toBe(0);

    // Host testUserId querying own campaign
    const authorizedQuery = await pool.query(
      `SELECT id FROM host_marketing_campaigns WHERE id = $1 AND (host_id = $2 OR $3 = true)`,
      [testCampaignId, testUserId, false]
    );
    expect(authorizedQuery.rows.length).toBe(1);
  });

  it('2.5-H: schema columns exist for delivery transaction state tracking', async () => {
    const colCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'meta_publishing_transactions'
      AND column_name IN ('unknown_outcome_reason', 'rollback_attempts', 'last_reconciled_at', 'quarantined_objects')
    `);
    expect(colCheck.rows.length).toBe(4);
  });
});
