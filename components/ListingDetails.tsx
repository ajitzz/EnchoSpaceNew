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
import PremiumInventoryUnitCard from './PremiumInventoryUnitCard';
import { Sparkles, Home, Shield, Eye, Lock, Users, Bed, ArrowRight, CheckCircle2, HelpCircle, Layers, Volume2, Play, Check, Heart, Image as ImageIcon } from 'lucide-react';
import { getRatingWord, formatRating } from '../lib/ratingUtils';
import { getTaxonomyDetails } from './ListingCard';
import { io } from 'socket.io-client';

let socket: any = null;

interface ListingDetailsProps {
  listing: Listing;
  onBack: () => void;
  onListingClick: (listing: Listing) => void;
  similarListings: Listing[];
  isFavorite: boolean;
  onToggleFavorite: (listing: Listing) => void;
  onBook?: (data: any) => void;
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
    const dayInfo = calendarPrices.find(cp => cp.date_string === date && (cp.listing_id === undefined || (cp.listing_id !== null && String(cp.listing_id) === String(listingId))));
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
        <div className="border-b border-zinc-100 last:border-0 py-5">
            <div 
                className={`flex items-start gap-4 ${hasMore ? 'cursor-pointer group' : ''}`}
                onClick={() => hasMore && setExpanded(!expanded)}
            >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100/50 flex items-center justify-center text-zinc-700 flex-shrink-0 group-hover:bg-zinc-150 group-hover:border-zinc-200 transition-all duration-300">
                    <Icon className="w-4.5 h-4.5" />
                </div>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-zinc-900 text-sm sm:text-base tracking-tight truncate pr-2 group-hover:text-blue-600 transition-colors">{topPoint.name}</span>
                        <span className="text-xs font-bold text-zinc-500 whitespace-nowrap bg-zinc-50 border border-zinc-100 px-2.5 py-0.5 rounded-md font-mono">{topPoint.distance}</span>
                    </div>
                    <div className="flex items-center gap-2">
                         <span className="text-[9px] font-extrabold text-zinc-400 tracking-widest uppercase">{type}</span>
                         {hasMore && !expanded && (
                             <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50/50 border border-blue-100/20 px-2 py-0.5 rounded uppercase tracking-wider">+ {otherPoints.length} more</span>
                         )}
                    </div>
                </div>

