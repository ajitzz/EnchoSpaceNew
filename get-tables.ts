import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL?.replace(/sslmode=[^&?#]*/, '') + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'sslmode=require';
const pool = new Pool({ connectionString: dbUrl });

async function run() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log(res.rows.map(r => r.table_name));
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
