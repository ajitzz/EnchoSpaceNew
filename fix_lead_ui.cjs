const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetLeadHeader = `                                    <div className="flex items-start justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-800 flex items-center justify-center font-black text-xs">
                                          {lead.name.split(' ').map((n: string) => n[0]).join('')}
                                        </div>
                                        <div>
                                          <div className="font-bold text-zinc-900 text-xs flex items-center gap-1.5">
                                            <span>{lead.name}</span>
                                            <span className={\`w-2 h-2 rounded-full \${lead.status === 'New Lead' ? 'bg-blue-500 animate-pulse' : 'bg-zinc-400'}\`} />
                                            {lead.intent_score && (
                                              <span className={\`text-[8px] px-1.5 py-0.5 rounded-sm font-black border uppercase \${
                                                lead.intent_score.includes('HOT') ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-orange-100/50' :
                                                lead.intent_score.includes('WARM') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                lead.intent_score.includes('CONVERTED') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                              }\`}>
                                                {lead.intent_score}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-zinc-400 font-light font-mono">
                                            {lead.phone} • {lead.email}
                                          </div>
                                        </div>
                                      </div>`;

const newLeadHeader = `                                    <div className="flex items-start justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-800 flex items-center justify-center font-black text-xs">
                                          {lead.name.split(' ').map((n: string) => n[0]).join('')}
                                        </div>
                                        <div>
                                          <div className="font-bold text-zinc-900 text-xs flex items-center gap-1.5">
                                            <span>{lead.name}</span>
                                            <span className={\`w-2 h-2 rounded-full \${lead.status === 'New Lead' ? 'bg-blue-500 animate-pulse' : 'bg-zinc-400'}\`} />
                                            {lead.intent_score && (
                                              <span className={\`text-[8px] px-1.5 py-0.5 rounded-sm font-black border uppercase \${
                                                lead.intent_score.includes('HOT') ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-orange-100/50' :
                                                lead.intent_score.includes('WARM') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                lead.intent_score.includes('CONVERTED') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                              }\`}>
                                                {lead.intent_score}
                                              </span>
                                            )}
                                            <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-sm font-black border uppercase">Native Meta Lead</span>
                                          </div>
                                          <div className="text-[10px] text-red-600/80 font-black font-mono tracking-widest mt-0.5 bg-red-50/50 inline-block px-1 rounded border border-red-100">
                                            <ShieldAlert className="w-2.5 h-2.5 inline mr-1 mb-0.5"/>
                                            CONTACT DETAILS REDACTED BY ENCHO CRM
                                          </div>
                                        </div>
                                      </div>`;

code = code.replace(targetLeadHeader, newLeadHeader);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated Lead UI');
