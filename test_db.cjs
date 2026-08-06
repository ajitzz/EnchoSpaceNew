const { Pool } = require('pg');
require('dotenv').config();

// Fix connection string if needed
let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes('?')) {
    dbUrl = dbUrl.split('?')[0];
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT 1 as test');
    console.log(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
