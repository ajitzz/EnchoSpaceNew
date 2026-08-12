import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function test() {
  try {
    await pool.query('INSERT INTO listings (user_id, title, description, price, type, address, city) VALUES (9999, $1, $2, $3, $4, $5, $6)', ['test', 'test', 100, 'test', 'test', 'test']);
  } catch(e) {
    console.error(e.message);
  }
  pool.end();
}
test();
