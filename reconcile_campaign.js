import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function reconcile() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Reset campaign 1 to approved/holding state
    await client.query(`
      UPDATE host_marketing_campaigns 
      SET status = 'approved', escrow_status = 'holding' 
      WHERE id = 1
    `);
    
    // Log the reconciliation
    await client.query(`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address, created_at)
      VALUES (1, 'campaign', '1', 'manual_reconciliation', '{"status":"ASSET_PREP","escrow_status":"released"}', '{"status":"approved","escrow_status":"holding"}', '127.0.0.1', CURRENT_TIMESTAMP)
    `);
    
    await client.query('COMMIT');
    console.log("Reconciliation successful.");
  } catch(e) {
    await client.query('ROLLBACK');
    console.log("Reconciliation failed:", e.message);
  } finally {
    client.release();
    pool.end();
  }
}
reconcile();
