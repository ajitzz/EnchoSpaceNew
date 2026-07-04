require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'experiences' AND column_name = 'included_stay'", (err, res) => {
  console.log(res.rows);
  pool.end();
});
