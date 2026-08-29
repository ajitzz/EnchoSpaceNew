with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    lines = f.readlines()

new_main = """        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 lg:p-12 scrollbar-thin scrollbar-thumb-zinc-800">
          <div className="max-w-[1400px] mx-auto space-y-24 pb-32">
            
            {/* Active Category Header Banner */}
            <div className="space-y-4 max-w-3xl pb-8 border-b border-zinc-800/60">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-400">
                Architectural Taxonomy · {selectedCategory.toUpperCase()}
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-display text-white tracking-tight">
                {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.headline || 'Curated Spaces'}
              </h1>
              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-xl">
                {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.description}
              </p>
            </div>

            {/* SPLIT LAYOUT SPATIAL TOUR */}
            <div className="space-y-32">
              {Object.entries(groupedPhotos).map(([spatialCat, photosInCat]) => {
                 const firstPhoto = photosInCat[0];
                 const isCommon = photosInCat.some(p => p.tier === 'common') && selectedCategory !== 'common';
                 
                 return (
                   <div key={spatialCat} className="flex flex-col lg:flex-row gap-8 lg:gap-16">
                     {/* LEFT COLUMN: Context & Description (Sticky) */}
                     <div className="w-full lg:w-1/3">
                        <div className="sticky top-12 space-y-4">
                           <div className="flex items-center gap-3">
                             {isCommon && (
                               <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest border border-amber-500/20">
                                 Shared Amenity
                               </span>
                             )}
                             <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                               {SPATIAL_LABELS[spatialCat] || spatialCat}
                             </h2>
                           </div>
                           
                           {(firstPhoto.description || firstPhoto.specs) ? (
                             <div className="space-y-3 pt-2">
                               {firstPhoto.description && (
                                 <p className="text-zinc-400 text-sm leading-relaxed">{firstPhoto.description}</p>
                               )}
                               {firstPhoto.specs && (
                                 <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest border-l-2 border-amber-500/50 pl-3">
                                   {firstPhoto.specs}
                                 </p>
                               )}
                             </div>
                           ) : (
                             <p className="text-zinc-500 text-sm leading-relaxed">
                               Experience the meticulously crafted details and architectural harmony of this space.
                             </p>
                           )}
                        </div>
                     </div>
                     
                     {/* RIGHT COLUMN: Media Grid */}
                     <div className="w-full lg:w-2/3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {photosInCat.map((photo, idx) => {
                             const absoluteIndex = filteredPhotos.findIndex(p => p.id === photo.id);
                             const isLarge = idx === 0 && photosInCat.length % 2 !== 0; // If odd number, first photo spans full
                             return (
                               <div 
                                 key={photo.id}
                                 onClick={() => openLightboxAt(absoluteIndex)}
                                 className={`${isLarge ? 'md:col-span-2' : ''} group relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 hover:border-amber-400/50 transition-all duration-500 cursor-pointer shadow-lg hover:shadow-2xl`}
                               >
                                  <div className={`relative ${isLarge ? 'h-[400px] md:h-[500px]' : 'h-[300px] md:h-[380px]'}`}>
                                     <OptimizedImage
                                       src={photo.url}
                                       aspectRatio={isLarge ? "16:9" : "3:4"}
                                       className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                                       alt={photo.title}
                                     />
                                     <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                     </div>
                   </div>
                 );
              })}
            </div>

          </div>
        </main>
"""

new_lines = lines[:412] + [new_main] + lines[500:]

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.writelines(new_lines)
print("Patched SanctuaryGalleryModal main block")
