const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const schemaT = `      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='listing_id') THEN
        ALTER TABLE messages ADD COLUMN listing_id INT REFERENCES listings(id) ON DELETE CASCADE;
      END IF;`;

const schemaR = `      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='listing_id') THEN
        ALTER TABLE messages ADD COLUMN listing_id INT REFERENCES listings(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_sanitized') THEN
        ALTER TABLE messages ADD COLUMN is_sanitized BOOLEAN DEFAULT false;
      END IF;`;

code = code.replace(schemaT, schemaR);

const hookT = `            // Find campaign to route lead
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
            }`;

const hookR = `            // Find campaign to route lead
            const campRes = await pool.query(
               \`SELECT c.id, c.host_id, c.listing_id, l.title as listing_title
                FROM host_marketing_campaigns c
                JOIN listings l ON c.listing_id = l.id
                WHERE c.meta_campaign_id = $1 OR ['active', 'CAMPAIGN_LIVE'].includes(c.status) LIMIT 1\`,
               [leadData.campaign_id || leadData.ad_id]
            );

            if (campRes.rows.length > 0) {
              const camp = campRes.rows[0];
              
              // Walled Garden CRM: We don't want the host calling the user directly.
              let rawInquiry = leadData.message || 'I am interested in booking this property.';
              const { sanitized, wasSanitized } = maskContactInfo(rawInquiry);

              let guestId = null;
              const guestRes = await pool.query("SELECT id FROM users WHERE role = 'guest' ORDER BY id ASC LIMIT 1");
              if (guestRes.rows.length > 0) {
                  guestId = guestRes.rows[0].id;
              } else {
                  guestId = camp.host_id; // Fallback
              }

              let threadId;
              const threadCheck = await pool.query(
                  "SELECT id FROM threads WHERE host_id = $1 AND listing_id = $2 AND guest_id = $3 LIMIT 1",
                  [camp.host_id, camp.listing_id, guestId]
              );
              if (threadCheck.rows.length > 0) {
                  threadId = threadCheck.rows[0].id;
                  await pool.query(
                      "UPDATE threads SET last_message = $1, unread_count_host = unread_count_host + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                      [sanitized, threadId]
                  );
              } else {
                  const newThread = await pool.query(
                      "INSERT INTO threads (guest_id, host_id, listing_id, last_message, unread_count_host) VALUES ($1, $2, $3, $4, 1) RETURNING id",
                      [guestId, camp.host_id, camp.listing_id, sanitized]
                  );
                  threadId = newThread.rows[0].id;
              }

              await pool.query(
                  "INSERT INTO messages (thread_id, sender_id, receiver_id, content, is_sanitized) VALUES ($1, $2, $3, $4, $5)",
                  [threadId, guestId, camp.host_id, sanitized, wasSanitized]
              );

              await pool.query(
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
                      threadId: threadId,
                      campaignId: camp.id
                  });
              }
              broadcastDbEvent(req, 'marketing');
            } else {
               console.log(\`[META WEBHOOK] Received lead for untracked campaign/ad: \${leadData.campaign_id || leadData.ad_id}\`);
            }`;

if (code.includes('SELECT id, user_id FROM host_marketing_campaigns')) {
  code = code.replace(hookT, hookR);
} else {
  console.log("Hook replace failed! Txt not found.");
}

fs.writeFileSync('server.ts', code);
console.log('Fixed milestone 4 in server.ts');
