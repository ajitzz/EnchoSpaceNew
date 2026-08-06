const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetDossierUI = `                                  {aiCopyDossier.property_analysis.key_selling_points.map((point: string, idx: number) => (
                                    <span key={idx} className="text-[9.5px] font-medium bg-white/10 border border-white/15 px-2 py-0.5 rounded-lg text-blue-50">
                                      ✓ {point}
                                    </span>
                                  ))}
                                </div>
                              )}`;

const newDossierUI = `                                  {aiCopyDossier.property_analysis.key_selling_points.map((point: string, idx: number) => (
                                    <span key={idx} className="text-[9.5px] font-medium bg-white/10 border border-white/15 px-2 py-0.5 rounded-lg text-blue-50">
                                      ✓ {point}
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              {/* Milestone 9.1: Policy Evasion Engine Display */}
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

code = code.replace(targetDossierUI, newDossierUI);
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated HostMarketing.tsx UI for Policy Evasion');
