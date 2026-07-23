import React, { useState } from 'react';
import { SEO } from './SEO';
import { uiAudio } from './audio';
import { Listing, Experience } from '../types';
import ListingCard from './ListingCard';
import { ChevronLeft, HeartIcon } from './Icons';
import { MapPin, Map, Calendar, ArrowRight } from 'lucide-react';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { OptimizedImage } from './OptimizedImage';

interface WishlistPageProps {
  favorites: Listing[];
  favoriteExperiences?: Experience[];
  onBack: () => void;
  onListingClick: (listing: Listing) => void;
  onToggleFavorite: (listing: Listing) => void;
  onExperienceClick?: (exp: Experience) => void;
  onToggleExperienceFavorite?: (exp: Experience) => void;
}

const WishlistPage: React.FC<WishlistPageProps> = ({ 
  favorites, 
  favoriteExperiences = [], 
  onBack, 
  onListingClick, 
  onToggleFavorite,
  onExperienceClick,
  onToggleExperienceFavorite
}) => {
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState<'stays' | 'experiences'>('stays');
  
  const handleToggle = (listing: Listing) => {
      onToggleFavorite(listing);
      addToast("Wishlist Updated", `${listing.title} removed from your wishlist.`, "info");
  };

  const handleToggleExperience = (e: React.MouseEvent, exp: Experience) => {
      e.stopPropagation();
      if (onToggleExperienceFavorite) {
          onToggleExperienceFavorite(exp);
          addToast("Wishlist Updated", `${exp.title} removed from your wishlist.`, "info");
      }
  };

  const hasItems = activeTab === 'stays' ? favorites.length > 0 : favoriteExperiences.length > 0;

  return (
    <>
      <SEO title="Wishlists | Encho Space" description="Your saved places and experiences." />
    <div className="min-h-screen bg-gray-50 animate-fade-in pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
            <button 
                onClick={() => { uiAudio.playClick(); onBack(); }} 
                className="flex items-center gap-2 text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-full transition-all group font-semibold"
            >
                <div className="p-1.5 rounded-full bg-gray-100 group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-200">
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                </div>
                <span>Back to explore</span>
            </button>
            <h1 className="text-xl font-bold text-gray-900 hidden md:block">Your Wishlist</h1>
            <div className="w-10"></div> {/* Spacer for centering */}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6">Wishlist</h1>
            
            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-gray-200 pb-px">
                <button
                    onClick={() => setActiveTab('stays')}
                    className={`pb-4 text-lg font-bold transition-colors relative ${activeTab === 'stays' ? 'text-black' : 'text-gray-500 hover:text-gray-800'}`}
                >
                    Stays ({favorites.length})
                    {activeTab === 'stays' && (
                        <motion.div layoutId="wishlistTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('experiences')}
                    className={`pb-4 text-lg font-bold transition-colors relative ${activeTab === 'experiences' ? 'text-black' : 'text-gray-500 hover:text-gray-800'}`}
                >
                    Experiences ({favoriteExperiences.length})
                    {activeTab === 'experiences' && (
                        <motion.div layoutId="wishlistTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                    )}
                </button>
            </div>
        </div>

        {!hasItems ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6 text-gray-300">
                    <HeartIcon className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No {activeTab === 'stays' ? 'stays' : 'experiences'} saved yet</h2>
                <p className="text-gray-500 max-w-sm mb-8">As you explore, click the heart icon to save your favorite {activeTab === 'stays' ? 'places' : 'trips'} and they will appear here.</p>
                <button 
                    onClick={() => { uiAudio.playClick(); onBack(); }}
                    className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform active:scale-95"
                >
                    Start exploring
                </button>
            </div>
        ) : (
            <div className={activeTab === 'stays' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"}>
                {activeTab === 'stays' ? (
                    favorites.map((listing, index) => (
                        <ListingCard 
                            key={listing.id} 
                            listing={listing} 
                            priority={index < 4}
                            onClick={onListingClick}
                            isFavorite={true}
                            onToggleFavorite={() => handleToggle(listing)}
                        />
                    ))
                ) : (
                    favoriteExperiences.map((exp) => (
                        <motion.div 
                            key={exp.id} 
                            onClick={() => onExperienceClick?.(exp)}
                            whileHover={{ y: -8 }}
                            className="group cursor-pointer flex flex-col gap-4 relative bg-white p-4 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
                        >
                            {/* Image */}
                            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100">
                                <OptimizedImage 
                                    src={exp.image_urls?.[0] || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c81?auto=format&fit=crop&q=80&w=800'}
                                    alt={exp.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

                                {/* Heart Button */}
                                <button
                                    onClick={(e) => handleToggleExperience(e, exp)}
                                    className="absolute top-3 right-3 p-2 transition-transform hover:scale-110 active:scale-95 z-10"
                                >
                                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" style={{ display: 'block', fill: '#ef4444', height: '24px', width: '24px', stroke: 'white', strokeWidth: 2, overflow: 'visible' }}>
                                        <path d="M16 28c7-4.73 14-10 14-17a6.98 6.98 0 0 0-7-7c-1.8 0-3.58.68-4.95 2.05L16 8.1l-2.05-2.05a6.98 6.98 0 0 0-9.9 0A6.98 6.98 0 0 0 2 11c0 7 7 12.27 14 17z" />
                                    </svg>
                                </button>
                                
                                <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg">
                                    <span className="text-black font-black text-sm">{formatPrice(Number(exp.price), 'INR')}</span>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex flex-col px-1">
                                <div className="flex items-center text-blue-600 text-xs font-bold tracking-widest uppercase gap-1.5 mb-2">
                                    <MapPin className="w-4 h-4" />
                                    <span>{exp.destination}</span>
                                </div>
                                
                                <h3 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
                                    {exp.title}
                                </h3>
                                
                                <div className="flex items-center justify-between mt-4 border-t border-gray-100 pt-4">
                                    <div className="flex items-center text-gray-500 text-sm font-medium gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        <span>{format(new Date(exp.start_date), 'MMM d')} - {format(new Date(exp.end_date), 'MMM d')}</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-transparent transition-all">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        )}
      </main>
    </div>
    </>
  );
};

export default WishlistPage;