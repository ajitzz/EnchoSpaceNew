require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const event = {
    host_id: 1,
    title: 'Neon Lights Cyberpunk Tokyo Tour',
    description: 'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
    destination: 'Tokyo, Japan',
    departure_location: 'Tokyo Narita Airport',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '18:00',
    end_time: '23:00',
    language: 'English, Japanese (Basic)',
    cancellation_policy: 'Free cancellation 15 days prior. 50% refund within 7 days.',
    map_link: 'https://goo.gl/maps/shibuya',
    price: 1599,
    total_spots: 12,
    available_spots: 12,
    itinerary: [{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}],
    includes: ['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide'],
    excludes: ['Flights', 'Personal Shopping', 'Alcohol'],
    image_urls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'],
    video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    places_to_visit: [{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}],
    included_stay: {title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'},
    highlights: ['Cyberpunk Photography Walk', 'Underground Arcade Tournament'],
    things_to_carry: ['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing'],
    important_notes: 'This trip involves a lot of walking in crowded areas.',
    target_audience: 'all',
    status: 'published'
};

async function seed() {
  await pool.query(`
        INSERT INTO experiences (
          title, description, destination, departure_location, start_date, end_date, price, 
          total_spots, available_spots, itinerary, includes, image_urls, host_id, status, 
          target_audience, places_to_visit, included_stay, highlights, things_to_carry, 
          important_notes, video_urls, excludes, start_time, end_time, language, 
          cancellation_policy, map_link
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
      `, [
        event.title, event.description, event.destination, event.departure_location, 
        event.start_date, event.end_date, event.price, event.total_spots, event.available_spots, 
        JSON.stringify(event.itinerary), JSON.stringify(event.includes), JSON.stringify(event.image_urls), 
        event.host_id, event.status, event.target_audience, JSON.stringify(event.places_to_visit), 
        JSON.stringify(event.included_stay), JSON.stringify(event.highlights), JSON.stringify(event.things_to_carry), 
        event.important_notes, JSON.stringify(event.video_urls), JSON.stringify(event.excludes), 
        event.start_time, event.end_time, event.language, event.cancellation_policy, event.map_link
      ]);
  console.log("Seeded");
  pool.end();
}
seed();
