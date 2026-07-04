import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const dbUrl = process.env.DATABASE_URL!.replace('?sslmode=require', '');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
async function test() {
  const result = await pool.query(`SELECT id, title, price, rental_mode FROM listings ORDER BY created_at DESC`);
  console.log(result.rows);
  process.exit(0);
}
test();
