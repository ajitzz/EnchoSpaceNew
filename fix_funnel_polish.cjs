const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetFunnel = `                          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                            {[
                              { label: '1. Ad Impressions', val: selectedCampaignForAnalytics.analytics?.impressions || 15000, desc: 'Metropolitan Feeder Target Reach' },
                              { label: '2. Page Link Clicks', val: selectedCampaignForAnalytics.analytics?.clicks || 650, desc: '100% Active Property Visits' },
                              { label: '3. CRM Lead Enquiries', val: campaignLeads?.leads?.length || 12, desc: \`\${Math.round(((campaignLeads?.leads?.length || 12) / (selectedCampaignForAnalytics.analytics?.clicks || 650)) * 100)}% Conversion\` },
                              { label: '4. Direct Bookings', val: selectedCampaignForAnalytics.analytics?.conversions || 2, desc: 'High-Yield Closed Nights' },
                            ].map((step, idx) => (
                              <div key={idx} className="bg-white border rounded-2xl p-2.5 flex flex-col justify-between relative shadow-sm">
                                <span className="text-[8px] font-bold text-zinc-400 uppercase block leading-none mb-1">{step.label}</span>
                                <span className="text-base font-black text-gray-900 font-mono block py-1">{step.val.toLocaleString()}</span>
                                <p className="text-[8px] text-zinc-500 font-light leading-snug">{step.desc}</p>
                                {idx < 3 && (
                                  <div className="hidden sm:block absolute top-1/2 -right-1.5 -translate-y-1/2 bg-zinc-200 text-zinc-400 rounded-full p-0.5 z-10">
                                    ➔
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>`;

const replaceFunnel = `                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-[10px]">
                            {[
                              { label: '1. Ad Impressions', val: selectedCampaignForAnalytics.analytics?.impressions || 15000, desc: 'Metropolitan Reach', color: 'from-blue-500 to-indigo-500' },
                              { label: '2. Page Link Clicks', val: selectedCampaignForAnalytics.analytics?.clicks || 650, desc: 'Active Property Visits', color: 'from-indigo-500 to-violet-500' },
                              { label: '3. CRM Leads', val: campaignLeads?.leads?.length || 12, desc: \`\${Math.round(((campaignLeads?.leads?.length || 12) / (selectedCampaignForAnalytics.analytics?.clicks || 650)) * 100)}% Conversion\`, color: 'from-violet-500 to-fuchsia-500' },
                              { label: '4. Direct Bookings', val: selectedCampaignForAnalytics.analytics?.conversions || 2, desc: 'Closed Nights', color: 'from-emerald-400 to-emerald-600' },
                            ].map((step, idx) => (
                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.15, duration: 0.5, ease: "easeOut" }}
                                key={idx} 
                                className="bg-white border border-zinc-200/80 rounded-2xl p-3 flex flex-col justify-between relative shadow-sm hover:shadow-md transition-shadow group overflow-hidden"
                              >
                                <div className={\`absolute top-0 left-0 w-full h-1 bg-gradient-to-r \${step.color} opacity-80 group-hover:opacity-100 transition-opacity\`} />
                                <span className="text-[9px] font-black text-zinc-400 uppercase block leading-tight mb-2 mt-1">{step.label}</span>
                                <span className="text-2xl font-black text-gray-900 font-mono block py-1">{step.val.toLocaleString()}</span>
                                <p className="text-[9px] text-zinc-500 font-medium leading-snug">{step.desc}</p>
                                {idx < 3 && (
                                  <div className="hidden sm:flex absolute top-1/2 -right-3 -translate-y-1/2 bg-white border border-zinc-200 text-zinc-400 rounded-full w-6 h-6 items-center justify-center z-10 shadow-sm">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>`;

if(code.includes(targetFunnel)) {
    code = code.replace(targetFunnel, replaceFunnel);
    console.log('Funnel UI successfully polished!');
} else {
    console.log('Target Funnel block not found.');
}

fs.writeFileSync('components/HostMarketing.tsx', code);
