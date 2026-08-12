import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query('SELECT id, host_id, status, payment_status, admin_approved, policy_cleared, approval_hash, escrow_status, subscription_active, budget, analytics->>\'spent\' as spent, media_urls, meta_campaign_id, meta_adset_id, dco_status, created_at, updated_at FROM host_marketing_campaigns WHERE id = 1');
    console.log(JSON.stringify(res.rows[0], null, 2));
    
    // Also check transitions mapping
    const file = await import('fs/promises');
    const serverTs = await file.readFile('server.ts', 'utf8');
    const stateMatches = serverTs.match(/const VALID_TRANSITIONS[\s\S]*?\};/);
    if(stateMatches) console.log(stateMatches[0]);

  } catch(e) {
    console.error(e.message);
  }
  pool.end();
}
check();
