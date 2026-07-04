const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    console.log("Dropping defaults...");
    await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls DROP DEFAULT`);
    await pool.query(`ALTER TABLE listings ALTER COLUMN amenities DROP DEFAULT`);

    console.log("Migrating image_urls...");
    await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls TYPE JSONB USING array_to_json(image_urls)::jsonb`);
    console.log("Migrating amenities...");
    await pool.query(`ALTER TABLE listings ALTER COLUMN amenities TYPE JSONB USING array_to_json(amenities)::jsonb`);
    
    // Also ensure DEFAULT is '[]'::jsonb
    await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE listings ALTER COLUMN amenities SET DEFAULT '[]'::jsonb`);
    console.log("Migration complete.");
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

migrate();
