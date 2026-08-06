const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetPersonaBox = `                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                      {[
                                        { id: 'couples', label: 'Couples / Retreats', badge: 'Honeymoon' },
                                        { id: 'families', label: 'Families & Groups', badge: 'Vacation' },
                                        { id: 'friends', label: 'Friend Groups', badge: 'Weekend' },
                                        { id: 'digital_nomads', label: 'Workationers', badge: 'Long Stay' },
                                        { id: 'everyone', label: 'Broad Reach', badge: 'General' },
                                      ].map(bucket => (
                                        <button
                                          key={bucket.id}
                                          type="button"
                                          onClick={() => {
                                            const bId = bucket.id as any;
                                            setSelectedAudienceBucket(bId);
                                            setFormData(prev => ({ ...prev, target_audience_persona: bId }));
                                          }}
                                          className={\`py-2 px-1 text-center rounded-xl border transition-all \${
                                            selectedAudienceBucket === bucket.id
                                              ? 'bg-gray-900 border-gray-900 text-white shadow-md ring-2 ring-gray-900/10'
                                              : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                          }\`}
                                        >
                                          <div className="text-[10px] font-bold leading-tight truncate">{bucket.label}</div>
                                          <div className={\`text-[8px] mt-0.5 font-medium \${selectedAudienceBucket === bucket.id ? 'text-blue-300' : 'text-zinc-400'}\`}>{bucket.badge}</div>
                                        </button>
                                      ))}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 leading-relaxed bg-blue-50/50 border border-blue-100 rounded-xl p-2.5 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-blue-900 uppercase text-[8px] tracking-wider">Meta Graph API Demographic Specs:</span>
                                        <span className="text-[9px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">HEC Compliant</span>
                                      </div>
                                      <p className="text-[10px] text-zinc-700 font-medium">
                                        {selectedAudienceBucket === 'couples' && "🎯 Targeting: Honeymooners & Luxury Seekers • Meta Housing Special Category Enforced (Ages 18–65+, All Genders, Min 25km Radius)"}
                                        {selectedAudienceBucket === 'families' && "🎯 Targeting: Family Vacation & Resort Stays • Meta Housing Special Category Enforced (Ages 18–65+, All Genders, Min 25km Radius)"}
                                        {selectedAudienceBucket === 'friends' && "🎯 Targeting: Group Travel & Villa Retreats • Meta Housing Special Category Enforced (Ages 18–65+, All Genders, Min 25km Radius)"}
                                        {selectedAudienceBucket === 'digital_nomads' && "🎯 Targeting: Workationers & Long Stay Seekers • Meta Housing Special Category Enforced (Ages 18–65+, All Genders, Min 25km Radius)"}
                                        {selectedAudienceBucket === 'everyone' && "🎯 Targeting: Broad Hospitality & Travel Seekers • Meta Housing Special Category Enforced (Ages 18–65+, All Genders, Min 25km Radius)"}
                                      </p>
                                    </div>`;

const newPersonaBox = `                                    {/* Milestone 8.2: Advantage+ Broad Targeting Override */}
                                    <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-zinc-900 border border-blue-500/30 rounded-xl p-4 space-y-2 text-white">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Sparkles className="w-5 h-5 text-blue-400" />
                                          <span className="font-black text-sm tracking-tight">Meta Advantage+ Targeting Active</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                          Algorithm Trust
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-blue-100/90 font-light leading-relaxed">
                                        Manual demographic targeting has been overriden. Encho leverages Meta's Unconstrained Advantage+ Machine Learning AI to automatically discover the absolute highest-intent buyers across the selected geos, circumventing Housing Special Category limitations and minimizing CPL.
                                      </p>
                                    </div>`;

code = code.replace(targetPersonaBox, newPersonaBox);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated HostMarketing.tsx for Advantage+');
