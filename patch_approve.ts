import fs from 'fs';
let serverCode = fs.readFileSync('server.ts', 'utf8');

const oldApprove = `app.post('/api/admin/marketing/campaigns/:id/approve', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const client = await pool.connect();
  try {
    if (req.user?.role !== 'admin') {
      client.release();
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    await client.query('BEGIN');
    // Fetch complete campaign state with row lock FOR UPDATE
    const prevCheck = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [id]);
    if (prevCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const prevState = prevCheck.rows[0];`;

const newApprove = `app.post('/api/admin/marketing/campaigns/:id/approve', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const client = await pool.connect();
  try {
    if (req.user?.role !== 'admin') {
      client.release();
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const idempotencyKey = req.body.idempotency_key || req.headers['x-idempotency-key'] || ('approve_' + id + '_' + Date.now());
    await client.query('BEGIN');

    try {
      await client.query(\`
        INSERT INTO operation_idempotency_keys (campaign_id, operation_type, idempotency_key)
        VALUES ($1, $2, $3)
      \`, [id, 'APPROVE_CAMPAIGN', idempotencyKey]);
    } catch (e: any) {
      if (e.code === '23505') {
        await client.query('ROLLBACK');
        client.release();
        return res.json({ success: true, message: 'Idempotent replay', idempotent: true });
      }
      throw e;
    }

    // Fetch complete campaign state with row lock FOR UPDATE
    const prevCheck = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [id]);
    if (prevCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const prevState = prevCheck.rows[0];

    // M2: Check existing state to guarantee zero downstream side effects if already approved
    if (prevState.admin_approved === true || ['approved', 'ASSET_PREP', 'META_API_PUSH', 'CAMPAIGN_LIVE', 'active'].includes(prevState.status)) {
      await client.query('ROLLBACK');
      client.release();
      return res.json({ success: true, message: 'ALREADY_APPROVED', campaign: prevState, idempotent: true });
    }
`;

if (serverCode.includes(oldApprove)) {
    serverCode = serverCode.replace(oldApprove, newApprove);
    fs.writeFileSync('server.ts', serverCode);
    console.log("Patched M2 Approve Idempotency");
} else {
    console.log("Could not find the target code for M2 Approve");
}
