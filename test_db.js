import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  try {
    const result = await pool.query(`
      SELECT c.*, l.title as listing_title, l.image_url as listing_image, l.city as listing_city
      FROM host_marketing_campaigns c
      LEFT JOIN listings l ON c.listing_id = l.id
      WHERE c.host_id = $1
      ORDER BY c.created_at DESC LIMIT 200
    `, ['user_ajith']);
    console.log(result.rows);
  } catch (e) {
    console.error(e.message);
  }
  pool.end();
}
test();
