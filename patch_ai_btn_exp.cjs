const fs = require('fs');
let file = fs.readFileSync('components/HostExperienceForm.tsx', 'utf-8');

const aiButton = `
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700">Experience Title</label>
                                    <button 
                                        type="button" 
                                        onClick={async () => {
                                            try {
                                                const token = localStorage.getItem('token');
                                                const res = await fetch('/api/ai/suggest-experience', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
                                                    body: JSON.stringify({
                                                        category: formData.category,
                                                        city: formData.destination,
                                                        languages: formData.languages,
                                                        difficulty: formData.difficulty
                                                    })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    if (data.title) setFormData(prev => ({...prev, title: data.title}));
                                                    if (data.description) setFormData(prev => ({...prev, description: data.description}));
                                                    if (data.what_to_expect) setWhatToExpect(data.what_to_expect);
                                                }
                                            } catch(e) {
                                                console.error('Exp AI Suggestion failed', e);
                                            }
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Auto-write Details
                                    </button>
                                </div>`;

file = file.replace(
    `<label className="block text-sm font-bold text-gray-700 mb-2">Experience Title</label>`,
    aiButton
);

fs.writeFileSync('components/HostExperienceForm.tsx', file);
console.log('Added AI button for experiences');
