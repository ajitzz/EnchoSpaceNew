const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const target = `<label className="text-xs font-bold text-gray-700 uppercase">Unit Name / Type</label>`;
const replacement = `<div className="space-y-4 md:col-span-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700 uppercase">Unit Description</label>
                                <textarea value={room.description || ''} onChange={e => handleUpdateRoom(index, 'description', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white min-h-[80px]" placeholder="Astonishing details about this unit..." />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700 uppercase">Promo Video URL</label>
                                <input type="url" value={room.video_url || ''} onChange={e => handleUpdateRoom(index, 'video_url', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. https://example.com/video.mp4" />
                            </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Unit Name / Type</label>`;

if (!file.includes('Unit Description')) {
    file = file.replace(target, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('HostForm rooms patched');
}
