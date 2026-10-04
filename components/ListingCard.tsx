import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { uiAudio } from './audio';
import { Listing } from '../types';
import { ChevronRight, ChevronLeft, ShieldCheck, StarIcon, HeartIcon, InfoIcon, MapIcon, EyeIcon } from './Icons';
import { OptimizedImage } from './OptimizedImage';
import {acceptedOfferIsCurrent,formatAcceptedOfferPrice} from '../src/shared/offers/publicPrice';
import {useAcceptedOfferClock} from './offers/useAcceptedOfferClock';
import { getRatingWord, formatRating } from '../lib/ratingUtils';
import { Home, Layers, Users, HelpCircle, ShieldAlert, Check, Share2 } from 'lucide-react';

export const getTaxonomyDetails = (listing: Listing) => {
  // Publication tells us the listing's declared rental mode and canonical room
  // names. It does not prove lockable doors, privacy scores or dated availability.
  const isChild = Boolean(listing.isChild);
  const parentType = (listing.parentType || listing.type || 'property').trim();
  const parentTitle = (listing.parentTitle || listing.title || 'this stay').trim();
  const mode = listing.rental_mode || 'entire_place';
  const badge = isChild ? 'Room type' : mode === 'private_rooms' ? 'Room types'
    : mode === 'hybrid' ? 'Entire place & room types' : 'Entire place';
  const pill = isChild ? `Room type in ${parentType}` : badge;
  const description = isChild ? `Room type listed for ${parentTitle}. Check terms and dates with the host.`
    : mode === 'private_rooms' ? 'See the listed room types and check dates with the host.'
    : mode === 'hybrid' ? 'See the property and room types. Check terms and dates with the host.'
    : 'See the property details and check dates with the host.';
  return {
    isChild, badge, pill, description, parentTitle, parentType,
    category: 'declared',
    iconColor: 'text-[#003B95]',
    labelColor: 'bg-blue-50/95 text-blue-700 border-blue-200/60',
    labelText: pill,
  };
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
      color: "bg-amber-50/95 text-amber-700 border-amber-200/60 dark:bg-amber-950/90 dark:text-amber-300 dark:border-amber-800",
      indicatorBg: "bg-amber-500",
      type: "hybrid"
    };
  } else {
    // entire_place
    if (title.includes('cottage') || type.includes('cottage') || title.includes('cabin')) {
      return {
        badge: "Standalone Cottage",
        pill: "Private Standalone Cottage",
        description: "Detached cottage with private grounds & entry.",
        privacyPercent: 100,
        color: "bg-emerald-50/95 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800",
        indicatorBg: "bg-emerald-500",
        type: "standalone"
      };
    }
    if (title.includes('villa') || type.includes('villa') || title.includes('castle') || title.includes('house') || type.includes('house')) {
      return {
        badge: "Standalone House",
        pill: "Private Standalone Residence",
        description: "Standalone property for your group.",
        privacyPercent: 100,
        color: "bg-rose-50/95 text-rose-700 border-rose-200/60 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800",
        indicatorBg: "bg-rose-500",
        type: "standalone_villa"
      };
    }
    return {
      badge: "Entire Place",
      pill: "Private Entire Residence",
      description: "Access to the full property for your group only.",
      privacyPercent: 100,
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const offerClock=useAcceptedOfferClock(listing.fromOffer);
  const visibleOffer = acceptedOfferIsCurrent(listing.fromOffer, offerClock) ? listing.fromOffer : null;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    uiAudio.playPop();

    const shareUrl = `${window.location.origin}/#listing-${listing.id}`;
    const shareData = {
      title: listing.displayTitle || listing.title,
      text: `Check out ${listing.displayTitle || listing.title} on Encho!`,
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing listing:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    }
  };

  // Only real, supplied property photos may be displayed
  const images = (listing.imageUrls?.length ? listing.imageUrls : listing.imageUrl ? [listing.imageUrl] : []).filter(Boolean);

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
        {images.length > 0 ? (
          <motion.div
              key={currentImageIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag={images.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(e, { offset, velocity }) => {
                  if (images.length <= 1) return;
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
        ) : (
          <div
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-zinc-100/80 text-zinc-400 p-4"
            onClick={handleClick}
          >
            <Home className="w-8 h-8 stroke-1 text-zinc-300 mb-1" />
            <span className="text-xs font-semibold text-zinc-400">Photos in preparation</span>
          </div>
        )}
        
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Action Buttons (Share & Favorite) */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
            {/* Share Button */}
            <div className="relative">
                <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={handleShare}
                    title="Share property"
                    aria-label="Share property"
                    className="p-2.5 rounded-full bg-white/90 hover:bg-white border border-zinc-200/50 shadow-sm backdrop-blur-md transition-all text-zinc-600 hover:text-[#003B95] flex items-center justify-center group/share"
                >
                    {copied ? (
                        <Check className="w-4.5 h-4.5 text-emerald-600" />
                    ) : (
                        <Share2 className="w-4.5 h-4.5" />
                    )}
                </motion.button>
                {copied && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute right-0 top-full mt-1 px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded-lg shadow-lg whitespace-nowrap z-30"
                    >
                        Link copied!
                    </motion.div>
                )}
            </div>

            {/* Favorite Button */}
            <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.8 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                animate={isFavorite ? { scale: [1, 1.3, 1], transition: { duration: 0.3, ease: "easeInOut" } } : { scale: 1 }}
                onPointerDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { 
                    e.stopPropagation();
                    uiAudio.playPop();
                    onToggleFavorite?.(listing);
                }}
                title={isFavorite ? "Remove from favorites" : "Save to favorites"}
                aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
                className="p-2.5 rounded-full bg-white/90 hover:bg-white border border-zinc-200/50 shadow-sm backdrop-blur-md transition-all group/heart"
            >
                <HeartIcon className={`w-4.5 h-4.5 transition-colors ${isFavorite ? 'text-[#e51d53] fill-[#e51d53]' : 'text-zinc-600 hover:text-[#e51d53]'}`} filled={isFavorite} />
            </motion.button>
        </div>

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
        {images.length > 1 && (
          <div className={`hidden md:flex absolute inset-x-3 top-1/2 -translate-y-1/2 justify-between pointer-events-none transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
               <button onClick={prevImage} className="w-9 h-9 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-200/50 pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                  <ChevronLeft className="w-4 h-4 text-zinc-800" />
               </button>
               <button onClick={nextImage} className="w-9 h-9 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-200/50 pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                  <ChevronRight className="w-4 h-4 text-zinc-800" />
               </button>
          </div>
        )}

        {/* Dots Pagination */}
        {images.length > 1 && (
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
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3 flex-grow">
        <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold font-display text-zinc-900 truncate text-[16px] sm:text-[17px] leading-snug group-hover:text-[#003B95] transition-colors duration-300" title={listing.displayTitle || listing.title}>
                {listing.displayTitle || listing.title}
            </h3>
            <div className="flex items-center gap-1 shrink-0 bg-zinc-50 px-2 py-0.5 rounded-lg border border-zinc-150/80">
                <StarIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="font-extrabold text-[13px] text-zinc-800 tabular-nums">
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
            </div>
            
            <p className="text-xs text-zinc-500 leading-relaxed font-normal">
                {taxonomy.description}
            </p>
        </div>

        <div className="mt-auto pt-1.5 flex flex-col gap-1.5 w-full">
            {listing.priceState !== 'VERIFIED_OFFER_AVAILABLE' || listing.price === null || !visibleOffer ? (
                <div className="w-full rounded-2xl border border-blue-100/60 bg-blue-50/30 px-3.5 py-2.5 text-sm font-semibold text-[#003B95]">
                    Price unavailable
                </div>
            ) : !listing.isChild && listing.rooms && listing.rooms.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-blue-50/30 px-3.5 py-2.5 rounded-2xl border border-blue-100/30 w-full justify-between">
                    <div className="flex flex-col">
                        <span className="text-[#003B95] text-[10px] font-extrabold uppercase tracking-widest">Rooms from</span>
                        <span className="text-[10px] text-zinc-400 font-medium">Eligible stays</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                        <span className="font-extrabold font-display tabular-nums text-[#003B95] text-[18px] sm:text-[19px] tracking-tight">
                            {formatAcceptedOfferPrice(visibleOffer)}
                        </span>
                        <span className="text-[#0369A1]/70 text-xs font-semibold">/{listing.period}</span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between w-full bg-zinc-50/40 px-3.5 py-2.5 rounded-2xl border border-zinc-100/40">
                    <span className="text-zinc-500 text-[10px] font-extrabold uppercase tracking-widest">Accepted room-night</span>
                    <div className="flex items-baseline gap-0.5">
                        <span className="font-extrabold font-display tabular-nums text-zinc-900 text-[18px] tracking-tight">
                            {formatAcceptedOfferPrice(visibleOffer)}
                        </span>
                        <span className="text-zinc-500 text-xs font-semibold">/{listing.period}</span>
                    </div>
                </div>
            )}
            {listing.priceState === 'VERIFIED_OFFER_AVAILABLE' && visibleOffer && (
                <p className="text-[10px] text-zinc-500 leading-snug">
                    Stay window {visibleOffer.stayStart} to {visibleOffer.stayEnd} checkout · Select dates to confirm availability
                </p>
            )}
        </div>

        <button type="button"
            aria-label={`View ${listing.displayTitle || listing.title} stay`}
            className="mt-3 w-full rounded-xl bg-[#003B95] px-5 py-3 text-sm font-bold text-white hover:bg-[#002B70] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003B95]"
            onClick={(event) => {event.stopPropagation(); onClick?.(listing);}}>
            View stay
        </button>
      </div>
    </motion.div>
  );
};

// Listing projections are immutable at this boundary. Shallow comparison keeps
// all current and future listing fields observable without a second field list.
export default React.memo(ListingCard);
