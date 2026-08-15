with open('server.ts', 'r') as f:
    text = f.read()

target = """    CREATE TABLE IF NOT EXISTS meta_api_traces (
      id SERIAL PRIMARY KEY,
      correlation_id VARCHAR(255) NOT NULL,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      host_id INTEGER REFERENCES users(id),
      step VARCHAR(255) NOT NULL,
      endpoint VARCHAR(1000),
      request_payload JSONB,
      response_payload JSONB,
      http_status INTEGER,
      fbtrace_id VARCHAR(255),
      meta_error_code INTEGER,
      meta_error_subcode INTEGER,
      meta_error_message TEXT,
      meta_error_type VARCHAR(255),
      meta_error_is_transient BOOLEAN,
      meta_error_user_title TEXT,
      meta_error_user_msg TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );"""

replacement = target + """
  `);
  
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS step VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS endpoint VARCHAR(1000);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS request_payload JSONB;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS response_payload JSONB;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS http_status INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS fbtrace_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_code INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_subcode INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_message TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_type VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_is_transient BOOLEAN;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_title TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_msg TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS latency_ms INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`);
  
  await pool.query(`
"""

text = text.replace(target, replacement)
with open('server.ts', 'w') as f:
    f.write(text)

