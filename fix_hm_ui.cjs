const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const target = `const data = await res.json();
        setAiCheckResult({ campaignId: campaign.id, ...data });
        addToast('AI Pre-Check Complete', \`Ad score: \${data.score}/100. Read suggestions below.\`, 'success');
      } else {`;
      
const replacement = `const data = await res.json();
        setAiCheckResult({ campaignId: campaign.id, ...(data.ai_evaluation || data) });
        addToast('AI Pre-Check Complete', \`Ad score: \${(data.ai_evaluation || data).score}/10. Read suggestions below.\`, 'success');
        fetchCampaigns(); // Refresh to show A/B test media updates if Gap 10 triggered
      } else {`;
      
code = code.replace(target, replacement);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed HostMarketing.tsx UI state payload mapping.');
