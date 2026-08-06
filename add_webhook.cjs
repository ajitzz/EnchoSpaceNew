const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const webhookCode = `
// Milestone 4: Native Webhooks & The Walled Garden CRM (Meta Lead Integration)
// Milestone 2: The Meta Async Webhook Sync (Ad Approval & Status)
app.post('/api/meta-webhooks', async (req, res) => {
  // Meta expects a 200 OK within 5 seconds, otherwise they throttle.
  res.status(200).send('EVENT_RECEIVED');

  try {
    const payload = req.body;
    console.log('[META CAPI WEBHOOK] Received Event:', JSON.stringify(payload, null, 2));
    
    if (payload.object === 'page' || payload.object === 'ad_account') {
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
          
          if (change.field === 'ad_status' || change.field === 'campaign_status') {
            const statusInfo = change.value;
            console.log(\`[META WEBHOOK] Status update for Campaign \${statusInfo.campaign_id}: \${statusInfo.status}\`);
            
            let ourStatus = 'PENDING';
            if (statusInfo.status === 'ACTIVE' || statusInfo.status === 'APPROVED') ourStatus = 'ACTIVE';
            else if (statusInfo.status === 'PAUSED') ourStatus = 'PAUSED';
            else if (statusInfo.status === 'REJECTED' || statusInfo.status === 'DISAPPROVED') ourStatus = 'REJECTED';
            
            await pool.query(
               "UPDATE host_marketing_campaigns SET meta_status = $1, status = CASE WHEN status != 'PAUSED' THEN $1 ELSE status END WHERE meta_campaign_id = $2 OR meta_ad_id = $2",
               [ourStatus, statusInfo.campaign_id]
            );
          }
          
          if (change.field === 'ad_insights' || change.field === 'spend_update') {
            const insightInfo = change.value;
            console.log(\`[META WEBHOOK] Spend update for Campaign \${insightInfo.campaign_id}: \${insightInfo.spend}\`);
            
            // Background sync updates the "Fuel Tank" metric
            await pool.query(
               "UPDATE host_marketing_campaigns SET spent_budget = COALESCE(spent_budget, 0) + $1 WHERE meta_campaign_id = $2 OR meta_ad_id = $2",
               [Number(insightInfo.spend) || 0, insightInfo.campaign_id]
            );
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
  // Find the place right before Vite middleware or app.listen
  // It's safer to put it right before `app.listen`
  code = code.replace("app.listen(port", webhookCode + "\n\napp.listen(port");
  fs.writeFileSync('server.ts', code);
  console.log("Added Meta Webhooks (Milestone 2 & 4).");
} else {
  console.log("Webhooks already exist.");
}
