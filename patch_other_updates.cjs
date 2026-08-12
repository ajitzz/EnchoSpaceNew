const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacements = [
  {
    regex: /await pool\.query\("UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'System Auto-Paused: Property 100% booked for target dates\.' WHERE id = \$1", \[c\.id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: c.id, from: c.status, to: 'paused', reason: 'System Auto-Paused: Property 100% booked for target dates.' });`
  },
  {
    regex: /await pool\.query\("UPDATE host_marketing_campaigns SET status = 'active' WHERE id = \$1", \[payload\.campaign_id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: payload.campaign_id, to: 'active', reason: 'Webhook received' });`
  },
  {
    regex: /await pool\.query\("UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'Admin manually paused campaign on Meta\.' WHERE id = \$1", \[id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: id, to: 'paused', reason: 'Admin manually paused campaign on Meta.', actorType: 'admin' });`
  },
  {
    regex: /await pool\.query\("UPDATE host_marketing_campaigns SET status = 'active', admin_feedback = NULL WHERE id = \$1", \[id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: id, to: 'active', reason: 'Admin manually resumed campaign.', actorType: 'admin' });`
  },
  {
    regex: /await pool\.query\("UPDATE host_marketing_campaigns SET status = 'killed', admin_feedback = 'Killed and archived by Administrator\. Unused budget refunded\.' WHERE id = \$1", \[id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: id, to: 'killed', reason: 'Killed and archived by Administrator. Unused budget refunded.', actorType: 'admin' });`
  },
  {
    regex: /await pool\.query\(\`UPDATE host_marketing_campaigns SET status = 'ASSET_PREP' WHERE id = \$1\`, \[campaign_id\]\);/g,
    replace: `await transitionCampaignState({ campaignId: campaign_id, to: 'ASSET_PREP', reason: 'Admin force release escrow', actorType: 'admin' });`
  }
];

replacements.forEach(r => {
  code = code.replace(r.regex, r.replace);
});

fs.writeFileSync('server.ts', code);
console.log('Other updates patched.');
