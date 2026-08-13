import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 241;
    // Set status to approved and escrow_status to holding
    await pool.query(`UPDATE host_marketing_campaigns SET status = 'approved', escrow_status = 'holding' WHERE id = $1`, [cid]);
    // Set the transaction to failed so it doesn't block the new dispatch
    await pool.query(`UPDATE meta_publishing_transactions SET publish_status = 'FAILED' WHERE campaign_id = $1`, [cid]);
    console.log("Fixed campaign 241 DB state.");
    await pool.end();
}
run();
