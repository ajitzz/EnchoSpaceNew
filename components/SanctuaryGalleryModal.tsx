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

export type GalleryCategoryKey = 
  | 'all'
  | 'living_room'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'garden'
  | 'exterior'
  | 'pool'
  | 'details';

interface CategoryConfig {
  key: GalleryCategoryKey;
  label: string;
  shortLabel: string;
  icon: string;
  headline: string;
  description: string;
}

export const GALLERY_CATEGORIES: CategoryConfig[] = [
  {
    key: 'all',
    label: 'All Spaces',
    shortLabel: 'All',
    icon: '✨',
    headline: 'Complete Sanctuary Panorama',
    description: 'A curated visual journey through every architectural zone, living space, and tranquil outdoor sanctuary.'
  },
  {
    key: 'living_room',
    label: 'Grand Living Salon',
    shortLabel: 'Living Room',
    icon: '🏛️',
    headline: '01 · Grand Living Salon & Glass Atrium',
    description: 'Double-height acoustic glazing framing natural ridge views, sunken fireside lounges, and warm 2700K ambient architectural illumination.'
  },
  {
    key: 'dining',
    label: 'Dining & Kitchen',
    shortLabel: 'Dining Area',
    icon: '🍽️',
    headline: '02 · Epicurean Dining & Private Chef Alcove',
    description: 'Custom live-edge walnut dining table, professional culinary suite with induction cooktops, and twilight pendant fixtures for intimate gatherings.'
  },
  {
    key: 'bedroom',
    label: 'Master Suites',
    shortLabel: 'Bedrooms',
    icon: '🛏️',
    headline: '03 · Master Sanctuary & Panoramic Suites',
    description: 'Organic Belgian linen bedding, private sunrise balconies, acoustically isolated timber walls, and seamless integrated wardrobe suites.'
  },
  {
    key: 'bathroom',
    label: 'Spa Bathrooms',
    shortLabel: 'Full Bathroom',
    icon: '🚿',
    headline: '04 · Spa Oasis & En-Suite Bathrooms',
    description: 'Hand-carved freestanding stone soaking tubs, dual rainforest showers, heated Italian travertine tiles, and organic botanical amenities.'
  },
  {
    key: 'garden',
    label: 'Private Garden',
    shortLabel: 'Back Garden',
    icon: '🌿',
    headline: '05 · Private Courtyard & Zen Back Garden',
    description: 'Lush indigenous flora, secluded stone meditation pathways, twilight firebowls, and sheltered open-air reading daybeds.'
  },
  {
    key: 'exterior',
    label: 'Exterior Grounds',
    shortLabel: 'Exterior',
    icon: '🏰',
    headline: '06 · Architectural Facade & Sanctuary Grounds',
    description: 'Monolithic organic silhouettes nestled harmoniously into the topography, with sweeping horizon vistas and private gated driveways.'
  },
  {
    key: 'pool',
    label: 'Infinity Pool',
    shortLabel: 'Pool & Deck',
    icon: '🏊',
    headline: '07 · Horizon Infinity Pool & Sunset Deck',
    description: 'Temperature-regulated mineral infinity waters seamlessly meeting the skyline, flanked by cantilevered teak sunbeds and dusk fire lanterns.'
  },
  {
    key: 'details',
    label: 'Atmosphere & Art',
    shortLabel: 'Details',
    icon: '🎨',
    headline: '08 · Curated Atmospheric & Design Vignettes',
    description: 'Tactile natural textures, bespoke bronze sculptures, artisanal ceramics, and subtle lighting choreography throughout the residence.'
  }
];

/**
 * Intelligent Fallback Classifier:
 * Transforms raw image URLs into an award-winning architectural gallery schema
 * with rich contextual titles, descriptions, lighting time, and spatial specs.
 */
