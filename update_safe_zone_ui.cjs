const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetTabs = `                  {/* Device Platform Switcher Tabs */}
                  <div className="grid grid-cols-3 gap-1 bg-zinc-800 p-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-center">`;

const newTabs = `                  {/* Milestone 8.4: Visual Safe-Zone Protection Toggle */}
                  {activePreviewDevice === 'instagram_reels' && (
                    <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/20 p-2 rounded-lg mb-2">
                      <div className="flex items-center gap-2">
                        <Grid className="w-4 h-4 text-emerald-400" />
                        <div>
                           <p className="text-[10px] font-bold text-emerald-300">Safe-Zone Engine Active</p>
                           <p className="text-[8px] text-emerald-500/80">Protect UI overlaps for Reels/TikTok</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSafeZoneOverlay(!showSafeZoneOverlay)}
                        className={\`relative inline-flex h-4 w-8 items-center rounded-full transition-colors \${showSafeZoneOverlay ? 'bg-emerald-500' : 'bg-zinc-600'}\`}
                      >
                        <span className={\`inline-block h-3 w-3 transform rounded-full bg-white transition-transform \${showSafeZoneOverlay ? 'translate-x-4' : 'translate-x-1'}\`} />
                      </button>
                    </div>
                  )}

                  {/* Device Platform Switcher Tabs */}
                  <div className="grid grid-cols-3 gap-1 bg-zinc-800 p-1 rounded-xl text-[10px] font-bold uppercase tracking-wider text-center">`;

code = code.replace(targetTabs, newTabs);

const targetGradient = `<div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>`;

const newGradient = `<div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>
                        
                        {/* Milestone 8.4: Safe-Zone Overlay (Red Hatches on Danger Zones) */}
                        {showSafeZoneOverlay && (
                          <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-[24px]">
                             {/* Top Safe Zone (System UI) */}
                             <div className="absolute top-0 left-0 right-0 h-[60px] bg-red-500/20 border-b border-red-500 border-dashed flex items-start justify-center pt-2">
                                <span className="text-[8px] font-black text-red-300 tracking-widest drop-shadow-md">DANGER ZONE (TOP UI)</span>
                             </div>
                             {/* Right Safe Zone (Engagement Icons) */}
                             <div className="absolute right-0 top-[180px] bottom-[120px] w-[50px] bg-red-500/20 border-l border-red-500 border-dashed flex items-center justify-center">
                                <span className="text-[8px] font-black text-red-300 -rotate-90 whitespace-nowrap tracking-widest drop-shadow-md">DANGER ZONE (ICONS)</span>
                             </div>
                             {/* Bottom Safe Zone (Caption & Audio) */}
                             <div className="absolute bottom-0 left-0 right-0 h-[100px] bg-red-500/20 border-t border-red-500 border-dashed flex items-end justify-center pb-2">
                                <span className="text-[8px] font-black text-red-300 tracking-widest drop-shadow-md">DANGER ZONE (CAPTION)</span>
                             </div>
                             {/* Center Safe Zone (Green) */}
                             <div className="absolute inset-0 flex items-center justify-center">
                                <div className="border-2 border-emerald-500/50 rounded-lg w-[calc(100%-60px)] h-[calc(100%-180px)] -ml-[10px] -mt-[20px] flex items-center justify-center bg-emerald-500/10">
                                   <span className="text-emerald-400/80 font-black text-lg rotate-[-20deg] border-2 border-emerald-400/80 px-3 py-1 rounded-md drop-shadow-lg">SAFE ZONE</span>
                                </div>
                             </div>
                          </div>
                        )}`;

// The reels preview in the main panel has this gradient. Let's make sure it matches.
// There is also the modal preview! Let's just use global string replacement for both.
// Wait, the modal preview also has `<div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>` inside activePreviewDevice === 'instagram_reels' ? No, the modal one is `modalPreviewDevice === 'instagram_reels'`.

// Since there are multiple occurrences of this gradient, we should just replace all occurrences in reels sections.
code = code.split(targetGradient).join(newGradient);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Added Safe Zone Overlay');
