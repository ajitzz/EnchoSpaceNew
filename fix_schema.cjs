const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await pool.query(`
      ALTER TABLE meta_api_traces 
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS step VARCHAR(255),
      ADD COLUMN IF NOT EXISTS endpoint VARCHAR(1000),
      ADD COLUMN IF NOT EXISTS request_payload JSONB,
      ADD COLUMN IF NOT EXISTS response_payload JSONB,
      ADD COLUMN IF NOT EXISTS http_status INTEGER,
      ADD COLUMN IF NOT EXISTS fbtrace_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS meta_error_code INTEGER,
      ADD COLUMN IF NOT EXISTS meta_error_subcode INTEGER,
      ADD COLUMN IF NOT EXISTS meta_error_message TEXT,
      ADD COLUMN IF NOT EXISTS meta_error_type VARCHAR(255),
      ADD COLUMN IF NOT EXISTS meta_error_is_transient BOOLEAN,
      ADD COLUMN IF NOT EXISTS meta_error_user_title TEXT,
      ADD COLUMN IF NOT EXISTS meta_error_user_msg TEXT,
      ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    `);
    
    // Set NOT NULL only if there are 0 rows, but it's empty so it's fine
    await pool.query(`
      ALTER TABLE meta_api_traces 
      ALTER COLUMN correlation_id SET NOT NULL,
      ALTER COLUMN step SET NOT NULL;
    `);

    console.log("Schema fixed successfully.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
