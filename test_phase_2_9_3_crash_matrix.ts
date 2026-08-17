import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function runCrashMatrix() {
  console.log('================================================================');
  console.log('PHASE 2.9.3A TEST MATRIX EXECUTION — CRASH INJECTION');
  console.log('================================================================\n');
  
  let failed = false;

  try {
     const userRes = await pool.query("INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'pass', 'host', 'HostName') RETURNING id", ['crash_host_' + Date.now() + '@test.com']);
     const hostId = userRes.rows[0].id;
     
     const listRes = await pool.query("INSERT INTO listings (user_id, title, description, price, city, address, type) VALUES ($1, 'Crash Test', 'Desc', 100, 'TestCity', '123 Test St', 'resort') RETURNING id", [hostId]);
     const listingId = listRes.rows[0].id;
     
     const campRes = await pool.query(`
        INSERT INTO host_marketing_campaigns (host_id, listing_id, title, description, budget, platforms, status, escrow_status, admin_approved)
        VALUES ($1, $2, 'Crash Test Camp', 'Desc', 100, '["meta"]', 'escrow', 'holding', true)
        RETURNING id
     `, [hostId, listingId]);
     const campaignId = campRes.rows[0].id;

     console.log('--- TEST: Crash immediately after COMMIT (Before dispatchMetaCampaign) ---');
     
     const client = await pool.connect();
     try {
        await client.query('BEGIN');
        const lockRes = await client.query('SELECT id FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE NOWAIT', [campaignId]);
        if (lockRes.rows.length > 0) {
           await client.query("UPDATE host_marketing_campaigns SET escrow_status = 'released' WHERE id = $1", [campaignId]);
           const idempotencyKey = 'publish_meta_camp_' + campaignId;
           await client.query(`
             INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status)
             VALUES ($1, $2, $3, 'PRECHECK_RUNNING')
           `, [campaignId, idempotencyKey, crypto.randomUUID()]);
           await client.query('COMMIT');
        }
     } finally {
        client.release();
     }
     
     // Now pretend the process crashed and restarted.
     // Is there any worker that picks up PRECHECK_RUNNING? 
     await new Promise(r => setTimeout(r, 1000));
     
     const checkRes = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1', [campaignId]);
     const finalState = checkRes.rows[0].publish_status;
     
     if (finalState === 'PRECHECK_RUNNING') {
        console.error('[FAIL] PRECHECK_RUNNING is a DEAD-END STATE if dispatchMetaCampaign is never called.');
        failed = true;
     } else {
        console.log('[PASS] Recovered state: ' + finalState);
     }
     
  } catch (err) {
     console.error('Fatal crash test error:', err);
     failed = true;
  }
  
  if (failed) {
     console.log('CRASH MATRIX RESULT: BLOCKED - REMEDIATION REQUIRED');
     process.exit(1);
  } else {
     console.log('CRASH MATRIX RESULT: GREEN - PROCEED');
     process.exit(0);
  }
}

runCrashMatrix();
