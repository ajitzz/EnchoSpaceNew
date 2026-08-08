const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const badBlock = `  await pool.query(\`
      
    await client.query(\`
      CREATE TABLE IF NOT EXISTS meta_publishing_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        correlation_id VARCHAR(255) NOT NULL,
        publish_status VARCHAR(50) DEFAULT 'PENDING',
        publish_attempt INTEGER DEFAULT 1,
        meta_campaign_id VARCHAR(255),
        meta_adset_id VARCHAR(255),
        meta_creative_id VARCHAR(255),
        meta_ad_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS meta_api_traces (
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
      )
    \`);
    
    await client.query(\`
      CREATE TABLE IF NOT EXISTS meta_publishing_dlq (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
        campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
        correlation_id VARCHAR(255) NOT NULL,
        failure_stage VARCHAR(50) NOT NULL,
        error_payload JSONB,
        retry_count INTEGER DEFAULT 0,
        recommended_action TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      )
    \`);
    
    CREATE TABLE IF NOT EXISTS admin_audit_logs`;

const goodBlock = `  await pool.query(\`
    CREATE TABLE IF NOT EXISTS meta_publishing_transactions (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      idempotency_key VARCHAR(255) UNIQUE NOT NULL,
      correlation_id VARCHAR(255) NOT NULL,
      publish_status VARCHAR(50) DEFAULT 'PENDING',
      publish_attempt INTEGER DEFAULT 1,
      meta_campaign_id VARCHAR(255),
      meta_adset_id VARCHAR(255),
      meta_creative_id VARCHAR(255),
      meta_ad_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meta_api_traces (
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
    );
    
    CREATE TABLE IF NOT EXISTS meta_publishing_dlq (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      correlation_id VARCHAR(255) NOT NULL,
      failure_stage VARCHAR(50) NOT NULL,
      error_payload JSONB,
      retry_count INTEGER DEFAULT 0,
      recommended_action TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs`;

if (code.includes(badBlock)) {
    code = code.replace(badBlock, goodBlock);
    fs.writeFileSync('server.ts', code);
    console.log("Fixed syntax");
} else {
    console.log("Could not find bad block");
}
