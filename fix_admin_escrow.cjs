const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetAdminEscrow = `    if (campaign.admin_approved) {
      if (campaign.payment_status === 'paid' || campaign.payment_status === 'PAYMENT_SUCCESS') {
          await executeCampaignStateMachine(campaign_id, 'PAYMENT_SUCCESS', req);
      } else {
          console.log(\`[WEBHOOK] Campaign #\${campaign_id} approved, but payment is not settled yet (\${campaign.payment_status})\`);
      }
    }`;

const newAdminEscrow = `    if (campaign.admin_approved) {
      if (campaign.payment_status === 'paid' || campaign.payment_status === 'PAYMENT_SUCCESS') {
          await pool.query(\`UPDATE host_marketing_campaigns SET status = 'ASSET_PREP' WHERE id = $1\`, [campaign_id]);
          await dispatchMetaCampaign(campaign_id, { protocol: 'https', get: () => 'localhost' });
          await dispatchGoogleAdsCampaign(campaign_id, { protocol: 'https', get: () => 'localhost' });
      } else {
          console.log(\`[WEBHOOK] Campaign #\${campaign_id} approved, but payment is not settled yet (\${campaign.payment_status})\`);
      }
    }`;

code = code.replace(targetAdminEscrow, newAdminEscrow);
fs.writeFileSync('server.ts', code);
console.log('Fixed Admin Escrow Release');
