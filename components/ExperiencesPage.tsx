import React, { useEffect, useState } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Experience } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { CalendarIcon, MapIcon, ChevronRight } from './Icons';
import { Compass, Sparkles, Briefcase, GraduationCap, ShieldCheck, Heart, Search, MapPin, ChevronDown, Clock, IndianRupee, DollarSign, Euro, PoundSterling } from 'lucide-react';
import { format } from 'date-fns';
import { uiAudio } from './audio';
import { useCurrency } from './CurrencyContext';

interface ExperiencesPageProps {
  onExperienceClick: (experience: Experience) => void;
  isFavoriteExperience?: (id: string | number) => boolean;
  onToggleFavoriteExperience?: (experience: Experience) => void;
  experiences: Experience[];
  settings: any;
  loading: boolean;
}

const MOCK_EXPERIENCES: any[] = [ 
  {
    id: 10001 as any,
    title: "Sunrise Mountain Hike & Summit Breakfast",
    description: "Join us for an unforgettable early morning hike up the pristine trails of the Alps. Watch the sunrise from the summit and enjoy a specially prepared hot breakfast with panoramic views. Perfect for adventure seekers and photography enthusiasts.",
    destination: "Swiss Alps",
    departure_location: "Zurich",
    start_date: "2026-07-15T05:00:00Z",
    end_date: "2026-07-16T18:00:00Z",
    price: 4500,
    total_spots: 12,
    available_spots: 3,
    image_urls: [
      "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming",
    itinerary: [
        { title: "Day 1: Arrival & Briefing", description: "Arrive at the basecamp, meet the guides, and receive a thorough briefing on the trail and safety protocols." },
        { title: "Day 2: The Ascent", description: "Early morning start at 3 AM. Hike under the stars to reach the summit just in time for a spectacular sunrise." }
    ]
  },
  {
    id: 10002 as any,
    title: "Luxury Beachfront Candlelit Dinner",
    description: "Experience the ultimate romantic evening on a secluded white sand beach. Enjoy a 5-course gourmet meal prepared by a private chef, under the stars, accompanied by the gentle sound of the ocean waves. A perfect getaway for couples.",
    destination: "Maldives",
    departure_location: "Male",
    start_date: "2026-08-10T18:00:00Z",
    end_date: "2026-08-14T10:00:00Z",
    price: 12500,
    total_spots: 8,
    available_spots: 8,
    image_urls: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1533759413974-9e15f3b745ac?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming",
    itinerary: [
        { title: "Evening 1: Sunset Welcome", description: "Arrive by private speedboat, enjoy a welcome cocktail while watching the sunset." },
        { title: "Evening 2: The Grand Dinner", description: "A private 5-course culinary experience right on the beach, illuminated by hundreds of candles." }
    ]
  },
  {
    id: 10003 as any,
    title: "Historic European City Culture Tour",
    description: "Walk through the cobblestone streets of Rome and discover its hidden gems. This immersive cultural tour includes exclusive access to historical sites, a local food tasting experience, and guided storytelling by a renowned historian.",
    destination: "Rome, Italy",
    departure_location: "Rome Central",
    start_date: "2026-09-01T09:00:00Z",
    end_date: "2026-09-03T20:00:00Z",
    price: 8500,
    total_spots: 20,
    available_spots: 0,
    image_urls: [
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=1200",
      "https://images.unsplash.com/photo-1515542622106-78b28af7815b?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "sold_out",
    itinerary: [
        { title: "Day 1: Ancient Ruins", description: "Guided tour of the Colosseum and Roman Forum with an expert archaeologist." },
        { title: "Day 2: Vatican & Gastronomy", description: "Early access to the Vatican Museums followed by a traditional pasta-making class." }
    ]
  },
  {
    id: 10004 as any,
    title: "Desert Safari & Stargazing Camp",
    description: "An exhilarating ride through the golden dunes followed by a magical night under the desert sky. Includes traditional BBQ, cultural performances, and a guided stargazing session with professional telescopes.",
    destination: "Sahara Desert",
    departure_location: "Marrakech",
    start_date: "2026-10-12T14:00:00Z",
    end_date: "2026-10-14T11:00:00Z",
    price: 6000,
    total_spots: 15,
    available_spots: 5,
    image_urls: [
      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&q=80&w=1200"
    ],
    status: "upcoming"
  }
];

const getYouTubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

interface ExperienceCardProps {
  exp: Experience;
  index: number;
  isFav: boolean;
  onExperienceClick: (experience: Experience) => void;
  handleToggleFavorite: (e: React.MouseEvent, experience: Experience) => void;
}

const ExperienceCard: React.FC<ExperienceCardProps> = ({
  exp,
  index,
  isFav,
  onExperienceClick,
  handleToggleFavorite
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { formatPrice } = useCurrency();
  
  // Generate elegant destination title with pin emoji if not present
  const hasEmoji = (str: string) => /[\uD800-\uDFFF\u2600-\u27BF]/.test(str);
  const displayDest = exp.destination + (hasEmoji(exp.destination) ? '' : ' 📍');

  // Get video URL if it exists
  const rawVideoUrl = exp.video_urls && exp.video_urls.length > 0 ? exp.video_urls[0] : null;
  const youtubeId = rawVideoUrl ? getYouTubeId(rawVideoUrl) : null;

  return (
    <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
            type: "spring",
            stiffness: 240,
            damping: 24,
            delay: index * 0.05 
        }}
        whileHover={{ 
            y: -10, 
            scale: 1.015,
            transition: { type: "spring", stiffness: 300, damping: 20 }
        }}
        whileTap={{ 
            scale: 0.955,
            transition: { type: "spring", stiffness: 450, damping: 15 }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
            uiAudio.playClick();
            onExperienceClick(exp);
        }}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-[2.5rem] bg-zinc-950 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-gray-100/10 group cursor-pointer select-none"
    >
        {/* Full-bleed background media */}
        <div className="absolute inset-0 z-0">
            {isHovered && rawVideoUrl ? (
                youtubeId ? (
                    <iframe
                        src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&playlist=${youtubeId}&enablejsapi=1`}
                        className="absolute inset-0 w-full h-full object-cover scale-150 pointer-events-none transition-opacity duration-300"
                        allow="autoplay; encrypted-media"
                        title="Video preview"
                    />
                ) : (
                    <video
                        src={rawVideoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                    />
                )
            ) : (
                <OptimizedImage 
                    src={exp.image_urls?.[0] || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c81?auto=format&fit=crop&q=80&w=800'}
                    alt={exp.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out"
                />
            )}
        </div>
        
        {/* Delicate top-to-bottom dark gradient overlay ensuring crisp readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/15 to-black/85 z-10 pointer-events-none" />

        {/* Top-Left: Bold Location and Subtitle (Matches the screenshot layout) */}
        <div className="absolute top-8 left-8 z-20 max-w-[65%] flex flex-col items-start pointer-events-none">
            <h3 className="font-extrabold text-2xl md:text-3xl tracking-tight text-white drop-shadow-md leading-tight">
                {displayDest}
            </h3>
            <p className="font-semibold text-sm text-zinc-100/85 mt-1.5 drop-shadow-sm line-clamp-1">
                {exp.title}
            </p>

            {/* Integrated mini-badges inside card */}
            <div className="flex flex-wrap gap-1.5 mt-3">
                {exp.status === 'sold_out' ? (
                    <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-extrabold uppercase tracking-widest text-white shadow-sm">
                        Sold Out
                    </span>
                ) : exp.available_spots <= 5 ? (
                    <span className="px-2.5 py-1 rounded-full bg-rose-500/80 backdrop-blur-md border border-rose-400/30 text-[9px] font-extrabold uppercase tracking-widest text-white shadow-sm animate-pulse">
                        Only {exp.available_spots} Left
                    </span>
                ) : null}
                {exp.target_audience && exp.target_audience !== 'all' && (
                    <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[9px] font-extrabold uppercase tracking-widest text-zinc-100 shadow-sm">
                        {exp.target_audience.replace('_', ' ')}
                    </span>
                )}
            </div>
        </div>

        {/* Top-Right: Dark circular action button with a diagonal arrow (Sleek hover glassmorphism) */}
        <div className="absolute top-7 right-7 z-20 w-11 h-11 md:w-12 md:h-12 rounded-full bg-zinc-950/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all duration-300 group-hover:bg-white/15 group-hover:backdrop-blur-xl group-hover:border-white/20 group-hover:scale-105 group-hover:shadow-lg">
            <svg className="w-5 h-5 text-white transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
        </div>

        {/* Bottom Floating Glassmorphism Overlay Panel containing Price and Date */}
        <div className="absolute bottom-6 inset-x-6 z-20 p-4 rounded-[1.75rem] bg-zinc-950/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-between shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-zinc-950/50 hover:border-white/15 transition-all duration-300">
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest leading-none">Price per person</span>
                <div className="flex items-baseline gap-1 mt-1.5">
                    <span className="text-lg md:text-xl font-black text-white leading-none">{formatPrice(Number(exp.price), 'INR')}</span>
                    <span className="text-xs text-zinc-300 font-medium">/trip</span>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest leading-none">Date</span>
                    <span className="text-xs font-extrabold text-white mt-1.5 leading-none">
                        {format(new Date(exp.start_date), 'MMM d')} - {format(new Date(exp.end_date), 'd')}
                    </span>
                </div>
                
                {/* Interactive glass heart button integrated in bottom panel */}
                <button
                    onClick={(e) => {
                        handleToggleFavorite(e, exp);
                    }}
                    className={`p-2.5 rounded-full backdrop-blur-md border transition-all duration-300 hover:scale-110 active:scale-95 pointer-events-auto ${
                        isFav 
                            ? 'bg-rose-500/20 border-rose-500/35 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]' 
                            : 'bg-white/10 border-white/10 text-white/80 hover:text-white hover:bg-white/20'
                    }`}
                    title={isFav ? "Saved to wishlist" : "Add to wishlist"}
                >
                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" className={`w-4 h-4 transition-transform duration-300 ${isFav ? 'fill-rose-500 scale-110' : 'fill-transparent'}`} style={{ stroke: 'currentColor', strokeWidth: 2.5, overflow: 'visible' }}>
                        <path d="M16 28c7-4.73 14-10 14-17a6.98 6.98 0 0 0-7-7c-1.8 0-3.58.68-4.95 2.05L16 8.1l-2.05-2.05a6.98 6.98 0 0 0-9.9 0A6.98 6.98 0 0 0 2 11c0 7 7 12.27 14 17z" />
                    </svg>
                </button>
            </div>
        </div>
    </motion.div>
  );
};

export const ExperiencesPage: React.FC<ExperiencesPageProps> = ({ 
  onExperienceClick,
  isFavoriteExperience,
  onToggleFavoriteExperience,
  experiences: rawExperiences,
  settings,
  loading
}) => {
  const experiences = rawExperiences && rawExperiences.length > 0 ? rawExperiences : MOCK_EXPERIENCES;
  const { formatPrice, currency } = useCurrency();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<string>('All');
  const [tripType, setTripType] = useState<string>('All');
  const [audienceFilter, setAudienceFilter] = useState<string>('All');
  const [currentReelIndex, setCurrentReelIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const defaultReels = [
    {
      url: "https://assets.mixkit.co/videos/preview/mixkit-cinematic-mountain-landscape-with-snow-covered-peaks-42761-large.mp4",
      title: "Alpine Winter Summit & Sunrise",
      destination: "Swiss Alps",
      duration: "Weekend",
      experience: experiences.find(e => e.destination === 'Swiss Alps')
    },
    {
      url: "https://assets.mixkit.co/videos/preview/mixkit-travel-in-the-mountains-under-the-stars-41487-large.mp4",
      title: "Desert Stargazing & Celestial Camp",
      destination: "Sahara Desert",
      duration: "3 Days",
      experience: experiences.find(e => e.destination === 'Sahara Desert')
    },
    {
      url: "https://assets.mixkit.co/videos/preview/mixkit-scuba-diver-swimming-with-a-whale-shark-40346-large.mp4",
      title: "Secluded Lagoon Dinner & Diving",
      destination: "Maldives",
      duration: "4 Days",
      experience: experiences.find(e => e.destination === 'Maldives')
    }
  ];

  // Dynamically extract uploaded tour video reels from custom experiences
  const customReels = experiences
    .filter(e => e.video_urls && e.video_urls.length > 0)
    .map(e => ({
      url: e.video_urls[0],
      title: e.title,
      destination: e.destination,
      duration: e.duration_days ? `${e.duration_days} Days` : "Curated",
      experience: e
    }));

  const activeReels = customReels.length > 0 ? customReels : defaultReels;
  const currentReel = activeReels[currentReelIndex];
  const youtubeId = getYouTubeId(currentReel?.url);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentReelIndex((prev) => (prev + 1) % activeReels.length);
    }, 12000); // 12 seconds per cinematic reel
    return () => clearInterval(interval);
  }, [isPlaying, activeReels.length]);

  const destinations = ['All', ...Array.from(new Set(experiences.map(e => e.destination)))];

  const filteredExperiences = experiences.filter(exp => {
      const matchesSearch = exp.title.toLowerCase().includes(searchQuery.toLowerCase()) || exp.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDest = selectedDestination === 'All' || exp.destination === selectedDestination;
      
      let matchesPrice = true;
      if (priceFilter === 'under_5k') matchesPrice = exp.price < 5000;
      if (priceFilter === '5k_10k') matchesPrice = exp.price >= 5000 && exp.price <= 10000;
      if (priceFilter === 'over_10k') matchesPrice = exp.price > 10000;

      let matchesType = true;
      if (tripType === 'weekend') matchesType = (exp.duration_days || 0) <= 3; // roughly a weekend
      if (tripType === 'long') matchesType = (exp.duration_days || 0) > 3;

      let matchesAudience = true;
      if (audienceFilter !== 'All') {
          matchesAudience = exp.target_audience === audienceFilter || (!exp.target_audience && audienceFilter === 'all');
      }

      return matchesSearch && matchesDest && matchesPrice && matchesType && matchesAudience;
  });

  const handleToggleFavorite = (e: React.MouseEvent, exp: Experience) => {
      e.stopPropagation();
      if (onToggleFavoriteExperience) {
          onToggleFavoriteExperience(exp);
      }
  };

  return (
    <>
      <SEO 
        title="Extraordinary Experiences"
        description="Discover exclusive curated experiences around the globe. From cultural tours to adventure trips, book your next unforgettable journey."
      />
    <div className="max-w-[1920px] mx-auto px-4 md:px-8 py-8 md:py-12 pb-24">
      {/* Hero Section */}
      <div className="mb-12 md:mb-16 rounded-[2.5rem] overflow-hidden relative group isolate shadow-2xl bg-[#0f172a] h-[450px] md:h-[600px]">
        {/* Cinematic gradient overlay ensuring crisp readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/20 to-black/30 z-10" />
        
        {/* Live Feed Indicator (Top-Left corner) */}
        <div className="absolute top-8 left-8 z-30 flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center gap-2 shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/90 font-mono">
              REEL {String(currentReelIndex + 1).padStart(2, '0')} • {currentReel?.destination.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Dynamic Video Tour Reels Background */}
        <div className="absolute inset-0 z-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentReelIndex}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 w-full h-full overflow-hidden"
            >
              {youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&playlist=${youtubeId}&enablejsapi=1`}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-[1.35]"
                  allow="autoplay; encrypted-media"
                  title="Dynamic Video Tour Reel"
                />
              ) : (
                <video
                  src={currentReel?.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dynamic Controls Overlay (Bottom-Right corner) */}
        <div className="absolute bottom-8 right-8 z-30 flex flex-col items-end gap-3 font-mono">
          <div className="flex items-center gap-2 bg-black/45 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl shadow-2xl">
            {/* Prev Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                uiAudio.playClick();
                setCurrentReelIndex((prev) => (prev - 1 + activeReels.length) % activeReels.length);
              }}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
              title="Previous Tour Reel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                uiAudio.playClick();
                setIsPlaying(!isPlaying);
              }}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center cursor-pointer"
              title={isPlaying ? "Pause Tour Reels" : "Play Tour Reels"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Next Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                uiAudio.playClick();
                setCurrentReelIndex((prev) => (prev + 1) % activeReels.length);
              }}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
              title="Next Tour Reel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Auto-advance linear progress indicator */}
          {isPlaying && (
            <div className="w-32 h-[3px] bg-white/10 rounded-full overflow-hidden">
              <motion.div
                key={currentReelIndex}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 12, ease: "linear" }}
                className="h-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
              />
            </div>
          )}
        </div>

        {/* Content Container */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 md:p-16 text-white max-w-5xl">
            {settings.badge_text && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 w-fit mb-8 shadow-2xl animate-fade-in"
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
                    <span className="text-[10px] font-extrabold tracking-widest uppercase text-white/90 font-sans">
                      {settings.badge_text} • REEL {currentReelIndex + 1}/{activeReels.length}
                    </span>
                </motion.div>
            )}
            
            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-4 md:mb-6 leading-[1.05] whitespace-pre-line text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            >
                {settings.hero_title}
            </motion.h1>
            
            <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg md:text-2xl text-slate-100/90 max-w-2xl font-semibold leading-relaxed whitespace-pre-line drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            >
                {settings.hero_subtitle}
            </motion.p>

            {/* Swiss-Modernist Metadata Strip */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-6 border-t border-white/15 text-white/95 font-sans text-xs"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-zinc-300/80 uppercase tracking-widest font-black">Featured Destination</span>
                <span className="text-white font-black tracking-tight text-base drop-shadow-sm">{currentReel?.destination}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-zinc-300/80 uppercase tracking-widest font-black">Current Reel</span>
                <span className="text-white font-black tracking-tight text-base line-clamp-1 drop-shadow-sm">{currentReel?.title}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-zinc-300/80 uppercase tracking-widest font-black">Duration</span>
                <span className="text-white font-black tracking-tight text-base drop-shadow-sm">{currentReel?.duration}</span>
              </div>
              {currentReel?.experience && (
                <button
                  onClick={() => {
                    uiAudio.playClick();
                    onExperienceClick(currentReel.experience);
                  }}
                  className="ml-auto inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-white text-black hover:bg-slate-100 font-extrabold text-xs tracking-wider uppercase transition-all duration-300 transform active:scale-95 shadow-md hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 self-center font-sans cursor-pointer"
                >
                  <span>Explore Experience</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              )}
            </motion.div>
        </div>
      </div>

      {/* Target Audience Pill Filter (Premium & High-Converting) */}
      <div className="mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar pb-2 pt-2">
        <div className="flex gap-3 min-w-max">
            {[
                { id: 'All', label: 'All Experiences', icon: Sparkles },
                { id: 'corporate', label: 'Tech & IT (Unplug)', icon: Briefcase },
                { id: 'couples', label: 'Couples (Romantic)', icon: Heart }
            ].map(vibe => {
                const Icon = vibe.icon;
                const isActive = audienceFilter === vibe.id;
                return (
                <button
                    key={vibe.id}
                    onClick={() => setAudienceFilter(vibe.id)}
                    className={`flex items-center gap-2.5 px-6 py-3.5 rounded-full font-bold text-sm transition-all duration-300 ${
                        isActive 
                            ? 'bg-black text-white shadow-xl shadow-black/20 scale-[1.02] transform' 
                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100 hover:border-gray-200 shadow-sm'
                    }`}
                >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-gray-400'}`} />
                    {vibe.label}
                </button>
            )})}
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="mb-12 bg-white p-3 md:p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                  type="text" 
                  placeholder="Search destinations, experiences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-5 py-4 bg-gray-50/50 rounded-[1.5rem] border border-transparent focus:bg-white focus:border-gray-200 focus:ring-4 focus:ring-gray-100/50 font-medium text-gray-900 transition-all outline-none"
              />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0 no-scrollbar w-full md:w-auto snap-x snap-mandatory">
             <div className="relative shrink-0 group">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  <select 
                      value={selectedDestination}
                      onChange={(e) => setSelectedDestination(e.target.value)}
                      className="pl-11 pr-10 py-4 bg-white hover:bg-gray-50 rounded-[1.5rem] border border-gray-100 focus:border-black focus:ring-1 focus:ring-black font-semibold text-gray-700 min-w-[160px] cursor-pointer appearance-none transition-all outline-none"
                  >
                      {destinations.map(d => <option key={d} value={d}>{d === 'All' ? 'Any Destination' : d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
             </div>
             
             <div className="relative shrink-0 group">
                  {currency === 'USD' ? (
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  ) : currency === 'EUR' ? (
                       <Euro className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  ) : currency === 'GBP' ? (
                       <PoundSterling className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  ) : (
                       <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  )}
                  <select 
                      value={priceFilter}
                      onChange={(e) => setPriceFilter(e.target.value)}
                      className="pl-11 pr-10 py-4 bg-white hover:bg-gray-50 rounded-[1.5rem] border border-gray-100 focus:border-black focus:ring-1 focus:ring-black font-semibold text-gray-700 min-w-[160px] cursor-pointer appearance-none transition-all outline-none"
                  >
                      <option value="All">Any Price</option>
                      <option value="under_5k">Under {formatPrice(5000, 'INR')}</option>
                      <option value="5k_10k">{formatPrice(5000, 'INR')} - {formatPrice(10000, 'INR')}</option>
                      <option value="over_10k">Over {formatPrice(10000, 'INR')}</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
             </div>

             <div className="relative shrink-0 group">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  <select 
                      value={tripType}
                      onChange={(e) => setTripType(e.target.value)}
                      className="pl-11 pr-10 py-4 bg-white hover:bg-gray-50 rounded-[1.5rem] border border-gray-100 focus:border-black focus:ring-1 focus:ring-black font-semibold text-gray-700 min-w-[180px] cursor-pointer appearance-none transition-all outline-none"
                  >
                      <option value="All">All Trip Types</option>
                      <option value="weekend">Weekend Getaways</option>
                      <option value="long">Long Itineraries</option>
                      <option value="day">Day Trips</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
             </div>
          </div>
      </div>

      <div className="flex justify-between items-end mb-8 md:mb-12">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900">All Experiences</h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse flex flex-col gap-4">
              <div className="bg-gray-200 rounded-[2rem] aspect-[3/4] w-full" />
              <div className="bg-gray-200 h-6 w-3/4 rounded mt-2" />
              <div className="bg-gray-200 h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : filteredExperiences.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border border-gray-100 flex flex-col items-center justify-center">
            <Compass className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No experiences found</h3>
            <p className="text-gray-500 text-lg">Try adjusting your search or filters.</p>
            <button 
                onClick={() => {
                    setSearchQuery('');
                    setSelectedDestination('All');
                    setPriceFilter('All');
                }}
                className="mt-6 px-6 py-3 bg-black text-white rounded-full font-bold hover:bg-gray-800 transition-colors"
            >
                Clear all filters
            </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {filteredExperiences.map((exp, index) => {
            const isFav = isFavoriteExperience ? isFavoriteExperience(exp.id) : false;
            return (
              <ExperienceCard
                key={exp.id}
                exp={exp}
                index={index}
                isFav={isFav}
                onExperienceClick={onExperienceClick}
                handleToggleFavorite={handleToggleFavorite}
              />
            );
          })}
        </div>
      )}
    </div>
    </>
  );
};
