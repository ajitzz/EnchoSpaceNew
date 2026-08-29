import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

# 1. Update Tabs Navigation for sliding pill
old_nav = r"\{/\* HORIZONTAL SPATIAL CATEGORY TAXONOMY BAR \*/\}[\s\S]*?\{/\* ========================================================================= \*/\}"
new_nav = """{/* HORIZONTAL SPATIAL CATEGORY TAXONOMY BAR */}
        <nav className="px-4 sm:px-8 py-3 lg:py-5 bg-black/80 backdrop-blur-xl border-b border-white/5 overflow-x-auto scrollbar-hide z-30 shrink-0 sticky top-0">
          <div className="flex items-center gap-1 sm:gap-2 min-w-max mx-auto max-w-[1400px]">
            {GALLERY_CATEGORIES.map(cat => {
              const count = categoryCounts[cat.key] || 0;
              if (count === 0 && cat.key !== 'all') return null;

              const isSelected = selectedCategory === cat.key;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setSelectedCategory(cat.key);
                  }}
                  className={`relative px-4 sm:px-6 py-2.5 rounded-full text-[11px] sm:text-xs font-mono font-bold tracking-widest uppercase transition-colors duration-500 cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'text-black'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-amber-400 rounded-full"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <span className="opacity-80">{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full transition-colors duration-300 ${
                      isSelected ? 'bg-black/20 text-black' : 'bg-white/10 text-zinc-400'
                    }`}>
                      {count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        {/* ========================================================================= */}"""

content = re.sub(old_nav, new_nav, content)

