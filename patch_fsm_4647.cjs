const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = \$1,\s*admin_feedback = \$2,\s*rejected_fields = \$3,\s*policy_cleared = \$4,\s*policy_cleared_at = \$5\s*WHERE id = \$6\s*\`, \[\s*updatedStatus,\s*adminFeedbackText,\s*JSON\.stringify\(failedChecksObj\),\s*isPolicyCleared,\s*isPolicyCleared \? new Date\(\) : null,\s*id\s*\]\);/g,
  `if (updatedStatus !== campaign.status) {
      await transitionCampaignState({ campaignId: Number(id), to: updatedStatus as any, reason: 'AI Gatekeeper pre-check result' });
    }
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET admin_feedback = $1,
          rejected_fields = $2,
          policy_cleared = $3,
          policy_cleared_at = $4
      WHERE id = $5
    \`, [
      adminFeedbackText, 
      JSON.stringify(failedChecksObj), 
      isPolicyCleared,
      isPolicyCleared ? new Date() : null,
      id
    ]);`
);
fs.writeFileSync('server.ts', code);
console.log('Fixed 4647');
