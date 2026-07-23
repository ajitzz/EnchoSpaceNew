const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const settings = {
    hero_title: "Find Somewhere\nWorth Going.",
    hero_subtitle: "Explore curated journeys, secret hideaways, and unforgettable moments across the globe.",
    badge_text: "The Amigove Collection",
    hero_image_urls: ['https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=2400']
  };

  try {
    const res = await pool.query(`
      INSERT INTO settings (key, value) 
      VALUES ($1, $2) 
      ON CONFLICT (key) DO UPDATE 
      SET value = $2
    `, ['experiences_page', settings]);
    console.log("Updated settings", res.rowCount);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
