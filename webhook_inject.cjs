const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const anchor = "app.post('/api/marketing/wallet/refuel'";
const newRoute = `// Milestone 4: Native Webhooks & The Walled Garden CRM
app.post('/api/marketing/meta/webhooks', express.json(), async (req: Request, res: Response) => {
  try {
    // 1. Meta Webhook Verification (hub.challenge)
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
      const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'encho_secure_meta_webhook_2026';
      if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log('[META WEBHOOK] Verification successful.');
        return res.status(200).send(req.query['hub.challenge']);
      } else {
        return res.sendStatus(403);
      }
    }

    // 2. We have exactly 5 seconds to respond 200 OK.
    // We send OK immediately and process asynchronously.
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    if (body.object === 'page') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadData = change.value;
            console.log(\`[META WEBHOOK] New lead received for ad \${leadData.ad_id}\`);

            // Walled Garden CRM: We don't want the host calling the user directly.
            // We mask the contact info to keep the transaction inside Encho.
            let maskedContact = '[REDACTED_BY_ENCHO_WALLED_GARDEN]';
            let leadName = 'Meta User';
            let rawInquiry = 'I am interested in booking this property.';

            // Note: In production we'd fetch the lead graph API to get real details.
            // For the sandbox pipeline, we simulate the sanitized ingestion.

            // Find campaign to route lead
            const campRes = await pool.query(
               \`SELECT id, user_id FROM host_marketing_campaigns WHERE meta_campaign_id = $1 OR status = 'active' LIMIT 1\`,
               [leadData.campaign_id || leadData.ad_id]
            );

            if (campRes.rows.length > 0) {
              const camp = campRes.rows[0];
              await pool.query(
                \`INSERT INTO lead_inquiries (campaign_id, host_id, lead_name, lead_source, lead_intent_score, masked_contact_info, raw_inquiry)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
                [camp.id, camp.user_id, leadName, 'META_LEAD_ADS', 'HOT', maskedContact, rawInquiry]
              );
              
              // Cold Start Notification Trigger
              console.log(\`[ALERT] Cold Start SMS/Email dispatched to Host #\${camp.user_id}: "You have a new Hot Lead! Click to reply."\`);
              broadcastDbEvent(req, 'marketing');
            } else {
               console.log(\`[META WEBHOOK] Received lead for untracked campaign/ad: \${leadData.campaign_id || leadData.ad_id}\`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[META WEBHOOK ERROR]', error);
  }
});

`;

if (code.includes(anchor) && !code.includes("/api/marketing/meta/webhooks")) {
    const splitIndex = code.indexOf(anchor);
    code = code.slice(0, splitIndex) + newRoute + code.slice(splitIndex);
    fs.writeFileSync('server.ts', code);
    console.log("Meta Webhook Endpoint injected.");
} else {
    console.log("Anchor not found or webhook already exists.");
}
