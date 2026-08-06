const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const webhookCode = `
// ==========================================
// Milestone 8.3: Meta Native Lead Form Webhook Receiver
// ==========================================
app.post('/api/marketing/webhooks/meta-leads', async (req, res) => {
  console.log('[META WEBHOOK] Received Native Lead Generation Webhook payload.');
  try {
     const entries = req.body.entry;
     if (!entries) return res.sendStatus(200);

     for (const entry of entries) {
         for (const change of entry.changes) {
             if (change.field === 'leadgen') {
                 const leadId = change.value.leadgen_id;
                 const formId = change.value.form_id;
                 const adId = change.value.ad_id;
                 
                 console.log(\`[META WEBHOOK] Processing new lead \${leadId} from Ad \${adId}\`);
                 
                 // Simulated CRM Injection for demonstration
                 const mockCampaignRes = await pool.query('SELECT host_id, listing_id FROM host_marketing_campaigns WHERE meta_ad_id = $1 LIMIT 1', [adId]);
                 if (mockCampaignRes.rows.length > 0) {
                     const { host_id, listing_id } = mockCampaignRes.rows[0];
                     
                     // 3. Inject into CRM (Walled Garden)
                     const insertMessage = await pool.query(
                         \`INSERT INTO messages (sender_id, receiver_id, listing_id, content, status) 
                          VALUES ($1, $2, $3, $4, 'delivered') RETURNING id\`,
                         ['meta_lead_system', host_id, listing_id, 'New Native Lead Generated! Contact details masked by Encho CRM. Reply here to connect.']
                     );
                     
                     console.log(\`[CRM] Injected Lead \${leadId} directly into Host \${host_id} Walled Garden Inbox (Message ID: \${insertMessage.rows[0].id})\`);
                 }
             }
         }
     }
     res.sendStatus(200);
  } catch (err) {
     console.error('[META WEBHOOK] Error processing leadgen webhook', err);
     res.sendStatus(500);
  }
});

// Milestone 8.4: The "Cold Start" Lead Alert System (Push/SMS)
app.post('/api/marketing/internal/test-lead-alert', authenticateToken, async (req: any, res: any) => {
    // This simulates the trigger that fires immediately AFTER the webhook injects the lead into the database.
    const { host_id, listing_id, message_id } = req.body;
    
    console.log(\`[COLD START ALERT] Lead decayed warning! Host \${host_id} is offline.\`);
    console.log(\`[COLD START ALERT] Dispatching SMS via Twilio to Host \${host_id}: "You have a new Hot Lead for your property! Click to reply on Encho."\`);
    console.log(\`[COLD START ALERT] Dispatching FCM Push Notification: "🔥 Hot Lead Alert! Open Encho now to reply."\`);
    
    // Notice: We intentionally do NOT include the lead's email/phone in the alert payload.
    // They must click the push notification to open the Walled Garden.
    
    res.json({ success: true, message: "Multi-channel alerts dispatched (SMS/Push)." });
});

`;

// Insert the webhook code before the global error handler
code = code.replace(
  "app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {",
  webhookCode + "\napp.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {"
);

fs.writeFileSync('server.ts', code);
console.log('Implemented Lead Webhook and Alert System');
