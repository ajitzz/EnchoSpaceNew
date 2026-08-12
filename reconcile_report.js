import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function report() {
  try {
    const cRes = await pool.query("SELECT id, status, escrow_status, payment_status FROM host_marketing_campaigns WHERE id = 1");
    const walletRes = await pool.query("SELECT id, amount FROM wallet_transactions WHERE type = 'campaign_funding' AND reference_id = '1'");
    const publishRes = await pool.query("SELECT id, publish_status, rollback_status, error_details, failure_code FROM meta_publishing_transactions WHERE campaign_id = 1 ORDER BY created_at DESC LIMIT 1");
    const auditRes = await pool.query("SELECT count(*) as attempts FROM admin_audit_logs WHERE entity_type = 'campaign_escrow' AND entity_id = '1' AND action = 'force_release_escrow'");
    
    console.log("RECONCILIATION REPORT");
    console.log("=====================");
    console.log("Campaign ID:", cRes.rows[0]?.id);
    console.log("Campaign Status:", cRes.rows[0]?.status);
    console.log("Escrow Status:", cRes.rows[0]?.escrow_status);
    console.log("Payment Status:", cRes.rows[0]?.payment_status);
    console.log("Wallet Tx ID:", walletRes.rows[0]?.id);
    console.log("Wallet Amount:", walletRes.rows[0]?.amount);
    
    if (publishRes.rows.length > 0) {
        console.log("Publish Tx ID:", publishRes.rows[0].id);
        console.log("Publish Status:", publishRes.rows[0].publish_status);
        console.log("Rollback Status:", publishRes.rows[0].rollback_status);
        console.log("Failure Code:", publishRes.rows[0].failure_code);
    } else {
        console.log("Publish Tx: NONE");
    }
    
    console.log("Force Release Attempts:", auditRes.rows[0]?.attempts);
    
  } catch(e) {
    console.log("Error generating report:", e.message);
  }
  pool.end();
}
report();
