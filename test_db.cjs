const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query('SELECT error_details FROM meta_publishing_transactions WHERE id = 31');
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}
run();
