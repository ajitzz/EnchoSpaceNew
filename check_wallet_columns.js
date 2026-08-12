import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_transactions'");
    console.log(res.rows.map(r => r.column_name));
    const res2 = await pool.query("SELECT * FROM wallet_transactions");
    console.log(res2.rows);
  } catch(e) {
    console.log(e.message);
  }
  pool.end();
}
check();
