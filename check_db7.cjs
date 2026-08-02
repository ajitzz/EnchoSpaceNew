require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT id, avatar_url FROM users WHERE avatar_url LIKE '%localhost%';
    `);
    console.log('Users with localhost avatars:', res.rows.length);
    if (res.rows.length > 0) {
      console.log(res.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
