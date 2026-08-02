require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res4 = await pool.query(`
      SELECT id, media_urls FROM host_marketing_campaigns WHERE media_urls::text LIKE '%localhost%';
    `);
    console.log('Campaigns with localhost media_urls:', res4.rows.length);
    if (res4.rows.length > 0) {
        console.log(res4.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
