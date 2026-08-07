const fs = require('fs');

const code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const rewriteSearch = `{copilotData.aiRewrite && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 text-indigo-900 flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> AI Rewrite Engine</h3>
              <p className="text-xs text-indigo-700 mb-3">{copilotData.aiRewrite.explanation}</p>
              <div className="space-y-3">
               {copilotData.aiRewrite.headline && (
                 <div className="flex items-start justify-between gap-2">
                   <div className="text-xs font-medium text-slate-700 w-3/4">"{copilotData.aiRewrite.headline}"</div>
                   <button onClick={() => applyFix('title', copilotData.aiRewrite.headline)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Apply</button>
                 </div>
               )}
               {copilotData.aiRewrite.primaryText && (
                 <div className="flex items-start justify-between gap-2">
                   <div className="text-xs text-slate-700 w-3/4 line-clamp-2">{copilotData.aiRewrite.primaryText}</div>
                   <button onClick={() => applyFix('description', copilotData.aiRewrite.primaryText)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Apply</button>
                 </div>
               )}
              </div>
            </div>
          )}`;

const rewriteReplace = `{copilotData.aiRewrite && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 text-indigo-900 flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> AI Rewrite Engine</h3>
              <p className="text-xs text-indigo-700 mb-3">{copilotData.aiRewrite.explanation}</p>
              <div className="space-y-3">
               {copilotData.aiRewrite.headline && (
                 <div className="flex items-start justify-between gap-2">
                   <div className="text-xs font-medium text-slate-700 w-3/4">"{copilotData.aiRewrite.headline}"</div>
                   <button onClick={() => applyFix('title', copilotData.aiRewrite.headline)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Apply</button>
                 </div>
               )}
               {copilotData.aiRewrite.primaryText && (
                 <div className="flex items-start justify-between gap-2">
                   <div className="text-xs text-slate-700 w-3/4 line-clamp-2">{copilotData.aiRewrite.primaryText}</div>
                   <button onClick={() => applyFix('description', copilotData.aiRewrite.primaryText)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Apply</button>
                 </div>
               )}
               {copilotData.aiRewrite.cta && (
                 <div className="flex items-start justify-between gap-2 mt-2">
                   <div className="text-xs text-slate-700 w-3/4 line-clamp-1"><span className="font-semibold">CTA:</span> {copilotData.aiRewrite.cta}</div>
                   <button onClick={() => applyFix('cta_type', copilotData.aiRewrite.cta)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Apply</button>
                 </div>
               )}
               <button onClick={() => {
                   if (copilotData.aiRewrite.headline) applyFix('title', copilotData.aiRewrite.headline);
                   if (copilotData.aiRewrite.primaryText) applyFix('description', copilotData.aiRewrite.primaryText);
                   if (copilotData.aiRewrite.cta) applyFix('cta_type', copilotData.aiRewrite.cta);
                   if (copilotData.aiRewrite.budget) applyFix('budget', copilotData.aiRewrite.budget);
               }} className="w-full mt-2 bg-indigo-900 text-white py-1.5 rounded-md text-xs font-bold hover:bg-indigo-800 transition shadow-sm">
                 ⚡ One-Click Apply All
               </button>
              </div>
            </div>
          )}`;

const audSearch = `{copilotData.audienceEngineering && (
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 text-slate-800">Audience Engineering</h3>
              <div className="text-xs text-slate-600 space-y-1">
                <p><span className="font-medium text-slate-900">Est. Size:</span> {copilotData.audienceEngineering.estimatedSize}</p>
                <p><span className="font-medium text-slate-900">Est. CPM:</span> {copilotData.audienceEngineering.expectedCPM}</p>
                <p className="pt-2 text-indigo-600">{copilotData.audienceEngineering.recommendation}</p>
              </div>
            </div>
          )}`;

const audReplace = `{copilotData.audienceEngineering && (
            <div className="bg-white border rounded-xl p-4 relative group">
              <h3 className="font-semibold text-sm mb-2 text-slate-800">Audience Engineering</h3>
              <div className="text-xs text-slate-600 space-y-1">
                <p><span className="font-medium text-slate-900">Est. Size:</span> {copilotData.audienceEngineering.estimatedSize}</p>
                <p><span className="font-medium text-slate-900">Est. CPM:</span> {copilotData.audienceEngineering.expectedCPM}</p>
                <p className="pt-2 text-indigo-600">{copilotData.audienceEngineering.recommendation}</p>
              </div>
              {copilotData.aiRewrite?.audience && (
                <button onClick={() => applyFix('target_audience_persona', copilotData.aiRewrite.audience)} className="mt-3 w-full text-xs bg-slate-900 text-white px-2 py-1.5 rounded hover:bg-slate-800">
                  Apply Audience Fix
                </button>
              )}
            </div>
          )}`;

const budSearch = `{copilotData.budgetEngineering && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 text-emerald-900">Budget Engineering</h3>
              <div className="text-xs text-emerald-800 space-y-1 grid grid-cols-2 gap-2">
                <div><span className="block text-emerald-600/70">Rec. Daily</span> <span className="font-semibold">\${copilotData.budgetEngineering.recommendedDailyBudget}</span></div>
                <div><span className="block text-emerald-600/70">Est. Leads</span> <span className="font-semibold">{copilotData.budgetEngineering.expectedLeads}</span></div>
                <div><span className="block text-emerald-600/70">Est. CPL</span> <span className="font-semibold">{copilotData.budgetEngineering.expectedCPL}</span></div>
                <div><span className="block text-emerald-600/70">Learning</span> <span className="font-semibold">{copilotData.budgetEngineering.learningDays} days</span></div>
              </div>
            </div>
          )}`;

const budReplace = `{copilotData.budgetEngineering && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-sm text-emerald-900">Budget Engineering</h3>
                {copilotData.budgetEngineering.budgetQualityScore && (
                  <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">Score: {copilotData.budgetEngineering.budgetQualityScore}</span>
                )}
              </div>
              <div className="text-xs text-emerald-800 space-y-1 grid grid-cols-2 gap-2">
                <div><span className="block text-emerald-600/70">Rec. Daily</span> <span className="font-semibold">\${copilotData.budgetEngineering.recommendedDailyBudget}</span></div>
                <div><span className="block text-emerald-600/70">Est. Leads</span> <span className="font-semibold">{copilotData.budgetEngineering.expectedLeads}</span></div>
                <div><span className="block text-emerald-600/70">Est. CPL</span> <span className="font-semibold">{copilotData.budgetEngineering.expectedCPL}</span></div>
                <div><span className="block text-emerald-600/70">Learning</span> <span className="font-semibold">{copilotData.budgetEngineering.learningDays} days</span></div>
              </div>
              <button onClick={() => applyFix('budget', copilotData.budgetEngineering.recommendedDailyBudget * 100)} className="mt-3 w-full text-xs bg-emerald-600 text-white px-2 py-1.5 rounded hover:bg-emerald-700 shadow-sm">
                Apply Recommended Budget
              </button>
            </div>
          )}`;

let newCode = code.replace(rewriteSearch, rewriteReplace).replace(audSearch, audReplace).replace(budSearch, budReplace);
fs.writeFileSync('components/HostMarketing.tsx', newCode);
console.log("Updated HostMarketing frontend successfully");
