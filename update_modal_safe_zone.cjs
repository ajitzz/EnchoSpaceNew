const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetModalSwitcher = `                </div>

                {/* ==================== FORMAT 1: INSTAGRAM REELS (9:16 VERTICAL) ==================== */}`;

const newModalSwitcher = `                </div>
                
                {/* Milestone 8.4: Modal Visual Safe-Zone Protection Toggle */}
                {modalPreviewDevice === 'instagram_reels' && (
                  <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/20 p-2 rounded-lg mb-2">
                    <div className="flex items-center gap-2">
                      <Grid className="w-3 h-3 text-emerald-400" />
                      <div>
                         <p className="text-[9px] font-bold text-emerald-300">Safe-Zone Engine</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSafeZoneOverlay(!showSafeZoneOverlay)}
                      className={\`relative inline-flex h-3 w-6 items-center rounded-full transition-colors \${showSafeZoneOverlay ? 'bg-emerald-500' : 'bg-zinc-600'}\`}
                    >
                      <span className={\`inline-block h-2 w-2 transform rounded-full bg-white transition-transform \${showSafeZoneOverlay ? 'translate-x-3.5' : 'translate-x-0.5'}\`} />
                    </button>
                  </div>
                )}

                {/* ==================== FORMAT 1: INSTAGRAM REELS (9:16 VERTICAL) ==================== */}`;

code = code.replace(targetModalSwitcher, newModalSwitcher);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Added Modal Safe Zone Overlay Toggle');
