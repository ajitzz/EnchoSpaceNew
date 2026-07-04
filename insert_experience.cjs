const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const insertExperience = async () => {
  try {
    const title = 'Neon Lights Cyberpunk Tokyo Tour';
    const description = 'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.';
    const destination = 'Tokyo, Japan';
    const departure_location = 'Tokyo Narita Airport';
    const start_date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const end_date = new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString();
    const price = 1599;
    const total_spots = 12;
    const available_spots = 12;
    const itinerary = JSON.stringify([
      {day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'},
      {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}
    ]);
    const includes = JSON.stringify(['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide']);
    const image_urls = JSON.stringify(['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800']);
    const video_urls = JSON.stringify(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
    const places_to_visit = JSON.stringify([{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}]);
    const included_stay = JSON.stringify({
      title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'
    });
    const highlights = JSON.stringify(['Cyberpunk Photography Walk', 'Underground Arcade Tournament']);
    const things_to_carry = JSON.stringify(['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing']);
    const important_notes = 'This trip involves a lot of walking in crowded areas.';
    const host_id = 1;
    const status = 'upcoming'; // Or 'draft'
    const target_audience = 'all';
    const excludes = JSON.stringify(['Flights', 'Personal Shopping', 'Alcohol']);
    const start_time = '18:00';
    const end_time = '23:00';
    const language = 'English, Japanese (Basic)';
    const cancellation_policy = 'Free cancellation 15 days prior. 50% refund within 7 days.';
    const map_link = 'https://goo.gl/maps/shibuya';

    const result = await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING *
    `, [title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link]);

    console.log('Inserted Experience ID:', result.rows[0].id);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
};

insertExperience();
