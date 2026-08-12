import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function seed() {
  try {
    await pool.query(`
      INSERT INTO users (id, email, name, role) 
      VALUES (1, 'ajithsabzz@gmail.com', 'Ajith', 'admin')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("User seeded");
  } catch (e) {
    console.error(e);
  }
  pool.end();
}
seed();
