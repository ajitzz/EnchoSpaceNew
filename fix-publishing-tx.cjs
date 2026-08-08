const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  const res = await pool.query(`UPDATE meta_publishing_transactions SET publish_status = 'FAILED_PUBLISH' WHERE publish_status = 'PUBLISHING'`);
  console.log('Fixed stuck transactions:', res.rowCount);
  pool.end();
}
fix();
