const { Pool } = require('pg');
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error('DATABASE_URL_UNPOOLED is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
async function test() {
  const res = await pool.query("SELECT id FROM users WHERE email = 'ajithsabzz@gmail.com'");
  console.log(res.rows);
  await pool.end();
}
test();
