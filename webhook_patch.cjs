const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const webhookCode = `
// Milestone 4: Native Webhooks & The Walled Garden CRM (Meta Lead Integration)
app.post('/api/meta-webhooks', async (req, res) => {
  // Meta expects a 200 OK within 5 seconds, otherwise they throttle.
  res.status(200).send('EVENT_RECEIVED');

  try {
    const payload = req.body;
    console.log('[META CAPI WEBHOOK] Received Lead/Event:', JSON.stringify(payload, null, 2));
    
    if (payload.object === 'page') {
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadInfo = change.value;
            console.log(\`[META CAPI WEBHOOK] Processing Lead \${leadInfo.leadgen_id} for Ad \${leadInfo.ad_id}\`);
            
            // Map the ad_id to our host_marketing_campaigns
            const campRes = await pool.query(
               "SELECT host_id, listing_id FROM host_marketing_campaigns WHERE meta_ad_id = $1 OR meta_campaign_id = $1 LIMIT 1",
               [leadInfo.ad_id]
            );
            
            if (campRes.rows.length > 0) {
               const campaign = campRes.rows[0];
               
               // Mock Lead Sanitization (Masking Data)
               const rawEmail = 'lead_user@gmail.com';
               const rawPhone = '+1 555-0199';
               const maskedEmail = rawEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length));
               const maskedPhone = '[REDACTED]';
               
               // Inject Lead directly into Encho Walled Garden Inbox
               await pool.query(
                 "INSERT INTO messages (sender_id, receiver_id, listing_id, content, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
                 [1, campaign.host_id, campaign.listing_id, \`🔥 HOT LEAD from Meta Ads!\\n\\nUser reached out from Instagram.\\nEmail: \${maskedEmail}\\nPhone: \${maskedPhone}\\n\\nReply here to engage and convert into a booking!\`]
               );
               
               console.log('[META CAPI WEBHOOK] Lead successfully injected into Host Inbox with masked details.');
               // In a real scenario, we would trigger an SMS/Email to the host here (Cold Start alert)
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[META CAPI WEBHOOK ERROR]', err);
  }
});

// Meta Webhook Verification (GET)
app.get('/api/meta-webhooks', (req, res) => {
  const VERIFY_TOKEN = 'encho_meta_secret_token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[META WEBHOOK] Verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});
`;

if (!code.includes('/api/meta-webhooks')) {
  // Insert right before app.listen or similar end
  code = code.replace("app.listen(port", webhookCode + "\n\napp.listen(port");
  fs.writeFileSync('server.ts', code);
  console.log("Added Meta Webhook endpoint.");
} else {
  console.log("Already added.");
}
