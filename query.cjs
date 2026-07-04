require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT id, title FROM experiences WHERE title = 'Neon Lights Cyberpunk Tokyo Tour'", (err, res) => {
  console.log(res.rows);
  pool.end();
});
