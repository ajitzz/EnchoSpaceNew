const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runTest() {
  try {
    console.log('Testing Milestone 1: Ledger & Schema Tables');
    
    const tables = ['host_wallets', 'wallet_transactions', 'campaign_metrics', 'admin_audit_logs'];
    
    for (const table of tables) {
      const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`- ${table} exists. Row count: ${res.rows[0].count}`);
    }
    
    // Check altered columns
    const msgCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'is_sanitized';
    `);
    console.log(`- messages.is_sanitized exists: ${msgCols.rows.length > 0}`);

    const threadCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'threads' AND column_name IN ('lead_source', 'campaign_id', 'lead_intent_score');
    `);
    console.log(`- threads marketing columns exist: ${threadCols.rows.length === 3}`);
    
    console.log('✅ Milestone 1 Schema Test Passed.');
  } catch (err) {
    console.error('❌ Test Failed:', err);
  } finally {
    await pool.end();
  }
}

runTest();
