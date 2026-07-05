import React, { useState, useEffect, useRef } from 'react';
import { SEO } from './SEO';
import { motion } from 'framer-motion';
import { uiAudio } from './audio';
import { Listing, NearbyPoint } from '../types';
import { 
  ChevronLeft, 
  StarIcon, 
  ShieldCheck, 
  HeartIcon, 
  MapIcon, 
  PhoneIcon, 
  MessageCircleIcon, 
  WifiIcon, 
  GymIcon, 
  TrainIcon, 
  ShoppingBagIcon, 
  TreeIcon, 
  CoffeeIcon, 
  ChevronDown, 
  XIcon, 
  CalendarIcon,
  UtensilsIcon,
  CarIcon,
  WavesIcon,
  BriefcaseIcon,
  PawPrintIcon,
  SmokeIcon
} from './Icons';
import { useAuth } from './AuthContext';
import { CheckoutModal } from './CheckoutModal';
import { useToast } from './ToastContext';
import { OptimizedImage, getOptimizedUrl } from './OptimizedImage';
import { useCurrency } from './CurrencyContext';
import { ImageGallery } from './ImageGallery';
import { getRatingWord, formatRating } from '../lib/ratingUtils';
import { io } from 'socket.io-client';

let socket: any = null;

interface ListingDetailsProps {
  listing: Listing;
  onBack: () => void;
  onListingClick: (listing: Listing) => void;
  similarListings: Listing[];
  isFavorite: boolean;
  onToggleFavorite: (listing: Listing) => void;
  onBook?: (data: Record<string, unknown>) => void;
  onContactHost?: () => void;
  onRequestAuth?: () => void;
}

// Helper to map amenities to icons
const getAmenityIcon = (amenity: string) => {
    const lower = amenity.toLowerCase();
    if (lower.includes('wifi') || lower.includes('internet')) return <WifiIcon className="w-5 h-5" />;
    if (lower.includes('gym') || lower.includes('fitness')) return <GymIcon className="w-5 h-5" />;
    if (lower.includes('kitchen')) return <UtensilsIcon className="w-5 h-5" />;
    if (lower.includes('parking')) return <CarIcon className="w-5 h-5" />;
    if (lower.includes('pool')) return <WavesIcon className="w-5 h-5" />;
    if (lower.includes('workspace')) return <BriefcaseIcon className="w-5 h-5" />;
    if (lower.includes('pets')) return <PawPrintIcon className="w-5 h-5" />;
    if (lower.includes('smoking')) return <SmokeIcon className="w-5 h-5" />;
    return <ShieldCheck className="w-5 h-5" />;
};

// --- Helpers for Date & Availability ---

