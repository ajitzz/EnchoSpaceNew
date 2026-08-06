const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const functionCode = `// Milestone 6: The "Cold Start" Lead Alert System
async function triggerColdStartAlert(hostId, listingTitle, threadId = null, req = null) {
  try {
    // We NEVER include the lead's contact info or message in the alert.
    // This psychologically forces the host to open the Encho app.
    const message = \`You have a new Hot Lead for '\${listingTitle}'! Click to reply.\`;
    
    console.log(\`[COLD START ALERT] 🟢 Dispatching Multi-Channel Alert (SMS/Email/Push) to Host #\${hostId}\`);
    console.log(\`[COLD START ALERT] 📩 Content: "\${message}"\`);
    console.log(\`[COLD START ALERT] 🔒 Security Note: No PII or lead message content included. Forcing Walled Garden CRM open.\`);

    // In a real implementation, we would call Twilio/SendGrid here.
    
    // Attempt real-time socket push if available
    try {
        const io = app.get('io');
        if (io) {
            io.to(\`user_\${hostId}\`).emit('notification', {
                type: 'new_lead',
                title: '🔥 New Ad Lead Received!',
                message: message,
                threadId: threadId
            });
            if (req) {
              broadcastDbEvent(req, 'marketing');
            }
        }
    } catch(e) {}
  } catch(err) {
    console.error('[COLD START ERROR]', err);
  }
}
`;

// Insert the function above app.post('/api/marketing/meta/webhooks' ...
const targetLocation = `// Milestone 4: Native Webhooks & The Walled Garden CRM`;
const newLocation = functionCode + "\n" + targetLocation;

code = code.replace(targetLocation, newLocation);

// Also replace the old logic in the webhook
const targetWebhookAlert = `              // Cold Start Notification Trigger
              console.log(\`[ALERT] Cold Start SMS/Email dispatched to Host #\${camp.host_id}: "You have a new Hot Lead for '\${camp.listing_title}'! Click to reply."\`);
              
              const io = app.get('io');
              if (io) {
                  io.to(\`user_\${camp.host_id}\`).emit('notification', {
                      type: 'new_lead',
                      title: '🔥 New Ad Lead Received!',
                      message: \`You have a new Hot Lead for '\${camp.listing_title}'. Click to reply in CRM.\`,
                      threadId: threadId,
                      campaignId: camp.id
                  });
              }
              broadcastDbEvent(req, 'marketing');`;

const newWebhookAlert = `              // Milestone 6: Cold Start Notification Trigger
              await triggerColdStartAlert(camp.host_id, camp.listing_title, threadId, req);`;

code = code.replace(targetWebhookAlert, newWebhookAlert);

fs.writeFileSync('server.ts', code);
console.log('Fixed Cold Start Alert in Webhook');
