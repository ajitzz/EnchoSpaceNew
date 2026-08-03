const fs = require('fs');
const content = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');

const startIndex = content.indexOf("{marketingSubTab === 'organic_social' && (");
const endIndex = content.indexOf("{/* Tab Content 5: Immutable Audit Trail */}");

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find bounds");
  process.exit(1);
}

const replacement = `{marketingSubTab === 'organic_social' && (
                       <div className="space-y-8 text-left w-full">
                          {/* Master Brand Queue - Synchronization Health & Status Dashboard */}
                          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-700">
                             <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                   <Activity className="w-5 h-5 text-amber-400" />
                                   <h3 className="text-lg font-black tracking-tight">Master Brand Queue Status Dashboard</h3>
                                   <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length} STALE/PENDING DRAFTS
                                   </span>
                                </div>
                                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                                   Real-time synchronization health of host draft submissions for the master platform. Timestamped drafts that fail to appear in standard queues are audited here for visibility.
                                </p>
                             </div>
                             <button
                                type="button"
                                onClick={fetchAdminSocialPosts}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2 self-start md:self-auto border border-white/10 shadow-sm"
                             >
                                <RefreshCw className={\`w-3.5 h-3.5 \${loadingAdminSocialPosts ? 'animate-spin' : ''}\`} />
                                Sync Queue
                             </button>
                          </div>

                          {/* Stats Overview */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                             <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pending Pipeline</span>
                                <span className="text-3xl font-black text-amber-500">
                                   {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length}
                                </span>
                             </div>
                             <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Published/Approved</span>
                                <span className="text-3xl font-black text-emerald-500">
                                   {adminSocialPosts.filter(p => p.status === 'approved').length}
                                </span>
                             </div>
                             <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block mb-2 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Rejected Drafts</span>
                                <span className="text-3xl font-black text-rose-500">
                                   {adminSocialPosts.filter(p => p.status === 'rejected').length}
                                </span>
                             </div>
                             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Stale (24h+)</span>
                                <span className="text-3xl font-black text-slate-700">
                                   {adminSocialPosts.filter(p => (p.status === 'pending_approval' || p.status === 'pending') && (new Date().getTime() - new Date(p.created_at).getTime() > 24 * 60 * 60 * 1000)).length}
                                </span>
                             </div>
                          </div>

                          {/* Explicit Admin Audit View - Grouped by Status */}
                          <div className="space-y-6">
                             {loadingAdminSocialPosts ? (
                                <div className="p-20 flex justify-center items-center bg-white rounded-3xl border border-gray-200 shadow-sm">
                                   <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                                </div>
                             ) : adminSocialPosts.length === 0 ? (
                                <div className="p-16 text-center text-gray-500 bg-white rounded-3xl border border-gray-200 shadow-sm">
                                   <Sparkles className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                                   <p className="text-sm font-medium">No organic social media publishing requests in the pipeline.</p>
                                </div>
                             ) : (
                                <>
                                   {/* 1. Action Required: Pending Approval Queue */}
                                   <div className="bg-white rounded-3xl border-2 border-amber-200 shadow-sm overflow-hidden">
                                      <div className="p-5 border-b border-gray-150 bg-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                         <div>
                                            <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                                               <AlertCircle className="w-4 h-4 text-amber-500" />
                                               Action Required: Pending Drafts
                                            </h3>
                                            <p className="text-[11px] text-amber-700 font-medium mt-1">
                                               Drafts submitted by hosts waiting for master brand publishing approval. These must be reviewed.
                                            </p>
                                         </div>
                                         <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold shrink-0">
                                            {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length} Items
                                         </div>
                                      </div>
                                      
                                      <div className="divide-y divide-gray-150 text-xs">
                                         {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length === 0 ? (
                                            <div className="p-8 text-center text-gray-400 font-medium italic text-[11px]">
                                               No pending drafts requiring action.
                                            </div>
                                         ) : (
                                            adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').map((post) => (
                                               <SocialPostRow 
                                                  key={post.id} 
                                                  post={post} 
                                                  onApprove={() => handleApproveSocialPost(post.id)}
                                                  onReject={() => {
                                                     setRejectingSocialPostId(post.id);
                                                     setSocialRejectionFeedback('');
                                                  }}
                                               />
                                            ))
                                         )}
                                      </div>
                                   </div>

                                   {/* 2. Processed: Approved & Live */}
                                   <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden opacity-90">
                                      <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
                                         <h3 className="text-xs font-black text-emerald-800 uppercase tracking-tight flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                            Live / Approved
                                         </h3>
                                      </div>
                                      <div className="divide-y divide-gray-150 text-xs">
                                         {adminSocialPosts.filter(p => p.status === 'approved').length === 0 ? (
                                            <div className="p-6 text-center text-gray-400 font-medium italic text-[11px]">
                                               No approved posts.
                                            </div>
                                         ) : (
                                            adminSocialPosts.filter(p => p.status === 'approved').map((post) => (
                                               <SocialPostRow key={post.id} post={post} />
                                            ))
                                         )}
                                      </div>
                                   </div>

                                   {/* 3. Processed: Rejected */}
                                   <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden opacity-75">
                                      <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
                                         <h3 className="text-xs font-black text-rose-800 uppercase tracking-tight flex items-center gap-2">
                                            <XCircle className="w-4 h-4 text-rose-500" />
                                            Rejected (Feedback Sent)
                                         </h3>
                                      </div>
                                      <div className="divide-y divide-gray-150 text-xs">
                                         {adminSocialPosts.filter(p => p.status === 'rejected').length === 0 ? (
                                            <div className="p-6 text-center text-gray-400 font-medium italic text-[11px]">
                                               No rejected posts.
                                            </div>
                                         ) : (
                                            adminSocialPosts.filter(p => p.status === 'rejected').map((post) => (
                                               <SocialPostRow key={post.id} post={post} />
                                            ))
                                         )}
                                      </div>
                                   </div>
                                </>
                             )}
                          </div>
                       </div>
                    )}
                    `;

const newContent = content.substring(0, startIndex) + replacement + "\n" + content.substring(endIndex);
fs.writeFileSync('components/AdminDashboard.tsx', newContent);
