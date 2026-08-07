const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("ALTER TABLE host_marketing_campaigns ADD COLUMN ai_copilot_data JSONB DEFAULT '{}'::jsonb")
  .then(res => { console.log('Added column'); process.exit(0); })
  .catch(err => { console.log(err.message); process.exit(0); });
