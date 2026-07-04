const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL + '&sslmode=require', ssl: { rejectUnauthorized: false }  });
async function run() {
  try {
    const r = await pool.query("SELECT l.*, w.id as wishlist_id FROM wishlists w JOIN listings l ON w.listing_id = l.id WHERE w.user_id = $1", [1]);
    console.log(r.rows);
  } catch(e) { console.error(e.message); }
  pool.end();
}
run();
