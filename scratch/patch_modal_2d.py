import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

# 1. Update classifyListingPhotos
new_classify = """export function classifyListingPhotos(listing: Listing): SpatialPhoto[] {
  const result: SpatialPhoto[] = [];
  
  if (listing.photos && listing.photos.length > 0) {
    listing.photos.forEach((photo: any, idx: number) => {
       result.push({
         ...photo,
         tier: photo.tier || 'common',
         category: photo.category || 'other',
       });
    });
    return result;
  }

  // Fallback if no structured photos
  const rawUrls: string[] = [];
  if (listing.imageUrl) rawUrls.push(listing.imageUrl);
  if (listing.imageUrls && Array.isArray(listing.imageUrls)) {
    listing.imageUrls.forEach(url => {
      if (url && !rawUrls.includes(url)) rawUrls.push(url);
    });
  }

  const fallbacks: { tier: any; category: any; title: string; desc: string; }[] = [
    { tier: 'common', category: 'exterior', title: 'Architectural Facade', desc: 'Monolithic clean lines framing the landscape.' },
    { tier: 'common', category: 'pool', title: 'Infinity Horizon Pool', desc: 'Heated mineral waters suspended over the valley.' },
    { tier: 'suites', category: 'bedroom', title: 'Presidential Master Suite', desc: 'King-sized organic plush mattress.' },
    { tier: 'suites', category: 'bathroom', title: 'Spa En-Suite', desc: 'Freestanding volcanic stone soak tub.' },
    { tier: 'deluxe', category: 'bedroom', title: 'Deluxe Garden Room', desc: 'Private bamboo courtyard access.' },
    { tier: 'executive', category: 'living_room', title: 'Executive Studio', desc: 'Ergonomic architectural workstation.' }
  ];

  rawUrls.forEach((url, idx) => {
    const template = fallbacks[idx % fallbacks.length];
    result.push({
      id: `fallback-photo-${idx}`,
      url,
      tier: template.tier,
      category: template.category,
      categoryLabel: template.category,
      title: template.title,
      description: template.desc,
      specs: '',
      isHero: idx === 0
    });
  });

  return result;
}"""
content = re.sub(r'export function classifyListingPhotos[\s\S]*?return result;\n\}', new_classify, content)

# 2. Update filteredPhotos
new_filter = """  // Filtered photos for active tab (2D Matrix Injection)
  const filteredPhotos = useMemo(() => {
    if (selectedCategory === 'all') return allPhotos;
    // selectedCategory corresponds to the Tier
    return allPhotos.filter(p => p.tier === selectedCategory || (p.tier === 'common' && selectedCategory !== 'property' && selectedCategory !== 'common'));
  }, [allPhotos, selectedCategory]);

  // Group filtered photos by their Spatial Category for Bento Rendering
  const groupedPhotos = useMemo(() => {
    const groups: Record<string, SpatialPhoto[]> = {};
    filteredPhotos.forEach(p => {
      const cat = p.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  }, [filteredPhotos]);

  const SPATIAL_LABELS: Record<string, string> = {
    living_room: 'Living Room & Atrium',
    dining: 'Dining & Kitchen',
    bedroom: 'Bedrooms & Sleeping Quarters',
    bathroom: 'Bathrooms & Spa',
    garden: 'Gardens & Courtyards',
    exterior: 'Exterior Architecture',
    pool: 'Pool & Wellness',
    details: 'Curated Details',
    balcony: 'Balconies & Terraces',
    parking: 'Arrival & Parking',
    other: 'Spaces'
  };"""

content = re.sub(r"  // Filtered photos for active tab[\s\S]*?\}, \[allPhotos, selectedCategory\]\);", new_filter, content)

# 3. Update Category counts map to use tier
new_counts = """  // Category counts map (by Tier)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allPhotos.length };
    allPhotos.forEach(p => {
      counts[p.tier] = (counts[p.tier] || 0) + 1;
    });
    // Inject common count into others so badges match
    ['suites', 'deluxe', 'executive'].forEach(tier => {
       if (counts[tier]) {
         counts[tier] += (counts['common'] || 0) + (counts['property'] || 0);
       }
    });
    return counts;
  }, [allPhotos]);"""
content = re.sub(r"  // Category counts map[\s\S]*?\}, \[allPhotos\]\);", new_counts, content)

# 4. Update the Bento Grid rendering to render groups
old_bento = r"\{/\* BENTO GRID VIEW \*/\}[\s\S]*?\{/\* CINEMATIC FULL-SCREEN VIEW \*/\}"
new_bento = """{/* 2D MATRIX BENTO VIEW */}
          {viewMode === 'bento' && (
            <div className="flex-1 overflow-y-auto px-4 md:px-8 xl:px-12 pb-24 pt-6 space-y-12">
              {Object.entries(groupedPhotos).map(([spatialCat, photosInCat]) => (
                <div key={spatialCat} className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-neutral-800 pb-2">
                    <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">{SPATIAL_LABELS[spatialCat] || spatialCat}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4 auto-rows-[140px] md:auto-rows-[240px]">
                    {photosInCat.map((photo, idx) => {
                      const absoluteIndex = filteredPhotos.findIndex(p => p.id === photo.id);
                      return (
                        <div
                          key={photo.id}
                          className="group relative cursor-pointer overflow-hidden rounded-2xl bg-zinc-100 dark:bg-neutral-900 border border-zinc-200/50 dark:border-neutral-800 hover:shadow-2xl transition-all"
                          onClick={() => openLightboxAt(absoluteIndex)}
                        >
                          <OptimizedImage
                            src={photo.url}
                            alt={photo.title || 'Space'}
                            aspectRatio="16:9"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          
                          <div className="absolute bottom-4 left-4 right-4 text-white opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                             <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1">{photo.tier === 'common' ? 'Common Shared Space' : photo.tier}</div>
                             <div className="font-bold text-sm leading-tight line-clamp-1">{photo.title}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CINEMATIC FULL-SCREEN VIEW */}"""
content = re.sub(old_bento, new_bento, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Patched SanctuaryGalleryModal")
