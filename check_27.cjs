const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT * FROM meta_publishing_transactions WHERE id = 27").then(r => {
  console.log('TX 27:', r.rows[0]);
  process.exit(0);
});
