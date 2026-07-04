const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, email, name, role, google_id FROM users", (err, res) => {
  if (err) console.error('Error:', err.message);
  else console.log('Users:', res.rows);
  pool.end();
});
