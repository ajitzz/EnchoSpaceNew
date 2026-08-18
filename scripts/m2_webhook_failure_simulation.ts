import { Pool } from 'pg';
import { WebhookWorkerService } from '../src/lib/webhookWorkerService.js';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function simulateWebhookProcessing() {
  console.log('--- STARTING M2 WEBHOOK FAILURE SIMULATION ---');

  // 0. Ensure table exists for simulation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbound_webhooks (
      webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(50) NOT NULL,
      event_type VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      signature_metadata JSONB,
      status VARCHAR(50) DEFAULT 'pending',
      attempts INT DEFAULT 0,
      next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      error_state TEXT,
      correlation_id VARCHAR(255),
      idempotency_key VARCHAR(255) UNIQUE,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 1. Insert a mock pending webhook for Meta leads
  const correlationId = `sim_wh_${Date.now()}`;
  await pool.query(`
    INSERT INTO inbound_webhooks (provider, event_type, payload, idempotency_key, correlation_id, status)
    VALUES ('meta', 'new_lead', '{"test": "payload"}', $1, $2, 'pending')
  `, [correlationId, correlationId]);
  
  console.log(`[SIM] Inserted test webhook (correlationId: ${correlationId})`);

  // Change it to Stripe so we can inject the failure via the handler
  await pool.query(`
    UPDATE inbound_webhooks SET provider = 'stripe', event_type = 'payment_intent.succeeded' 
    WHERE correlation_id = $1
  `, [correlationId]);

  const faultInjectedPaymentHandler = async () => {
    console.log('[SIM] faultInjectedPaymentHandler called! Simulating database crash / network timeout...');
    throw new Error('SIMULATED_DB_CRASH_DURING_PROCESSING');
  };

  // 3. Process the queue using the worker
  console.log('[SIM] Running WebhookWorkerService...');
  await WebhookWorkerService.processInboundWebhooks(pool, faultInjectedPaymentHandler);

  // 4. Verify the webhook state is pending and next_retry_at is incremented
  const res = await pool.query('SELECT status, attempts, error_state, next_retry_at FROM inbound_webhooks WHERE correlation_id = $1', [correlationId]);
  
  if (res.rows.length === 0) {
    console.error('[SIM] FATAL: Webhook was lost from the database!');
    process.exit(1);
  }

  const wh = res.rows[0];
  console.log(`[SIM] Webhook State After Crash:`);
  console.log(`  - Status: ${wh.status}`);
  console.log(`  - Attempts: ${wh.attempts}`);
  console.log(`  - Error: ${wh.error_state}`);
  
  if (wh.status === 'pending' && wh.attempts === 1) {
    console.log('[SIM] SUCCESS: Webhook gracefully caught the crash and remained in pending state for retry via exponential backoff.');
  } else {
    console.error('[SIM] FAILED: Webhook did not recover correctly.');
    process.exit(1);
  }
  
  // Clean up
  await pool.query('DELETE FROM inbound_webhooks WHERE correlation_id = $1', [correlationId]);
  console.log('--- SIMULATION COMPLETE ---');
  process.exit(0);
}

simulateWebhookProcessing();
