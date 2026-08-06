const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetBookingMsg = `        const initialMsgContent = \`Hi, I have submitted a booking request.
Details:
-Property-Name : \${listingTitle || 'Requested Property'}
- Move-in Date: \${moveInDate}
- Configuration: \${configuration || 'Entire Property'}
- Name: \${name}
- Phone: \${phone}
- Rent: $\${totalRent}\`;

        // Insert initial automated message representing the reservation
        await pool.query('INSERT INTO messages (thread_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)', [threadId, userId, hostId || null, initialMsgContent]);
        await pool.query(\`
          UPDATE threads
          SET last_message = $2, updated_at = CURRENT_TIMESTAMP,
              unread_count_host = COALESCE(unread_count_host, 0) + 1
          WHERE id = $1
        \`, [threadId, initialMsgContent]);`;

const newBookingMsg = `        let initialMsgContent = \`Hi, I have submitted a booking request.
Details:
-Property-Name : \${listingTitle || 'Requested Property'}
- Move-in Date: \${moveInDate}
- Configuration: \${configuration || 'Entire Property'}
- Name: \${name}
- Phone: \${phone}
- Rent: $\${totalRent}\`;

        const { sanitized, wasSanitized } = maskContactInfo(initialMsgContent);
        initialMsgContent = sanitized;

        // Insert initial automated message representing the reservation
        await pool.query('INSERT INTO messages (thread_id, sender_id, receiver_id, content, is_sanitized) VALUES ($1, $2, $3, $4, $5)', [threadId, userId, hostId || null, initialMsgContent, wasSanitized]);
        await pool.query(\`
          UPDATE threads
          SET last_message = $2, updated_at = CURRENT_TIMESTAMP,
              unread_count_host = COALESCE(unread_count_host, 0) + 1
          WHERE id = $1
        \`, [threadId, initialMsgContent]);
        
        // Trigger Cold Start Alert to Host if hostId exists
        if (hostId) {
            triggerColdStartAlert(hostId, listingTitle || 'Your Property', threadId).catch(e => console.error(e));
        }`;

code = code.replace(targetBookingMsg, newBookingMsg);
fs.writeFileSync('server.ts', code);
console.log('Fixed Booking Message');
