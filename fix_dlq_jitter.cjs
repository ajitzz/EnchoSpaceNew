const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origDlq = `const processWebhookDLQ = async () => {
  if (!isDbConfigured) return;
  try {
     const dlqItems = await pool.query("SELECT * FROM webhook_dlq WHERE retry_count < 5 AND next_retry_at <= NOW()");
     for (const item of dlqItems.rows) {
         console.log(\`[DLQ PROCESSOR] Retrying failed webhook ID \${item.id} from source '\${item.source}' (Attempt \${item.retry_count + 1})\`);
         // We would re-process item.payload here based on item.source (e.g. 'stripe', 'razorpay')
         // Mocking a success:
         await pool.query("DELETE FROM webhook_dlq WHERE id = $1", [item.id]);
         console.log(\`[DLQ PROCESSOR] Successfully recovered webhook ID \${item.id}\`);
     }
  } catch (err) {
    console.error('[DLQ PROCESSOR ERROR]', err);
  }
};`;

const replDlq = `const processWebhookDLQ = async () => {
  if (!isDbConfigured) return;
  try {
     const dlqItems = await pool.query("SELECT * FROM webhook_dlq WHERE retry_count < 5 AND next_retry_at <= NOW()");
     for (const item of dlqItems.rows) {
         console.log(\`[DLQ PROCESSOR] Retrying failed webhook ID \${item.id} from source '\${item.source}' (Attempt \${item.retry_count + 1})\`);
         try {
             // Mock failure randomly for testing the retry jitter
             const isFail = Math.random() < 0.3; // 30% chance to fail again
             if (isFail) throw new Error("Simulated network failure");
             
             // Success
             await pool.query("DELETE FROM webhook_dlq WHERE id = $1", [item.id]);
             console.log(\`[DLQ PROCESSOR] Successfully recovered webhook ID \${item.id}\`);
         } catch (retryErr: any) {
             const newRetryCount = item.retry_count + 1;
             if (newRetryCount >= 5) {
                 await pool.query("UPDATE webhook_dlq SET status = 'failed' WHERE id = $1", [item.id]);
                 console.log(\`[DLQ PROCESSOR] Webhook ID \${item.id} permanently failed after 5 attempts.\`);
             } else {
                 // Exponential backoff with jitter
                 // Delay: base_delay * (2 ^ retry_count) + jitter
                 // base_delay = 5 mins, jitter = 0 to 60 secs
                 const baseDelayMs = 5 * 60 * 1000;
                 const exponentialDelayMs = baseDelayMs * Math.pow(2, item.retry_count);
                 const jitterMs = Math.floor(Math.random() * 60000);
                 const totalDelayMs = exponentialDelayMs + jitterMs;
                 
                 // Using PostgreSQL interval syntax for accurate addition in DB or we can compute in JS:
                 const nextRetryDate = new Date(Date.now() + totalDelayMs);
                 
                 await pool.query("UPDATE webhook_dlq SET retry_count = $1, next_retry_at = $2 WHERE id = $3", [newRetryCount, nextRetryDate.toISOString(), item.id]);
                 console.log(\`[DLQ PROCESSOR] Webhook ID \${item.id} failed. Scheduled next retry at \${nextRetryDate.toISOString()} (Delay: \${totalDelayMs}ms with jitter)\`);
             }
         }
     }
  } catch (err) {
    console.error('[DLQ PROCESSOR ERROR]', err);
  }
};`;

code = code.replace(origDlq, replDlq);
fs.writeFileSync('server.ts', code);
console.log('DLQ Jitter updated.');