                {/* Right Arrow */}
                {hasMore && (
                    <div className="pt-1 pl-2 text-zinc-400 group-hover:text-zinc-900 transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                )}
            </div>

            {/* Expandable Section with motion */}
            <motion.div
                initial={false}
                animate={{ 
                    height: expanded ? "auto" : 0,
                    opacity: expanded ? 1 : 0
                }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
            >
                <div className="pl-14 mt-4 space-y-3.5 pr-4 border-l border-zinc-100 ml-5 pt-1">
                    {otherPoints.map((point, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-zinc-600 font-sans font-medium text-xs sm:text-sm truncate pr-2">{point.name}</span>
                            <span className="text-xs text-zinc-400 font-bold whitespace-nowrap font-mono">{point.distance}</span>
                        </div>
                    ))}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(false);
                        }}
                        className="text-[9px] font-extrabold text-zinc-400 hover:text-zinc-900 mt-2 uppercase tracking-widest block underline decoration-zinc-200 hover:decoration-zinc-900"
                    >
                        Minimize list
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

interface SelfClosingDropdownProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const SelfClosingDropdown: React.FC<SelfClosingDropdownProps> = ({ title, badge, icon, className = "", children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsOpen(false);
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  return (
    <div 
      ref={containerRef} 
      className={`rounded-2xl border transition-all duration-300 ease-out overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.01)] ${
        isOpen 
          ? 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 dark:ring-zinc-850/50' 
          : 'border-zinc-150/80 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-zinc-900/10 hover:border-zinc-250 dark:hover:border-zinc-700 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/30'
      } ${className}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between p-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B95] dark:focus-visible:ring-blue-500 transition-colors cursor-pointer group"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className={`p-1.5 rounded-lg transition-colors ${
                isOpen ? 'bg-zinc-100 dark:bg-zinc-800 text-[#003B95] dark:text-blue-400' : 'bg-transparent text-zinc-500 group-hover:text-[#003B95] dark:group-hover:text-blue-400 group-hover:bg-zinc-100/50 dark:group-hover:bg-zinc-800/30'
              }`}>
                {icon}
              </span>
            )}
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight font-sans truncate">
              {title}
            </span>
          </div>
          {badge && (
            <div className="flex items-center self-start sm:self-center">
              {badge}
            </div>
          )}
        </div>
        <div className="shrink-0 pl-1">
          <motion.div 
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className={`p-1 rounded-full transition-colors ${
              isOpen ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-850 dark:text-zinc-150' : 'text-zinc-400 group-hover:text-zinc-650 dark:group-hover:text-zinc-300'
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
      </button>

      <motion.div
        initial={false}
        animate={{ 
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="overflow-hidden"
      >
        <div className="px-5 pb-5 pt-2 border-t border-zinc-100/50 dark:border-zinc-800/40 text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

interface PrivacySpectrumCardProps {
  listing: Listing;
}

const PrivacySpectrumCard: React.FC<PrivacySpectrumCardProps> = ({ listing }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const m = listing.rental_mode || 'entire_place';
  const tl = (listing.title || '').toLowerCase();
  const ty = (listing.type || '').toLowerCase();

  let pTitle = "Exclusive Seclusion";
  let privIndex = 100;
  let pDesc = "Exclusive Sanctuary: Enjoy complete private occupancy of the entire residence. All bedrooms, living quarters, and premium amenities are reserved solely for your group's comfort, ensuring a pristine and undisturbed stay.";

  if (m === 'private_rooms') {
    if (tl.includes('resort') || ty.includes('resort') || tl.includes('retreat')) {
      pTitle = "Resort Suite Seclusion";
      privIndex = 85;
      pDesc = "Refined Resort Suite: Relax in your own fully private boutique suite with an en-suite bathroom, paired with seamless access to high-end shared retreat spaces.";
    } else if (tl.includes('apartment') || ty.includes('apartment') || tl.includes('flat') || tl.includes('shared')) {
      pTitle = "Co-Living Privacy";
      privIndex = 60;
      pDesc = "Bespoke Co-Living: Enjoy a secure, fully private bedroom and personal bathroom, with access to sophisticated shared culinary and social lounges.";
    } else {
      pTitle = "Ensuite Privacy";
      privIndex = 70;
      pDesc = "Bespoke Private Suite: Your private room includes an en-suite bathroom for your personal use, with common areas providing refined opportunities to socialize.";
    }
  } else if (m === 'hybrid') {
    pTitle = "Privacy Profile";
    privIndex = 90;
    pDesc = "Tailored Privacy Profile: A modern, versatile living arrangement designed to offer a perfect balance. Enjoy dedicated quiet spaces alongside access to beautifully designed, curated common areas.";
  }

  // Adjust entire place to 75% privacy to match the screenshot's design
  if (m === 'entire_place') {
    privIndex = 75;
  }

  // Auto-close when scrolled out of view
  useEffect(() => {
    if (!isOpen) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsOpen(false);
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  const displayTitle = m === 'entire_place' 
    ? `ENTIRE ${(listing.type || 'APARTMENT').toUpperCase()} & ROOMS` 
    : m === 'hybrid'
    ? `PRIVACY PROFILE`
    : `${pTitle.toUpperCase()}`;

  const summaryText = m === 'entire_place'
    ? `Book the full ${listing.type || 'Apartment'} or individual premium rooms: Rooms`
    : `Book comfortable accommodations with direct access to curated common areas`;

  // Hide 90% privacy badge for hybrid mode as requested
  const showPrivacyBadge = m !== 'hybrid';

  return (
    <div 
      id="privacy-dropdown-container"
      ref={containerRef}
      onClick={() => setIsOpen(!isOpen)}
      className={`rounded-xl border border-zinc-200 bg-white transition-all duration-300 ease-out select-none cursor-pointer p-2.5 mb-5 mt-1 text-zinc-900 hover:shadow-[0_4px_12px_rgba(0,0,0,0.015)] ${
        isOpen 
          ? 'shadow-[0_6px_20px_rgba(0,0,0,0.02)] border-zinc-300' 
          : 'shadow-[0_2px_4px_rgba(0,0,0,0.005)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2.5 w-full">
        {/* Left icon & title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50/60 flex items-center justify-center text-[#003B95] border border-blue-100/20 shrink-0">
            <Home className="w-3.5 h-3.5 stroke-[1.8]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
            <span className="text-[11px] font-bold text-zinc-800 tracking-wide uppercase font-sans truncate">
              {displayTitle}
            </span>
            {showPrivacyBadge && (
              <span className="bg-blue-50/70 text-[#003B95] border border-blue-100/20 rounded-full px-1.5 py-0.1 text-[9px] font-bold whitespace-nowrap shrink-0">
                {privIndex}% Privacy
              </span>
            )}
          </div>
        </div>

        {/* Chevron arrow indicator on the right */}
        <div className="shrink-0 pl-1">
          <div className={`text-zinc-400 transition-transform duration-250 ${isOpen ? 'rotate-180 text-zinc-750' : ''}`}>
            <ChevronDown className="w-4 h-4 stroke-[1.8]" />
          </div>
        </div>
      </div>

      {/* Sleek, full-width thin Blue Progress Bar right below the header row */}
      <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden mt-2.5">
        <div 
          className="h-full bg-[#003B95] rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${privIndex}%` }} 
        />
      </div>

      {/* Collapsible Deeper Description */}
      <motion.div
        initial={false}
        animate={{ 
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{ duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="overflow-hidden"
      >
        <div className="pt-2.5 mt-2.5 border-t border-zinc-100 text-[11px] sm:text-xs text-zinc-600 leading-relaxed space-y-2 bg-zinc-50/40 p-2.5 rounded-lg">
          <div className="flex items-center gap-1.5 font-bold text-zinc-800">
            <Shield className="w-3.5 h-3.5 text-[#003B95] shrink-0" />
            <span>Privacy Profile Details {showPrivacyBadge ? `(${privIndex}% Secure)` : ''}</span>
          </div>
          
          <div className="font-normal text-zinc-600 leading-relaxed">
            {pDesc}
          </div>

          <div className="text-[10px] sm:text-[11px] text-zinc-450 italic border-l border-zinc-200 pl-1.5">
            {summaryText}
          </div>
        </div>
      </motion.div>
    </div>
  );
};


const ListingDetails: React.FC<ListingDetailsProps> = ({ listing, onBack, similarListings, onListingClick, isFavorite, onToggleFavorite, onBook, onContactHost, onRequestAuth }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const [showNav, setShowNav] = useState(true);
  const lastScrollY = useRef(0);
  const taxonomyDetails = getTaxonomyDetails(listing);
  const [paymentRates, setPaymentRates] = useState({ commission_rate: 10, tax_rate: 18, system_fee: 150 });

  useEffect(() => {
    fetch('/api/settings/payment_rates')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.commission_rate === 'number') {
          setPaymentRates(data);
        }
      })
      .catch(err => console.error("Error fetching payment rates:", err));
  }, []);
  
  // Booking State
  const [bookingStep, setBookingStep] = useState<'AVAILABILITY' | 'CONTACT'>('AVAILABILITY');
  const [moveInDate, setMoveInDate] = useState(getFutureDate(0)); // Default to today
  
  // Smart Sync State for Configurations: Store array of selected IDs (rooms or 'entire_place')
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>(() => {
      if (listing.selectedConfigId) return [listing.selectedConfigId];
      if (listing.rental_mode === 'private_rooms' && listing.rooms?.[0]?.id) return [listing.rooms[0].id];
      return ['entire_place'];
  });

  const [hingeTab, setHingeTab] = useState<'entire' | 'units'>(() => {
      if (listing.rental_mode === 'private_rooms') return 'units';
      return selectedConfigIds.includes('entire_place') ? 'entire' : 'units';
  });

  useEffect(() => {
      if (selectedConfigIds.includes('entire_place')) {
          setHingeTab('entire');
      } else {
          setHingeTab('units');
      }
  }, [selectedConfigIds]);
  
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
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [newReviewRating, setNewReviewRating] = useState(10);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
     // Gap 15: Retargeting Hook - Firing Server-Side Pixel on page load
     fetch('/api/marketing/track/view', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ listingId: listing.id })
     }).catch(console.error);

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

     fetch(`/api/listings/${listing.id}/social-posts?_t=${Date.now()}`, { cache: 'no-store' })
       .then(res => res.json())
       .then(data => {
          if (Array.isArray(data)) setSocialPosts(data);
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
              const newReview = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
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

  const dayInfo = calendarPrices.find(cp => cp.date_string === moveInDate && (cp.listing_id === undefined || (cp.listing_id !== null && String(cp.listing_id) === String(listing.id))));
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
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
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
          // Redirect to checkout page
          uiAudio.playPop();
          if (onBook) {
              onBook({
                  moveInDate,
                  configuration: activeConfig.label,
                  name: guestName,
                  phone: guestPhone,
                  totalRent: totalRent,
                  roomIds: selectedConfigIds.filter(id => id !== 'entire_place'),
                  isStartCheckout: true
              });
          }
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
    // Redirect to checkout page
    if (onBook) {
        onBook({
            moveInDate,
            configuration: activeConfig.label,
            name: guestName,
            phone: guestPhone,
            totalRent: totalRent,
            roomIds: selectedConfigIds.filter(id => id !== 'entire_place'),
            isStartCheckout: true
        });
    }
  };
  
  // Calculations for rent breakdown
  const commissionFee = Math.round(currentDayPrice * (paymentRates.commission_rate / 100));
  const subtotalForTax = currentDayPrice + commissionFee;
  const taxFee = Math.round(subtotalForTax * (paymentRates.tax_rate / 100));
  const systemFee = paymentRates.system_fee;
  const totalRent = currentDayPrice + commissionFee + taxFee + systemFee;
  const deposit = currentDayPrice * 3; // 3 months deposit

  const finishBooking = () => {
      setIsCheckoutOpen(false);
      if (onBook) {
          onBook({
              moveInDate,
              configuration: activeConfig.label,
              name: guestName,
              phone: guestPhone,
              totalRent: totalRent,
              roomIds: selectedConfigIds.filter(id => id !== 'entire_place')
          });
      }
  };

  // Render Custom Configuration Selector - Highly visual & premium card-based selector
  const renderConfigDropdown = () => {
      const showScroll = configOptions.length > 2;
      return (
          <div className="relative">
              <div 
                  className={`grid grid-cols-1 gap-2.5 pr-1 select-none transition-all duration-300 ${
                      showScroll ? 'max-h-[225px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-zinc-50 pb-6' : ''
                  }`}
              >
                  {configOptions.map((opt) => {
                      const avail = checkAvailability(opt.id, moveInDate, calendarPrices, listing.id);
                      const isAvailable = avail.status === 'AVAILABLE';
                      const isSelected = selectedConfigIds.includes(opt.id);
                      const isEntire = opt.id === 'entire_place';
                      
                      return (
                          <button 
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                  uiAudio.playClick();
                                  toggleConfigSelection(opt.id, listing.rooms?.map(r => r.id) || []);
                              }}
                              className={`
                                  w-full flex flex-col p-3.5 rounded-xl text-left transition-all duration-300 border-2 relative overflow-hidden group cursor-pointer
                                  ${isSelected 
                                    ? 'border-[#0284C7] bg-[#0284C7]/5 shadow-[0_4px_12px_rgba(2,132,199,0.04)]' 
                                    : 'border-zinc-150 bg-white hover:border-zinc-300 hover:bg-zinc-50/40'}
                              `}
                          >
                              {/* Selection glow line */}
                              {isSelected && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0284C7]" />
                              )}
                              
                              <div className="flex items-start justify-between w-full gap-2">
                                  <div className="flex items-start gap-2.5">
                                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                          isSelected ? 'border-[#0284C7] bg-[#0284C7] text-white' : 'border-zinc-300 bg-white group-hover:border-zinc-400'
                                      }`}>
                                          {isSelected && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                      </div>
                                      <div>
                                          <p className={`font-bold text-xs tracking-tight transition-colors leading-tight ${isSelected ? 'text-[#0284C7]' : 'text-zinc-900'}`}>
                                              {opt.label}
                                          </p>
                                          <p className="text-[10px] text-zinc-400 font-medium mt-0.5 leading-none">
                                              {isEntire ? 'Full premium access' : 'Private bedroom suite'}
                                          </p>
                                      </div>
                                  </div>
                                  
                                  <div className="text-right flex-shrink-0">
                                      <span className="text-xs font-black text-zinc-950 font-mono block leading-none">
                                          {formatPrice(opt.price, listing.currency)}
                                      </span>
                                      <span className="text-[8px] font-bold text-zinc-400 tracking-wider uppercase block mt-0.5 leading-none">
                                          {isEntire ? 'per month' : 'per night'}
                                      </span>
                                  </div>
                              </div>
                              
                              {/* Lower section with availability status */}
                              <div className="mt-2 pt-2 border-t border-zinc-100 w-full flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                      <span className={`text-[8px] font-bold tracking-wider uppercase ${isAvailable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                          {avail.label}
                                      </span>
                                  </div>
                                  <span className="text-[8px] text-zinc-400 font-bold tracking-widest uppercase">
                                      {isEntire ? 'Entire Place' : 'Unit Private'}
                                  </span>
                              </div>
                          </button>
                      );
                  })}
              </div>
              
              {/* Fade Overlay for scrolling & scrolling helper badge */}
              {showScroll && (
                  <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none flex items-end justify-center">
                      <span className="text-[8px] bg-zinc-900 text-white font-bold tracking-widest uppercase px-2 py-0.5 rounded-full mb-1 opacity-80 shadow-xs">
                          {configOptions.length} Units Available · Scroll to View
                      </span>
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
      
      {/* Main Content Container - Spaced elegantly on all viewports */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        
        {/* Gallery Grid & Mobile Swipe */}
        <div className="mb-6 md:mb-8 relative group rounded-2xl md:rounded-3xl overflow-hidden shadow-md">
            
            
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
        <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory scrollbar-hide aspect-[4/3] sm:aspect-[16/9] w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-none">
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
    {/* Desktop Grid (Boutique Swiss Modernist Grid Frame) */}
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2.5 h-[480px] rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 shadow-none">
                <div className="col-span-2 row-span-2 relative h-full overflow-hidden">
                    <OptimizedImage 
                        src={images[0]} 
                        priority={true}
                        className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" 
                        alt="Main"
                        onClick={() => openGallery(0)}
                    />
                    {listing.isVerified && (
                        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-md shadow-sm border border-zinc-200/40 flex items-center gap-1.5 pointer-events-none">
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            <span className="text-[10px] font-bold tracking-wider text-zinc-900 uppercase">Verified Plus</span>
                        </div>
                    )}
                </div>
                {images.length > 1 && <div className="overflow-hidden h-full"><OptimizedImage src={images[1]}  className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="Detail 1" onClick={() => openGallery(1)} /></div>}
                {images.length > 2 ? <div className="overflow-hidden h-full"><OptimizedImage src={images[2]}  className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="Detail 2" onClick={() => openGallery(2)} /></div> : <div className="bg-zinc-100" />}
                {images.length > 3 ? <div className="overflow-hidden h-full"><OptimizedImage src={images[3]}  className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="Detail 3" onClick={() => openGallery(3)} /></div> : <div className="bg-zinc-100" />}
                {images.length > 4 ? (
                  <div className="relative overflow-hidden h-full">
                      <OptimizedImage src={images[4]} className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="Detail 4" onClick={() => openGallery(4)} />
                      <button onClick={() => openGallery(0)} className="absolute bottom-4 right-4 bg-white/95 hover:bg-white border border-zinc-200 text-zinc-900 px-4 py-2.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest shadow-md hover:scale-[1.02] transition-transform active:scale-95">
                          View Gallery
                      </button>
                  </div>
                ) : (
                    <div className="bg-zinc-100 relative overflow-hidden h-full">
                       {images.length <= 4 && (
                          <button onClick={() => openGallery(0)} className="absolute bottom-4 right-4 bg-white/95 hover:bg-white border border-zinc-200 text-zinc-900 px-4 py-2.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest shadow-md hover:scale-[1.02] transition-transform active:scale-95">
                              View Gallery
                          </button>
                       )}
                    </div>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 relative">
            
            {/* Left Column: Details */}
            <div className="md:col-span-7 lg:col-span-8 min-w-0">
                
                {/* Header Info */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="border-b border-zinc-100 pb-8 mb-8"
                >
                    <div className="flex justify-between items-start mb-3">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-zinc-900 tracking-tighter leading-none">{listing.title}</h1>
                    </div>
                    {/* Dynamic Taxonomy Option Tag */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-[#003B95] bg-blue-50/70 border border-blue-100/30 px-3 py-1 rounded-md shadow-none">
                            {taxonomyDetails.labelText}
                        </span>
                    </div>
                    
                    {/* Rating and Reviews Row with clean high-contrast elements */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-zinc-500 mb-6 text-sm">
                        <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 px-2 py-1 rounded-md">
                            <span className="font-bold text-zinc-900 flex items-center gap-1">
                                <StarIcon className="w-3.5 h-3.5 fill-[#003B95] text-[#003B95]" />
                                {formatRating(listing.rating)}
                            </span>
                            {listing.rating && listing.rating > 0 && (
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                    {getRatingWord(listing.rating)}
                                </span>
                            )}
                        </div>
                        <span className="text-zinc-200">|</span>
                        <span className="underline decoration-zinc-300 hover:decoration-zinc-900 cursor-pointer text-zinc-800 transition-colors">{listing.reviewCount} reviews</span>
                        <span className="text-zinc-200">|</span>
                        <span className="underline decoration-zinc-300 hover:decoration-zinc-900 cursor-pointer text-zinc-800 transition-colors">{listing.address || "Berlin, Germany"}</span>
                        {liveViewers > 1 && (
                            <>
                                <span className="text-zinc-200">|</span>
                                <span className="flex items-center gap-1.5 text-blue-600 font-bold bg-blue-50/50 border border-blue-100/30 px-3 py-1 rounded-md text-xs">
                                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                    {liveViewers} people looking now
                                </span>
                            </>
                        )}
                    </div>

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50/50 border border-zinc-100 p-4 rounded-xl">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Capacity</span>
                            <span className="text-sm font-semibold text-zinc-900">{listing.maxGuests} guests</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Bedrooms</span>
                            <span className="text-sm font-semibold text-zinc-900">{listing.bedrooms || 1} private</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Beds</span>
                            <span className="text-sm font-semibold text-zinc-900">{listing.beds || 1} comfortable</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Bathrooms</span>
                            <span className="text-sm font-semibold text-zinc-900">{listing.bathrooms || 1} clean</span>
                        </div>
                    </div>
                </motion.div>

                {/* Minimal Privacy Index Badge & Meter */}
                <PrivacySpectrumCard listing={listing} />

                {/* About Section */}
                <div className="mb-12 py-2">
                    <h2 className="text-xl font-extrabold text-zinc-900 mb-4 tracking-tighter uppercase text-[15px] tracking-wider text-zinc-400">About this residence</h2>
                    <div className="text-zinc-600 leading-relaxed text-base space-y-4 font-normal">
                        <p className="font-sans">
                            {listing.description || "Experience the best of city living in this beautifully furnished apartment. Located in a vibrant neighborhood, you'll have easy access to local cafes, restaurants, and public transport. The space features modern amenities, high-speed Wi-Fi, and a fully equipped kitchen, making it perfect for both short and long-term stays."}
                        </p>
                        <p className="hidden md:block text-zinc-500 font-sans font-light">
                            Architecturally conceived to maximize natural light and layout fluidity, this residence harmonizes contemporary Swiss modernist elements with local cultural context. Every design element—from custom hand-selected furniture to the meticulously planned spatial flow—is engineered to deliver an atmosphere of serene, refined living.
                        </p>
                    </div>
                    <button className="mt-5 text-xs font-bold uppercase tracking-wider text-zinc-900 hover:text-zinc-600 transition-colors underline decoration-zinc-300 hover:decoration-zinc-900">Show more</button>
                </div>

                {/* Featured Social Media Posts */}
                {socialPosts && socialPosts.length > 0 && (
                    <div className="mb-12 py-8 border-t border-gray-150">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[15px] font-extrabold text-zinc-900 tracking-wider uppercase flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-sky-500" />
                                Featured on @enchospace
                            </h2>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">Live Feed</span>
                        </div>
                        
                        <div className="flex overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory hide-scrollbar gap-4">
                            {socialPosts.map(post => (
                                <div key={post.id} className="min-w-[280px] w-[280px] sm:min-w-[320px] sm:w-[320px] shrink-0 snap-center rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm flex flex-col group relative">
                                    <div className="h-48 sm:h-64 bg-gray-100 overflow-hidden relative">
                                        {post.media_urls?.[0] ? (
                                            <img
                                                src={post.media_urls[0]}
                                                alt="Social media post"
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                                <ImageIcon className="w-8 h-8 text-gray-300" />
                                            </div>
                                        )}
                                        {post.media_type === 'video' && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center">
                                                    <Play className="w-5 h-5 text-white ml-1" />
                                                </div>
                                            </div>
                                        )}
                                        {/* Instagram style header overlay */}
                                        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/60 to-transparent flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-sky-500 p-[2px]">
                                                <div className="w-full h-full bg-black rounded-full flex items-center justify-center border border-black overflow-hidden">
                                                    <Sparkles className="w-4 h-4 text-white" />
                                                </div>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-white shadow-sm tracking-wide">enchospace</span>
                                                <span className="text-[9px] font-medium text-white/80 flex items-center gap-1 shadow-sm">
                                                    <Check className="w-2.5 h-2.5 bg-blue-500 rounded-full text-white p-[1px]" />
                                                    Official Selection
                                                </span>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-3 left-3 flex gap-1.5">
                                            <span className="bg-black/40 backdrop-blur-md text-white text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                                                <Heart className="w-3 h-3 fill-white/20" />
                                                {Math.floor(Math.random() * 500) + 50} Likes
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4 flex flex-col flex-grow">
                                        <div className="flex items-start gap-2 mb-3">
                                            <p className="text-sm font-medium text-gray-700 line-clamp-3 leading-relaxed">
                                                <span className="font-bold text-gray-900 mr-2">enchospace</span>
                                                {post.caption}
                                            </p>
                                        </div>
                                        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                                            <span className="text-[10px] text-gray-400 font-mono">
                                                {new Date(post.created_at).toLocaleDateString()}
                                            </span>
                                            <button className="text-[10px] font-bold text-sky-600 uppercase tracking-wider hover:text-sky-700 transition-colors">
                                                View on Instagram
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                    <div className="mb-12 py-12 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                            <div>
                                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.25em] block mb-2 font-mono">
                                    Configurations & Options
                                </span>
                                <p className="text-zinc-500 dark:text-zinc-400 mt-3 text-sm max-w-2xl font-light leading-relaxed">
                                    Tailor the spatial configuration of your stay. Elect full exclusive buyout of the entire {listing.type?.toLowerCase() || 'property'}, or curate select individual luxury suites and rooms.
                                </p>
                            </div>
                        </div>

                        {/* Booking Hinge Segmented Switch */}
                        {listing.rental_mode !== 'private_rooms' && (
                            <div className="relative flex p-1 bg-zinc-100/80 dark:bg-zinc-850 border border-zinc-200/50 dark:border-zinc-800/80 rounded-xl w-full max-w-md mb-10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <button
                                    onClick={() => {
                                        uiAudio.playClick();
                                        toggleConfigSelection('entire_place', listing.rooms?.map(r => r.id) || []);
                                        setHingeTab('entire');
                                    }}
                                    className="relative flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 z-10 cursor-pointer"
                                >
                                    {hingeTab === 'entire' && (
                                        <motion.div 
                                            layoutId="activeHingeTab" 
                                            className="absolute inset-0 bg-white dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800/60 rounded-lg shadow-sm -z-10"
                                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                        />
                                    )}
                                    <Sparkles className={`w-3.5 h-3.5 transition-colors ${hingeTab === 'entire' ? 'text-amber-500' : 'text-zinc-400'}`} />
                                    <span className={hingeTab === 'entire' ? 'text-zinc-950 dark:text-white font-extrabold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800'}>
                                        Reserve Entire {listing.type || 'Property'}
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        uiAudio.playClick();
                                        if (isEntirePlace && listing.rooms && listing.rooms.length > 0) {
                                            // Select the first room to activate unit mode
                                            toggleConfigSelection(listing.rooms[0].id, listing.rooms?.map(r => r.id) || []);
                                        }
                                        setHingeTab('units');
                                    }}
                                    className="relative flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 z-10 cursor-pointer"
                                >
                                    {hingeTab === 'units' && (
                                        <motion.div 
                                            layoutId="activeHingeTab" 
                                            className="absolute inset-0 bg-white dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800/60 rounded-lg shadow-sm -z-10"
                                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                        />
                                    )}
                                    <Layers className={`w-3.5 h-3.5 transition-colors ${hingeTab === 'units' ? 'text-amber-500' : 'text-zinc-400'}`} />
                                    <span className={hingeTab === 'units' ? 'text-zinc-950 dark:text-white font-extrabold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800'}>
                                        Select Individual Rooms ({listing.rooms?.length || 0})
                                    </span>
                                </button>
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            
                            {/* Segment 1: Entire Property Stay */}
                            {hingeTab === 'entire' && listing.rental_mode !== 'private_rooms' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                    className={`relative overflow-hidden transition-all duration-500 ease-in-out font-sans cursor-pointer ${
                                        isEntirePlace 
                                            ? 'rounded-3xl border-2 border-[#003B95] dark:border-amber-500/80 shadow-[0_20px_50px_-12px_rgba(0,59,149,0.06)] dark:shadow-[0_20px_50px_-12px_rgba(245,158,11,0.06)] bg-gradient-to-br from-zinc-50/50 via-white to-zinc-50/10 dark:from-zinc-900/40 dark:via-zinc-950 dark:to-zinc-900/30' 
                                            : 'rounded-3xl border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-350 dark:hover:border-zinc-700 hover:shadow-lg bg-white dark:bg-zinc-900'
                                    }`}
                                    onClick={() => {
                                        uiAudio.playClick();
                                        toggleConfigSelection('entire_place', listing.rooms?.map(r => r.id) || []);
                                        document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                >
                                    {isEntirePlace && (
                                        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#003B95] via-blue-500 to-indigo-600 dark:from-amber-400 dark:via-yellow-300 dark:to-amber-500 z-20" />
                                    )}
                                    <div className="flex flex-col w-full overflow-hidden">
                                        {/* Top Cinematic Media Pane - Designed for 100/100 Swiss-Modern Grid Mosaic on Desktop */}
                                        <div className="relative w-full h-64 sm:h-80 md:h-[380px] lg:h-[420px] overflow-hidden bg-zinc-950 flex-shrink-0 group flex flex-row">
                                            {/* Primary Hero Image */}
                                            <div className="relative flex-1 lg:w-[68%] h-full overflow-hidden">
                                                <img 
                                                    src={listing.imageUrl || undefined} 
                                                    alt={`Entire ${listing.type || 'Property'}`}
                                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-[1.03]"
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/15 transition-opacity duration-500" />
                                            </div>

                                            {/* Secondary stacked photos - visible on desktop to show complete layout and avoid severe cropping */}
                                            <div className="hidden lg:flex flex-col w-[32%] border-l border-zinc-200/15 dark:border-zinc-800/50 h-full bg-zinc-900">
                                                <div className="flex-1 overflow-hidden relative group/item1 border-b border-zinc-200/15 dark:border-zinc-800/50">
                                                    <img 
                                                        src={(listing.imageUrls && listing.imageUrls[1]) || listing.imageUrl || undefined} 
                                                        alt="Interior view 1"
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover/item1:scale-105"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 hover:bg-transparent transition-colors duration-300" />
                                                </div>
                                                <div className="flex-1 overflow-hidden relative group/item2">
                                                    <img 
                                                        src={(listing.imageUrls && listing.imageUrls[2]) || (listing.imageUrls && listing.imageUrls[0]) || listing.imageUrl || undefined} 
                                                        alt="Interior view 2"
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover/item2:scale-105"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                    <div className="absolute inset-0 bg-black/20 hover:bg-transparent transition-colors duration-300" />
                                                </div>
                                            </div>
                                            
                                            {/* Badge overlays */}
                                            <div className="absolute top-5 left-5 flex flex-col gap-1.5 z-10">
                                                {isEntirePlace ? (
                                                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003B95]/90 dark:bg-amber-500/90 backdrop-blur-md text-white dark:text-black text-[9px] font-black uppercase tracking-[0.18em] shadow-lg border border-white/10 dark:border-black/10">
                                                        <Sparkles className="w-3 h-3 animate-pulse text-amber-400 dark:text-amber-800" />
                                                        Selected Buyout
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[9px] font-bold uppercase tracking-[0.18em] border border-white/15 shadow-sm">
                                                        Exclusive Buyout Option
                                                    </span>
                                                )}
                                            </div>

                                            {/* View Gallery Overlay CTA */}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    uiAudio.playClick();
                                                    setShowPhotoGallery(true);
                                                }}
                                                className="absolute bottom-5 right-5 bg-black/75 hover:bg-black/90 backdrop-blur-md text-white border border-white/10 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.18em] transition-all duration-300 flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer z-10"
                                            >
                                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                                                Explore Gallery (+{listing.imageUrls?.length || 5} Photos)
                                            </button>
                                        </div>

                                        {/* Swiss-Modern Details Bento Grid */}
                                        <div className="p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 relative bg-transparent">
                                            {/* Left details pane (lg:col-span-7) */}
                                            <div className="lg:col-span-7 space-y-6">
                                                <div>
                                                    <span className="text-[9px] font-extrabold tracking-[0.2em] text-[#003B95] dark:text-amber-500 uppercase block mb-1.5 font-mono">
                                                        Grand {listing.type || 'Property'} Buyout
                                                    </span>
                                                    <h3 className="text-2xl md:text-3xl font-black text-zinc-950 dark:text-white tracking-tight leading-none">
                                                        Entire {listing.type || 'Property'}
                                                    </h3>
                                                </div>

                                                {/* Unified Luxury Attributes */}
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg bg-[#003B95]/5 text-[#003B95] dark:bg-amber-500/10 dark:text-amber-400 border border-[#003B95]/10 dark:border-amber-500/10 flex items-center gap-1.5">
                                                        <Sparkles className="w-3 h-3 text-amber-500" />
                                                        Full Buyout
                                                    </span>
                                                    <span className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg bg-zinc-50 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/60 flex items-center gap-1.5">
                                                        <Users className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                                                        Exclusive Group Access
                                                    </span>
                                                    <span className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg bg-zinc-50 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/60 flex items-center gap-1.5">
                                                        <Shield className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                                                        100% Private Seclusion
                                                    </span>
                                                </div>

                                                {/* Short description */}
                                                <p className="text-zinc-650 dark:text-zinc-400 text-sm leading-relaxed font-light">
                                                    Secure full exclusive possession of this grand {listing.type || 'Property'}. Access all bedrooms, ensuite bathrooms, common salons, gardens, and premium amenities with absolute privacy and zero shared elements.
                                                </p>

                                                {/* Accordions Container */}
                                                <div className="space-y-3.5">
                                                    {/* Privacy Spectrum Gauge */}
                                                    <SelfClosingDropdown
                                                        title="Privacy Spectrum Index"
                                                        badge={
                                                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 font-mono">
                                                                100% — Full Seclusion
                                                            </span>
                                                        }
                                                        icon={<Shield className="w-3.5 h-3.5 text-amber-500" />}
                                                    >
                                                        <div className="space-y-3 p-1">
                                                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-light">
                                                                Your group gets full exclusive command over the entire grounds, private wings, personal pool, wellness rooms, and living spaces. No shared amenities with external guests.
                                                            </p>
                                                            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-850 rounded-full overflow-hidden">
                                                                <div className="h-full bg-gradient-to-r from-[#003B95] to-blue-500 dark:from-amber-400 dark:to-amber-500 w-full animate-pulse" />
                                                            </div>
                                                        </div>
                                                    </SelfClosingDropdown>

                                                    {/* SELECTED PERK SECTION */}
                                                    {isEntirePlace && (
                                                        <SelfClosingDropdown
                                                            title="Premium Property Access Activated"
                                                            badge={
                                                                <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10 px-2 py-0.5 rounded-md animate-pulse">
                                                                    Active ✨
                                                                </span>
                                                            }
                                                            icon={<Sparkles className="w-4 h-4 text-amber-500" />}
                                                            className="border-amber-200/40 dark:border-amber-900/20 bg-amber-50/10 dark:bg-amber-950/5"
                                                        >
                                                            <p className="text-xs text-zinc-650 dark:text-zinc-350 leading-relaxed p-1 font-light">
                                                                Your stay configures the entire {listing.type?.toLowerCase() || 'property'} for your arrival. Enjoy dedicated concierge assistance, zero interruptions, and bespoke preparation of all rooms.
                                                            </p>
                                                        </SelfClosingDropdown>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Action column (lg:col-span-5) */}
                                            <div className="lg:col-span-5 flex flex-col justify-between space-y-6 lg:border-l lg:border-zinc-150 dark:lg:border-zinc-800 lg:pl-8">
                                                <div className="space-y-6">
                                                    {/* Price Section */}
                                                    <div>
                                                        <span className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 font-mono">Nightly Rate</span>
                                                        <div className="flex items-baseline gap-1.5">
                                                            <span className="font-black text-3xl md:text-4xl text-[#003B95] dark:text-amber-400">
                                                                {formatPrice(listing.price, listing.currency)}
                                                            </span>
                                                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">/ night</span>
                                                        </div>
                                                    </div>

                                                    {/* Configuration coverage display */}
                                                    <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200/40 dark:border-zinc-800/60 space-y-2.5">
                                                        <span className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] block font-mono leading-none">
                                                            Configuration Coverage
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${isEntirePlace ? 'bg-[#003B95] dark:bg-amber-400 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                                            <span className="text-xs font-bold text-zinc-850 dark:text-zinc-200">
                                                                Full Buyout: Includes all {listing.rooms?.length || 0} luxury suites
                                                            </span>
                                                        </div>
                                                        <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-light">
                                                            Securing the entire place automatically reserves and locks every suite in the property, guaranteeing ultimate privacy for your entire travel group.
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Action Button CTA */}
                                                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                                                    {isEntirePlace ? (
                                                        <button 
                                                            onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 uiAudio.playClick();
                                                                 const bookingCard = document.getElementById('booking-card');
                                                                 if (bookingCard) {
                                                                     bookingCard.scrollIntoView({ behavior: 'smooth' });
                                                                 }
                                                             }}
                                                            className="relative group overflow-hidden w-full px-7 py-4 bg-zinc-950 text-white dark:bg-white dark:text-black rounded-xl font-extrabold text-[11px] uppercase tracking-[0.18em] transition-all duration-300 shadow-[0_4px_18px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.22)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 border border-zinc-800 dark:border-zinc-200/20 cursor-pointer"
                                                        >
                                                            <span className="relative z-10 flex items-center gap-2">
                                                                Secure Exclusive Buyout
                                                                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5] transition-transform duration-300 group-hover:translate-x-1" />
                                                            </span>
                                                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 uiAudio.playPop();
                                                                 toggleConfigSelection('entire_place', listing.rooms?.map(r => r.id) || []);
                                                                 setTimeout(() => {
                                                                     const bookingCard = document.getElementById('booking-card');
                                                                     if (bookingCard) {
                                                                         bookingCard.scrollIntoView({ behavior: 'smooth' });
                                                                     }
                                                                 }, 300);
                                                             }}
                                                            className="w-full px-7 py-4 rounded-xl font-bold text-[11px] uppercase tracking-[0.18em] transition-all duration-300 border bg-white text-zinc-900 border-zinc-200 hover:border-zinc-900 dark:bg-zinc-900 dark:text-white dark:border-zinc-700 dark:hover:border-zinc-400 hover:bg-zinc-50/50 active:scale-[0.98] shadow-sm cursor-pointer text-center"
                                                        >
                                                            Select Entire Place
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Segment 2: Individual Subunits (Rooms / Cottages) */}
                            {(hingeTab === 'units' || listing.rental_mode === 'private_rooms') && (
                                <>
                                    {/* Bento Suite Selector Hub */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                        {/* Bento Card 1: Live Selection Summary */}
                                        <div className="md:col-span-2 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 text-white rounded-3xl p-6 relative overflow-hidden border border-zinc-800 flex flex-col justify-between shadow-xl min-h-[160px] group">
                                            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                                                <Sparkles className="w-24 h-24 text-amber-400" />
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black tracking-widest text-amber-400 uppercase font-mono bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 inline-block">
                                                    Interactive Selection Hub
                                                </span>
                                                <h4 className="text-lg font-extrabold tracking-tight mt-2.5">
                                                    {selectedConfigIds.filter(id => id !== 'entire_place').length > 0 
                                                        ? `Custom Config: ${selectedConfigIds.filter(id => id !== 'entire_place').length} Suite(s) Selected`
                                                        : 'Configure Your Private Stay'}
                                                </h4>
                                                <p className="text-zinc-400 text-xs mt-1 font-light max-w-md leading-relaxed">
                                                    Toggle different private room modules below. Build a hybrid co-living experience tailored to your team or guest roster.
                                                </p>
                                            </div>
                                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-850">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Subtotal / Night</span>
                                                    <span className="text-lg font-black text-amber-400 font-mono">
                                                        {formatPrice(
                                                            listing.rooms
                                                                .filter(r => selectedConfigIds.includes(r.id))
                                                                .reduce((acc, curr) => acc + Number(curr.price), 0),
                                                            listing.currency
                                                        )}
                                                    </span>
                                                </div>
                                                {selectedConfigIds.filter(id => id !== 'entire_place').length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            uiAudio.playClick();
                                                            document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                                        }}
                                                        className="bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-amber-400/10 hover:scale-[1.02] flex items-center gap-1 cursor-pointer"
                                                    >
                                                        Lock In Stay
                                                        <ArrowRight className="w-3 h-3" />
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-zinc-500 italic">Select a room below to begin</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bento Card 2: Seclusion & Quiet Score */}
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase font-mono">
                                                        Privacy Index
                                                    </span>
                                                    <Shield className="w-4 h-4 text-emerald-500" />
                                                </div>
                                                <div className="mt-3 flex items-baseline gap-1">
                                                    <span className="text-4xl font-black text-zinc-950 dark:text-white tracking-tighter">92</span>
                                                    <span className="text-xs font-bold text-emerald-600 uppercase bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/40">Elite</span>
                                                </div>
                                                <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-1.5 leading-relaxed font-light">
                                                    Enhanced sound shielding with solid double brick walls and private ensuite bathrooms in all guest wings.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                                                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Acoustic Shield Active</span>
                                            </div>
                                        </div>

                                        {/* Bento Card 3: Elite Security & Access Control */}
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase font-mono">
                                                        Keyless Entry
                                                    </span>
                                                    <Lock className="w-4 h-4 text-blue-500 animate-pulse" />
                                                </div>
                                                <h5 className="text-xs font-black text-zinc-900 dark:text-white mt-3 uppercase tracking-wider">
                                                    Lockable Private Modules
                                                </h5>
                                                <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-1 leading-relaxed font-light">
                                                    Each private guest room has custom physical solid keyless smart keypad locks with dynamic code rotation.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                                                <span className="text-[9px] text-blue-500 font-bold uppercase tracking-wider">Secure Access Verified</span>
                                            </div>
                                        </div>

                                        {/* Bento Card 4: Shared vs Private Amenities Ratio */}
                                        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                                            <div className="flex flex-col sm:flex-row justify-between gap-4">
                                                <div className="max-w-xs">
                                                    <span className="text-[9px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase font-mono">
                                                        Amenity Buyout Advantage
                                                    </span>
                                                    <h5 className="text-sm font-black text-zinc-900 dark:text-white mt-1.5 leading-tight">
                                                        Personal Comfort vs Shared Luxury
                                                    </h5>
                                                    <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-1.5 leading-relaxed font-light">
                                                        Enjoy dedicated personal suites while unlocking beautiful grand common areas, curated for high-performing teams and families.
                                                    </p>
                                                </div>
                                                
                                                {/* Visual Ratio Bar Chart / Infographic (Aesthetic Bento touch) */}
                                                <div className="flex-1 min-w-[140px] flex flex-col justify-center bg-zinc-50 dark:bg-zinc-850 p-4 rounded-2xl border border-zinc-150/40 dark:border-zinc-800">
                                                    <div className="flex justify-between text-[9px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">
                                                        <span>Private Comfort</span>
                                                        <span>Shared Space</span>
                                                    </div>
                                                    {/* Interactive stacked bar */}
                                                    <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden flex shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                                                        <div className="h-full bg-amber-400 w-[60%] transition-all duration-500" title="60% Private Dedicated Comfort" />
                                                        <div className="h-full bg-blue-500 w-[40%] transition-all duration-500" title="40% Grand Shared Estates" />
                                                    </div>
                                                    <div className="flex justify-between items-center text-[10px] mt-2 text-zinc-400 font-bold">
                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />60% Private Suite</span>
                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />40% Resort Area</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {listing.rooms.map((room, idx) => {
                                        const isRoomSelected = selectedConfigIds.includes(room.id);
                                        return (
                                            <PremiumInventoryUnitCard 
                                                key={room.id || idx} 
                                                room={room} 
                                                listing={listing} 
                                                isSelected={isRoomSelected} 
                                                toggleSelection={() => toggleConfigSelection(room.id, listing.rooms?.map(r => r.id) || [])}
                                                formatPrice={formatPrice}
                                            />
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Redesigned Amenities Section */}
                <div className="mb-12 py-10 border-t border-zinc-100">
                    <h2 className="text-xl font-extrabold text-zinc-900 mb-6 tracking-tighter uppercase text-[15px] tracking-wider text-zinc-400">What this place offers</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {listing.amenities?.map((amenity, idx) => (
                            <motion.div 
                                key={idx} 
                                whileHover={{ y: -2, x: 2 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 bg-zinc-50/50 hover:bg-white hover:border-zinc-200 transition-colors"
                            >
                                <div className="text-zinc-700 w-5 h-5 flex items-center justify-center">
                                    {getAmenityIcon(amenity)}
                                </div>
                                <span className="text-sm font-semibold text-zinc-800 tracking-tight">{amenity}</span>
                            </motion.div>
                        ))}
                    </div>
                    <button className="mt-8 w-full sm:w-auto border border-zinc-200 text-zinc-900 px-6 py-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest hover:bg-zinc-950 hover:border-zinc-950 hover:text-white transition-all duration-300">
                        Show all {listing.amenities?.length || 10} amenities
                    </button>
                </div>

                {/* Redesigned Location / Nearby Section with Collapsible Categories */}
                <div className="mb-12 py-10 border-t border-zinc-100">
                    <h2 className="text-xl font-extrabold text-zinc-900 mb-6 tracking-tighter uppercase text-[15px] tracking-wider text-zinc-400">Neighborhood Context</h2>
                    {/* Grouped Nearby List */}
                    <div className="space-y-1">
                        <NearbyCategorySection type="TRANSPORT" points={nearbyByType['TRANSPORT']} />
                        <NearbyCategorySection type="GROCERY" points={nearbyByType['GROCERY']} />
                        <NearbyCategorySection type="PARK" points={nearbyByType['PARK']} />
                        <NearbyCategorySection type="CAFE" points={nearbyByType['CAFE']} />
                        <NearbyCategorySection type="GYM" points={nearbyByType['GYM']} />
                    </div>
                </div>

                {/* Map Section */}
                <div className="mb-12 pt-10 pb-8 border-t border-zinc-100">
                    <h2 className="text-xl font-extrabold text-zinc-900 mb-6 tracking-tighter uppercase text-[15px] tracking-wider text-zinc-400">Where you'll be</h2>
                     <div className="relative w-full h-72 md:h-96 bg-zinc-50 rounded-3xl overflow-hidden border border-zinc-200/80 shadow-none group">
                        <iframe
                            width="100%"
                            height="100%"
                            style={{ border: 0, filter: "grayscale(0.05) contrast(1.02)" }}
                            loading="lazy"
                            allowFullScreen
                            referrerPolicy="no-referrer-when-downgrade"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(listing.address || listing.title + " " + (listing.city || ""))}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                        ></iframe>
                         <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-md text-[10px] font-bold uppercase tracking-wider text-zinc-900 border border-zinc-200 max-w-[85%] truncate">
                             {listing.address || "Berlin, Germany"}
                         </div>
                    </div>
                     <div className="mt-5">
                        <h3 className="font-extrabold text-zinc-900 mb-1.5 text-base tracking-tight">{listing.address || "Berlin, Germany"}</h3>
                        <p className="text-zinc-500 text-sm leading-relaxed font-sans font-light">
                            Secured and private: the precise street and house coordinates are held confidentially. You will receive immediate direct digital access details as soon as your booking request is successfully approved.
                        </p>
                    </div>
                </div>

                {/* Reviews Section */}
                <div className="mb-12 pt-10 pb-8 border-t border-zinc-100">
                    <h2 className="text-xl font-extrabold text-zinc-900 mb-6 tracking-tighter uppercase text-[15px] tracking-wider text-zinc-400">Guest Experiences</h2>
                    
                    <div className="flex items-center gap-4 mb-8 bg-zinc-50 border border-zinc-100 p-4 rounded-2xl w-full sm:w-fit">
                        {reviews.length > 0 ? (
                            <>
                                <div className="bg-[#003B95] text-white text-lg font-extrabold px-3 py-1.5 rounded-lg shadow-none">
                                    {(reviews.reduce((a,c) => a + Number(c.rating), 0) / reviews.length).toFixed(1)}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-base font-bold text-zinc-900 leading-tight">
                                        {getRatingWord(reviews.reduce((a,c) => a + Number(c.rating), 0) / reviews.length)}
                                    </span>
                                    <span className="text-zinc-400 text-xs font-medium tracking-wide uppercase">{reviews.length} authenticated reviews</span>
                                </div>
                            </>
                        ) : (
                            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">No reviews left yet</h3>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mb-8">
                        {reviews.slice(0, 6).map((review, idx) => (
                            <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: idx * 0.05 }}
                                className="flex flex-col"
                            >
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="w-10 h-10 bg-zinc-100 border border-zinc-200/50 rounded-full flex items-center justify-center font-extrabold text-zinc-600 text-sm overflow-hidden">
                                        {review.user_name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-zinc-900 text-sm tracking-tight">{review.user_name}</h4>
                                        <p className="text-zinc-400 text-xs">{new Date(review.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex gap-0.5 mb-2.5">
                                    {[...Array(10)].map((_, i) => (
                                        <span key={i}><StarIcon className={`w-2.5 h-2.5 ${i < Number(review.rating) ? 'fill-[#003B95] text-[#003B95]' : 'text-zinc-200'}`} /></span>
                                    ))}
                                </div>
                                <p className="text-zinc-600 leading-relaxed text-sm font-sans">
                                    {review.content}
                                </p>
                            </motion.div>
                        ))}
                    </div>

                    {user ? (
                        canReview ? (
                            <div className="mt-8 bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                                <h3 className="font-extrabold text-zinc-900 mb-4 tracking-tight uppercase text-xs tracking-wider text-zinc-400">Leave an authentic review</h3>
                                <div className="flex mb-4 cursor-pointer gap-0.5">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                                        <StarIcon 
                                           key={star} 
                                           onClick={() => setNewReviewRating(star)}
                                           className={`w-6 h-6 ${star <= newReviewRating ? 'fill-[#003B95] text-[#003B95]' : 'text-zinc-200'}`} 
                                        />
                                    ))}
                                </div>
                                <textarea 
                                    value={newReviewText}
                                    onChange={(e) => setNewReviewText(e.target.value)}
                                    className="w-full bg-white border border-zinc-200 rounded-xl p-4 text-sm focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 outline-none mb-4 min-h-[90px] font-sans font-normal"
                                    placeholder="Share your stay experience..."
                                />
                                <button 
                                    onClick={submitReview}
                                    disabled={submittingReview || !newReviewText.trim()}
                                    className="bg-zinc-950 text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-zinc-900 transition-all disabled:opacity-40"
                                >
                                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-8 bg-zinc-50 p-5 rounded-2xl border border-zinc-100 flex items-start gap-4">
                                <div className="p-2 bg-white border border-zinc-200 text-zinc-400 rounded-full shrink-0">
                                    <StarIcon className="w-4 h-4 fill-none" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-zinc-900 text-sm tracking-tight">Review this property</h4>
                                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                                        You can leave an authentic review after your reservation starts. We value direct, certified feedback from verified guests.
                                    </p>
                                </div>
                            </div>
                        )
                    ) : (
                        <p className="text-zinc-400 text-xs mt-6 pt-6 border-t border-zinc-100 uppercase tracking-wider font-bold">Please log in to leave a review.</p>
                    )}
                </div>

            </div>

            {/* Right Column: Sticky Booking Card - Redesigned for Swiss Modernist Elite Aesthetic */}
            <div className="hidden md:block md:col-span-5 lg:col-span-4 relative">
                <motion.div 
                    id="booking-card" 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="sticky top-28 bg-white rounded-3xl border border-zinc-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.03)] p-7 overflow-hidden"
                >
                    {/* Header: Price & Rating */}
                    <div className="flex justify-between items-baseline mb-8 pb-6 border-b border-zinc-100">
                        <div>
                            {currentOffer && (
                                <div className="text-zinc-400 line-through text-xs font-semibold tracking-tight mb-0.5">{formatPrice(activeConfig.price, listing.currency)}</div>
                            )}
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-extrabold text-zinc-900 tracking-tighter">{formatPrice(currentDayPrice, listing.currency)}</span>
                                <span className="text-zinc-400 text-xs font-medium tracking-wide uppercase">/ month</span>
                            </div>
                            {currentOffer && (
                                <div className="text-blue-600 text-[10px] font-bold uppercase tracking-wider mt-1.5 bg-blue-50 border border-blue-100/35 inline-block px-2 py-0.5 rounded">
                                    {currentOffer.title}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                                {listing.rating && listing.rating > 0 && (
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                        {getRatingWord(listing.rating)}
                                    </span>
                                )}
                                <div className="bg-[#003B95] text-white text-xs font-extrabold px-2 py-1 rounded shadow-none">
                                    {formatRating(listing.rating)}
                                </div>
                            </div>
                            <span className="text-zinc-400 text-xs underline decoration-zinc-200 hover:decoration-zinc-900 cursor-pointer transition-colors">{listing.reviewCount} reviews</span>
                        </div>
                    </div>

                    {/* Rental Inputs / Form */}
                    <div className="space-y-6 mb-8 relative">
                        {/* Animated overlay for inputs when contacting */}
                        <div className={`transition-all duration-500 ease-in-out ${bookingStep === 'CONTACT' ? 'opacity-40 pointer-events-none scale-95 origin-top' : 'opacity-100'}`}>
                            
                            {/* Plan to move in */}
                            <div className="relative">
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Move-in Date</label>
                                
                                {/* Quick Date Chips - Modern Swiss B&W */}
                                <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide w-full min-w-0">
                                    {dateOptions.map((opt) => (
                                        <motion.button 
                                            key={opt.label}
                                            onClick={() => setMoveInDate(opt.value)}
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.97 }}
                                            className={`
                                                whitespace-nowrap px-3.5 py-2 rounded-lg text-xs font-bold border transition-all duration-300
                                                ${moveInDate === opt.value 
                                                    ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm' 
                                                    : 'bg-zinc-50 text-zinc-700 border-zinc-100 hover:border-zinc-400 hover:bg-white'}
                                            `}
                                        >
                                            {opt.label}
                                        </motion.button>
                                    ))}
                                </div>

                                <div className="relative group">
                                    <input 
                                        type="date" 
                                        value={moveInDate}
                                        min={minDate}
                                        onChange={(e) => setMoveInDate(e.target.value)}
                                        className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-950 text-sm font-semibold rounded-xl px-4 py-4 focus:bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all appearance-none cursor-pointer placeholder-zinc-400 group-hover:border-zinc-400"
                                        required
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-900">
                                        <CalendarIcon className="w-4 h-4 text-zinc-400" />
                                    </div>
                                </div>
                            </div>

                            {/* Select BHK - Custom Dropdown */}
                            <div className="relative mt-5">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Accommodation Choice</label>
                                    <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full font-bold select-none border border-zinc-200/50">
                                        {selectedConfigIds.includes('entire_place') ? 'Entire Place' : `${selectedConfigIds.filter(id => id !== 'entire_place').length} Suite(s)`} Selected
                                    </span>
                                </div>
                                {renderConfigDropdown()}
                             </div>
                        </div>
                        
                        {/* Contact Form Expansion */}
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${bookingStep === 'CONTACT' ? 'max-h-80 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                            <div className="space-y-4 pt-4 border-t border-zinc-100">
                                <h3 className="text-sm font-bold text-zinc-900 tracking-tight uppercase text-[11px] tracking-wider text-zinc-400">Introduce Yourself</h3>
                                <div className="space-y-3.5">
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Full Name</label>
                                        <input 
                                            type="text" 
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                            placeholder="e.g., Jean-Luc Godard"
                                            className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl px-4 py-3 focus:bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 outline-none font-semibold transition-all"
                                            autoFocus={bookingStep === 'CONTACT'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Mobile Number</label>
                                        <input 
                                            type="tel" 
                                            value={guestPhone}
                                            onChange={(e) => setGuestPhone(e.target.value)}
                                            placeholder="e.g., +41 22 749 11 11"
                                            className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl px-4 py-3 focus:bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 outline-none font-semibold transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <motion.button 
                        onClick={handleBookingAction}
                        disabled={dayInfo?.status === 'blocked'}
                        whileHover={dayInfo?.status !== 'blocked' ? { scale: 1.01, y: -1 } : {}}
                        whileTap={dayInfo?.status !== 'blocked' ? { scale: 0.99 } : {}}
                        className={`w-full text-white font-extrabold text-sm uppercase tracking-widest py-4.5 rounded-xl transition-all duration-300 relative overflow-hidden group shadow-none ${dayInfo?.status === 'blocked' ? 'bg-zinc-300 cursor-not-allowed' : 'bg-zinc-950 hover:bg-zinc-900'}`}
                    >
                        <span className="relative z-10">
                            {dayInfo?.status === 'blocked' ? 'Sold Out' : bookingStep === 'AVAILABILITY' ? 'Check Availability' : 'Request Reservation'}
                        </span>
                    </motion.button>

                    <div className="text-center text-[10px] text-zinc-400 uppercase tracking-widest mt-3 mb-6 font-bold">
                        {dayInfo?.status === 'blocked' ? "Dates currently unavailable" : bookingStep === 'AVAILABILITY' ? "No instant charges applied" : "Request details are curated securely"}
                    </div>

                    {/* Detailed Cost Breakdown */}
                    <div className="space-y-3 pt-6 border-t border-zinc-100">
                        {currentOffer && (
                             <div className="flex justify-between text-blue-600 text-xs font-bold bg-blue-50/50 p-3 rounded-xl border border-blue-100/20 flex-col">
                                 <div className="flex justify-between w-full">
                                    <span className="uppercase tracking-wider">Discount ({currentOffer.title})</span>
                                    <span className="font-mono">-{formatPrice(activeConfig.price - currentDayPrice, listing.currency)}</span>
                                 </div>
                             </div>
                        )}
                        <div className="flex justify-between text-zinc-500 text-sm font-medium">
                            <span className="underline decoration-zinc-200 decoration-dotted cursor-help">Base Rent</span>
                            <span className="font-mono text-zinc-900 font-semibold">{formatPrice(currentDayPrice, listing.currency)}</span>
                        </div>
                        {commissionFee > 0 && (
                            <div className="flex justify-between text-zinc-500 text-sm font-medium">
                                <span className="underline decoration-zinc-200 decoration-dotted cursor-help">Platform Service Fee ({paymentRates.commission_rate}%)</span>
                                <span className="font-mono text-zinc-900 font-semibold">{formatPrice(commissionFee, listing.currency)}</span>
                            </div>
                        )}
                        {taxFee > 0 && (
                            <div className="flex justify-between text-zinc-500 text-sm font-medium">
                                <span className="underline decoration-zinc-200 decoration-dotted cursor-help">Estimated GST / Taxes ({paymentRates.tax_rate}%)</span>
                                <span className="font-mono text-zinc-900 font-semibold">{formatPrice(taxFee, listing.currency)}</span>
                            </div>
                        )}
                        {systemFee > 0 && (
                            <div className="flex justify-between text-zinc-500 text-sm font-medium">
                                <span className="underline decoration-zinc-200 decoration-dotted cursor-help">Flat System Booking Fee</span>
                                <span className="font-mono text-zinc-900 font-semibold">{formatPrice(systemFee, listing.currency)}</span>
                            </div>
                        )}
                         <div className="flex justify-between text-zinc-500 text-sm font-medium">
                            <span className="underline decoration-zinc-200 decoration-dotted cursor-help">Security Deposit</span>
                            <span className="font-mono text-zinc-900 font-semibold">{formatPrice(deposit, listing.currency)}</span>
                        </div>
                        
                        <div className="flex justify-between text-zinc-900 pt-5 border-t border-zinc-100 items-center">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Monthly Cost</span>
                            <span className="font-extrabold text-2xl tracking-tighter">{formatPrice(totalRent, listing.currency)}</span>
                        </div>
                    </div>
                </motion.div>

                {/* Agent/Host Card */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-6 bg-zinc-50/50 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between border border-zinc-200/60 gap-4"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-sm font-extrabold border border-zinc-200 text-zinc-800">
                            {listing.provider?.substring(0, 2).toUpperCase() || "H"}
                        </div>
                        <div>
                            <div className="font-bold text-zinc-900 text-sm flex items-center gap-2 tracking-tight">
                                Hosted by {listing.provider}
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-extrabold bg-[#003B95]/10 text-[#003B95] uppercase tracking-wider">SUPERHOST</span>
                            </div>
                            <div className="text-xs text-zinc-400 font-medium mt-0.5">Professional Host · Identity Verified · 5★ rating</div>
                        </div>
                    </div>
                    {onContactHost && (
                        <button 
                            onClick={onContactHost}
                            className="bg-white px-5 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-wider border border-zinc-200 hover:border-zinc-950 hover:bg-white transition-all hidden md:block shadow-sm"
                        >
                            Message Host
                        </button>
                    )}
                 </motion.div>
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
        <div className="mt-16 mb-8 pt-12 border-t border-zinc-100">
             <h2 className="text-2xl font-extrabold text-zinc-900 mb-8 tracking-tighter">Nearby places to stay</h2>
             <div className="flex gap-6 md:gap-8 overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide snap-x snap-mandatory w-full min-w-0">
                {similarListings.map((item) => (
                    <motion.div 
                        key={item.id} 
                        onClick={() => onListingClick(item)}
                        whileHover={{ y: -4 }}
                        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                        className="w-[78vw] sm:w-[260px] md:w-[290px] shrink-0 snap-center sm:snap-start group cursor-pointer"
                    >
                        <div className="aspect-[4/3] relative rounded-2xl overflow-hidden bg-zinc-50 mb-4 isolate border border-zinc-100/50 shadow-none">
                            <OptimizedImage 
                                src={item.imageUrl} 
                                alt={item.title} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <button 
                                className="absolute top-3.5 right-3.5 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white backdrop-blur-md text-zinc-900 transition-all active:scale-90 shadow-sm"
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    onToggleFavorite(item);
                                }}
                            >
                                <HeartIcon className="w-4 h-4 text-zinc-900" filled={false} />
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-start gap-2">
                                <h3 className="font-bold text-zinc-900 text-sm tracking-tight truncate group-hover:text-blue-600 transition-colors pr-2">{item.title}</h3>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="bg-[#003B95] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-none">
                                        {formatRating(item.rating)}
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 font-medium tracking-wide uppercase">{item.type === 'APARTMENT' ? 'Entire residence' : 'Private Suite'}</p>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="font-extrabold text-zinc-900 text-sm tracking-tight">{formatPrice(item.price, item.currency || 'USD')}</span>
                                <span className="text-zinc-500 text-xs font-normal"> / {item.period === 'month' ? 'month' : 'night'}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
             </div>
        </div>

      </div>

      {/* Mobile Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-200/50 p-4 pb-safe z-50 flex items-center justify-between gap-4 md:hidden shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.08)]">
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
        <div className="fixed inset-0 z-[250] flex items-end justify-center md:hidden">
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
                        <div className="flex justify-between items-center mb-3">
                            <label className="block text-xs font-extrabold text-black uppercase tracking-wider">Accommodation Choice</label>
                            <span className="text-[10px] bg-zinc-100 border border-zinc-200/60 text-zinc-600 px-2.5 py-0.5 rounded-full font-bold select-none">
                                {selectedConfigIds.includes('entire_place') ? 'Entire Place' : `${selectedConfigIds.filter(id => id !== 'entire_place').length} Suite(s)`}
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2.5 max-h-[240px] overflow-y-auto pr-1 pb-1 scrollbar-thin">
                            {configOptions.map((opt) => {
                                const avail = checkAvailability(opt.id, moveInDate, calendarPrices, listing.id);
                                const isAvailable = avail.status === 'AVAILABLE';
                                const isSelected = selectedConfigIds.includes(opt.id);
                                const isEntire = opt.id === 'entire_place';

                                return (
                                    <button 
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            uiAudio.playClick();
                                            toggleConfigSelection(opt.id, listing.rooms?.map(r => r.id) || []);
                                        }}
                                        className={`
                                            w-full flex flex-col p-3 rounded-xl text-left transition-all duration-300 border-2 relative overflow-hidden group active:scale-[0.98] cursor-pointer
                                            ${isSelected 
                                              ? 'border-[#0284C7] bg-[#0284C7]/5 shadow-[0_4px_12px_rgba(2,132,199,0.04)]' 
                                              : 'border-zinc-150 bg-white hover:border-zinc-300'}
                                        `}
                                    >
                                        {/* Selection indicator line */}
                                        {isSelected && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0284C7]" />
                                        )}
                                        
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                                    isSelected ? 'border-[#0284C7] bg-[#0284C7] text-white' : 'border-zinc-300 bg-white'
                                                }`}>
                                                    {isSelected && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <div className="truncate">
                                                    <p className={`font-bold text-xs tracking-tight transition-colors leading-tight truncate ${isSelected ? 'text-[#0284C7]' : 'text-zinc-900'}`}>
                                                        {opt.label}
                                                    </p>
                                                    <p className="text-[9px] text-zinc-400 font-medium mt-0.5 leading-none">
                                                        {isEntire ? 'Full access to all areas' : 'Private bedroom suite'}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="text-right flex-shrink-0">
                                                <span className="text-xs font-black text-zinc-950 font-mono block leading-none">
                                                    {formatPrice(opt.price, listing.currency)}
                                                </span>
                                                <span className="text-[8px] font-bold text-zinc-400 tracking-wider uppercase block mt-0.5 leading-none">
                                                    {isEntire ? 'per month' : 'per night'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Lower status row */}
                                        <div className="mt-2 pt-2 border-t border-zinc-100 w-full flex items-center justify-between">
                                            <div className="flex items-center gap-1">
                                                <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                                <span className={`text-[8px] font-bold tracking-wider uppercase ${isAvailable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {avail.label}
                                                </span>
                                            </div>
                                            <span className="text-[8px] text-zinc-400 font-bold tracking-widest uppercase">
                                                {isEntire ? 'Entire Place' : 'Unit Private'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
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