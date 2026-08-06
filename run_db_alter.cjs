const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
     await pool.query('ALTER TABLE messages ADD COLUMN is_sanitized BOOLEAN DEFAULT false');
     console.log('Added is_sanitized column');
  } catch (e) {
     console.log('Error or already exists:', e.message);
  }
  pool.end();
}
run();
