import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 1;
    const campRes = await pool.query('SELECT status, escrow_status, payment_status, admin_approved, policy_cleared, approval_hash, meta_campaign_id, meta_adset_id FROM host_marketing_campaigns WHERE id = $1', [cid]);
    console.log("Campaign State:", JSON.stringify(campRes.rows[0], null, 2));

    const txRes = await pool.query(`SELECT publish_status, rollback_status, meta_campaign_id, meta_creative_id, meta_ad_id FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY created_at DESC`, [cid]);
    console.log("Publishing Transactions:", JSON.stringify(txRes.rows, null, 2));

    const varRes = await pool.query(`SELECT is_published, status, meta_creative_id, meta_ad_id FROM campaign_creative_variants WHERE campaign_id = $1`, [cid]);
    console.log("Variants:", JSON.stringify(varRes.rows, null, 2));
    
    await pool.end();
}
run();
