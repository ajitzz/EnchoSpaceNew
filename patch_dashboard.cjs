const fs = require('fs');

const code = fs.readFileSync('server.ts', 'utf8');

const targetLine = "export const rlsStorage = new AsyncLocalStorage<{ userId?: number | string | null; isRequest?: boolean; bypassRls?: boolean }>();";
if (!code.includes(targetLine)) {
  console.error("Target line not found");
  process.exit(1);
}

const replacement = `
app.get('/api/admin/marketing/transactions', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const result = await pool.query(\`
      SELECT tx.*, c.title as campaign_title, u.email as host_email
      FROM meta_publishing_transactions tx
      LEFT JOIN host_marketing_campaigns c ON tx.campaign_id = c.id
      LEFT JOIN users u ON c.host_id = u.id
      ORDER BY tx.created_at DESC
      LIMIT 100
    \`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching marketing transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export const rlsStorage = new AsyncLocalStorage<{ userId?: number | string | null; isRequest?: boolean; bypassRls?: boolean }>();
`;

const updatedCode = code.replace(targetLine, replacement);
fs.writeFileSync('server.ts', updatedCode);
console.log("Successfully patched server.ts with dashboard endpoint");
