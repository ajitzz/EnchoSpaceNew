const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
     await pool.query('ALTER TABLE wallet_transactions ADD CONSTRAINT unique_reference_id UNIQUE (reference_id)');
     console.log('Added unique constraint on wallet_transactions.reference_id');
  } catch (e) {
     console.log('Error or already exists:', e.message);
  }
  pool.end();
}
run();
