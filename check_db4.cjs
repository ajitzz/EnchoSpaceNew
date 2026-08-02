require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'experiences';
    `);
    console.log('experiences columns:', res.rows.map(r => r.column_name));
    
    if (res.rows.find(r => r.column_name === 'image_urls' || r.column_name === 'media_urls')) {
        const res3 = await pool.query(`
          SELECT id, image_urls FROM experiences WHERE image_urls::text LIKE '%localhost%';
        `);
        console.log('Experiences with localhost images:', res3.rows.length);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
