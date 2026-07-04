const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_4cbpQjKtym9n@ep-small-smoke-a1vjxk25.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'all'`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS things_to_carry JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS important_notes TEXT`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS video_urls JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS excludes JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS start_time VARCHAR(100)`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS end_time VARCHAR(100)`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS language VARCHAR(100) DEFAULT 'English'`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS cancellation_policy TEXT`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS map_link TEXT`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS places_to_visit JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS included_stay JSONB`);
    console.log("Successfully updated user's production DB!");
  } catch(e) {
    console.error("Error:", e);
  } finally {
    pool.end();
  }
}
run();