const getFutureDate = (daysToAdd: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    // Format to YYYY-MM-DD local time to avoid timezone issues with inputs
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const dateOptions = [
    { label: 'Today', value: getFutureDate(0) },
    { label: 'Tomorrow', value: getFutureDate(1) },
    { label: 'Next Week', value: getFutureDate(7) },
    { label: 'Next Month', value: getFutureDate(30) },
];

interface ConfigOption {
    label: string;
    type: string;
}

// Check availability using DB calendar prices
const checkAvailability = (id: string, date: string, calendarPrices: any[], listingId: string): { status: 'AVAILABLE' | 'SOLD_OUT'; label: string } => {
    if (!date) return { status: 'AVAILABLE', label: 'Check Date' };
    
    // Check calendar DB blocks
    const dayInfo = calendarPrices.find(cp => cp.date_string === date && (cp.listing_id == listingId || cp.listing_id === undefined));
    if (dayInfo && dayInfo.status === 'blocked') {
        return { status: 'SOLD_OUT', label: 'Sold Out' };
    }

    return { status: 'AVAILABLE', label: 'Available' };
};


const NearbyCategorySection = ({ type, points }: { type: string; points: NearbyPoint[] }) => {
    const [expanded, setExpanded] = useState(false);
    
    if (!points || points.length === 0) return null;

    const topPoint = points[0];
    const otherPoints = points.slice(1);
    const hasMore = otherPoints.length > 0;
    
    let Icon = MapIcon;
    if (type === 'TRANSPORT') Icon = TrainIcon;
    else if (type === 'GROCERY') Icon = ShoppingBagIcon;
    else if (type === 'PARK') Icon = TreeIcon;
    else if (type === 'CAFE') Icon = CoffeeIcon;
    else if (type === 'GYM') Icon = GymIcon;

    return (
        <div className="border-b border-gray-100 last:border-0 py-4">
            <div 
                className={`flex items-start gap-4 ${hasMore ? 'cursor-pointer group' : ''}`}
                onClick={() => hasMore && setExpanded(!expanded)}
            >
                {/* Icon */}
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700 flex-shrink-0 group-hover:bg-gray-100 transition-colors">
                    <Icon className="w-5 h-5" />
                </div>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-gray-900 truncate pr-2">{topPoint.name}</span>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{topPoint.distance}</span>
                    </div>
                    <div className="flex items-center gap-2">
                         <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">{type}</span>
                         {hasMore && !expanded && (
                             <span className="text-xs text-gray-400 font-medium">+ {otherPoints.length} more</span>
                         )}
                    </div>
                </div>

                {/* Right Arrow */}
                {hasMore && (
                    <div className="pt-1 pl-2 text-gray-400 group-hover:text-black transition-colors">
                        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                )}
            </div>

            {/* Expandable Section */}
            {hasMore && expanded && (
                <div className="pl-[3.5rem] mt-3 space-y-3 animate-fade-in">
                    {otherPoints.map((point, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm pl-0">
                            <span className="text-gray-600 truncate pr-2">{point.name}</span>
                            <span className="text-gray-500 whitespace-nowrap">{point.distance}</span>
                        </div>
                    ))}
                    <button 
                        onClick={() => setExpanded(false)}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600 mt-2 uppercase tracking-wide"
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
};

const ListingDetails: React.FC<ListingDetailsProps> = ({ listing, onBack, similarListings, onListingClick, isFavorite, onToggleFavorite, onBook, onContactHost, onRequestAuth }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const [showNav, setShowNav] = useState(true);
  const lastScrollY = useRef(0);
  
  // Booking State
  const [bookingStep, setBookingStep] = useState<'AVAILABILITY' | 'CONTACT'>('AVAILABILITY');
  const [moveInDate, setMoveInDate] = useState(getFutureDate(0)); // Default to today
  
  // Smart Sync State for Configurations: Store array of selected IDs (rooms or 'entire_place')
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>(() => {
      if (listing.selectedConfigId) return [listing.selectedConfigId];
      if (listing.rental_mode === 'private_rooms' && listing.rooms?.[0]?.id) return [listing.rooms[0].id];
      return ['entire_place'];
  });
  
  const [minDate] = useState(getFutureDate(0));

  const toggleConfigSelection = (id: string, allRoomIds: string[]) => {
      setSelectedConfigIds(prev => {
          if (id === 'entire_place') return ['entire_place'];
          
          let next = prev.filter(x => x !== 'entire_place');
          if (next.includes(id)) {
              next = next.filter(x => x !== id);
          } else {
              next.push(id);
          }
          
          if (next.length === 0) return ['entire_place'];
          if (allRoomIds.length > 0 && next.length === allRoomIds.length) return ['entire_place'];
          
          return next;
      });
  };

  const configOptions = React.useMemo(() => {
     const options = [];
     const mode = listing.rental_mode || 'entire_place';
     if (mode === 'entire_place' || mode === 'hybrid') {
        options.push({ id: 'entire_place', label: 'Entire Apartment/Place', price: listing.price });
     }
     if (mode === 'private_rooms' || mode === 'hybrid') {
        listing.rooms?.forEach(room => {
            options.push({ id: room.id, label: room.name, price: room.price });
        });
     }
     return options;
  }, [listing]);

  const isEntirePlace = selectedConfigIds.includes('entire_place');
  const selectedRooms = isEntirePlace ? [] : (listing.rooms?.filter(r => selectedConfigIds.includes(r.id)) || []);

  const activeConfig = {
      price: isEntirePlace ? listing.price : selectedRooms.reduce((sum, r) => sum + r.price, 0),
      label: isEntirePlace ? 'Entire Apartment/Place' : 
             (selectedRooms.length === 1 ? selectedRooms[0].name : `${selectedRooms.length} Rooms Selected`),
      id: isEntirePlace ? 'entire_place' : 'multi_room'
  };

  // Calendar Pricing State
  const [calendarPrices, setCalendarPrices] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(10);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
     fetch(`/api/listings/${listing.id}/calendar?_t=${Date.now()}`, { cache: 'no-store' })
       .then(res => res.json())
       .then(data => {
          if (Array.isArray(data)) setCalendarPrices(data);
       })
       .catch(err => console.error(err));

     fetch(`/api/listings/${listing.id}/reviews?_t=${Date.now()}`, { cache: 'no-store' })
       .then(res => res.json())
       .then(data => {
          if (Array.isArray(data)) setReviews(data);
       })
       .catch(err => console.error(err));
  }, [listing.id]);

  useEffect(() => {
     if (user) {
         fetch(`/api/listings/${listing.id}/can-review?_t=${Date.now()}`, {
             headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
             cache: 'no-store'
         })
         .then(res => res.json())
         .then(data => setCanReview(data.canReview))
         .catch(err => console.error(err));
     } else {
         setCanReview(false);
     }
  }, [user, listing.id]);

  const submitReview = async () => {
      if (!user) return alert('Please login to submit a review');
      if (!newReviewText.trim()) return;
      setSubmittingReview(true);
      try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/listings/${listing.id}/reviews`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ rating: newReviewRating, content: newReviewText })
          });
          if (res.ok) {
              const newReview = await res.json();
              newReview.user_name = user.name;
              setReviews(prev => [newReview, ...prev]);
              setNewReviewText('');
              setNewReviewRating(5);
              setCanReview(false);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setSubmittingReview(false);
      }
  };

  // Derived Pricing State
  let currentDayPrice = activeConfig.price;
  let currentOffer = null;

  const dayInfo = calendarPrices.find(cp => cp.date_string === moveInDate && (cp.listing_id == listing.id || cp.listing_id === undefined));
  let basePrice = activeConfig.price;
  
  if (dayInfo && dayInfo.price) {
      basePrice = Number(dayInfo.price);
  } else {
      // Weekend calculation
      const parts = moveInDate.split('-');
      if (parts.length === 3) {
          const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          const dayOfWeek = dt.getDay();
          const weekendMultiplier = listing.dynamicPricing?.weekendMultiplier || 1.0;
          const seasonalMultiplier = listing.dynamicPricing?.seasonalMultiplier || 1.0;
          
          if (dayOfWeek === 0 || dayOfWeek === 6) {
              basePrice = Math.round(basePrice * (weekendMultiplier !== 1.0 ? weekendMultiplier : 1.1) * seasonalMultiplier);
          } else {
              basePrice = Math.round(basePrice * seasonalMultiplier);
          }
      }
  }
  
  if (dayInfo && dayInfo.offer) {
      currentOffer = dayInfo.offer;
      currentDayPrice = Math.round(basePrice * (1 - dayInfo.offer.discount_percentage / 100));
  } else if (listing.discount) {
      // Legacy listing discount logic
      currentOffer = { title: 'Special Discount', discount_percentage: listing.discount };
      currentDayPrice = Math.round(basePrice * (1 - listing.discount / 100));
  } else {
      currentOffer = null;
      currentDayPrice = basePrice;
  }
  
  // User Details State
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Prefill details when user is authenticated
  useEffect(() => {
    if (user) {
        if (!guestName) setGuestName(user.name || '');
        if (!guestPhone && user.phone) setGuestPhone(user.phone);
    }
  }, [user, guestName, guestPhone]);

  // UI State for Custom Dropdowns
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMobileConfigOpen, setIsMobileConfigOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const configDropdownRef = useRef<HTMLDivElement>(null);

  // Mobile Booking Sheet State
  const [showMobileBooking, setShowMobileBooking] = useState(false);

  // Generate deterministic images based on the listing ID or real images
  const baseImageUrl = listing.imageUrl || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';
  const FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1600607687931-5701d3fda5e8?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"
  ];

  const images = Array.from({ length: Math.max(5, listing.imageUrls?.length || 0, listing.imageCount || 5) }).map(
    (_, i) => {
       if (listing.imageUrls && listing.imageUrls[i]) return listing.imageUrls[i];
       return FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
    }
  );

  // Modal State for Photo Gallery
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [initialGalleryIndex, setInitialGalleryIndex] = useState(0);

  const openGallery = (index: number) => {
    setInitialGalleryIndex(index);
    setShowPhotoGallery(true);
  };

  const [liveViewers, setLiveViewers] = useState(1);

  useEffect(() => {
    if (!socket) socket = io();
    
    socket.emit('join_listing', listing.id);
    
    const handleViewers = (data: { viewers: number }) => {
       setLiveViewers(data.viewers);
    };

    const handleListingUpdate = (data: { type: string }) => {
       // Notify user that something changed (like a booking was made)
       addToast("Live Update", "This listing's availability was just updated.", "info");
       // In a real app we might refetch the listing data here
    };
    
    socket.on('listing_viewers', handleViewers);
    socket.on('listing_updated', handleListingUpdate);
    
    return () => {
       socket.off('listing_viewers', handleViewers);
       socket.off('listing_updated', handleListingUpdate);
       socket.emit('leave_listing', listing.id);
    };
  }, [listing.id, addToast]);

  // Group nearby points by type
  const nearbyByType = listing.nearby?.reduce((acc, point) => {
      if (!acc[point.type]) acc[point.type] = [];
      acc[point.type].push(point);
      return acc;
  }, {} as Record<string, NearbyPoint[]>) || {};

  // Scroll listener for auto-hiding navbar
  useEffect(() => {
    const controlNavbar = () => {
      if (typeof window !== 'undefined') {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > lastScrollY.current && currentScrollY > 50) { 
          // Scroll down & passed top threshold -> Hide
          setShowNav(false);
        } else { 
          // Scroll up -> Show
          setShowNav(true);
        }
        
        lastScrollY.current = currentScrollY;
      }
    };
    
    // Close dropdowns on click outside
    const handleClickOutside = (event: MouseEvent) => {
        if (configDropdownRef.current && !configDropdownRef.current.contains(event.target as Node)) {
            setIsConfigOpen(false);
        }
    };

    window.addEventListener('scroll', controlNavbar);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', controlNavbar);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleBookingAction = () => {
      uiAudio.playClick();
      if (!moveInDate) {
          addToast("Invalid Date", "Please select a move-in date before proceeding.", "warning");
          return;
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(moveInDate);
      if (selectedDate < today) {
          addToast("Invalid Date", "Move-in date cannot be in the past.", "error");
          return;
      }

      if (bookingStep === 'AVAILABILITY') {
          if (!user && onRequestAuth) {
              addToast("Login Required", "Please log in to complete your booking.", "info");
              onRequestAuth();
              return;
          }
          // Move to contact form step with animation
          uiAudio.playPop();
          setBookingStep('CONTACT');
      } else {
          // Validate inputs
          if (!guestName || guestName.trim().length < 2) {
              addToast("Validation Error", "Please enter a valid guest name.", "warning");
              return;
          }
          if (!guestPhone || guestPhone.replace(/\D/g, '').length < 6) {
              addToast("Validation Error", "Please enter a valid phone number (at least 6 digits).", "warning");
              return;
          }
          // Open Stripe Checkout
          uiAudio.playPop();
          setIsCheckoutOpen(true);
      }
  };

  const handleMobileReserve = () => {
    uiAudio.playClick();
    if (!moveInDate) {
        addToast("Invalid Date", "Please select a move-in date before proceeding.", "warning");
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(moveInDate);
    if (selectedDate < today) {
        addToast("Invalid Date", "Move-in date cannot be in the past.", "error");
        return;
    }
    
    if (!user && onRequestAuth) {
        addToast("Login Required", "Please log in to complete your booking.", "info");
        onRequestAuth();
        return;
    }
    if (!guestName || guestName.trim().length < 2) {
        addToast("Validation Error", "Please enter a valid guest name.", "warning");
        return;
    }
    if (!guestPhone || guestPhone.replace(/\D/g, '').length < 6) {
        addToast("Validation Error", "Please enter a valid phone number (at least 6 digits).", "warning");
        return;
    }
    uiAudio.playPop();
    // Open Stripe Checkout
    setIsCheckoutOpen(true);
  };
  
  const finishBooking = () => {
      setIsCheckoutOpen(false);
      if (onBook) {
          const maintenanceFee = Math.round(currentDayPrice * 0.10);
          onBook({
              moveInDate,
              configuration: activeConfig.label,
              name: guestName,
              phone: guestPhone,
              totalRent: currentDayPrice + maintenanceFee
          });
      }
  };

  // Calculations for rent breakdown
  const maintenanceFee = Math.round(currentDayPrice * 0.10); // 10% maintenance
  const totalRent = currentDayPrice + maintenanceFee;
  const deposit = currentDayPrice * 3; // 3 months deposit

  // Render Custom Configuration Dropdown
  const renderConfigDropdown = () => {
      return (
          <div className="relative" ref={configDropdownRef}>
              <div 
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`
                    w-full flex items-center justify-between bg-white text-gray-900 text-sm rounded-xl px-4 py-3.5 
                    cursor-pointer transition-all border
                    ${isConfigOpen ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-black'}
                  `}
              >
                  <span className="font-bold">{activeConfig.label}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isConfigOpen ? 'rotate-180' : ''}`} />
              </div>

              {/* Dropdown Menu */}
              {isConfigOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                      {configOptions.map((opt) => {
                          const avail = checkAvailability(opt.id, moveInDate, calendarPrices, listing.id);
                          const isAvailable = avail.status === 'AVAILABLE';
                          const isSelected = selectedConfigIds.includes(opt.id);
                          
                          return (
                              <div 
                                  key={opt.id}
                                  onClick={() => {
                                      toggleConfigSelection(opt.id, listing.rooms?.map(r => r.id) || []);
                                  }}
                                  className={`
                                      flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 transition-colors cursor-pointer
                                      ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}
                                  `}
                              >
                                  <div className="flex items-center gap-3">
                                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-black border-black text-white' : 'border-gray-300'}`}>
                                          {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                      </div>
                                      <span className={`font-medium ${isSelected ? 'text-black' : 'text-gray-600'}`}>
                                          {opt.label}
                                      </span>
                                  </div>
                                  {/* Availability Badge - Modern Black & White */}
                                  <span className={`
                                      text-[10px] font-bold px-2 py-0.5 rounded border tracking-wide uppercase
                                      ${isAvailable 
                                        ? 'bg-black text-white border-black' 
                                        : 'bg-white text-gray-500 border-gray-200'}
                                  `}>
                                      {avail.label}
                                  </span>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      );
  };

  return (
    <>
      <SEO 
        title={listing.seo_title || `${listing.title} | Encho Space`} 
        description={listing.seo_description || listing.description?.substring(0, 160) || `Stay at ${listing.title} in ${listing.city}`}
        image={listing.seo_image_url || listing.imageUrls?.[0] || listing.imageUrl}
        keywords={listing.seo_keywords || `stay, ${listing.city}, ${listing.title}`}
      />
    <div className="bg-white min-h-screen animate-fade-in pb-32">
      
      {/* Main Content Container - Spaced elegantly from top on desktop and flush on mobile */}
      <div className="max-w-7xl mx-auto md:px-6 pt-0 md:pt-8">
        
        {/* Gallery Grid & Mobile Swipe */}
        <div className="md:mb-8 relative group md:rounded-2xl overflow-hidden shadow-sm">
            
            
        {/* Unified Top Header Buttons Overlay (Absolute over image/grid) */}
        <div className="absolute top-0 inset-x-0 z-[40] flex items-center justify-between p-4 md:p-6 mt-2 pointer-events-none">
            <button 
                onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center shadow-lg pointer-events-auto active:scale-95 transition-transform hover:scale-105 border border-gray-100"
                title="Back to search"
            >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-900 pr-0.5" />
            </button>
            <div className="flex gap-2.5 md:gap-3 pointer-events-auto">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        uiAudio.playClick();
                        if (navigator.share) {
                            navigator.share({
                                title: listing.title,
                                text: listing.description,
                                url: window.location.href
                            }).catch(err => console.log(err));
                        } else {
                            navigator.clipboard.writeText(window.location.href);
                            addToast("Link Copied", "Listing link copied to clipboard!", "success");
                        }
                    }}
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:scale-105 border border-gray-100"
                    title="Share listing"
                >
                    <svg viewBox="0 0 32 32" className="w-4 h-4 md:w-4.5 md:h-4.5 text-gray-900" aria-hidden="true" role="presentation" focusable="false" style={{display: 'block', fill: 'none', stroke: 'currentcolor', strokeWidth: 2.5, overflow: 'visible'}}><g fill="none"><path d="M27 18v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9"></path><path d="M16 3v23V3z"></path><path d="M6 13l9.293-9.293a1 1 0 0 1 1.414 0L26 13"></path></g></svg>
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); onToggleFavorite(listing); }}
                    className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:scale-105 border border-gray-100"
                    title={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon className={`w-5 h-5 md:w-5.5 md:h-5.5 ${isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-gray-900'}`} filled={isFavorite} />
                </button>
            </div>
        </div>
        
        {/* Mobile Carousel (Swipable) */}
        <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory scrollbar-hide aspect-[4/3] w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {images.map((img, i) => (
                <div key={i} className="w-full h-full flex-shrink-0 snap-center relative">
                    <OptimizedImage 
                        src={img} 
                        priority={i === 0}
                        className="w-full h-full object-cover cursor-pointer" 
                        alt={`Mobile Image ${i + 1}`}
                        onClick={() => openGallery(i)}
                    />
                    {listing.isVerified && i === 0 && (
                        <div className="absolute top-16 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-none">
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-bold tracking-wide text-gray-900 uppercase">Verified Plus</span>
                        </div>
                    )}
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-md text-white text-xs font-medium cursor-pointer pointer-events-none">
                        {i + 1} / {images.length}
                    </div>
                </div>
            ))}
        </div>
    {/* Desktop Grid (Airbnb/Zumper style) */}
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[450px]">
                <div className="col-span-2 row-span-2 relative h-full">
                    <OptimizedImage 
                        src={images[0]} 
                        priority={true}
                        
                        className="w-full h-full object-cover hover:brightness-95 transition-all cursor-pointer" 
                        alt="Main"
                    />
                    {listing.isVerified && (
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-none">
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-bold tracking-wide text-gray-900 uppercase">Verified Plus</span>
                        </div>
                    )}
                </div>
                {images.length > 1 && <div><OptimizedImage src={images[1]}  className="w-full h-full object-cover hover:brightness-95 transition-all cursor-pointer" alt="Detail 1" /></div>}
                {images.length > 2 ? <div><OptimizedImage src={images[2]}  className="w-full h-full object-cover hover:brightness-95 transition-all cursor-pointer" alt="Detail 2" /></div> : <div className="bg-gray-100" />}
                {images.length > 3 ? <div><OptimizedImage src={images[3]}  className="w-full h-full object-cover hover:brightness-95 transition-all cursor-pointer" alt="Detail 3" /></div> : <div className="bg-gray-100" />}
                {images.length > 4 ? (
                  <div className="relative">
                      <OptimizedImage src={images[4]}  className="w-full h-full object-cover hover:brightness-95 transition-all cursor-pointer" alt="Detail 4" />
                      <button onClick={() => openGallery(0)} className="absolute bottom-4 right-4 bg-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:bg-gray-50 transition-transform active:scale-95">
                          Show all photos
                      </button>
                  </div>
                ) : (
                    <div className="bg-gray-100 relative">
                       {images.length <= 4 && (
                          <button onClick={() => openGallery(0)} className="absolute bottom-4 right-4 bg-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:bg-gray-50 transition-transform active:scale-95">
                              Show all photos
                          </button>
                       )}
                    </div>
                )}
            </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 relative">
            
            {/* Left Column: Details */}
            <div className="flex-1 min-w-0">
                
                {/* Header Info */}
                <div className="border-b border-gray-200 pb-6 mb-8">
                    <div className="flex justify-between items-start mb-2">
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{listing.title}</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-gray-600 mb-4 text-sm md:text-base">
                        <div className="flex items-center gap-2">
                            <div className="bg-[#003B95] text-white text-sm font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-sm">
                                <StarIcon className="w-3.5 h-3.5 fill-current" /> {formatRating(listing.rating)}
                            </div>
                            {listing.rating && listing.rating > 0 && (
                                <span className="font-semibold text-gray-900">
                                    {getRatingWord(listing.rating)}
                                </span>
                            )}
                        </div>
                        <span>·</span>
                        <span className="underline cursor-pointer hover:text-black">{listing.reviewCount} reviews</span>
                        <span>·</span>
                        <span className="underline cursor-pointer hover:text-black">{listing.address || "Berlin, Germany"}</span>
                        {liveViewers > 1 && (
                            <>
                                <span>·</span>
                                <span className="flex items-center gap-1.5 text-[#0284C7] font-medium bg-[#0284C7]/10 px-2.5 py-0.5 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-[#0284C7] rounded-full animate-pulse" />
                                    {liveViewers} viewing right now
                                </span>
                            </>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-700 font-medium">
                        <span>{listing.maxGuests} guests</span>
                        <span className="text-gray-300">·</span>
                        <span>{listing.bedrooms || 1} bedroom</span>
                        <span className="text-gray-300">·</span>
                        <span>{listing.beds || 1} bed</span>
                        <span className="text-gray-300">·</span>
                        <span>{listing.bathrooms || 1} bathroom</span>
                    </div>
                </div>

                {/* About Section */}
                <div className="mb-10">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">About this home</h2>
                    <p className="text-gray-600 leading-relaxed text-base md:text-lg">
                        {listing.description || "Experience the best of city living in this beautifully furnished apartment. Located in a vibrant neighborhood, you'll have easy access to local cafes, restaurants, and public transport. The space features modern amenities, high-speed Wi-Fi, and a fully equipped kitchen, making it perfect for both short and long-term stays."}
                    </p>
                    <button className="mt-4 font-semibold underline text-gray-900 hover:text-gray-700">Show more</button>
                </div>

                {/* Video Tour Section */}
                {listing.video_url && (
                    <div className="mb-10 py-8 border-t border-gray-200">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Video Tour</h2>
                        <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-video shadow-sm border border-gray-100 group">
                            {listing.video_url.includes('youtube.com') || listing.video_url.includes('youtu.be') ? (
                                <iframe 
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${
                                        listing.video_url.includes('v=') ? listing.video_url.split('v=')[1].split('&')[0] : listing.video_url.split('/').pop()
                                    }`}
                                    title="Property Video Tour"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            ) : (
                                <video 
                                    controls 
                                    className="w-full h-full object-cover"
                                    preload="metadata"
                                >
                                    <source src={listing.video_url} type="video/mp4" />
                                    Your browser does not support the video tag.
                                </video>
                            )}
                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-gray-900 shadow-sm">
                                Max 45s Tour
                            </div>
                        </div>
                    </div>
                )}

                {/* Inventory Selection Menu (Complex Listings / Rooms) */}
                {listing.rooms && listing.rooms.length > 0 && (
                    <div className="mb-10 py-8 border-t border-gray-200">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Inventory Selection Menu</h2>
                        <p className="text-gray-600 mb-8 text-lg">Compare available accommodation types and pricing tiers for your dates.</p>
                        <div className="flex flex-col gap-6">
                            
                            {/* Entire Apartment Smart Option */}
                            {listing.rental_mode !== 'private_rooms' && (
                                <div 
                                    className={`rounded-2xl border transition-all cursor-pointer flex flex-col justify-between overflow-hidden p-6 md:p-8 ${isEntirePlace ? 'border-black ring-1 ring-black bg-gray-50 shadow-md' : 'border-gray-200 bg-white hover:shadow-md hover:border-gray-300'}`}
                                    onClick={() => {
                                        toggleConfigSelection('entire_place', listing.rooms?.map(r => r.id) || []);
                                        document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                >
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <h3 className="font-bold text-xl text-gray-900">Entire {listing.type || 'Property'}</h3>
                                            <p className="text-base text-gray-500 mt-2">Book the entire place for your stay. Complete privacy and full access.</p>
                                        </div>
                                        <div className="text-left md:text-right">
                                            <span className="font-bold text-2xl text-[#0284C7] block">{formatPrice(listing.price, listing.currency)}<span className="text-sm font-normal text-gray-500"> /night</span></span>
                                        </div>
                                    </div>
                                    <div className={`w-full mt-6 py-4 rounded-xl font-bold transition-all flex justify-center items-center gap-2 ${isEntirePlace ? 'bg-black text-white' : 'border border-gray-900 text-gray-900 hover:bg-gray-50'}`}>
                                        {isEntirePlace ? (
                                            <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Entire Place Selected</>
                                        ) : 'Select Entire Place'}
                                    </div>
                                </div>
                            )}

                            {listing.rooms.map((room, idx) => {
                                const isRoomSelected = selectedConfigIds.includes(room.id);
                                return (
                                <div 
                                    key={room.id || idx} 
                                    role="region"
                                    aria-label={`Inventory unit: ${room.name}`}
                                    className={`rounded-3xl border transition-all flex flex-col md:flex-row overflow-hidden ${isRoomSelected ? 'border-black ring-1 ring-black bg-gray-50 shadow-md' : 'border-gray-200 bg-white hover:shadow-md hover:border-gray-300'}`}
                                >
                                    {room.imageUrls && room.imageUrls.length > 0 && (
                                        <div className="w-full md:w-[300px] h-48 md:h-auto bg-gray-100 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 relative">
                                            <OptimizedImage src={room.imageUrls[0]} alt={`Photo of ${room.name}`} className="w-full h-full object-cover absolute inset-0" />
                                        </div>
                                    )}
                                    <div className="p-6 md:p-8 flex flex-col justify-between flex-1">
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                                                <div>
                                                    <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                                                        {room.name}
                                                        {room.inventory_count !== undefined && (
                                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${room.inventory_count > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`} aria-live="polite">
                                                                {room.inventory_count > 0 ? `${room.inventory_count} left` : 'Sold Out'}
                                                            </span>
                                                        )}
                                                    </h3>
                                                    
                                                    <div className="flex flex-wrap gap-2 mt-3" aria-label={`Amenities for ${room.name}`}>
                                                        {room.hasAttachedBathroom && (
                                                            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full">
                                                                🛁 Attached Bath
                                                            </span>
                                                        )}
                                                        {room.hasAc && (
                                                            <span className="bg-teal-50 text-teal-700 text-xs font-semibold px-2 py-1 rounded-full">
                                                                ❄️ AC
                                                            </span>
                                                        )}
                                                        {room.amenities && room.amenities.map(am => (
                                                            <span key={am} className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded-full">
                                                                {getAmenityIcon(am)} {am}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="text-left md:text-right">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Starts From</span>
                                                    <span className="font-bold text-2xl text-[#0284C7] block" aria-label={`Starts from ${room.price} ${listing.currency} per night`}>{formatPrice(room.price, listing.currency)}<span className="text-sm font-normal text-gray-500"> /night</span></span>
                                                </div>
                                            </div>

                                            {/* Pricing Tiers Section */}
                                            {room.tiers && room.tiers.length > 0 ? (
                                                <div className="mt-4 border-t border-gray-100 pt-6">
                                                    <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Select Package Tier</h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={`Select tier for ${room.name}`}>
                                                        {room.tiers.map((tier, tIdx) => (
                                                            <div key={tIdx} 
                                                                 role="radio"
                                                                 aria-checked={isRoomSelected}
                                                                 tabIndex={0}
                                                                 onKeyDown={(e) => {
                                                                     if (e.key === 'Enter' || e.key === ' ') {
                                                                         if (room.inventory_count !== 0) {
                                                                             toggleConfigSelection(room.id, listing.rooms?.map(r => r.id) || []);
                                                                             document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                                                         }
                                                                     }
                                                                 }}
                                                                 onClick={() => {
                                                                    if (room.inventory_count !== 0) {
                                                                        toggleConfigSelection(room.id, listing.rooms?.map(r => r.id) || []);
                                                                        document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                                                    }
                                                                 }}
                                                                 className={`p-4 rounded-xl border cursor-pointer transition-colors focus:ring-2 focus:outline-none ${room.inventory_count === 0 ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-black'}`}>
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="font-bold text-gray-900">{tier.name}</span>
                                                                    <span className="font-bold text-[#0284C7]">{formatPrice(tier.price, listing.currency)}</span>
                                                                </div>
                                                                <ul className="space-y-1" aria-label={`Amenities for tier ${tier.name}`}>
                                                                    {tier.amenities.map((tam, i) => (
                                                                        <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                                                                            <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                                            {tam}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                                                    <button 
                                                        disabled={room.inventory_count === 0}
                                                        aria-label={`Select ${room.name}`}
                                                        onClick={() => {
                                                            if (room.inventory_count !== 0) {
                                                                toggleConfigSelection(room.id, listing.rooms?.map(r => r.id) || []);
                                                                document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                                            }
                                                        }}
                                                        className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:outline-none ${room.inventory_count === 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : (isRoomSelected ? 'bg-black text-white' : 'border border-gray-900 text-gray-900 hover:bg-gray-50')}`}
                                                    >
                                                        {isRoomSelected ? (
                                                            <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Selected</>
                                                        ) : 'Select Unit'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                )}

                {/* Redesigned Amenities Section */}
                <div className="mb-10 py-8 border-t border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">What this place offers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {listing.amenities?.map((amenity, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <div className="text-gray-700">
                                    {getAmenityIcon(amenity)}
                                </div>
                                <span className="font-medium text-gray-700">{amenity}</span>
                            </div>
                        ))}
                    </div>
                    <button className="mt-6 w-full md:w-auto border border-gray-900 text-gray-900 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                        Show all {listing.amenities?.length || 10} amenities
                    </button>
                </div>

                {/* Redesigned Location / Nearby Section with Collapsible Categories */}
                <div className="mb-10 py-8 border-t border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Nearby</h2>
                    {/* Grouped Nearby List */}
                    <div className="space-y-2">
                        <NearbyCategorySection type="TRANSPORT" points={nearbyByType['TRANSPORT']} />
                        <NearbyCategorySection type="GROCERY" points={nearbyByType['GROCERY']} />
                        <NearbyCategorySection type="PARK" points={nearbyByType['PARK']} />
                        <NearbyCategorySection type="CAFE" points={nearbyByType['CAFE']} />
                        <NearbyCategorySection type="GYM" points={nearbyByType['GYM']} />
                    </div>
                </div>

                {/* Map Section */}
                <div className="mb-10 pt-4 pb-8 border-t border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Where you’ll be</h2>
                     <div className="relative w-full h-64 md:h-80 bg-gray-100 rounded-2xl overflow-hidden shadow-sm group">
                        <iframe
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            loading="lazy"
                            allowFullScreen
                            referrerPolicy="no-referrer-when-downgrade"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(listing.address || listing.title + " " + (listing.city || ""))}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                        ></iframe>
                         <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-sm text-sm font-semibold text-gray-800 border border-gray-100 max-w-[80%] truncate">
                             {listing.address || "Berlin, Germany"}
                         </div>
                    </div>
                     <div className="mt-4">
                        <h3 className="font-semibold text-gray-900 mb-1">{listing.address || "Berlin, Germany"}</h3>
                        <p className="text-gray-600 text-sm">
                            We will send you the exact location once your booking is confirmed.
                        </p>
                    </div>
                </div>

                {/* Reviews Section */}
                <div className="mb-10 pt-4 pb-8 border-t border-gray-200">
                    <div className="flex items-center gap-3 mb-6">
                        {reviews.length > 0 ? (
                            <>
                                <div className="bg-[#003B95] text-white text-xl font-bold px-2 py-1 rounded-t-lg rounded-br-lg shadow-sm">
                                    {(reviews.reduce((a,c) => a + Number(c.rating), 0) / reviews.length).toFixed(1)}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xl font-bold text-gray-900">
                                        {getRatingWord(reviews.reduce((a,c) => a + Number(c.rating), 0) / reviews.length)}
                                    </span>
                                    <span className="text-gray-500 text-sm">{reviews.length} reviews</span>
                                </div>
                            </>
                        ) : (
                            <h2 className="text-xl font-bold text-gray-900">No reviews yet</h2>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-8">
                        {reviews.slice(0, 6).map((review, idx) => (
                            <div key={idx} className="flex flex-col">
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 overflow-hidden">
                                        {review.user_name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-gray-900">{review.user_name}</h4>
                                        <p className="text-gray-500 text-sm">{new Date(review.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex mb-2">
                                    {[...Array(10)].map((_, i) => (
                                        <span key={i}><StarIcon className={`w-3 h-3 ${i < Number(review.rating) ? 'fill-current text-black' : 'text-gray-300'}`} /></span>
                                    ))}
                                </div>
                                <p className="text-gray-700 leading-relaxed text-sm">
                                    {review.content}
                                </p>
                            </div>
                        ))}
                    </div>

                    {user ? (
                        canReview ? (
                            <div className="mt-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                <h3 className="font-bold text-gray-900 mb-4">Leave a review</h3>
                                <div className="flex mb-4 cursor-pointer">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                                        <StarIcon 
                                           key={star} 
                                           onClick={() => setNewReviewRating(star)}
                                           className={`w-6 h-6 mr-1 ${star <= newReviewRating ? 'fill-current text-black' : 'text-gray-300'}`} 
                                        />
                                    ))}
                                </div>
                                <textarea 
                                    value={newReviewText}
                                    onChange={(e) => setNewReviewText(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm focus:ring-1 focus:ring-black outline-none mb-4 min-h-[90px]"
                                    placeholder="Share your experience..."
                                />
                                <button 
                                    onClick={submitReview}
                                    disabled={submittingReview || !newReviewText.trim()}
                                    className="bg-black text-white px-6 py-2.5 rounded-lg font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
                                >
                                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-8 bg-pink-50 p-6 rounded-2xl border border-pink-100 flex items-start gap-4">
                                <div className="p-2 bg-pink-100 text-[#0284C7] rounded-full">
                                    <StarIcon className="w-5 h-5 fill-current" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900">Review this property</h4>
                                    <p className="text-sm text-gray-700 mt-1">You can leave a review after your reservation starts. We value authentic feedback from verified guests!</p>
                                </div>
                            </div>
                        )
                    ) : (
                        <p className="text-gray-500 mt-6 pt-6 border-t border-gray-200">Please log in to leave a review.</p>
                    )}
                </div>

            </div>

            {/* Right Column: Sticky Booking Card - Redesigned for Long Term Rent */}
            <div className="hidden lg:block w-[34%] relative">
                <div id="booking-card" className="sticky top-24 bg-white rounded-2xl border border-gray-200 shadow-[0_6px_16px_rgba(0,0,0,0.08)] p-6 overflow-hidden">
                    
                    {/* Header: Price & Rating */}
                    <div className="flex justify-between items-baseline mb-6">
                        <div>
                            {currentOffer && (
                                <div className="text-gray-500 line-through text-sm font-medium">{formatPrice(activeConfig.price, listing.currency)}</div>
                            )}
                            <span className="text-2xl font-bold text-gray-900">{formatPrice(currentDayPrice, listing.currency)}</span>
                            <span className="text-gray-500"> /mo</span>
                            {currentOffer && (
                                <div className="text-[#0284C7] text-xs font-bold mt-1 bg-[#0284C7]/10 inline-block px-1.5 py-0.5 rounded">{currentOffer.title}</div>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                            {listing.rating && listing.rating > 0 && (
                                <span className="font-semibold text-gray-900">
                                    {getRatingWord(listing.rating)}
                                </span>
                            )}
                            <div className="bg-[#003B95] text-white text-xs font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-sm">
                                {formatRating(listing.rating)}
                            </div>
                            <span className="text-gray-500 underline ml-1">{listing.reviewCount} reviews</span>
                        </div>
                    </div>

                    {/* Rental Inputs / Form */}
                    <div className="space-y-6 mb-6 relative">
                        {/* Animated overlay for inputs when contacting */}
                         <div className={`transition-all duration-500 ease-in-out ${bookingStep === 'CONTACT' ? 'opacity-50 pointer-events-none scale-95 origin-top' : 'opacity-100'}`}>
                            
                            {/* Plan to move in */}
                            <div className="relative">
                                <label className="block text-xs font-extrabold text-black uppercase tracking-wider mb-2">Move-in Date</label>
                                
                                {/* Quick Date Chips - Modern B&W */}
                                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide w-full min-w-0">
                                    {dateOptions.map((opt) => (
                                        <button 
                                            key={opt.label}
                                            onClick={() => setMoveInDate(opt.value)}
                                            className={`
                                                whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                                                ${moveInDate === opt.value 
                                                    ? 'bg-black text-white border-black shadow-md' 
                                                    : 'bg-white text-gray-900 border-gray-200 hover:border-black'}
                                            `}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="relative group">
                                    <input 
                                        type="date" 
                                        value={moveInDate}
                                        min={minDate}
                                        onChange={(e) => setMoveInDate(e.target.value)}
                                        className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3.5 focus:ring-1 focus:ring-black focus:border-black outline-none transition-all font-bold appearance-none cursor-pointer placeholder-gray-400 group-hover:border-gray-400"
                                        required
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-900">
                                        <CalendarIcon className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            {/* Select BHK - Custom Dropdown */}
                            <div className="relative mt-4">
                                <label className="block text-xs font-extrabold text-black uppercase tracking-wider mb-2">Configuration</label>
                                {renderConfigDropdown()}
                            </div>
                        </div>
                        
                        {/* Contact Form Expansion */}
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${bookingStep === 'CONTACT' ? 'max-h-80 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                            <div className="space-y-4 pt-2">
                                <h3 className="text-sm font-bold text-gray-900">Your Details</h3>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                                    <input 
                                        type="text" 
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        placeholder="Enter your name"
                                        className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-black outline-none font-medium"
                                        autoFocus={bookingStep === 'CONTACT'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Mobile Number</label>
                                    <input 
                                        type="tel" 
                                        value={guestPhone}
                                        onChange={(e) => setGuestPhone(e.target.value)}
                                        placeholder="Enter your phone"
                                        className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-black outline-none font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <button 
                        onClick={handleBookingAction}
                        disabled={dayInfo?.status === 'blocked'}
                        className={`w-full text-white font-bold text-lg py-4 rounded-xl transition-all active:scale-[0.98] mb-4 shadow-lg hover:shadow-xl relative overflow-hidden group ${dayInfo?.status === 'blocked' ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#e51d53] hover:bg-[#d01749]'}`}
                    >
                        <span className="relative z-10 transition-transform duration-300">
                            {dayInfo?.status === 'blocked' ? 'Sold Out' : bookingStep === 'AVAILABILITY' ? 'Check availability' : 'Reserve'}
                        </span>
                    </button>

                    <div className="text-center text-sm text-gray-500 mb-6 font-medium">
                        {dayInfo?.status === 'blocked' ? "Dates not available" : bookingStep === 'AVAILABILITY' ? "You won't be charged yet" : "Complete details to request booking"}
                    </div>

                    {/* Detailed Cost Breakdown */}
                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        {currentOffer && (
                             <div className="flex justify-between text-[#0284C7] text-sm font-semibold bg-[#0284C7]/5 p-2 rounded flex-col">
                                 <div className="flex justify-between w-full">
                                    <span>Discount ({currentOffer.title})</span>
                                    <span>-{formatPrice(activeConfig.price - currentDayPrice, listing.currency)}</span>
                                 </div>
                             </div>
                        )}
                        <div className="flex justify-between text-gray-600 text-sm">
                            <span className="underline decoration-gray-300 decoration-dotted cursor-help">Monthly Rent</span>
                            <span>{formatPrice(currentDayPrice, listing.currency)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 text-sm">
                            <span className="underline decoration-gray-300 decoration-dotted cursor-help">Maintenance Fee</span>
                            <span>{formatPrice(maintenanceFee, listing.currency)}</span>
                        </div>
                         <div className="flex justify-between text-gray-600 text-sm">
                            <span className="underline decoration-gray-300 decoration-dotted cursor-help">Security Deposit</span>
                            <span>{formatPrice(deposit, listing.currency)}</span>
                        </div>
                        
                        <div className="flex justify-between text-gray-900 pt-4 border-t border-gray-100 items-center">
                            <span className="font-bold text-lg">Total Rent /mo</span>
                            <span className="font-extrabold text-xl">{formatPrice(totalRent, listing.currency)}</span>
                        </div>
                    </div>
                </div>

                {/* Agent/Host Card */}
                 <div className="mt-6 bg-gray-50 rounded-xl p-4 flex items-center justify-between border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-2xl border border-gray-100">
                            👮
                        </div>
                        <div>
                            <div className="font-bold text-gray-900 text-sm">Hosted by {listing.provider}</div>
                            <div className="text-xs text-gray-500">Superhost · 5 years hosting</div>
                        </div>
                    </div>
                    {onContactHost && (
                        <button 
                            onClick={onContactHost}
                            className="bg-white px-4 py-2 rounded-lg font-bold text-sm border border-black hover:bg-gray-50 transition-colors hidden md:block"
                        >
                            Message Host
                        </button>
                    )}
                 </div>
                 {onContactHost && (
                     <button 
                         onClick={onContactHost}
                         className="w-full mt-4 bg-white px-4 py-3 rounded-xl font-bold text-sm border border-black hover:bg-gray-50 transition-colors md:hidden"
                     >
                         Message Host
                     </button>
                 )}
            </div>
        </div>

        {/* Nearby Places Slider */}
        <div className="mt-12 mb-8 pt-10 border-t border-gray-100">
             <h2 className="text-2xl font-bold text-gray-900 mb-6">Nearby places to stay</h2>
             <div className="flex gap-4 md:gap-6 overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide snap-x snap-mandatory w-full min-w-0">
                {similarListings.map((item) => (
                    <div 
                        key={item.id} 
                        onClick={() => onListingClick(item)}
                        className="w-[80vw] sm:w-[260px] md:w-[300px] shrink-0 snap-center sm:snap-start group cursor-pointer"
                    >
                        <div className="aspect-[20/19] relative rounded-xl overflow-hidden bg-gray-100 mb-3 isolate shadow-sm">
                            <OptimizedImage 
                                src={item.imageUrl} 
                                alt={item.title} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <button 
                                className="absolute top-3 right-3 p-2 rounded-full bg-black/10 hover:bg-white/20 backdrop-blur-md text-white transition-all active:scale-90"
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    onToggleFavorite(item);
                                }}
                            >
                                <HeartIcon className="w-5 h-5" filled={false} />
                            </button>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-semibold text-gray-900 truncate pr-2">{item.title}</h3>
                                <div className="flex items-center gap-1.5">
                                    <div className="bg-[#003B95] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-sm">
                                        {formatRating(item.rating)}
                                    </div>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500">{item.type === 'APARTMENT' ? 'Entire apartment' : 'Private room'}</p>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="font-bold text-gray-900">{formatPrice(item.price, item.currency || 'USD')}</span>
                                <span className="text-gray-900 text-sm"> {item.period === 'month' ? 'month' : 'night'}</span>
                            </div>
                        </div>
                    </div>
                ))}
             </div>
        </div>

      </div>

      {/* Mobile Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-200/50 p-4 pb-safe z-50 flex items-center justify-between gap-4 lg:hidden shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col">
              <span className="text-[16px] font-bold text-gray-900">{formatPrice(listing.displayPrice ?? listing.price, listing.currency)} <span className="font-normal text-sm text-gray-500">/{listing.period}</span></span>
              {listing.rating && listing.rating > 0 && (
                  <span className="text-xs font-semibold text-gray-900 underline mt-0.5">{getRatingWord(listing.rating)}</span>
              )}
          </div>
          <button 
            onClick={() => setShowMobileBooking(true)}
            className="px-6 h-12 bg-[#e51d53] text-white font-bold rounded-xl text-[16px] hover:bg-[#d01749] transition-colors shadow-md active:scale-95"
          >
              Reserve
          </button>
      </div>

      {/* Mobile Booking Sheet / Modal */}
      {showMobileBooking && (
        <div className="fixed inset-0 z-[250] flex items-end justify-center lg:hidden">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={() => setShowMobileBooking(false)}
            ></div>
            
            {/* Sheet Content */}
            <div className="relative w-full bg-white rounded-t-3xl shadow-2xl p-6 pb-10 animate-slide-up max-h-[90vh] overflow-y-auto">
                {/* Drag Handle */}
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>
                
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Plan your move</h2>
                    <button onClick={() => setShowMobileBooking(false)} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                     <div>
                        <label className="block text-xs font-extrabold text-black uppercase tracking-wider mb-2">Move-in Date</label>
                        
                         {/* Quick Date Chips Mobile */}
                         <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide w-full min-w-0">
                            {dateOptions.map((opt) => (
                                <button 
                                    key={opt.label}
                                    onClick={() => setMoveInDate(opt.value)}
                                    className={`
                                        whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                                        ${moveInDate === opt.value 
                                            ? 'bg-black text-white border-black' 
                                            : 'bg-white text-gray-900 border-gray-200 hover:border-black'}
                                    `}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative">
                            <input 
                                type="date" 
                                value={moveInDate}
                                min={minDate}
                                onChange={(e) => setMoveInDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl px-4 py-3.5 focus:ring-1 focus:ring-black outline-none font-bold appearance-none"
                                required
                            />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-900">
                                <CalendarIcon className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-extrabold text-black uppercase tracking-wider mb-2">Configuration</label>
                        
                        {/* Mobile Configuration Dropdown (Collapsible) */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                             {/* Header / Trigger */}
                             <div 
                                onClick={() => setIsMobileConfigOpen(!isMobileConfigOpen)}
                                className={`
                                    flex items-center justify-between p-4 bg-white active:bg-gray-50 transition-colors cursor-pointer
                                    ${isMobileConfigOpen ? 'border-b border-gray-100' : ''}
                                `}
                             >
                                 <span className="font-bold text-gray-900">{activeConfig.label}</span>
                                 <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isMobileConfigOpen ? 'rotate-180' : ''}`} />
                             </div>

                             {/* Options List */}
                             {isMobileConfigOpen && (
                                 <div className="bg-gray-50 animate-fade-in">
                                     {configOptions.map((opt) => {
                                         const avail = checkAvailability(opt.id, moveInDate, calendarPrices, listing.id);
                                         const isAvailable = avail.status === 'AVAILABLE';
                                         const isSelected = selectedConfigIds.includes(opt.id);

                                         return (
                                            <div 
                                                key={opt.id}
                                                onClick={() => {
                                                    toggleConfigSelection(opt.id, listing.rooms?.map(r => r.id) || []);
                                                }}
                                                className={`
                                                    flex items-center justify-between px-4 py-3.5 border-b border-gray-100 last:border-0 transition-all cursor-pointer
                                                    ${isSelected ? 'bg-white' : ''}
                                                    ${!isAvailable ? 'opacity-90' : 'active:bg-white'}
                                                `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-black border-black text-white' : 'border-gray-300'}`}>
                                                        {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                    <span className={`font-medium ${isSelected ? 'text-black font-bold' : 'text-gray-600'}`}>
                                                        {opt.label}
                                                    </span>
                                                </div>
                                                <span className={`
                                                    text-[10px] font-bold px-2 py-0.5 rounded border tracking-wide uppercase
                                                    ${isAvailable 
                                                        ? 'bg-black text-white border-black' 
                                                        : 'bg-white text-gray-500 border-gray-200'}
                                                `}>
                                                    {avail.label}
                                                </span>
                                            </div>
                                         )
                                     })}
                                 </div>
                             )}
                        </div>
                    </div>
                    
                    {user && (
                        <div className="pt-4 border-t border-gray-100 fade-in">
                            <h3 className="text-sm font-bold text-gray-900 mb-4">Your Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                                    <input 
                                        type="text" 
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        placeholder="Full Name"
                                        className="w-full bg-white border border-gray-300 text-gray-900 text-base rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-black outline-none font-medium"
                                    />
                                </div>
                                <div>
                                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Mobile Number</label>
                                     <input 
                                        type="tel" 
                                        value={guestPhone}
                                        onChange={(e) => setGuestPhone(e.target.value)}
                                        placeholder="Phone Number"
                                        className="w-full bg-white border border-gray-300 text-gray-900 text-base rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-black outline-none font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center border border-gray-100 mt-2">
                        <span className="font-bold text-gray-700">Total /mo</span>
                        <span className="font-extrabold text-xl text-gray-900">{formatPrice(totalRent, listing.currency)}</span>
                    </div>

                    <button 
                        onClick={handleMobileReserve}
                        disabled={dayInfo?.status === 'blocked'}
                        className={`w-full text-white font-bold text-[16px] py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform mt-4 ${dayInfo?.status === 'blocked' ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#e51d53]'}`}
                    >
                        {dayInfo?.status === 'blocked' ? 'Dates completely sold out' : (!user ? 'Check availability' : 'Reserve')}
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>

    {/* Custom Photo Gallery Modal */}
    <ImageGallery 
        images={images} 
        initialIndex={initialGalleryIndex}
        isOpen={showPhotoGallery} 
        onClose={() => setShowPhotoGallery(false)} 
    />

    <CheckoutModal 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        onSuccess={finishBooking} 
        amount={totalRent} 
    />
  </>
  );
};

export default ListingDetails;