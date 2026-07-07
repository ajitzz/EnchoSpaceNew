import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { uiAudio } from './audio';
import { Listing } from '../types';
import { ChevronRight, ChevronLeft, ShieldCheck, StarIcon, HeartIcon, InfoIcon, MapIcon, EyeIcon } from './Icons';
import { OptimizedImage } from './OptimizedImage';
import { useCurrency } from './CurrencyContext';
import { getRatingWord, formatRating } from '../lib/ratingUtils';
import { Home, Layers, Users, HelpCircle, ShieldAlert, Check } from 'lucide-react';

export const getTaxonomyDetails = (listing: Listing) => {
  const isChild = !!listing.isChild;
  const parentType = (listing.parentType || listing.type || 'Property').trim();
  const parentTitle = (listing.parentTitle || listing.title || '').trim();
  
  const parentTypeLower = parentType.toLowerCase();
  const parentTitleLower = parentTitle.toLowerCase();
  
  // Classify parent category
  let category: 'apartment' | 'resort' | 'villa' | 'cottage' | 'house' | 'other' = 'other';
  if (parentTypeLower.includes('apartment') || parentTitleLower.includes('apartment') || parentTypeLower.includes('flat') || parentTitleLower.includes('flat')) {
    category = 'apartment';
  } else if (parentTypeLower.includes('resort') || parentTitleLower.includes('resort') || parentTypeLower.includes('retreat') || parentTitleLower.includes('retreat')) {
    category = 'resort';
  } else if (parentTypeLower.includes('cottage') || parentTitleLower.includes('cottage') || parentTypeLower.includes('cabin') || parentTitleLower.includes('cabin')) {
    category = 'cottage';
  } else if (parentTypeLower.includes('villa') || parentTitleLower.includes('villa') || parentTypeLower.includes('castle') || parentTitleLower.includes('castle')) {
    category = 'villa';
  } else if (parentTypeLower.includes('house') || parentTitleLower.includes('house')) {
    category = 'house';
  }

  // Get children summary if listing has rooms
  let childUnitsSummary = "";
  if (listing.rooms && listing.rooms.length > 0) {
    const uniqueRoomNames = Array.from(new Set(listing.rooms.map(r => r.name.trim())));
    
    let hasCottages = false;
    let hasRooms = false;
    const bhkSizes: string[] = [];
    const otherTypes: string[] = [];

    uniqueRoomNames.forEach(name => {
      const lower = name.toLowerCase();
      // Match BHK sizes like "1BHK", "1 BHK", "2BHK", "3BHK", "4BHK"
      const bhkMatch = name.match(/(\d)\s*bhk/i);
      if (bhkMatch) {
        if (!bhkSizes.includes(`${bhkMatch[1]}BHK`)) {
          bhkSizes.push(`${bhkMatch[1]}BHK`);
        }
      } else if (lower.includes('cottage')) {
        hasCottages = true;
      } else if (lower.includes('room') || lower.includes('suite') || lower.includes('bedroom') || lower.includes('diamond') || lower.includes('platinum')) {
        hasRooms = true;
      } else {
        const firstWord = name.split(' ')[0];
        if (firstWord && !otherTypes.includes(firstWord)) {
          otherTypes.push(firstWord);
        }
      }
    });

    const items: string[] = [];
    if (hasCottages) {
      items.push("Cottages");
    }
    if (hasRooms) {
      items.push("Rooms");
    }
    if (bhkSizes.length > 0) {
      bhkSizes.sort((a, b) => parseInt(a) - parseInt(b));
      items.push(`House (${bhkSizes.join(', ')})`);
    }
    otherTypes.forEach(t => {
      if (!items.includes(t)) items.push(t);
    });

    if (items.length > 0) {
      childUnitsSummary = items.join(', ');
    } else {
      childUnitsSummary = uniqueRoomNames.join(', ');
    }
  } else {
    // Elegant fallback lists based on categories if there's no rooms array loaded yet
    if (category === 'resort') {
      childUnitsSummary = "Cottages, Rooms, House (1BHK, 2BHK, 3BHK, 4BHK)";
    } else if (category === 'apartment') {
      childUnitsSummary = "Only Rooms Available";
    } else if (category === 'villa') {
      childUnitsSummary = "Suites, Private Bedrooms";
    }
  }

  // Construct label showing the parent and child units structure
  let labelText = "";
  if (isChild) {
    if (category === 'apartment') {
      labelText = `Room in Apartment / Entire Apartment`;
    } else if (category === 'resort') {
      labelText = `Room inside Resort / Entire Resort`;
    } else if (category === 'villa') {
      labelText = `Suite inside Villa / Entire Villa`;
    } else if (category === 'cottage') {
      labelText = `Cottage Room / Entire Cottage`;
    } else if (category === 'house') {
      labelText = `Room inside House / Entire House`;
    } else {
      labelText = `Room in ${parentType} / Entire ${parentType}`;
    }
  } else {
    const hasSubUnits = (listing.rooms && listing.rooms.length > 0) || category === 'resort' || listing.rental_mode === 'hybrid' || listing.rental_mode === 'private_rooms';
    
    if (category === 'apartment') {
      labelText = hasSubUnits ? `Entire Apartment / Room in Apartment` : `Entire Apartment (Exclusive)`;
    } else if (category === 'resort') {
      labelText = childUnitsSummary ? `Entire Resort / ${childUnitsSummary}` : `Entire Resort / Cottages, Rooms, Houses (1BHK, 2BHK, 3BHK, 4BHK)`;
    } else if (category === 'villa') {
      labelText = hasSubUnits ? `Entire Villa / Suites, Rooms Available` : `Entire Villa (Exclusive)`;
    } else if (category === 'cottage') {
      labelText = hasSubUnits ? `Entire Cottage / Rooms Available` : `Entire Cottage (Exclusive)`;
    } else if (category === 'house') {
      labelText = hasSubUnits ? `Entire House / Rooms Available` : `Entire House (Exclusive)`;
    } else {
      labelText = hasSubUnits ? `Entire ${parentType} / Rooms Available` : `Entire ${parentType} (Exclusive)`;
    }
  }

  if (isChild) {
    let badge = "Room";
    let explanation = `Private room inside a shared property`;
    let iconColor = "text-teal-500 dark:text-teal-400";
    let labelColor = "bg-teal-50/95 text-teal-700 border-teal-200/60 dark:bg-teal-950/90 dark:text-teal-300 dark:border-teal-800";
    
    const childTitleLower = (listing.title || '').toLowerCase();
    const childTypeLower = (listing.type || '').toLowerCase();

    if (category === 'apartment') {
      badge = "Apartment Room";
      explanation = `Private lockable Room inside ${parentTitle || 'an Apartment'} with shared common areas`;
      iconColor = "text-purple-500 dark:text-purple-400";
      labelColor = "bg-purple-50/95 text-purple-700 border-purple-200/60 dark:bg-purple-950/90 dark:text-purple-300 dark:border-purple-800";
    } else if (category === 'resort') {
      if (childTitleLower.includes('cottage') || childTypeLower.includes('cottage')) {
        badge = "Resort Cottage";
      } else if (childTitleLower.includes('house') || childTitleLower.includes('bhk') || childTypeLower.includes('house')) {
        badge = "Resort House";
      } else if (childTitleLower.includes('room') || childTitleLower.includes('bedroom') || childTitleLower.includes('suite') || childTitleLower.includes('diamond') || childTitleLower.includes('platinum')) {
        badge = "Resort Room";
      } else {
        badge = "Resort Unit";
      }
      explanation = `Private Sub-Unit inside ${parentTitle || 'the Resort'} with shared resort grounds`;
      iconColor = "text-blue-500 dark:text-blue-400";
      labelColor = "bg-blue-50/95 text-blue-700 border-blue-200/60 dark:bg-blue-950/90 dark:text-blue-300 dark:border-blue-800";
    } else if (category === 'villa') {
      badge = "Villa Suite";
      explanation = `Private Ensuite Room inside ${parentTitle || 'the Villa'} with shared common spaces`;
      iconColor = "text-teal-500 dark:text-teal-400";
      labelColor = "bg-teal-50/95 text-teal-700 border-teal-200/60 dark:bg-teal-950/90 dark:text-teal-300 dark:border-teal-800";
    } else if (category === 'cottage') {
      badge = "Cottage Room";
      explanation = `Private Room inside ${parentTitle || 'the Cottage'} with shared outdoor areas`;
      iconColor = "text-emerald-500 dark:text-emerald-400";
      labelColor = "bg-emerald-50/95 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800";
    } else if (category === 'house') {
      badge = "House Room";
      explanation = `Private lockable Room inside ${parentTitle || 'the House'} with shared common facilities`;
      iconColor = "text-orange-500 dark:text-orange-400";
      labelColor = "bg-orange-50/95 text-orange-700 border-orange-200/60 dark:bg-orange-950/90 dark:text-orange-300 dark:border-orange-800";
    } else {
      badge = `${parentType} Room`;
    }

    return {
      isChild: true,
      badge,
      pill: `Room in ${parentType}`,
      description: explanation,
      parentTitle,
      parentType,
      category,
      iconColor,
      labelColor,
      privacyPercent: category === 'resort' ? 85 : category === 'apartment' ? 60 : 70,
      labelText
    };
  } else {
    let badge = "Entire Place";
    let explanation = "Exclusive access to the full property for your group only.";
    let iconColor = "text-zinc-500 dark:text-zinc-400";
    let labelColor = "bg-zinc-50/95 text-zinc-700 border-zinc-200/60 dark:bg-zinc-900/90 dark:text-zinc-300 dark:border-zinc-800";

    const hasSubUnits = (listing.rooms && listing.rooms.length > 0) || category === 'resort' || listing.rental_mode === 'hybrid' || listing.rental_mode === 'private_rooms';
    const isPrivateRoomsOnly = listing.rental_mode === 'private_rooms';

    if (category === 'apartment') {
      badge = "Entire Apartment";
      explanation = childUnitsSummary 
        ? `Book the full Apartment or individual premium rooms: ${childUnitsSummary}`
        : `Book the full, exclusive Apartment for absolute privacy and complete access`;
      iconColor = "text-indigo-500 dark:text-indigo-400";
      labelColor = "bg-indigo-50/95 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/90 dark:text-indigo-300 dark:border-indigo-800";
    } else if (category === 'resort') {
      badge = "Entire Resort";
      explanation = childUnitsSummary 
        ? `Rent the full resort, or reserve specific sub-units: ${childUnitsSummary}`
        : `Rent the Entire Resort with all rooms and grounds for private, exclusive use`;
      iconColor = "text-blue-600 dark:text-blue-400";
      labelColor = "bg-blue-50/95 text-blue-700 border-blue-200/60 dark:bg-blue-950/90 dark:text-blue-300 dark:border-blue-800";
    } else if (category === 'villa') {
      badge = "Entire Villa";
      explanation = childUnitsSummary 
        ? `Exclusive standalone Villa with available individual suites: ${childUnitsSummary}`
        : `Exclusive access to the entire standalone Estate / Villa and private pool/grounds`;
      iconColor = "text-rose-500 dark:text-rose-400";
      labelColor = "bg-rose-50/95 text-rose-700 border-rose-200/60 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800";
    } else if (category === 'cottage') {
      badge = "Entire Cottage";
      explanation = childUnitsSummary 
        ? `Standalone main Cottage with independent rooms available: ${childUnitsSummary}`
        : `Standalone Cottage all to yourself for ultimate private nature retreat`;
      iconColor = "text-emerald-600 dark:text-emerald-400";
      labelColor = "bg-emerald-50/95 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800";
    } else if (category === 'house') {
      badge = "Entire House";
      explanation = childUnitsSummary 
        ? `Standalone House or individual private rooms: ${childUnitsSummary}`
        : `Standalone House all to yourself for ultimate private residential stay`;
      iconColor = "text-orange-600 dark:text-orange-400";
      labelColor = "bg-orange-50/95 text-orange-700 border-orange-200/60 dark:bg-orange-950/90 dark:text-orange-300 dark:border-orange-800";
    } else {
      badge = `Entire ${parentType}`;
    }

    return {
      isChild: false,
      badge,
      pill: hasSubUnits 
        ? (category === 'apartment' ? "Entire Apartment & Rooms" 
           : category === 'resort' ? "Entire Resort & Sub-Units" 
           : category === 'villa' ? "Entire Villa & Suites"
           : category === 'cottage' ? "Entire Cottage & Rooms"
           : category === 'house' ? "Entire House & Rooms"
           : `Entire ${parentType} & Rooms`)
        : `Entire ${parentType}`,
      description: explanation,
      parentTitle,
      parentType,
      category,
      iconColor,
      labelColor,
      privacyPercent: hasSubUnits ? (isPrivateRoomsOnly ? 40 : 75) : 100,
      labelText
    };
  }
};

