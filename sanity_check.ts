import pkg from 'pg';
import dotenv from 'dotenv';
import { metaGraphClient } from './src/lib/metaGraphClient.js';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const cid = 241;
    
    const campaign = await pool.query(`
        SELECT status, escrow_status, payment_status, media_urls, approval_hash
        FROM host_marketing_campaigns 
        WHERE id = $1
    `, [cid]);

    console.log("=== CAMPAIGN 241 ===");
    console.log(JSON.stringify(campaign.rows[0], null, 2));

    console.log("=== GATE 14 (Readiness) ===");
    const readiness = await metaGraphClient.checkExternalMetaReadiness(pool, 'canary-sanity', true);
    console.log(JSON.stringify({ is_ready: readiness.is_ready }, null, 2));

    await pool.end();
}
run().catch(console.error);
