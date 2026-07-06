const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const regex = /<div className="flex items-center gap-4">                            <\/div>\s*<div className="space-y-2">/;
const replacement = `<div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">{existingListing ? 'Edit your space' : 'Host your space'}</h1>
        </div>
        <div className="hidden md:flex items-center gap-4">
            <button onClick={onBack} type="button" className="px-6 py-2.5 font-bold text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
            <button form="host-form" type="submit" disabled={loading || isCompressing || photos.length === 0} className="px-8 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#0284C7]/20 disabled:opacity-50">
                {isCompressing ? 'Compressing...' : loading ? 'Saving...' : existingListing ? 'Save Changes' : 'Publish Listing'}
            </button>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 pt-8 md:pt-12 flex gap-8 pb-20">
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

          <form id="host-form" onSubmit={handleSubmit} className="space-y-8">

          {/* Section 1: Photos */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onFocusCapture={() => handleFocus('Photos')} onClick={() => handleFocus('Photos')}>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Photos</h2>
                    <p className="text-gray-500 mt-1">Add at least one photo of your space.</p>
                </div>
            </div>
            <PhotoUpload photos={photos} setPhotos={setPhotos} isCompressing={isCompressing} setIsCompressing={setIsCompressing} />
          </section>

          {/* Section 2: Basics */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onFocusCapture={() => handleFocus('Basics')} onClick={() => handleFocus('Basics')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">The Basics</h2>
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">`;
                
if(regex.test(file)) {
    file = file.replace(regex, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('Fixed file');
} else {
    console.log('Regex did not match');
}
