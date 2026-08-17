const { Pool } = require('pg');

async function test(connectionString, name) {
  console.log(`Testing ${name}...`);
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query('SELECT 1');
    console.log(`🟢 ${name} SUCCESS:`, res.rows);
  } catch (err) {
    console.error(`❌ ${name} ERROR:`, err.message);
  } finally {
    await pool.end();
  }
}

async function run() {
  await test('postgresql://neondb_owner:npg_jiDCK9V1XHTv@ep-shiny-silence-a1h29u8k.ap-southeast-1.aws.neon.tech/neondb?sslmode=require', 'Neon Shiny Silence');
}

run();
