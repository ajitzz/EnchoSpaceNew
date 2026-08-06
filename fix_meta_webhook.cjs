const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWebhook = `              await pool.query(
                \`INSERT INTO lead_inquiries (campaign_id, host_id, lead_name, lead_source, lead_intent_score, masked_contact_info, raw_inquiry)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
                [camp.id, camp.host_id, 'Meta User', 'META_LEAD_ADS', 'HOT', sanitized, rawInquiry]
              );
              
              // Cold Start Notification Trigger
              console.log(\`[ALERT] Cold Start SMS/Email dispatched to Host #\${camp.host_id}: "You have a new Hot Lead for '\${camp.listing_title}'! Click to reply."\`);
              
              const io = app.get('io');
              if (io) {
                  io.to(\`user_\${camp.host_id}\`).emit('notification', {
                      type: 'new_lead',
                      title: '🔥 New Ad Lead Received!',
                      message: \`You have a new Hot Lead for '\${camp.listing_title}'. Click to reply in CRM.\`,
                      campaignId: camp.id
                  });`;

const newWebhook = `              // AI Intent Scoring: Gemini evaluates the raw inquiry intent
              let aiIntentScore = '🌤️ WARM';
              try {
                if (ai) {
                  const prompt = \`Analyze this prospective guest inquiry. Rate their buying intent based on urgency, dates mentioned, or questions asked. Respond with EXACTLY ONE of these strings: "🔥 HOT", "🌤️ WARM", or "🧊 COLD". Inquiry: "\${rawInquiry}"\`;
                  const aiResult = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                  });
                  const text = aiResult.text?.trim().toUpperCase() || '';
                  if (text.includes('HOT')) aiIntentScore = '🔥 HOT';
                  if (text.includes('COLD')) aiIntentScore = '🧊 COLD';
                }
              } catch(err) {
                 logGeminiWarning("AI Intent Scoring Webhook", err);
              }

              await pool.query(
                \`INSERT INTO lead_inquiries (campaign_id, host_id, lead_name, lead_source, lead_intent_score, masked_contact_info, raw_inquiry)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
                [camp.id, camp.host_id, 'Meta User', 'META_LEAD_ADS', aiIntentScore, sanitized, rawInquiry]
              );
              
              // Cold Start Notification Trigger
              console.log(\`[ALERT] Cold Start SMS/Email dispatched to Host #\${camp.host_id}: "You have a new \${aiIntentScore} Lead for '\${camp.listing_title}'! Click to reply."\`);
              
              const io = app.get('io');
              if (io) {
                  io.to(\`user_\${camp.host_id}\`).emit('notification', {
                      type: 'new_lead',
                      title: '🔔 New Ad Lead Received!',
                      message: \`You have a new \${aiIntentScore} Lead for '\${camp.listing_title}'. Click to reply in CRM.\`,
                      campaignId: camp.id
                  });`;

code = code.replace(targetWebhook, newWebhook);
fs.writeFileSync('server.ts', code);
console.log('Fixed Webhook');
