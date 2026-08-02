require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'host_marketing_campaigns';
    `);
    console.log('host_marketing_campaigns columns:', res.rows.filter(r => r.data_type === 'numeric'));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
