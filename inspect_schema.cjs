const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
