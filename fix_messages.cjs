const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  `    if (!bookingId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(\``,
  `    if (!bookingId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { sanitized, wasSanitized } = maskContactInfo(content);

    const result = await pool.query(\``
);

fs.writeFileSync('server.ts', code);
