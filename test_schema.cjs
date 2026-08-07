const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'host_marketing_campaigns'")
  .then(res => { console.log(res.rows); process.exit(0); });
