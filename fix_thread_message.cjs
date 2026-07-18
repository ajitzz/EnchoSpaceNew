const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origEndpoint = `app.post('/api/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { receiverId, content } = req.body;
    const senderId = req.user?.id;
    
    const { sanitized, wasSanitized } = maskContactInfo(content || '');`;

const newEndpoint = `app.post('/api/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { receiverId, content } = req.body;
    const senderId = req.user?.id;
    
    if (!content || String(content).trim() === '') {
       return res.status(400).json({ error: 'Message content cannot be empty.' });
    }
    
    const { sanitized, wasSanitized } = maskContactInfo(content || '');`;

code = code.replace(origEndpoint, newEndpoint);
fs.writeFileSync('server.ts', code);
console.log('Thread message fixed');