export const getStayStructure = (listing: Listing) => {
  const title = (listing.title || '').toLowerCase();
  const type = (listing.type || '').toLowerCase();
  const mode = listing.rental_mode || 'entire_place';

  if (mode === 'private_rooms') {
    if (title.includes('resort') || type.includes('resort') || title.includes('retreat')) {
      return {
        badge: "Resort Sub-Unit",
        pill: "Private Suite inside Resort",
        description: "Shared resort grounds with independent private room keys.",
        privacyPercent: 85,
        privacyText: "Resort Seclusion",
        color: "bg-blue-50/95 text-blue-700 border-blue-200/60 dark:bg-blue-950/90 dark:text-blue-300 dark:border-blue-800",
        indicatorBg: "bg-blue-500",
        type: "resort"
      };
    }
    if (title.includes('apartment') || type.includes('apartment') || title.includes('flat') || title.includes('shared')) {
      return {
        badge: "Shared Flat Room",
        pill: "Private Room inside Shared Flat",
        description: "Private lockable bedroom with shared lounge & kitchen.",
        privacyPercent: 60,
        privacyText: "Shared Common Areas",
        color: "bg-purple-50/95 text-purple-700 border-purple-200/60 dark:bg-purple-950/90 dark:text-purple-300 dark:border-purple-800",
        indicatorBg: "bg-purple-500",
        type: "shared"
      };
    }
    return {
      badge: "Shared Residence Room",
      pill: "Private Suite inside Villa/House",
      description: "Private ensuite room inside a multi-room shared residence.",
      privacyPercent: 70,
      privacyText: "Shared Residence",
      color: "bg-teal-50/95 text-teal-700 border-teal-200/60 dark:bg-teal-950/90 dark:text-teal-300 dark:border-teal-800",
      indicatorBg: "bg-teal-500",
      type: "shared_villa"
    };
  } else if (mode === 'hybrid') {
    return {
      badge: "Hybrid Estate",
      pill: "Entire Estate / Room Options Available",
      description: "Book the entire residence or select independent sub-suites.",
      privacyPercent: 90,
      privacyText: "Flexible Seclusion",
      color: "bg-amber-50/95 text-amber-700 border-amber-200/60 dark:bg-amber-950/90 dark:text-amber-300 dark:border-amber-800",
      indicatorBg: "bg-amber-500",
      type: "hybrid"
    };
  } else {
    // entire_place
    if (title.includes('cottage') || type.includes('cottage') || title.includes('cabin')) {
      return {
        badge: "Standalone Cottage",
        pill: "100% Private Standalone Cottage",
        description: "Completely detached house with private garden & entry.",
        privacyPercent: 100,
        privacyText: "100% Absolute Privacy",
        color: "bg-emerald-50/95 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800",
        indicatorBg: "bg-emerald-500",
        type: "standalone"
      };
    }
    if (title.includes('villa') || type.includes('villa') || title.includes('castle') || title.includes('house') || type.includes('house')) {
      return {
        badge: "Standalone House",
        pill: "100% Private Standalone Estate",
        description: "Completely independent villa or house for exclusive possession.",
        privacyPercent: 100,
        privacyText: "100% Absolute Privacy",
        color: "bg-rose-50/95 text-rose-700 border-rose-200/60 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800",
        indicatorBg: "bg-rose-500",
        type: "standalone_villa"
      };
    }
    return {
      badge: "Entire Place",
      pill: "100% Private Entire Residence",
      description: "Exclusive access to the full property for your group only.",
      privacyPercent: 100,
      privacyText: "100% Absolute Privacy",
      color: "bg-zinc-50/95 text-zinc-700 border-zinc-200/60 dark:bg-zinc-950/90 dark:text-zinc-300 dark:border-zinc-800",
      indicatorBg: "bg-zinc-600",
      type: "entire"
    };
  }
};

