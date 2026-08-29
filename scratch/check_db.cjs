const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const { rows: listings } = await pool.query('SELECT id, image_urls, photos, rooms FROM listings');
  console.log(JSON.stringify(listings, null, 2));
  process.exit(0);
}
check();
