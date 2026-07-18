import re

with open('components/HostMarketing.tsx', 'r') as f:
    content = f.read()

# Add states for social posting
state_injections = """
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [socialAsset, setSocialAsset] = useState<File | null>(null);
  const [socialAssetPreview, setSocialAssetPreview] = useState<string | null>(null);
  const [isPublishingSocial, setIsPublishingSocial] = useState(false);
  const [socialFormat, setSocialFormat] = useState<'reel' | 'story' | 'carousel'>('reel');
  const [socialCaption, setSocialCaption] = useState('');
"""

if "showSocialModal" not in content:
    content = content.replace("const [showCreateModal, setShowCreateModal] = useState(false);", "const [showCreateModal, setShowCreateModal] = useState(false);\n" + state_injections)


# Add helper function for social post upload
helpers = """
  const handleSocialAssetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       const file = e.target.files[0];
       setSocialAsset(file);
       setSocialAssetPreview(URL.createObjectURL(file));
    }
  };

  const publishToEnchoSocials = async () => {
    if (!socialAsset) return addToast('Please select an asset to publish.', 'error');
    setIsPublishingSocial(true);
    
    try {
      const token = localStorage.getItem('token');
      // Step 1: Upload Asset
      const formData = new FormData();
      formData.append('media', socialAsset);
      
      const uploadRes = await fetch('/api/marketing/assets/upload', {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${token}` },
         body: formData
      });
      const uploadData = await uploadRes.json();
      
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload asset.');

      // Step 2: Publish to Meta
      const publishRes = await fetch('/api/marketing/social/publish', {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify({
            media_url: uploadData.urls.reel_url, // For now assuming Reel
            caption: socialCaption,
            format: socialFormat
         })
      });
      
      const publishData = await publishRes.json();
      if (!publishRes.ok) throw new Error(publishData.error || 'Failed to publish to Meta.');
      
      addToast(publishData.message || 'Successfully published to Encho Network.', 'success');
      setShowSocialModal(false);
      setSocialAsset(null);
      setSocialAssetPreview(null);
      setSocialCaption('');
      
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsPublishingSocial(false);
    }
  };
"""

if "publishToEnchoSocials" not in content:
    content = content.replace("const handleCreateCampaign = async () => {", helpers + "\nconst handleCreateCampaign = async () => {")


# Add a button in the UI header to trigger the Social Publisher
social_button = """
          <button
            onClick={() => setShowSocialModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl hover:from-fuchsia-700 hover:to-pink-700 transition-all font-medium shadow-[0_0_20px_rgba(217,70,239,0.3)] border border-white/10"
          >
            <Play className="w-4 h-4" />
            Publish Reel/Story
          </button>
"""

content = content.replace("Create Campaign\n          </button>", "Create Campaign\n          </button>\n" + social_button)

# Add the Social Publisher Modal
social_modal = """
        {/* Social Publisher Modal */}
        <AnimatePresence>
          {showSocialModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
            >
               <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative my-8"
              >
                <button
                  onClick={() => setShowSocialModal(false)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 flex items-center justify-center border border-fuchsia-500/30">
                     <Play className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Publish to Encho Network</h2>
                    <p className="text-gray-400 text-sm mt-1">Post a Reel, Story, or Carousel directly to our main Instagram/Facebook accounts to drive traffic.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: Settings */}
                  <div className="space-y-6">
                     <div>
                       <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
                       <div className="flex gap-2">
                         {['reel', 'story', 'carousel'].map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => setSocialFormat(fmt as any)}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                                socialFormat === fmt 
                                  ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-300'
                                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                              }`}
                            >
                              {fmt}
                            </button>
                         ))}
                       </div>
                     </div>
                     
                     <div>
                       <label className="block text-sm font-medium text-gray-300 mb-2">Caption / Offer</label>
                       <textarea
                         value={socialCaption}
                         onChange={(e) => setSocialCaption(e.target.value)}
                         placeholder="Describe your property or share a special offer..."
                         className="w-full h-32 px-4 py-3 bg-[#2C2C2E] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent text-white text-sm resize-none"
                       />
                     </div>
                     
                     <div className="p-4 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20">
                       <div className="flex items-start gap-3">
                         <ShieldCheck className="w-5 h-5 text-fuchsia-400 mt-0.5" />
                         <div className="text-xs text-gray-300 leading-relaxed">
                           <strong className="text-white block mb-1">AI Walled-Garden Protection</strong>
                           Do not include personal phone numbers, emails, or external links in the caption. The AI Gatekeeper will automatically reject non-compliant posts.
                         </div>
                       </div>
                     </div>
                  </div>
                  
                  {/* Right Column: Preview & Upload */}
                  <div className="space-y-4">
                     <label className="block text-sm font-medium text-gray-300">Media Asset</label>
                     <div 
                        className={`relative w-full aspect-[9/16] rounded-xl overflow-hidden border-2 border-dashed flex flex-col items-center justify-center text-center p-6 transition-colors ${
                          socialAssetPreview ? 'border-white/10' : 'border-gray-600 hover:border-fuchsia-500 hover:bg-fuchsia-500/5'
                        }`}
                     >
                       {socialAssetPreview ? (
                         <>
                           <img src={socialAssetPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                           <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                             <button
                               onClick={() => { setSocialAsset(null); setSocialAssetPreview(null); }}
                               className="px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                             >
                               Remove
                             </button>
                           </div>
                         </>
                       ) : (
                         <>
                           <Upload className="w-8 h-8 text-gray-400 mb-3" />
                           <p className="text-sm text-gray-300 font-medium mb-1">Click to upload media</p>
                           <p className="text-xs text-gray-500">Max 50MB. Auto-formatted by AI.</p>
                           <input
                             type="file"
                             accept="image/*,video/*"
                             onChange={handleSocialAssetChange}
                             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                           />
                         </>
                       )}
                     </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-white/10 flex justify-end gap-3">
                  <button
                    onClick={() => setShowSocialModal(false)}
                    className="px-6 py-2.5 rounded-xl font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    disabled={isPublishingSocial}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={publishToEnchoSocials}
                    disabled={isPublishingSocial || !socialAsset}
                    className="flex items-center gap-2 px-8 py-2.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 text-white rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(217,70,239,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPublishingSocial ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Publish to Network
                      </>
                    )}
                  </button>
                </div>
               </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
"""

content = content.replace("{/* Create Campaign Modal */}", social_modal + "\n{/* Create Campaign Modal */}")

with open('components/HostMarketing.tsx', 'w') as f:
    f.write(content)
