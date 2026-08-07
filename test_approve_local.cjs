require('dotenv').config({ override: true });
async function run() {
  const fetch = (await import('node-fetch')).default;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('UPDATE host_marketing_campaigns SET status = $1, meta_campaign_id = NULL, meta_adset_id = NULL WHERE id = 17', ['PENDING_ADMIN_REVIEW']);
  console.log('Reset campaign 17');
  
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: 1, role: 'admin', email: 'admin@encho.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  try {
    const res = await fetch('http://localhost:3000/api/admin/marketing/campaigns/17/approve', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(res.status);
    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
