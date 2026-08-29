import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

# We need to find the specific chunk where the RIGHT COLUMN is rendered.
# Currently it is:
#                     {/* RIGHT COLUMN: Media Grid */}
#                     <div className="w-full lg:w-2/3">
#                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
#                           {photosInCat.map((photo, idx) => {

old_grid = r"\{/\* RIGHT COLUMN: Media Grid \*/\}[\s\S]*?\{/\* CINEMATIC FULL-SCREEN VIEW \*/\}"

new_grid = """{/* RIGHT COLUMN: Awwwards-Level Asymmetrical Grid */}
                     <div className="w-full lg:w-2/3 mt-8 lg:mt-0">
                        <div className="grid grid-cols-12 gap-3 md:gap-4 lg:gap-5">
                           {photosInCat.map((photo, idx) => {
                             const absoluteIndex = filteredPhotos.findIndex(p => p.id === photo.id);
                             const total = photosInCat.length;
                             
                             // AWWWARDS-LEVEL BENTO LOGIC
                             let spanClass = "col-span-12";
                             let heightClass = "h-[300px] sm:h-[400px]";
                             let aspect: any = "16:9";

                             if (total === 1) {
                               spanClass = "col-span-12";
                               heightClass = "h-[350px] sm:h-[500px] lg:h-[650px]";
                             } else if (total === 2) {
                               spanClass = "col-span-12 sm:col-span-6";
                               heightClass = "h-[300px] sm:h-[450px] lg:h-[550px]";
                               aspect = "4:3";
                             } else if (total === 3) {
                               if (idx === 0) {
                                 spanClass = "col-span-12 sm:col-span-8";
                                 heightClass = "h-[350px] sm:h-[500px] lg:h-[600px]";
                               } else {
                                 spanClass = "col-span-6 sm:col-span-4";
                                 heightClass = "h-[170px] sm:h-[242px] lg:h-[290px]";
                                 aspect = "1:1";
                               }
                             } else {
                               // 4+ Photos: High-End Editorial Rhythm
                               const pattern = idx % 6;
                               if (pattern === 0) {
                                 spanClass = "col-span-12";
                                 heightClass = "h-[350px] sm:h-[450px] lg:h-[550px]";
                               } else if (pattern === 1 || pattern === 2) {
                                 spanClass = "col-span-6";
                                 heightClass = "h-[200px] sm:h-[300px] lg:h-[400px]";
                                 aspect = "4:3";
                               } else if (pattern === 3) {
                                 spanClass = "col-span-12 sm:col-span-7";
                                 heightClass = "h-[250px] sm:h-[350px] lg:h-[450px]";
                               } else if (pattern === 4 || pattern === 5) {
                                 // For 5, it will take 5, but wait, pattern 4 and 5 need to fit in remaining 5 cols? No, 12 cols grid.
                                 // 7 + 5 = 12
                                 spanClass = idx === 4 && total === 5 ? "col-span-12 sm:col-span-5" : (pattern === 4 ? "col-span-6 sm:col-span-5" : "col-span-6 sm:col-span-12"); 
                                 heightClass = "h-[250px] sm:h-[350px] lg:h-[450px]";
                               }
                             }

                             // Override for mobile specific Awwwards touch (first image always massive, next two split)
                             if (total > 3 && idx === 0) spanClass = "col-span-12";
                             if (total > 3 && (idx === 1 || idx === 2)) spanClass = "col-span-6 sm:col-span-6";

                             return (
                               <motion.div 
                                 key={photo.id}
                                 initial={{ opacity: 0, y: 30, scale: 0.95 }}
                                 whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                 viewport={{ once: true, margin: "-100px" }}
                                 transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
                                 onClick={() => openLightboxAt(absoluteIndex)}
                                 className={`${spanClass} ${heightClass} group relative rounded-3xl overflow-hidden bg-zinc-900 shadow-2xl cursor-pointer will-change-transform`}
                               >
                                  <div className="absolute inset-0 w-full h-full">
                                     <OptimizedImage
                                       src={photo.url}
                                       aspectRatio={aspect}
                                       className="w-full h-full object-cover group-hover:scale-[1.08] transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                                       alt={photo.title}
                                     />
                                     {/* Luxury Vignette Overlay */}
                                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-700" />
                                     
                                     {/* Hover Reveal Details */}
                                     <div className="absolute bottom-6 left-6 right-6 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                                       <div className="flex items-center gap-2 mb-2">
                                          <div className="h-[1px] w-6 bg-amber-400"></div>
                                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">Inspect View</span>
                                       </div>
                                       {photo.title && <h4 className="font-display text-lg font-bold line-clamp-1">{photo.title}</h4>}
                                     </div>
                                  </div>
                               </motion.div>
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

        {/* CINEMATIC FULL-SCREEN VIEW */}"""

content = re.sub(old_grid, new_grid, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Patched Awwwards Grid")