export function classifyListingPhotos(listing: Listing): SpatialPhoto[] {
  if (listing.photos && listing.photos.length > 0) {
    return listing.photos;
  }

  const rawUrls: string[] = [];
  if (listing.imageUrl) rawUrls.push(listing.imageUrl);
  if (listing.imageUrls && Array.isArray(listing.imageUrls)) {
    listing.imageUrls.forEach(url => {
      if (url && !rawUrls.includes(url)) rawUrls.push(url);
    });
  }

  // Curated fallback architectural story sequence
  const categorySequence: {
    category: SpatialPhoto['category'];
    title: string;
    description: string;
    specs: string;
    lightingTime: string;
  }[] = [
    {
      category: 'exterior',
      title: 'Architectural Arrival & Sanctuary Facade',
      description: 'Monolithic clean lines and natural timber louvers framing the dramatic landscape entry.',
      specs: 'Gated Private Compound · Mountain Ridge View',
      lightingTime: 'Golden Hour · 6:15 PM'
    },
    {
      category: 'living_room',
      title: 'Double-Height Atrium Living Salon',
      description: 'Sunken conversation pit with floor-to-ceiling glass doors opening directly to the cantilevered terrace.',
      specs: '1,250 sqft · Italian Travertine · Bang & Olufsen Sound',
      lightingTime: 'Afternoon Sunlight · 3:30 PM'
    },
    {
      category: 'pool',
      title: 'Heated Mineral Horizon Pool & Sun Deck',
      description: 'Zero-edge pool suspended over the valley with integrated submerged daybeds and ambient starlight fiber optics.',
      specs: '50ft Length · Heated Mineral Water · Teak Decking',
      lightingTime: 'Twilight Dusk · 6:45 PM'
    },
    {
      category: 'bedroom',
      title: 'Presidential Master Suite & Sunrise Terrace',
      description: 'King-sized organic plush mattress dressed in Italian sateen linens with direct eastern sunrise exposure.',
      specs: '680 sqft · King Bed · Acoustically Isolated Walls',
      lightingTime: 'Morning Glow · 7:00 AM'
    },
    {
      category: 'bathroom',
      title: 'Spa En-Suite with Monolithic Stone Tub',
      description: 'Freestanding volcanic stone soak tub overlooking private bamboo courtyard with rainfall shower enclave.',
      specs: 'Heated Marble Floors · Rainfall Shower · Aesop Botanicals',
      lightingTime: 'Diffused Daylight · 11:00 AM'
    },
    {
      category: 'dining',
      title: 'Epicurean Dining Room & Wine Showcase',
      description: 'Handcrafted live-edge walnut table seating ten, complemented by a temperature-controlled vintage cellar vault.',
      specs: 'Seating for 10 · Custom Brass Chandelier',
      lightingTime: 'Evening Dinner · 8:00 PM'
    },
    {
      category: 'garden',
      title: 'Zen Courtyard & Midnight Firepit',
      description: 'Secluded gravel meditation garden surrounded by mature Japanese maples and a sunken basalt firebowl.',
      specs: 'Private Zen Enclave · Gas Firepit · Ambient Starlight',
      lightingTime: 'Starry Night · 9:30 PM'
    },
    {
      category: 'details',
      title: 'Artisanal Ceramics & Warm Ambient Accents',
      description: 'Bespoke hand-thrown earthenware, textured linen drapery, and calibrated 2700K recessed lighting.',
      specs: 'Curated Local Artwork · Architectural Luminescence',
      lightingTime: 'Soft Twilight · 7:15 PM'
    }
  ];

  return rawUrls.map((url, idx) => {
    const template = categorySequence[idx % categorySequence.length];
    return {
      id: `${listing.id}-spatial-photo-${idx}`,
      url,
      category: template.category,
      categoryLabel: GALLERY_CATEGORIES.find(c => c.key === template.category)?.label,
      title: idx < categorySequence.length ? template.title : `${template.title} (Perspective ${Math.floor(idx / categorySequence.length) + 1})`,
      description: template.description,
      specs: template.specs,
      lightingTime: template.lightingTime,
      isHero: idx === 0
    };
  });
}

export const SanctuaryGalleryModal: React.FC<SanctuaryGalleryModalProps> = ({
  isOpen,
  onClose,
  listing,
  initialIndex = 0,
  initialCategory = 'all',
  onReserve
}) => {
  const [selectedCategory, setSelectedCategory] = useState<GalleryCategoryKey>(initialCategory as GalleryCategoryKey);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewMode, setViewMode] = useState<'bento' | 'cinematic'>('bento');
  const [isStoryDrawerOpen, setIsStoryDrawerOpen] = useState(true);

  // Classify and curate photos
  const allPhotos = useMemo(() => classifyListingPhotos(listing), [listing]);

  // Filtered photos for active tab
  const filteredPhotos = useMemo(() => {
    if (selectedCategory === 'all') return allPhotos;
    return allPhotos.filter(p => p.category === selectedCategory);
  }, [allPhotos, selectedCategory]);

  // Category counts map
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allPhotos.length };
    allPhotos.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [allPhotos]);

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 lg:p-12 scrollbar-thin scrollbar-thumb-zinc-800">
          <div className="max-w-7xl mx-auto space-y-12">
            {/* Active Category Header Banner */}
            <div className="space-y-2 max-w-3xl">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-400">
                Architectural Taxonomy · {selectedCategory.toUpperCase()}
              </span>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold font-display text-white tracking-tight">
                {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.headline || 'Curated Spaces'}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {GALLERY_CATEGORIES.find(c => c.key === selectedCategory)?.description}
              </p>
            </div>

            {/* Asymmetrical Bento Gallery Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-6">
              {filteredPhotos.map((photo, index) => {
                // Determine responsive bento column span for iF award magazine rhythm
                const isLargeHero = index % 5 === 0;
                const isMediumTile = index % 5 === 1 || index % 5 === 2;
                const colSpan = isLargeHero ? 'lg:col-span-8' : isMediumTile ? 'lg:col-span-4' : 'lg:col-span-6';
                const heightClass = isLargeHero ? 'h-[380px] sm:h-[480px]' : 'h-[300px] sm:h-[360px]';

                return (
                  <motion.div
                    key={photo.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    onClick={() => openLightboxAt(index)}
                    className={`${colSpan} ${heightClass} group relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800/80 hover:border-amber-400/50 transition-all duration-500 shadow-lg hover:shadow-2xl hover:shadow-amber-500/5 cursor-pointer`}
                  >
                    {/* High-Resolution Image */}
                    <OptimizedImage
                      src={photo.url}
                      aspectRatio="16:9"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      alt={photo.title}
                    />

                    {/* Gradient Protection Overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity duration-300" />

                    {/* Top Lighting & Zone Pill */}
                    <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-amber-300 border border-white/10">
                        {photo.categoryLabel || photo.category}
                      </span>
                      {photo.lightingTime && (
                        <span className="text-[10px] font-mono text-zinc-300 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span>{photo.lightingTime}</span>
                        </span>
                      )}
                    </div>

                    {/* Bottom Architectural Story Drawer */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-10 flex flex-col justify-end space-y-1.5">
                      <div className="flex items-center justify-between w-full">
                        <h3 className="text-base sm:text-lg font-bold font-display text-white group-hover:text-amber-300 transition-colors tracking-tight line-clamp-1">
                          {photo.title}
                        </h3>
                        <div className="p-2 rounded-full bg-white/10 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-all duration-300 shrink-0">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">
                        {photo.description}
                      </p>

                      {photo.specs && (
                        <div className="flex items-center gap-2 pt-1">
                          <Compass className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="text-[10px] font-mono text-zinc-400 truncate">
                            {photo.specs}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
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
