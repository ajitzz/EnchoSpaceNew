const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  try {
    await pool.query(`
      ALTER TABLE listings 
      ADD COLUMN IF NOT EXISTS publication_status VARCHAR(50) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
    `);
    console.log("Added publication_status and slug to listings.");
    
    // We should update existing listings so they appear in public feed
    await pool.query(`
      UPDATE listings 
      SET publication_status = 'published',
          slug = 'property-' || id
      WHERE publication_status = 'draft' OR slug IS NULL;
    `);
    console.log("Updated existing listings to be published with generated slugs.");
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}
fix();
