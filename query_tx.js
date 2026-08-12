import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query('SELECT * FROM meta_publishing_transactions WHERE campaign_id = 1 ORDER BY created_at DESC LIMIT 5');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error(e.message);
  }
  pool.end();
}
check();
