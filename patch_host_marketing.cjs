const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const copilotState = `
  const [copilotData, setCopilotData] = useState<any>(null);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [copilotDebounceTimeout, setCopilotDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!showCreateModal) return;
    if (copilotDebounceTimeout) clearTimeout(copilotDebounceTimeout);
    
    const timeout = setTimeout(async () => {
      setIsCopilotLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/marketing/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
          body: JSON.stringify({ formData })
        });
        if (res.ok) {
          const data = await res.json();
          setCopilotData(data);
        }
      } catch (err) {
        console.error('Copilot error:', err);
      } finally {
        setIsCopilotLoading(false);
      }
    }, 1500); // 1.5s debounce
    
    setCopilotDebounceTimeout(timeout);
    
    return () => clearTimeout(timeout);
  }, [formData, showCreateModal]);

  const applyFix = (field: string, suggestion: string) => {
    setFormData(prev => ({ ...prev, [field]: suggestion }));
    addToast(\`Applied AI fix to \${field}\`, 'success');
  };
`;

const copilotUI = `
{/* AI CAMPAIGN COPILOT SIDEBAR */}
{showCreateModal && (
  <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-50 border-l border-gray-200 shadow-2xl z-[100] p-6 overflow-y-auto flex flex-col">
    <div className="flex items-center space-x-2 mb-6 text-indigo-600">
      <Sparkles className="w-6 h-6" />
      <h2 className="text-xl font-bold">AI Campaign Copilot</h2>
    </div>
    
    {isCopilotLoading ? (
      <div className="flex flex-col items-center justify-center flex-1 space-y-4 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Analyzing campaign...</p>
      </div>
    ) : copilotData ? (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex justify-between items-end mb-2">
            <span className="text-sm font-medium text-gray-500">Campaign Score</span>
            <span className={\`text-2xl font-bold \${copilotData.overallScore >= 90 ? 'text-emerald-600' : copilotData.overallScore >= 75 ? 'text-amber-500' : 'text-rose-500'}\`}>
              {copilotData.overallScore}/100
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={\`h-2 rounded-full \${copilotData.overallScore >= 90 ? 'bg-emerald-500' : copilotData.overallScore >= 75 ? 'bg-amber-400' : 'bg-rose-500'}\`} style={{ width: \`\${copilotData.overallScore}%\` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(copilotData.breakdown).map(([key, val]: any) => (
            <div key={key} className="bg-white p-2 rounded border flex flex-col">
              <span className="text-gray-500 capitalize text-xs">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="font-semibold">{val}/100</span>
            </div>
          ))}
        </div>

        {copilotData.issues?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Issues & Suggestions</h3>
            {copilotData.issues.map((issue: any, idx: number) => (
              <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-2">
                <div className="flex items-start justify-between">
                  <span className="font-medium text-amber-900">{issue.field}</span>
                  <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">{issue.severity}</span>
                </div>
                <p className="text-amber-800 text-xs">{issue.message}</p>
                {issue.autoFixSuggestion && (
                  <button
                    onClick={() => applyFix(issue.field, issue.autoFixSuggestion)}
                    className="w-full mt-2 bg-amber-600 text-white py-1.5 rounded-md text-xs font-medium hover:bg-amber-700 transition"
                  >
                    Apply Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
           <h4 className="font-semibold text-blue-900 text-sm mb-1">Expected Approval Confidence</h4>
           <div className="text-2xl font-bold text-blue-700">{copilotData.expectedApprovalConfidence}%</div>
           <p className="text-xs text-blue-600 mt-2">Predicted Reach: {copilotData.predictedReach}</p>
           <p className="text-xs text-blue-600">Predicted CTR: {copilotData.predictedCTR}</p>
        </div>
      </div>
    ) : null}
  </div>
)}
`;

if (!code.includes('AI CAMPAIGN COPILOT SIDEBAR')) {
  // Inject state
  code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, "const [loading, setLoading] = useState(true);\n" + copilotState);
  
  // Inject UI at the very end of the return statement
  // We need to find the final closing tag or put it before it.
  code = code.replace(/<\/div>\s*$/m, copilotUI + "\n</div>");
  
  fs.writeFileSync('components/HostMarketing.tsx', code);
  console.log("Patched HostMarketing.tsx with Copilot.");
} else {
  console.log("Already patched HostMarketing.tsx.");
}
