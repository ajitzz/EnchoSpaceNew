import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 241;
    const txRes = await pool.query(`SELECT publish_status, rollback_status, meta_campaign_id, unknown_outcome_reason, quarantined_objects, error_message FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY created_at DESC`, [cid]);
    console.log("Transaction:", JSON.stringify(txRes.rows, null, 2));

    await pool.end();
}
run();
