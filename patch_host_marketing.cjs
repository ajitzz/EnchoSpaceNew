const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const copilotUIReplace = "{\/* AI CAMPAIGN COPILOT SIDEBAR *\/}\n" +
"{showCreateModal && (\n" +
"  <div className=\"fixed right-0 top-0 bottom-0 w-[450px] bg-slate-50 border-l border-slate-200 shadow-2xl z-[100] p-6 overflow-y-auto flex flex-col\">\n" +
"    <div className=\"flex items-center space-x-2 mb-4 text-indigo-600\">\n" +
"      <Sparkles className=\"w-6 h-6\" />\n" +
"      <h2 className=\"text-xl font-bold\">Meta Campaign Engineer</h2>\n" +
"    </div>\n" +
"    \n" +
"    {isCopilotLoading ? (\n" +
"      <div className=\"flex flex-col items-center justify-center flex-1 space-y-4 text-slate-500\">\n" +
"        <Loader2 className=\"w-8 h-8 animate-spin\" />\n" +
"        <p>Analyzing Meta Policies & Performance...</p>\n" +
"      </div>\n" +
"    ) : copilotData ? (\n" +
"      <div className=\"space-y-6\">\n" +
"        \n" +
"        {\/* Core Health Score *\/}\n" +
"        <div className=\"bg-white p-5 rounded-xl border shadow-sm\">\n" +
"          <div className=\"flex justify-between items-end mb-2\">\n" +
"            <span className=\"text-sm font-medium text-slate-600\">ENCHO Campaign Health</span>\n" +
"            <span className={`text-3xl font-black ${copilotData.overallScore >= 90 ? 'text-emerald-600' : copilotData.overallScore >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>\n" +
"              {copilotData.overallScore}\n" +
"            </span>\n" +
"          </div>\n" +
"          <div className=\"w-full bg-slate-100 rounded-full h-2 mb-4\">\n" +
"            <div className={`h-2 rounded-full ${copilotData.overallScore >= 90 ? 'bg-emerald-500' : copilotData.overallScore >= 75 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${copilotData.overallScore}%` }} />\n" +
"          </div>\n" +
"          \n" +
"          <div className=\"grid grid-cols-2 gap-3 text-sm\">\n" +
"             <div><span className=\"text-slate-500\">Copy</span> <span className=\"font-semibold float-right\">{copilotData.breakdown.copy}/100</span></div>\n" +
"             <div><span className=\"text-slate-500\">Media</span> <span className=\"font-semibold float-right\">{copilotData.breakdown.media}/100</span></div>\n" +
"             <div><span className=\"text-slate-500\">Compliance</span> <span className=\"font-semibold float-right\">{copilotData.breakdown.metaCompliance}/100</span></div>\n" +
"             <div><span className=\"text-slate-500\">Targeting</span> <span className=\"font-semibold float-right\">{copilotData.breakdown.targeting}/100</span></div>\n" +
"          </div>\n" +
"        </div>\n" +
"\n" +
"        {\/* Confidence Engine *\/}\n" +
"        <div className=\"bg-slate-900 text-white p-4 rounded-xl shadow-inner\">\n" +
"          <h3 className=\"text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold\">Confidence Engine</h3>\n" +
"          <div className=\"grid grid-cols-2 gap-y-3 gap-x-4 text-sm\">\n" +
"            <div>\n" +
"              <div className=\"text-slate-400 text-xs\">Meta Approval</div>\n" +
"              <div className=\"font-medium text-emerald-400\">{copilotData.confidenceEngine?.approval || copilotData.expectedApprovalConfidence}%</div>\n" +
"            </div>\n" +
"            <div>\n" +
"              <div className=\"text-slate-400 text-xs\">Expected CTR</div>\n" +
"              <div className=\"font-medium text-blue-400\">{copilotData.predictedCTR}</div>\n" +
"            </div>\n" +
"            <div>\n" +
"              <div className=\"text-slate-400 text-xs\">Lead Quality</div>\n" +
"              <div className=\"font-medium text-purple-400\">{copilotData.confidenceEngine?.leadQuality || 85}%</div>\n" +
"            </div>\n" +
"            <div>\n" +
"              <div className=\"text-slate-400 text-xs\">Expected CPC</div>\n" +
"              <div className=\"font-medium text-amber-400\">{copilotData.predictedCPC}</div>\n" +
"            </div>\n" +
"          </div>\n" +
"        </div>\n" +
"\n" +
"        {\/* AI Rewrite Engine *\/}\n" +
"        {copilotData.aiRewrite && (\n" +
"          <div className=\"bg-indigo-50 border border-indigo-100 rounded-xl p-4\">\n" +
"             <div className=\"flex items-center space-x-2 mb-3\">\n" +
"               <Wand2 className=\"w-4 h-4 text-indigo-600\" />\n" +
"               <h3 className=\"font-semibold text-indigo-900 text-sm\">AI Rewrite Engine</h3>\n" +
"             </div>\n" +
"             <p className=\"text-xs text-indigo-700 mb-3\">{copilotData.aiRewrite.explanation}</p>\n" +
"             <div className=\"space-y-2\">\n" +
"               {copilotData.aiRewrite.headline && (\n" +
"                 <div className=\"flex justify-between items-start\">\n" +
"                   <div className=\"text-xs font-medium text-slate-700 w-3/4\">\"{copilotData.aiRewrite.headline}\"</div>\n" +
"                   <button onClick={() => applyFix('title', copilotData.aiRewrite.headline)} className=\"text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700\">Apply</button>\n" +
"                 </div>\n" +
"               )}\n" +
"               {copilotData.aiRewrite.primaryText && (\n" +
"                 <div className=\"flex justify-between items-start pt-2 border-t border-indigo-200\">\n" +
"                   <div className=\"text-xs text-slate-700 w-3/4 line-clamp-2\">{copilotData.aiRewrite.primaryText}</div>\n" +
"                   <button onClick={() => applyFix('description', copilotData.aiRewrite.primaryText)} className=\"text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700\">Apply</button>\n" +
"                 </div>\n" +
"               )}\n" +
"             </div>\n" +
"          </div>\n" +
"        )}\n" +
"\n" +
"        {\/* Audience & Budget Engineering *\/}\n" +
"        <div className=\"grid grid-cols-1 gap-4\">\n" +
"          {copilotData.audienceEngineering && (\n" +
"            <div className=\"bg-white border rounded-xl p-4\">\n" +
"              <h3 className=\"font-semibold text-sm mb-2 text-slate-800\">Audience Engineering</h3>\n" +
"              <div className=\"text-xs text-slate-600 space-y-1\">\n" +
"                <p><span className=\"font-medium text-slate-900\">Est. Size:</span> {copilotData.audienceEngineering.estimatedSize}</p>\n" +
"                <p><span className=\"font-medium text-slate-900\">Est. CPM:</span> {copilotData.audienceEngineering.expectedCPM}</p>\n" +
"                <p className=\"pt-2 text-indigo-600\">{copilotData.audienceEngineering.recommendation}</p>\n" +
"              </div>\n" +
"            </div>\n" +
"          )}\n" +
"          {copilotData.budgetEngineering && (\n" +
"            <div className=\"bg-emerald-50 border border-emerald-100 rounded-xl p-4\">\n" +
"              <h3 className=\"font-semibold text-sm mb-2 text-emerald-900\">Budget Engineering</h3>\n" +
"              <div className=\"text-xs text-emerald-800 space-y-1 grid grid-cols-2 gap-2\">\n" +
"                <div><span className=\"block text-emerald-600/70\">Rec. Daily</span> <span className=\"font-semibold\">${copilotData.budgetEngineering.recommendedDailyBudget}</span></div>\n" +
"                <div><span className=\"block text-emerald-600/70\">Est. Leads</span> <span className=\"font-semibold\">{copilotData.budgetEngineering.expectedLeads}</span></div>\n" +
"                <div><span className=\"block text-emerald-600/70\">Est. CPL</span> <span className=\"font-semibold\">{copilotData.budgetEngineering.expectedCPL}</span></div>\n" +
"                <div><span className=\"block text-emerald-600/70\">Learning</span> <span className=\"font-semibold\">{copilotData.budgetEngineering.learningDays} days</span></div>\n" +
"              </div>\n" +
"            </div>\n" +
"          )}\n" +
"        </div>\n" +
"\n" +
"        {\/* Policy Issues *\/}\n" +
"        {copilotData.issues?.length > 0 && (\n" +
"          <div className=\"space-y-3\">\n" +
"            <h3 className=\"font-semibold text-slate-900 border-b pb-2 text-sm\">Policy & Compliance Violations</h3>\n" +
"            {copilotData.issues.map((issue: any, idx: number) => (\n" +
"              <div key={idx} className=\"bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm space-y-2\">\n" +
"                <div className=\"flex items-start justify-between\">\n" +
"                  <span className=\"font-medium text-rose-900\">{issue.field}</span>\n" +
"                  <span className=\"text-[10px] uppercase px-1.5 py-0.5 rounded bg-rose-200 text-rose-800 font-bold\">{issue.severity}</span>\n" +
"                </div>\n" +
"                <p className=\"text-rose-800 text-xs font-medium\">{issue.message}</p>\n" +
"                <div className=\"bg-white/50 p-2 rounded text-[10px] text-rose-700 space-y-1\">\n" +
"                   <p><span className=\"font-bold\">Policy Ref:</span> {issue.policyReference}</p>\n" +
"                   <p><span className=\"font-bold\">Why:</span> {issue.expectedBenefit}</p>\n" +
"                </div>\n" +
"                {issue.autoFixSuggestion && (\n" +
"                  <button\n" +
"                    onClick={() => applyFix(issue.field, issue.autoFixSuggestion)}\n" +
"                    className=\"w-full mt-2 bg-rose-600 text-white py-1.5 rounded-md text-xs font-medium hover:bg-rose-700 transition shadow-sm\"\n" +
"                  >\n" +
"                    Auto-Fix Issue\n" +
"                  </button>\n" +
"                )}\n" +
"              </div>\n" +
"            ))}\n" +
"          </div>\n" +
"        )}\n" +
"      </div>\n" +
"    ) : (\n" +
"      <div className=\"flex-1 flex items-center justify-center text-slate-400 text-sm text-center\">\n" +
"        Enter campaign details to activate<br/>Meta Campaign Engineer\n" +
"      </div>\n" +
"    )}\n" +
"  </div>\n" +
")}";

const oldSidebarStart = "{/* AI CAMPAIGN COPILOT SIDEBAR */}";
const sidebarIndex = code.indexOf(oldSidebarStart);

if (sidebarIndex > -1) {
  const endString = "  </div>\n)}";
  const finalEnd = code.indexOf(endString, sidebarIndex) + endString.length;
  code = code.slice(0, sidebarIndex) + copilotUIReplace + code.slice(finalEnd);
  fs.writeFileSync('components/HostMarketing.tsx', code);
  console.log("Patched HostMarketing UI");
} else {
  console.log("Could not find old Copilot UI");
}
