import { useAuth } from './AuthContext';
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionTemplate, useMotionValueEvent } from 'framer-motion';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ListingErrorBoundary } from './ListingErrorBoundary';

export const getBrandTypography = (fontId?: string) => {
    switch (fontId) {
        case 'font-playfair': return { fontFamily: '"Playfair Display", serif', className: 'tracking-wider font-semibold' };
        case 'font-cormorant': return { fontFamily: '"Cormorant", serif', className: 'tracking-[0.15em] uppercase font-semibold' };
        case 'font-montserrat': return { fontFamily: '"Montserrat", sans-serif', className: 'tracking-[0.25em] uppercase font-medium' };
        default: return { fontFamily: 'var(--font-display)', className: 'tracking-[0.22em] uppercase font-medium' };
    }
};

export const getBrandColorStyle = (colorId?: string) => {
    switch (colorId) {
        case 'text-amber-800': return '#92400E';
        case 'text-teal-900': return '#134E4A';
        case 'text-rose-900': return '#881337';
        case 'text-blue-950': return '#172554';
        case 'text-zinc-900':
        default:
            return '#18181B';
    }
};

import { useListingTelemetry } from '../hooks/useListingTelemetry';
import { OptimizedImage } from './OptimizedImage';
import { CinematicVideoPlayer } from './CinematicVideoPlayer';
import { ChevronLeft, HeartIcon, ShieldCheck } from './Icons';
import {
  Share,
  Users,
  Eye,
  Image as ImageIcon,
  MessageCircle,
  MapPin,
  Star,
  Sparkles,
  Navigation,
  Calendar,
  CreditCard,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
  Check,
  ChevronRight,
  ArrowRight,
  Mail,
  Flame,
  Waves,
  Utensils,
  Wifi,
  Mountain,
  Wine,
  Award,
  Lock,
  Send,
  Loader2,
  Tag,
  Crown,
  Plus,
  Minus,
  Search,
  Bookmark,
  Share2,
  Compass,
  ArrowUpRight,
  Coffee,
  Sun,
  Moon,
  Dumbbell,
  Shield,
  Trees,
  Heart,
  Radio,
  Camera,
  Film,
  BookOpen,
  Wind,
  Anchor,
  Tent,
  Bed, Menu
} from 'lucide-react';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';
import { SanctuaryGalleryModal, GalleryCategoryKey, classifyListingPhotos } from './SanctuaryGalleryModal';
import { EnchoWordmark } from './EnchoWordmark';
import { getSensoryTagIcon } from './SensoryTagPicker';
import MuxPlayer from '@mux/mux-player-react';
import { ListingRoomGallery } from './ListingRoomGallery';

interface ListingDetailsNewProps {
  listing: Listing;
  onBack: () => void;
  onListingClick?: (listing: Listing) => void;
  similarListings?: Listing[];
  isFavorite?: boolean;
  onToggleFavorite?: (listing: Listing) => void;
  onBook?: (data: any) => void;
  onContactHost?: () => void;
  onRequestAuth?: () => void;
  initialGalleryOpen?: boolean;
  isPreview?: boolean;
}

// Legacy getTagIcon removed in favor of shared getSensoryTagIcon

