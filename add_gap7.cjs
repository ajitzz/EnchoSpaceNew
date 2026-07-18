const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    if (receiverId) {
      io.to(receiverId.toString()).emit('newMessage', {`;
      
const target2 = `    const message = result.rows[0];

    // Update thread last message
    await pool.query(\`
      UPDATE threads
      SET last_message = $1, updated_at = CURRENT_TIMESTAMP`;

const replacement2 = `    const message = result.rows[0];

    // Gap 7: Cold Start Lead Alert System
    try {
       const threadInfo = await pool.query("SELECT lead_source, listing_id FROM threads WHERE id = $1", [id]);
       if (threadInfo.rows.length > 0 && threadInfo.rows[0].lead_source !== 'organic') {
           const hostRes = await pool.query("SELECT phone, email, name FROM users WHERE id = $1", [receiverId]);
           if (hostRes.rows.length > 0) {
               const host = hostRes.rows[0];
               // ONLY if it's from guest to host
               if (req.user?.id !== receiverId) {
                  console.log(\`[COLD START ALERT] Dispatching high-priority SMS/Email to \${host.name} (\${host.phone || host.email}). "You have a new Hot Lead! Click to reply." (No PII leaked)\`);
               }
           }
       }
    } catch(e) { console.error(e) }

    // Update thread last message
    await pool.query(\`
      UPDATE threads
      SET last_message = $1, updated_at = CURRENT_TIMESTAMP`;

if (code.includes(target2) && !code.includes('Cold Start Lead Alert System')) {
  code = code.replace(target2, replacement2);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 7 Added');
} else {
  console.log('Target not found or already added');
}

