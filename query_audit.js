import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query("SELECT * FROM admin_audit_logs WHERE entity_id = '1' ORDER BY created_at DESC LIMIT 5");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.log(e.message);
  }
  pool.end();
}
check();
