import re
with open('server.ts', 'r') as f:
    content = f.read()

webhook_code = """
// --- Milestone 5: Meta Webhook Verification & Real-Time Leads ---
app.get('/api/webhooks/meta', (req, res) => {
  const verify_token = 'encho_meta_secure_2026'; // The token from the Meta Developer Dashboard

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verify_token) {
      console.log('[META WEBHOOK] Verified successfully!');
      res.status(200).send(challenge);
    } else {
      console.error('[META WEBHOOK] Verification failed. Token mismatch.');
      res.sendStatus(403);
    }
  } else {
    res.status(400).send('Missing mode or token');
  }
});

app.post('/api/webhooks/meta', async (req, res) => {
  // Push real-time meta leads / ad status into the queue (Async Webhook Engine)
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
     const payload = req.body;
     await pool.query("INSERT INTO async_webhook_queue (source, payload) VALUES ($1, $2)", ['meta', JSON.stringify(payload)]);
     console.log(`[ASYNC WEBHOOK ENGINE] Received Meta webhook. Queued for background processing.`);
     return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
     console.error('[ASYNC WEBHOOK ENGINE ERROR]', err);
     return res.status(500).send('Internal Server Error');
  }
});
"""

if "/api/webhooks/meta" not in content:
    content = content.replace("app.post('/api/webhooks/ad-network'", webhook_code + "\napp.post('/api/webhooks/ad-network'")
    with open('server.ts', 'w') as f:
        f.write(content)
    print("Meta webhook endpoints added successfully.")
else:
    print("Meta webhook endpoints already exist.")
