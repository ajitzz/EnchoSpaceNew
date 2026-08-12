import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  try {
    const res = await pool.query('SELECT count(*) FROM users');
    console.log("Users count:", res.rows[0].count);
    const res2 = await pool.query('SELECT count(*) FROM listings');
    console.log("Listings count:", res2.rows[0].count);
  } catch(e) {
    console.error(e.message);
  }
  pool.end();
}
check();
