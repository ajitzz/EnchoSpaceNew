import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, 
  Sparkles, Share2, Compass, Sun, Info, Check, Eye, Grid, Film
} from 'lucide-react';
import { Listing, SpatialPhoto } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { uiAudio } from './audio';

export interface SanctuaryGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  initialIndex?: number;
  initialCategory?: string;
  onReserve?: () => void;
}

export type GalleryCategoryKey = string;

interface CategoryConfig {
  key: GalleryCategoryKey;
  label: string;
  shortLabel: string;
  icon: string;
  headline: string;
  description: string;
}

// ADR-005: Gallery tabs are now driven by host-defined room names from listing.rooms[]
export function buildGalleryCategories(listing: Listing): CategoryConfig[] {
  const categories: CategoryConfig[] = [
    {
      key: 'all',
      label: 'All Spaces',
      shortLabel: 'All',
      icon: '✨',
      headline: listing.title || 'Complete Property Panorama',
      description: (listing.description || '').substring(0, 120) || 'A curated visual journey through every space.'
    },
    {
      key: 'common',
      label: 'Property & Amenities',
      shortLabel: 'Amenities',
      icon: '🏗️',
      headline: 'Sanctuary Grounds & Shared Spaces',
      description: 'Pool, gardens, restaurant, lobby, and property-wide amenities.'
    }
  ];
  
  // Add a tab per host-defined room type
  if (listing.rooms && (listing.rooms as any[]).length > 0) {
    (listing.rooms as any[]).forEach((room: any) => {
      const tierKey = room.type || `room_${room.name?.replace(/\s+/g, '_').toLowerCase()}`;
      categories.push({
        key: tierKey,
        label: room.name || tierKey,
        shortLabel: room.name ? (room.name.length > 12 ? room.name.substring(0, 11) + '…' : room.name) : tierKey,
        icon: room.icon || '🛏️',
        headline: room.name || tierKey,
        description: room.description || room.specs || `Explore the ${room.name || tierKey}.`
      });
    });
  } else {
    // Legacy fallback for listings without room config
    categories.push(
      { key: 'suites', label: 'Presidential Suites', shortLabel: 'Suites', icon: '👑', headline: 'Presidential Panorama Suites', description: 'Flagship luxury accommodations.' },
      { key: 'deluxe', label: 'Deluxe Rooms', shortLabel: 'Deluxe', icon: '🛏️', headline: 'Deluxe Garden Sanctuaries', description: 'Spacious comfort with garden access.' },
      { key: 'executive', label: 'Executive Studios', shortLabel: 'Executive', icon: '💻', headline: 'Executive Work Enclaves', description: 'Ergonomic productivity spaces.' }
    );
  }
  return categories;
}

// Keep GALLERY_CATEGORIES as static export for any backward-compat usage:
export const GALLERY_CATEGORIES = buildGalleryCategories({ rooms: [] } as any);


/**
 * Intelligent Fallback Classifier:
 * Transforms raw image URLs into an award-winning architectural gallery schema
 * with rich contextual titles, descriptions, lighting time, and spatial specs.
 */
export function classifyListingPhotos(listing: Listing): SpatialPhoto[] {
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
}