const ListingDetailsNewContent: React.FC<ListingDetailsNewProps> = ({ 
  listing: initialListing, 
  onBack, 
  onListingClick,
  similarListings, 
  isFavorite, 
  onToggleFavorite, 
  onBook, 
  onContactHost, 
  onRequestAuth,
  initialGalleryOpen = false,
  isPreview = false
}) => {
  const [listing, setListing] = useState<Listing>(initialListing);

  useEffect(() => {
    setListing(initialListing);
    const controller = new AbortController();
    if (!isPreview && /^[1-9]\d*$/.test(String(initialListing.id))) {
      fetch(`/api/listings/${encodeURIComponent(initialListing.id)}`, {signal:controller.signal})
        .then(res => res.ok ? res.json() : null)
        .then(data => {if (!controller.signal.aborted && data && String(data.id) === String(initialListing.id)) setListing(data);})
        .catch(() => { /* Keep the supplied projection if its refresh is unavailable. */ });
    }
    return () => controller.abort();
  }, [initialListing,isPreview]);

  const { user } = useAuth();
  const { addToast } = useToast();
  const { trackPhotoView, trackDateSelection } = useListingTelemetry(listing.id);
  const [activeMobileImage, setActiveMobileImage] = useState(0);

  // Chameleon UI Dynamic Dominant Color
  const dominantColor = listing.dominant_color_hex || '#06b6d4';
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [activeGalleryTab, setActiveGalleryTab] = useState('all');
  const [activeSlide, setActiveSlide] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [radarCategory, setRadarCategory] = useState<string>("DESTINATION");
  const [activeTouristPlace, setActiveTouristPlace] = useState<any | null>(null);
  const [activeCollageCenterIndex, setActiveCollageCenterIndex] = useState<number | null>(null);
  const collageTrackRef = useRef<HTMLDivElement>(null);


  // 10/10 Award-Winning Header Scroll Mechanics
  const { scrollY } = useScroll();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const direction = latest - lastScrollY.current;
    if (latest < 100) {
      setIsHeaderVisible(true);
    } else {
      if (direction > 10 && isHeaderVisible) { // scrolling down
        setIsHeaderVisible(false);
      } else if (direction < -10 && !isHeaderVisible) { // scrolling up
        setIsHeaderVisible(true);
      }
    }
    lastScrollY.current = latest;
  });

  const headerBgColor = useTransform(scrollY, [0, 100, 400], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.4)", "rgba(255, 255, 255, 0.75)"]);
  const headerBgColorDark = useTransform(scrollY, [0, 100, 400], ["rgba(24, 24, 27, 0)", "rgba(24, 24, 27, 0.4)", "rgba(24, 24, 27, 0.75)"]);
  const headerBlur = useTransform(scrollY, [0, 100, 400], ["blur(0px)", "blur(12px)", "blur(24px)"]);
  const headerBorder = useTransform(scrollY, [0, 400], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.2)"]);
  
  const titleOpacity = useTransform(scrollY, [150, 300], [0, 1]);
  const titleY = useTransform(scrollY, [150, 300], [10, 0]);
  
  // Transition text color from white (over video) to zinc (over light bg) on mobile
  const textColorMobile = useTransform(scrollY, [0, 300], ["#ffffff", "#18181b"]);

  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    setIsDesktop(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);


  // Only supplied property media may appear in the public hero and collage.
  const uniqueMediaPool = useMemo(() => Array.from(new Set(
    (listing.imageUrls?.length ? listing.imageUrls : listing.imageUrl ? [listing.imageUrl] : []).filter(Boolean)
  )), [listing.imageUrls, listing.imageUrl]);

  // Mobile Center-Pivot Scroll Spotlight for Monochrome-to-Color Collage
  const handleCollageTrackScroll = useCallback(() => {
    if (!collageTrackRef.current) return;
    const container = collageTrackRef.current;
    const centerPoint = container.scrollLeft + container.clientWidth / 2;
    const cards = container.children;
    let closestIndex = null;
    let minDistance = Infinity;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - centerPoint);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    setActiveCollageCenterIndex(closestIndex);
  }, []);

  const images = uniqueMediaPool;

  // MIG-001: Dual-read — live room data takes precedence over LEGACY_ROOM_TIER_CONFIG
  const liveRoomConfigs = useMemo(() => {
    if (!listing.rooms || listing.rooms.length === 0) return null;
    const configs: Record<string, { name: string; price: number; capacity: number; specs: string; tag: string; icon: string; description: string; features: string[]; }> = {};
    (listing.rooms as any[]).forEach(room => {
      const key = room.type || room.id || `room_${room.name}`;
      configs[key] = {
        name: room.name || key,
        price: Number(room.price) || 0,
        capacity: room.capacity || 0,
        specs: room.specs || (Array.isArray(room.features) ? room.features.join(' · ') : ''),
        tag: room.tag || '',
        icon: room.icon || '🛏️',
        description: room.description || '',
        features: Array.isArray(room.features) ? room.features : []
      };
    });
    return Object.keys(configs).length > 0 ? configs : null;
  }, [listing.rooms]);

  const availableRoomTiers = useMemo(() => {
    if (liveRoomConfigs) return Object.keys(liveRoomConfigs);
    return [];
  }, [liveRoomConfigs]);

  const getRoomConfig = useCallback((tierKey: string) => {
    if (liveRoomConfigs && liveRoomConfigs[tierKey]) return liveRoomConfigs[tierKey];
    return { name: 'Room details are being prepared.', price: 0, capacity: 0, specs: '', tag: '', icon: '', description: '', features: [] };
  }, [liveRoomConfigs]);

  const mobileGalleryRef = useRef<HTMLDivElement>(null);
  const [mobileSpaceIndex, setMobileSpaceIndex] = useState(0);
  const [isMorphingReservation, setIsMorphingReservation] = useState(false);

  const [isGalleryOpen, setIsGalleryOpen] = useState(initialGalleryOpen || false);
  const [galleryInitialCategory, setGalleryInitialCategory] = useState<GalleryCategoryKey>('all');
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const openPropertyPhoto = (url: string | undefined) => {
    const index=classifyListingPhotos(listing).findIndex(photo=>photo.url===url);
    if (index<0) return;
    setGalleryInitialCategory('all');setGalleryInitialIndex(index);setIsGalleryOpen(true);
  };
  const [showFloatingCapsule, setShowFloatingCapsule] = useState(false);
  const [showMobileStickyBar, setShowMobileStickyBar] = useState(false);
  const zone1Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialGalleryOpen !== undefined) {
      setIsGalleryOpen(initialGalleryOpen);
    }
  }, [initialGalleryOpen]);

  // Scroll listener for smooth bi-directional morphing of Booking Dock
  useEffect(() => {
    const handleScroll = () => {
      // Show mobile sticky bar only after scrolling past the video hero
      setShowMobileStickyBar(window.scrollY > window.innerHeight * 0.7);

      if (zone1Ref.current) {
        const rect = zone1Ref.current.getBoundingClientRect();
        // Morph into capsule when bottom of Zone 1 scrolls past the upper viewport
        setShowFloatingCapsule(rect.bottom < 240);
      } else {
        setShowFloatingCapsule(window.scrollY > 850);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sensory Tags
  const sensoryTags: string[] = useMemo(() => {
    if (Array.isArray(listing.experience_tags) && listing.experience_tags.length > 0) {
      return listing.experience_tags;
    }
    if (Array.isArray(listing.amenities) && listing.amenities.length > 0) {
      return listing.amenities.slice(0, 5);
    }
    return [];
  }, [listing.experience_tags, listing.amenities]);

  // Parse Curated Guidelines
  const parsedGuidelines: string[] = useMemo(() => {
    if (Array.isArray(listing.curated_guidelines)) {
      return listing.curated_guidelines;
    }
    if (typeof listing.curated_guidelines === 'string' && listing.curated_guidelines.trim()) {
      try {
        const parsed = JSON.parse(listing.curated_guidelines);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return (listing.curated_guidelines as string).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  }, [listing.curated_guidelines]);

  // Accordion state (01 About, 02 Hospitality Guidelines, 03 Family Safety, 04 Concierge Privileges)
  const [openAccordion, setOpenAccordion] = useState<{ about: boolean; guidelines: boolean; safety: boolean; services: boolean }>({
    about: true,
    guidelines: false,
    safety: false,
    services: false
  });

  const toggleAccordion = (key: 'about' | 'guidelines' | 'safety' | 'services') => {
    uiAudio.playClick();
    setOpenAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Selected Room Tier: Defaults to 'deluxe' (Psychological Revenue Anchor)
  // If listing has rooms, default to first room's type key; else 'suites'
  const [selectedRoomTier, setSelectedRoomTier] = useState<string>(() => {
    if (listing.rooms && listing.rooms.length > 0) {
      const firstRoom = (listing.rooms as any[])[0];
      return String(firstRoom.type || firstRoom.id);
    }
    return '';
  });

  // Booking Form State
  const [checkIn, setCheckIn] = useState<string>(() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  });
  const [checkOut, setCheckOut] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  
  // Luxury Granular Occupancy Engine (Adults, Children, Infants)
  const [adultsCount, setAdultsCount] = useState<number>(2);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [infantsCount, setInfantsCount] = useState<number>(0);
  const [showOccupancyPicker, setShowOccupancyPicker] = useState<boolean>(false);
  const guests = adultsCount + childrenCount;

  // Public aggregate availability is separate from the host's private calendar.
  const availabilityKey = `${listing.id}:${checkIn}:${checkOut}`;
  const [availability, setAvailability] = useState<{key: string; rooms: {id: number; available: number | null}[]} | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let disposed = false;
    setAvailability(null);
    if (!/^[1-9]\d*$/.test(String(listing.id)) || !checkIn || checkOut <= checkIn) return;
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(`/api/listings/${listing.id}/availability?from=${encodeURIComponent(checkIn)}&to=${encodeURIComponent(checkOut)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Availability unavailable');
        const payload = await response.json();
        if (!disposed) setAvailability({ key: availabilityKey, rooms: payload.rooms });
      } catch { if (!disposed) setAvailability(null); }
    };
    void load(); const timer = setInterval(() => { void load(); }, 30000);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [listing.id, checkIn, checkOut, availabilityKey]);
  const selectedCanonicalRoom = (listing.rooms || []).find(room => String(room.type || room.id) === String(selectedRoomTier));
  const remainingRooms = availability?.key === availabilityKey
    ? availability.rooms.find(room => room.id === Number(selectedCanonicalRoom?.id))?.available ?? null : null;
  const availabilityUnknown = remainingRooms === null;
  const isDateRangeBlocked = remainingRooms === null || remainingRooms === 0;

  // Double-Entry Ledger Calculation per Selected Room Tier
  const activeTierObj = getRoomConfig(selectedRoomTier);
// ADR-003: Price authority is listing.rooms[].price, not hardcoded multipliers
  const activeNightlyRate = useMemo(() => {
    if (liveRoomConfigs && liveRoomConfigs[selectedRoomTier]) {
      return liveRoomConfigs[selectedRoomTier].price;
    }
    return Number.isFinite(listing.price) && listing.price > 0 ? listing.price : 0;
  }, [selectedRoomTier, liveRoomConfigs, listing.price, listing.currency]);

  const nights = useMemo(() => {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [checkIn, checkOut]);

  // M5/M6B remain blocked: availability is not an accepted payment quote.
  const checkoutAvailable = false;
  const handleReserve = () => {
    addToast('Online booking is being prepared', 'You can contact the host inside Encho. No payment has been requested.', 'info');
  };

  // Filter images for full gallery
  const filteredGalleryImages = useMemo(() => {
    if (activeGalleryTab === 'all') return images;
    return images;
  }, [images, activeGalleryTab]);

  return (
    <>
      <SEO 
        title={`${listing.title} | Luxury Sanctuary in ${listing.city} - Encho`}
        description={listing.description ? listing.description.substring(0, 155) : `View ${listing.title} and its supplied stay information on Encho.`}
        image={images[0]}
      />

      <div className="min-h-screen bg-[#F9F8F6] dark:bg-[#F9F8F6] font-sans antialiased text-zinc-900 pb-28 md:pb-36 selection:bg-amber-500/20">

        

        {/* 10/10 AMAN-GRADE LUXURY EDITORIAL MASTER HEADER */}
        <header className={"sticky top-0 z-[60] w-full bg-[#F9F8F6]/90 backdrop-blur-md border-b border-[#E8E4DC] transition-all duration-300 ease-in-out " + (isHeaderVisible ? "translate-y-0" : "-translate-y-full")}>
          <div className="max-w-[1400px] mx-auto flex items-center justify-between h-16 md:h-20 px-4 sm:px-8 md:px-12">
            
            {/* LEFT: [< (Back) ENCHO (logo official <EnchoWordmark />)] */}
            <div className="flex items-center gap-4 shrink-0">
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                    className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 active:scale-95 transition-all text-zinc-900 cursor-pointer group/back"
                    aria-label="Go back"
                    title="Go back"
                >
                    <ChevronLeft strokeWidth={1.5} className="w-6 h-6 group-hover/back:-translate-x-1 transition-transform" />
                </button>

                {/* Official ENCHO Wordmark */}
                <div 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                    className="flex items-center cursor-pointer group shrink-0 select-none"
                    title="Encho Space"
                >
                    <div className="flex items-center">
                        <EnchoWordmark className="h-4 sm:h-[18px] w-auto" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] ml-[2px] transition-transform duration-300 group-hover:scale-125 shrink-0" />
                    </div>
                    <span className="ml-3 text-[9px] font-medium tracking-[0.3em] text-zinc-400 uppercase group-hover:text-zinc-600 transition-colors hidden sm:inline-block">
                        STAYS
                    </span>
                </div>
            </div>

            {/* CENTER: THUSHARA (Brand Identity) */}
            <div className="flex items-center justify-center px-4 min-w-0 flex-1">
                {((listing as any).brand && (listing as any).brand.trim().length > 0) && (
                    <div className="flex items-center gap-2 px-2 sm:px-4 py-1.5 min-w-0">
                        <span 
                            style={{ 
                              fontFamily: getBrandTypography((listing as any).brand_font).fontFamily,
                              color: getBrandColorStyle((listing as any).brand_color)
                            }} 
                            className={`${getBrandTypography((listing as any).brand_font).className} text-[13px] md:text-[15px] truncate font-semibold uppercase`}
                        >
                            {(listing as any).brand.trim()}
                        </span>
                    </div>
                )}
            </div>

            {/* RIGHT: [♥ Wishlist]  [☰Menu ] */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {/* Wishlist Button */}
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); if(onToggleFavorite) onToggleFavorite(listing); }}
                    className={`hidden sm:flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full transition-all cursor-pointer group/fav active:scale-95 ${
                        isFavorite 
                            ? 'text-[#e51d53]' 
                            : 'hover:bg-black/5 text-zinc-900'
                    }`}
                    aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon 
                        className={`w-5 h-5 transition-transform group-hover/fav:scale-110 ${
                            isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-zinc-900'
                        }`} 
                        filled={isFavorite} 
                    />
                    <span className="hidden md:inline text-[11px] font-medium font-sans uppercase tracking-[0.1em]">
                        {isFavorite ? 'Saved' : 'Wishlist'}
                    </span>
                </button>

                {/* Menu Button */}
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); /* Future Menu Drawer */ }}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full hover:bg-black/5 transition-all text-zinc-900 cursor-pointer active:scale-95"
                    aria-label="Menu"
                >
                    <Menu strokeWidth={1.5} className="w-5 h-5" />
                    <span className="hidden md:inline text-[11px] font-medium font-sans uppercase tracking-[0.1em]">
                        Menu
                    </span>
                </button>
            </div>

          </div>
        </header>

        
        <div className="w-full md:max-w-[1400px] mx-auto px-3 sm:px-6 md:px-8 pt-3 sm:pt-4 pb-6">
            {((listing as any).hero_video_url || listing.video_url) ? (
                <div data-testid="hero-cinematic-video" className="w-full h-[75vh] md:h-[75vh] lg:h-[85vh] rounded-2xl md:rounded-3xl overflow-hidden bg-black shadow-xl relative group/video border border-zinc-200/40 /40">
                    <CinematicVideoPlayer
                        videoUrl={(listing as any).hero_video_url || listing.video_url}
                        posterUrl={images[0]}
                        title={listing.title}
                        price={activeNightlyRate}
                        currency={listing.currency}
                        onReserveClick={handleReserve}
                    />
                </div>
            ) : (
                <>
                    <div className={`hidden md:grid ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5 h-[65vh] lg:h-[75vh] rounded-3xl overflow-hidden bg-zinc-100 shadow-sm relative`}>
                        {images.length === 0 ? <div className="flex items-center justify-center text-zinc-500">Property photography is being prepared.</div> : images.slice(0,4).map((url,index) => (
                          <button key={url} type="button" className="relative overflow-hidden h-full" aria-label={`View property photo ${index+1}`} onClick={() => {trackPhotoView(index); openPropertyPhoto(url);}}>
                            <OptimizedImage src={url} aspectRatio="4:3" priority={index===0} className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform" alt={index===0 ? `${listing.title} Main View` : `${listing.title} photo ${index+1}`} />
                          </button>
                        ))}
                        {images.length > 0 && <button type="button" onClick={() => {setGalleryInitialCategory('all');setGalleryInitialIndex(0);setIsGalleryOpen(true);}} className="absolute bottom-4 right-4 bg-white/95 text-zinc-900 px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg"><ImageIcon className="w-4 h-4"/>View all photos</button>}
                    </div>

                    <div className="md:hidden relative w-full aspect-[4/5] sm:aspect-square bg-zinc-200 overflow-hidden">
                        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full h-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} onScroll={(e) => {
                            const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                            const width = (e.target as HTMLDivElement).clientWidth;
                            const idx = Math.round(scrollLeft / width);
                            if (idx !== activeMobileImage) {
                                setActiveMobileImage(idx);
                                trackPhotoView(idx);
                            }
                        }}>
                            {images.length === 0 && <div className="w-full h-full flex items-center justify-center p-8 text-center text-zinc-500">Property photography is being prepared.</div>}
                            {images.map((img, idx) => (
                                <div key={idx} className="w-full h-full snap-center shrink-0 relative" onClick={() => openPropertyPhoto(img)}>
                                    <OptimizedImage src={img} aspectRatio="1:1" priority={idx === 0} className="w-full h-full object-cover" alt={`${listing.title} View ${idx + 1}`} />
                                </div>
                            ))}
                        </div>

                        {images.length > 1 && <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
                            <div className="flex gap-1.5 bg-black/30 backdrop-blur-xl px-3 py-1.5 rounded-full">
                                {images.map((_, i) => (
                                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${activeMobileImage === i ? 'w-4 bg-white' : 'w-1 bg-white/40'}`} />
                                ))}
                            </div>
                        </div>}
                    </div>
                </>
            )}
        </div>

        
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-zinc-900">{listing.title}</h1>
          <p className="mt-3 text-zinc-500">{[listing.location?.locality, listing.location?.city || listing.city].filter(Boolean).join(', ')}</p>
        </section>

        {/* ========================================================================= */}
        {/* ZONE 1: HIGH-CONVERSION SPLIT GRID (Top -> End of Host Section)           */}
        {/* ========================================================================= */}
        <div ref={zone1Ref} className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* Left Column (Zone 1 Content) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-12">
                
                {/* Suite Showcase Matrix (Modular Suites) */}
                {(listing.rental_mode === 'hybrid' || listing.rental_mode === 'private_rooms') && listing.rooms && listing.rooms.length > 0 && (
                    <section className="space-y-6">
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Suite Configurations</h2>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border border-amber-200">Modular</span>
                        </div>
                        <p className="text-zinc-500 font-medium leading-relaxed max-w-2xl">
                            Customize your stay by reserving individual suites. Each modular unit maintains complete privacy while sharing central sanctuary access.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {listing.rooms.map((room) => (
                                <div key={room.id} className="group relative bg-white border border-zinc-200 rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col">
                                    <div className="h-48 bg-zinc-100 relative overflow-hidden">
                                        <OptimizedImage 
                                            src={room.imageUrls?.[0] || ''}
                                            aspectRatio="16:9" 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                            alt={room.name} 
                                        />
                                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/40 shadow-sm flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-900">{room.sqft ? `${room.sqft} sqft` : 'Private Suite'}</span>
                                        </div>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col justify-between bg-gradient-to-b from-white to-zinc-50/50">
                                        <div>
                                            <h3 className="text-lg font-bold text-zinc-900 font-display">{room.name}</h3>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {room.features?.slice(0,3).map(f => (
                                                    <span key={f} className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200/60">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* SENSORY ATMOSPHERE DECK */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-[#0284C7]" />
                      <span>Sensory Atmosphere Deck</span>
                    </h2>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-display">Host supplied</span>
                  </div>

                  {sensoryTags.length === 0 && <p className="text-zinc-500">Amenities have not been supplied yet.</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {sensoryTags.map((tag, idx) => {
                      const IconComponent = getSensoryTagIcon(tag);
                      return (
                        <div
                          key={idx}
                          className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-100/90 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex items-center gap-4 group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-[#F0F9FF] border border-[#E0F2FE] flex items-center justify-center shrink-0 text-[#0284C7] group-hover:scale-105 transition-transform shadow-xs">
                            <IconComponent className="w-6 h-6 stroke-[1.8]" />
                          </div>
                          <span className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight leading-snug">{tag}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="border-t border-zinc-200/80 pt-6 space-y-2">
                  {/* Accordion Item 1: About The Sanctuary */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('about')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">01</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          About The Sanctuary
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.about ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.about && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        <p className="text-zinc-600 leading-relaxed">
                          {listing.description || 'The host has not provided a description.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 2: House guidelines */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('guidelines')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">02</span>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                            House guidelines
                          </h3>
                          {parsedGuidelines.length > 0 && <span className="bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">Host supplied</span>}
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.guidelines ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.guidelines && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        <div className="space-y-3">
                          {parsedGuidelines.map((g, idx) => {
                            const colonIdx = g.indexOf(':');
                            const hasPrefix = colonIdx > 0 && colonIdx < 40;
                            const titlePart = hasPrefix ? g.substring(0, colonIdx) : null;
                            const descPart = hasPrefix ? g.substring(colonIdx + 1).trim() : g;

                            return (
                              <div key={idx} className="flex items-start gap-3.5 p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 transition-all hover:bg-zinc-50 hover:border-zinc-300">
                                <span className="text-amber-800 font-bold text-xs shrink-0 mt-0.5 font-mono tracking-wider">
                                  {String(idx + 1).padStart(2, '0')}.
                                </span>
                                <p className="text-xs md:text-sm text-zinc-800 leading-relaxed font-normal">
                                  {titlePart ? (
                                    <>
                                      <strong className="font-bold text-zinc-900">{titlePart}: </strong>
                                      <span>{descPart}</span>
                                    </>
                                  ) : (
                                    <span>{g}</span>
                                  )}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 3: Family & Child Safety Protocols */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('safety')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">03</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          Family & Child Safety Protocols
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.safety ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.safety && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        {listing.child_safety_specs && listing.child_safety_specs.length > 0 ? (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {listing.child_safety_specs.map((spec, i) => (
                              <li key={i} className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span className="text-xs font-semibold text-emerald-950">{spec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 text-xs text-zinc-600 space-y-1.5">
                            <p className="font-bold text-zinc-800">Safety information has not been provided.</p>
                            <p className="leading-relaxed">Ask the host about any safety or accessibility requirements before arranging your stay.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 4: Bespoke Concierge & Culinary Privileges */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('services')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">04</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          Concierge Privileges & Bespoke Services
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.services ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.services && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-3 font-normal animate-fade-in pl-8 pr-2">
                        <p className="text-xs md:text-sm text-zinc-600 leading-relaxed">
                          {listing.concierge_privileges || 'The host has not provided service details.'}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* EDITORIAL HOST SIGNATURE */}
                <section className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xl uppercase shadow-md shrink-0 border-2 border-slate-100">
                        {listing.provider ? listing.provider.charAt(0) : 'E'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight font-display">{listing.provider || 'Property host'}</h3>

                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Contact through Encho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        uiAudio.playClick();
                        if (onContactHost) onContactHost();
                      }}
                      className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Message host</span>
                    </button>
                  </div>

                  {/* Host Philosophy / Editorial Message */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border-l-2 border-zinc-900 text-sm md:text-base text-zinc-700 font-medium italic leading-relaxed">
                    "{listing.host_philosophy || listing.editorial_quote || 'The host has not added a personal introduction.'}"
                  </div>
                </section>
            </div>

            {/* Right Column: Sticky Glass Checkout Dock (Zone 1 Stays Mounted Here) */}
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4 relative pb-12">
                <div className="sticky top-28 bg-white border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 flex flex-col">
                    <div className="flex items-end justify-between mb-4">
                        <div>
                            <span className="text-3xl font-extrabold tracking-tight text-zinc-900 font-display tabular-nums">{activeNightlyRate > 0 ? `From ${listing.currency === 'USD' ? '$' : '₹'}${activeNightlyRate.toLocaleString('en-IN')}` : 'Price is being prepared'}</span>
                            <span className="text-zinc-500 font-medium ml-1 text-sm">/ night</span>
                        </div>
                        <span className="bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
                          <span>{activeTierObj.icon}</span>
                          <span>{(activeTierObj as any).shortName}</span>
                        </span>
                    </div>

                    {/* 1-Tap Room Inventory Tier Selector Pill */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
                          Room Category
                        </label>
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {activeTierObj.tag}
                        </span>
                      </div>
                      <div className={`grid gap-1.5 p-1 bg-zinc-100/80 rounded-2xl border border-zinc-200/60 ${availableRoomTiers.length === 1 ? 'grid-cols-1' : availableRoomTiers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {availableRoomTiers.map((tierKey, idx) => {
                          const t = getRoomConfig(tierKey);
                          const isSelected = selectedRoomTier === tierKey;
                          const tRate = listing.currency === 'USD' ? ((t as any).priceUsd || t.price) : t.price;
                          return (
                            <button
                              key={tierKey}
                              type="button"
                              onClick={() => {
                                uiAudio.playClick();
                                setSelectedRoomTier(tierKey);
                                setActiveSlide(idx);
                              }}
                              className={`py-2 px-1.5 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-900/10 font-bold scale-[1.02]'
                                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/60'
                              }`}
                            >
                              <span className="text-xs">{t.icon}</span>
                              <span className="text-[11px] font-bold tracking-tight mt-0.5">{(t as any).shortName || t.name.substring(0, 10)}</span>
                              <span className="text-[9px] font-mono text-zinc-400">
                                {listing.currency === 'USD' ? `$${tRate}` : `₹${Math.round(tRate / 1000)}k`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium mt-1.5 px-1 truncate">
                        {activeTierObj.specs}
                      </p>
                    </div>

                    {/* Dual-Date Engine */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl overflow-hidden mb-6">
                        <div className="grid grid-cols-2 divide-x divide-zinc-200/80 border-b border-zinc-200/80">
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display">Check-in</label>
                                <input 
                                    type="date" 
                                    min={new Date().toISOString().split('T')[0]}
                                    value={checkIn}
                                    onChange={(e) => {
                                        setCheckIn(e.target.value);
                                        trackDateSelection(e.target.value, checkOut);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-700 focus:ring-0 cursor-pointer"
                                />
                            </div>
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display">Check-out</label>
                                <input 
                                    type="date" 
                                    min={checkIn}
                                    value={checkOut}
                                    onChange={(e) => {
                                        setCheckOut(e.target.value);
                                        trackDateSelection(checkIn, e.target.value);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-700 focus:ring-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="p-3 relative">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display flex items-center justify-between">
                              <span>Occupancy</span>
                              <span className="text-[9px] text-zinc-400 font-mono">{activeTierObj.capacity > 0 ? `Max ${activeTierObj.capacity} Guests` : 'Capacity not supplied'}</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => { uiAudio.playClick(); setShowOccupancyPicker(prev => !prev); }}
                              className="w-full text-left bg-white px-2.5 py-1.5 rounded-xl border border-zinc-200/80 text-xs font-semibold text-zinc-800 flex items-center justify-between cursor-pointer hover:border-zinc-400 transition-colors"
                            >
                              <span>
                                {adultsCount} Adult{adultsCount > 1 ? 's' : ''}
                                {childrenCount > 0 ? ` · ${childrenCount} Child${childrenCount > 1 ? 'ren' : ''}` : ''}
                                {infantsCount > 0 ? ` · ${infantsCount} Infant${infantsCount > 1 ? 's' : ''}` : ''}
                              </span>
                              <span className="text-zinc-400 text-[10px]">▼</span>
                            </button>

                            {/* Frosted Occupancy Stepper Popover */}
                            {showOccupancyPicker && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-zinc-200/90 shadow-2xl rounded-2xl p-4 z-50 space-y-3.5">
                                {/* Adults Stepper */}
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Adults</span>
                                    <span className="text-[10px] text-zinc-400 font-medium">Age 13+</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={adultsCount <= 1}
                                      onClick={() => { uiAudio.playClick(); setAdultsCount(prev => Math.max(1, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{adultsCount}</span>
                                    <button
                                      type="button"
                                      disabled={adultsCount + childrenCount >= activeTierObj.capacity}
                                      onClick={() => { 
                                        uiAudio.playClick(); 
                                        if (adultsCount + childrenCount < activeTierObj.capacity) {
                                          setAdultsCount(prev => prev + 1);
                                        } else if (selectedRoomTier !== 'suites') {
                                          // Auto-upgrade suggestion
                                          setSelectedRoomTier('suites');
                                          setAdultsCount(prev => prev + 1);
                                        }
                                      }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                {/* Children Stepper */}
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Children</span>
                                    <span className="text-[10px] text-zinc-400 font-medium">Ages 2–12</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={childrenCount <= 0}
                                      onClick={() => { uiAudio.playClick(); setChildrenCount(prev => Math.max(0, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{childrenCount}</span>
                                    <button
                                      type="button"
                                      onClick={() => { 
                                        uiAudio.playClick(); 
                                        if (selectedRoomTier !== 'suites') {
                                          setSelectedRoomTier('suites'); // Upgrade to suite for family
                                        }
                                        setChildrenCount(prev => Math.min(1, prev + 1));
                                      }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                {/* Infants Stepper */}
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Infants</span>
                                    <span className="text-[10px] text-emerald-600 font-medium">Under 2 (Free Crib)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={infantsCount <= 0}
                                      onClick={() => { uiAudio.playClick(); setInfantsCount(prev => Math.max(0, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{infantsCount}</span>
                                    <button
                                      type="button"
                                      onClick={() => { uiAudio.playClick(); setInfantsCount(prev => Math.min(2, prev + 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setShowOccupancyPicker(false)}
                                  className="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl mt-2 cursor-pointer"
                                >
                                  Apply Occupancy
                                </button>
                              </div>
                            )}
                        </div>
                    </div>

                    <p className={`mb-4 p-3 rounded-xl text-sm ${isDateRangeBlocked ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`} role="status">
                      {availabilityUnknown ? 'Availability is not confirmed for these dates. Please check again shortly.'
                        : remainingRooms === 0 ? 'No rooms are available for these dates.'
                        : `${remainingRooms} rooms available for the selected stay. Availability is confirmed again when you reserve.`}
                    </p>

                    <button 
                        disabled={!checkoutAvailable || isDateRangeBlocked}
                        onClick={() => handleReserve()}
                        className={`w-full font-bold font-display py-4 rounded-2xl transition-all flex items-center justify-center gap-2 mb-4 ${
                          isDateRangeBlocked
                            ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-300/60 shadow-none'
                            : 'bg-gradient-to-r from-zinc-900 to-zinc-800 text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] active:scale-[0.98] cursor-pointer'
                        }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        <span>{!checkoutAvailable ? 'Online booking is being prepared' : isDateRangeBlocked ? 'Dates unavailable' : 'Reserve stay'}</span>
                    </button>
                    
                    <p className="text-[11px] text-zinc-400 text-center mb-6 font-medium">
                      {!checkoutAvailable ? 'Contact the host through Encho for questions' : isDateRangeBlocked ? (availabilityUnknown ? 'Availability needs confirmation before reserving' : 'Choose alternate dates to reserve') : "You won't be charged yet"}
                    </p>

                    <p className="text-sm text-zinc-600">Taxes and final price will be shown before payment.</p>
                </div>
            </div>

        </div>

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* MONOCHROME-TO-COLOR SPOTLIGHT SCATTERED EDITORIAL COLLAGE (100vw)          */}
        {/* Quiet Grayscale Resting State · Desktop Hover Bloom · Mobile Center Pivot */}
        {/* ========================================================================= */}
        {images.length > 0 && <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] overflow-x-clip overflow-y-visible mt-6 md:mt-8 mb-0 pt-4 pb-20 md:pb-28 bg-transparent">
          <div 
            ref={collageTrackRef}
            onScroll={handleCollageTrackScroll}
            className="flex overflow-x-auto gap-0 px-4 md:px-8 pt-4 pb-16 md:pb-24 scrollbar-hide snap-x snap-mandatory items-center min-h-[540px] sm:min-h-[620px] md:min-h-[720px]" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* 24 Heavily Colliding Scattered Cards Packing 100% of Space */}
            {[
              { idx: 0, w: 'w-[280px] sm:w-[360px] md:w-[460px]', h: 'h-[320px] sm:h-[380px] md:h-[460px]', z: 'z-10', overlap: 'ml-0', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 1, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 2, w: 'w-[240px] sm:w-[300px] md:w-[380px]', h: 'h-[300px] sm:h-[360px] md:h-[430px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-40', aspect: '16:9', rotate: '-rotate-3', translateY: '-translate-y-6 md:-translate-y-10' },
              { idx: 3, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-1', translateY: 'translate-y-10 md:translate-y-18' },
              { idx: 4, w: 'w-[300px] sm:w-[380px] md:w-[480px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-40 md:-ml-52', aspect: '16:9', rotate: 'rotate-3', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 5, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 6, w: 'w-[260px] sm:w-[340px] md:w-[420px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 7, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[360px] sm:h-[430px] md:h-[520px]', z: 'z-35', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-3', translateY: 'translate-y-8 md:translate-y-14' },
              { idx: 8, w: 'w-[310px] sm:w-[390px] md:w-[490px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-12 md:-translate-y-18' },
              { idx: 9, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-1', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 10, w: 'w-[270px] sm:w-[350px] md:w-[440px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-3', translateY: '-translate-y-8 md:-translate-y-12' },
              { idx: 11, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-2', translateY: 'translate-y-10 md:translate-y-16' },
              { idx: 12, w: 'w-[290px] sm:w-[370px] md:w-[470px]', h: 'h-[320px] sm:h-[380px] md:h-[460px]', z: 'z-10', overlap: '-ml-32 sm:-ml-40 md:-ml-52', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 13, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 14, w: 'w-[250px] sm:w-[330px] md:w-[420px]', h: 'h-[300px] sm:h-[360px] md:h-[430px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-40', aspect: '16:9', rotate: '-rotate-1', translateY: '-translate-y-6 md:-translate-y-10' },
              { idx: 15, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[360px] sm:h-[430px] md:h-[520px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-3', translateY: 'translate-y-8 md:translate-y-14' },
              { idx: 16, w: 'w-[300px] sm:w-[380px] md:w-[480px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: 'rotate-1', translateY: '-translate-y-12 md:-translate-y-18' },
              { idx: 17, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-3', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 18, w: 'w-[270px] sm:w-[350px] md:w-[440px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 19, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-35', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-1', translateY: 'translate-y-10 md:translate-y-18' },
              { idx: 20, w: 'w-[310px] sm:w-[390px] md:w-[490px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 21, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 22, w: 'w-[280px] sm:w-[360px] md:w-[460px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: '-rotate-3', translateY: '-translate-y-8 md:-translate-y-12' },
              { idx: 23, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-1', translateY: 'translate-y-8 md:translate-y-16' }
            ].filter(sheet => sheet.idx < uniqueMediaPool.length).map((sheet, sIndex) => (
              <div
                key={sIndex}
                onClick={() => {
                  uiAudio.playClick();
                  openPropertyPhoto(uniqueMediaPool[sheet.idx]);
                }}
                className={`relative shrink-0 ${sheet.w} ${sheet.h} ${sheet.z} ${sheet.overlap} ${sheet.rotate} ${sheet.translateY} rounded-2xl md:rounded-3xl overflow-hidden bg-zinc-900 border-[2.5px] border-white ring-1 ring-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] origin-center cursor-pointer hover:!z-50 hover:scale-[1.10] hover:rotate-0 hover:grayscale-0 hover:opacity-100 hover:shadow-[0_25px_60px_rgba(0,0,0,0.35)] hover:ring-black/10 group snap-center ${
                  activeCollageCenterIndex === sIndex 
                    ? '!grayscale-0 !opacity-100 scale-[1.04] !z-40 shadow-xl' 
                    : 'grayscale contrast-95 opacity-55'
                }`}
              >
                <OptimizedImage
                  src={uniqueMediaPool[sheet.idx]}
                  aspectRatio={sheet.aspect as '16:9' | '4:3'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  alt={`Sanctuary Moment ${sheet.idx + 1}`}
                />
              </div>
            ))}
          </div>
        </div>}

                {/* ZONE 2: 100% FULL-WIDTH CINEMATIC IMMERSIVE SUITE                        */}
        {/* ========================================================================= */}
        <div className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-4 md:mt-6 flex flex-col gap-16 md:gap-24">

          <ListingRoomGallery listing={listing} onOpen={(tier, index) => {
            setGalleryInitialCategory(tier); setGalleryInitialIndex(index); setIsGalleryOpen(true);
          }} />
          <section className="space-y-6 pt-8 border-t border-zinc-200/80">
            <h2 className="text-2xl md:text-3xl font-extrabold font-display">Neighborhood Radar</h2>
            <p className="text-zinc-600">{[listing.location?.locality, listing.location?.city || listing.city].filter(Boolean).join(', ')}</p>
            <div className="group rounded-3xl bg-zinc-100 border border-zinc-200 p-8">
              <div className="opacity-50 grayscale group-hover:grayscale-0 transition-all duration-1000 ease-out">
                <MapPin className="w-8 h-8 mb-3" /><p>Approximate location map is being prepared.</p>
              </div>
            </div>
            {listing.nearby?.length ? <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">{listing.nearby.map((poi,index) => <li key={poi.id || index} className="p-5 rounded-2xl bg-white border border-zinc-200">
              <h3 className="font-semibold">{poi.name}</h3>{poi.distance && <p className="text-sm text-zinc-500">{poi.distance}</p>}{poi.description && <p className="mt-2 text-sm text-zinc-600">{poi.description}</p>}
            </li>)}</ul> : <p className="text-zinc-500">Nearby details are being prepared.</p>}
          </section>
          <section className="space-y-3 pt-8 border-t border-zinc-200/80">
            <h2 className="text-2xl font-display font-semibold">New on Encho Stays</h2>
            <p className="text-zinc-500">This sanctuary has not yet accumulated verified guest reviews.</p>
          </section>

          {/* 4. SIMILAR SANCTUARIES */}
          {similarListings && similarListings.length > 0 && (
            <section className="space-y-6 pt-8 border-t border-zinc-200/80 pb-16">
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Similar Sanctuaries</h2>
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {similarListings.map(sim => (
                  <div 
                    key={sim.id} 
                    onClick={() => { uiAudio.playClick(); if (onListingClick) onListingClick(sim); }}
                    className="snap-start shrink-0 w-[280px] md:w-[320px] cursor-pointer group"
                  >
                    <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-100 mb-3 border border-zinc-200/50">
                      <OptimizedImage 
                        src={sim.imageUrls?.[0] || sim.imageUrl} 
                        aspectRatio="4:3" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        alt={sim.title} 
                      />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/40 shadow-xs flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-bold text-zinc-900 tabular-nums">{sim.rating != null && sim.rating > 0 ? sim.rating.toFixed(1) : '—'}</span>
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 truncate font-display">{sim.title}</h4>
                    <p className="text-xs font-medium text-zinc-500 truncate">{sim.type} · {sim.city}</p>
                    <p className="text-sm font-extrabold text-zinc-900 mt-1 font-display tabular-nums">
                      {sim.currency === 'USD' ? '$' : '₹'}{sim.price.toLocaleString()} <span className="font-medium text-xs text-zinc-500">/ night</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        {/* ========================================================================= */}
        {/* GRAPHIC MORPHING FLOATING BOOKING CAPSULE (Visible past Host Section)      */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {showFloatingCapsule && (
            <motion.div 
              initial={{ y: 90, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 90, opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="hidden lg:flex fixed bottom-7 inset-x-0 z-50 justify-center px-4 pointer-events-none"
            >
              <div className="bg-zinc-900/95 text-white backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.35)] rounded-full px-6 py-3.5 flex items-center justify-between gap-8 pointer-events-auto max-w-xl w-full transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden bg-zinc-800 shrink-0 border border-white/10 relative">
                    <OptimizedImage src={images[0]} aspectRatio="1:1" className="w-full h-full object-cover" alt="Sanctuary Thumbnail" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-extrabold text-white font-display tabular-nums">
                        {activeNightlyRate > 0 ? `From ${listing.currency === 'USD' ? '$' : '₹'}${activeNightlyRate.toLocaleString('en-IN')}` : 'Price is being prepared'}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">/ night</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1.5 font-display">
                      <span>{new Date(checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>·</span>
                      <span>{guests} {guests === 1 ? 'Guest' : 'Guests'}</span>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!checkoutAvailable || isDateRangeBlocked}
                  onClick={() => handleReserve()}
                  className={`text-xs md:text-sm font-extrabold font-display uppercase tracking-wider px-7 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center gap-2 ${
                    isDateRangeBlocked
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 shadow-amber-500/20 cursor-pointer'
                  }`}
                >
                  <span>{isDateRangeBlocked ? 'UNAVAILABLE' : 'RESERVE'}</span>
                  {!isDateRangeBlocked && <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* UNIFIED LIQUID MORPHING MOBILE BOOKING CAPSULE (10/10 AWARD WINNER)        */}
        {/* ========================================================================= */}
        <div className="lg:hidden">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className={`fixed z-50 pointer-events-auto transition-colors duration-300 ${
              showMobileStickyBar
                ? "bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t border-zinc-200/80 shadow-[0_-8px_32px_rgba(0,0,0,0.09)] px-4 py-3 pb-safe safe-area-bottom"
                : "bottom-5 inset-x-4 max-w-md mx-auto bg-zinc-900/90 text-white backdrop-blur-2xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.4)] rounded-full px-5 py-2.5"
            }`}
          >
            <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg sm:text-xl font-black font-display tabular-nums ${showMobileStickyBar ? "text-zinc-900" : "text-white"}`}>
                    {activeNightlyRate > 0 ? `From ${listing.currency === 'USD' ? '$' : '₹'}${activeNightlyRate.toLocaleString('en-IN')}` : 'Price is being prepared'}
                  </span>
                  <span className={`text-[10px] font-bold uppercase font-mono ${showMobileStickyBar ? "text-zinc-400" : "text-zinc-300"}`}>
                    / nt
                  </span>
                </div>
                {isDateRangeBlocked ? (
                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5 truncate max-w-[150px]">
                    {availabilityUnknown ? 'Availability unconfirmed' : 'Dates unavailable'}
                  </span>
                ) : showMobileStickyBar ? (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 truncate max-w-[150px]">
                    {getRoomConfig(selectedRoomTier).icon} {getRoomConfig(selectedRoomTier).name}
                  </span>
                ) : (
                  <span className="text-[9px] font-medium text-emerald-400 tracking-wider uppercase flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Instant Confirmation
                  </span>
                )}
              </div>

              <button 
                disabled={!checkoutAvailable || isDateRangeBlocked}
                onClick={() => {
                  uiAudio.playPop();
                  handleReserve();
                }}
                className={`font-bold font-display uppercase tracking-wider text-xs py-3 px-6 rounded-full active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 ${
                  isDateRangeBlocked
                    ? "bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none"
                    : showMobileStickyBar
                      ? "bg-zinc-950 hover:bg-zinc-900 text-white cursor-pointer"
                      : "bg-white text-zinc-950 hover:bg-zinc-100 shadow-white/20 cursor-pointer"
                }`}
              >
                {isDateRangeBlocked ? (
                  <span>UNAVAILABLE</span>
                ) : showMobileStickyBar ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>RESERVE ↗</span>
                  </>
                ) : (
                  <>
                    <span>Reserve</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>

        {/* ========================================================================= */}
        {/* AWARD-WINNING SANCTUARY SPATIAL GALLERY (iF & RED DOT STANDARD)           */}
        {/* ========================================================================= */}
        <SanctuaryGalleryModal
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          listing={listing}
          initialIndex={galleryInitialIndex}
          initialCategory={galleryInitialCategory}
          onReserve={undefined}
        />

      </div>
    </>
  );
};

export const ListingDetailsNew: React.FC<ListingDetailsNewProps> = (props) => {
  return (
    <ListingErrorBoundary>
      <ListingDetailsNewContent key={String(props.listing.id)} {...props} />
    </ListingErrorBoundary>
  );
};