# 2. Wrap <main> content in AnimatePresence and add a highly refined typographical left column.
old_main = r"<main className=\"flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 lg:p-12 scrollbar-thin scrollbar-thumb-zinc-800\">[\s\S]*?</main>"
new_main = """<main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 lg:p-12 scrollbar-thin scrollbar-thumb-zinc-800 bg-[#050505]">
          <AnimatePresence mode="wait">
            <motion.div 
              key={selectedCategory}
              initial={{ opacity: 0, y: 15, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(10px)' }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-[1400px] mx-auto space-y-32 pb-32"
            >
              
              {/* Active Category Header Banner */}
              <div className="space-y-6 max-w-4xl pb-12 pt-8 sm:pt-12 border-b border-white/10">
                <motion.span 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.8 }}
                  className="inline-block text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.3em] text-amber-500"
                >
                  Architectural Taxonomy &mdash; {selectedCategory}
                </motion.span>
                <h1 className="text-5xl sm:text-7xl lg:text-[80px] font-extrabold font-display text-white tracking-tighter leading-[0.9]">
                  {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.headline || 'Curated Spaces'}
                </h1>
                <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl font-light">
                  {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.description}
                </p>
              </div>

              {/* SPLIT LAYOUT SPATIAL TOUR */}
              <div className="space-y-40">
                {Object.entries(groupedPhotos).map(([spatialCat, photosInCat], sectionIdx) => {
                   const firstPhoto = photosInCat[0];
                   const isCommon = photosInCat.some(p => p.tier === 'common') && selectedCategory !== 'common';
                   
                   return (
                     <motion.div 
                       key={spatialCat} 
                       initial={{ opacity: 0 }}
                       whileInView={{ opacity: 1 }}
                       viewport={{ once: true, margin: "-20%" }}
                       transition={{ duration: 1 }}
                       className="flex flex-col lg:flex-row gap-12 lg:gap-24"
                     >
                       {/* LEFT COLUMN: Context & Description (Sticky) */}
                       <div className="w-full lg:w-1/3">
                          <div className="sticky top-32 space-y-8">
                             <div className="space-y-4">
                               {isCommon && (
                                 <div className="flex items-center gap-2 mb-4">
                                   <div className="h-[1px] w-8 bg-amber-500"></div>
                                   <span className="text-[10px] text-amber-500 font-mono uppercase tracking-[0.2em] font-bold">Shared Amenity</span>
                                 </div>
                               )}
                               <h2 className="text-4xl sm:text-5xl font-display font-medium text-white tracking-tight leading-none">
                                 {SPATIAL_LABELS[spatialCat] || spatialCat}
                               </h2>
                               <div className="w-12 h-[2px] bg-white/20"></div>
                             </div>
                             
                             {(firstPhoto.description || firstPhoto.specs) ? (
                               <div className="space-y-6 pt-4">
                                 {firstPhoto.description && (
                                   <p className="text-zinc-400 text-base leading-loose font-light">
                                     {firstPhoto.description}
                                   </p>
                                 )}
                                 {firstPhoto.specs && (
                                   <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest border-l border-amber-500/50 pl-4 py-1">
                                     {firstPhoto.specs}
                                   </p>
                                 )}
                               </div>
                             ) : (
                               <p className="text-zinc-500 text-base leading-loose font-light pt-4">
                                 Experience the meticulously crafted details and architectural harmony of this space. Designed for ultimate comfort and aesthetic brilliance.
                               </p>
                             )}

                             {/* Minimalist Index Indicator */}
                             <div className="pt-8 text-[10px] font-mono text-zinc-700 tracking-widest">
                               0{sectionIdx + 1} &mdash; {Object.keys(groupedPhotos).length < 10 ? `0${Object.keys(groupedPhotos).length}` : Object.keys(groupedPhotos).length}
                             </div>
                          </div>
                       </div>
                       
                       {/* RIGHT COLUMN: Awwwards-Level Asymmetrical Grid */}
                       <div className="w-full lg:w-2/3">
                          <div className="grid grid-cols-12 gap-3 md:gap-5 lg:gap-8">
                             {photosInCat.map((photo, idx) => {
                               const absoluteIndex = filteredPhotos.findIndex(p => p.id === photo.id);
                               const total = photosInCat.length;
                               
                               // AWWWARDS-LEVEL BENTO LOGIC
                               let spanClass = "col-span-12";
                               let heightClass = "h-[300px] sm:h-[400px]";
                               let aspect: any = "16:9";

                               if (total === 1) {
                                 spanClass = "col-span-12";
                                 heightClass = "h-[350px] sm:h-[550px] lg:h-[750px]";
                               } else if (total === 2) {
                                 spanClass = "col-span-12 sm:col-span-6";
                                 heightClass = "h-[350px] sm:h-[450px] lg:h-[600px]";
                                 aspect = "4:3";
                               } else if (total === 3) {
                                 if (idx === 0) {
                                   spanClass = "col-span-12 sm:col-span-8";
                                   heightClass = "h-[350px] sm:h-[500px] lg:h-[700px]";
                                 } else {
                                   spanClass = "col-span-6 sm:col-span-4";
                                   heightClass = "h-[170px] sm:h-[242px] lg:h-[334px]";
                                   aspect = "4:3";
                                 }
                               } else {
                                 // 4+ Photos: High-End Editorial Rhythm
                                 const pattern = idx % 6;
                                 if (pattern === 0) {
                                   spanClass = "col-span-12";
                                   heightClass = "h-[350px] sm:h-[450px] lg:h-[600px]";
                                 } else if (pattern === 1 || pattern === 2) {
                                   spanClass = "col-span-6";
                                   heightClass = "h-[200px] sm:h-[300px] lg:h-[450px]";
                                   aspect = "4:3";
                                 } else if (pattern === 3) {
                                   spanClass = "col-span-12 sm:col-span-7";
                                   heightClass = "h-[250px] sm:h-[350px] lg:h-[500px]";
                                 } else {
                                   spanClass = idx === 4 && total === 5 ? "col-span-12 sm:col-span-5" : (pattern === 4 ? "col-span-6 sm:col-span-5" : "col-span-6 sm:col-span-12"); 
                                   heightClass = "h-[250px] sm:h-[350px] lg:h-[500px]";
                                 }
                               }

                               // Override for mobile specific Awwwards touch (first image always massive, next two split)
                               if (total > 3 && idx === 0) spanClass = "col-span-12";
                               if (total > 3 && (idx === 1 || idx === 2)) spanClass = "col-span-6 sm:col-span-6";

                               return (
                                 <motion.div 
                                   key={photo.id}
                                   initial={{ opacity: 0, y: 50, scale: 0.95 }}
                                   whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                   viewport={{ once: true, margin: "-15%" }}
                                   transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: (idx % 3) * 0.1 }}
                                   onClick={() => openLightboxAt(absoluteIndex)}
                                   className={`${spanClass} ${heightClass} group relative overflow-hidden bg-[#0A0A0A] cursor-pointer will-change-transform`}
                                 >
                                    <div className="absolute inset-0 w-full h-full">
                                       <OptimizedImage
                                         src={photo.url}
                                         aspectRatio={aspect}
                                         className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-[1500ms] ease-[cubic-bezier(0.16,1,0.3,1)] opacity-90 group-hover:opacity-100"
                                         alt={photo.title || 'Space'}
                                       />
                                       
                                       <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-700" />
                                       
                                       <div className="absolute bottom-6 left-6 right-6 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-700 ease-out">
                                         <div className="flex items-center gap-3 mb-2">
                                            <div className="h-[1px] w-8 bg-amber-400"></div>
                                            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-amber-400">Inspect 4K</span>
                                         </div>
                                       </div>
                                    </div>
                                 </motion.div>
                               );
                             })}
                          </div>
                       </div>
                     </motion.div>
                   );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>"""

content = re.sub(old_main, new_main, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Patched Awwwards UX")
