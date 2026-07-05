import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Listing } from '../types';
import { 
  Palmtree, 
  MapPin, 
  Star, 
  ChevronLeft, 
  Share2, 
  Heart, 
  Tv, 
  Wifi, 
  Utensils, 
  Users, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Sparkles, 
  Check, 
  CheckCircle,
  Clock,
  Maximize2,
  Calendar,
  X,
  CreditCard,
  Phone,
  User,
  Coffee,
  Waves
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { CheckoutModal } from './CheckoutModal';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { ImageGallery } from './ImageGallery';
import { getRatingWord, formatRating } from '../lib/ratingUtils';
import { uiAudio } from './audio';

interface ResortDetailsProps {
  listing: Listing;
  onBack: () => void;
  similarListings?: Listing[];
  onListingClick?: (listing: Listing) => void;
  isFavorite: boolean;
  onToggleFavorite: (listing: Listing) => void;
  onBook?: (data: Record<string, any>) => void;
  onRequestAuth?: () => void;
}

export const ResortDetails: React.FC<ResortDetailsProps> = ({
  listing,
  onBack,
  isFavorite,
  onToggleFavorite,
  onBook,
  onRequestAuth
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();

  // Video States
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Gallery States
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [initialGalleryIndex, setInitialGalleryIndex] = useState(0);

  // Sub-units Search / Filter States
  const [subUnitFilter, setSubUnitFilter] = useState<string>('All'); // All, Cottage, Villa, Suite, Room, Event Space
  const [guestCountFilter, setGuestCountFilter] = useState<number>(0); // 0 means any
  const [selectedSubUnit, setSelectedSubUnit] = useState<any>(null);

  // Booking details for selected sub-unit
  const [bookingDate, setBookingDate] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [guestName, setGuestName] = useState(user?.name || '');
  const [guestPhone, setGuestPhone] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Fallback stock cinematic video for resorts if not provided
  const videoUrl = listing.video_url || 'https://assets.mixkit.co/videos/preview/mixkit-luxury-resort-with-swimming-pool-and-palm-trees-41585-large.mp4';

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => setIsPlaying(false));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleTogglePlay = () => {
    uiAudio.playPop();
    setIsPlaying(!isPlaying);
  };

  const handleToggleMute = () => {
    uiAudio.playPop();
    setIsMuted(!isMuted);
  };

  // Extract all sub-units (rooms list) from the listing
  const subUnits = listing.rooms || [];

  // Filtered sub-units based on selected category and capacity filter
  const filteredSubUnits = subUnits.filter((unit: any) => {
    const matchesCategory = subUnitFilter === 'All' || (unit.type || 'Cottage').toLowerCase() === subUnitFilter.toLowerCase();
    const matchesCapacity = guestCountFilter === 0 || (unit.capacity || 2) >= guestCountFilter;
    return matchesCategory && matchesCapacity;
  });

  // Get unique sub-unit types
  const categories = ['All', 'Cottage', 'Villa', 'Suite', 'Room', 'Event Space'];

  const handleOpenGallery = (images: string[], index: number) => {
    uiAudio.playPop();
    setGalleryImages(images);
    setInitialGalleryIndex(index);
    setShowPhotoGallery(true);
  };

  const handleInitiateBooking = (unit: any) => {
    if (!user) {
      if (onRequestAuth) {
        onRequestAuth();
      } else {
        addToast("Authentication Required", "Please log in to reserve an accommodation.", "info");
      }
      return;
    }
    uiAudio.playPop();
    setSelectedSubUnit(unit);
  };

  const handleConfirmReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      addToast("Validation Error", "Please provide a guest name.", "warning");
      return;
    }
    if (guestPhone.replace(/\D/g, '').length < 6) {
      addToast("Validation Error", "Please provide a valid contact number.", "warning");
      return;
    }
    uiAudio.playPop();
    setIsCheckoutOpen(true);
  };

  const handleBookingSuccess = () => {
    setIsCheckoutOpen(false);
    if (onBook && selectedSubUnit) {
      const price = selectedSubUnit.price;
      const resortFee = Math.round(price * 0.10); // 10% premium resort maintenance fee
      onBook({
        moveInDate: bookingDate,
        configuration: `${selectedSubUnit.type || 'Cottage'} - ${selectedSubUnit.name}`,
        name: guestName,
        phone: guestPhone,
        totalRent: price + resortFee,
        selectedConfigId: selectedSubUnit.id
      });
      setSelectedSubUnit(null);
      addToast("Reservation Confirmed", "Your premium resort reservation is successfully confirmed!", "success");
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-24 text-gray-900 font-sans selection:bg-[#0284C7]/20 selection:text-[#0284C7]">
        
        {/* CINEMATIC HERO SECTION */}
        <section className="relative w-full h-[65vh] md:h-[80vh] bg-black overflow-hidden select-none">
          {/* Automatic Played Video */}
          <video
            ref={videoRef}
            src={videoUrl}
            loop
            muted={isMuted}
            autoPlay
            playsInline
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-90 transition-opacity duration-1000 scale-105"
          />

          {/* Top Floating Controls */}
          <div className="absolute top-0 left-0 right-0 p-4 md:p-8 flex items-center justify-between z-30">
            <button 
              onClick={() => {
                uiAudio.playPop();
                onBack();
              }}
              className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/15 text-white transition-all shadow-xl active:scale-95"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  uiAudio.playPop();
                  onToggleFavorite(listing);
                }}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/15 text-white transition-all shadow-xl active:scale-95"
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
              <button 
                onClick={() => {
                  uiAudio.playPop();
                  navigator.clipboard.writeText(window.location.href);
                  addToast("Link Copied", "Resort link copied to your clipboard.", "success");
                }}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/15 text-white transition-all shadow-xl active:scale-95"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Floating Video Controls */}
          <div className="absolute bottom-6 right-6 flex items-center gap-3 z-30">
            <button 
              onClick={handleTogglePlay}
              className="p-3 bg-black/45 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all border border-white/10 shadow-lg active:scale-90"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button 
              onClick={handleToggleMute}
              className="p-3 bg-black/45 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all border border-white/10 shadow-lg active:scale-90"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Ambient Glassmorphism Shadow Overlays */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-50 via-gray-50/40 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-0 bg-black/25 pointer-events-none z-0" />
          
          {/* Elegant Display Overlay Name & Location */}
          <div className="absolute bottom-12 left-4 md:left-12 right-4 md:right-12 z-20 text-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0284C7] text-white text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1.5 shadow-md">
                <Palmtree className="w-3.5 h-3.5" />
                Resort Experience
              </span>
              {listing.rating && listing.rating > 0 && (
                <span className="bg-white/15 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-white/10 shadow-md">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {formatRating(listing.rating)} ({getRatingWord(listing.rating)})
                </span>
              )}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight drop-shadow-md">{listing.title}</h1>
            <div className="flex items-center gap-1.5 mt-2 opacity-90 font-medium text-sm md:text-base drop-shadow-sm">
              <MapPin className="w-4 h-4" />
              <span>{listing.address}, {listing.city}</span>
            </div>
          </div>
        </section>

        {/* CONTAINER AND DUAL LAYERED INFO SCREEN */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* LEFT 2 COLS: OVERVIEW & ACCOMMODATION LISTINGS */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* RESORT DESCRIPTION CARD */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6"
            >
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">About this Luxury Haven</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>

              {/* HIGH LEVEL RESORT AMENITIES LIST */}
              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-base font-bold text-gray-900 mb-4 uppercase tracking-wide">Included Resort Amenities & Features</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {listing.amenities?.map((amenity, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium text-gray-800">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="truncate">{amenity}</span>
                    </div>
                  ))}
                  {(!listing.amenities || listing.amenities.length === 0) && (
                    <div className="text-gray-400 italic text-sm">Included in your reservation</div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* INTERACTIVE SUITES, COTTAGES, AND SPACES SELECTOR */}
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Available Accommodations & Spaces</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Book individual cottages, villas, apartments, or private banquet spaces for events.
                  </p>
                </div>

                {/* CAPACITY GUEST COUNT SLIDER FILTER */}
                <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-2.5 shadow-sm max-w-[280px]">
                  <Users className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 text-xs font-bold text-gray-700">
                    <span className="block">Guests Count ({guestCountFilter === 0 ? 'Any' : `${guestCountFilter}+`})</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1" 
                      value={guestCountFilter} 
                      onChange={(e) => setGuestCountFilter(parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0284C7] mt-1" 
                    />
                  </div>
                  {guestCountFilter > 0 && (
                    <button 
                      onClick={() => setGuestCountFilter(0)} 
                      className="p-1 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* SEGMENTED FILTER NAVIGATION */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {categories.map((cat) => {
                  const isActive = subUnitFilter === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        uiAudio.playPop();
                        setSubUnitFilter(cat);
                      }}
                      className={`
                        px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border
                        ${isActive 
                          ? 'bg-gray-900 border-gray-900 text-white shadow-md scale-105' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                        }
                      `}
                    >
                      {cat === 'All' ? 'All Units' : cat}
                    </button>
                  );
                })}
              </div>

              {/* ACCOMMODATION CARDS CONTAINER */}
              {filteredSubUnits.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-200 rounded-3xl mt-2">
                  <Palmtree className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-bold">No matching accommodations found</p>
                  <p className="text-gray-400 text-sm mt-1">Try resetting your filters or guest capacity count slider.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {filteredSubUnits.map((unit: any, idx: number) => {
                    const roomImages = unit.imageUrls && unit.imageUrls.length > 0 
                      ? unit.imageUrls 
                      : ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'];

                    const typeBadgeColor = 
                      (unit.type || '').toLowerCase() === 'event space' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      (unit.type || '').toLowerCase() === 'villa' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-sky-50 text-sky-700 border-sky-200';

                    return (
                      <motion.div 
                        key={unit.id || idx}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all grid grid-cols-1 md:grid-cols-5"
                      >
                        {/* LEFT 2/5 COLS: DYNAMIC PHOTO SLIDER */}
                        <div className="md:col-span-2 relative h-48 md:h-full min-h-[200px] bg-gray-100 group select-none">
                          <img 
                            src={roomImages[0]} 
                            alt={unit.name} 
                            onClick={() => handleOpenGallery(roomImages, 0)}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in" 
                          />
                          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                            <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border shadow-sm ${typeBadgeColor}`}>
                              {unit.type || 'Cottage'}
                            </span>
                          </div>
                          {roomImages.length > 1 && (
                            <button 
                              onClick={() => handleOpenGallery(roomImages, 0)}
                              className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              +{roomImages.length - 1} Photos
                            </button>
                          )}
                        </div>

                        {/* RIGHT 3/5 COLS: DETAILS & CALL TO ACTION */}
                        <div className="md:col-span-3 p-6 flex flex-col justify-between space-y-6">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <h3 className="text-xl font-bold text-gray-900 tracking-tight">{unit.name}</h3>
                              <span className="text-xl font-extrabold text-gray-900 shrink-0">
                                {formatPrice(unit.price, listing.currency)}
                                <span className="text-gray-400 text-xs font-semibold block text-right mt-0.5">/night</span>
                              </span>
                            </div>

                            {/* CAPACITY INDICATORS */}
                            <div className="flex items-center gap-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span>Accommodates {unit.capacity || 2} {unit.capacity > 10 ? 'Event Guests' : 'Guests'}</span>
                              </div>
                              {unit.hasAc && (
                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">A/C</span>
                              )}
                              {unit.hasAttachedBathroom && (
                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">Attached Bath</span>
                              )}
                            </div>

                            {/* SUB-UNIT AMENITIES list */}
                            {unit.amenities && unit.amenities.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {unit.amenities.slice(0, 4).map((amenity: string, aidx: number) => (
                                  <span key={aidx} className="bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    {amenity}
                                  </span>
                                ))}
                                {unit.amenities.length > 4 && (
                                  <span className="text-xs text-gray-400 font-bold self-center ml-1">+{unit.amenities.length - 4} more</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
                            <span className="text-xs font-medium text-gray-400 italic">Resort safety guarantee</span>
                            <button
                              onClick={() => handleInitiateBooking(unit)}
                              className="px-6 py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-[#0284C7]/20 active:scale-[0.98]"
                            >
                              Select & Reserve
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COL: HOSTING & QUICK CONCIERGE INFORMATION CARD */}
          <div className="space-y-6">
            
            {/* PRICE STARTS FROM SUMMARY CARD */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Stay Starts From</span>
                  <span className="text-3xl font-extrabold text-gray-900">{formatPrice(listing.price, listing.currency)}</span>
                </div>
                <span className="text-sm font-semibold text-gray-500">/night</span>
              </div>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs font-medium text-emerald-800 leading-relaxed">
                  <span className="block font-bold mb-0.5">Flexible Configurations Available</span>
                  Book individual cottages or event lawns. Perfect for private getaways, pre-wedding events, or grand gatherings.
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100 text-sm font-semibold text-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" /> Check-in Time
                  </span>
                  <span>14:00 PM</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" /> Check-out Time
                  </span>
                  <span>11:00 AM</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" /> Minimum Stay
                  </span>
                  <span>1 Night</span>
                </div>
              </div>
            </div>

            {/* NEIGHBORHOOD MAPS CARD */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Location Overview</h3>
              <div className="aspect-[4/3] rounded-2xl overflow-hidden relative border border-gray-100 bg-gray-50">
                <iframe 
                  title="Resort Location"
                  width="100%" 
                  height="100%" 
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://maps.google.com/maps?q=${listing.lat || 12.9716},${listing.lng || 77.5946}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="flex items-start gap-2.5 text-xs font-semibold text-gray-500 leading-normal">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <span>Ideally located with easy vehicle ingress and gorgeous natural valley surroundings.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: SUB-UNIT BOOKING RESERVATION PANEL DRAWER */}
      <AnimatePresence>
        {selectedSubUnit && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-[#0284C7] uppercase tracking-wider block mb-1">Accommodation Reservation</span>
                  <h3 className="text-xl font-bold text-gray-900 leading-tight">Confirm Your Selection</h3>
                </div>
                <button 
                  onClick={() => {
                    uiAudio.playPop();
                    setSelectedSubUnit(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selection Summary */}
              <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                  <img 
                    src={selectedSubUnit.imageUrls?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=150&q=80'} 
                    alt={selectedSubUnit.name} 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">
                    {selectedSubUnit.type || 'Cottage'} • Max {selectedSubUnit.capacity || 2} Guests
                  </span>
                  <h4 className="font-bold text-gray-900 leading-snug">{selectedSubUnit.name}</h4>
                  <span className="text-sm font-extrabold text-[#0284C7] mt-0.5 block">
                    {formatPrice(selectedSubUnit.price, listing.currency)} <span className="text-gray-400 text-xs font-semibold">/night</span>
                  </span>
                </div>
              </div>

              {/* Guest Details Form */}
              <form onSubmit={handleConfirmReservation} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Arrival Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required 
                      type="date" 
                      min={new Date().toISOString().split('T')[0]} 
                      value={bookingDate} 
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0284C7] text-sm font-semibold text-gray-800" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Lead Guest Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required 
                      type="text" 
                      placeholder="e.g. Jane Doe" 
                      value={guestName} 
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0284C7] text-sm font-semibold text-gray-800" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Guest Contact Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required 
                      type="tel" 
                      placeholder="e.g. +91 98765 43210" 
                      value={guestPhone} 
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0284C7] text-sm font-semibold text-gray-800" 
                    />
                  </div>
                </div>

                {/* Pricing summary */}
                <div className="pt-4 border-t border-gray-100 space-y-2 text-sm font-semibold text-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Nightly Fare</span>
                    <span>{formatPrice(selectedSubUnit.price, listing.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Resort Maintenance (10%)</span>
                    <span className="text-emerald-600">+{formatPrice(Math.round(selectedSubUnit.price * 0.10), listing.currency)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-dashed border-gray-200">
                    <span>Total Estimated Bill</span>
                    <span>{formatPrice(selectedSubUnit.price + Math.round(selectedSubUnit.price * 0.10), listing.currency)}</span>
                  </div>
                </div>

                {/* Confirm Button */}
                <button
                  type="submit"
                  className="w-full py-4 bg-[#e51d53] hover:bg-[#c11543] text-white font-bold rounded-2xl shadow-lg transition-colors mt-6 flex items-center justify-center gap-2 active:scale-95"
                >
                  <CreditCard className="w-5 h-5" />
                  Proceed to Secure Checkout
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PHOTO GALLERY MODAL */}
      <ImageGallery 
        images={galleryImages} 
        initialIndex={initialGalleryIndex}
        isOpen={showPhotoGallery} 
        onClose={() => setShowPhotoGallery(false)} 
      />

      {/* STRIPE SECURE CHECKOUT MODAL */}
      <CheckoutModal 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        onSuccess={handleBookingSuccess} 
        amount={selectedSubUnit ? selectedSubUnit.price + Math.round(selectedSubUnit.price * 0.10) : 0} 
      />
    </>
  );
};
