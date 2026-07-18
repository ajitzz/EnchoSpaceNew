const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetFuelTank = `      {/* FUEL TANK UI */}
      <div className="mb-10 bg-gray-900 text-white rounded-[2rem] p-8 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-8 items-center justify-between">
        {/* Background Accents */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-6 z-10 w-full md:w-auto">
           {/* Circular Gauge */}
           <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle cx="50" cy="50" r="45" fill="none" stroke={wallet?.balance > 500 ? "#10b981" : wallet?.balance > 0 ? "#f59e0b" : "#ef4444"} strokeWidth="8" 
                  strokeDasharray="283" 
                  strokeDashoffset={283 - (283 * Math.min(100, ((wallet?.balance || 0) / 2500) * 100)) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <BatteryCharging className="w-6 h-6 text-emerald-400 mb-1" />
              </div>
           </div>
           <div>
              <div className="text-xs font-mono text-emerald-400 mb-1 tracking-widest uppercase">Fuel Tank</div>
              <h2 className="text-4xl font-black tracking-tight">{formatPrice(wallet?.balance || 0, 'USD')}</h2>
              <p className="text-gray-400 text-sm mt-1">Available Ad Spend Budget</p>
           </div>
        </div>

        <div className="z-10 w-full md:w-auto flex flex-col gap-3">
          <button 
            onClick={() => setShowRefuelModal(true)}
            className="w-full md:w-auto px-8 py-4 bg-white text-black hover:bg-gray-100 rounded-2xl font-bold transition-transform active:scale-95 shadow-xl flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5 text-yellow-500" />
            Refuel Tank
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Geo-Router Active (Stripe / Razorpay)
          </div>
        </div>
      </div>`;

const replaceFuelTank = `      {/* FUEL TANK UI */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-10 bg-[#0a0a0a] border border-white/10 text-white rounded-[2rem] p-8 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-8 items-center justify-between"
      >
        {/* Background Accents */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-emerald-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex items-center gap-6 z-10 w-full md:w-auto">
           {/* Circular Gauge */}
           <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <motion.circle 
                  cx="50" cy="50" r="45" fill="none" 
                  stroke={wallet?.balance > 500 ? "#10b981" : wallet?.balance > 0 ? "#f59e0b" : "#ef4444"} 
                  strokeWidth="8" 
                  strokeLinecap="round"
                  strokeDasharray={282.74} 
                  initial={{ strokeDashoffset: 282.74 }}
                  animate={{ strokeDashoffset: 282.74 - (282.74 * Math.min(100, ((wallet?.balance || 0) / 2500) * 100)) / 100 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                  style={{
                    filter: \`drop-shadow(0 0 12px \${wallet?.balance > 500 ? 'rgba(16, 185, 129, 0.6)' : wallet?.balance > 0 ? 'rgba(245, 158, 11, 0.6)' : 'rgba(239, 68, 68, 0.6)'})\`
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <BatteryCharging className={\`w-7 h-7 mb-1 \${wallet?.balance > 500 ? "text-emerald-400" : wallet?.balance > 0 ? "text-amber-400" : "text-red-400"}\`} />
              </div>
           </div>
           <div className="space-y-1">
              <div className="text-[10px] font-black font-mono text-zinc-400 tracking-[0.25em] uppercase flex items-center gap-2">
                <span className={\`w-2 h-2 rounded-full animate-pulse \${wallet?.balance > 500 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : wallet?.balance > 0 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"}\`}></span>
                Master Fuel Tank
              </div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight font-mono">{formatPrice(wallet?.balance || 0, 'USD')}</h2>
              <p className="text-zinc-500 text-sm font-medium">Available Network Spend Budget</p>
           </div>
        </div>

        <div className="z-10 w-full md:w-auto flex flex-col gap-3">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowRefuelModal(true)}
            className="w-full md:w-auto px-8 py-4 bg-white text-black hover:bg-zinc-100 rounded-2xl font-black tracking-tight transition-colors shadow-[0_8px_30px_rgba(255,255,255,0.12)] flex items-center justify-center gap-2.5"
          >
            <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            Refuel Tank
          </motion.button>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider bg-white/5 py-1.5 px-3 rounded-full border border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Geo-Router Active (Stripe/Razorpay)
          </div>
        </div>
      </motion.div>`;

if(code.includes(targetFuelTank)) {
    code = code.replace(targetFuelTank, replaceFuelTank);
    console.log('Master Fuel Tank successfully polished!');
} else {
    console.log('Target Fuel Tank block not found.');
}

fs.writeFileSync('components/HostMarketing.tsx', code);
