require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res2 = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'host_marketing_campaigns';
    `);
    console.log('host_marketing_campaigns columns:', res2.rows.map(r => r.column_name));
    
    const res3 = await pool.query(`
      SELECT id, image_urls, image_url, video_url FROM listings WHERE (image_urls::text LIKE '%localhost%' OR image_url LIKE '%localhost%');
    `);
    console.log('Listings with localhost images:', res3.rows.length);
    
    const res4 = await pool.query(`
      SELECT id, ad_creatives FROM host_marketing_campaigns WHERE ad_creatives::text LIKE '%localhost%';
    `);
    console.log('Campaigns with localhost ad_creatives:', res4.rows.length);
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
