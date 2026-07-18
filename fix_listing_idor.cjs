const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const putSearch = `app.put('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();
    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;`;

const putReplace = `app.put('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
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

    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;`;

const deleteSearch = `app.delete('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing deleted mockingly" });
  try {
    const id = req.params.id;
    const result = await pool.query('DELETE FROM listings WHERE id = $1 RETURNING *', [id]);`;

const deleteReplace = `app.delete('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing deleted mockingly" });
  try {
    const id = req.params.id;
    
    // IDOR Protection: Verify ownership or admin role
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [id]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
       return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this listing.' });
    }

    const result = await pool.query('DELETE FROM listings WHERE id = $1 RETURNING *', [id]);`;

code = code.replace(putSearch, putReplace).replace(deleteSearch, deleteReplace);
fs.writeFileSync('server.ts', code);
console.log('IDOR checks added to listings');
