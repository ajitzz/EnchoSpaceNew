import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { uiAudio } from './audio';
import { Listing } from '../types';
import { ChevronRight, ChevronLeft, ShieldCheck, StarIcon, HeartIcon, InfoIcon, MapIcon, EyeIcon } from './Icons';
import { OptimizedImage } from './OptimizedImage';
import { useCurrency } from './CurrencyContext';
import { getRatingWord, formatRating } from '../lib/ratingUtils';

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
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="group flex flex-col cursor-pointer bg-white rounded-2xl transition-all duration-300 hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 isolate cursor-grab active:cursor-grabbing group">
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
                
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 pointer-events-none"
            />
        </motion.div>
        
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Favorite Button */}
        <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { 
                e.stopPropagation();
                uiAudio.playPop();
                onToggleFavorite?.(listing);
            }}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/10 hover:bg-white/20 backdrop-blur-md transition-colors z-20 group/heart"
        >
            <HeartIcon className={`w-5 h-5 transition-colors ${isFavorite ? 'text-[#0284C7] fill-[#0284C7]' : 'text-white'}`} filled={isFavorite} />
        </motion.button>


        {/* Tags */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20">
            {listing.isVerified && (
                 <div className="bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1.5 self-start">
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    <span className="text-[10px] font-bold tracking-wider text-gray-800 uppercase">
                        {listing.originalId ? 'Room' : (listing.rooms && listing.rooms.length > 0 ? `Full ${listing.type}` : listing.type)}
                    </span>
                 </div>
            )}
            {listing.discount && (
                 <div className="bg-[#0284C7]/90 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm text-white self-start">
                    <span className="text-[10px] font-bold tracking-wider uppercase">-{listing.discount}% Off</span>
                 </div>
            )}
            {listing.hasOffers && !listing.discount && (
                 <div className="bg-[#0284C7]/90 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm text-white self-start">
                    <span className="text-[10px] font-bold tracking-wider uppercase">Offers Available</span>
                 </div>
            )}
        </div>

        {/* Navigation Arrows - Hidden on mobile, visible on group hover for desktop */}
        <div className={`hidden md:flex absolute inset-x-2 top-1/2 -translate-y-1/2 justify-between pointer-events-none transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
             <button onClick={prevImage} className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                <ChevronLeft className="w-4 h-4 text-gray-900" />
             </button>
             <button onClick={nextImage} className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg pointer-events-auto transform transition-transform hover:scale-110 active:scale-95">
                <ChevronRight className="w-4 h-4 text-gray-900" />
             </button>
        </div>

        {/* Dots Pagination */}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-20">
            {images.slice(0, 5).map((_, i) => (
                <div 
                    key={i} 
                    className={`
                        h-1.5 rounded-full shadow-sm transition-all duration-300 
                        ${i === (currentImageIndex % 5) ? 'bg-white w-4' : 'bg-white/50 w-1.5'}
                    `}
                />
            ))}
        </div>
      </div>

      {/* Content */}
      <div className="pt-4 px-1 pb-2 flex flex-col gap-1.5">
        <div className="flex justify-between items-start">
            <h3 className="font-bold text-gray-900 truncate text-lg pr-2 leading-tight group-hover:text-[#0284C7] transition-colors">
                {listing.displayTitle || listing.title}
            </h3>
            <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5">
                    {listing.rating && listing.rating > 0 && (
                        <span className="text-xs font-semibold text-gray-700 hidden sm:inline-block">
                            {getRatingWord(listing.rating)}
                        </span>
                    )}
                    <div className="bg-[#003B95] text-white text-xs font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-sm">
                        {formatRating(listing.rating)}
                    </div>
                </div>
            </div>
        </div>
        
        <div className="text-gray-500 text-sm truncate flex items-center gap-2">
            <span>{listing.type}</span>
            <span className="w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
            <span>{listing.amenities?.slice(0, 2).join(", ")}</span>
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-bold text-gray-900 text-xl">
                {formatPrice(listing.displayPrice ?? listing.price, listing.currency)}
            </span>
            <span className="text-gray-500 text-sm font-medium">
                /{listing.period}
            </span>
        </div>

        {/* CTA Bottom Bar - Appears on Hover (Desktop Only) */}
        {/* On mobile, this is hidden because hover doesn't exist. User taps card to view. */}
        <div className={`
            hidden md:flex mt-3 pt-3 border-t border-gray-100 items-center justify-between text-xs font-medium text-gray-600
            transition-all duration-300 overflow-hidden
            ${isHovered ? 'max-h-12 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2'}
        `}>
            <button className="flex flex-col items-center gap-1 hover:text-[#0284C7] transition-colors p-1">
                <InfoIcon className="w-4 h-4" />
                <span>Info</span>
            </button>
            <button className="flex flex-col items-center gap-1 hover:text-[#0284C7] transition-colors p-1">
                <MapIcon className="w-4 h-4" />
                <span>Map</span>
            </button>
            <button className="flex flex-col items-center gap-1 hover:text-[#0284C7] transition-colors p-1">
                <EyeIcon className="w-4 h-4" />
                <span>Details</span>
            </button>
            <button 
                className="bg-[#0284C7] hover:bg-[#0369A1] text-white px-4 py-1.5 rounded-full font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.(listing);
                }}
            >
                View
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