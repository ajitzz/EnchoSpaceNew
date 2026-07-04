const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_4cbpQjKtym9n@ep-small-smoke-a1vjxk25.ap-southeast-1.aws.neon.tech/neondb';
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const userRes = await pool.query("SELECT id FROM users WHERE email = 'ajithsabzz@gmail.com'");
    if (userRes.rows.length === 0) {
      console.log('User not found');
      return;
    }
    const userId = userRes.rows[0].id;
    console.log('User ID:', userId);

    const result = await pool.query(`
      INSERT INTO experiences (
        title, description, destination, departure_location, start_date, end_date, 
        price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, 
        places_to_visit, included_stay, highlights, things_to_carry, important_notes, 
        video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) 
      RETURNING *
    `, [
      'Neon Lights Cyberpunk Tokyo Tour',
      'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
      'Tokyo, Japan',
      'Tokyo Narita Airport',
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
      1599,
      12,
      12,
      JSON.stringify([{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}]),
      ['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide'],
      ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'],
      userId,
      'upcoming',
      'all',
      JSON.stringify([{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}]),
      JSON.stringify({title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}),
      JSON.stringify(['Cyberpunk Photography Walk', 'Underground Arcade Tournament']),
      JSON.stringify(['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing']),
      'This trip involves a lot of walking in crowded areas.',
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['Flights', 'Personal Shopping', 'Alcohol'],
      '18:00',
      '23:00',
      'English, Japanese (Basic)',
      'Free cancellation 15 days prior. 50% refund within 7 days.',
      'https://goo.gl/maps/shibuya'
    ]);
    console.log('Inserted:', result.rows[0].id);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
