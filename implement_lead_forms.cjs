const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Upgrade the fallback Creative Payload to Lead Generation spec
const targetCreativeFallback = `      } else {
          // Fallback Standard Creative Payload
          const linkDataSpec: any = {
            link: destinationUrl,
            message: adMessage,
            name: adHeadline,
            call_to_action: { type: 'BOOK_NOW', value: { link: destinationUrl } },
            picture: imageUrl
          };`;

const newCreativeFallback = `      } else {
          // Fallback Standard Creative Payload (Upgraded to Native Lead Form spec)
          const linkDataSpec: any = {
            link: destinationUrl,
            message: adMessage,
            name: adHeadline,
            call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: campaign.meta_lead_form_id || 'dummy_form_id' } }, // Milestone 8.3: Native Lead Form CTA
            picture: imageUrl
          };`;

code = code.replace(targetCreativeFallback, newCreativeFallback);


// 2. Upgrade the DCO Payload to support Lead Generation forms
const targetDco = `              call_to_action_types: ['BOOK_NOW'],
              link_urls: [{ website_url: destinationUrl }]
            }`;

const newDco = `              call_to_action_types: ['SIGN_UP'], // Milestone 8.3: Lead Generation
              link_urls: [{ website_url: destinationUrl }]
            }
          };
          
          // Inject Lead Form ID if available for DCO
          if (campaign.meta_lead_form_id) {
             creativePayload.object_story_spec.link_data = {
                 call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: campaign.meta_lead_form_id } }
             };
          }`;

code = code.replace(targetDco, newDco);

// 3. Webhook listener for Lead Forms
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
                 
                 // In production:
                 // 1. Fetch lead details via Graph API using leadId and system access token
                 // 2. Query the host_marketing_campaigns table by meta_ad_id = adId
                 // 3. Inject the lead into the Encho Walled Garden CRM (messages table)
                 // 4. Trigger the 'Cold Start' SMS/Push Alert to the Host
                 
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
`;

// Insert the webhook code before the global error handler
code = code.replace(
  "app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {",
  webhookCode + "\napp.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {"
);

fs.writeFileSync('server.ts', code);
console.log('Implemented Native Lead Forms & Webhook');
