import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

# Replace the RIGHT COLUMN inside the spatial tour
old_tour_right = r"\{/\* RIGHT COLUMN: Awwwards-Level Asymmetrical Grid \*/\}[\s\S]*?\{/\* CINEMATIC FULL-SCREEN VIEW \*/\}"

new_tour_right = """{/* RIGHT COLUMN: Award-Winning Geometric Spatial Collage */}
                       <div className="w-full lg:w-2/3">
                          {(() => {
                            const count = photosInCat.length;

                            // Helper for rendering an interactive high-end photo tile
                            const renderTile = (
                              photo: SpatialPhoto, 
                              aspect: "16:9" | "4:3" | "1:1" | "9:16", 
                              className: string, 
                              badge?: string,
                              extraOverlay?: React.ReactNode
                            ) => {
                              const absoluteIndex = filteredPhotos.findIndex(p => p.id === photo.id);
                              return (
                                <motion.div
                                  key={photo.id}
                                  initial={{ opacity: 0, y: 30, scale: 0.97 }}
                                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                  viewport={{ once: true, margin: "-10%" }}
                                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                  onClick={() => openLightboxAt(absoluteIndex)}
                                  className={`group relative overflow-hidden rounded-2xl md:rounded-3xl bg-zinc-900/90 border border-white/10 hover:border-amber-400/50 shadow-2xl cursor-pointer will-change-transform ${className}`}
                                >
                                  <div className="absolute inset-0 w-full h-full">
                                    <OptimizedImage
                                      src={photo.url}
                                      aspectRatio={aspect}
                                      className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                                      alt={photo.title || 'Architectural View'}
                                    />
                                    
                                    {/* Ambient Lighting Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-50 group-hover:opacity-30 transition-opacity duration-700" />
                                    
                                    {/* Top Micro Badges */}
                                    <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                                      <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest bg-black/60 backdrop-blur-md text-zinc-300 border border-white/10">
                                        {badge || (photo.isHero ? 'Master Perspective' : '4K UHD')}
                                      </span>
                                      {photo.lightingTime && (
                                        <span className="px-2.5 py-1 rounded-full text-[9px] font-mono text-amber-300 bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1">
                                          <Sun className="w-2.5 h-2.5" />
                                          {photo.lightingTime}
                                        </span>
                                      )}
                                    </div>

                                    {/* Hover Reveal Details & CTA */}
                                    <div className="absolute bottom-4 left-4 right-4 text-white translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out flex items-center justify-between z-10">
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <div className="h-[1px] w-4 bg-amber-400"></div>
                                          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400">Enlarge View</span>
                                        </div>
                                        {photo.title && (
                                          <div className="text-xs sm:text-sm font-display font-medium text-zinc-100 line-clamp-1">
                                            {photo.title}
                                          </div>
                                        )}
                                      </div>
                                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform">
                                        <ZoomIn className="w-4 h-4" />
                                      </div>
                                    </div>

                                    {extraOverlay}
                                  </div>
                                </motion.div>
                              );
                            };

                            // COLLAGE TEMPLATE 1: Single Panoramic Masterpiece
                            if (count === 1) {
                              return (
                                <div className="w-full">
                                  {renderTile(photosInCat[0], "16:9", "h-[340px] sm:h-[480px] lg:h-[600px] w-full", "Hero Composition")}
                                </div>
                              );
                            }

                            // COLLAGE TEMPLATE 2: Architectural Diptych (2 Photos)
                            if (count === 2) {
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
                                  {renderTile(photosInCat[0], "4:3", "h-[280px] sm:h-[400px] lg:h-[500px]", "Primary View")}
                                  {renderTile(photosInCat[1], "4:3", "h-[280px] sm:h-[400px] lg:h-[500px]", "Detail View")}
                                </div>
                              );
                            }

                            // COLLAGE TEMPLATE 3: Asymmetric Triptych (3 Photos)
                            if (count === 3) {
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 w-full">
                                  <div className="sm:col-span-7">
                                    {renderTile(photosInCat[0], "4:3", "h-[300px] sm:h-full min-h-[300px] sm:min-h-[460px]", "Anchor View")}
                                  </div>
                                  <div className="sm:col-span-5 grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-4">
                                    {renderTile(photosInCat[1], "4:3", "h-[160px] sm:h-[222px]", "Spatial Context")}
                                    {renderTile(photosInCat[2], "4:3", "h-[160px] sm:h-[222px]", "Architectural Craft")}
                                  </div>
                                </div>
                              );
                            }

                            // COLLAGE TEMPLATE 4: Quad Matrix (4 Photos)
                            if (count === 4) {
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
                                  {photosInCat.map((photo, i) => (
                                    renderTile(photo, "4:3", "h-[220px] sm:h-[300px] lg:h-[340px]", `Angle 0${i + 1}`)
                                  ))}
                                </div>
                              );
                            }

                            // COLLAGE TEMPLATE 5+: The Iconic 5-Piece Sanctuary Collage
                            const primaryPhoto = photosInCat[0];
                            const secondaryPhotos = photosInCat.slice(1, 5);
                            const remainingCount = photosInCat.length - 5;

                            return (
                              <div className="space-y-3 sm:space-y-4 w-full">
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 w-full">
                                  {/* Left Dominant Anchor Hero (7 cols) */}
                                  <div className="sm:col-span-7">
                                    {renderTile(primaryPhoto, "4:3", "h-[320px] sm:h-full min-h-[320px] sm:min-h-[500px]", "Panoramic Focal")}
                                  </div>

                                  {/* Right 2x2 Grid (5 cols) */}
                                  <div className="sm:col-span-5 grid grid-cols-2 gap-3 sm:gap-4">
                                    {secondaryPhotos.map((photo, i) => {
                                      const isLastCell = i === 3 && remainingCount > 0;
                                      const overlay = isLastCell ? (
                                        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20 transition-colors group-hover:bg-black/60">
                                          <span className="text-xl sm:text-2xl font-bold font-display tracking-tight text-amber-300">
                                            +{remainingCount}
                                          </span>
                                          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-300 mt-1">
                                            More Angles
                                          </span>
                                        </div>
                                      ) : undefined;

                                      return renderTile(
                                        photo, 
                                        "1:1", 
                                        "h-[150px] sm:h-[240px]", 
                                        `Detail 0${i + 1}`,
                                        overlay
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Flow-through for 6+ Photos when host provided extensive gallery */}
                                {photosInCat.length > 5 && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-2">
                                    {photosInCat.slice(5).map((photo, i) => (
                                      renderTile(photo, "4:3", "h-[180px] sm:h-[240px]", `Extended 0${i + 6}`)
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                       </div>
                     </motion.div>
                   );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* CINEMATIC FULL-SCREEN VIEW */}"""

content = re.sub(old_tour_right, new_tour_right, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Updated SanctuaryGalleryModal with Perfect Geometric Spatial Collages!")
