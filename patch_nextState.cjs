const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /if \(nextState !== campaign\.status\) \{\n\s*await client\.query\('UPDATE host_marketing_campaigns SET status = \$1 WHERE id = \$2', \[nextState, campaignId\]\);\n\s*\}/g,
  `if (nextState !== campaign.status) {
                await transitionCampaignState({ 
                    campaignId: Number(campaignId), 
                    to: nextState as any, 
                    reason: 'Webhook-driven state transition',
                    actorType: 'webhook',
                    client: client 
                });
            }`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed nextState update');
