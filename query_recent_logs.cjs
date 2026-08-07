const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query("SELECT id, status, admin_feedback, meta_campaign_id, meta_adset_id, meta_creative_id, meta_ad_id, meta_sync_logs FROM host_marketing_campaigns ORDER BY id DESC LIMIT 5");
  if (res.rows.length > 0) {
    console.log(JSON.stringify(res.rows, null, 2));
  } else {
    console.log("No campaigns found.");
  }
  pool.end();
}
run();
