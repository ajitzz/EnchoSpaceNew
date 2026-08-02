require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'listings';
    `);
    console.log('listings columns:', res.rows.map(r => r.column_name));
    
    const res2 = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'marketing_campaigns';
    `);
    console.log('marketing_campaigns columns:', res2.rows.map(r => r.column_name));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
