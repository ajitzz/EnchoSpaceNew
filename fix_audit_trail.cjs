const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origAudit = `    // If already approved by admin, trigger the Meta API Dispatch!
    if (campaign.admin_approved) {
      console.log(\`[WEBHOOK] Campaign #\${campaign_id} has already been approved by Admin! Dispatching Meta Ads API call...\`);
      await dispatchMetaCampaign(campaign_id, req);
    }`;

const replAudit = `    // Gap 14: Immutable Admin Audit Trail (Logging auto-approvals / state transitions)
    // When payment succeeds, we want an audit entry showing the payment transitioned state
    try {
        await pool.query(\`
          INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        \`, [null, 'marketing_campaign', campaign_id, 'payment_cleared', JSON.stringify({status: campaign.status}), JSON.stringify({status: finalStatus}), req.ip || req.socket?.remoteAddress || 'system']);
    } catch (e) {
        console.error('[AUDIT LOG ERROR]', e);
    }

    // If already approved by admin, trigger the Meta API Dispatch!
    if (campaign.admin_approved) {
      console.log(\`[WEBHOOK] Campaign #\${campaign_id} has already been approved by Admin! Dispatching Meta Ads API call...\`);
      await dispatchMetaCampaign(campaign_id, req);
    }`;

code = code.replace(origAudit, replAudit);
fs.writeFileSync('server.ts', code);
console.log('Audit trail updated.');
