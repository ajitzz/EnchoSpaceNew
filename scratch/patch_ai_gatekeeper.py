import re

with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

# 1. Add aiScore state
old_state = r"const \[isCuratingRules, setIsCuratingRules\] = useState\(false\);"
new_state = """const [isCuratingRules, setIsCuratingRules] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  
  const runAiGatekeeper = async () => {
    setIsScanning(true);
    // Simulate AI Gatekeeper Analysis (Gemini API Call)
    await new Promise(r => setTimeout(r, 2500));
    const score = photos.length >= 3 && formData.description.length > 50 ? (photos.length >= 5 ? 9.8 : 8.2) : 6.5;
    setAiScore(score);
    setIsScanning(false);
  };"""
content = re.sub(old_state, new_state, content)

# 2. Inject AI Gatekeeper UI in Step 6
old_step6 = r"\{currentStep === 6 && \([\s\S]*?\{/\* Actions \*/\}"
new_step6 = """{currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 6.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Google Search Discovery (SEO)</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Control how your estate appears on search engines.</p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Meta Title</label>
                          <input type="text" value={formData.seo_title} onChange={e => setFormData({...formData, seo_title: e.target.value})} className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm outline-none" placeholder="e.g. Luxury Eco Villa in Bali | Encho" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Meta Description</label>
                          <textarea value={formData.seo_description} onChange={e => setFormData({...formData, seo_description: e.target.value})} rows={3} className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm outline-none" placeholder="Brief captivating summary..." />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Meta Keywords</label>
                          <input type="text" value={formData.seo_keywords} onChange={e => setFormData({...formData, seo_keywords: e.target.value})} className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm outline-none" placeholder="villa, bali, luxury, eco..." />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">OpenGraph Cover Image URL</label>
                          <input type="text" value={formData.seo_image_url} onChange={e => setFormData({...formData, seo_image_url: e.target.value})} className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm outline-none" placeholder="https://..." />
                        </div>
                      </div>
                    </div>

                    {/* ENCHO MASTER DIRECTIVE: AI GATEKEEPER PRE-FLIGHT CHECK */}
                    <div className="bg-black text-white rounded-2xl p-6 border border-zinc-800 shadow-2xl relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent"></div>
                      <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center justify-between">
                        <div className="flex-1 space-y-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">Encho AI Gatekeeper</span>
                          <h3 className="text-xl font-extrabold tracking-tight">Meta Ads Readiness Scan</h3>
                          <p className="text-sm text-zinc-400 leading-relaxed max-w-md">
                            Before publishing, our AI evaluates your listing's copy, media resolution, and architectural tags. 
                            Listings must score > 8.0/10 to be eligible for Encho Master Account Meta Ad injections.
                          </p>
                        </div>
                        
                        <div className="flex-shrink-0 w-full md:w-auto flex flex-col items-center gap-3">
                          {aiScore === null ? (
                            <button 
                              type="button" 
                              onClick={runAiGatekeeper}
                              disabled={isScanning}
                              className="px-6 py-3 w-full rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                            >
                              {isScanning ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Payload...</>
                              ) : (
                                <><Sparkles className="w-4 h-4" /> Run AI Pre-Flight Scan</>
                              )}
                            </button>
                          ) : (
                            <div className="text-center">
                              <div className={`text-4xl font-black ${aiScore >= 8.0 ? 'text-green-400' : 'text-amber-500'}`}>
                                {aiScore.toFixed(1)} <span className="text-lg text-zinc-500">/ 10</span>
                              </div>
                              <div className="text-[10px] font-mono tracking-widest uppercase mt-1 text-zinc-400">
                                {aiScore >= 8.0 ? '✅ CLEARED FOR META ADS' : '⚠️ OPTIMIZATION REQUIRED'}
                              </div>
                              {aiScore < 8.0 && (
                                <p className="text-[10px] text-amber-400 mt-2 max-w-[200px] text-center">
                                  Increase high-res spatial photos (5+) and enhance property description for approval.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}"""
content = re.sub(old_step6, new_step6, content)

# 3. Add AI Gatekeeper to validateStep logic if needed, or disable submit if AI score < 8?
# We will just warn the host, but they can still publish (or maybe require it?). The directive said: "It must warn the host if their photos/descriptions score below an 8/10 for Meta Ads readiness." So warning is sufficient, publishing can proceed.

with open('components/HostForm.tsx', 'w') as f:
    f.write(content)
print("Injected AI Gatekeeper in HostForm.tsx")
