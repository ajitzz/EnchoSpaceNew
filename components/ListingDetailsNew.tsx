import React, { useEffect, useState, useRef } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ListingErrorBoundary } from './ListingErrorBoundary';
import { useListingTelemetry } from '../hooks/useListingTelemetry';
import { OptimizedImage } from './OptimizedImage';
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
  Crown
} from 'lucide-react';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { io } from 'socket.io-client';

let socket: any = null;

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
}

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80"
];

// Helper to map sensory tags to relevant luxury icons
const getTagIcon = (tag: string) => {
  const lower = tag.toLowerCase();
  if (lower.includes('ocean') || lower.includes('wave') || lower.includes('sea') || lower.includes('beach')) return Waves;
  if (lower.includes('pool') || lower.includes('heat') || lower.includes('sauna') || lower.includes('spa')) return Flame;
  if (lower.includes('chef') || lower.includes('culinary') || lower.includes('kitchen') || lower.includes('dine')) return Utensils;
  if (lower.includes('wifi') || lower.includes('fiber') || lower.includes('internet') || lower.includes('work')) return Wifi;
  if (lower.includes('mountain') || lower.includes('view') || lower.includes('panorama') || lower.includes('summit')) return Mountain;
  if (lower.includes('wine') || lower.includes('cellar') || lower.includes('bar')) return Wine;
  if (lower.includes('butler') || lower.includes('service') || lower.includes('concierge')) return Award;
  return Sparkles;
};

