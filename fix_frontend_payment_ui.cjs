const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetGatewayTabs = `              {/* Gateway Selection Tabs */}
              <div className="mb-5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Choose Payment Gateway</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('stripe')}
                    className={\`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all \${
                      selectedGateway === 'stripe'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-700 ring-2 ring-blue-600/10 font-bold'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                    }\`}
                  >
                    <span className="text-sm font-black font-sans">Stripe</span>
                    <span className="text-[9px] opacity-75 mt-0.5">International Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('razorpay')}
                    className={\`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all \${
                      selectedGateway === 'razorpay'
                        ? 'border-indigo-600 bg-indigo-50/40 text-indigo-700 ring-2 ring-indigo-600/10 font-bold'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                    }\`}
                  >
                    <span className="text-sm font-black font-sans">Razorpay</span>
                    <span className="text-[9px] opacity-75 mt-0.5">UPI, Cards, Netbanking</span>
                  </button>
                </div>
              </div>`;

const newGatewayTabs = `              {/* Milestone 8.4: Hybrid Geo-Router Detection UI */}
              <div className="mb-5 bg-gradient-to-r from-emerald-900 to-zinc-900 border border-emerald-500/30 rounded-xl p-4 text-white">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-2">
                     <Globe className="w-4 h-4 text-emerald-400" />
                     <span className="font-bold text-sm tracking-tight">Geo-Router Engine Active</span>
                   </div>
                   <span className="text-[8px] bg-emerald-500/20 text-emerald-300 font-mono font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                     Smart Routing
                   </span>
                </div>
                <p className="text-[10px] text-emerald-100/80 leading-relaxed font-light mb-3">
                  Encho automatically detects your listing region and routes transactions via our optimized payment layer to ensure compliance and lowest processing fees.
                </p>
                <div className="bg-black/40 rounded-lg p-2 flex items-center justify-between border border-white/5">
                   <span className="text-[10px] text-zinc-400 font-mono">Optimization Fee</span>
                   <span className="text-[10px] font-bold text-amber-400">15% Encho Margin</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 opacity-50 pointer-events-none">
                  <div className={\`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all \${selectedGateway === 'stripe' ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-700 bg-zinc-800'}\`}>
                    <span className="text-xs font-black font-sans">Stripe</span>
                  </div>
                  <div className={\`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all \${selectedGateway === 'razorpay' ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-700 bg-zinc-800'}\`}>
                    <span className="text-xs font-black font-sans">Razorpay</span>
                  </div>
                </div>
              </div>`;

code = code.replace(targetGatewayTabs, newGatewayTabs);
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed Gateway Tabs UI');
