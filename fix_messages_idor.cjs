const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { bookingId, senderId, receiverId, content } = req.body;

    if (!bookingId || !senderId || !content) {`;

const replace = `app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { bookingId, receiverId, content } = req.body;
    
    // Security: Use authenticated user ID to prevent spoofing
    const senderId = req.user?.id;
    if (!senderId) return res.status(401).json({ error: 'Unauthorized' });

    if (!bookingId || !content) {`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('IDOR check added to messages');
