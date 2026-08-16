import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query(`
    SELECT * FROM meta_publishing_transactions ORDER BY id DESC LIMIT 5
  `);
  console.log(res.rows);
  pool.end();
}
run();
