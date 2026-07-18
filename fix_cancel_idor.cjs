const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `app.put('/api/user/bookings/:id/cancel', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const checkRes = await pool.query('SELECT status FROM bookings WHERE id = $1 AND user_id = $2', [id, userId]);`;

const replace = `app.put('/api/user/bookings/:id/cancel', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    
    // Security: Use authenticated user ID
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const checkRes = await pool.query('SELECT status FROM bookings WHERE id = $1 AND user_id = $2', [id, userId]);`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('IDOR check added to user booking cancel');
