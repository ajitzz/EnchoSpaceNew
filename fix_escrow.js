import fs from 'fs';

const path = 'server.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /app\.post\('\/api\/admin\/payments\/escrow\/release', async \(req: Request, res: Response\) => \{[\s\S]*?\}\);/g;

const replacement = `app.post('/api/admin/payments/escrow/release', async (req: Request, res: Response) => {
  let releaseClient;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
    const adminId = decoded.userId || decoded.id;

    const { campaign_id } = req.body;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

    releaseClient = await pool.connect();
    await releaseClient.query('BEGIN');
    const cRes = await releaseClient.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaign_id]);
    
    if (cRes.rows.length === 0) {
      await releaseClient.query('ROLLBACK');
      releaseClient.release();
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const campaign = cRes.rows[0];

    // Check prerequisites
    if (!campaign.admin_approved) {
      await releaseClient.query('ROLLBACK');
      releaseClient.release();
      return res.status(400).json({ error: 'Campaign is not admin approved' });
    }
    if (campaign.payment_status !== 'paid' && campaign.payment_status !== 'PAYMENT_SUCCESS') {
      await releaseClient.query('ROLLBACK');
      releaseClient.release();
      return res.status(400).json({ error: 'Payment is not settled' });
    }

    await releaseClient.query(
      \`UPDATE host_marketing_campaigns 
       SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1\`,
      [campaign_id]
    );

    await logAdminAudit(adminId, 'campaign_escrow', campaign_id, 'force_release_escrow', { escrow_status: campaign.escrow_status }, { escrow_status: 'released' });

    // Transition to META_API_PUSH directly from approved (do not go through ASSET_PREP)
    await transitionCampaignState({ campaignId: campaign_id, to: 'META_API_PUSH', reason: 'Escrow released, dispatching to Meta', actorType: 'admin', client: releaseClient });

    await releaseClient.query('COMMIT');
    releaseClient.release();
    releaseClient = undefined;

    let dispatchError: any;
    try {
        const metaSuccess = await dispatchMetaCampaign(campaign_id, { protocol: 'https', get: () => 'localhost' });
        if (!metaSuccess) {
            // Find true error from meta_publishing_transactions
            const errQuery = await pool.query(\`SELECT error_details FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 1\`, [campaign_id]);
            if (errQuery.rows.length > 0 && errQuery.rows[0].error_details) {
                const details = typeof errQuery.rows[0].error_details === 'string' ? JSON.parse(errQuery.rows[0].error_details) : errQuery.rows[0].error_details;
                dispatchError = new Error(details?.error?.message || 'Meta dispatch failed (see transaction log)');
            } else {
                dispatchError = new Error('Meta dispatch failed');
            }
            await transitionCampaignState({ campaignId: campaign_id, to: 'failed_publish', reason: \`Meta dispatch failed: \${dispatchError.message}\`, actorType: 'system' });
        } else {
            await dispatchGoogleAdsCampaign(campaign_id, { protocol: 'https', get: () => 'localhost' });
        }
    } catch (err: any) {
        dispatchError = err;
        await transitionCampaignState({ campaignId: campaign_id, to: 'failed_publish', reason: \`Meta dispatch failed: \${err.message}\`, actorType: 'system' });
    }

    broadcastDbEvent(req, 'marketing');

    if (dispatchError) {
        return res.status(500).json({ error: dispatchError.message || 'Meta dispatch failed', details: dispatchError });
    }

    return res.json({
      success: true,
      message: \`Escrow for Campaign #\${campaign_id} force-released by Admin. Ad spend dispatched to Meta & Google network.\`
    });

  } catch (err: any) {
    if (releaseClient) {
      await releaseClient.query('ROLLBACK').catch(() => {});
      releaseClient.release();
    }
    res.status(500).json({ error: err.message || 'Failed to release escrow' });
  }
});`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content);
console.log("Replaced");
