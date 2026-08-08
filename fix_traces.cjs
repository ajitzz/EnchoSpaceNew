const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const badTraces = `    CREATE TABLE IF NOT EXISTS meta_api_traces (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      correlation_id VARCHAR(255) NOT NULL,
      stage VARCHAR(50) NOT NULL,
      endpoint VARCHAR(500),
      payload JSONB,
      response JSONB,
      latency_ms INTEGER,
      is_error BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );`;

const goodTraces = `    CREATE TABLE IF NOT EXISTS meta_api_traces (
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
    );`;

if (code.includes(badTraces)) {
    code = code.replace(badTraces, goodTraces);
    fs.writeFileSync('server.ts', code);
    console.log("Fixed traces schema");
} else {
    console.log("Could not find traces schema");
}
