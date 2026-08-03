const fs = require('fs');
const content = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');

const socialPostRowCode = `
const SocialPostRow = ({ post, onApprove, onReject }: { post: any, onApprove?: () => void, onReject?: () => void }) => {
  const isPending = post.status === 'pending_approval' || post.status === 'pending';
  return (
    <div className="p-4 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-6">
      <div className="flex gap-4 items-start max-w-2xl">
         <div className="w-16 h-16 rounded-xl bg-gray-100 border shrink-0 overflow-hidden relative shadow-sm">
            {post.media_urls?.[0] ? (
               <img
                  src={post.media_urls[0]}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt=""
               />
            ) : (
               <Upload className="w-6 h-6 text-gray-400 mx-auto mt-5" />
            )}
            <span className="absolute bottom-0 right-0 bg-black/75 text-[8px] font-bold text-white px-1.5 py-0.5 uppercase leading-none rounded-tl-md">
               {post.media_type}
            </span>
         </div>
         <div className="space-y-1.5">
            <h4 className="font-bold text-gray-900 text-sm">
               {post.listing_title || 'General Master Platform Post'}
            </h4>
            <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
               <span className="font-sans font-bold text-gray-700">{post.host_name || 'Encho Host'}</span>
               <span>&bull;</span>
               <span>{post.host_email || \`Host ID: \${post.host_id}\`}</span>
               <span>&bull;</span>
               <span className="text-gray-400">
                 {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : 'Immediate Release'}
               </span>
            </div>
            <p className="font-light text-gray-700 line-clamp-3 leading-relaxed text-xs mt-1 bg-gray-50 p-2 border border-gray-100 rounded-lg">
               {post.caption}
            </p>
            {post.is_boosted && (
               <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase mt-1">
                  <Zap className="w-2.5 h-2.5 fill-amber-800" />
                  BOOSTED ₹{post.boost_budget}
               </span>
            )}
            {post.admin_feedback && !isPending && (
               <p className="text-[10px] text-rose-600 mt-1 italic font-medium">
                  Feedback: {post.admin_feedback}
               </p>
            )}
         </div>
      </div>
      
      <div className="flex flex-col items-end gap-3 shrink-0">
         <span className={\`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider \${
            post.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
            post.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
            'bg-amber-50 text-amber-700 border border-amber-100'
         }\`}>
            {isPending ? 'PENDING APPROVAL' : post.status}
         </span>
         
         {isPending && onApprove && onReject && (
            <div className="flex items-center justify-end gap-2 mt-2">
               <button
                  type="button"
                  onClick={onApprove}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl transition-all text-xs shadow-sm flex items-center gap-1.5"
               >
                  <Check className="w-4 h-4" />
                  <span>Approve & Publish</span>
               </button>
               <button
                  type="button"
                  onClick={onReject}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-4 py-2 rounded-xl transition-all text-xs"
               >
                  Reject
               </button>
            </div>
         )}
         
         {post.status === 'approved' && (
            <div className="text-right mt-2">
               <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-md">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Live on Feeds</span>
               </span>
               <div className="text-[10px] text-gray-400 font-mono mt-1">
                  ❤️ {post.likes || 0} • 💬 {post.comments || 0}
               </div>
            </div>
         )}
      </div>
    </div>
  );
};
`;

const insertIndex = content.lastIndexOf('export default AdminDashboard;');
const newContent = content.substring(0, insertIndex) + socialPostRowCode + "\n" + content.substring(insertIndex);
fs.writeFileSync('components/AdminDashboard.tsx', newContent);
