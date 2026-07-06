const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const stateInjection = `  const [aiPrompt, setAiPrompt] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);

  const handleAiDraft = async () => {
    if (!aiPrompt.trim()) return;
    setIsDrafting(true);
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/ai/draft-property', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
            body: JSON.stringify({ prompt: aiPrompt })
        });
        if (res.ok) {
            const data = await res.json();
            setFormData(prev => ({
                ...prev,
                title: data.title || prev.title,
                description: data.description || prev.description,
                type: data.type || prev.type,
                city: data.city || prev.city,
                rentalMode: data.rentalMode || prev.rentalMode,
                price: data.price ? String(data.price) : prev.price,
                maxGuests: data.maxGuests || prev.maxGuests,
                bedrooms: data.bedrooms || prev.bedrooms,
                beds: data.beds || prev.beds,
                bathrooms: data.bathrooms || prev.bathrooms,
                amenities: data.amenities?.length ? Array.from(new Set([...prev.amenities, ...data.amenities])) : prev.amenities
            }));
            addToast("Draft Generated", "Your property details have been auto-filled.", "success");
            setAiPrompt('');
        } else {
            addToast("Generation Failed", "Could not generate draft. Please try again.", "error");
        }
    } catch(e) {
        console.error('Draft AI failed', e);
        addToast("Error", "Failed to connect to AI service.", "error");
    } finally {
        setIsDrafting(false);
    }
  };

  const handleFocus`;

file = file.replace("  const handleFocus", stateInjection);


const uiInjection = `      <main className="max-w-[1600px] mx-auto px-4 pt-8 md:pt-12 flex gap-8 pb-20">
        <div className="flex-1 max-w-3xl">
          
          {/* AI Magic Drafter */}
          <section className="bg-gradient-to-br from-indigo-900 to-black rounded-3xl p-6 md:p-8 shadow-xl mb-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                          <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">AI Property Drafter</h3>
                          <p className="text-indigo-200 text-sm">Describe your space, and let AI build your perfect listing.</p>
                      </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3">
                      <input 
                          type="text" 
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !isDrafting && handleAiDraft()}
                          placeholder="e.g. A cozy 2-bedroom wooden cabin in Manali with a fireplace..." 
                          className="flex-1 px-5 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/20 transition-all"
                      />
                      <button 
                          type="button" 
                          onClick={handleAiDraft}
                          disabled={isDrafting || !aiPrompt.trim()}
                          className="px-6 py-3.5 bg-white text-black font-bold rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-w-[140px]"
                      >
                          {isDrafting ? (
                              <><svg className="animate-spin w-4 h-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Drafting...</>
                          ) : (
                              'Generate Draft'
                          )}
                      </button>
                  </div>
              </div>
          </section>

          <form id="host-form" onSubmit={handleSubmit} className="space-y-8">`;

file = file.replace(
    `      <main className="max-w-[1600px] mx-auto px-4 pt-8 md:pt-12 flex gap-8 pb-20">
        <div className="flex-1 max-w-3xl">
          <form id="host-form" onSubmit={handleSubmit} className="space-y-8">`,
    uiInjection
);


fs.writeFileSync('components/HostForm.tsx', file);
console.log('HostForm AI Drafter injected');
