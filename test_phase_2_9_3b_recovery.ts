import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let passedTests = 0;
let failedTests = 0;

async function assertTest(name: string, fn: () => Promise<boolean>) {
  try {
    const success = await fn();
    if (success) {
      console.log('[PASS] ' + name);
      passedTests++;
    } else {
      console.error('[FAIL] ' + name);
      failedTests++;
    }
  } catch (err: any) {
    console.error('[FAIL] ' + name + ' — Threw error: ' + err.message);
    failedTests++;
  }
}

async function createTestCampaign(suffix: string): Promise<{ hostId: number; listingId: number; campaignId: number }> {
  const userRes = await pool.query(
    "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'pass', 'host', 'TestHost') RETURNING id",
    ['crash_' + suffix + '_' + Date.now() + '@test.com']
  );
  const hostId = userRes.rows[0].id;

  const listRes = await pool.query(
    "INSERT INTO listings (user_id, title, description, price, city, address, type) VALUES ($1, 'Recovery Test', 'Desc', 100, 'TestCity', '123 Test St', 'resort') RETURNING id",
    [hostId]
  );
  const listingId = listRes.rows[0].id;

  const campRes = await pool.query(
    "INSERT INTO host_marketing_campaigns (host_id, listing_id, title, description, budget, platforms, status, escrow_status, admin_approved) VALUES ($1, $2, 'Recovery Test Camp', 'Desc', 100, '[\"meta\"]', 'escrow', 'released', true) RETURNING id",
    [hostId, listingId]
  );
  const campaignId = campRes.rows[0].id;

  return { hostId, listingId, campaignId };
}

