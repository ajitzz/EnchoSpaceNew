import React, { useEffect, useState } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ListingErrorBoundary } from './ListingErrorBoundary';
import { useListingTelemetry } from '../hooks/useListingTelemetry';
import { OptimizedImage } from './OptimizedImage';
import { ChevronLeft, HeartIcon, ShieldCheck } from './Icons';
import { Share, Users, Eye, Image as ImageIcon, MessageCircle, MapPin, Star, Sparkles, Navigation, Calendar, CreditCard, Clock, CheckCircle2 } from 'lucide-react';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';
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
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80"
];

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

  // M5: Dual-Date Engine State
  const [checkIn, setCheckIn] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState<string>(() => new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [guests, setGuests] = useState<number>(1);

  // M5: Ledger Strict Math
  const getDays = () => {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diff = end.getTime() - start.getTime();
      return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
  };
  
  const nights = getDays();
  const basePrice = listing.displayPrice || listing.price;
  const baseRentTotal = basePrice * nights;
  const enchoFee = Math.round(baseRentTotal * 0.15); // 15% Master Account Optimization Rule
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
  const images = Array.from({ length: Math.max(5, listing.imageUrls?.length || 0, listing.imageCount || 5) }).map(
    (_, i) => {
       if (listing.imageUrls && listing.imageUrls[i]) return listing.imageUrls[i];
       return FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
    }
  );

  // Live Socket connection
  useEffect(() => {
    if (!socket) socket = io();
    socket.emit('join_listing', listing.id);
    
    const handleViewers = (data: { viewers: number }) => {
       setLiveViewers(data.viewers);
    };
    
    socket.on('listing_viewers', handleViewers);
    
    return () => {
       socket.off('listing_viewers', handleViewers);
       socket.emit('leave_listing', listing.id);
    };
  }, [listing.id]);

  // DCO / Retargeting Pixel on Mount (Contract requirement)
  useEffect(() => {
    fetch('/api/marketing/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id })
    }).catch(console.error);
  }, [listing.id]);

  return (
    <>
      <SEO 
        title={listing.seo_title || `${listing.title} | Encho Sanctuary`} 
        description={listing.seo_description || listing.description?.substring(0, 160)}
        image={listing.seo_image_url || listing.imageUrls?.[0] || listing.imageUrl}
        keywords={listing.seo_keywords || `luxury stay, ${listing.city}, ${listing.title}`}
      />
      
      <div className="bg-zinc-50 min-h-screen pb-32 font-sans antialiased text-zinc-900">
        
        {/* Mobile Navigation Header (Absolute overlay on Hero) */}
        <div className="absolute top-0 inset-x-0 z-[50] flex items-center justify-between p-4 mt-2 md:mt-6 pointer-events-none md:max-w-7xl md:mx-auto">
            <button 
                onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/60 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] pointer-events-auto active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40 text-zinc-900"
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
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/60 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40 text-zinc-900"
                    title="Share sanctuary"
                >
                    <Share className="w-4 h-4 md:w-4.5 md:h-4.5" strokeWidth={2.5} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); if(onToggleFavorite) onToggleFavorite(listing); }}
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/60 backdrop-blur-xl flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] active:scale-95 transition-all hover:bg-white hover:scale-105 border border-white/40"
                    title={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon className={`w-5 h-5 md:w-5.5 md:h-5.5 ${isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-zinc-900'}`} filled={isFavorite} />
                </button>
            </div>
        </div>

        {/* MILESTONE 2: Cinematic Bento Hero */}
        <div className="w-full md:max-w-7xl mx-auto md:px-6 lg:px-8 md:pt-6">
            
            {/* Desktop Bento Grid (Hidden on Mobile) */}
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2.5 h-[65vh] lg:h-[75vh] rounded-3xl overflow-hidden bg-zinc-200 shadow-sm relative group">
                {/* Main Hero Image */}
                <div className="col-span-2 row-span-2 relative h-full overflow-hidden">
                    <OptimizedImage 
                        src={images[0]} 
                        aspectRatio="4:3"
                        priority={true}
                        className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" 
                        alt={`${listing.title} Main View`}
                        onClick={() => { uiAudio.playClick(); trackPhotoView(0); }}
                    />
                    {listing.isVerified && (
                        <div className="absolute bottom-6 left-6 bg-white/80 backdrop-blur-xl px-4 py-2 rounded-xl shadow-lg border border-white/40 flex items-center gap-2 pointer-events-none">
                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                            <span className="text-xs font-bold tracking-widest text-zinc-900 uppercase">Verified Sanctuary</span>
                        </div>
                    )}
                </div>
                
                {/* Bento Grid Sub-Images */}
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[1]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 2" onClick={() => { uiAudio.playClick(); trackPhotoView(1); }} />
                </div>
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[2]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 3" onClick={() => { uiAudio.playClick(); trackPhotoView(2); }} />
                </div>
                <div className="relative overflow-hidden h-full">
                    <OptimizedImage src={images[3]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 4" onClick={() => { uiAudio.playClick(); trackPhotoView(3); }} />
                </div>
                
                {/* View Gallery Overlay */}
                <div className="relative overflow-hidden h-full group/gallery cursor-pointer" onClick={() => { uiAudio.playClick(); trackPhotoView(4); }}>
                    <OptimizedImage src={images[4]} aspectRatio="16:9" className="w-full h-full object-cover transition-transform duration-700 group-hover/gallery:scale-[1.03] group-hover/gallery:blur-sm" alt="View 5" />
                    <div className="absolute inset-0 bg-black/10 group-hover/gallery:bg-black/20 transition-colors duration-500" />
                    <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-xl border border-white/50 text-zinc-900 px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-transform">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-[11px] font-extrabold uppercase tracking-widest">Show All Media</span>
                    </div>
                </div>

                {/* Live Viewers Floating Badge */}
                {liveViewers > 1 && (
                    <div className="absolute top-6 right-6 bg-zinc-900/80 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2 border border-white/10 shadow-2xl animate-fade-in pointer-events-none">
                        <div className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <span className="text-[10px] font-extrabold tracking-widest text-white uppercase">{liveViewers} Viewing</span>
                    </div>
                )}
            </div>

            {/* Mobile 16:9 Swipe Canvas (Hidden on Desktop) */}
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
                    {images.map((img, i) => (
                        <div key={i} className="w-full h-full flex-shrink-0 snap-center relative">
                            <OptimizedImage 
                                src={img} 
                                aspectRatio="9:16"
                                priority={i === 0}
                                className="w-full h-full object-cover" 
                                alt={`Mobile Image ${i + 1}`}
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
                        <span className="text-[10px] font-bold tracking-widest text-zinc-900 uppercase">Verified</span>
                    </div>
                )}
            </div>

        </div>

        {/* MILESTONE 3: Suite Showcase Matrix & Experience Bento */}
        <div className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* Left Column (Main Content) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-12">
                
                {/* Suite Showcase Matrix (Only if hybrid or private_rooms) */}
                {(listing.rental_mode === 'hybrid' || listing.rental_mode === 'private_rooms') && listing.rooms && listing.rooms.length > 0 && (
                    <section className="space-y-6">
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Suite Configurations</h2>
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
                                            <h3 className="text-lg font-bold text-zinc-900">{room.name}</h3>
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

                {/* Experience Bento Grid (Amenities) */}
                <section className="space-y-6 pt-6 border-t border-zinc-200/60">
                    <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Sanctuary Experience</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        {/* Vibe Bento */}
                        <div className="col-span-2 md:col-span-2 bg-gradient-to-br from-indigo-50 via-blue-50/50 to-white rounded-3xl p-5 border border-indigo-100/60 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-900/40 mb-3">The Vibe</h3>
                            <ul className="space-y-2.5">
                                {(listing.amenity_clusters?.vibe || listing.amenities?.slice(0,3) || ['Architectural lighting', 'Ambient acoustics', 'Minimalist aesthetics']).map((a,i) => (
                                    <li key={i} className="flex items-center gap-2.5 text-sm font-semibold text-indigo-950">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> {a}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {/* Comfort Bento */}
                        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-amber-50 to-orange-50/30 rounded-3xl p-5 border border-amber-100/60 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-xs font-black uppercase tracking-widest text-amber-900/40 mb-3">Comfort</h3>
                            <ul className="space-y-2.5">
                                {(listing.amenity_clusters?.comfort || ['Plush bedding', 'Climate control']).map((a,i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {a}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {/* Work Bento */}
                        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-emerald-50 to-teal-50/30 rounded-3xl p-5 border border-emerald-100/60 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900/40 mb-3">Work</h3>
                            <ul className="space-y-2.5">
                                {(listing.amenity_clusters?.work || ['Fiber Wi-Fi', 'Ergonomic setup']).map((a,i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {a}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Family & Child Safety Profile */}
                <section className="space-y-6 pt-6 border-t border-zinc-200/60">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Family & Child Safety</h2>
                        <ShieldCheck className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        {listing.child_safety_specs && listing.child_safety_specs.length > 0 ? (
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {listing.child_safety_specs.map((spec, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="mt-0.5 bg-emerald-100 p-1 rounded-full"><ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /></div>
                                        <span className="text-sm font-medium text-zinc-700">{spec}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
                                    <ShieldCheck className="w-6 h-6 text-zinc-400" />
                                </div>
                                <p className="text-sm font-medium text-zinc-500">Standard safety protocols observed.</p>
                                <p className="text-xs text-zinc-400 mt-1">Contact host for specific child-proofing details.</p>
                            </div>
                        )}
                    </div>
                </section>

                <div className="h-px bg-zinc-200/60 my-4 w-full" />

                {/* MILESTONE 4: Trust Engine (Host Concierge) */}
                <section className="space-y-6 pt-6">
                    <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Host Concierge</h2>
                    <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden border border-zinc-800 shadow-xl">
                        {/* Walled Garden Background Elements */}
                        <div className="absolute -right-12 -top-12 opacity-5 pointer-events-none">
                            <ShieldCheck className="w-64 h-64 text-white" />
                        </div>
                        
                        <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
                            <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                <span className="text-xl font-bold text-white uppercase tracking-widest">{listing.provider ? listing.provider.charAt(0) : 'E'}</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">{listing.provider || 'Encho Verified Host'}</h3>
                                <p className="text-zinc-400 text-sm font-medium mt-1">Superhost · Typically responds in 5 mins</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto relative z-10">
                            <button 
                                onClick={() => {
                                    uiAudio.playClick();
                                    if (onContactHost) onContactHost();
                                }}
                                className="w-full md:w-auto bg-white hover:bg-zinc-100 text-zinc-950 font-bold px-8 py-3.5 rounded-xl transition-all active:scale-95 shadow-[0_4px_14px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2"
                            >
                                <MessageCircle className="w-5 h-5" />
                                Message Host
                            </button>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5" /> 
                                Walled Garden Secured
                            </span>
                        </div>
                    </div>
                </section>

                {/* Ambient Radar Map */}
                <section className="space-y-6 pt-6 border-t border-zinc-200/60">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Neighborhood Radar</h2>
                        <span className="text-sm font-bold text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                            <MapPin className="w-4 h-4" /> {listing.city}
                        </span>
                    </div>
                    
                    <div className="relative w-full h-[300px] bg-zinc-100 rounded-3xl overflow-hidden border border-zinc-200 shadow-inner group">
                        {/* Simulated Ambient Map - For production, Google Maps / Mapbox replaces this */}
                        <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=60')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-1000" />
                        <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent" />
                        
                        <div className="absolute bottom-6 left-6 right-6">
                            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {(listing.nearby && listing.nearby.length > 0 ? listing.nearby : [
                                    { name: 'City Center', distance: '10 min walk', type: 'TRANSPORT' },
                                    { name: 'Local Cafe', distance: '2 min walk', type: 'CAFE' }
                                ]).map((poi, idx) => (
                                    <div key={idx} className="snap-center shrink-0 bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/60 shadow-lg min-w-[160px]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">{poi.type}</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-zinc-900 truncate">{poi.name}</h4>
                                        <p className="text-xs font-semibold text-emerald-700 mt-1">{poi.distance}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Verified Guest Reviews */}
                <section className="space-y-6 pt-6 border-t border-zinc-200/60">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">{listing.rating?.toFixed(2) || '4.95'}</h2>
                        </div>
                        <span className="text-zinc-300">|</span>
                        <span className="text-lg font-bold text-zinc-600">{listing.reviewCount || 124} Verified Reviews</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">M</div>
                                <div>
                                    <h4 className="text-sm font-bold text-zinc-900">Michael R.</h4>
                                    <p className="text-xs text-zinc-500 font-medium">October 2025 · Tech Retreat</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-600 leading-relaxed font-medium">"The suite configuration was perfect for our remote team. The Wi-Fi was flawless, and the architectural lighting kept the vibe perfectly balanced."</p>
                        </div>
                        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">S</div>
                                <div>
                                    <h4 className="text-sm font-bold text-zinc-900">Sarah K.</h4>
                                    <p className="text-xs text-zinc-500 font-medium">September 2025 · Couple's Getaway</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-600 leading-relaxed font-medium">"Immaculate attention to detail. The host concierge was incredibly responsive through the app. Felt incredibly safe and well-taken care of."</p>
                        </div>
                    </div>
                </section>

                {/* Similar Sanctuaries (Retention Carousel) */}
                {similarListings && similarListings.length > 0 && (
                    <section className="space-y-6 pt-6 border-t border-zinc-200/60 pb-12">
                        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900">Similar Sanctuaries</h2>
                        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {similarListings.map(sim => (
                                <div 
                                    key={sim.id} 
                                    onClick={() => { uiAudio.playClick(); if (onListingClick) onListingClick(sim); }}
                                    className="snap-start shrink-0 w-[260px] md:w-[300px] cursor-pointer group"
                                >
                                    <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-100 mb-3 border border-zinc-200/50">
                                        <OptimizedImage 
                                            src={sim.imageUrls?.[0] || sim.imageUrl} 
                                            aspectRatio="4:3" 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                            alt={sim.title} 
                                        />
                                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/40 shadow-sm flex items-center gap-1">
                                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                            <span className="text-[10px] font-bold text-zinc-900">{sim.rating?.toFixed(1) || '4.9'}</span>
                                        </div>
                                    </div>
                                    <h4 className="text-sm font-bold text-zinc-900 truncate">{sim.title}</h4>
                                    <p className="text-xs font-medium text-zinc-500 truncate">{sim.type} · {sim.city}</p>
                                    <p className="text-sm font-extrabold text-zinc-900 mt-1">
                                        {sim.currency === 'USD' ? '$' : '₹'}{sim.price.toLocaleString()} <span className="font-medium text-xs text-zinc-500">/ night</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="text-center text-zinc-500 mb-12">
                   Milestone 4 Trust Engine Complete. Awaiting Checkout Dock (M5).
                </div>
            </div>

            {/* Right Column: Sticky Glass Checkout Dock (M5) */}
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4 relative pb-12">
                <div className="sticky top-28 bg-white border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 flex flex-col">
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <span className="text-3xl font-extrabold tracking-tight text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()}</span>
                            <span className="text-zinc-500 font-medium ml-1">night</span>
                        </div>
                        {listing.originalId && <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded">Suite Rate</span>}
                    </div>

                    {/* Dual-Date Engine */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl overflow-hidden mb-6">
                        <div className="grid grid-cols-2 divide-x divide-zinc-200/80 border-b border-zinc-200/80">
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1">Check-in</label>
                                <input 
                                    type="date" 
                                    min={new Date().toISOString().split('T')[0]}
                                    value={checkIn}
                                    onChange={(e) => {
                                        setCheckIn(e.target.value);
                                        trackDateSelection(e.target.value, checkOut);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-600 focus:ring-0 cursor-pointer"
                                />
                            </div>
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1">Check-out</label>
                                <input 
                                    type="date" 
                                    min={checkIn}
                                    value={checkOut}
                                    onChange={(e) => {
                                        setCheckOut(e.target.value);
                                        trackDateSelection(checkIn, e.target.value);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-600 focus:ring-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="p-3">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1">Guests</label>
                            <select 
                                value={guests}
                                onChange={(e) => setGuests(Number(e.target.value))}
                                className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-600 focus:ring-0 cursor-pointer"
                            >
                                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>)}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleReserve}
                        className="w-full bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold py-4 rounded-xl shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-4"
                    >
                        <CreditCard className="w-5 h-5" />
                        Reserve Sanctuary
                    </button>
                    
                    <p className="text-[11px] text-zinc-400 text-center mb-6 font-medium">You won't be charged yet</p>

                    {/* Visual Split-Cost Calculator (Strict Ledger) */}
                    <div className="space-y-3 text-sm text-zinc-600 font-medium">
                        <div className="flex justify-between">
                            <span className="underline decoration-zinc-300 underline-offset-4">{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()} x {nights} nights</span>
                            <span>{listing.currency === 'USD' ? '$' : '₹'}{baseRentTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="underline decoration-zinc-300 underline-offset-4">Optimization Fee (15%)</span>
                            <span>{listing.currency === 'USD' ? '$' : '₹'}{enchoFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="underline decoration-zinc-300 underline-offset-4">Taxes (18%)</span>
                            <span>{listing.currency === 'USD' ? '$' : '₹'}{taxAmount.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div className="h-px bg-zinc-200/80 my-4" />
                    
                    <div className="flex justify-between items-center text-lg font-extrabold text-zinc-900">
                        <span>Total Before Taxes</span>
                        <span>{listing.currency === 'USD' ? '$' : '₹'}{grandTotal.toLocaleString()}</span>
                    </div>
                </div>
            </div>

        </div>
        
        {/* Mobile Sticky Checkout Dock (M5) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-zinc-200 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] z-50 px-4 py-3 pb-safe safe-area-bottom">
            <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{basePrice.toLocaleString()}</span>
                        <span className="text-xs font-semibold text-zinc-500">night</span>
                    </div>
                    <button 
                        onClick={() => document.getElementById('mobile-date-drawer')?.classList.remove('hidden')}
                        className="text-xs font-bold text-indigo-600 underline decoration-indigo-600/30 underline-offset-4 mt-0.5"
                    >
                        {new Date(checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </button>
                </div>
                <button 
                    onClick={handleReserve}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3.5 px-8 rounded-xl active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,0,0,0.15)] flex-1 max-w-[180px]"
                >
                    Reserve
                </button>
            </div>
        </div>

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
