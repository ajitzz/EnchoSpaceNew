const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query('SELECT id, publish_status, failure_code, failure_stage, error_details FROM meta_publishing_transactions ORDER BY id DESC LIMIT 1');
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}
run();
