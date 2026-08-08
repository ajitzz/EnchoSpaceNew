const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newEndpoints = `
// Phase 6 & 8: Operations Dashboard & Metrics
app.get('/api/admin/marketing/dashboard/stats', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    // Live queue health
    const queueHealthRes = await pool.query(\`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN publish_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN publish_status = 'PUBLISHING' THEN 1 ELSE 0 END) as publishing,
        SUM(CASE WHEN publish_status = 'PRECHECK_RUNNING' THEN 1 ELSE 0 END) as precheck,
        SUM(CASE WHEN publish_status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN publish_status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM meta_publishing_transactions
    \`);
    
    // Latency metrics
    const latencyRes = await pool.query(\`
      SELECT 
        stage, 
        AVG(latency_ms) as avg_latency,
        percentile_cont(0.95) within group (order by latency_ms) as p95_latency,
        percentile_cont(0.99) within group (order by latency_ms) as p99_latency
      FROM meta_api_traces
      WHERE latency_ms IS NOT NULL
      GROUP BY stage
    \`);
    
    // DLQ Size
    const dlqRes = await pool.query(\`SELECT COUNT(*) as dlq_size FROM meta_publishing_dlq WHERE resolved_at IS NULL\`);
    
    // Most common failure reasons
    const failureRes = await pool.query(\`
      SELECT failure_stage, COUNT(*) as count 
      FROM meta_publishing_dlq 
      GROUP BY failure_stage 
      ORDER BY count DESC 
      LIMIT 5
    \`);
    
    res.json({
      health: queueHealthRes.rows[0],
      latency: latencyRes.rows,
      dlq: dlqRes.rows[0],
      common_failures: failureRes.rows
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Phase 13: Dead Letter Queue API
app.get('/api/admin/marketing/dlq', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const dlqList = await pool.query(\`
      SELECT d.*, c.title as campaign_title
      FROM meta_publishing_dlq d
      LEFT JOIN host_marketing_campaigns c ON d.campaign_id = c.id
      ORDER BY d.created_at DESC
      LIMIT 100
    \`);
    
    res.json(dlqList.rows);
  } catch (error: any) {
    console.error('Error fetching DLQ:', error);
    res.status(500).json({ error: 'Failed to fetch DLQ' });
  }
});

// Phase 12: Replay Engine API
app.post('/api/admin/marketing/replay/:transactionId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const { transactionId } = req.params;
    
    const txRes = await pool.query(\`SELECT * FROM meta_publishing_transactions WHERE id = $1\`, [transactionId]);
    if (txRes.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const tx = txRes.rows[0];
    
    if (tx.publish_status === 'SUCCESS') {
      return res.status(400).json({ error: 'Transaction already succeeded. Cannot replay.' });
    }
    
    if (tx.publish_status === 'PUBLISHING' || tx.publish_status === 'PRECHECK_RUNNING') {
      return res.status(400).json({ error: 'Transaction is currently running.' });
    }
    
    // Resolve DLQ entry if any
    await pool.query(\`UPDATE meta_publishing_dlq SET resolved_at = CURRENT_TIMESTAMP WHERE transaction_id = $1 AND resolved_at IS NULL\`, [tx.id]);
    
    // Mark transaction as pending
    await pool.query(\`UPDATE meta_publishing_transactions SET publish_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = $1\`, [tx.id]);
    
    // Dispatch async (Replay preserves correlation ID and idempotency key inherently by re-triggering the same campaign)
    dispatchMetaCampaign(tx.campaign_id, req).catch(err => {
      console.error(\`[REPLAY ENGINE] Async replay failed for tx \${tx.id}:\`, err);
    });
    
    res.json({ success: true, message: 'Replay initiated', transaction_id: tx.id });
  } catch (error: any) {
    console.error('Error in replay engine:', error);
    res.status(500).json({ error: 'Failed to initiate replay' });
  }
});

// Phase 10: Secret & Credential Health
app.get('/api/admin/marketing/health', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    // Check Meta API Credentials
    const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    const pageId = process.env.META_PAGE_ID;
    
    const health = {
      meta_access_token: !!accessToken,
      meta_ad_account: !!adAccountId,
      meta_page_id: !!pageId,
      status: 'OPERATIONAL',
      checks: [] as any[]
    };
    
    if (!accessToken || !adAccountId) {
      health.status = 'DEGRADED';
      health.checks.push({ component: 'Meta Credentials', status: 'MISSING' });
      return res.json(health);
    }
    
    const cleanAdAccountId = adAccountId.startsWith('act_') ? adAccountId : \`act_\${adAccountId}\`;
    
    // Ping Meta API
    const metaRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}?access_token=\${accessToken}&fields=id,account_status,name\`);
    const metaData = await metaRes.json();
    
    if (metaData.error) {
      health.status = 'OUTAGE';
      health.checks.push({ component: 'Meta API Connection', status: 'ERROR', message: metaData.error.message });
    } else {
      health.checks.push({ component: 'Meta API Connection', status: 'OK', message: \`Connected to \${metaData.name}\` });
      if (metaData.account_status !== 1) { // 1 = ACTIVE
         health.checks.push({ component: 'Ad Account Status', status: 'WARNING', message: 'Account is not ACTIVE' });
         health.status = 'DEGRADED';
      }
    }
    
    res.json(health);
  } catch (error: any) {
    console.error('Error fetching credential health:', error);
    res.status(500).json({ error: 'Failed to fetch credential health' });
  }
});

`;

const anchor = "app.get('/api/admin/marketing/transactions', authenticateToken, async (req: AuthRequest, res) => {";
if (code.includes(anchor)) {
   code = code.replace(anchor, newEndpoints + "\n" + anchor);
   fs.writeFileSync('server.ts', code);
   console.log("Added operations dashboard endpoints.");
} else {
   console.log("Anchor not found");
}
