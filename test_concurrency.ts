import { Pool } from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createCampaign() {
  const hostRes = await pool.query(`INSERT INTO users (email, name, role, created_at, updated_at) VALUES ($1, 'Test', 'host', NOW(), NOW()) RETURNING id`, ['test_' + crypto.randomUUID() + '@example.com']);
  const hostId = hostRes.rows[0].id;
  const listRes = await pool.query(`INSERT INTO listings (host_id, title, description, city, created_at, updated_at) VALUES ($1, 'Test', 'Test', 'Test', NOW(), NOW()) RETURNING id`, [hostId]);
  const listId = listRes.rows[0].id;
  const campRes = await pool.query(`INSERT INTO host_marketing_campaigns (host_id, listing_id, name, budget, status, payment_status, created_at, updated_at) VALUES ($1, $2, 'Test Camp', 100, 'ASSET_PREP', 'paid', NOW(), NOW()) RETURNING id`, [hostId, listId]);
  return campRes.rows[0].id;
}

// We will use axios to hit the admin endpoint that calls dispatchMetaCampaign
// Wait, the admin resync endpoint: /api/admin/marketing/campaigns/:id/resync
