const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query('SELECT * FROM meta_publishing_transactions WHERE id = 29');
  console.log(res.rows);
  process.exit(0);
}
run();
