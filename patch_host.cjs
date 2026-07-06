const fs = require('fs');

let host = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const oldFields = `                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Total Inventory Count</label>
                        <input value={room.inventory_count ?? 1} required type="number" min="1" onChange={e => handleUpdateRoom(index, 'inventory_count', parseInt(e.target.value) || 1)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. 5" />
                        <p className="text-[10px] text-gray-500 mt-1 leading-tight">How many identical physical units of this type exist here?</p>
                      </div>`;

const newFields = `                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Inventory Count</label>
                        <input value={room.inventory_count ?? 1} required type="number" min="1" onChange={e => handleUpdateRoom(index, 'inventory_count', parseInt(e.target.value) || 1)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. 5" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Bedrooms (BHK)</label>
                        <input value={room.bedrooms ?? ''} type="number" min="0" onChange={e => handleUpdateRoom(index, 'bedrooms', parseInt(e.target.value) || 0)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. 2 for 2BHK" />
                      </div>`;

if (!host.includes('Bedrooms (BHK)')) {
    host = host.replace(oldFields, newFields);
    fs.writeFileSync('components/HostForm.tsx', host);
}
console.log('HostForm patched');
