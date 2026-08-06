const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetButton = `                                  <>
                                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    <span>AI Copywriter (3 Strategic Angles)</span>
                                  </>`;

const newButton = `                                  <>
                                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    <span>AI AIDA Copywriter (3 Strategic Angles)</span>
                                  </>`;

const targetVariantHeader = `                                      <div className="flex items-center justify-between">
                                        <span className={\`text-[10px] font-black uppercase tracking-wider \${isSelected ? 'text-blue-700' : 'text-zinc-700'}\`}>
                                          {variant.angle_name}
                                        </span>
                                        <span className="text-[9px] font-mono font-bold text-amber-600 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                                          ★ {variant.viral_rating_score || 9.2}
                                        </span>
                                      </div>`;

const newVariantHeader = `                                      <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                          <span className={\`text-[10px] font-black uppercase tracking-wider \${isSelected ? 'text-blue-700' : 'text-zinc-700'}\`}>
                                            {variant.angle_name}
                                          </span>
                                          <span className="text-[8px] font-mono uppercase text-emerald-600 font-bold mt-0.5">AIDA Framework Optimized</span>
                                        </div>
                                        <span className="text-[9px] font-mono font-bold text-amber-600 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                                          ★ {variant.viral_rating_score || 9.2}
                                        </span>
                                      </div>`;

code = code.replace(targetButton, newButton);
code = code.replace(targetVariantHeader, newVariantHeader);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated HostMarketing.tsx for AIDA');
