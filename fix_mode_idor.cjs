const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `app.put('/api/listings/:id/mode', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();
    const { rentalMode } = req.body;
    await pool.query('UPDATE listings SET rental_mode = $1 WHERE id = $2', [rentalMode, req.params.id]);`;

const replace = `app.put('/api/listings/:id/mode', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();
    
    // IDOR Protection: Verify ownership or admin role
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
       return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this listing.' });
    }

    const { rentalMode } = req.body;
    await pool.query('UPDATE listings SET rental_mode = $1 WHERE id = $2', [rentalMode, req.params.id]);`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('IDOR check added to mode');
