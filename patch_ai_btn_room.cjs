const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const aiButton = `
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-gray-700 uppercase">Unit Description</label>
                                    <button 
                                        type="button" 
                                        onClick={async () => {
                                            try {
                                                const token = localStorage.getItem('token');
                                                const res = await fetch('/api/ai/suggest-room', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
                                                    body: JSON.stringify({
                                                        propertyType: formData.type,
                                                        city: formData.city,
                                                        propertyAmenities: formData.amenities,
                                                        rentalMode: formData.rentalMode,
                                                    })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    if (data.name) handleUpdateRoom(index, 'name', data.name);
                                                    if (data.description) handleUpdateRoom(index, 'description', data.description);
                                                }
                                            } catch(e) {
                                                console.error('Room AI Suggestion failed', e);
                                            }
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Auto-write Details
                                    </button>
                                </div>
`;

file = file.replace(
    `<label className="text-xs font-bold text-gray-700 uppercase">Unit Description</label>`,
    aiButton
);

fs.writeFileSync('components/HostForm.tsx', file);
console.log('Added AI button for rooms');
