const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const updateExperience = async () => {
  try {
    const title = 'Neon Lights Cyberpunk Tokyo Tour - UPDATED';
    const description = 'Updated description';
    const destination = 'Tokyo, Japan';
    const departure_location = 'Tokyo Narita Airport';
    const start_date = new Date().toISOString();
    const end_date = new Date().toISOString();
    const price = 1600;
    const total_spots = 10;
    const available_spots = 10;
    const itinerary = JSON.stringify([]);
    const includes = JSON.stringify(['Test Include']);
    const image_urls = JSON.stringify(['http://example.com/img.jpg']);
    const places_to_visit = JSON.stringify([]);
    const included_stay = null;
    const highlights = JSON.stringify([]);
    const things_to_carry = JSON.stringify([]);
    const important_notes = null;
    const status = 'upcoming';
    const target_audience = 'all';
    const excludes = JSON.stringify([]);
    const video_urls = JSON.stringify([]);
    const start_time = null;
    const end_time = null;
    const language = 'English';
    const cancellation_policy = null;
    const map_link = null;

    const result = await pool.query(`
      UPDATE experiences SET 
        title = $1, description = $2, destination = $3, departure_location = $4, start_date = $5, end_date = $6, price = $7, total_spots = $8, available_spots = $9, itinerary = $10, includes = $11, image_urls = $12, status = $13, target_audience = $14, places_to_visit = $15, included_stay = $16, highlights = $17, things_to_carry = $18, important_notes = $19, video_urls = $20, excludes = $21, start_time = $22, end_time = $23, language = $24, cancellation_policy = $25, map_link = $26
      WHERE id = $27 RETURNING *
    `, [title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, 2]);

    console.log('Updated:', result.rows[0]);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
};

updateExperience();
