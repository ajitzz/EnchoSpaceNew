const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || 'postgresql://neondb_owner:npg_4cbpQjKtym9n@ep-small-smoke-a1vjxk25.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function test() {
  const res = await pool.query("SELECT * FROM experiences WHERE title = 'Neon Lights Cyberpunk Tokyo Tour'");
  console.log(res.rows);
  await pool.end();
}
test();
