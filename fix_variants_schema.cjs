const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS meta_creative_id VARCHAR(255);`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS variant_activated_at TIMESTAMP;`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS media_url TEXT;`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);`);
    await pool.query(`ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS asset_sha256 VARCHAR(255);`);
    console.log("Variant schema fixed.");
  } catch(e) { console.error(e); } finally { pool.end(); }
}
run();
