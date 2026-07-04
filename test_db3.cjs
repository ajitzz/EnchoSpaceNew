const { Pool } = require('pg');
require('dotenv').config();

const url = process.env.DATABASE_URL.replace('?sslmode=require&pgbouncer=true', '');
console.log('Connecting to', url.replace(/:[^:@]+@/, ':***@'));

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Error:', err.message);
  else console.log('Success:', res.rows[0]);
  pool.end();
});
