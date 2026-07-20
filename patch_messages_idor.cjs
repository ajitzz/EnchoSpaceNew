const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (!bookingId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }`;

const replacement = `    if (!bookingId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Phase 4 (Security): Prevent IDOR by verifying sender belongs to the booking
    const bookingCheck = await pool.query(\`
      SELECT b.user_id, l.user_id as host_id
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.id = $1
    \`, [bookingId]);
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const bData = bookingCheck.rows[0];
    if (bData.user_id !== senderId && bData.host_id !== senderId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: You are not part of this booking.' });
    }`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
console.log('Patched messages IDOR');