interface ListingCardProps {
  listing: Listing;
  onHover?: (id: string | null) => void;
  onClick?: (listing: Listing) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (listing: Listing) => void;
  priority?: boolean;
}

const ListingCard: React.FC<ListingCardProps> = ({ listing, onHover, onClick, isFavorite = false, onToggleFavorite, priority = false }) => {
  const { formatPrice } = useCurrency();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Real uploaded images or fallback to deterministic placeholders if no array exists
  const baseImageUrl = listing.imageUrl || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';
  
  const FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1600607687931-5701d3fda5e8?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=400&q=80"
  ];

  const numImages = Math.max(listing.imageUrls?.length || 1, listing.imageCount || 1);
  const images = Array.from({ length: numImages }).map((_, i) => {
       if (listing.imageUrls && listing.imageUrls[i]) return listing.imageUrls[i];
       return FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
  });

  const stayStructure = getStayStructure(listing);
  const taxonomy = getTaxonomyDetails(listing);

  const handleMouseEnter = () => {
    setIsHovered(true);
    uiAudio.playClick();
    onHover?.(listing.id);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(null);
    setCurrentImageIndex(0); // Reset on leave for cleanliness
  };

  const handleClick = () => {
      uiAudio.playPop();
      onClick?.(listing);
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    uiAudio.playClick();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    uiAudio.playClick();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <motion.div 
        whileHover={{ y: -6, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="group flex flex-col cursor-pointer bg-white rounded-3xl border border-zinc-150/70 transition-all duration-300 hover:border-[#003B95]/20 hover:shadow-[0_20px_40px_-6px_rgba(0,59,149,0.06),0_8px_20px_-4px_rgba(0,0,0,0.02)] relative overflow-hidden h-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] rounded-t-3xl overflow-hidden bg-zinc-50/50 isolate cursor-grab active:cursor-grabbing group">
        <motion.div
            key={currentImageIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, { offset, velocity }) => {
                const swipe = offset.x;
                if (swipe < -50) {
                    setCurrentImageIndex((prev) => (prev + 1) % images.length);
                } else if (swipe > 50) {
                    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
                }
            }}
            className="absolute inset-0 w-full h-full"
            onClick={handleClick}
        >
            <OptimizedImage 
                src={images[currentImageIndex]} 
                alt={listing.title}
                priority={priority}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] pointer-events-none"
            />
        </motion.div>
        
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Favorite Button */}
        <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            animate={isFavorite ? { scale: [1, 1.3, 1], transition: { duration: 0.3, type: "spring", stiffness: 400 } } : {}}
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { 
                e.stopPropagation();
                uiAudio.playPop();
                onToggleFavorite?.(listing);
            }}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/90 hover:bg-white border border-zinc-200/50 shadow-sm backdrop-blur-md transition-all z-20 group/heart"
        >
            <HeartIcon className={`w-4.5 h-4.5 transition-colors ${isFavorite ? 'text-[#e51d53] fill-[#e51d53]' : 'text-zinc-600 hover:text-[#e51d53]'}`} filled={isFavorite} />
        </motion.button>

        {/* Tags */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
            {listing.isVerified && (
                 <div className="bg-white/95 backdrop-blur-md px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 self-start border border-zinc-150/80">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#003B95]" />
                    <span className="text-[10px] font-extrabold tracking-wider text-zinc-800 uppercase font-mono">
                        Verified
                    </span>
                 </div>
            )}
            <div className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shadow-sm backdrop-blur-md self-start flex items-center gap-1.5 ${taxonomy.labelColor}`}>
                 <span className={`w-1.5 h-1.5 rounded-full inline-block animate-pulse ${stayStructure.indicatorBg}`} />
                 {taxonomy.badge}
            </div>
            {listing.discount && (
                 <div className="bg-blue-600 backdrop-blur-md px-3 py-1 rounded-full shadow-sm text-white font-extrabold self-start border border-white/10">
                    <span className="text-[10px] font-bold tracking-wider uppercase">-{listing.discount}% Off</span>
                 </div>
            )}
            {listing.hasOffers && !listing.discount && (
                 <div className="bg-blue-600 backdrop-blur-md px-3 py-1 rounded-full shadow-sm text-white font-extrabold self-start border border-white/10">
                    <span className="text-[10px] font-bold tracking-wider uppercase">Offers Available</span>
                 </div>
            )}
        </div>

        {/* Navigation Arrows - Hidden on mobile, visible on group hover for desktop */}
        <div className={`hidden md:flex absolute inset-x-3 top-1/2 -translate-y-1/2 justify-between pointer-events-none transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
             <button onClick={prevImage} className="w-9 h-9 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-200/50 pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                <ChevronLeft className="w-4 h-4 text-zinc-800" />
             </button>
             <button onClick={nextImage} className="w-9 h-9 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-200/50 pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                <ChevronRight className="w-4 h-4 text-zinc-800" />
             </button>
        </div>

        {/* Dots Pagination */}
        <div className="absolute bottom-4 inset-x-0 flex justify-center z-20">
            <div className="bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full flex gap-1.5 shadow-sm border border-zinc-200/30">
                {images.slice(0, 5).map((_, i) => (
                    <div 
                        key={i} 
                        className={`
                            h-1.5 rounded-full transition-all duration-300 
                            ${i === (currentImageIndex % 5) ? 'bg-[#003B95] w-3.5' : 'bg-zinc-300 w-1.5'}
                        `}
                    />
                ))}
            </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3 flex-grow">
        <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold text-zinc-900 truncate text-[16px] sm:text-[17px] leading-snug group-hover:text-[#003B95] transition-colors duration-300" title={listing.displayTitle || listing.title}>
                {listing.displayTitle || listing.title}
            </h3>
            <div className="flex items-center gap-1 shrink-0 bg-zinc-50 px-2 py-0.5 rounded-lg border border-zinc-150/80">
                <StarIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="font-extrabold text-[13px] text-zinc-800">
                    {formatRating(listing.rating)}
                </span>
            </div>
        </div>
        
        <div className="text-zinc-500 text-xs truncate flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-zinc-400 uppercase tracking-widest text-[9.5px]">{listing.type}</span>
            <span className="w-1 h-1 bg-zinc-200 rounded-full"></span>
            <span className="truncate font-extrabold text-[#003B95] bg-blue-50/50 px-2.5 py-0.5 rounded-full text-[10px] border border-blue-100/40" title={taxonomy.labelText}>
                {taxonomy.labelText}
            </span>
        </div>

        {/* Booking Paradigm & Spatial Transparency Block */}
        <div className="my-1.5 p-3 rounded-2xl bg-zinc-50/40 border border-zinc-100/80 flex flex-col gap-2.5 shadow-2xs transition-all duration-300 group-hover:bg-zinc-50/80 group-hover:border-zinc-200/50">
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-600 font-extrabold flex items-center gap-1.5 uppercase tracking-wide">
                    {taxonomy.isChild ? (
                        <Users className={`w-3.5 h-3.5 ${taxonomy.iconColor} shrink-0`} />
                    ) : (
                        <Home className={`w-3.5 h-3.5 ${taxonomy.iconColor} shrink-0`} />
                    )}
                    {taxonomy.pill}
                </span>
                {(() => {
                    const privacyPercent = taxonomy.privacyPercent;
                    const privacyTheme = privacyPercent >= 90
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : privacyPercent >= 80
                        ? "bg-teal-50 text-teal-700 border-teal-100"
                        : "bg-blue-50 text-blue-700 border-blue-100";
                    return (
                        <span className={`text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full border ${privacyTheme}`}>
                            {privacyPercent}% Privacy
                        </span>
                    );
                })()}
            </div>
            
            {/* Visual Mini Progress Bar for Privacy */}
            <div className="w-full h-1.5 bg-zinc-200/50 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#003B95]/70 to-[#003B95]`} 
                    style={{ width: `${taxonomy.privacyPercent}%` }}
                />
            </div>
            
            <p className="text-xs text-zinc-500 leading-relaxed font-normal">
                {taxonomy.description}
            </p>


        </div>

        <div className="mt-auto pt-1.5 flex items-baseline gap-1.5 w-full">
            {listing.rooms && listing.rooms.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-blue-50/30 px-3.5 py-2.5 rounded-2xl border border-blue-100/30 w-full justify-between">
                    <div className="flex flex-col">
                        <span className="text-[#003B95] text-[10px] font-extrabold uppercase tracking-widest">Starts from</span>
                        <span className="text-[10px] text-zinc-400 font-medium">Multiple Rooms</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                        <span className="font-extrabold text-[#003B95] text-[18px] sm:text-[19px] tracking-tight">
                            {formatPrice(listing.displayPrice ?? Math.min(...listing.rooms.map(r => r.price)), listing.currency)}
                        </span>
                        <span className="text-[#0369A1]/70 text-xs font-semibold">/{listing.period}</span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between w-full bg-zinc-50/40 px-3.5 py-2.5 rounded-2xl border border-zinc-100/40">
                    <span className="text-zinc-500 text-[10px] font-extrabold uppercase tracking-widest">Total Price</span>
                    <div className="flex items-baseline gap-0.5">
                        <span className="font-extrabold text-zinc-900 text-[18px] tracking-tight">
                            {formatPrice(listing.displayPrice ?? listing.price, listing.currency)}
                        </span>
                        <span className="text-zinc-500 text-xs font-semibold">/{listing.period}</span>
                    </div>
                </div>
            )}
        </div>

        {/* CTA Bottom Bar - Appears on Hover (Desktop Only) */}
        <div className={`
            hidden md:flex mt-2.5 pt-2.5 border-t border-zinc-100 items-center justify-between text-xs font-bold text-zinc-500
            transition-all duration-300 overflow-hidden
            ${isHovered ? 'max-h-12 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2'}
        `}>
            <button className="flex flex-col items-center gap-0.5 hover:text-[#003B95] hover:bg-zinc-50 px-2 py-1 rounded-lg transition-all">
                <InfoIcon className="w-4 h-4 text-zinc-500 group-hover:text-[#003B95]" />
                <span className="text-[10px] font-extrabold">Info</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 hover:text-[#003B95] hover:bg-zinc-50 px-2 py-1 rounded-lg transition-all">
                <MapIcon className="w-4 h-4 text-zinc-500 group-hover:text-[#003B95]" />
                <span className="text-[10px] font-extrabold">Map</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 hover:text-[#003B95] hover:bg-zinc-50 px-2 py-1 rounded-lg transition-all">
                <EyeIcon className="w-4 h-4 text-zinc-500 group-hover:text-[#003B95]" />
                <span className="text-[10px] font-extrabold">Details</span>
            </button>
            <button 
                className="bg-[#003B95] hover:bg-[#002B70] text-white px-5 py-2 rounded-full font-extrabold shadow-sm hover:shadow transition-all active:scale-95"
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.(listing);
                }}
            >
                Reserve
            </button>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(ListingCard, (prevProps, nextProps) => {
  return prevProps.listing.id === nextProps.listing.id &&
         prevProps.isFavorite === nextProps.isFavorite;
});