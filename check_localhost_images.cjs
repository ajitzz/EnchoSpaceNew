require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT id, images FROM listings WHERE images::text LIKE '%localhost%';
    `);
    console.log('Listings with localhost images:', res.rows.length);
    if (res.rows.length > 0) {
      console.log(res.rows[0]);
    }
    
    const res2 = await pool.query(`
      SELECT id, ad_creatives FROM marketing_campaigns WHERE ad_creatives::text LIKE '%localhost%';
    `);
    console.log('Campaigns with localhost images:', res2.rows.length);
    if (res2.rows.length > 0) {
      console.log(res2.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
