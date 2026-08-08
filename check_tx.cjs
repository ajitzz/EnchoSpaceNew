const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT * FROM meta_publishing_transactions WHERE id = 23").then(r => {
  console.log('TX 23:', r.rows[0]);
  return pool.query("SELECT * FROM host_marketing_campaigns WHERE id = 19");
}).then(r => {
  console.log('CAMP 19:', r.rows[0]);
  process.exit(0);
});