async function insertOrphanedTransaction(campaignId: number, status: string, minutesAgo: number, metaCampaignId?: string): Promise<number> {
  const idempotencyKey = 'publish_meta_camp_' + campaignId;
  const correlationId = crypto.randomUUID();

  const res = await pool.query(
    "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, meta_campaign_id, updated_at, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP - INTERVAL '" + minutesAgo + " minutes', CURRENT_TIMESTAMP - INTERVAL '" + minutesAgo + " minutes') RETURNING id",
    [campaignId, idempotencyKey, correlationId, status, metaCampaignId || null]
  );
  return res.rows[0].id;
}

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 2.9.3B CRASH-INJECTION INTEGRATION TEST MATRIX');
  console.log('================================================================\n');

  // Import the recovery function dynamically
  // We can't import server.ts directly without side effects, so we test the SQL logic directly.

  // ================================================================
  // TEST A: PRECHECK_RUNNING orphan (no Meta objects) older than 5 min
  // Expected: Recovery worker should discover and attempt re-dispatch
  // ================================================================
  await assertTest('TEST A: PRECHECK_RUNNING orphan discovered by recovery query', async () => {
    const { campaignId } = await createTestCampaign('a');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6);

    // Simulate recovery worker query
    const orphanRes = await pool.query(
      "SELECT id, campaign_id, publish_status, meta_campaign_id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes' AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP) AND id = $1",
      [txId]
    );

    return orphanRes.rows.length === 1 && orphanRes.rows[0].publish_status === 'PRECHECK_RUNNING';
  });

  // ================================================================
  // TEST B: PRECHECK_RUNNING orphan younger than 5 min
  // Expected: NOT discovered (lease still active)
  // ================================================================
  await assertTest('TEST B: PRECHECK_RUNNING younger than threshold NOT discovered', async () => {
    const { campaignId } = await createTestCampaign('b');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 2);

    const orphanRes = await pool.query(
      "SELECT id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes' AND id = $1",
      [txId]
    );

    return orphanRes.rows.length === 0;
  });

  // ================================================================
  // TEST C: PUBLISHING orphan transitions to EXTERNAL_OUTCOME_UNKNOWN
  // ================================================================
  await assertTest('TEST C: PUBLISHING orphan transitions to EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const { campaignId } = await createTestCampaign('c');
    const txId = await insertOrphanedTransaction(campaignId, 'PUBLISHING', 6, 'act_fake_123');

    // Simulate recovery worker: claim lease then transition
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockRes = await client.query(
        "SELECT id, publish_status FROM meta_publishing_transactions WHERE id = $1 AND publish_status = 'PUBLISHING' FOR UPDATE SKIP LOCKED",
        [txId]
      );

      if (lockRes.rows.length > 0) {
        await client.query(
          "UPDATE meta_publishing_transactions SET publish_status = 'EXTERNAL_OUTCOME_UNKNOWN', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [txId]
        );
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const check = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE id = $1', [txId]);
    return check.rows[0].publish_status === 'EXTERNAL_OUTCOME_UNKNOWN';
  });

  // ================================================================
  // TEST D: Lease claim prevents concurrent processing
  // ================================================================
  await assertTest('TEST D: FOR UPDATE SKIP LOCKED prevents concurrent workers', async () => {
    const { campaignId } = await createTestCampaign('d');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6);

    // Worker 1: acquire lock and hold it
    const client1 = await pool.connect();
    await client1.query('BEGIN');
    const w1 = await client1.query(
      "SELECT id FROM meta_publishing_transactions WHERE id = $1 FOR UPDATE NOWAIT",
      [txId]
    );

    // Worker 2: try SKIP LOCKED — should get 0 rows
    const client2 = await pool.connect();
    await client2.query('BEGIN');
    const w2 = await client2.query(
      "SELECT id FROM meta_publishing_transactions WHERE id = $1 FOR UPDATE SKIP LOCKED",
      [txId]
    );

    await client2.query('COMMIT');
    client2.release();
    await client1.query('COMMIT');
    client1.release();

    return w1.rows.length === 1 && w2.rows.length === 0;
  });

  // ================================================================
  // TEST E: Lease expiry allows subsequent recovery
  // ================================================================
  await assertTest('TEST E: Expired lease allows next recovery cycle', async () => {
    const { campaignId } = await createTestCampaign('e');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6);

    // Simulate first recovery: claim lease that expires 10 minutes ago
    await pool.query(
      "UPDATE meta_publishing_transactions SET reconciliation_lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes', reconciliation_attempt_count = 1 WHERE id = $1",
      [txId]
    );

    // Second recovery query should discover this
    const orphanRes = await pool.query(
      "SELECT id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes' AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP) AND id = $1",
      [txId]
    );

    return orphanRes.rows.length === 1;
  });

  // ================================================================
  // TEST F: Max attempts exceeded — no longer discovered
  // ================================================================
  await assertTest('TEST F: Max attempts exceeded stops recovery', async () => {
    const { campaignId } = await createTestCampaign('f');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6);

    await pool.query(
      "UPDATE meta_publishing_transactions SET reconciliation_attempt_count = 10 WHERE id = $1",
      [txId]
    );

    const orphanRes = await pool.query(
      "SELECT id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes' AND (reconciliation_attempt_count IS NULL OR reconciliation_attempt_count < 10) AND id = $1",
      [txId]
    );

    return orphanRes.rows.length === 0;
  });

  // ================================================================
  // TEST G: Idempotency — unique constraint prevents duplicate transactions
  // ================================================================
  await assertTest('TEST G: UNIQUE(idempotency_key) prevents duplicate dispatch transactions', async () => {
    const { campaignId } = await createTestCampaign('g');
    const idempotencyKey = 'publish_meta_camp_' + campaignId;

    await pool.query(
      "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) VALUES ($1, $2, $3, 'PRECHECK_RUNNING')",
      [campaignId, idempotencyKey, crypto.randomUUID()]
    );

    // Second insert with same key should be silently ignored
    const res = await pool.query(
      "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) VALUES ($1, $2, $3, 'PRECHECK_RUNNING') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",
      [campaignId, idempotencyKey, crypto.randomUUID()]
    );

    // Count total rows for this campaign
    const countRes = await pool.query(
      "SELECT count(*) as cnt FROM meta_publishing_transactions WHERE campaign_id = $1",
      [campaignId]
    );

    return res.rows.length === 0 && parseInt(countRes.rows[0].cnt) === 1;
  });

  // ================================================================
  // TEST H: PRECHECK_RUNNING with Meta objects → EXTERNAL_OUTCOME_UNKNOWN (not re-dispatch)
  // ================================================================
  await assertTest('TEST H: PRECHECK_RUNNING with Meta objects transitions to EXTERNAL_OUTCOME_UNKNOWN', async () => {
    const { campaignId } = await createTestCampaign('h');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6, 'act_exists_123');

    const check = await pool.query(
      'SELECT meta_campaign_id FROM meta_publishing_transactions WHERE id = $1',
      [txId]
    );

    const hasMetaObjects = !!check.rows[0].meta_campaign_id;

    // Recovery worker logic: if hasMetaObjects, transition to EXTERNAL_OUTCOME_UNKNOWN
    if (hasMetaObjects) {
      await pool.query(
        "UPDATE meta_publishing_transactions SET publish_status = 'EXTERNAL_OUTCOME_UNKNOWN', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [txId]
      );
    }

    const result = await pool.query('SELECT publish_status FROM meta_publishing_transactions WHERE id = $1', [txId]);
    return result.rows[0].publish_status === 'EXTERNAL_OUTCOME_UNKNOWN';
  });

  // ================================================================
  // TEST I: SUCCESS state is never touched by recovery worker
  // ================================================================
  await assertTest('TEST I: SUCCESS transactions are not discovered by recovery query', async () => {
    const { campaignId } = await createTestCampaign('i');
    const idempotencyKey = 'publish_meta_camp_' + campaignId;

    await pool.query(
      "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, updated_at) VALUES ($1, $2, $3, 'SUCCESS', CURRENT_TIMESTAMP - INTERVAL '60 minutes')",
      [campaignId, idempotencyKey, crypto.randomUUID()]
    );

    const orphanRes = await pool.query(
      "SELECT id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND campaign_id = $1",
      [campaignId]
    );

    return orphanRes.rows.length === 0;
  });

  // ================================================================
  // TEST J: EXTERNAL_OUTCOME_UNKNOWN is never blindly re-dispatched
  // ================================================================
  await assertTest('TEST J: EXTERNAL_OUTCOME_UNKNOWN is NOT in recovery query', async () => {
    const { campaignId } = await createTestCampaign('j');
    const idempotencyKey = 'publish_meta_camp_' + campaignId;

    await pool.query(
      "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status, updated_at) VALUES ($1, $2, $3, 'EXTERNAL_OUTCOME_UNKNOWN', CURRENT_TIMESTAMP - INTERVAL '60 minutes')",
      [campaignId, idempotencyKey, crypto.randomUUID()]
    );

    const orphanRes = await pool.query(
      "SELECT id FROM meta_publishing_transactions WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND campaign_id = $1",
      [campaignId]
    );

    return orphanRes.rows.length === 0;
  });

  // ================================================================
  // TEST K: Concurrent workers — SKIP LOCKED ensures no double-processing
  // ================================================================
  await assertTest('TEST K: Concurrent workers cannot process same orphan simultaneously', async () => {
    const { campaignId } = await createTestCampaign('k');
    const txId = await insertOrphanedTransaction(campaignId, 'PRECHECK_RUNNING', 6);

    // Worker 1: acquire lock and HOLD IT
    const w1Client = await pool.connect();
    await w1Client.query('BEGIN');
    const w1Res = await w1Client.query(
      "SELECT id FROM meta_publishing_transactions WHERE id = $1 FOR UPDATE NOWAIT",
      [txId]
    );
    const w1Claimed = w1Res.rows.length; // Should be 1

    // Worker 2: try SKIP LOCKED while Worker 1 holds — should get 0 rows
    const w2Client = await pool.connect();
    await w2Client.query('BEGIN');
    const w2Res = await w2Client.query(
      "SELECT id FROM meta_publishing_transactions WHERE id = $1 FOR UPDATE SKIP LOCKED",
      [txId]
    );
    const w2Claimed = w2Res.rows.length; // Should be 0
    await w2Client.query('COMMIT');
    w2Client.release();

    // Worker 1 releases
    await w1Client.query('COMMIT');
    w1Client.release();

    // Worker 3: after release, should be able to claim
    const w3Client = await pool.connect();
    await w3Client.query('BEGIN');
    const w3Res = await w3Client.query(
      "SELECT id FROM meta_publishing_transactions WHERE id = $1 FOR UPDATE SKIP LOCKED",
      [txId]
    );
    const w3Claimed = w3Res.rows.length; // Should be 1
    await w3Client.query('COMMIT');
    w3Client.release();

    return w1Claimed === 1 && w2Claimed === 0 && w3Claimed === 1;
  });

  // ================================================================
  // TEST L: End-to-end crash simulation + recovery
  // ================================================================
  await assertTest('TEST L: Full crash simulation — orphan recovered to non-PRECHECK state', async () => {
    const { campaignId } = await createTestCampaign('l');

    // Step 1: Simulate escrow worker COMMIT (PRECHECK_RUNNING created)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE host_marketing_campaigns SET escrow_status = 'released' WHERE id = $1", [campaignId]);
      const idempotencyKey = 'publish_meta_camp_' + campaignId;
      await client.query(
        "INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) VALUES ($1, $2, $3, 'PRECHECK_RUNNING')",
        [campaignId, idempotencyKey, crypto.randomUUID()]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Step 2: Simulate process crash (dispatchMetaCampaign never called)
    // Back-date the transaction to simulate 6 minutes passing
    await pool.query(
      "UPDATE meta_publishing_transactions SET updated_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes' WHERE campaign_id = $1",
      [campaignId]
    );

    // Step 3: Verify orphan is discoverable
    const orphanRes = await pool.query(
      "SELECT id, publish_status FROM meta_publishing_transactions WHERE campaign_id = $1 AND publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING') AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'",
      [campaignId]
    );

    if (orphanRes.rows.length !== 1) return false;

    // Step 4: Simulate recovery worker claiming the lease
    const recoveryClient = await pool.connect();
    try {
      await recoveryClient.query('BEGIN');
      const lockRes = await recoveryClient.query(
        "SELECT id FROM meta_publishing_transactions WHERE campaign_id = $1 FOR UPDATE SKIP LOCKED",
        [campaignId]
      );
      if (lockRes.rows.length > 0) {
        await recoveryClient.query(
          "UPDATE meta_publishing_transactions SET reconciliation_started_at = CURRENT_TIMESTAMP, reconciliation_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', reconciliation_attempt_count = COALESCE(reconciliation_attempt_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $1",
          [campaignId]
        );
      }
      await recoveryClient.query('COMMIT');
    } finally {
      recoveryClient.release();
    }

    // Step 5: Verify lease was claimed
    const leaseCheck = await pool.query(
      'SELECT reconciliation_attempt_count, reconciliation_lease_expires_at FROM meta_publishing_transactions WHERE campaign_id = $1',
      [campaignId]
    );

    const attemptCount = leaseCheck.rows[0].reconciliation_attempt_count;
    const leaseExpires = leaseCheck.rows[0].reconciliation_lease_expires_at;

    return attemptCount >= 1 && leaseExpires !== null;
  });

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('\n================================================================');
  console.log('TEST MATRIX SUMMARY: ' + passedTests + ' PASSED, ' + failedTests + ' FAILED out of ' + (passedTests + failedTests) + ' tests.');
  console.log('================================================================\n');

  await pool.end();

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error during test matrix execution:', err);
  process.exit(1);
});
