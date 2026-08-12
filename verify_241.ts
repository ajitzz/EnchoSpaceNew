import pkg from 'pg';
import dotenv from 'dotenv';
import { metaGraphClient } from './src/lib/metaGraphClient.js';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const cid = 241;
    const campaign = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [cid]);
    const c = campaign.rows[0];
    const pubTx = await pool.query(`SELECT * FROM meta_publishing_transactions WHERE campaign_id = $1`, [cid]);
    const readiness = await metaGraphClient.checkExternalMetaReadiness(pool, 'canary-verify', true);
    console.log("=== CHECKPOINT ===");
    console.log("Campaign ID:", c.id);
    console.log("Media URL count:", c.media_urls.length);
    console.log("Asset A:", c.media_urls[0]);
    console.log("Asset B:", c.media_urls[1]);
    console.log("Objective:", c.objective);
    console.log("Budget:", c.budget);
    console.log("Payment status:", c.payment_status);
    console.log("Escrow status:", c.escrow_status);
    console.log("Approval hash:", c.approval_hash);
    console.log("Gate 14:", readiness.is_ready ? "is_ready: true" : "is_ready: false");
    console.log("Expected Meta objects: 1 Meta Campaign, 1 Meta AdSet, 2 Meta Creative objects, 2 Meta Ad objects");
    console.log("Expected variant count:", 2);
    await pool.end();
}
run().catch(console.error);
