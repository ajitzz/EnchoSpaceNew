const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

file = file.replace('Leaf, X, Eye', 'Leaf, X, Eye, Maximize2');

const oldHeader = `<div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-100 px-6 py-4 flex items-center justify-between pointer-events-none">
             <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Live Customer Preview</h3>
             </div>
             <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase tracking-wider">0ms Latency Sync</span>
           </div>`;

const newHeader = `<div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
             <div className="flex items-center gap-2 pointer-events-none">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Live Customer Preview</h3>
             </div>
             <div className="flex items-center gap-3">
               <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase tracking-wider pointer-events-none">0ms Latency Sync</span>
               <button 
                 type="button"
                 onClick={() => {
                   localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));
                   window.open(window.location.origin + '#PREVIEW_HOST', '_blank');
                 }}
                 className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-700 pointer-events-auto"
                 title="Maximize preview in new tab"
               >
                 <Maximize2 className="w-4 h-4" />
               </button>
             </div>
           </div>`;

file = file.replace(oldHeader, newHeader);
fs.writeFileSync('components/HostForm.tsx', file);
console.log('HostForm patched for preview');
