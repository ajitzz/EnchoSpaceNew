const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `      } catch (razorpayWebhookErr: any) {
        console.error('[RAZORPAY WEBHOOK ERROR] Failed to handle event:', razorpayWebhookErr);
        return res.status(400).send(\`Webhook Error: \${razorpayWebhookErr.message}\`);
      }`;

const replacement = `      } catch (razorpayWebhookErr: any) {
        console.error('[RAZORPAY WEBHOOK ERROR] Failed to handle event:', razorpayWebhookErr);
        // Gap 18: Send failed webhook payload to Dead Letter Queue (DLQ)
        try {
           const dlqPayload = JSON.stringify(payload);
           await pool.query(
             "INSERT INTO webhook_dlq (source, payload, error_message, next_retry_at) VALUES ($1, $2, $3, NOW() + interval '5 minutes')",
             ['razorpay', dlqPayload, razorpayWebhookErr.message]
           );
           console.log('[DLQ] Razorpay webhook safely parked in Dead Letter Queue for retry processing.');
        } catch(dlqErr) { console.error('[DLQ ERROR]', dlqErr); }
        return res.status(400).send(\`Webhook Error: \${razorpayWebhookErr.message}\`);
      }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Razorpay DLQ added.');
} else {
  console.log('Target not found for Razorpay DLQ.');
}
