const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `    const { receiverId, content } = req.body;
    const senderId = req.user?.id;`;

const replacement1 = `    const { receiverId, content } = req.body;
    const senderId = req.user?.id;
    
    const { sanitized, wasSanitized } = maskContactInfo(content || '');`;

code = code.replace(target1, replacement1);

const target2 = `    const result = await pool.query(\`
      INSERT INTO messages (thread_id, sender_id, receiver_id, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    \`, [id, senderId, receiverId, content]);`;

const replacement2 = `    const result = await pool.query(\`
      INSERT INTO messages (thread_id, sender_id, receiver_id, content, is_sanitized)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    \`, [id, senderId, receiverId, sanitized, wasSanitized]);`;

code = code.replace(target2, replacement2);

const target3 = `    // update thread
    await pool.query(\`
      UPDATE threads
      SET last_message = $2, updated_at = CURRENT_TIMESTAMP,`;

const replacement3 = `    // update thread
    await pool.query(\`
      UPDATE threads
      SET last_message = $2, updated_at = CURRENT_TIMESTAMP,`;

code = code.replace("SET last_message = $2, updated_at = CURRENT_TIMESTAMP,", replacement3); // this was just to check, not really replacing anything different.
// actually wait, I need to replace content with sanitized in the thread update:
const target4 = `      WHERE id = $1
    \`, [id, content, receiverId]);`;

const replacement4 = `      WHERE id = $1
    \`, [id, sanitized, receiverId]);`;

code = code.replace(target4, replacement4);

fs.writeFileSync('server.ts', code);
console.log('Thread messages updated');
