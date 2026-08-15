const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');

async function run() {
  const tables = [
    'operation_idempotency_keys', 
    'meta_publishing_transactions', 
    'meta_api_traces', 
    'meta_publishing_events', 
    'meta_reconciliation_incidents', 
    'host_marketing_campaigns', 
    'campaign_creative_variants', 
    'campaign_financial_contracts', 
    'meta_external_truth'
  ];
  const query = `
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = ANY($1)
    ORDER BY table_name, ordinal_position;
  `;
  try {
    const res = await pool.query(query, [tables]);
    fs.writeFileSync('schema_dump.json', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
