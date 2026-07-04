const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  try {
    const expCols = ['includes', 'image_urls', 'video_urls', 'excludes', 'places_to_visit', 'highlights', 'things_to_carry'];
    for (const col of expCols) {
      const res = await pool.query(`UPDATE experiences SET ${col} = '[]'::jsonb WHERE jsonb_typeof(${col}) != 'array' OR ${col} IS NULL`);
      console.log(`Updated ${res.rowCount} rows in experiences for column ${col}`);
    }

    const listingCols = ['image_urls', 'amenities', 'rooms'];
    for (const col of listingCols) {
      const res = await pool.query(`UPDATE listings SET ${col} = '[]'::jsonb WHERE jsonb_typeof(${col}) != 'array' OR ${col} IS NULL`);
      console.log(`Updated ${res.rowCount} rows in listings for column ${col}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

fix();
