const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || 'postgresql://neondb_owner:npg_4cbpQjKtym9n@ep-small-smoke-a1vjxk25.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

const hostId = 1;

const events = [
  {
    title: 'Himalayan Zen Retreat & Monastic Experience',
    description: 'Immerse yourself in ancient monastic traditions deep in the Himalayas. This spiritual journey offers guided meditation, authentic cultural exchanges with monks, breathtaking sunrise hikes, and a total detox from modern digital life.',
    destination: 'Dharamshala, India',
    departure_location: 'New Delhi (Indira Gandhi International Airport)',
    start_date: '2026-09-10T00:00:00Z',
    end_date: '2026-09-17T00:00:00Z',
    price: 1850.00,
    total_spots: 10,
    available_spots: 10,
    itinerary: JSON.stringify([
      { title: 'Day 1: Arrival & Cleansing Ceremony', description: 'Arrive at the base camp and partake in a traditional smoke cleansing ritual.' },
      { title: 'Day 2: Silent Meditation & Hike', description: 'Begin the day with a 4 AM silent meditation, followed by a hike to the upper monastery.' }
    ]),
    includes: JSON.stringify(['All Organic Vegan Meals', 'Meditation Supplies', 'Local Transport', 'Guide']),
    excludes: JSON.stringify(['Flights to New Delhi', 'Personal Expenses', 'Travel Insurance']),
    image_urls: JSON.stringify(['https://images.unsplash.com/photo-1544253380-0a8118029c7b?auto=format&fit=crop&q=80&w=800', 'https://images.unsplash.com/photo-1601614745582-73bc4f780e0c?auto=format&fit=crop&q=80&w=800']),
    video_urls: JSON.stringify(['https://www.youtube.com/watch?v=1bGoRWLB-mQ']),
    status: 'upcoming',
    target_audience: 'Spiritual Seekers, Nature Lovers',
    places_to_visit: JSON.stringify([
      { name: 'Namgyal Monastery', description: 'The personal monastery of the 14th Dalai Lama.' },
      { name: 'Triund Hill', description: 'A serene trek offering panoramic views of the Dhauladhar range.' }
    ]),
    included_stay: JSON.stringify({
      title: 'Chonor House',
      location: 'McLeod Ganj',
      image: 'https://images.unsplash.com/photo-1622396481328-9b1b78cdd9fd?auto=format&fit=crop&q=80&w=800',
      amenities: ['Wifi (Limited)', 'Library', 'Garden'],
      description: 'A quiet, Tibetan-styled guesthouse offering a peaceful ambiance.'
    }),
    highlights: JSON.stringify(['Private session with a senior Monk', 'Sunset chanting', 'Organic farming workshop']),
    things_to_carry: JSON.stringify(['Warm layers', 'Comfortable trekking shoes', 'Journal', 'Reusable water bottle']),
    important_notes: 'Strict vegetarian diet during the retreat. Silence is observed every morning until 10 AM.',
    start_time: '06:00',
    end_time: '18:00',
    language: 'English, Tibetan, Hindi',
    cancellation_policy: 'Full refund if cancelled 30 days prior. No refunds within 15 days.',
    map_link: 'https://goo.gl/maps/dharamshala'
  },
  {
    title: 'Aurora Borealis Arctic Expedition',
    description: 'A thrilling arctic adventure combining ice-caving, dog-sledding, and hunting for the elusive Northern Lights in the heart of Iceland. A fully equipped, professional-led expedition for thrill-seekers.',
    destination: 'Reykjavik, Iceland',
    departure_location: 'Keflavik International Airport',
    start_date: '2026-12-05T00:00:00Z',
    end_date: '2026-12-12T00:00:00Z',
    price: 3200.00,
    total_spots: 8,
    available_spots: 8,
    itinerary: JSON.stringify([
      { title: 'Day 1: Base Camp Setup', description: 'Settle into our luxury glass igloos and gear up.' },
      { title: 'Day 2: Glacier Hike & Ice Caves', description: 'Explore the mesmerizing blue ice caves of Vatnajökull.' }
    ]),
    includes: JSON.stringify(['Thermal Gear', 'Luxury Igloo Stay', 'All Excursions', 'Gourmet Nordic Meals']),
    excludes: JSON.stringify(['International Flights', 'Alcoholic Beverages']),
    image_urls: JSON.stringify(['https://images.unsplash.com/photo-1579033461380-adb47c3eb938?auto=format&fit=crop&q=80&w=800', 'https://images.unsplash.com/photo-1520697967909-32247fb231df?auto=format&fit=crop&q=80&w=800']),
    video_urls: JSON.stringify(['https://www.youtube.com/watch?v=3-Tf4cZp3r8']),
    status: 'upcoming',
    target_audience: 'Adventure Enthusiasts, Photographers',
    places_to_visit: JSON.stringify([
      { name: 'Vatnajökull National Park', description: 'Europe\'s largest glacier.' },
      { name: 'Jökulsárlón Glacier Lagoon', description: 'A glacial lagoon filled with icebergs.' }
    ]),
    included_stay: JSON.stringify({
      title: 'Aurora Glass Igloos',
      location: 'South Iceland',
      image: 'https://images.unsplash.com/photo-1542640244-7e672d6cb461?auto=format&fit=crop&q=80&w=800',
      amenities: ['Heated Floors', 'Stargazing Roof', 'Hot Tub'],
      description: 'Sleep under the stars in a fully heated glass dome.'
    }),
    highlights: JSON.stringify(['Northern Lights viewing from your bed', 'Husky sledding across the tundra', 'Professional photography workshop']),
    things_to_carry: JSON.stringify(['Thermal base layers', 'Waterproof jacket/pants', 'Camera with tripod', 'Balaclava']),
    important_notes: 'Weather conditions can be extreme. Itineraries may adjust based on safety and Aurora forecasts.',
    start_time: '14:00',
    end_time: '23:59',
    language: 'English, Icelandic',
    cancellation_policy: 'Flexible cancellation up to 45 days before the event due to extreme weather policies.',
    map_link: 'https://goo.gl/maps/reykjavik'
  }
];

async function seed() {
  try {
    for (const event of events) {
      await pool.query(
        `INSERT INTO experiences (
          host_id, title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, excludes, image_urls, video_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, start_time, end_time, language, cancellation_policy, map_link
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          hostId, event.title, event.description, event.destination, event.departure_location, event.start_date, event.end_date, event.price, event.total_spots, event.available_spots, event.itinerary, event.includes, event.excludes, event.image_urls, event.video_urls, event.status, event.target_audience, event.places_to_visit, event.included_stay, event.highlights, event.things_to_carry, event.important_notes, event.start_time, event.end_time, event.language, event.cancellation_policy, event.map_link
        ]
      );
    }
    console.log('Successfully seeded events!');
  } catch (error) {
    console.error('Error seeding events:', error);
  } finally {
    await pool.end();
  }
}

seed();
