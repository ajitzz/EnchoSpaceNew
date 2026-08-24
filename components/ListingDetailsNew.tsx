import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Crown,
  Plus,
  Minus
} from 'lucide-react';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';

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

const getTagIcon = (tag: string) => {
  const lower = tag.toLowerCase();
  if (lower.includes('ocean') || lower.includes('sea') || lower.includes('water') || lower.includes('beach')) return Waves;
  if (lower.includes('chef') || lower.includes('kitchen') || lower.includes('dining') || lower.includes('culinary')) return Utensils;
  if (lower.includes('pool') || lower.includes('infinity') || lower.includes('jacuzzi') || lower.includes('spa')) return Waves;
  if (lower.includes('wifi') || lower.includes('speed') || lower.includes('internet') || lower.includes('fiber')) return Wifi;
  if (lower.includes('mountain') || lower.includes('view') || lower.includes('vistas') || lower.includes('panoramic')) return Mountain;
  if (lower.includes('wine') || lower.includes('bar') || lower.includes('cellar')) return Wine;
  return Sparkles;
};

const LUXURY_BACKUP_POOL = [
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1506059612708-99d6c258160e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80"
];
const DEFAULT_IMAGES = LUXURY_BACKUP_POOL.slice(0, 5);

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
  const { trackPhotoView, trackDateSelection } = useListingTelemetry(listing.id);
  const [liveViewers, setLiveViewers] = useState(1);
  const [activeMobileImage, setActiveMobileImage] = useState(0);

  // Chameleon UI Dynamic Dominant Color
  const dominantColor = listing.dominant_color_hex || '#06b6d4';
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [activeGalleryTab, setActiveGalleryTab] = useState('all');
  const [activeSlide, setActiveSlide] = useState(0);


  // 10/10 Adaptive Media Allocator: Guarantees zero duplicate images across all collections
  const uniqueMediaPool = useMemo(() => {
    const raw = (listing.imageUrls && listing.imageUrls.length > 0)
      ? listing.imageUrls
      : (listing.imageUrl ? [listing.imageUrl] : []);
    
    const combined = [...raw];
    // Fill remaining slots with distinct luxury assets from pool
    for (const backup of LUXURY_BACKUP_POOL) {
      if (combined.length >= 24) break;
      if (!combined.includes(backup)) {
        combined.push(backup);
      }
    }
    return combined;
  }, [listing.imageUrls, listing.imageUrl]);

  const images = uniqueMediaPool;

  // Curated Space Collections for Sliding Bento Gallery
  const slideCollections = useMemo(() => [
    {
      id: 'vistas',
      name: 'Architectural Vistas & Grounds',
      space01: {
        title: `${listing.title} Infinity Reflection Pool`,
        desc: 'Panoramic horizon pool with temperature-controlled heating and stone daybeds.',
        img: uniqueMediaPool[0],
        imgIndex: 0,
        tag: 'Infinity Vista',
        hasVideo: !!listing.video_url
      },
      space02: {
        title: 'Open-Air Central Courtyard',
        img: uniqueMediaPool[1],
        imgIndex: 1,
        tag: 'Courtyard'
      },
      space03: {
        title: 'Sunken Fire Lounge Deck',
        img: uniqueMediaPool[2],
        imgIndex: 2,
        tag: 'Fire Deck'
      },
      space04: {
        title: 'Artisanal Sandstone Architectural Facade',
        img: uniqueMediaPool[3],
        imgIndex: 3,
        tag: 'Facade Panorama'
      }
    },
    {
      id: 'suites',
      name: 'Master Living & Royal Suites',
      space01: {
        title: 'Presidential Master Suite Vista',
        desc: 'Custom king platform bed, panoramic glass vistas, and circadian lighting systems.',
        img: uniqueMediaPool[4],
        imgIndex: 4,
        tag: 'Master Suite'
      },
      space02: {
        title: 'Central Living Pavilion',
        img: uniqueMediaPool[5],
        imgIndex: 5,
        tag: 'Living Salon'
      },
      space03: {
        title: 'En-Suite Marble Rain Spa',
        img: uniqueMediaPool[6],
        imgIndex: 6,
        tag: 'Spa Bath'
      },
      space04: {
        title: 'Private Sunset Viewing Terrace',
        img: uniqueMediaPool[7],
        imgIndex: 7,
        tag: 'Private Terrace'
      }
    },
    {
      id: 'wellness',
      name: 'Wellness, Spa & Bespoke Dining',
      space01: {
        title: 'Private Chef Dining Pavilion',
        desc: 'Custom oak dining table seating 10, serviced by our dedicated private culinary brigade.',
        img: uniqueMediaPool[8],
        imgIndex: 8,
        tag: 'Culinary Deck'
      },
      space02: {
        title: 'Sommelier Wine Vault & Bar',
        img: uniqueMediaPool[9],
        imgIndex: 9,
        tag: 'Wine Cellar'
      },
      space03: {
        title: 'Cedar Sauna & Cold Plunge',
        img: uniqueMediaPool[10],
        imgIndex: 10,
        tag: 'Thermal Spa'
      },
      space04: {
        title: 'Evening Acoustic Stillness & Stargazing',
        img: uniqueMediaPool[11],
        imgIndex: 11,
        tag: 'Night Atmosphere'
      }
    }
  ], [uniqueMediaPool, listing.title, listing.video_url]);

    const mobileGalleryRef = useRef<HTMLDivElement>(null);
  const [mobileSpaceIndex, setMobileSpaceIndex] = useState(0);

  // Pure 12-Space Continuous Media Stream (Zero Fake Text Cards)
  const mobileContinuousSpaces = useMemo(() => [
    { space: slideCollections[0].space01, collectionIdx: 0, globalIdx: 1, subIdx: 1, chapterName: '01 · Architectural Vistas & Grounds', isChapterStart: true },
    { space: slideCollections[0].space02, collectionIdx: 0, globalIdx: 2, subIdx: 2, chapterName: '01 · Architectural Vistas & Grounds', isChapterStart: false },
    { space: slideCollections[0].space03, collectionIdx: 0, globalIdx: 3, subIdx: 3, chapterName: '01 · Architectural Vistas & Grounds', isChapterStart: false },
    { space: slideCollections[0].space04, collectionIdx: 0, globalIdx: 4, subIdx: 4, chapterName: '01 · Architectural Vistas & Grounds', isChapterStart: false },
    { space: slideCollections[1].space01, collectionIdx: 1, globalIdx: 5, subIdx: 1, chapterName: '02 · Master Living & Royal Suites', isChapterStart: true },
    { space: slideCollections[1].space02, collectionIdx: 1, globalIdx: 6, subIdx: 2, chapterName: '02 · Master Living & Royal Suites', isChapterStart: false },
    { space: slideCollections[1].space03, collectionIdx: 1, globalIdx: 7, subIdx: 3, chapterName: '02 · Master Living & Royal Suites', isChapterStart: false },
    { space: slideCollections[1].space04, collectionIdx: 1, globalIdx: 8, subIdx: 4, chapterName: '02 · Master Living & Royal Suites', isChapterStart: false },
    { space: slideCollections[2].space01, collectionIdx: 2, globalIdx: 9, subIdx: 1, chapterName: '03 · Wellness, Spa & Bespoke Dining', isChapterStart: true },
    { space: slideCollections[2].space02, collectionIdx: 2, globalIdx: 10, subIdx: 2, chapterName: '03 · Wellness, Spa & Bespoke Dining', isChapterStart: false },
    { space: slideCollections[2].space03, collectionIdx: 2, globalIdx: 11, subIdx: 3, chapterName: '03 · Wellness, Spa & Bespoke Dining', isChapterStart: false },
    { space: slideCollections[2].space04, collectionIdx: 2, globalIdx: 12, subIdx: 4, chapterName: '03 · Wellness, Spa & Bespoke Dining', isChapterStart: false }
  ], [slideCollections]);

  const handleMobileScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollLeft = target.scrollLeft;
    const cardWidth = target.clientWidth * 0.85;
    const currentIdx = Math.min(Math.max(Math.round(scrollLeft / cardWidth), 0), 11);

    setMobileSpaceIndex(currentIdx);

    if (currentIdx >= 8) {
      if (activeSlide !== 2) setActiveSlide(2);
    } else if (currentIdx >= 4) {
      if (activeSlide !== 1) setActiveSlide(1);
    } else {
      if (activeSlide !== 0) setActiveSlide(0);
    }
  };

  const handleCategoryPillClick = (idx: number) => {
    uiAudio.playClick();
    setActiveSlide(idx);
    if (mobileGalleryRef.current) {
      const targetIndices = [0, 4, 8];
      const targetCard = mobileGalleryRef.current.children[targetIndices[idx]] as HTMLElement;
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showFloatingCapsule, setShowFloatingCapsule] = useState(false);
  const zone1Ref = useRef<HTMLDivElement>(null);

  // Scroll listener for smooth bi-directional morphing of Booking Dock
  useEffect(() => {
    const handleScroll = () => {
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
    return ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'];
  }, [listing.experience_tags]);

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
    return [
      "Footwear must be removed before entering residential pavilions.",
      "Acoustic serenity is requested after 10:00 PM for all guests.",
      "Professional drone photography requires prior concierge clearance.",
      "Eco-conscious air conditioning: Please close pavilion doors when active."
    ];
  }, [listing.curated_guidelines]);

  // Accordion state
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

  // Live Viewers Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveViewers(Math.floor(Math.random() * 5) + 2);
    }, 15000);
    return () => clearInterval(interval);
  }, []);



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
  const [guests, setGuests] = useState<number>(1);

  // Double-Entry Ledger Calculation
  const basePrice = listing.displayPrice ?? listing.price;
  const nights = useMemo(() => {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [checkIn, checkOut]);

  const baseRentTotal = basePrice * nights;
  const enchoFee = Math.round(baseRentTotal * 0.15); // 15% SaaS Optimization Fee
  const taxAmount = Math.round((baseRentTotal + enchoFee) * 0.18); // 18% Statutory GST
  const grandTotal = baseRentTotal + enchoFee + taxAmount;

  const handleReserve = () => {
    uiAudio.playSuccess();
    if (onBook) {
      onBook({
        listingId: listing.id,
        checkIn,
        checkOut,
        guests,
        totalPrice: grandTotal,
        basePrice,
        enchoFee,
        taxAmount,
        currency: listing.currency || 'INR'
      });
    }
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
        description={listing.description ? listing.description.substring(0, 155) : `Experience pure architectural tranquility at ${listing.title}. Verified luxury stay in ${listing.city}.`}
        image={images[0]}
      />

      <div className="min-h-screen bg-[#fafafa] font-sans antialiased text-zinc-900 pb-28 md:pb-36 selection:bg-amber-500/20">

        {/* Ambient Gradient Glow from Dominant Color */}
        <div 
          className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] opacity-15 blur-[120px] pointer-events-none -z-10 transition-colors duration-1000"
          style={{ background: `radial-gradient(circle, ${dominantColor} 0%, rgba(255,255,255,0) 70%)` }}
        />

        {/* MILESTONE 1: Top Navigation Bar */}
        <div className="absolute top-0 inset-x-0 z-[50] flex items-center justify-between p-4 mt-2 md:mt-6 pointer-events-none md:max-w-7xl md:mx-auto">
            <button 
                onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/70 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] pointer-events-auto active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40 text-zinc-900 cursor-pointer"
                title="Back to search"
            >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 pr-0.5" />
            </button>
            <div className="flex gap-2.5 md:gap-3 pointer-events-auto">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        uiAudio.playClick();
                        if (navigator.share) {
                            navigator.share({ title: listing.title, url: window.location.href }).catch(err => console.log(err));
                        } else {
                            navigator.clipboard.writeText(window.location.href);
                            addToast("Link Copied", "Listing link copied to clipboard!", "success");
                        }
                    }}
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/70 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40 text-zinc-900 cursor-pointer"
                    title="Share sanctuary"
                >
                    <Share className="w-4 h-4 md:w-4.5 md:h-4.5" strokeWidth={2.5} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); if(onToggleFavorite) onToggleFavorite(listing); }}
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/70 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40 cursor-pointer"
                    title={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon className={`w-5 h-5 md:w-5.5 md:h-5.5 ${isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-zinc-900'}`} filled={isFavorite} />
                </button>
            </div>
        </div>

        {/* HERO SECTION: Bento Grid / Video Loop */}
        <div className="w-full md:max-w-7xl mx-auto md:px-6 lg:px-8 md:pt-6">
            
            {/* Desktop Bento Grid */}
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2.5 h-[65vh] lg:h-[75vh] rounded-3xl overflow-hidden bg-zinc-200 shadow-sm relative group">
                {/* Main Hero Card 1 (Ambient Video Loop or High-Res Photo) */}
                <div className="col-span-2 row-span-2 relative h-full overflow-hidden group/video">
                    {listing.video_url ? (
                      <video
                        src={listing.video_url}
                        poster={images[0]}
                        autoPlay
                        loop
                        muted={isVideoMuted}
                        playsInline
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(0);
                        }}
                      />
                    ) : (
                      <div className="relative w-full h-full">
                        <OptimizedImage 
                            src={images[0]} 
                            aspectRatio="4:3"
                            priority={true}
                            className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" 
                            alt={`${listing.title} Main View`}
                            onClick={() => { uiAudio.playClick(); trackPhotoView(0); setLightboxIndex(0); }}
                        />
                      </div>
                    )}

                    {/* Ambient Video Micro-HUD Controls */}
                    {listing.video_url && (
                      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            uiAudio.playClick();
                            setIsVideoMuted(!isVideoMuted);
                          }}
                          className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all shadow-md active:scale-95 cursor-pointer"
                          title={isVideoMuted ? "Unmute Ambient Sound" : "Mute Sound"}
                        >
                          {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-black/40 text-white/90 backdrop-blur-md border border-white/10 flex items-center gap-1.5 font-display">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live Ambient Reel
                        </span>
                      </div>
                    )}

                    {listing.isVerified && (
                        <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-xl px-4 py-2 rounded-xl shadow-lg border border-white/40 flex items-center gap-2 pointer-events-none">
                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                            <span className="text-xs font-bold font-display tracking-widest text-zinc-900 uppercase">Verified Sanctuary</span>
                        </div>
                    )}
                </div>
                
                {/* Bento Grid Sub-Images */}
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[1]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 2" onClick={() => { uiAudio.playClick(); trackPhotoView(1); setLightboxIndex(1); }} />
                </div>
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[2]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 3" onClick={() => { uiAudio.playClick(); trackPhotoView(2); setLightboxIndex(2); }} />
                </div>
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[3]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 4" onClick={() => { uiAudio.playClick(); trackPhotoView(3); setLightboxIndex(3); }} />
                </div>
                
                {/* View Gallery Overlay */}
                <div className="relative overflow-hidden h-full group/gallery cursor-pointer" onClick={() => { uiAudio.playClick(); trackPhotoView(4); setLightboxIndex(0); }}>
                    <OptimizedImage src={images[4]} aspectRatio="16:9" className="w-full h-full object-cover transition-transform duration-700 group-hover/gallery:scale-[1.03] group-hover/gallery:blur-sm" alt="View 5" />
                    <div className="absolute inset-0 bg-black/10 group-hover/gallery:bg-black/20 transition-colors duration-500" />
                    <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-xl border border-white/50 text-zinc-900 px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-transform">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-[11px] font-extrabold uppercase tracking-widest font-display">Show All Media</span>
                    </div>
                </div>

                {/* Live Viewers Floating Badge */}
                {liveViewers > 1 && (
                    <div className="absolute top-6 right-6 bg-zinc-900/80 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2 border border-white/10 shadow-2xl animate-fade-in pointer-events-none">
                        <div className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <span className="text-[10px] font-extrabold tracking-widest text-white uppercase font-display">{liveViewers} Viewing</span>
                    </div>
                )}
            </div>

            {/* Mobile 16:9 Swipe Canvas */}
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
                    {images.map((img, idx) => (
                        <div key={idx} className="w-full h-full snap-center shrink-0 relative" onClick={() => setLightboxIndex(idx)}>
                            <OptimizedImage 
                                src={img} 
                                aspectRatio="1:1"
                                priority={idx === 0}
                                className="w-full h-full object-cover" 
                                alt={`${listing.title} View ${idx + 1}`} 
                            />
                        </div>
                    ))}
                </div>

                {/* Mobile Micro-HUD Overlays */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="flex gap-1.5 bg-black/30 backdrop-blur-xl px-3 py-1.5 rounded-full">
                        {images.map((_, i) => (
                            <div key={i} className={`h-1 rounded-full transition-all duration-300 ${activeMobileImage === i ? 'w-4 bg-white' : 'w-1 bg-white/40'}`} />
                        ))}
                    </div>
                </div>

                {listing.isVerified && (
                    <div className="absolute bottom-6 left-4 bg-white/80 backdrop-blur-xl px-3.5 py-1.5 rounded-xl shadow-sm border border-white/40 flex items-center gap-1.5 pointer-events-none">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-[10px] font-bold tracking-widest text-zinc-900 uppercase font-display">Verified</span>
                    </div>
                )}
            </div>
        </div>

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
                                            src={room.imageUrls?.[0] || images[1]} 
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
                      <Sparkles className="w-5 h-5" style={{ color: dominantColor }} />
                      <span>Sensory Atmosphere Deck</span>
                    </h2>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Aman Standard</span>
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

                {/* EDITORIAL SANCTUARY DOSSIER ACCORDION */}
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
                          {listing.description || "Designed as an acoustic sanctuary for high-discretion travelers. Features hand-crafted limestone walls, floor-to-ceiling panoramic glass, and integrated circadian lighting systems that harmonize with natural sun cycles."}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 2: Aristocratic Hospitality Guidelines */}
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
                            Aristocratic Hospitality Guidelines
                          </h3>
                          <span className="bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
                            Curated
                          </span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.guidelines ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.guidelines && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        <ul className="space-y-3">
                          {parsedGuidelines.map((g, idx) => (
                            <li key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/60">
                              <span className="text-amber-800 font-bold text-xs shrink-0 mt-0.5 font-mono">0{idx + 1}.</span>
                              <span className="text-xs md:text-sm text-zinc-700 font-medium leading-relaxed">{g}</span>
                            </li>
                          ))}
                        </ul>
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
                            <p className="font-bold text-zinc-800">Standard luxury safety protocols observed.</p>
                            <p className="leading-relaxed">While individual pavilions feature architectural water features and open vistas, dedicated pool barriers, stair gates, and baby cribs can be installed prior to arrival with advance notice.</p>
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
                          All guests at this Encho Sanctuary receive direct access to our Walled Garden Host Concierge. Private dining experiences, sommelier cellar curation, private driver transfers, and customized wellness sessions can be coordinated seamlessly inside your Encho guest inbox.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* ANALYTICAL TRUST ANCHOR */}
                <section className="space-y-4 pt-4">
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Encho Trust & Safety Anchor</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-display">100% In-Person Verified</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Physically audited by Encho luxury architects for structural integrity and high-fidelity listing truth.</p>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 border border-cyan-100">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-display">Walled Garden Escrow</h4>
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
                          <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight font-display">{listing.provider || 'Encho Verified Host'}</h3>
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
                      className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Message Concierge</span>
                    </button>
                  </div>

                  {/* Host Editorial Quote */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border-l-2 border-zinc-900 text-sm md:text-base text-zinc-700 font-medium italic leading-relaxed">
                    "{listing.editorial_quote || "Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional."}"
                  </div>
                </section>
            </div>

            {/* Right Column: Sticky Glass Checkout Dock (Zone 1 Stays Mounted Here) */}
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4 relative pb-12">
                <div className="sticky top-28 bg-white border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 flex flex-col">
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <span className="text-3xl font-extrabold tracking-tight text-zinc-900 font-display tabular-nums">{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()}</span>
                            <span className="text-zinc-500 font-medium ml-1 text-sm">night</span>
                        </div>
                        {listing.originalId && <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded">Suite Rate</span>}
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
                        <div className="p-3">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display">Guests</label>
                            <select 
                                value={guests}
                                onChange={(e) => setGuests(Number(e.target.value))}
                                className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-700 focus:ring-0 cursor-pointer"
                            >
                                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>)}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleReserve}
                        className="w-full bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold font-display py-4 rounded-2xl shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-4 cursor-pointer"
                    >
                        <CreditCard className="w-4 h-4" />
                        <span>Reserve Sanctuary</span>
                    </button>
                    
                    <p className="text-[11px] text-zinc-400 text-center mb-6 font-medium">You won't be charged yet</p>

                    {/* Visual Split-Cost Calculator (Strict Ledger) */}
                    <div className="space-y-3 text-sm text-zinc-600 font-medium">
                        <div className="flex justify-between">
                            <span>{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()} × {nights} nights</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{baseRentTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Optimization Fee (15%)</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{enchoFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Taxes (18%)</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{taxAmount.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div className="h-px bg-zinc-200/80 my-4" />
                    
                    <div className="flex justify-between items-center text-lg font-extrabold text-zinc-900 font-display tabular-nums">
                        <span>Total Before Taxes</span>
                        <span>{listing.currency === 'USD' ? '$' : '₹'}{grandTotal.toLocaleString()}</span>
                    </div>
                </div>
            </div>

        </div>

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* ULTRA-DENSE SCATTERED PILE-OF-SHEETS EDITORIAL MOSAIC (100vw, Zero Gap)   */}
        {/* Zero Gray Background Visible · Multi-Layer Heavy Collisions & Hover Lift  */}
        {/* ========================================================================= */}
        <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] overflow-x-clip overflow-y-visible mt-6 md:mt-8 mb-0 pt-4 pb-20 md:pb-28 bg-transparent">
          <div 
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
            ].map((sheet, sIndex) => (
              <div
                key={sIndex}
                onClick={() => {
                  uiAudio.playClick();
                  setLightboxIndex(sheet.idx % uniqueMediaPool.length);
                }}
                className={`relative shrink-0 ${sheet.w} ${sheet.h} ${sheet.z} ${sheet.overlap} ${sheet.rotate} ${sheet.translateY} rounded-2xl md:rounded-3xl overflow-hidden bg-zinc-900 border-[2.5px] border-white ring-1 ring-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] origin-center cursor-pointer hover:!z-50 hover:scale-[1.10] hover:rotate-0 hover:shadow-[0_25px_60px_rgba(0,0,0,0.28)] hover:ring-black/10 group snap-center`}
              >
                <OptimizedImage
                  src={uniqueMediaPool[sheet.idx % uniqueMediaPool.length]}
                  aspectRatio={sheet.aspect as '16:9' | '4:3'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  alt={`Sanctuary Moment ${sheet.idx + 1}`}
                />
              </div>
            ))}
          </div>
        </div>

                {/* ZONE 2: 100% FULL-WIDTH CINEMATIC IMMERSIVE SUITE                        */}
        {/* ========================================================================= */}
        <div className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-4 md:mt-6 flex flex-col gap-16 md:gap-24">

          {/* 1. 10/10 CINEMATIC HORIZONTAL SLIDING BENTO GALLERY */}
          <section className="space-y-8 pt-8 border-t border-zinc-200/80">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-display">
                    Curated Architectural Portfolio
                  </span>
                </div>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-zinc-900 font-display">
                  Cinematic Sanctuary Gallery
                </h2>
                <p className="text-sm md:text-base text-zinc-500 font-medium mt-1">
                  Explore every curated pavilion, open-air reflection pool, and artisanal suite detail.
                </p>
              </div>

              {/* Slide Navigation Controls & Collection Badge */}
              <div className="flex items-center gap-3 self-start md:self-end">
                <div className="bg-zinc-100 px-4 py-2 rounded-full text-xs font-bold text-zinc-700 font-display flex items-center gap-2 border border-zinc-200/60 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                  <span>COLLECTION 0{activeSlide + 1} / 03</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setActiveSlide((activeSlide - 1 + 3) % 3);
                  }}
                  className="w-10 h-10 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 flex items-center justify-center shadow-xs active:scale-95 transition-all cursor-pointer"
                  title="Previous Collection"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setActiveSlide((activeSlide + 1) % 3);
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                  title="Next Collection"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Collection Category Pills (Synchronized Minimalist HUD) */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 0, label: '01 · Vistas & Grounds' },
                { id: 1, label: '02 · Master Living & Suites' },
                { id: 2, label: '03 · Wellness & Dining' }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryPillClick(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all cursor-pointer flex items-center gap-2 ${
                    activeSlide === cat.id
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200/60'
                  }`}
                >
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* DESKTOP BENTO COLLAGE (Left-Trio + Right-Hero + Floating Hover Paddles) */}
            <div className="hidden md:block relative group/gallery overflow-hidden min-h-[560px] md:min-h-[640px] rounded-3xl">
              {/* Floating Edge Glass Paddles (Appear on Gallery Hover) */}
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setActiveSlide((activeSlide - 1 + 3) % 3);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-xl border border-white/20 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 shadow-xl active:scale-90 cursor-pointer"
                title="Previous Collection"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setActiveSlide((activeSlide + 1) % 3);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-xl border border-white/20 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 shadow-xl active:scale-90 cursor-pointer"
                title="Next Collection"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-12 gap-4 h-full"
                >
                  {/* LEFT SIDE (7 Cols): TRIO OF DETAIL SPACES */}
                  <div className="col-span-7 flex flex-col gap-4">
                    {/* Top Row: Spaces 02 & 03 (4:3) */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Space 02 */}
                      <div
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(slideCollections[activeSlide].space02.imgIndex);
                        }}
                        className="group relative h-64 md:h-72 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                      >
                        <OptimizedImage
                          src={slideCollections[activeSlide].space02.img}
                          aspectRatio="4:3"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt={slideCollections[activeSlide].space02.title}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-5">
                          <div className="flex items-center justify-between w-full text-white">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
                                Space 02 · {slideCollections[activeSlide].space02.tag}
                              </span>
                              <h4 className="text-sm md:text-base font-bold font-display mt-0.5">
                                {slideCollections[activeSlide].space02.title}
                              </h4>
                            </div>
                            <div className="p-2 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Space 03 */}
                      <div
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(slideCollections[activeSlide].space03.imgIndex);
                        }}
                        className="group relative h-64 md:h-72 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                      >
                        <OptimizedImage
                          src={slideCollections[activeSlide].space03.img}
                          aspectRatio="4:3"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt={slideCollections[activeSlide].space03.title}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-5">
                          <div className="flex items-center justify-between w-full text-white">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
                                Space 03 · {slideCollections[activeSlide].space03.tag}
                              </span>
                              <h4 className="text-sm md:text-base font-bold font-display mt-0.5">
                                {slideCollections[activeSlide].space03.title}
                              </h4>
                            </div>
                            <div className="p-2 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Wide Architectural Banner (Space 04, 16:9) */}
                    <div
                      onClick={() => {
                        uiAudio.playClick();
                        setLightboxIndex(slideCollections[activeSlide].space04.imgIndex);
                      }}
                      className="group relative h-56 md:h-64 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                    >
                      <OptimizedImage
                        src={slideCollections[activeSlide].space04.img}
                        aspectRatio="16:9"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={slideCollections[activeSlide].space04.title}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                        <div className="flex items-center justify-between w-full text-white">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
                              Space 04 · {slideCollections[activeSlide].space04.tag}
                            </span>
                            <h4 className="text-base md:text-lg font-bold font-display mt-0.5">
                              {slideCollections[activeSlide].space04.title}
                            </h4>
                          </div>
                          <div className="p-2.5 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <Eye className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE (5 Cols): LARGE FEATURE HERO VISTA (Space 01) */}
                  <div
                    onClick={() => {
                      uiAudio.playClick();
                      setLightboxIndex(slideCollections[activeSlide].space01.imgIndex);
                    }}
                    className="col-span-5 group relative min-h-[380px] lg:min-h-full rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-2xl transition-all duration-500 cursor-pointer flex flex-col justify-end"
                  >
                    {slideCollections[activeSlide].space01.hasVideo && listing.video_url ? (
                      <video
                        src={listing.video_url}
                        poster={slideCollections[activeSlide].space01.img}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <OptimizedImage
                        src={slideCollections[activeSlide].space01.img}
                        aspectRatio="16:9"
                        priority={true}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={slideCollections[activeSlide].space01.title}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-85 group-hover:opacity-95 transition-opacity duration-300" />
                    
                    {/* Hero Badge & Metadata */}
                    <div className="relative z-10 p-6 md:p-8 text-white space-y-2">
                      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/30 text-[10px] font-black uppercase tracking-widest font-mono">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Space 01 · Hero Feature Anchor</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-extrabold font-display leading-tight">
                        {slideCollections[activeSlide].space01.title}
                      </h3>
                      <p className="text-xs md:text-sm text-zinc-300 font-medium leading-relaxed max-w-sm">
                        {slideCollections[activeSlide].space01.desc}
                      </p>
                      <div className="pt-2 flex items-center gap-2 text-xs font-bold font-display text-amber-300 group-hover:translate-x-1 transition-transform">
                        <span>Inspect in 4K Fullscreen</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Bottom Tactile Progress Indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                {[0, 1, 2].map(idx => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      uiAudio.playClick();
                      setActiveSlide(idx);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      activeSlide === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                    }`}
                    title={`Go to Collection ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* 10/10 MINIMALIST LUXURY MOBILE GESTURE STREAM (< 768px) */}
            <div className="md:hidden space-y-2.5">
              
              {/* Minimalist Subtle Telemetry Micro-Capsule */}
              <div className="bg-zinc-100/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-zinc-200/70 shadow-2xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                  <span className="text-xs font-bold font-display text-zinc-800 tracking-tight">
                    {activeSlide === 0 ? 'Vistas & Grounds' : activeSlide === 1 ? 'Master Living & Suites' : 'Wellness & Dining'}
                  </span>
                </div>

                {/* Refined Neutral Progress Dots */}
                <div className="flex items-center gap-1.5 shrink-0 bg-white px-2 py-0.5 rounded-full border border-zinc-200/60">
                  {[1, 2, 3, 4].map((step) => {
                    const currentSubStep = (mobileSpaceIndex % 4) + 1;
                    const isFilled = step <= currentSubStep;
                    return (
                      <div
                        key={step}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          isFilled ? 'w-2.5 bg-zinc-900' : 'w-1 bg-zinc-300'
                        }`}
                      />
                    );
                  })}
                  <span className="text-[10px] font-bold text-zinc-600 font-mono ml-0.5">
                    {(mobileSpaceIndex % 4) + 1}/4
                  </span>
                </div>
              </div>

              {/* Pure Full-Bleed Continuous Swipe Track (Zero Corner Stickers) */}
              <div 
                ref={mobileGalleryRef}
                onScroll={handleMobileScroll}
                className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 scrollbar-hide" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {mobileContinuousSpaces.map((item, mIdx) => {
                  const space = item.space;
                  return (
                    <div
                      key={`space-${mIdx}`}
                      onClick={() => {
                        uiAudio.playClick();
                        setLightboxIndex(space.imgIndex);
                      }}
                      className="snap-center shrink-0 w-[85vw] sm:w-[70vw] relative aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/80 shadow-md cursor-pointer group"
                    >
                      <OptimizedImage
                        src={space.img}
                        aspectRatio="4:3"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={space.title}
                      />

                      {/* Clean Minimalist Bottom Caption Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex items-end p-4 text-white">
                        <div className="w-full">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 font-mono">
                              Space {item.globalIdx < 10 ? `0${item.globalIdx}` : item.globalIdx} · {space.tag}
                            </span>
                            <span className="text-[10px] text-zinc-300 font-medium font-mono">
                              {item.globalIdx} / 12
                            </span>
                          </div>
                          <h4 className="text-sm font-bold font-display mt-0.5 truncate text-white">{space.title}</h4>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between px-1 text-[11px] font-medium text-zinc-400">
                <span>Swipe to explore 12 curated spaces</span>
                <span>Tap for 4K inspection</span>
              </div>
            </div>
          </section>

          {/* 2. AMBIENT NEIGHBORHOOD RADAR */}
          <section className="space-y-6 pt-8 border-t border-zinc-200/80">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Neighborhood Radar</h2>
                <p className="text-sm text-zinc-500 font-medium mt-0.5">Surrounding landmarks, private transit times, and curated local highlights.</p>
              </div>
              <span className="text-sm font-bold text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-3.5 py-2 rounded-xl border border-indigo-100">
                <MapPin className="w-4 h-4" /> {listing.city}
              </span>
            </div>

            <div className="relative w-full h-[360px] md:h-[420px] bg-zinc-100 rounded-3xl overflow-hidden border border-zinc-200 shadow-inner group">
              <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=60')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent" />

              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {(listing.nearby && listing.nearby.length > 0 ? listing.nearby : [
                    { name: 'City Center & Heritage Forts', distance: '10 min walk', type: 'TRANSPORT' },
                    { name: 'Artisanal Cafe & Roastery', distance: '2 min walk', type: 'CAFE' },
                    { name: 'Royal Botanical Sanctuary', distance: '15 min drive', type: 'PARK' }
                  ]).map((poi, idx) => (
                    <div key={idx} className="snap-center shrink-0 bg-white/90 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/60 shadow-lg min-w-[200px]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Navigation className="w-4 h-4 text-emerald-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 font-mono">{poi.type}</span>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-900 truncate font-display">{poi.name}</h4>
                      <p className="text-xs font-semibold text-emerald-700 mt-1">{poi.distance}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 3. VERIFIED GUEST REVIEWS */}
          <section className="space-y-6 pt-8 border-t border-zinc-200/80">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Star className="w-7 h-7 text-amber-500 fill-amber-500" />
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 font-display tabular-nums">
                  {listing.rating?.toFixed(2) || '4.95'}
                </h2>
              </div>
              <span className="text-zinc-300 text-2xl font-light">|</span>
              <span className="text-lg font-bold text-zinc-600 font-display">{listing.reviewCount || 124} Verified Stays</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  author: "Michael R.",
                  initial: "M",
                  color: "bg-indigo-100 text-indigo-700",
                  tag: "October 2025 · Tech Retreat",
                  quote: "The suite configuration was perfect for our remote team. The Wi-Fi was flawless, and the architectural lighting kept the vibe perfectly balanced."
                },
                {
                  author: "Sarah K.",
                  initial: "S",
                  color: "bg-emerald-100 text-emerald-700",
                  tag: "September 2025 · Couple's Getaway",
                  quote: "Immaculate attention to detail. The host concierge was incredibly responsive through the app. Felt incredibly safe and well-taken care of."
                },
                {
                  author: "Aarav M.",
                  initial: "A",
                  color: "bg-amber-100 text-amber-800",
                  tag: "August 2025 · Family Escape",
                  quote: "The private chef and pool were spectacular. Having 100% verified staff and seamless Walled Garden check-in made it a 10/10 stay."
                }
              ].map((rev, idx) => (
                <div key={idx} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-display ${rev.color}`}>
                        {rev.initial}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 font-display">{rev.author}</h4>
                        <p className="text-xs text-zinc-500 font-medium">{rev.tag}</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed font-normal italic">"{rev.quote}"</p>
                  </div>
                </div>
              ))}
            </div>
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
                        <span className="text-[10px] font-bold text-zinc-900 tabular-nums">{sim.rating?.toFixed(1) || '4.9'}</span>
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
                        {listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()}
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
                  onClick={handleReserve}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 text-xs md:text-sm font-extrabold font-display uppercase tracking-wider px-7 py-3 rounded-full shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>RESERVE</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Sticky Booking Bar (M5) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] z-50 px-4 py-3 pb-safe safe-area-bottom">
            <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-zinc-900 font-display tabular-nums">{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()}</span>
                        <span className="text-xs font-semibold text-zinc-500">night</span>
                    </div>
                    <span className="text-xs font-bold text-zinc-500 mt-0.5">
                        {new Date(checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                </div>
                <button 
                    onClick={handleReserve}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold font-display uppercase tracking-wider text-xs py-3.5 px-8 rounded-full active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,0,0,0.15)] flex-1 max-w-[160px] cursor-pointer"
                >
                    RESERVE
                </button>
            </div>
        </div>

        {/* ========================================================================= */}
        {/* FULLSCREEN LIGHTBOX MODAL                                                */}
        {/* ========================================================================= */}
        {lightboxIndex !== null && (
          <div
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-4 md:p-8 animate-fade-in"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between text-white z-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
                  {lightboxIndex + 1} / {images.length}
                </span>
                <span className="text-sm font-bold font-display hidden sm:inline">{listing.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Lightbox Image & Nav */}
            <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setLightboxIndex((lightboxIndex - 1 + images.length) % images.length)}
                className="absolute left-2 md:left-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer z-10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <OptimizedImage
                src={images[lightboxIndex]}
                aspectRatio="16:9"
                className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl"
                alt={`Photo ${lightboxIndex + 1}`}
              />

              <button
                type="button"
                onClick={() => setLightboxIndex((lightboxIndex + 1) % images.length)}
                className="absolute right-2 md:right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Bottom Thumbnails */}
            <div className="flex justify-center gap-2 overflow-x-auto pb-2 scrollbar-hide z-10" onClick={(e) => e.stopPropagation()}>
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                    lightboxIndex === i ? 'border-white scale-105' : 'border-transparent opacity-50 hover:opacity-100'
                  }`}
                >
                  <img src={img} className="w-full h-full object-cover" alt={`Thumb ${i + 1}`} />
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
