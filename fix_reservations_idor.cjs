const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `    let result;
    if (typeof id === 'string' && id.startsWith('exp-')) {
      const realId = id.replace('exp-', '');
      result = await pool.query(
        'UPDATE experience_bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, realId]
      );
    } else {
      result = await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
    }`;

const replace = `    let result;
    if (typeof id === 'string' && id.startsWith('exp-')) {
      const realId = id.replace('exp-', '');
      
      // IDOR Protection: Verify host ownership
      const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = (SELECT experience_id FROM experience_bookings WHERE id = $1)', [realId]);
      if (expRes.rows.length === 0 || (expRes.rows[0].host_id !== req.user?.id && req.user?.role !== 'admin')) {
         return res.status(403).json({ error: 'Forbidden: Not authorized to update this booking.' });
      }
      
      result = await pool.query(
        'UPDATE experience_bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, realId]
      );
    } else {
      // IDOR Protection: Verify host ownership
      const listRes = await pool.query('SELECT user_id FROM listings WHERE id = (SELECT listing_id FROM bookings WHERE id = $1)', [id]);
      if (listRes.rows.length === 0 || (listRes.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin')) {
         return res.status(403).json({ error: 'Forbidden: Not authorized to update this booking.' });
      }

      result = await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
    }`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('IDOR check added to reservations');
