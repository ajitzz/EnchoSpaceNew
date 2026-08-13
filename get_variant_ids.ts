import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 241;
    const variantsRes = await pool.query(`SELECT id, meta_creative_id FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`, [cid]);
    console.log(variantsRes.rows);
    await pool.end();
}
run();