export const SanctuaryGalleryModal: React.FC<SanctuaryGalleryModalProps> = ({
  isOpen,
  onClose,
  listing,
  initialIndex = 0,
  initialCategory = 'all',
  onReserve
}) => {
  const galleryCategories = useMemo(() => buildGalleryCategories(listing), [listing]);
  const [selectedCategory, setSelectedCategory] = useState<GalleryCategoryKey>(initialCategory as GalleryCategoryKey);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewMode, setViewMode] = useState<'bento' | 'cinematic'>('bento');
  const [isStoryDrawerOpen, setIsStoryDrawerOpen] = useState(true);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialCategory) setSelectedCategory(initialCategory as GalleryCategoryKey);
      if (initialIndex !== undefined) setLightboxIndex(initialIndex);
    }
  }, [isOpen, initialCategory, initialIndex]);

  // Classify and curate photos
  const allPhotos = useMemo(() => classifyListingPhotos(listing), [listing]);

  // Filtered photos for active tab: Room photos strictly at the top!
  const filteredPhotos = useMemo(() => {
    if (selectedCategory === 'all') {
      const roomPhotos = allPhotos.filter(p => p.tier !== 'common');
      const commonPhotos = allPhotos.filter(p => p.tier === 'common');
      return [...roomPhotos, ...commonPhotos];
    }
    if (selectedCategory === 'common') {
      return allPhotos.filter(p => p.tier === 'common');
    }
    // For a specific room tier: 100% room photos first, common grounds photos only appended at the bottom
    const roomPhotos = allPhotos.filter(p => p.tier === selectedCategory);
    const commonPhotos = allPhotos.filter(p => p.tier === 'common');
    return roomPhotos.length > 0 ? [...roomPhotos, ...commonPhotos] : commonPhotos;
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
  };

  // Category counts map (by Tier)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allPhotos.length };
    allPhotos.forEach(p => {
      counts[p.tier] = (counts[p.tier] || 0) + 1;
    });
    // Add common photos to each non-common tier count
    const commonCount = counts['common'] || 0;
    galleryCategories.forEach(cat => {
      if (cat.key !== 'all' && cat.key !== 'common') {
        counts[cat.key] = (counts[cat.key] || 0) + commonCount;
      }
    });
    return counts;
  }, [allPhotos, galleryCategories]);

  // Handle open lightbox
  const openLightboxAt = useCallback((indexInFiltered: number) => {
    uiAudio.playClick();
    setLightboxIndex(indexInFiltered);
    setIsZoomed(false);
    setZoomScale(1);
  }, []);

  // Keyboard navigation & lock scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxIndex !== null) {
          setLightboxIndex(null);
        } else {
          onClose();
        }
      } else if (lightboxIndex !== null) {
        if (e.key === 'ArrowRight') {
          uiAudio.playClick();
          setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length);
          setIsZoomed(false);
          setZoomScale(1);
        } else if (e.key === 'ArrowLeft') {
          uiAudio.playClick();
          setLightboxIndex((lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length);
          setIsZoomed(false);
          setZoomScale(1);
        } else if (e.key.toLowerCase() === 'z') {
          setIsZoomed(prev => !prev);
          setZoomScale(prev => (prev === 1 ? 1.75 : 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, lightboxIndex, filteredPhotos.length, onClose]);

  const handleShare = () => {
    uiAudio.playClick();
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const currentPhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col overflow-hidden font-sans"
      >
        {/* ========================================================================= */}
        {/* TOP FLOATING ARCHITECTURAL COMMAND BAR                                     */}
        {/* ========================================================================= */}
        <header className="h-18 px-4 sm:px-8 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-2xl flex items-center justify-between z-40 shrink-0">
          {/* Left: Sanctuary Title & Category Info */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                uiAudio.playClick();
                onClose();
              }}
              className="p-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all active:scale-90 cursor-pointer flex items-center gap-2 text-xs font-mono uppercase tracking-wider"
              title="Close Gallery (ESC)"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Close (ESC)</span>
            </button>

            <div className="h-6 w-[1px] bg-zinc-800 hidden sm:block" />

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                  Encho Spatial Gallery
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">·</span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {allPhotos.length} Curated Perspectives
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold font-display text-white tracking-tight truncate max-w-[200px] sm:max-w-md">
                {listing.title}
              </h2>
            </div>
          </div>

          {/* Right: Actions (Share, View Switcher, Reserve CTA) */}
          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="hidden md:flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setViewMode('bento');
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold font-display transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'bento' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Editorial Grid</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setViewMode('cinematic');
                  if (lightboxIndex === null) setLightboxIndex(0);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold font-display transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'cinematic' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Cinematic</span>
              </button>
            </div>

            {/* Share Button */}
            <button
              type="button"
              onClick={handleShare}
              className="p-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all active:scale-90 cursor-pointer"
              title="Copy Gallery Link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>

            {/* Quick Reserve CTA */}
            {onReserve && (
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  onClose();
                  onReserve();
                }}
                className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-black font-display text-xs px-4 sm:px-5 py-2.5 rounded-full transition-all active:scale-95 shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>RESERVE SANCTUARY</span>
              </button>
            )}
          </div>
        </header>

        {/* ========================================================================= */}
        {/* HORIZONTAL SPATIAL CATEGORY TAXONOMY BAR                                   */}
        {/* ========================================================================= */}
        <nav className="px-4 sm:px-8 py-3 bg-zinc-950/60 backdrop-blur-md border-b border-zinc-900/80 overflow-x-auto scrollbar-hide z-30 shrink-0">
          <div className="flex items-center gap-2 min-w-max mx-auto max-w-7xl">
            {galleryCategories.map(cat => {
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
                  className={`px-3.5 py-1.5 rounded-full text-xs font-display font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-amber-400/10 text-amber-300 border-amber-400/40 shadow-sm shadow-amber-400/10'
                      : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-amber-400/20 text-amber-200' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ========================================================================= */}
        {/* MAIN BODY: EDITORIAL BENTO FEED                                            */}
        {/* ========================================================================= */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 lg:p-12 scrollbar-thin scrollbar-thumb-zinc-800 bg-[#050505]">
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
                  {galleryCategories.find(c => c.key === selectedCategory)?.headline || 'Curated Spaces'}
                </h1>
                <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl font-light">
                  {galleryCategories.find(c => c.key === selectedCategory)?.description}
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
        </main>

        {/* ========================================================================= */}
        {/* CINEMATIC LIGHTBOX & ARCHITECTURAL DOSSIER MODAL                           */}
        {/* ========================================================================= */}
        {lightboxIndex !== null && currentPhoto && (
          <div
            className="fixed inset-0 z-[120] bg-zinc-950/98 backdrop-blur-3xl flex flex-col justify-between overflow-hidden animate-fade-in"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Lightbox Top Command Header */}
            <div className="h-16 px-4 sm:px-8 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between text-white z-20 shrink-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
                  {lightboxIndex + 1} / {filteredPhotos.length}
                </span>
                <span className="text-zinc-600 font-mono">|</span>
                <span className="text-sm font-bold font-display text-zinc-200 truncate max-w-[200px] sm:max-w-md">
                  {currentPhoto.title}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle Zoom */}
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setIsZoomed(prev => !prev);
                    setZoomScale(prev => (prev === 1 ? 1.75 : 1));
                  }}
                  className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                  title="Toggle Zoom (Z)"
                >
                  {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                </button>

                {/* Toggle Story Drawer */}
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setIsStoryDrawerOpen(prev => !prev);
                  }}
                  className={`p-2 rounded-full border transition-all cursor-pointer ${
                    isStoryDrawerOpen ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                  }`}
                  title="Toggle Architectural Dossier"
                >
                  <Info className="w-4 h-4" />
                </button>

                {/* Close Lightbox */}
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setLightboxIndex(null);
                  }}
                  className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                  title="Close Lightbox (ESC)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Stage (Photo on Left, Architectural Dossier on Right) */}
            <div className="relative flex-1 flex flex-col lg:flex-row items-center justify-between overflow-hidden p-4 sm:p-6 gap-6 z-10" onClick={(e) => e.stopPropagation()}>
              {/* Previous Paddle */}
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setLightboxIndex((lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length);
                  setIsZoomed(false);
                  setZoomScale(1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-xl border border-white/20 transition-all cursor-pointer z-30 active:scale-90"
                title="Previous Photo (←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Center Canvas */}
              <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
                <motion.div
                  key={currentPhoto.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: isZoomed ? zoomScale : 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="max-h-[70vh] sm:max-h-[78vh] max-w-full flex items-center justify-center"
                >
                  <img
                    src={currentPhoto.url}
                    className="max-h-[70vh] sm:max-h-[78vh] max-w-full object-contain rounded-2xl shadow-2xl border border-zinc-800/80"
                    alt={currentPhoto.title}
                  />
                </motion.div>
              </div>

              {/* Next Paddle */}
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length);
                  setIsZoomed(false);
                  setZoomScale(1);
                }}
                className="absolute right-4 lg:right-[340px] top-1/2 -translate-y-1/2 p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-xl border border-white/20 transition-all cursor-pointer z-30 active:scale-90"
                title="Next Photo (→)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Right Side: Architectural Story Dossier Drawer */}
              {isStoryDrawerOpen && (
                <motion.aside
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  className="w-full lg:w-80 bg-zinc-900/90 backdrop-blur-2xl p-6 rounded-3xl border border-zinc-800/80 flex flex-col justify-between space-y-4 shrink-0 shadow-2xl z-20"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        {currentPhoto.categoryLabel || currentPhoto.category}
                      </span>
                      {currentPhoto.lightingTime && (
                        <span className="text-[10px] font-mono text-zinc-400">
                          {currentPhoto.lightingTime}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg font-bold font-display text-white leading-snug">
                      {currentPhoto.title}
                    </h4>

                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                      {currentPhoto.description}
                    </p>

                    {currentPhoto.specs && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                          Spatial Specs & Materiality
                        </span>
                        <p className="text-xs font-mono text-amber-200/90 font-medium">
                          {currentPhoto.specs}
                        </p>
                      </div>
                    )}
                  </div>

                  {onReserve && (
                    <div className="pt-3 border-t border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(null);
                          onClose();
                          onReserve();
                        }}
                        className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black font-display text-xs py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>RESERVE FROM THIS VIEW ↗</span>
                      </button>
                    </div>
                  )}
                </motion.aside>
              )}
            </div>

            {/* Bottom Scrubber Filmstrip */}
            <div className="px-4 sm:px-8 py-3 bg-zinc-950/90 border-t border-zinc-900 flex justify-center gap-2 overflow-x-auto scrollbar-hide z-20 shrink-0" onClick={(e) => e.stopPropagation()}>
              {filteredPhotos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setLightboxIndex(i);
                    setIsZoomed(false);
                    setZoomScale(1);
                  }}
                  className={`w-14 sm:w-16 h-12 sm:h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 relative ${
                    lightboxIndex === i ? 'border-amber-400 scale-105 shadow-md shadow-amber-400/20' : 'border-transparent opacity-40 hover:opacity-100'
                  }`}
                >
                  <img src={photo.url} className="w-full h-full object-cover" alt={photo.title} />
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
