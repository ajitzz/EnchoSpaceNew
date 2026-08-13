import { Pool } from 'pg';

async function reconcileIncident32() {
  console.log("==================================================================");
  console.log("   ENCHO DATABASE RECONCILIATION FOR CAMPAIGN #32 / TRANSACTION #7");
  console.log("==================================================================");

  let rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (rawDbUrl.includes('sslmode=') && !rawDbUrl.includes('sslmode=verify-full')) {
    rawDbUrl = rawDbUrl.replace(/sslmode=[^&]+/, 'sslmode=no-verify');
  }

  const pool = new Pool({
    connectionString: rawDbUrl,
    ssl: rawDbUrl.includes('neon.tech') || rawDbUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false
  });

  try {
    // 0. Ensure columns exist
    await pool.query(`
      ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);
      ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_category VARCHAR(100);
      ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(100);
      ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(50);
      ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS error_details JSONB;

      ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);
      ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS requires_human_action BOOLEAN DEFAULT true;
    `);

    // 1. Ensure transaction 7 or campaign 32 transaction is updated
    const txUpdate = await pool.query(`
      UPDATE meta_publishing_transactions
      SET publish_status = 'FAILED',
          failure_code = 'META_APP_DEVELOPMENT_MODE_BLOCK',
          failure_category = 'EXTERNAL_INFRASTRUCTURE',
          failure_stage = 'CREATIVE_CREATION',
          rollback_status = 'SUCCESS',
          error_details = '{"error":{"message":"The Ads creative post was created by an app that is in development mode and must be public/live to create the ad.","type":"OAuthException","code":100,"error_subcode":1885183,"fbtrace_id":"A9_j4E_Xm8wO0G6W3a6N8G2"}}'::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE campaign_id = 32 OR id = 7
      RETURNING id, campaign_id, publish_status, failure_code, rollback_status
    `);

    console.log("✅ [TRANSACTIONS RECONCILED]:", txUpdate.rows);

    // 2. Ensure Campaign #32 status is failed_publish with clear admin feedback
    const campUpdate = await pool.query(`
      UPDATE host_marketing_campaigns
      SET status = 'failed_publish',
          admin_feedback = 'Meta App in Development Mode: Verify Meta App 1347659864208278 is switched from Development to Live/Public Mode in Meta Developers Console.'
      WHERE id = 32
      RETURNING id, status, admin_feedback
    `);

    console.log("✅ [CAMPAIGN #32 RECONCILED]:", campUpdate.rows);

    // 3. Ensure DLQ record for Transaction #7 exists and is accurately flagged
    const dlqCheck = await pool.query(`SELECT id FROM meta_publishing_dlq WHERE campaign_id = 32 OR transaction_id = 7`);
    if (dlqCheck.rows.length === 0) {
      const dlqInsert = await pool.query(`
        INSERT INTO meta_publishing_dlq (
          transaction_id, campaign_id, correlation_id, failure_stage, failure_code, requires_human_action, error_payload, recommended_action
        ) VALUES (
          7, 32, 'corr_32_meta_dispatch', 'CREATIVE_CREATION', 'META_APP_DEVELOPMENT_MODE_BLOCK', true,
          '{"error":{"message":"The Ads creative post was created by an app that is in development mode and must be public/live to create the ad.","type":"OAuthException","code":100,"error_subcode":1885183}}'::jsonb,
          'Verify Meta App 1347659864208278 is switched from Development to Live/Public Mode in Meta Developers Console.'
        )
        RETURNING id
      `);
      console.log("✅ [DLQ RECONCILED - INSERTED]:", dlqInsert.rows[0]);
    } else {
      const dlqUpdate = await pool.query(`
        UPDATE meta_publishing_dlq
        SET failure_code = 'META_APP_DEVELOPMENT_MODE_BLOCK',
            failure_stage = 'CREATIVE_CREATION',
            requires_human_action = true,
            recommended_action = 'Verify Meta App 1347659864208278 is switched from Development to Live/Public Mode in Meta Developers Console.'
        WHERE campaign_id = 32 OR transaction_id = 7
        RETURNING id, failure_code
      `);
      console.log("✅ [DLQ RECONCILED - UPDATED]:", dlqUpdate.rows);
    }

    console.log("\n🚀 [RECONCILIATION COMPLETE] All records for Campaign #32 / Transaction #7 successfully updated.");
  } catch (e: any) {
    console.error("❌ [RECONCILIATION ERROR]:", e.message);
  } finally {
    await pool.end();
  }
}

reconcileIncident32();
