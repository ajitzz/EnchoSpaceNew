/// <reference types="@types/google.maps" />

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { uiAudio } from './audio';
import { SearchIcon, HeartIcon, UserIcon, MenuIcon, CalendarIcon, NavigationIcon, MapIcon, XIcon, PhoneIcon, MessageCircleIcon, MailIcon, HouseIcon, LogInIcon } from './Icons';
import { useAuth } from './AuthContext';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { CurrencySelector } from './CurrencySelector';
import { useToast } from './ToastContext';

interface HeaderProps {
  onSearch: (city: string) => void;
  currentCity: string;
  onWishlistClick: () => void;
  onReservesClick: () => void;
  onHostClick: () => void;
  onLoginClick: () => void;
  highlightReserves?: boolean;
  highlightWishlist?: boolean;
  reservesCount: number;
  wishlistCount: number;
  appMode?: 'travel' | 'host';
  onModeSwitch?: (mode: 'travel' | 'host') => void;
  hostView?: 'today' | 'calendar' | 'listings' | 'messages' | 'analytics';
  onHostViewChange?: (view: 'today' | 'calendar' | 'listings' | 'messages' | 'analytics') => void;
  onInboxClick?: () => void;
  isOnline?: boolean;
  activeTab?: 'stays' | 'experiences';
  onExperiencesClick?: () => void;
  onStaysClick?: () => void;
  onProfileClick?: () => void;
}

const POPULAR_CITIES = ['Berlin', 'London', 'Paris', 'New York', 'Tokyo', 'Barcelona', 'Amsterdam', 'Munich'];

import { WifiOffIcon, DownloadIcon } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

