const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `// Handle real Razorpay Webhooks`;

const replace = `// Gap 2: Asynchronous Webhook Engine (Ad Network Sync)
app.post('/api/webhooks/ad-network', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
     const payload = req.body;
     const source = req.query.source || 'meta'; // 'meta' or 'google'
     
     // Webhooks from Meta/Google must not block the main thread.
     // We push them into the async_webhook_queue to be processed by a background worker.
     await pool.query(\`
        CREATE TABLE IF NOT EXISTS async_webhook_queue (
            id SERIAL PRIMARY KEY,
            source VARCHAR(50),
            payload JSONB,
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
     \`);

     await pool.query("INSERT INTO async_webhook_queue (source, payload) VALUES ($1, $2)", [source, JSON.stringify(payload)]);
     console.log(\`[ASYNC WEBHOOK ENGINE] Received \${source} ad network webhook. Queued for background processing.\`);

     // Acknowledge immediately to the ad network to prevent timeouts
     return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
     console.error('[ASYNC WEBHOOK ENGINE ERROR]', err);
     return res.status(500).send('Internal Server Error');
  }
});

// Background Worker for Gap 2: Asynchronous Webhook Engine
const processAsyncWebhookQueue = async () => {
    if (!isDbConfigured) return;
    try {
        const queueRes = await pool.query("SELECT * FROM async_webhook_queue WHERE status = 'pending' LIMIT 50");
        for (const row of queueRes.rows) {
            console.log(\`[BACKGROUND WORKER] Processing queued Ad Network webhook ID: \${row.id} from \${row.source}\`);
            // Here we would parse row.payload (e.g. ad approvals, impression syncs)
            // For now, we just mark it as processed
            await pool.query("UPDATE async_webhook_queue SET status = 'processed' WHERE id = $1", [row.id]);
        }
    } catch (err) {
        console.error('[BACKGROUND WORKER ERROR]', err);
    }
};
setInterval(processAsyncWebhookQueue, 60 * 1000); // Check every 60 seconds

// Handle real Razorpay Webhooks`;

if (code.includes(target)) {
   code = code.replace(target, replace);
   fs.writeFileSync('server.ts', code);
   console.log('Gap 2 added.');
} else {
   console.log('Target for Gap 2 not found.');
}
