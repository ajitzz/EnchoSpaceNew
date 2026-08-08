const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await pool.query("UPDATE meta_publishing_transactions SET publish_status = 'FAILED' WHERE id = 7");
  console.log("Updated tx 7");
  process.exit(0);
}
run();
