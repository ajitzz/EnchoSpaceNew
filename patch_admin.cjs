const fs = require('fs');
let code = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');

const adminUIPatch = `
{c.ai_copilot_data && c.ai_copilot_data.overallScore && (
  <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-indigo-900">AI Pre-Flight Risk Report</span>
      <span className={\`text-lg font-bold \${c.ai_copilot_data.overallScore >= 90 ? 'text-emerald-600' : 'text-amber-500'}\`}>
        Score: {c.ai_copilot_data.overallScore}/100
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
      <div><span className="text-gray-500">Predicted Approval:</span> <span className="font-medium">{c.ai_copilot_data.expectedApprovalConfidence}%</span></div>
      <div><span className="text-gray-500">Copy Quality:</span> <span className="font-medium">{c.ai_copilot_data.breakdown.copy}/100</span></div>
      <div><span className="text-gray-500">Meta Compliance:</span> <span className="font-medium">{c.ai_copilot_data.breakdown.metaCompliance}/100</span></div>
      <div><span className="text-gray-500">Targeting Precision:</span> <span className="font-medium">{c.ai_copilot_data.breakdown.targeting}/100</span></div>
    </div>
    {c.ai_copilot_data.issues?.length > 0 && (
      <div className="mt-2 pt-2 border-t border-indigo-200">
        <span className="text-xs font-semibold text-rose-700">Flagged Issues ({c.ai_copilot_data.issues.length})</span>
      </div>
    )}
  </div>
)}
`;

if (!code.includes('AI Pre-Flight Risk Report')) {
  // We need to find where the campaign card is rendered. Let's look for "campaign.title" or similar
  code = code.replace('{c.title}', '{c.title}' + adminUIPatch);
  fs.writeFileSync('components/AdminDashboard.tsx', code);
  console.log("Patched AdminDashboard.tsx");
} else {
  console.log("Already patched.");
}
