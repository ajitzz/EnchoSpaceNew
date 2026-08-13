import pg from 'pg';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

const mockExperiences = [
  {
    title: "Sunrise Mountain Hike & Summit Breakfast",
    description: "Join us for an unforgettable early morning hike up the pristine trails of the Alps. Watch the sunrise from the summit and enjoy a specially prepared hot breakfast with panoramic views. Perfect for adventure seekers and photography enthusiasts.",
    destination: "Swiss Alps",
    departure_location: "Zurich",
    start_date: "2026-07-15T05:00:00Z",
    end_date: "2026-07-16T18:00:00Z",
    price: 4500,
    total_spots: 12,
    available_spots: 3,
    image_urls: [
      "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming"
  },
  {
    title: "Luxury Beachfront Candlelit Dinner",
    description: "Experience the ultimate romantic evening on a secluded white sand beach. Enjoy a 5-course gourmet meal prepared by a private chef, under the stars, accompanied by the gentle sound of the ocean waves. A perfect getaway for couples.",
    destination: "Maldives",
    departure_location: "Male",
    start_date: "2026-08-10T18:00:00Z",
    end_date: "2026-08-14T10:00:00Z",
    price: 12500,
    total_spots: 8,
    available_spots: 8,
    image_urls: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1533759413974-9e15f3b745ac?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming"
  },
  {
    title: "Historic European City Culture Tour",
    description: "Walk through the cobblestone streets of Rome and discover its hidden gems. This immersive cultural tour includes exclusive access to historical sites, a local food tasting experience, and guided storytelling by a renowned historian.",
    destination: "Rome, Italy",
    departure_location: "Rome Central",
    start_date: "2026-09-01T09:00:00Z",
    end_date: "2026-09-03T20:00:00Z",
    price: 8500,
    total_spots: 20,
    available_spots: 0,
    image_urls: [
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1515542622106-78b28af7815b?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "sold_out"
  },
  {
    title: "Desert Safari & Stargazing Camp",
    description: "An exhilarating ride through the golden dunes followed by a magical night under the desert sky. Includes traditional BBQ, cultural performances, and a guided stargazing session with professional telescopes.",
    destination: "Sahara Desert",
    departure_location: "Marrakech",
    start_date: "2026-10-12T14:00:00Z",
    end_date: "2026-10-14T11:00:00Z",
    price: 6000,
    total_spots: 15,
    available_spots: 5,
    image_urls: [
      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming"
  }
];

async function seed() {
  try {
    for (const exp of mockExperiences) {
      await pool.query(`
        INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [exp.title, exp.description, exp.destination, exp.departure_location, exp.start_date, exp.end_date, exp.price, exp.total_spots, exp.available_spots, exp.image_urls, exp.status]);
    }
    console.log("Successfully seeded experiences!");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
seed();
