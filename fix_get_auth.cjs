const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r1Search = `app.get('/api/admin/offers', async (req, res) => {`;
const r1Replace = `app.get('/api/admin/offers', authenticateToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });`;
code = code.replace(r1Search, r1Replace);

const r2Search = `app.get('/api/host/reservations', async (req, res) => {
  if (!isDbConfigured) {
    return res.json([]);
  }
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }`;
const r2Replace = `app.get('/api/host/reservations', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.json([]);
  }
  try {
    // IDOR Protection: Use authenticated user's ID
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }`;
code = code.replace(r2Search, r2Replace);

const r3Search = `app.get('/api/messages/:bookingId', async (req, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { bookingId } = req.params;`;
const r3Replace = `app.get('/api/messages/:bookingId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;
    
    // Check if the user is authorized to view these messages
    if (req.user?.role !== 'admin') {
      const checkAuth = await pool.query('SELECT b.user_id as guest_id, l.user_id as host_id FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = $1', [bookingId]);
      if (checkAuth.rows.length === 0 || (checkAuth.rows[0].guest_id !== userId && checkAuth.rows[0].host_id !== userId)) {
        return res.status(403).json({ error: 'Not authorized to view these messages' });
      }
    }
`;
code = code.replace(r3Search, r3Replace);

const r4Search = `// Admin metrics (optional, simple stats)
app.get('/api/admin/metrics', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  try {`;
const r4Replace = `// Admin metrics (optional, simple stats)
app.get('/api/admin/metrics', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {`;
code = code.replace(r4Search, r4Replace);

const r5Search = `app.get('/api/seed-ajith', async (req, res) => {`;
const r5Replace = `app.get('/api/seed-ajith', authenticateToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });`;
code = code.replace(r5Search, r5Replace);

const r6Search = `app.get('/api/experiences/seed', async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {`;
const r6Replace = `app.get('/api/experiences/seed', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {`;
code = code.replace(r6Search, r6Replace);

fs.writeFileSync('server.ts', code);
console.log('GET routes secured');
