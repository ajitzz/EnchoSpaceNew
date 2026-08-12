const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const schemaAdd = `
    CREATE TABLE IF NOT EXISTS meta_publishing_events (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      event_type VARCHAR(100) NOT NULL,
      from_state VARCHAR(50),
      to_state VARCHAR(50) NOT NULL,
      actor_type VARCHAR(50) DEFAULT 'system',
      actor_id VARCHAR(100),
      reason TEXT,
      correlation_id VARCHAR(255),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
`;

code = code.replace(
  /ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR\(100\);/,
  `ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);\n${schemaAdd}`
);

fs.writeFileSync('server.ts', code);
console.log("Schema patched");
