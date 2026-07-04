const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, title, host_id FROM experiences", (err, res) => {
  if (err) console.error('Error:', err.message);
  else console.log('Experiences in DB:', res.rows);
  pool.end();
});