const Header: React.FC<HeaderProps> = ({ 
    onSearch, 
    currentCity, 
    onWishlistClick, 
    onReservesClick, 
    onHostClick,
    onLoginClick,
    highlightReserves, 
    highlightWishlist,
    reservesCount,
    wishlistCount,
    appMode = 'travel',
    onModeSwitch,
    hostView = 'today',
    onHostViewChange,
    onInboxClick,
    isOnline = true,
    activeTab = 'stays',
    onExperiencesClick,
    onStaysClick,
    onProfileClick
}) => {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  
  const { isInstallable, promptInstall } = usePWAInstall();
  const [inputValue, setInputValue] = useState(currentCity);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);

  const placesLibrary = useMapsLibrary('places');
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null);
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
      try {
          const stored = localStorage.getItem('recentSearches');
          if (stored) return JSON.parse(stored);
      } catch (e) {
          console.error(e);
      }
      return [];
  });

  useEffect(() => {
    if (!placesLibrary) return;
    
    setAutocompleteService(new placesLibrary.AutocompleteService());
    
    setSessionToken(new placesLibrary.AutocompleteSessionToken());
  }, [placesLibrary]);

  useEffect(() => {
    const LOCAL_CITIES_DATABASE = [
      'Berlin, Germany', 'London, United Kingdom', 'Paris, France', 'New York, United States',
      'Tokyo, Japan', 'Barcelona, Spain', 'Amsterdam, Netherlands', 'Munich, Germany',
      'Yogyakarta, Indonesia', 'Jogja, Indonesia',
      'Bengaluru, India', 'Bangalore, India',
      'Bali, Indonesia', 'Jakarta, Indonesia', 'Bandung, Indonesia', 'Surabaya, Indonesia',
      'Singapore', 'Sydney, Australia', 'Rome, Italy', 'Milan, Italy', 'Toronto, Canada', 'Vancouver, Canada'
    ];

    function fallbackToLocal() {
      const query = inputValue.toLowerCase().trim();
      const matches = LOCAL_CITIES_DATABASE.filter(city => city.toLowerCase().includes(query));
      const formatted: google.maps.places.AutocompletePrediction[] = matches.map((city, idx) => {
        const parts = city.split(',');
        const main = parts[0].trim();
        const secondary = parts[1] ? parts[1].trim() : 'Popular Destination';
        return {
          place_id: `local-city-${idx}-${main}`,
          description: city,
          distance_meters: 0,
          matched_substrings: [],
          place_types: ['locality', 'political'],
          reference: `local-city-${idx}-${main}`,
          structured_formatting: {
            main_text: main,
            main_text_matched_substrings: [],
            secondary_text: secondary,
          },
          types: ['locality', 'political']
        } as any;
      });
      setPredictions(formatted);
    }

    if (!inputValue || inputValue.trim() === '' || inputValue.length < 2) {
       setPredictions([]);
       return;
    }
    
    if (!placesLibrary) {
       fallbackToLocal();
       return;
    }

    // Try the new Places API (AutocompleteSuggestion) first, recommended for new customers
    if ((placesLibrary as any).AutocompleteSuggestion) {
       (placesLibrary as any).AutocompleteSuggestion.fetchAutocompleteSuggestions({
           input: inputValue,
           includedPrimaryTypes: ['locality']
       }).then((response: any) => {
           if (response && response.suggestions) {
               const mapped = response.suggestions.map((s: any) => {
                   const text = s.placePrediction?.text?.text || '';
                   const parts = text.split(',');
                   return {
                       place_id: s.placePrediction?.placeId || s.placePrediction?.place?.id,
                       description: text,
                       structured_formatting: {
                           main_text: parts[0] || text,
                           secondary_text: parts.slice(1).join(',').trim() || ''
                       }
                   };
               });
               setPredictions(mapped as any);
           } else {
               fallbackToLocal();
           }
       }).catch((err: any) => {
           console.warn('AutocompleteSuggestion failed, trying legacy or local:', err);
           fallbackToLegacy();
       });
    } else {
       fallbackToLegacy();
    }

    function fallbackToLegacy() {
      if (!autocompleteService) {
        fallbackToLocal();
        return;
      }
      autocompleteService.getPlacePredictions({
         input: inputValue,
         sessionToken,
         types: ['(cities)']
      }, (results, status) => {
         if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
             setPredictions(results);
         } else {
             fallbackToLocal();
         }
      });
    }

  }, [inputValue, autocompleteService, sessionToken, placesLibrary]);

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) setWhatsappConfig(data);
      })
      .catch(console.error);
      
    fetch('/api/settings/call')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) setCallConfig(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
     if (user) {
         fetch('/api/unread-counts', {
             headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
         })
         .then(res => res.json())
         .then(data => setUnreadCount(data.unread || 0))
         .catch(console.error);
         
         const interval = setInterval(() => {
             fetch('/api/unread-counts', {
                 headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
             })
             .then(res => res.json())
             .then(data => setUnreadCount(data.unread || 0));
         }, 30000);
         return () => clearInterval(interval);
     } else {
         
         setUnreadCount(0);
     }
  }, [user]);
  
  const searchRef = useRef<HTMLFormElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target as Node)) {
          setIsDesktopMenuOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent, cityOverride?: string) => {
    e.preventDefault();
    const cityToSearch = cityOverride || inputValue;
    if (!cityToSearch.trim()) {
        addToast("Empty Search", "Please enter a city or location to search.", "warning");
        return;
    }
    
    onSearch(cityToSearch);
    setInputValue(cityToSearch);
    setIsFocused(false);
      
      // Save recent search
      try {
          const newSearches = [cityToSearch, ...recentSearches.filter(s => s !== cityToSearch)].slice(0, 5);
          setRecentSearches(newSearches);
          localStorage.setItem('recentSearches', JSON.stringify(newSearches));
      } catch (err) {
          console.error(err);
      }

      // Ensure dropdown closes
      (document.activeElement as HTMLElement)?.blur();
  };

  return (
    <>
      <header 
        className={`
          sticky top-0 z-50 transition-all duration-300
          ${isScrolled 
            ? 'bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm' 
            : 'bg-white border-b border-transparent'}
        `}
      >
        <div className="max-w-[1920px] mx-auto px-4 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 relative py-3 md:py-0 md:h-20">
          
          {/* Mobile-only brand, tabs, and menu button top row (unified compact layout) */}
          <div className="grid grid-cols-3 items-center md:hidden w-full mb-3.5 px-1 mt-1.5 select-none">
            {/* Logo - text only without image, optimized for exact screenshot design */}
       <div 
  onClick={() => {
      setInputValue('');
      onSearch('Berlin'); // Reset to default/home
  }}
  className="flex flex-col cursor-pointer group shrink-0 select-none justify-self-start"
>
  {/* Top Row: ENCHO (Deep Navy-Black) + Blue Dot */}
  <div className="flex items-baseline font-black leading-none transition-colors duration-300">
    <span className="text-base md:text-lg font-black tracking-tight text-[#0F172A] group-hover:text-[#0284C7] transition-colors duration-300">ENCHO</span>
    <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] ml-[3px] transition-transform duration-300 group-hover:scale-125" />
  </div>
  
  {/* Bottom Row: SPACE (Reduced Gap) */}
  <span className="text-[7px] md:text-[8px] font-black tracking-[0.4em] text-[#8e8e93] uppercase leading-none mt-0.5 group-hover:text-[#5e687a] transition-colors duration-300">
    SPACE
  </span>
