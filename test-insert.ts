import pg from 'pg';
import { config } from 'dotenv';
config();

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is not configured");
}
if (dbUrl && dbUrl.includes('sslmode=')) {
  dbUrl = dbUrl.replace(/sslmode=[^&?#]*/, '');
}

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function test() {
  try {
    const res = await pool.query("INSERT INTO listings (title, description, price, type, address, city, image_url, image_urls, video_url, rental_mode, rooms, max_guests, bedrooms, beds, bathrooms, amenities) VALUES ('test', 'test', 100, 'Apartment', 'test', 'test', null, '{}', null, 'entire_place', '[]'::jsonb, 1, 1, 1, 1, '{}') RETURNING *;");
    console.log("Success:", res.rows);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    pool.end();
  }
}
test();
