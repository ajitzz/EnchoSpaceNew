import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 241;
    const campRes = await pool.query('SELECT status, escrow_status, meta_campaign_id, meta_adset_id FROM host_marketing_campaigns WHERE id = $1', [cid]);
    console.log("Campaign:", campRes.rows[0]);

    const txRes = await pool.query(`SELECT publish_status, rollback_status, meta_campaign_id FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY created_at DESC`, [cid]);
    console.log("Transactions:", txRes.rows);

    const variantsRes = await pool.query(`SELECT is_published, status, meta_creative_id, meta_ad_id, asset_sha256, variant_activated_at FROM campaign_creative_variants WHERE campaign_id = $1`, [cid]);
    console.log("Variants:", variantsRes.rows);

    await pool.end();
}
run();
