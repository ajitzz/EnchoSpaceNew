import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ override: true });

let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes('sslmode=')) {
  dbUrl = dbUrl.replace(/sslmode=[^&?#]*/, '');
}
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Users table checked');
    
    const adminExists = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (adminExists.rows.length === 0) {
      console.log('No admin, trying to create one...');
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')",
        ['admin@enchospace.com', hash, 'Super Admin']
      );
      console.log('Admin created');
    }
    
    console.log('Users:', (await pool.query('SELECT * FROM users')).rows);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
