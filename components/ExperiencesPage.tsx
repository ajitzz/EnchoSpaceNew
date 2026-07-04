import React, { useEffect, useState } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Experience } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { CalendarIcon, MapIcon, ChevronRight } from './Icons';
import { Compass, Sparkles, Briefcase, GraduationCap, ShieldCheck, Heart, Search, MapPin, ChevronDown, Clock, IndianRupee } from 'lucide-react';
import { format } from 'date-fns';

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

export const ExperiencesPage: React.FC<ExperiencesPageProps> = ({ 
  onExperienceClick,
  isFavoriteExperience,
  onToggleFavoriteExperience,
  experiences: rawExperiences,
  settings,
  loading
}) => {
  const experiences = rawExperiences && rawExperiences.length > 0 ? rawExperiences : MOCK_EXPERIENCES;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<string>('All');
  const [tripType, setTripType] = useState<string>('All');
  const [audienceFilter, setAudienceFilter] = useState<string>('All');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
      if (settings.hero_image_urls && settings.hero_image_urls.length > 1) {
          const interval = setInterval(() => {
              setCurrentImageIndex((prev) => (prev + 1) % settings.hero_image_urls.length);
          }, 5000);
          return () => clearInterval(interval);
      }
  }, [settings.hero_image_urls]);

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
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/40 to-transparent z-10" />
        <AnimatePresence initial={false}>
            <motion.img 
                key={currentImageIndex}
                src={settings.hero_image_urls?.[currentImageIndex] || "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=2400"} 
                alt="Experiences Hero" 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-[5s] ease-out"
            />
        </AnimatePresence>
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 md:p-16 text-white max-w-5xl">
            {settings.badge_text && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 w-fit mb-8 shadow-2xl"
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
                    <span className="text-sm font-bold tracking-widest uppercase text-white/90">{settings.badge_text}</span>
                </motion.div>
            )}
            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-4 md:mb-6 leading-[1.05] md:leading-[1.05] whitespace-pre-line"
            >
                {settings.hero_title}
            </motion.h1>
            <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg md:text-2xl text-slate-300 max-w-2xl font-medium leading-relaxed whitespace-pre-line"
            >
                {settings.hero_subtitle}
            </motion.p>
        </div>
      </div>

      {/* Target Audience Pill Filter (Premium & High-Converting) */}
      <div className="mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar pb-2 pt-2">
        <div className="flex gap-3 min-w-max">
            {[
                { id: 'All', label: 'All Experiences', icon: Sparkles },
                { id: 'corporate', label: 'Tech & IT (Unplug)', icon: Briefcase },
                { id: 'students', label: 'College Students (Budget)', icon: GraduationCap },
                { id: 'women_only', label: 'Women Only (Safe Escapes)', icon: ShieldCheck },
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
                  <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-black transition-colors pointer-events-none" />
                  <select 
                      value={priceFilter}
                      onChange={(e) => setPriceFilter(e.target.value)}
                      className="pl-11 pr-10 py-4 bg-white hover:bg-gray-50 rounded-[1.5rem] border border-gray-100 focus:border-black focus:ring-1 focus:ring-black font-semibold text-gray-700 min-w-[160px] cursor-pointer appearance-none transition-all outline-none"
                  >
                      <option value="All">Any Price</option>
                      <option value="under_5k">Under ₹5,000</option>
                      <option value="5k_10k">₹5,000 - ₹10,000</option>
                      <option value="over_10k">Over ₹10,000</option>
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
            <motion.div 
                key={exp.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => onExperienceClick(exp)}
                whileHover={{ y: -8 }}
                className="group cursor-pointer flex flex-col gap-4 relative"
            >
                {/* Image */}
                <div className="relative aspect-[3/4] overflow-hidden rounded-[2rem] bg-gray-100 shadow-lg shadow-gray-200/50">
                    <OptimizedImage 
                        src={exp.image_urls?.[0] || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c81?auto=format&fit=crop&q=80&w=800'}
                        alt={exp.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Wishlist Button */}
                    <button
                        onClick={(e) => handleToggleFavorite(e, exp)}
                        className="absolute top-4 right-4 p-2.5 transition-transform hover:scale-110 active:scale-95 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full border border-white/30 shadow-lg"
                    >
                        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" style={{ display: 'block', fill: isFav ? '#ef4444' : 'rgba(0, 0, 0, 0.5)', height: '20px', width: '20px', stroke: 'white', strokeWidth: 2, overflow: 'visible' }}>
                            <path d="M16 28c7-4.73 14-10 14-17a6.98 6.98 0 0 0-7-7c-1.8 0-3.58.68-4.95 2.05L16 8.1l-2.05-2.05a6.98 6.98 0 0 0-9.9 0A6.98 6.98 0 0 0 2 11c0 7 7 12.27 14 17z" />
                        </svg>
                    </button>

                    {/* Status / Scarcity Badge */}
                    <div className="absolute top-5 left-5 z-10 flex flex-col gap-2 pointer-events-none">
                        {exp.status === 'sold_out' ? (
                            <div className="bg-black/60 backdrop-blur-xl border border-white/20 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Sold Out
                            </div>
                        ) : exp.available_spots <= 5 ? (
                            <div className="bg-red-500/80 backdrop-blur-xl border border-red-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl animate-pulse">
                                Only {exp.available_spots} left
                            </div>
                        ) : (
                            <div className="bg-white/80 backdrop-blur-xl border border-white/50 text-gray-900 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Available
                            </div>
                        )}
                        {exp.target_audience === 'students' && (
                            <div className="bg-emerald-500/80 backdrop-blur-xl border border-emerald-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Students Only
                            </div>
                        )}
                        {exp.target_audience === 'women_only' && (
                            <div className="bg-pink-500/80 backdrop-blur-xl border border-pink-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Women Only
                            </div>
                        )}
                        {exp.target_audience === 'corporate' && (
                            <div className="bg-blue-500/80 backdrop-blur-xl border border-blue-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Tech & IT
                            </div>
                        )}
                        {exp.target_audience === 'couples' && (
                            <div className="bg-purple-500/80 backdrop-blur-xl border border-purple-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Couples
                            </div>
                        )}
                        {exp.target_audience === 'solo' && (
                            <div className="bg-amber-500/80 backdrop-blur-xl border border-amber-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Solo Travelers
                            </div>
                        )}
                        {exp.target_audience === 'family' && (
                            <div className="bg-sky-500/80 backdrop-blur-xl border border-sky-400/50 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                                Family Friendly
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1.5 px-2 mt-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center text-gray-500 text-xs font-bold tracking-wider uppercase gap-1.5">
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>{exp.destination}</span>
                        </div>
                    </div>
                    
                    <h3 className="text-xl font-black text-gray-900 leading-tight group-hover:text-[#0284C7] transition-colors line-clamp-2">
                        {exp.title}
                    </h3>
                    
                    <div className="flex items-center text-gray-500 text-sm font-medium gap-1.5 mt-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{format(new Date(exp.start_date), 'MMM d')} - {format(new Date(exp.end_date), 'MMM d, yyyy')}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                        {exp.target_audience && exp.target_audience !== 'all' && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                {exp.target_audience.replace('_', ' ')}
                            </span>
                        )}
                        {exp.language && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                {exp.language}
                            </span>
                        )}
                        {exp.available_spots <= 10 && exp.available_spots > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-100 text-[10px] font-bold text-orange-600 uppercase tracking-wider">
                                {exp.available_spots} Spots Left
                            </span>
                        )}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <div>
                            <span className="font-black text-gray-900 text-xl tracking-tight">₹{Number(exp.price).toLocaleString()}</span>
                            <span className="text-gray-500 text-sm font-medium"> / person</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:bg-[#0284C7] group-hover:text-white transition-all group-hover:border-[#0284C7] group-hover:shadow-lg group-hover:shadow-blue-500/30 group-hover:scale-110">
                            <ChevronRight className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </motion.div>
          )})}
        </div>
      )}
    </div>
    </>
  );
};
