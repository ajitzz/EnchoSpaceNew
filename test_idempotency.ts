import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const res = await pool.query('SELECT idempotency_key, COUNT(*) FROM meta_publishing_transactions GROUP BY idempotency_key HAVING COUNT(*) > 1');
  console.log('Duplicates:', res.rows);
  pool.end();
}
check();
