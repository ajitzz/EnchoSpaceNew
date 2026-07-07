import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Check, 
  CheckCircle, 
  Video, 
  Volume2, 
  VolumeX, 
  ChevronLeft, 
  ChevronRight, 
  Bed, 
  Users, 
  ArrowRight, 
  Lock, 
  Calendar, 
  TrendingUp, 
  Compass, 
  HelpCircle, 
  Layers, 
  ArrowRightLeft,
  DollarSign,
  Briefcase,
  Heart,
  Maximize2,
  Minimize2,
  Info,
  X,
  Shield,
  Eye
} from 'lucide-react';

interface RoomType {
  id: string;
  name: string;
  price: number;
  capacity?: string | number;
  bedrooms?: string | number;
  inventory_count?: number;
  description?: string;
  video_url?: string;
  imageUrls?: string[];
  amenities?: string[];
}

interface ListingType {
  title: string;
  imageUrl: string;
  currency: string;
  type?: string;
}

interface PremiumInventoryUnitCardProps {
  key?: string | number;
  room: RoomType;
  listing: ListingType;
  isSelected: boolean;
  toggleSelection: () => void;
  formatPrice: (price: number, currency: string) => string;
}

interface PrivacyDetails {
  score: number;
  label: string;
  description: string;
  privateAmenities: string[];
  sharedAmenities: string[];
  macroContext: string;
  microContext: string;
  acousticRating: number;
  acousticLabel: string;
  acousticDesc: string;
  crowdingRating: number;
  crowdingLabel: string;
  crowdingDesc: string;
}

export const getPrivacyDetails = (roomName: string, listingTitle: string): PrivacyDetails => {
  const name = roomName.toLowerCase();
  
  if (
    name.includes('cottage') || 
    name.includes('villa') || 
    name.includes('bungalow') || 
    name.includes('house') || 
    name.includes('bhk') || 
    name.includes('chalet') || 
    name.includes('cabin') || 
    name.includes('penthouse')
  ) {
    return {
      score: 95,
      label: "Standalone Luxury",
      description: "A detached standalone unit with dedicated entrance and zero shared physical walls.",
      privateAmenities: [
        "Private Entrance & Keypad",
        "Ensuite Master Bathroom",
        "Private Kitchenette & Dining",
        "Dedicated Balcony / Garden Patio",
        "In-unit Washer & Dryer",
        "Individually Controlled AC & Heat"
      ],
      sharedAmenities: [
        "Resort Pool, Spa & Wellness Gym",
        "Clubhouse Lounge & Fine Dining",
        "Valet Parking & Car charging",
        "Central Estate Gardens & Concierge"
      ],
      macroContext: "Standalone Cottage",
      microContext: "No Shared Walls",
      acousticRating: 100,
      acousticLabel: "Whisper-Quiet: 100% Standalone Air-Gap",
      acousticDesc: "Zero structural contact with any adjoining suites. Double-paned acoustic glass secures absolute quiet.",
      crowdingRating: 100,
      crowdingLabel: "Grounds Density: Peak Seclusion (0 Co-Guests)",
      crowdingDesc: "Complete lockout of the unit area. Dedicated private grounds access with zero shared thoroughfares."
    };
  }
  
  if (
    name.includes('suite') || 
    name.includes('apartment') || 
    name.includes('deluxe') || 
    name.includes('wing') || 
    name.includes('studio') || 
    name.includes('loft')
  ) {
    return {
      score: 80,
      label: "Elite Seclusion",
      description: "An exclusive self-contained suite or apartment situated in a premium wing of the main villa.",
      privateAmenities: [
        "Keyless Access Suite Door",
        "Ensuite Luxury Marble Bath",
        "Private Lounge & Media Space",
        "Dedicated Executive Workspace",
        "Mini bar & Espresso station"
      ],
      sharedAmenities: [
        "Shared Villa Foyer & Entrance",
        "Grand Courtyard & Fire Pit",
        "Main Resort Swimming Pool",
        "Private Dining Salon",
        "Complimentary Shuttle Service"
      ],
      macroContext: "Exclusive Residence Wing",
      microContext: "Dedicated Guest Suite",
      acousticRating: 85,
      acousticLabel: "High Seclusion: 45dB Double Masonry Core",
      acousticDesc: "Double cavity brickwork and acoustic sound dampening sheets inside drywall keep surrounding sounds fully locked out.",
      crowdingRating: 80,
      crowdingLabel: "Grounds Density: Diluted Luxury (Boutique Footprint)",
      crowdingDesc: "Very low shared foot traffic. Shared resort pool and foyers maintain generous visual dilution."
    };
  }
  
  // Default - Private room or cozy room
  return {
    score: 65,
    label: "Ensuite Private Room",
    description: "A secure private bedroom with dedicated ensuite bathroom, situated inside a gorgeous shared estate.",
    privateAmenities: [
      "Lockable Soundproof Door",
      "Private Ensuite Bathroom",
      "Dedicated Laptop Desk & Safe",
      "In-room Wardrobe & Smart TV"
    ],
    sharedAmenities: [
      "Shared Gourmet Chef's Kitchen",
      "Villa Living Room & Fireplace",
      "Main Patio & Sun Loungers",
      "Spa, Gym & Tennis Courts",
      "Shared Laundry Facility"
    ],
    macroContext: "Luxury Lodge Room",
    microContext: "Shared Estate Living",
    acousticRating: 72,
    acousticLabel: "Standard Comfort: 35dB Sound Barrier",
    acousticDesc: "Solid-core wooden entry door with thermal seal blocks general corridor noise for an optimal night's sleep.",
    crowdingRating: 65,
    crowdingLabel: "Grounds Density: Intimate Co-living (4-8 Residents)",
    crowdingDesc: "Co-living configuration. High-end shared spaces bring together a tight-knit circle of verified professionals."
  };
};

