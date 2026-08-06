const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetDuplicate = `                              {/* Milestone 9.1: Policy Evasion Engine Display */}
                              {aiCopyDossier.property_analysis.policy_evasion_engine && (
                                <div className="mt-2 border-t border-blue-500/30 pt-2 flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Meta HEC Evasion Engine Active</span>
                                  </div>
                                  <p className="text-[9.5px] text-blue-100/70 font-mono">
                                    {aiCopyDossier.property_analysis.policy_evasion_engine.evasion_strategy}
                                  </p>
                                  {aiCopyDossier.property_analysis.policy_evasion_engine.sanitized_terms?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      <span className="text-[8.5px] text-red-300 font-bold uppercase mr-1">Sanitized Terms:</span>
                                      {aiCopyDossier.property_analysis.policy_evasion_engine.sanitized_terms.map((term: string, i: number) => (
                                        <span key={i} className="text-[8.5px] font-mono bg-red-950/50 border border-red-500/20 text-red-200 px-1.5 py-0.5 rounded-md line-through opacity-70">
                                          {term}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}`;

const newUI = `                              {/* Milestone 9.2: Dynamic Creative API Payload Structure (FAANG-Standard DCO Engine) */}
                              <div className="mt-2 border-t border-blue-500/30 pt-2 flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">FAANG DCO Engine Active</span>
                                </div>
                                <p className="text-[9.5px] text-blue-100/70 font-mono">
                                  Multi-variant payload architecture loaded. Encho will automatically cycle elements to optimize ROAS.
                                </p>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  <span className="text-[8.5px] font-mono bg-blue-950/50 border border-blue-500/20 text-blue-200 px-1.5 py-0.5 rounded-md">
                                    3x Image Formats (1:1, 9:16, 16:9)
                                  </span>
                                  <span className="text-[8.5px] font-mono bg-blue-950/50 border border-blue-500/20 text-blue-200 px-1.5 py-0.5 rounded-md">
                                    2x AI Copy Variations
                                  </span>
                                  <span className="text-[8.5px] font-mono bg-blue-950/50 border border-blue-500/20 text-blue-200 px-1.5 py-0.5 rounded-md">
                                    3x CTAs (Book, Learn, Sign Up)
                                  </span>
                                </div>
                              </div>`;

code = code.replace(targetDuplicate, newUI);
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated HostMarketing.tsx UI for DCO Engine');
