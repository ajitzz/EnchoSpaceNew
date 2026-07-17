const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `    const { bookingId, senderId, receiverId, content } = req.body;
    if (!bookingId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }`;

const replacement1 = `    const { bookingId, senderId, receiverId, content } = req.body;
    if (!bookingId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const { sanitized, wasSanitized } = maskContactInfo(content || '');`;

code = code.replace(target1, replacement1);

const target2 = `    const result = await pool.query(\`
      INSERT INTO messages (booking_id, sender_id, receiver_id, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    \`, [bookingId, senderId, receiverId || null, content]);`;

const replacement2 = `    const result = await pool.query(\`
      INSERT INTO messages (booking_id, sender_id, receiver_id, content, is_sanitized)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    \`, [bookingId, senderId, receiverId || null, sanitized, wasSanitized]);`;

code = code.replace(target2, replacement2);

fs.writeFileSync('server.ts', code);
console.log('Booking messages updated');