const PremiumInventoryUnitCard = ({ 
  room, 
  listing, 
  isSelected, 
  toggleSelection, 
  formatPrice 
}: PremiumInventoryUnitCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const privacy = getPrivacyDetails(room.name, listing.title);

  // Auto-play list of images as an elegant slow slideshow when selected
  useEffect(() => {
    if (isSelected && room.imageUrls && room.imageUrls.length > 1) {
      const interval = setInterval(() => {
        setActiveImageIndex((prev) => (prev + 1) % (room.imageUrls?.length || 1));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isSelected, room.imageUrls]);

  const images = room.imageUrls && room.imageUrls.length > 0 
    ? room.imageUrls 
    : [listing.imageUrl];

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const scrollToBookingCard = () => {
    const bookingCard = document.getElementById('booking-card');
    if (bookingCard) {
      bookingCard.scrollIntoView({ behavior: 'smooth' });
      bookingCard.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'transition-all', 'duration-500');
      setTimeout(() => {
        bookingCard.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2');
      }, 2000);
    }
  };

  const handleAddStayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (room.inventory_count === 0) return;
    
    toggleSelection();
    if (!isSelected) {
      setTimeout(() => {
        scrollToBookingCard();
      }, 300);
    }
  };

  return (
    <div 
      id={`premium-unit-card-${room.id}`}
      className={`relative overflow-hidden transition-all duration-500 ease-in-out font-sans ${
        isSelected 
          ? 'rounded-3xl border-2 border-amber-500/80 shadow-[0_12px_40px_rgba(245,158,11,0.08)] bg-gradient-to-br from-[#FCFBF7] via-white to-amber-50/10 dark:from-zinc-900/40 dark:via-zinc-950 dark:to-zinc-900/30 my-8' 
          : 'rounded-3xl border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg bg-white dark:bg-zinc-900 my-6'
      }`}
    >
      {/* Elegance Top-Bar for Selected Unit */}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 z-20" />
      )}

      {/* COMPACT & HIGHLY POLISHED INLINE LAYOUT (Matches stays overall system) */}
      <div className="flex flex-col md:flex-row w-full overflow-hidden">
        
        {/* Left Media Pane (40% width on md+, fixed height on mobile) */}
        <div className="relative w-full md:w-[38%] h-56 md:h-64 overflow-hidden bg-zinc-900 flex-shrink-0 group">
          <img 
            src={images[isSelected ? activeImageIndex : 0]} 
            alt={room.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-300" />
          
          {/* Badge overlays */}
          <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10">
            {isSelected ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider shadow-md">
                <Sparkles className="w-3 h-3" />
                Selected House
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold uppercase tracking-wider border border-white/10">
                Premium Option
              </span>
            )}
          </div>

          {/* Deep Explore Trigger Badge */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsModalOpen(true);
            }}
            className="absolute bottom-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white text-[11px] font-medium tracking-wide shadow-md border border-white/10 transition-all cursor-pointer z-10 opacity-90 hover:opacity-100"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            Deep Explore
          </button>
        </div>

        {/* Right Details Deck (60% width) */}
        <div className="flex-1 p-6 md:p-8 flex flex-col justify-between relative bg-white dark:bg-zinc-900">
          
          <div>
            {/* Top Row: Category and Nightly Price */}
            <div className="flex justify-between items-start gap-4 mb-2">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-zinc-400 dark:text-zinc-500 uppercase block mb-1 font-mono">
                  {privacy.macroContext}
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-zinc-950 dark:text-white tracking-tight flex items-center gap-2">
                  {room.name}
                </h3>
                
                {/* Macro-Micro Context Pills */}
                <div className="flex flex-wrap gap-1.5 mt-1.5 mb-3">
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20">
                    {privacy.macroContext}
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    {privacy.microContext}
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1">Nightly Price</span>
                <span className="font-extrabold text-xl md:text-2xl text-zinc-900 dark:text-white">{formatPrice(room.price, listing.currency)}</span>
              </div>
            </div>

            {/* Capacity & Bed badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {room.capacity && (
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 px-2.5 py-1 rounded-md flex items-center gap-1">
                  <Users className="w-3 h-3 text-amber-500" />
                  {room.capacity} Guests
                </span>
              )}
              {room.bedrooms && (
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 px-2.5 py-1 rounded-md flex items-center gap-1">
                  <Bed className="w-3 h-3 text-amber-500" />
                  {room.bedrooms} Beds
                </span>
              )}
              {room.inventory_count !== undefined && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                  room.inventory_count > 0 
                    ? 'text-emerald-700 bg-emerald-50/50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/10 dark:border-emerald-800/30' 
                    : 'text-red-700 bg-red-50/50 border-red-100 dark:text-red-400 dark:bg-red-950/10 dark:border-red-800/30'
                }`}>
                  {room.inventory_count} Available
                </span>
              )}
            </div>


            {/* Short description */}
            <p className="text-zinc-500 dark:text-zinc-400 text-sm line-clamp-2 leading-relaxed">
              {room.description || `Bespoke accommodation in ${listing.title}. Features luxury bedding, private access, and signature amenities.`}
            </p>
          </div>

          {/* Action Row */}
          <div className={`flex items-center justify-between gap-4 mt-6 pt-4 border-t ${isSelected ? 'border-amber-100 dark:border-zinc-800' : 'border-zinc-100 dark:border-zinc-800'}`}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors underline underline-offset-4"
            >
              Details & Gallery
            </button>

            <div className="flex items-center gap-2">
              {isSelected ? (
                <>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection();
                    }}
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-500 hover:text-zinc-800 dark:border-zinc-700 dark:hover:border-zinc-600 dark:text-zinc-400 dark:hover:text-white text-xs font-semibold transition-colors"
                  >
                    Remove
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToBookingCard();
                    }}
                    className="px-5 py-2.5 bg-zinc-950 text-white dark:bg-white dark:text-black rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-100 hover:scale-[1.02] flex items-center gap-1.5"
                  >
                    Book House
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                  </button>
                </>
              ) : (
                <button 
                  onClick={handleAddStayClick}
                  disabled={room.inventory_count === 0}
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 border ${
                    room.inventory_count === 0 
                      ? 'bg-zinc-50 text-zinc-400 border-zinc-200 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600 dark:border-zinc-700' 
                      : 'bg-white text-zinc-900 border-zinc-300 hover:border-zinc-900 dark:bg-zinc-900 dark:text-white dark:border-zinc-700 dark:hover:border-zinc-400 hover:bg-zinc-50/50'
                  }`}
                >
                  {room.inventory_count === 0 ? 'Sold Out' : 'Select House'}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ==================== WORLD-CLASS PORTAL/MODAL DEEP EXPLORE OVERLAY ==================== */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop Blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/50 backdrop-blur-md"
            />

            {/* Modal Body Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative bg-white dark:bg-zinc-900 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto max-h-[90vh] md:h-[650px] border border-zinc-100 dark:border-zinc-800 z-10"
            >
              {/* Media Column (50% width on md+) */}
              <div className="relative w-full md:w-[50%] h-[260px] md:h-full bg-black shrink-0 overflow-hidden">
                {room.video_url && !videoError ? (
                  <div className="w-full h-full relative">
                    <video 
                      ref={videoRef}
                      autoPlay 
                      loop 
                      muted={isVideoMuted} 
                      playsInline 
                      onError={() => setVideoError(true)}
                      className="w-full h-full object-cover"
                      src={room.video_url}
                    />
                    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsVideoMuted(!isVideoMuted);
                        }}
                        className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white border border-white/20 hover:bg-black/85 transition-all shadow-md"
                      >
                        {isVideoMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full relative">
                    <img 
                      src={images[activeImageIndex]} 
                      alt={room.name}
                      className="w-full h-full object-cover"
                    />
                    
                    {images.length > 1 && (
                      <>
                        <button 
                          onClick={handlePrevImage}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm border border-white/10 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={handleNextImage}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm border border-white/10 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {images.map((_, i) => (
                            <button 
                              key={i} 
                              onClick={() => setActiveImageIndex(i)}
                              className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'w-4 bg-amber-400' : 'bg-white/40'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Media Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
                
                <div className="absolute top-4 left-4 z-10">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider shadow-md">
                    <Sparkles className="w-3 h-3 animate-pulse" />
                    Signature Collection
                  </span>
                </div>

                <div className="absolute bottom-6 left-6 right-6 text-white pointer-events-none">
                  <span className="text-[10px] font-bold tracking-wider text-amber-400 uppercase font-mono block mb-1">
                    Integrated House Rental
                  </span>
                  <h4 className="text-2xl font-bold tracking-tight">
                    {room.name}
                  </h4>
                  <p className="text-xs text-zinc-300 mt-1.5">
                    Within Resort: {listing.title}
                  </p>
                </div>
              </div>

              {/* Information Column (50% width on md+, fully scrollable) */}
              <div className="flex-1 p-6 md:p-8 flex flex-col justify-between overflow-y-auto h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                
                {/* Scrollable details container */}
                <div className="space-y-6">
                  {/* Close button & Category */}
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase font-mono">{privacy.macroContext}</span>
                      <h3 className="text-2xl font-bold mt-1 tracking-tight text-zinc-950 dark:text-white">{room.name}</h3>
                    </div>
                    <button 
                      onClick={() => setIsModalOpen(false)}
                      className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Pricing and Available units */}
                  <div className="flex justify-between items-baseline py-3 border-y border-zinc-100 dark:border-zinc-800">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-0.5 font-mono">Rate per night</span>
                      <span className="text-3xl font-extrabold text-zinc-950 dark:text-white">
                        {formatPrice(room.price, listing.currency)}
                      </span>
                    </div>
                    {room.inventory_count !== undefined && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                        room.inventory_count > 0 
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-800/40' 
                          : 'text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/20 dark:border-red-800/40'
                      }`}>
                        {room.inventory_count} remaining
                      </span>
                    )}
                  </div>

                  {/* Privacy, Acoustic, & Crowding Density Spectrum Gauges */}
                  <div className="p-4 rounded-2xl bg-zinc-50/60 dark:bg-zinc-800/25 border border-zinc-100 dark:border-zinc-800/80 space-y-4">
                    {/* Metric 1: General Privacy */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 font-sans">
                          <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Spatial Privacy Index
                        </span>
                        <span className="text-[11px] font-mono font-extrabold text-amber-600 dark:text-amber-400">
                          {privacy.score}% — {privacy.label}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-1000 ease-out" 
                          style={{ width: `${privacy.score}%` }} 
                        />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-light">
                        {privacy.description}
                      </p>
                    </div>

                    {/* Metric 2: Acoustic Seclusion */}
                    <div className="space-y-1 pt-2 border-t border-zinc-100/60 dark:border-zinc-800/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 font-sans">
                          <Volume2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          Acoustic Isolation Index
                        </span>
                        <span className="text-[11px] font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                          {privacy.acousticRating}% Seclusion
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
                          style={{ width: `${privacy.acousticRating}%` }} 
                        />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-light">
                        <strong>{privacy.acousticLabel}:</strong> {privacy.acousticDesc}
                      </p>
                    </div>

                    {/* Metric 3: Crowding Density */}
                    <div className="space-y-1 pt-2 border-t border-zinc-100/60 dark:border-zinc-800/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 font-sans">
                          <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          Social Crowding Density
                        </span>
                        <span className="text-[11px] font-mono font-extrabold text-blue-600 dark:text-blue-400">
                          {privacy.crowdingRating}% Dilution
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
                          style={{ width: `${privacy.crowdingRating}%` }} 
                        />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-light">
                        <strong>{privacy.crowdingLabel}:</strong> {privacy.crowdingDesc}
                      </p>
                    </div>
                  </div>

                  {/* Room Description */}
                  <div>
                    <h4 className="text-[11px] font-bold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase font-mono mb-2">The Residence Experience</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-light">
                      {room.description || `Immerse yourself in the private comfort of our luxury ${room.name}. This gorgeous space has been custom curated for elite travelers, featuring spacious bedrooms, state-of-the-art climate control, fast internet access, and full seamless coordination with all amenities at ${listing.title}.`}
                    </p>
                  </div>

                  {/* Specifications Grid */}
                  <div className="grid grid-cols-2 gap-3.5">
                    {room.capacity && (
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
                        <Users className="w-4 h-4 text-amber-500" />
                        <div>
                          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase font-bold block font-mono">Capacity</span>
                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{room.capacity} VIP Guests</span>
                        </div>
                      </div>
                    )}
                    {room.bedrooms && (
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
                        <Bed className="w-4 h-4 text-amber-500" />
                        <div>
                          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase font-bold block font-mono">Accommodations</span>
                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{room.bedrooms} Bedroom</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Interactive Matrix: My Space vs. Shared Space */}
                  <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold tracking-tight text-zinc-900 dark:text-white uppercase font-mono">
                        Spatial Matrix: My Space vs. Shared Space
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {/* My Private Sanctuary Column */}
                      <div className="p-4 rounded-2xl bg-amber-50/20 dark:bg-amber-950/5 border border-amber-200/50 dark:border-amber-900/10">
                        <div className="flex items-center gap-1.5 mb-3 text-amber-800 dark:text-amber-400">
                          <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wider font-mono">My Sanctuary (100% Exclusive)</span>
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {privacy.privateAmenities.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                              <span className="leading-tight">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Shared Resort Amenities Column */}
                      <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/10 border border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5 mb-3 text-zinc-600 dark:text-zinc-400">
                          <Eye className="w-4 h-4 text-zinc-400 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wider font-mono">Shared Resort Amenities</span>
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {privacy.sharedAmenities.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mt-1.5 shrink-0" />
                              <span className="leading-tight">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Signature Inclusions */}
                  {room.amenities && room.amenities.length > 0 && (
                    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <h4 className="text-[11px] font-bold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase font-mono mb-3">Signature Inclusions</h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        {room.amenities.map((am) => (
                          <div key={am} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                            <span className="w-4 h-4 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shrink-0">
                              <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            </span>
                            <span className="text-xs font-medium truncate" title={am}>{am}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Action button at bottom */}
                <div className="pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <button 
                    onClick={(e) => {
                      handleAddStayClick(e);
                      setIsModalOpen(false);
                    }}
                    disabled={room.inventory_count === 0}
                    className={`w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2
                      ${room.inventory_count === 0 
                        ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600 dark:border-zinc-700' 
                        : isSelected
                          ? 'bg-amber-500 text-black hover:bg-amber-600 shadow-md shadow-amber-500/10'
                          : 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-100 shadow-md shadow-black/10'
                      }`}
                  >
                    <span>{isSelected ? 'Remove Selected Residence' : 'Add Residence to Reservation'}</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PremiumInventoryUnitCard;
