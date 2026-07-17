const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `    // update thread
    await pool.query(\`
      UPDATE threads
      SET last_message = $2, updated_at = CURRENT_TIMESTAMP,`;

const replacement1 = `    // Gap 7: "Cold Start" Lead Alert System (Multi-Channel Ping)
    // Only send if message is from guest to host
    if (receiverId) {
      const threadCheck = await pool.query("SELECT guest_id, host_id, listing_id, experience_id FROM threads WHERE id = $1", [id]);
      if (threadCheck.rows.length > 0) {
         const t = threadCheck.rows[0];
         if (String(senderId) === String(t.guest_id) && String(receiverId) === String(t.host_id)) {
            let propertyName = "your property";
            if (t.listing_id) {
               const lCheck = await pool.query("SELECT title FROM listings WHERE id = $1", [t.listing_id]);
               if (lCheck.rows.length > 0) propertyName = lCheck.rows[0].title;
            } else if (t.experience_id) {
               const eCheck = await pool.query("SELECT title FROM experiences WHERE id = $1", [t.experience_id]);
               if (eCheck.rows.length > 0) propertyName = eCheck.rows[0].title;
            }
            console.log(\`[COLD START ALERT] 🚨 SMS/Push dispatched to Host #\${t.host_id}: "You have a new Hot Lead for '\${propertyName}'! Click to reply." (Data Masked)\`);
         }
      }
    }

    // update thread
    await pool.query(\`
      UPDATE threads
      SET last_message = $2, updated_at = CURRENT_TIMESTAMP,`;

code = code.replace(target1, replacement1);

fs.writeFileSync('server.ts', code);
console.log('Cold start alert added');