</div>

            {/* Stays / Experiences Pills perfectly centered matching the screenshot design */}
            <div className="justify-self-center flex bg-[#F4F4F6] p-0.5 rounded-full border border-gray-200/5 relative">
              <button 
                  type="button"
                  className={`relative z-10 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold tracking-tight transition-colors duration-300 ${activeTab === 'stays' ? 'text-[#18181b]' : 'text-[#5e687a] hover:text-[#18181b]'}`}
                  onClick={() => {
                      uiAudio.playClick();
                      if (navigator.vibrate) navigator.vibrate(10);
                      onStaysClick?.();
                  }}
              >
                  {activeTab === 'stays' && (
                    <motion.div
                      layoutId="activeMobileHeaderPill"
                      className="absolute inset-0 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08)] -z-10"
                      transition={{ type: "spring", stiffness: 380, damping: 25 }}
                    />
                  )}
                  Stays
              </button>
              <button 
                  type="button"
                  className={`relative z-10 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold tracking-tight transition-colors duration-300 ${activeTab === 'experiences' ? 'text-[#18181b]' : 'text-[#5e687a] hover:text-[#18181b]'}`}
                  onClick={() => {
                      uiAudio.playClick();
                      if (navigator.vibrate) navigator.vibrate(10);
                      onExperiencesClick?.();
                  }}
              >
                  {activeTab === 'experiences' && (
                    <motion.div
                      layoutId="activeMobileHeaderPill"
                      className="absolute inset-0 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08)] -z-10"
                      transition={{ type: "spring", stiffness: 380, damping: 25 }}
                    />
                  )}
                  Experiences
              </button>
            </div>

            {/* Menu trigger using the 3-line MenuIcon in top right, styled matching Stays/Experiences */}
            <button
              onClick={() => {
                  uiAudio.playClick();
                  if (navigator.vibrate) navigator.vibrate(10);
                  onProfileClick?.();
              }}
              className="w-9 h-9 rounded-full bg-[#F4F4F6] hover:bg-[#E9EBED] active:scale-95 transition-all flex items-center justify-center relative justify-self-end border border-gray-200/5 shadow-sm"
            >
              <MenuIcon className="w-4.5 h-4.5 text-[#5e687a] stroke-[2.5]" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#e51d53] border border-white animate-pulse" />
              )}
            </button>
          </div>
        
          {/* 1. Brand: ENCHO Space (Desktop only) */}
          <div 
            onClick={() => {
                setInputValue('');
                onSearch('Berlin'); // Reset to default/home
            }}
            className="hidden md:flex flex-col justify-center leading-none cursor-pointer group shrink-0 select-none md:min-w-[120px]"
          >
            <div className="flex items-baseline font-black leading-none transition-colors">
              <span className="text-xl md:text-2xl font-black tracking-tight text-[#0F172A] group-hover:text-[#0284C7] transition-colors duration-300">ENCHO</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7] ml-0.5 transition-transform duration-300 group-hover:scale-125" />
            </div>
            <span className="text-[8px] md:text-[9.5px] font-black tracking-[0.45em] text-[#8e8e93] uppercase leading-none mt-1.5 group-hover:text-[#5e687a] transition-colors">
              SPACE
            </span>
          </div>

         {/* 2. Center Content - Varies by Mode */}
         {appMode === 'travel' ? (
           <div className="flex-1 flex flex-col justify-center items-center max-w-2xl relative w-full">
             <div className="hidden md:flex bg-[#F4F4F6] p-0.5 rounded-full mb-3 md:mb-4 relative border border-gray-200/10">
                 <button 
                     type="button"
                     className={`relative z-10 px-5.5 py-2.5 rounded-full text-xs md:text-sm font-extrabold tracking-tight transition-colors duration-300 ${activeTab === 'stays' ? 'text-[#18181b]' : 'text-[#5e687a] hover:text-[#18181b]'}`}
                     onClick={() => {
                         uiAudio.playClick();
                         if (navigator.vibrate) navigator.vibrate(10);
                         onStaysClick?.();
                     }}
                 >
                     {activeTab === 'stays' && (
                       <motion.div
                         layoutId="activeDesktopHeaderPill"
                         className="absolute inset-0 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.06)] -z-10"
                         transition={{ type: "spring", stiffness: 380, damping: 25 }}
                       />
                     )}
                     Stays
                 </button>
                 <button 
                     type="button"
                     className={`relative z-10 px-5.5 py-2.5 rounded-full text-xs md:text-sm font-extrabold tracking-tight transition-colors duration-300 ${activeTab === 'experiences' ? 'text-[#18181b]' : 'text-[#5e687a] hover:text-[#18181b]'}`}
                     onClick={() => {
                         uiAudio.playClick();
                         if (navigator.vibrate) navigator.vibrate(10);
                         onExperiencesClick?.();
                     }}
                 >
                     {activeTab === 'experiences' && (
                       <motion.div
                         layoutId="activeDesktopHeaderPill"
                         className="absolute inset-0 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.06)] -z-10"
                         transition={{ type: "spring", stiffness: 380, damping: 25 }}
                       />
                     )}
                     Experiences
                 </button>
             </div>
             
             <form 
               ref={searchRef}
               onSubmit={handleSubmit} 
               className={`
                 relative w-full flex items-center bg-white border border-gray-200 rounded-full transition-all duration-300 group z-50
                 ${isFocused 
                   ? 'h-14 shadow-lg border-gray-300 ring-4 ring-[#0284C7]/10 scale-[1.02]' 
                   : 'h-12 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border-gray-200 hover:shadow-md hover:border-gray-300'}
               `}
             >
                <div className="flex-1 pl-5 md:pl-7 flex items-center">
                  {/* Visual Icon inside Input */}
                  {isFocused && (
                       <SearchIcon className="w-4 h-4 text-gray-400 mr-3 animate-fade-in" />
                  )}
                  
                  <input
                      type="text"
                      value={inputValue}
                      onFocus={() => setIsFocused(true)}
                      onChange={(e) => setInputValue(e.target.value)}
                      className="w-full bg-transparent border-none text-sm md:text-base font-medium text-gray-900 placeholder-gray-500 focus:ring-0 outline-none truncate"
                      placeholder="Search destinations"
                  />
                  
                  {/* Clear Button */}
                  {inputValue && isFocused && (
                      <button 
                          type="button" 
                          onClick={() => setInputValue('')}
                          className="p-1 rounded-full hover:bg-gray-100 text-gray-400 mr-2"
                      >
                          <XIcon className="w-4 h-4" />
                      </button>
                  )}
                </div>
                
                {/* Search Button / Controls */}
                <div className="pr-1.5 flex items-center gap-2">
                    <button
                      type="submit"
                      className={`
                        bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-full 
                        transition-all duration-300 shadow-sm active:scale-95 flex items-center justify-center
                        ${isFocused ? 'p-3' : 'p-2.5'}
                      `}
                    >
                      <SearchIcon className={isFocused ? 'w-5 h-5' : 'w-4 h-4'} />
                    </button>
                </div>

                {/* SEARCH DROPDOWN - The Core of the Redesign */}
                {isFocused && (
                    <div className="absolute top-full left-0 w-full mt-3 bg-white rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden animate-fade-in-up origin-top z-[100]">
                        <div className="p-2">
                            
                            {/* Section: Nearby (Only when input is empty) */}
                            {inputValue.trim() === '' && (
                              <div className="mb-2">
                                  <div 
                                      onClick={(e) => { uiAudio.playClick(); handleSubmit(e, 'Nearby'); }}
                                      className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer group transition-colors"
                                  >
                                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-700 group-hover:bg-black group-hover:text-white transition-colors">
                                          <NavigationIcon className="w-6 h-6" />
                                      </div>
                                      <div>
                                          <div className="font-bold text-gray-900">Explore nearby</div>
                                          <div className="text-xs text-gray-500">Based on your current location</div>
                                      </div>
                                  </div>
                              </div>
                            )}

                            {/* Section: Suggestions */}
                            <div className="pb-2">
                                {inputValue.trim() === '' && recentSearches.length > 0 && (
                                    <>
                                        <div className="px-4 py-2 mt-2 text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                                            <span>Recent Searches</span>
                                            <button 
                                              type="button"
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  setRecentSearches([]);
                                                  localStorage.removeItem('recentSearches');
                                              }}
                                              className="text-[10px] text-gray-400 hover:text-gray-900 underline"
                                            >
                                              Clear
                                            </button>
                                        </div>
                                        {recentSearches.map((city) => (
                                            <div 
                                              key={`recent-${city}`}
                                              onClick={(e) => { uiAudio.playClick(); handleSubmit(e, city); }}
                                              className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer group transition-colors"
                                            >
                                                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm group-hover:text-gray-900 transition-all border border-transparent group-hover:border-gray-100">
                                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </div>
                                                <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                    {city}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}

                                <div className="px-4 py-2 mt-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    {inputValue.trim() === '' ? 'Popular Destinations' : 'Similar Places'}
                                </div>
                                
                                {inputValue.trim() === '' ? (
                                    POPULAR_CITIES.map((city) => (
                                        <div 
                                          key={city}
                                          onClick={(e) => { uiAudio.playClick(); handleSubmit(e, city); }}
                                          className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer group transition-colors"
                                        >
                                            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm group-hover:text-gray-900 transition-all border border-transparent group-hover:border-gray-100">
                                                <MapIcon className="w-5 h-5" />
                                            </div>
                                            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                {city}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        {predictions.map((prediction) => (
                                            <div 
                                              key={prediction.place_id}
                                              onClick={(e) => { uiAudio.playClick(); handleSubmit(e, prediction.structured_formatting.main_text); }}
                                              className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer group transition-colors"
                                            >
                                                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm group-hover:text-gray-900 transition-all border border-transparent group-hover:border-gray-100">
                                                    <MapIcon className="w-5 h-5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                        {prediction.structured_formatting.main_text}
                                                    </div>
                                                    <div className="text-[11px] text-gray-400">
                                                        {prediction.structured_formatting.secondary_text}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {predictions.length === 0 && inputValue.length >= 2 && (
                                            <div className="p-4 text-center text-gray-500 text-sm">
                                                No places found for "{inputValue}"
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </form>
            
            {/* Overlay to dim background when focused */}
            {isFocused && (
              <div className="fixed inset-0 top-20 bg-white/60 backdrop-blur-sm z-[-1] animate-fade-in"></div>
            )}
          </div>
        ) : (
          <div className="flex-1 hidden md:flex justify-center max-w-2xl gap-8 font-semibold text-gray-500">
            <button 
              onClick={() => onHostViewChange?.('today')} 
              className={`hover:text-gray-900 transition-colors ${hostView === 'today' ? 'text-gray-900 border-b-2 border-gray-900' : ''}`}
            >
              Today
            </button>
            <button 
              onClick={() => onHostViewChange?.('calendar')} 
              className={`hover:text-gray-900 transition-colors ${hostView === 'calendar' ? 'text-gray-900 border-b-2 border-gray-900' : ''}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => onHostViewChange?.('listings')} 
              className={`hover:text-gray-900 transition-colors ${hostView === 'listings' ? 'text-gray-900 border-b-2 border-gray-900' : ''}`}
            >
              Listings
            </button>
            <button 
              onClick={() => onHostViewChange?.('messages')} 
              className={`hover:text-gray-900 transition-colors ${hostView === 'messages' ? 'text-gray-900 border-b-2 border-gray-900' : ''}`}
            >
              Messages
            </button>
            <button 
              onClick={() => onHostViewChange?.('analytics')} 
              className={`hover:text-gray-900 transition-colors ${hostView === 'analytics' ? 'text-gray-900 border-b-2 border-gray-900' : ''}`}
            >
              Analytics
            </button>
          </div>
        )}

        {/* 3. Right Actions: Wishlist, Reserves & Accounts */}
        <div className="flex items-center justify-end gap-2 shrink-0 md:min-w-[120px]">
          
          {!isOnline && (
              <div title="Offline Mode" className="flex items-center text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-3 py-1.5 mr-1 gap-1.5 animate-pulse">
                   <WifiOffIcon className="w-3.5 h-3.5" />
                   <span className="hidden md:inline">Offline</span>
              </div>
          )}

          {isInstallable && (
            <button 
                onClick={() => { uiAudio.playClick(); promptInstall(); }} 
                className="hidden md:flex items-center gap-2 font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full transition-colors mr-1 group"
                title="Install App"
            >
                <DownloadIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Install</span>
            </button>
          )}

          <div className="hidden md:block"><CurrencySelector /></div>

          {/* Mode Switch Button */}
          {user && appMode === 'travel' && (
             <button onClick={() => { uiAudio.playClick(); onModeSwitch?.('host'); }} className="hidden md:block font-semibold text-sm text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-full transition-colors mr-1">Switch to hosting</button>
          )}
          {user && appMode === 'host' && (
             <button onClick={() => { uiAudio.playClick(); onModeSwitch?.('travel'); }} className="hidden md:block font-semibold text-sm text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-full transition-colors mr-1">Switch to travelling</button>
          )}

          {/* Reserves - Hidden on Mode host or Mobile */}
          {appMode === 'travel' && (
              <button 
                onClick={() => { uiAudio.playPop(); onReservesClick(); }}
                className={`
                    relative hidden md:flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-all duration-500
                    ${highlightReserves 
                        ? 'text-[#0284C7] bg-pink-100 scale-105 shadow-md ring-2 ring-pink-200' 
                        : 'text-gray-500 hover:text-[#0284C7] hover:bg-pink-50'}
                `}
              >
                  <CalendarIcon className={`w-5 h-5 transition-transform duration-500 ${highlightReserves ? 'animate-bounce' : ''}`} />
                  <span className="hidden lg:inline">Reserves</span>
                  {reservesCount > 0 && (
                      <span className={`absolute top-1 right-2 lg:top-0 lg:right-0 bg-[#0284C7] text-white text-[10px] font-bold px-1.5 h-4 rounded-full flex items-center justify-center transition-transform ${highlightReserves ? 'scale-125' : 'scale-100'}`}>
                          {reservesCount}
                      </span>
                  )}
              </button>
          )}

          {/* Messages - Hidden on Mobile */}
          {user && (
              <button 
                onClick={() => { uiAudio.playPop(); onInboxClick?.(); }}
                className="relative hidden md:flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-all duration-300 text-gray-500 hover:text-black hover:bg-gray-100"
              >
                  <MessageCircleIcon className="w-5 h-5" />
                  <span className="hidden lg:inline">Inbox</span>
                  {unreadCount > 0 && (
                      <span className="absolute top-1 right-2 lg:top-0 lg:right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 h-4 rounded-full flex items-center justify-center">
                          {unreadCount}
                      </span>
                  )}
              </button>
          )}

          {/* Wishlist - Hidden on Mode host or Mobile */}
          {appMode === 'travel' && (
              <button 
                onClick={() => { uiAudio.playPop(); onWishlistClick(); }}
                className={`
                    relative hidden md:flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-all duration-300
                    ${highlightWishlist 
                        ? 'text-pink-600 bg-pink-50 scale-105 shadow-sm' 
                        : 'text-gray-500 hover:text-[#0284C7] hover:bg-pink-50'}
                `}
              >
                  <HeartIcon className={`w-5 h-5 transition-transform duration-500 ${highlightWishlist ? 'fill-current animate-pulse' : ''}`} />
                  <span className="hidden lg:inline">Wishlist</span>
                  {wishlistCount > 0 && (
                      <span className={`absolute top-1 right-2 lg:top-0 lg:right-0 bg-pink-500 text-white text-[10px] font-bold px-1.5 h-4 rounded-full flex items-center justify-center transition-transform ${highlightWishlist ? 'scale-125' : 'scale-100'}`}>
                          {wishlistCount}
                      </span>
                  )}
              </button>
          )}

          {/* Desktop Account Dropdown */}
          <div ref={desktopMenuRef} className="relative hidden md:block">
            <div 
                onClick={() => setIsDesktopMenuOpen(!isDesktopMenuOpen)}
                className="flex items-center gap-2 border border-gray-200 rounded-full p-1 pl-3 hover:shadow-md transition-all cursor-pointer bg-white ml-2"
            >
                <div className="w-4 h-4 text-gray-600">
                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" style={{display: 'block', height: '16px', width: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 3}}><g><path d="m2 16h28"></path><path d="m2 24h28"></path><path d="m2 8h28"></path></g></svg>
                </div>
                <div className="w-8 h-8 bg-gray-800 rounded-full text-white flex items-center justify-center overflow-hidden">
                   <UserIcon className="w-5 h-5" />
                </div>
            </div>

            {/* Desktop Menu Dropdown */}
            {isDesktopMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden animate-fade-in-up origin-top-right z-50">
                    <div className="p-2 border-b border-gray-100">
                        {user ? (
                           <>
                             <div className="p-3 font-semibold text-gray-900 border-b border-gray-50">{user.name} ({user.role})</div>
                             {user.role === 'admin' && (
                                <div onClick={() => { setIsDesktopMenuOpen(false); window.location.hash = '#admin'; }} className="p-3 font-medium text-[#0284C7] hover:bg-gray-50 rounded-xl cursor-pointer">Admin Dashboard</div>
                             )}
                             <div onClick={() => { setIsDesktopMenuOpen(false); logout(); }} className="p-3 font-medium text-gray-700 hover:bg-gray-50 rounded-xl cursor-pointer">Log out</div>
                           </>
                        ) : (
                           <>
                             <div onClick={() => { setIsDesktopMenuOpen(false); onLoginClick(); }} className="p-3 font-semibold text-gray-900 hover:bg-gray-50 rounded-xl cursor-pointer">Log in</div>
                             <div onClick={() => { setIsDesktopMenuOpen(false); onLoginClick(); }} className="p-3 font-medium text-gray-700 hover:bg-gray-50 rounded-xl cursor-pointer">Sign up</div>
                           </>
                        )}
                    </div>
                    <div className="p-2 border-b border-gray-100">
                         <div onClick={() => { setIsDesktopMenuOpen(false); onHostClick(); }} className="p-3 font-medium text-gray-700 hover:bg-gray-50 rounded-xl cursor-pointer">Host your space</div>
                         <div className="p-3 font-medium text-gray-700 hover:bg-gray-50 rounded-xl cursor-pointer">Help Center</div>
                    </div>
                    <div className="p-2">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Contact Us</div>
                        {whatsappConfig?.enabled && whatsappConfig?.number && (
                          <div onClick={() => window.open(`https://wa.me/${whatsappConfig.number}`, '_blank')} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                              <MessageCircleIcon className="w-5 h-5 text-green-600" />
                              <span className="text-sm font-medium text-gray-700">WhatsApp</span>
                          </div>
                        )}
                        {callConfig?.enabled && callConfig?.number && (
                          <div onClick={() => window.open(`tel:${callConfig.number}`, '_self')} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                              <PhoneIcon className="w-5 h-5 text-gray-600" />
                              <span className="text-sm font-medium text-gray-700">Call Support</span>
                          </div>
                        )}
                         <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                            <MailIcon className="w-5 h-5 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Email</span>
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>

      </header>

      </>
  );
};

export default Header;
