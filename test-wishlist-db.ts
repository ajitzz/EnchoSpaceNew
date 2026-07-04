import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes('sslmode=')) {
  dbUrl = dbUrl.replace(/sslmode=[^&?#]*/, '');
}

const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }  });

async function run() {
  try {
    const result = await pool.query(`
      SELECT l.*, w.id as wishlist_id 
      FROM wishlists w 
      JOIN listings l ON w.listing_id = l.id 
      WHERE w.user_id = $1
    `, [1]);
    console.log(result.rows);
  } catch (error) {
    console.error("error!!", error);
  } finally {
    pool.end();
  }
}
run();
