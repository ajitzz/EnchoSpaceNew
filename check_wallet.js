import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query('SELECT * FROM wallet_transactions WHERE metadata->>\'campaign_id\' = \'1\' OR reference_id = \'1\'');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    // maybe no wallet table
    console.log(e.message);
  }
  pool.end();
}
check();
