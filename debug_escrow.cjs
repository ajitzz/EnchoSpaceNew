const jwt = require('jsonwebtoken');
const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adminToken = jwt.sign({ userId: 99999, role: 'admin' }, process.env.JWT_SECRET || 'test_secret_for_unit_test');

async function run() {
  process.env.META_PUBLISHING_PAUSED = 'true';
  const hostRes = await pool.query(`INSERT INTO users (email, name, role) VALUES ('debug_${Date.now()}@test.com', 'Debug', 'host') RETURNING id`);
  const hostId = hostRes.rows[0].id;
  const listRes = await pool.query(`INSERT INTO listings (title, user_id, address, type, bedrooms, price, city, country, max_guests, beds, bathrooms) VALUES ('Test', $1, '123', 'villa', 1, 100, 'City', 'Country', 2, 1, 1) RETURNING id`, [hostId]);
  const listId = listRes.rows[0].id;
  
  const campRes = await pool.query(`
    INSERT INTO host_marketing_campaigns 
    (title, listing_id, host_id, status, budget, admin_approved, escrow_status, payment_status) 
    VALUES ('Test Camp', $1, $2, 'approved', 150, true, 'holding', 'paid') RETURNING id`,
    [listId, hostId]
  );
  const testCampaignId = campRes.rows[0].id;
  
  const res = await fetch('http://localhost:3000/api/admin/payments/escrow/release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ campaign_id: testCampaignId })
  });
  const text = await res.text();
  console.log("RESPONSE:", res.status, text);
  process.exit(0);
}
run();
