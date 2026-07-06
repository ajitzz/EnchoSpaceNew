const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const target = `<div className="space-y-4">
                <div className="space-y-2">`;
const replacement = `<div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <button 
                        type="button" 
                        className="text-sm font-semibold flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm ml-auto"
                        onClick={async () => {
                            try {
                                const token = localStorage.getItem('token');
                                const res = await fetch('/api/ai/suggest-listing', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
                                    body: JSON.stringify({
                                        type: formData.type,
                                        city: formData.city,
                                        amenities: formData.amenities,
                                        rooms: formData.rooms,
                                        rentalMode: formData.rentalMode
                                    })
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    if (data.title) setFormData(prev => ({...prev, title: data.title}));
                                    if (data.description) setFormData(prev => ({...prev, description: data.description}));
                                }
                            } catch(e) {
                                console.error('AI Suggestion failed', e);
                            }
                        }}
                    >
                        <span>✨ Auto-write with AI</span>
                    </button>
                </div>
                <div className="space-y-2">`;
if(file.includes(target)) {
    file = file.replace(target, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('Restored Auto-write with AI button');
} else {
    console.log('Target not found');
}
