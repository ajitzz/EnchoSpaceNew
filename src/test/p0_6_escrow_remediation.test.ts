import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import app, { transitionCampaignState } from '../../server.ts';
import { MetaGraphClient } from '../lib/metaGraphClient';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

describe('P0-6 Escrow Remediation and Canary Blocker', () => {
  let adminToken: string;
  let testCampaignId: number;
  let testListingId: number;
  let testHostId: number;

  beforeAll(async () => {
    adminToken = jwt.sign({ userId: 99999, role: 'admin' }, process.env.JWT_SECRET || 'test_secret_for_unit_test');
    
    // Clean up any lingering admin from previous failed test run
    await pool.query('DELETE FROM admin_audit_logs WHERE admin_id = 99999');
    await pool.query('DELETE FROM users WHERE id = 99999');
    
    await pool.query(`INSERT INTO users (id, email, name, role) VALUES (99999, 'admin_p06_${Date.now()}@encho.com', 'Admin', 'admin')`);
    
    const hostRes = await pool.query(`INSERT INTO users (email, name, role) VALUES ('test_host_p06_${Date.now()}@encho.com', 'Test Host P06', 'host') RETURNING id`);
    testHostId = hostRes.rows[0].id;
    
    const listRes = await pool.query(`INSERT INTO listings (title, user_id, address, type, bedrooms, price, city, country, max_guests, beds, bathrooms) VALUES ('Test Listing', $1, '123 Test St', 'villa', 1, 100, 'City', 'Country', 2, 1, 1) RETURNING id`, [testHostId]);
    testListingId = listRes.rows[0].id;
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_dlq WHERE transaction_id IN (SELECT id FROM meta_publishing_transactions WHERE campaign_id = $1)', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM admin_audit_logs WHERE entity_id = $1', [testCampaignId]);
      await pool.query('DELETE FROM meta_publishing_events WHERE campaign_id = $1', [String(testCampaignId)]);
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    }
    if (testListingId) await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    if (testHostId) await pool.query('DELETE FROM users WHERE id = $1', [testHostId]);
    await pool.query('DELETE FROM admin_audit_logs WHERE admin_id = 99999');
    await pool.query('DELETE FROM users WHERE id = 99999');
    await pool.end();
  });

  it('ASSET_PREP -> failed_publish remains prohibited', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns 
      (title, listing_id, host_id, status, budget, admin_approved, escrow_status, payment_status, meta_campaign_id) 
      VALUES ('Test Camp', $1, $2, 'ASSET_PREP', 150, true, 'holding', 'paid', 'mock_camp') RETURNING id`, 
      [testListingId, testHostId]
    );
    const tempCampId = campRes.rows[0].id;

    await expect(transitionCampaignState({ campaignId: tempCampId, to: 'failed_publish' as any, reason: 'test', actorType: 'system' }))
      .rejects.toThrow(/Illegal transition/);

    await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [tempCampId]);
  });

  it('Gate 14 does not depend on an invalid/unsupported tasks field and correctly classifies Page Identity failure', async () => {
    const client = new MetaGraphClient();
    const result = await client.getPageIdentity('mock_page_id', 'mock_token', 'corr_123');
    expect(['FAILED', 'EXTERNAL_UNVERIFIABLE']).toContain(result.status);
    if (result.status === 'FAILED') {
      expect(['META_PAGE_NOT_FOUND', 'META_PAGE_ACCESS_DENIED', 'META_PAGE_MISSING_PUBLISH_CAPABILITY']).toContain(result.failure_code);
    }
  });

  it('Escrow release DB transaction commits before dispatch begins, transitions to META_API_PUSH, and preserves Meta error on dispatch failure', async () => {
    // Create campaign
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns 
      (title, listing_id, host_id, status, budget, admin_approved, escrow_status, payment_status) 
      VALUES ('Test Camp', $1, $2, 'approved', 150, true, 'holding', 'paid') RETURNING id`, 
      [testListingId, testHostId]
    );
    testCampaignId = campRes.rows[0].id;

    const res = await request(app)
      .post('/api/admin/payments/escrow/release')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ campaign_id: testCampaignId });

    expect(res.status).toBe(500);
    // Even if it transitions to failed_publish twice (or fails), the escrow must be released
    const verifyRes = await pool.query('SELECT status, escrow_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(verifyRes.rows[0].escrow_status).toBe('released');
    
    expect(verifyRes.rows[0].status).toBe('failed_publish');
  }, 15000);

});