const ListingDetailsNewContent: React.FC<ListingDetailsNewProps> = ({
  listing,
  onBack,
  onListingClick,
  similarListings,
  isFavorite,
  onToggleFavorite,
  onBook,
  onContactHost,
  onRequestAuth
}) => {
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const { trackPhotoView, trackDateSelection } = useListingTelemetry(listing.id);

  // Live telemetry & state
  const [liveViewers, setLiveViewers] = useState(3);
  const [activeMobileImage, setActiveMobileImage] = useState(0);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Chameleon UI Dynamic Dominant Color
  const dominantColor = listing.dominant_color_hex || '#06b6d4';

  // Perceptual Hydration State
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Zero-Latency Perceptual Hydration
    // Allow React to mount, then trigger the unblur portal entrance
    const hydrationTimer = setTimeout(() => {
      setIsHydrated(true);
    }, 50);
    return () => clearTimeout(hydrationTimer);
  }, []);

  // Dual-Date Engine State
  const [checkIn, setCheckIn] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState<string>(() => new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]);
  const [guests, setGuests] = useState<number>(1);
  const [showMobileBookingSheet, setShowMobileBookingSheet] = useState(false);
  
  // Black Card Concierge Addons
  const [requestConcierge, setRequestConcierge] = useState(false);

  // Soft Exit Lead Capture State
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [exitEmail, setExitEmail] = useState('');
  const [submittingExitLead, setSubmittingExitLead] = useState(false);
  const [exitLeadSuccess, setExitLeadSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Ledger Strict Math (15% SaaS Optimization Fee + 18% Tax)
  const getDays = () => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  const nights = getDays();
  const basePrice = listing.displayPrice || listing.price;
  const baseRentTotal = basePrice * nights;
  const enchoFee = Math.round(baseRentTotal * 0.15); // 15% Master Account Optimization Fee
  const taxAmount = Math.round(baseRentTotal * 0.18); // 18% Standard Tax
  const grandTotal = baseRentTotal + enchoFee + taxAmount;

  const handleReserve = () => {
    uiAudio.playSuccess();
    if (onBook) {
      onBook({
        isStartCheckout: true,
        moveInDate: checkIn,
        checkOutDate: checkOut,
        configuration: listing.rental_mode === 'private_rooms' ? 'Selected Suite' : 'Entire Sanctuary',
        totalRent: grandTotal,
        baseRent: baseRentTotal,
        fees: enchoFee,
        taxes: taxAmount,
        guests: guests,
        name: '',
        phone: ''
      });
    }
  };

  // Normalize Images
  const rawImages = listing.imageUrls && listing.imageUrls.length > 0
    ? listing.imageUrls
    : (listing.imageUrl ? [listing.imageUrl] : FALLBACK_IMAGES);

  const images = rawImages.length >= 5
    ? rawImages
    : [...rawImages, ...FALLBACK_IMAGES.slice(rawImages.length)];

  const heroFallbackImage = listing.hero_fallback_url || images[0];

  // Parse Curated Guidelines
  const parsedGuidelines: string[] = React.useMemo(() => {
    if (Array.isArray(listing.curated_guidelines)) {
      return listing.curated_guidelines;
    }
    if (typeof listing.curated_guidelines === 'string' && listing.curated_guidelines.trim()) {
      try {
        const parsed = JSON.parse(listing.curated_guidelines);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return listing.curated_guidelines.split('\n').filter(Boolean);
      }
    }
    return [
      'Pure Atmospheric Harmony: Uninterrupted tranquility is preserved throughout the sanctuary grounds.',
      'Curated Climate Control: Intelligent smart climate maintains optimal botanical humidity and airflow.',
      'Bespoke Sanctuary Attire: We invite guests to honor the minimalist floors with our handcrafted linen slippers.'
    ];
  }, [listing.curated_guidelines]);

  // Sensory Tags
  const sensoryTags: string[] = React.useMemo(() => {
    if (Array.isArray(listing.experience_tags) && listing.experience_tags.length > 0) {
      return listing.experience_tags;
    }
    return ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'];
  }, [listing.experience_tags]);

  // Live Socket connection
  useEffect(() => {
    if (!socket) socket = io();
    socket.emit('join_listing', listing.id);

    const handleViewers = (data: { viewers: number }) => {
      setLiveViewers(Math.max(2, data.viewers));
    };

    socket.on('listing_viewers', handleViewers);

    return () => {
      socket.off('listing_viewers', handleViewers);
      socket.emit('leave_listing', listing.id);
    };
  }, [listing.id]);

  // DCO / Retargeting Pixel on Mount
  useEffect(() => {
    fetch('/api/marketing/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id })
    }).catch(console.error);
  }, [listing.id]);

  // Desktop Exit Intent & Mobile Timer for Soft Exit Lead Capture
  useEffect(() => {
    const dismissedKey = `encho_soft_exit_dismissed_${listing.id}`;
    if (sessionStorage.getItem(dismissedKey)) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 10 && !sessionStorage.getItem(dismissedKey)) {
        setExitModalOpen(true);
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);

    // Mobile fallback: trigger after 45s idle engagement
    const mobileTimer = setTimeout(() => {
      if (window.innerWidth < 768 && !sessionStorage.getItem(dismissedKey)) {
        setExitModalOpen(true);
      }
    }, 45000);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      clearTimeout(mobileTimer);
    };
  }, [listing.id]);

  const handleDismissExitModal = () => {
    setExitModalOpen(false);
    sessionStorage.setItem(`encho_soft_exit_dismissed_${listing.id}`, 'true');
  };

  const handleSoftExitLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitEmail || !exitEmail.includes('@')) {
      addToast('Please enter a valid email address', 'error');
      return;
    }
    setSubmittingExitLead(true);
    try {
      const res = await fetch('/api/leads/soft-exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          email: exitEmail,
          source: 'exit_intent_vip_lookbook'
        })
      });
      if (res.ok) {
        setExitLeadSuccess(true);
        sessionStorage.setItem(`encho_soft_exit_dismissed_${listing.id}`, 'true');
        addToast('VIP Lookbook & Secret Dates dispatched to your inbox!', 'success');
        setTimeout(() => {
          setExitModalOpen(false);
        }, 2200);
      } else {
        addToast('Failed to save email. Please try again.', 'error');
      }
    } catch (err) {
      console.error('Lead submit error:', err);
      addToast('Network error saving email', 'error');
    } finally {
      setSubmittingExitLead(false);
    }
  };

  const openLightbox = (index: number) => {
    uiAudio.playClick();
    setLightboxIndex(index);
    setGalleryOpen(true);
    trackPhotoView(index);
  };

  return (
    <>
      <SEO
        title={listing.seo_title || `${listing.title} | Encho Sanctuary`}
        description={listing.seo_description || listing.description?.substring(0, 160)}
        image={listing.seo_image_url || listing.hero_fallback_url || images[0]}
        keywords={listing.seo_keywords || `luxury sanctuary, ${listing.city}, ${listing.title}, 5 star retreat`}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap');
        .font-editorial {
          font-family: 'Playfair Display', serif;
        }
      `}</style>

      <div
        className="min-h-screen pb-32 font-sans antialiased text-slate-900 selection:bg-amber-500/20 relative"
        style={{
          backgroundColor: '#fafafa',
          backgroundImage: `radial-gradient(circle at 50% 0%, ${dominantColor}12 0%, transparent 60%)`,
          opacity: isHydrated ? 1 : 0,
          filter: isHydrated ? 'blur(0px)' : 'blur(20px)',
          transform: isHydrated ? 'scale(1)' : 'scale(1.02)',
          transition: 'opacity 0.8s ease-out, filter 1.2s cubic-bezier(0.22, 1, 0.36, 1), transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      >
        {/* Sticky Mobile/Desktop Top Floating Bar */}
        <div className="absolute top-0 inset-x-0 z-[50] flex items-center justify-between p-4 mt-2 md:mt-6 pointer-events-none md:max-w-7xl md:mx-auto">
          <button
            onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
            className="w-11 h-11 rounded-full bg-white/80 backdrop-blur-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] pointer-events-auto active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/60 text-slate-900"
            title="Back to exploration"
          >
            <ChevronLeft className="w-6 h-6 pr-0.5" />
          </button>

          <div className="flex gap-2.5 md:gap-3 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                uiAudio.playClick();
                if (navigator.share) {
                  navigator.share({ title: listing.title, url: window.location.href }).catch(console.error);
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  addToast('Sanctuary Link Copied to clipboard!', 'success');
                }
              }}
              className="w-11 h-11 rounded-full bg-white/80 backdrop-blur-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/60 text-slate-900"
              title="Share sanctuary"
            >
              <Share className="w-4.5 h-4.5" strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                uiAudio.playPop();
                if (onToggleFavorite) onToggleFavorite(listing);
              }}
              className="w-11 h-11 rounded-full bg-white/80 backdrop-blur-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/60"
              title={isFavorite ? 'Remove from collection' : 'Save to collection'}
            >
              <HeartIcon className={`w-5.5 h-5.5 ${isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-slate-900'}`} filled={isFavorite} />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. CINEMATIC HERO EXPERIENCE ("The Hook" — 10.0 Aman Standard) */}
        {/* ========================================================================= */}
        <div className="w-full md:max-w-7xl mx-auto md:px-6 lg:px-8 md:pt-6">
          {/* Desktop Bento Grid Hero */}
          <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-3 h-[70vh] lg:h-[78vh] rounded-3xl overflow-hidden bg-slate-950 shadow-2xl relative group border border-slate-200/50">
            {/* Primary Hero Viewport (Cinematic Video or Fallback Image) */}
            <div className="col-span-2 row-span-2 relative h-full overflow-hidden bg-slate-900 cursor-pointer" onClick={() => openLightbox(0)}>
              {/* Fallback Image (always loaded as background foundation) */}
              <img
                src={heroFallbackImage}
                alt={`${listing.title} Hero View`}
                className={`w-full h-full object-cover transition-transform duration-1000 group-hover:scale-[1.02] ${videoReady && listing.hero_video_url ? 'opacity-0' : 'opacity-100'}`}
              />

              {/* Seamless Video Loop Layer */}
              {listing.hero_video_url && (
                <video
                  ref={videoRef}
                  src={listing.hero_video_url}
                  autoPlay
                  loop
                  muted={isVideoMuted}
                  playsInline
                  onLoadedData={() => setVideoReady(true)}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
                />
              )}

              {/* Dynamic Chameleon Gradient Vignette */}
              <div
                className="absolute inset-0 pointer-events-none opacity-30 mix-blend-overlay"
                style={{ backgroundColor: dominantColor }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

              {/* Audio Controls for Video Loop */}
              {listing.hero_video_url && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    uiAudio.playClick();
                    setIsVideoMuted(!isVideoMuted);
                  }}
                  className="absolute bottom-6 right-6 z-20 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white flex items-center gap-2 text-xs font-bold transition-all shadow-lg active:scale-95"
                >
                  {isVideoMuted ? <VolumeX className="w-4 h-4 text-slate-300" /> : <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />}
                  <span>{isVideoMuted ? 'Atmosphere Muted' : 'Live Sanctuary Audio'}</span>
                </button>
              )}

              {/* Verified Sanctuary Status Badge */}
              <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2 pointer-events-none">
                <div className="bg-white/90 backdrop-blur-xl px-4 py-2 rounded-xl shadow-lg border border-white/40 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-black tracking-widest text-slate-900 uppercase">100% In-Person Verified</span>
                </div>
              </div>
            </div>

            {/* Sub-Image Tiles */}
            <div className="relative overflow-hidden h-full cursor-pointer group/tile" onClick={() => openLightbox(1)}>
              <OptimizedImage src={images[1]} aspectRatio="16:9" className="w-full h-full object-cover group-hover/tile:scale-105 duration-700 transition-transform" alt="Sanctuary Vista 2" />
              <div className="absolute inset-0 bg-black/10 group-hover/tile:bg-black/0 transition-colors" />
            </div>
            <div className="relative overflow-hidden h-full cursor-pointer group/tile" onClick={() => openLightbox(2)}>
              <OptimizedImage src={images[2]} aspectRatio="16:9" className="w-full h-full object-cover group-hover/tile:scale-105 duration-700 transition-transform" alt="Sanctuary Vista 3" />
              <div className="absolute inset-0 bg-black/10 group-hover/tile:bg-black/0 transition-colors" />
            </div>
            <div className="relative overflow-hidden h-full cursor-pointer group/tile" onClick={() => openLightbox(3)}>
              <OptimizedImage src={images[3]} aspectRatio="16:9" className="w-full h-full object-cover group-hover/tile:scale-105 duration-700 transition-transform" alt="Sanctuary Vista 4" />
              <div className="absolute inset-0 bg-black/10 group-hover/tile:bg-black/0 transition-colors" />
            </div>

            {/* Gallery Fullview Trigger Tile */}
            <div className="relative overflow-hidden h-full group/gallery cursor-pointer" onClick={() => openLightbox(4)}>
              <OptimizedImage src={images[4]} aspectRatio="16:9" className="w-full h-full object-cover transition-transform duration-700 group-hover/gallery:scale-105 group-hover/gallery:blur-xs" alt="Sanctuary Vista 5" />
              <div className="absolute inset-0 bg-black/30 group-hover/gallery:bg-black/40 transition-colors duration-500" />
              <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-xl border border-white/60 text-slate-900 px-5 py-3 rounded-2xl flex items-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95 transition-transform">
                <ImageIcon className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-extrabold uppercase tracking-wider">All Photos ({images.length})</span>
              </div>
            </div>

            {/* Live Social Viewers Badge */}
            {liveViewers > 1 && (
              <div className="absolute top-6 right-6 bg-slate-950/80 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2.5 border border-white/15 shadow-2xl animate-fade-in pointer-events-none z-20">
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </div>
                <span className="text-[11px] font-black tracking-widest text-white uppercase">{liveViewers} Exploring Right Now</span>
              </div>
            )}
          </div>

          {/* Mobile Swipe Canvas Hero */}
          <div className="md:hidden relative w-full aspect-[4/5] bg-slate-950 overflow-hidden">
            {listing.hero_video_url && activeMobileImage === 0 ? (
              <div className="w-full h-full relative" onClick={() => openLightbox(0)}>
                <video
                  src={listing.hero_video_url}
                  autoPlay
                  loop
                  muted={isVideoMuted}
                  playsInline
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsVideoMuted(!isVideoMuted);
                  }}
                  className="absolute bottom-6 right-4 z-20 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1.5"
                >
                  {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{isVideoMuted ? 'Muted' : 'Audio On'}</span>
                </button>
              </div>
            ) : (
              <div
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full h-full"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                onScroll={(e) => {
                  const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                  const width = (e.target as HTMLDivElement).clientWidth;
                  const idx = Math.round(scrollLeft / width);
                  if (idx !== activeMobileImage) {
                    setActiveMobileImage(idx);
                    trackPhotoView(idx);
                  }
                }}
              >
                {images.map((img, i) => (
                  <div key={i} className="w-full h-full flex-shrink-0 snap-center relative" onClick={() => openLightbox(i)}>
                    <OptimizedImage
                      src={img}
                      aspectRatio="9:16"
                      priority={i === 0}
                      className="w-full h-full object-cover"
                      alt={`Sanctuary Image ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Mobile Indicators */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
              <div className="flex gap-1.5 bg-black/40 backdrop-blur-xl px-3 py-1.5 rounded-full">
                {images.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${activeMobileImage === i ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
                ))}
              </div>
            </div>

            <div className="absolute bottom-6 left-4 bg-white/90 backdrop-blur-xl px-3 py-1 rounded-lg shadow-sm border border-white/40 flex items-center gap-1.5 pointer-events-none">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-[10px] font-black tracking-wider text-slate-900 uppercase">Verified</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. MAIN CONTENT & FLOATING CONCIERGE DOCK */}
        {/* ========================================================================= */}
        <div className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-8 md:mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left Column (Editorial & Atmospheric Storytelling) */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-10">
            {/* Sanctuary Header & Location Anchor */}
            <div className="space-y-3 pb-6 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <span
                  className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-xs"
                  style={{ backgroundColor: dominantColor }}
                >
                  {listing.type || 'Private Sanctuary'}
                </span>
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {listing.city}, {listing.address || 'Exclusive District'}
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.1] font-editorial">
                {listing.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-600 pt-1">
                <span>{listing.maxGuests || 4} Guests</span>
                <span>•</span>
                <span>{listing.bedrooms || 2} Suites</span>
                <span>•</span>
                <span>{listing.beds || 2} King Beds</span>
                <span>•</span>
                <span>{listing.bathrooms || 2} Marble Baths</span>
                {listing.size && (
                  <>
                    <span>•</span>
                    <span>{listing.size} sq.ft</span>
                  </>
                )}
              </div>
            </div>

            {/* SENSORY ATMOSPHERE DECK (Tactile Chips) */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" style={{ color: dominantColor }} />
                  <span>Sensory Atmosphere Deck</span>
                </h2>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aman Standard</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sensoryTags.map((tag, idx) => {
                  const IconComponent = getTagIcon(tag);
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex items-center gap-3 group"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 shadow-xs"
                        style={{
                          backgroundColor: `${dominantColor}15`,
                          color: dominantColor
                        }}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-tight leading-snug">{tag}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* EDITORIAL STORY / DESCRIPTION */}
            <section className="space-y-4 pt-4">
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">About The Sanctuary</h2>
              <div className="prose prose-slate max-w-none text-slate-600 font-medium leading-relaxed space-y-4 text-base">
                <p>{listing.description || "Designed as an acoustic and visual haven, this architectural masterpiece seamlessly merges raw volcanic stone, floor-to-ceiling glass, and tranquil open-air living."}</p>
              </div>
            </section>

            {/* ARISTOCRATIC AI HOSPITALITY GUIDELINES */}
            <section className="p-6 md:p-8 rounded-3xl bg-slate-900 text-slate-100 border border-amber-500/30 space-y-6 shadow-xl relative overflow-hidden">
              <div
                className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none rounded-full blur-3xl"
                style={{ backgroundColor: dominantColor }}
              />

              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-wide font-editorial">Aristocratic Hospitality Guidelines</h3>
                    <p className="text-xs text-slate-400">AI-Curated House Protocols for 5-Star Serenity</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Concierge Curated
                </span>
              </div>

              <div className="space-y-3 relative z-10">
                {parsedGuidelines.map((guideline, idx) => (
                  <div key={idx} className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-amber-400 font-editorial font-bold text-sm shrink-0 mt-0.5">0{idx + 1}.</span>
                    <p className="text-xs md:text-sm text-slate-200 font-medium leading-relaxed">{guideline}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ANALYTICAL TRUST ANCHOR */}
            <section className="space-y-4 pt-4">
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 font-editorial">Encho Trust & Safety Anchor</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">100% In-Person Verified</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Physically audited by Encho luxury architects for structural integrity and high-fidelity listing truth.</p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 border border-cyan-100">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Walled Garden Escrow</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Payments are locked in secure host escrow until 24 hours after seamless check-in confirmation.</p>
                  </div>
                </div>
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
                      <h3 className="text-lg font-black text-slate-900">{listing.provider || 'Encho Verified Host'}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">Superhost</span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Sanctuary Curator · Fast response under 5 mins</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    if (onContactHost) onContactHost();
                  }}
                  className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Message Concierge</span>
                </button>
              </div>

              {/* Host Editorial Quote */}
              <div className="p-4 rounded-2xl bg-slate-50 border-l-4 border-amber-500 italic text-sm md:text-base text-slate-800 font-editorial leading-relaxed">
                "{listing.editorial_quote || "Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional."}"
              </div>
            </section>

            {/* TACTILE SPATIAL BLUEPRINT & SUNSET SIMULATOR */}
            <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 font-editorial">Spatial Blueprint & Solar Trajectory</h2>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 16:45 Local Time
                </span>
              </div>
              <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 blur-3xl rounded-full transform translate-x-1/3 -translate-y-1/3 pointer-events-none transition-transform duration-1000 group-hover:translate-x-1/4" />
                
                <div className="flex flex-col md:flex-row gap-8 items-center justify-between relative z-10">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight">Golden Hour Alignment</h4>
                        <p className="text-xs text-slate-400">Master suite faces South-West for optimal sunset immersion.</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
                        <Navigation className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight">Acoustic Shielding</h4>
                        <p className="text-xs text-slate-400">Triple-glazed structural glass limits ambient noise to 32dB.</p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-48 h-48 rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm flex items-center justify-center relative overflow-hidden shrink-0">
                    {/* Conceptual Architectural Floorplan Lines */}
                    <svg className="w-32 h-32 text-slate-600 opacity-50" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1">
                      <rect x="20" y="20" width="60" height="60" />
                      <line x1="20" y1="50" x2="40" y2="50" />
                      <line x1="50" y1="20" x2="50" y2="40" />
                      <circle cx="65" cy="65" r="5" />
                      <path d="M 80 40 Q 60 40 60 60" />
                    </svg>
                    
                    {/* Simulated Sun Angle Tracker */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-1/2 left-1/2 w-40 h-1 bg-amber-500/20 transform -translate-x-1/2 -translate-y-1/2 rotate-45" />
                      <div className="absolute top-[20%] right-[20%] w-3 h-3 bg-amber-400 rounded-full shadow-[0_0_15px_rgba(251,191,36,0.8)] animate-pulse" />
                    </div>
                    
                    <div className="absolute bottom-3 right-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Telemetry Active
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* NEIGHBORHOOD RADAR */}
            <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Neighborhood Radar</h2>
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-cyan-600" /> {listing.city}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(listing.nearby && listing.nearby.length > 0 ? listing.nearby : [
                  { name: 'Secluded Beach Cove', distance: '4 min walk', type: 'COAST' },
                  { name: 'Private Helipad', distance: '8 min drive', type: 'AIR' },
                  { name: 'Organic Vineyard', distance: '12 min drive', type: 'DINE' }
                ]).map((poi, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{poi.type}</span>
                    <h4 className="text-xs font-bold text-slate-900 truncate mt-0.5">{poi.name}</h4>
                    <p className="text-xs font-bold text-cyan-700 mt-1">{poi.distance}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SIMILAR SANCTUARIES */}
            {similarListings && similarListings.length > 0 && (
              <section className="space-y-4 pt-6 border-t border-slate-200">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Curated Peer Sanctuaries</h2>
                <div className="flex overflow-x-auto snap-x gap-4 pb-4 scrollbar-hide">
                  {similarListings.map(sim => (
                    <div
                      key={sim.id}
                      onClick={() => { uiAudio.playClick(); if (onListingClick) onListingClick(sim); }}
                      className="snap-start shrink-0 w-[260px] md:w-[290px] cursor-pointer group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all"
                    >
                      <div className="relative w-full aspect-[4/3] overflow-hidden bg-slate-900">
                        <OptimizedImage
                          src={sim.imageUrls?.[0] || sim.imageUrl}
                          aspectRatio="4:3"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt={sim.title}
                        />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-900 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>{sim.rating?.toFixed(1) || '4.9'}</span>
                        </div>
                      </div>
                      <div className="p-4">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{sim.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{sim.city}</p>
                        <p className="text-xs font-black text-slate-900 mt-2">{formatPrice(sim.price, sim.currency || 'INR')} <span className="font-normal text-slate-400">/ night</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: BLACK CARD FLOATING VAULT CONCIERGE (Desktop Sticky) */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 relative">
            <div className="sticky top-28 bg-zinc-950/80 backdrop-blur-3xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.5)] rounded-3xl p-7 space-y-6 relative overflow-hidden group">
              {/* Metallic Sheen Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none transform -translate-x-full group-hover:translate-x-full" style={{ transitionProperty: 'opacity, transform' }} />
              
              <div className="flex items-baseline justify-between relative z-10">
                <div>
                  <span className="text-3xl font-black text-white tracking-tight font-editorial">{formatPrice(basePrice, listing.currency || 'INR')}</span>
                  <span className="text-xs text-slate-400 font-semibold ml-1.5">/ night</span>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-300">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>{listing.rating?.toFixed(2) || '4.95'}</span>
                  <span className="text-slate-500">({listing.reviewCount || 48})</span>
                </div>
              </div>

              {/* Dual-Date Range Selector */}
              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/10 relative z-10">
                <div className="grid grid-cols-2 divide-x divide-white/10">
                  <div className="p-3.5 hover:bg-white/5 transition-colors">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Check-in</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={checkIn}
                      onChange={(e) => {
                        setCheckIn(e.target.value);
                        trackDateSelection(e.target.value, checkOut);
                      }}
                      className="w-full bg-transparent border-0 p-0 text-xs font-bold text-white focus:ring-0 cursor-pointer"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="p-3.5 hover:bg-white/5 transition-colors">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Check-out</label>
                    <input
                      type="date"
                      min={checkIn}
                      value={checkOut}
                      onChange={(e) => {
                        setCheckOut(e.target.value);
                        trackDateSelection(checkIn, e.target.value);
                      }}
                      className="w-full bg-transparent border-0 p-0 text-xs font-bold text-white focus:ring-0 cursor-pointer"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>

                <div className="p-3.5 hover:bg-white/5 transition-colors">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Guests</label>
                  <select
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full bg-transparent border-0 p-0 text-xs font-bold text-white focus:ring-0 cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                      <option key={n} value={n} className="bg-zinc-900 text-white">{n} Guest{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Private Concierge Toggle */}
              <div 
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between relative z-10 ${requestConcierge ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                onClick={() => {
                  uiAudio.playClick();
                  setRequestConcierge(!requestConcierge);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${requestConcierge ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-slate-400'}`}>
                    <Crown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${requestConcierge ? 'text-amber-400' : 'text-slate-300'}`}>Private Butler & Transfer</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Helicopter arrival & 24/7 staff</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${requestConcierge ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${requestConcierge ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>

              {/* Dynamic Chameleon Reserve Action Button */}
              <button
                type="button"
                onClick={handleReserve}
                className="w-full text-slate-900 font-black py-4 px-6 rounded-2xl shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm tracking-wide relative z-10 hover:brightness-110"
                style={{
                  background: `linear-gradient(135deg, ${dominantColor} 0%, #fff 100%)`
                }}
              >
                <CreditCard className="w-4 h-4" />
                <span>Reserve Sanctuary</span>
              </button>

              <p className="text-[11px] text-slate-500 text-center font-medium relative z-10">100% Escrow Protected • You won't be charged yet</p>

              {/* Strict Ledger Breakdown */}
              <div className="space-y-3 pt-2 text-xs text-slate-400 font-medium relative z-10">
                <div className="flex justify-between">
                  <span>{formatPrice(basePrice, listing.currency || 'INR')} × {nights} night{nights > 1 ? 's' : ''}</span>
                  <span className="font-bold text-white">{formatPrice(baseRentTotal, listing.currency || 'INR')}</span>
                </div>
                {requestConcierge && (
                  <div className="flex justify-between text-amber-400/80">
                    <span>Concierge Retainer (Est.)</span>
                    <span className="font-bold">{formatPrice(15000, listing.currency || 'INR')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">Encho Optimization Fee (15%)</span>
                  <span className="font-bold text-white">{formatPrice(enchoFee, listing.currency || 'INR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>State & Hospitality Tax (18%)</span>
                  <span className="font-bold text-white">{formatPrice(taxAmount, listing.currency || 'INR')}</span>
                </div>

                <div className="h-px bg-white/10 my-2" />

                <div className="flex justify-between items-center text-sm font-black text-white pt-1">
                  <span>Total Investment</span>
                  <span className="text-lg font-black font-editorial" style={{ color: dominantColor }}>
                    {formatPrice(grandTotal + (requestConcierge ? 15000 : 0), listing.currency || 'INR')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. MOBILE STICKY BOTTOM DOCK */}
        {/* ========================================================================= */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 p-4 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-slate-900">{formatPrice(basePrice, listing.currency || 'INR')}</span>
                <span className="text-xs text-slate-500 font-semibold">/ night</span>
              </div>
              <span className="text-[11px] font-bold text-cyan-700">
                {nights} night{nights > 1 ? 's' : ''} • {formatPrice(grandTotal, listing.currency || 'INR')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleReserve}
              className="flex-1 max-w-[180px] py-3.5 px-6 rounded-xl text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all text-center"
              style={{
                background: `linear-gradient(135deg, ${dominantColor} 0%, #0f172a 100%)`
              }}
            >
              Reserve
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. SOFT EXIT LEAD CAPTURE MODAL ("The Safety Net") */}
        {/* ========================================================================= */}
        {exitModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[120] p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 text-slate-100 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-amber-500/40 relative">
              <button
                type="button"
                onClick={handleDismissExitModal}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors z-20"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-8 space-y-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Crown className="w-7 h-7" />
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">Private Member Lookbook</span>
                  <h3 className="text-2xl font-black text-white tracking-tight leading-snug">
                    Unlock VIP Off-Market Dates for {listing.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Leave your private email to receive our unlisted architectural lookbook and private concierge pricing directly in your inbox.
                  </p>
                </div>

                {exitLeadSuccess ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-center font-bold text-xs flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> VIP Lookbook dispatched! Check your inbox shortly.
                  </div>
                ) : (
                  <form onSubmit={handleSoftExitLeadSubmit} className="space-y-3">
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
                      <input
                        type="email"
                        required
                        value={exitEmail}
                        onChange={e => setExitEmail(e.target.value)}
                        placeholder="Enter your VIP email address..."
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingExitLead}
                      className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      {submittingExitLead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>{submittingExitLead ? 'Dispatching...' : 'Send Private VIP Lookbook'}</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. FULLSCREEN LUXURY LIGHTBOX GALLERY */}
        {/* ========================================================================= */}
        {galleryOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[130] flex flex-col p-4 md:p-8 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                {lightboxIndex + 1} / {images.length} • {listing.title}
              </span>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center relative my-auto">
              <button
                type="button"
                onClick={() => setLightboxIndex(prev => (prev === 0 ? images.length - 1 : prev - 1))}
                className="absolute left-4 p-3 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all z-20"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="max-w-5xl max-h-[80vh] overflow-hidden rounded-2xl">
                <img
                  src={images[lightboxIndex]}
                  alt={`Gallery View ${lightboxIndex + 1}`}
                  className="w-full h-full object-contain max-h-[80vh]"
                />
              </div>

              <button
                type="button"
                onClick={() => setLightboxIndex(prev => (prev === images.length - 1 ? 0 : prev + 1))}
                className="absolute right-4 p-3 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all z-20"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Thumbnail strip */}
            <div className="flex justify-center gap-2 overflow-x-auto py-2">
              {images.map((thumb, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className={`w-14 h-10 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${lightboxIndex === idx ? 'border-amber-400 scale-105' : 'border-transparent opacity-50'}`}
                >
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export const ListingDetailsNew: React.FC<ListingDetailsNewProps> = (props) => {
  return (
    <ListingErrorBoundary>
      <ListingDetailsNewContent {...props} />
    </ListingErrorBoundary>
  );
};

export default ListingDetailsNew;
