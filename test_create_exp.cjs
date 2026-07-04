const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    const result = await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING *
    `, ['Test title', 'Test desc', 'Dest', 'Dep', '2025-01-01', '2025-01-02', 999, 10, 10, JSON.stringify([]), [], [], 1, 'upcoming', 'all', JSON.stringify([]), null, JSON.stringify([]), JSON.stringify([]), null, [], [], null, null, 'English', null, null]);
    console.log("Success:", result.rows[0].id);
  } catch (err) {
    console.error("Error executing query:");
    console.error(err.message);
  } finally {
    pool.end();
  }
}

main();
