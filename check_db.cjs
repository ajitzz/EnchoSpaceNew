const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_DS7vjuFc0efR@ep-muddy-sun-aoyw9d8l-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });
async function check() {
  try {
    const res = await pool.query('SELECT count(*) FROM listings');
    console.log('Listings count:', res.rows[0].count);
    
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    console.log('Tables:', tables.rows.map(r => r.table_name));
    
    // Check listings schema if exists
    if (tables.rows.some(r => r.table_name === 'listings')) {
        const listingRes = await pool.query('SELECT * FROM listings LIMIT 1');
        console.log('First listing:', listingRes.rows);
    }
  } catch(e) {
    console.error('DB Error:', e);
  } finally {
    pool.end();
  }
}
check();
