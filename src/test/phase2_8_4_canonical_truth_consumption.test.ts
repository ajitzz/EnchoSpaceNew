import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import app from '../../server.ts';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

describe('Phase 2.8.4 Canonical Truth Consumption', () => {
  let hostToken: string;
  let testHostId: number;
  let testListingId: number;
  let testCampaignId: number;

  beforeAll(async () => {
    // Clean up any lingering data
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE title = 'Truth Projection Test Camp'`);
    await pool.query(`DELETE FROM users WHERE email = 'test_host_p284@encho.com'`);

    // Setup Test User
    const hostRes = await pool.query(`INSERT INTO users (email, name, role) VALUES ('test_host_p284@encho.com', 'Test Host P284', 'host') RETURNING id`);
    testHostId = hostRes.rows[0].id;
    hostToken = jwt.sign({ id: testHostId, role: 'host' }, process.env.JWT_SECRET || 'test_secret_for_unit_test');

    // Setup Test Listing
    const listRes = await pool.query(`INSERT INTO listings (title, user_id, address, type, bedrooms, price, city, country, max_guests, beds, bathrooms) VALUES ('Test Listing', $1, '123 Test St', 'villa', 1, 100, 'City', 'Country', 2, 1, 1) RETURNING id`, [testHostId]);
    testListingId = listRes.rows[0].id;

    // Trigger DB initialization before tests run
    console.log('Triggering DB initialization...');
    await request(app).get('/api/health-check-for-db-init').catch(() => {});
    console.log('DB initialization finished.');
  }, 30000);

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    }
    if (testListingId) await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    if (testHostId) await pool.query('DELETE FROM users WHERE id = $1', [testHostId]);
    await pool.end();
  });

  it('Backend canonical truth correctly suppresses old status inferences and provides correct payload to the frontend', async () => {
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns 
      (title, listing_id, host_id, status, budget, admin_approved, escrow_status, payment_status, meta_campaign_id) 
      VALUES ('Truth Projection Test Camp', $1, $2, 'active', 150, true, 'released', 'paid', 'act_12345_real_meta_id') RETURNING id`, 
      [testListingId, testHostId]
    );
    testCampaignId = campRes.rows[0].id;

    // Fetch as Host to verify Host Truth Projection
    const res = await request(app)
      .get('/api/marketing/campaigns')
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    const campaigns = res.body;
    expect(campaigns.length).toBeGreaterThan(0);
    
    const targetCampaign = campaigns.find((c: any) => c.id === testCampaignId);
    expect(targetCampaign).toBeDefined();

    // Verify truth projection presence
    expect(targetCampaign.truth).toBeDefined();

    // The host projection should contain allowed_actions and operational_status
    expect(targetCampaign.truth.operational_status).toBeDefined();
    expect(targetCampaign.truth.allowed_actions).toBeInstanceOf(Array);
    
    // Assert no synthetic meta ID string
    expect(targetCampaign.truth.meta_link?.meta_campaign_id).toBe('act_12345_real_meta_id');
    expect(targetCampaign.truth.meta_link?.meta_campaign_id).not.toContain('act_8849203_');

    // Assert operational status info is formed
    expect(targetCampaign.truth.operational_status_info).toBeDefined();
    expect(targetCampaign.truth.operational_status_info.badge_color).toBeDefined();
  });
});
