import { Pool } from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const claimClient = await pool.connect();
  try {
    await claimClient.query('BEGIN');
    const idempotencyKey = `publish_meta_camp_12345`;
    const correlationId = crypto.randomUUID();
    
    await claimClient.query(
      `INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) 
       VALUES ($1, $2, $3, 'PRECHECK_RUNNING') 
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [12345, idempotencyKey, correlationId] // Make sure campaign 12345 exists if there's a FK constraint? Let's check FK constraint on campaign_id
    );

    const txCheck = await claimClient.query(`SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 FOR UPDATE NOWAIT`, [idempotencyKey]);
    console.log(txCheck.rows);
    await claimClient.query('ROLLBACK'); // rollback so we don't save
  } catch(e) {
    console.error(e);
  } finally {
    claimClient.release();
    pool.end();
  }
}
test();
