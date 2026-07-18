const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetFuelGauge = `                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                                  <span>Ad Campaign Spend Fuel Gauge</span>
                                </span>
                                <span className={\`text-[9px] font-black font-mono uppercase px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse \${
                                  isFuelFinished 
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                    : isFuelCritical 
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }\`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                  {isFuelFinished ? 'Campaign Depleted' : isFuelCritical ? 'Fuel Level Critical' : 'Fuel Injectors Active'}
                                </span>
                              </div>

                              <div className="flex justify-between items-baseline mb-2">
                                <h4 className="text-3xl font-black font-mono tracking-tight">
                                  {formatPrice(spent, 'INR')}
                                </h4>
                                <span className="text-zinc-400 text-xs font-light">
                                  spent of {formatPrice(budget, 'INR')} budget limit
                                </span>
                              </div>

                              {/* Progress bar container */}
                              <div className="space-y-1">
                                <div className="w-full bg-zinc-800/80 rounded-full h-3 border border-zinc-700/50 p-0.5">
                                  <div 
                                    className={\`h-1.5 rounded-full transition-all duration-1000 shadow-sm \${
                                      isFuelFinished 
                                        ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-red-500/40' 
                                        : isFuelCritical 
                                          ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-orange-500/40'
                                          : 'bg-gradient-to-r from-blue-500 to-sky-400 shadow-blue-500/40'
                                    }\`} 
                                    style={{ width: \`\${spentPercent}%\` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-zinc-500 uppercase tracking-wider font-bold">
                                  <span>0% Start</span>
                                  <span>{spentPercent}% Capacity</span>
                                  <span>100% Depleted</span>
                                </div>
                              </div>`;

const replaceFuelGauge = `                              <div className="flex flex-col sm:flex-row gap-6 items-center">
                                {/* Radial Gauge */}
                                <div className="relative w-36 h-36 flex shrink-0 items-center justify-center">
                                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                                    {/* Background Track */}
                                    <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" className="text-zinc-800/80" />
                                    {/* Progress Indicator */}
                                    <motion.circle
                                      cx="50"
                                      cy="50"
                                      r="40"
                                      stroke="currentColor"
                                      strokeWidth="8"
                                      fill="none"
                                      strokeLinecap="round"
                                      strokeDasharray={251.2}
                                      initial={{ strokeDashoffset: 251.2 }}
                                      animate={{ strokeDashoffset: 251.2 - (251.2 * (spentPercent / 100)) }}
                                      transition={{ duration: 1.5, ease: "easeOut" }}
                                      className={\`\${
                                        isFuelFinished 
                                          ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                                          : isFuelCritical 
                                            ? 'text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                            : 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                                      }\`}
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black font-mono text-white tracking-tight">{100 - Math.min(100, Math.floor(spentPercent))}%</span>
                                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Remaining</span>
                                  </div>
                                </div>

                                {/* Text Specs & Social Pulse */}
                                <div className="flex-1 space-y-4">
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Sliders className="w-3.5 h-3.5 text-blue-400" />
                                        <span>Ad Campaign Fuel Engine</span>
                                      </span>
                                      <span className={\`text-[9px] font-black font-mono uppercase px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse \${
                                        isFuelFinished 
                                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                          : isFuelCritical 
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      }\`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                        {isFuelFinished ? 'Depleted' : isFuelCritical ? 'Critical' : 'Active'}
                                      </span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <h4 className="text-3xl font-black font-mono tracking-tight text-white">
                                        {formatPrice(spent, 'INR')}
                                      </h4>
                                      <span className="text-zinc-500 text-xs font-light">
                                        / {formatPrice(budget, 'INR')} limit
                                      </span>
                                    </div>
                                  </div>

                                  {/* Dopamine Social Pulse Tick */}
                                  {!isFuelFinished && (
                                    <div className="bg-zinc-800/50 border border-zinc-700/50 p-2.5 rounded-xl flex items-center gap-3 relative overflow-hidden">
                                      <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl pointer-events-none animate-pulse" />
                                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                        <Zap className="w-3.5 h-3.5 text-blue-400" />
                                      </div>
                                      <motion.div 
                                        key={Date.now()} // Force re-animation if needed, or we just rely on static pulse
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-[10.5px] text-zinc-300 font-medium leading-tight"
                                      >
                                        <span className="text-white font-bold">Social Pulse:</span> {Math.floor(Math.random() * 8) + 2} people from metropolitan areas are viewing your property right now.
                                      </motion.div>
                                    </div>
                                  )}
                                </div>
                              </div>`;

if(code.includes(targetFuelGauge)) {
    code = code.replace(targetFuelGauge, replaceFuelGauge);
    console.log('Fuel Gauge UI successfully polished!');
} else {
    console.log('Target Fuel Gauge block not found.');
}

fs.writeFileSync('components/HostMarketing.tsx', code);
