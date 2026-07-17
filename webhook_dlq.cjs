const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `  // 2. campaign_metrics (Time-series Rollups for Gap 11)
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS campaign_metrics (`;
const replacement1 = `  // Gap 18: Webhook Dead Letter Queue (DLQ)
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS webhook_dlq (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      error_message TEXT,
      retry_count INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  \`);

  // 2. campaign_metrics (Time-series Rollups for Gap 11)
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS campaign_metrics (`;
    
code = code.replace(target1, replacement1);

const target2 = `        console.error('[STRIPE WEBHOOK VERIFICATION ERROR] Failed to construct or handle event:', stripeWebhookErr);
        return res.status(400).send(\`Webhook Error: \${stripeWebhookErr.message}\`);
      }`;
const replacement2 = `        console.error('[STRIPE WEBHOOK VERIFICATION ERROR] Failed to construct or handle event:', stripeWebhookErr);
        // Gap 18: Send failed webhook payload to Dead Letter Queue (DLQ)
        try {
           const dlqPayload = JSON.stringify(payload);
           await pool.query(
             "INSERT INTO webhook_dlq (source, payload, error_message, next_retry_at) VALUES ($1, $2, $3, NOW() + interval '5 minutes')",
             ['stripe', dlqPayload, stripeWebhookErr.message]
           );
           console.log('[DLQ] Stripe webhook safely parked in Dead Letter Queue for retry processing.');
        } catch(dlqErr) { console.error('[DLQ ERROR]', dlqErr); }
        return res.status(400).send(\`Webhook Error: \${stripeWebhookErr.message}\`);
      }`;

code = code.replace(target2, replacement2);

const target3 = `    } catch (error) {
      console.error('[RAZORPAY WEBHOOK ERROR]:', error);
      return res.status(500).json({ error: 'Internal server error processing webhook' });
    }`;
const replacement3 = `    } catch (error: any) {
      console.error('[RAZORPAY WEBHOOK ERROR]:', error);
      // Gap 18: DLQ for Razorpay
      try {
         const dlqPayload = JSON.stringify(payload);
         await pool.query(
           "INSERT INTO webhook_dlq (source, payload, error_message, next_retry_at) VALUES ($1, $2, $3, NOW() + interval '5 minutes')",
           ['razorpay', dlqPayload, error.message || 'Unknown error']
         );
         console.log('[DLQ] Razorpay webhook safely parked in Dead Letter Queue for retry processing.');
      } catch(dlqErr) { console.error('[DLQ ERROR]', dlqErr); }
      return res.status(500).json({ error: 'Internal server error processing webhook' });
    }`;
code = code.replace(target3, replacement3);

fs.writeFileSync('server.ts', code);
console.log('Webhook DLQ added');
