const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newEndpoint = `
app.get('/api/admin/marketing/campaigns/:id/traces', authenticateToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const campaignId = req.params.id;
  try {
    const result = await pool.query(
      'SELECT * FROM meta_api_traces WHERE campaign_id = $1 ORDER BY created_at ASC',
      [campaignId]
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching meta traces:', error);
    res.status(500).json({ error: 'Failed to fetch traces' });
  }
});
`;

if (!code.includes('/api/admin/marketing/campaigns/:id/traces')) {
  const target = "app.get('/api/admin/marketing/campaigns', authenticateToken, async (req: AuthRequest, res) => {";
  code = code.replace(target, newEndpoint + '\n' + target);
  fs.writeFileSync('server.ts', code);
  console.log('Added traces endpoint');
} else {
  console.log('Traces endpoint already exists');
}
