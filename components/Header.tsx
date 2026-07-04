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
    onStaysClick
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
    if (!inputValue || inputValue.trim() === '' || inputValue.length < 2 || !placesLibrary) {
       
       setPredictions([]);
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
       setPredictions([]);
           }
       }).catch((err: any) => {
           console.warn('AutocompleteSuggestion failed, trying legacy:', err);
           fallbackToLegacy();
       });
    } else {
       fallbackToLegacy();
    }

    function fallbackToLegacy() {
      if (!autocompleteService) return;
      autocompleteService.getPlacePredictions({
         input: inputValue,
         sessionToken,
         types: ['(cities)']
      }, (results, status) => {
         if (status === google.maps.places.PlacesServiceStatus.OK && results) {
             setPredictions(results);
         } else {
       setPredictions([]);
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
        <div className="max-w-[1920px] mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-3 md:gap-4 relative">
        
        {/* 1. Brand: ENCHO Space */}
        <div 
          onClick={() => {
              setInputValue('');
              onSearch('Berlin'); // Reset to default/home
          }}
          className="flex flex-col justify-center leading-none cursor-pointer group shrink-0 select-none md:min-w-[120px]"
        >
             <div className="flex items-center gap-1.5">
                 <img src="/logo.svg" alt="Encho Space Logo" className="w-6 h-6 md:w-8 md:h-8" />
                 <div className="flex flex-col">
                     <span className="font-black text-xl md:text-2xl tracking-tighter text-gray-900 group-hover:text-[#0284C7] transition-colors leading-none">ENCHO</span>
                     <span className="text-[8px] md:text-[9px] font-bold tracking-[0.35em] text-gray-400 uppercase ml-0.5 group-hover:text-gray-600 transition-colors">Space</span>
                 </div>
             </div>
        </div>

        {/* 2. Center Content - Varies by Mode */}
        {appMode === 'travel' ? (
          <div className="flex-1 flex flex-col justify-center items-center max-w-2xl relative">
             <div className="flex bg-gray-100/80 backdrop-blur-md p-1 rounded-full mb-3 md:mb-4">
                 <button 
                     type="button"
                     className={`px-5 py-2 rounded-full text-sm md:text-base font-semibold transition-all duration-300 ${activeTab === 'stays' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                     onClick={onStaysClick}
                 >
                     Stays
                 </button>
                 <button 
                     type="button"
                     className={`px-5 py-2 rounded-full text-sm md:text-base font-semibold transition-all duration-300 ${activeTab === 'experiences' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                     onClick={onExperiencesClick}
                 >
                     Experiences
                 </button>
             </div>
             
             <form 
               ref={searchRef}
               onSubmit={handleSubmit} 
               className={`
                 relative w-full flex items-center bg-white border rounded-full transition-all duration-300 group z-50
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

          <CurrencySelector />

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

          {/* Mobile Menu Icon - Trigger for Side Drawer */}
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className={`
                md:hidden relative p-2 rounded-full transition-all duration-500
                ${(highlightReserves || highlightWishlist) ? 'bg-pink-50 text-[#0284C7] scale-110 shadow-md' : 'text-gray-900 hover:bg-gray-100'}
            `}
          >
              <MenuIcon className={`w-6 h-6 transition-transform duration-500 ${(highlightReserves || highlightWishlist) ? 'rotate-12' : ''}`} />
              {(reservesCount + wishlistCount) > 0 && appMode === 'travel' && (
                   <span className="absolute top-1.5 right-1.5 bg-[#0284C7] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                      {reservesCount + wishlistCount}
                   </span>
              )}
          </button>

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

      {/* MOBILE SIDE DRAWER (Advanced UI) */}
      {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[250] md:hidden">
              {/* Backdrop */}
              <div 
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={() => setIsMobileMenuOpen(false)}
              ></div>
              
              {/* Drawer Panel */}
              <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-[360px] bg-white shadow-2xl animate-slide-in-right flex flex-col">
                  
                  {/* Drawer Header */}
                  <div className="flex items-center justify-between p-6 border-b border-gray-100">
                      <div className="flex flex-col justify-center leading-none select-none">
                        <div className="flex items-center gap-1.5">
                            <img src="/logo.svg" alt="Encho Space Logo" className="w-6 h-6" />
                            <div className="flex flex-col">
                                <span className="font-black text-xl tracking-tighter text-gray-900 leading-none">ENCHO</span>
                                <span className="text-[8px] font-bold tracking-[0.35em] text-gray-400 uppercase ml-0.5">Space</span>
                            </div>
                        </div>
                     </div>
                     <button 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                     >
                         <XIcon className="w-5 h-5 text-gray-600" />
                     </button>
                  </div>

                  {/* Drawer Body - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
                      
                      {/* Account Actions */}
                      <div className="grid grid-cols-2 gap-3">
                        {isInstallable && (
                           <button onClick={() => { setIsMobileMenuOpen(false); promptInstall(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform col-span-2">
                               <DownloadIcon className="w-6 h-6 text-gray-700 mb-2" />
                               <span className="font-bold text-gray-900 text-sm">Install App</span>
                           </button>
                        )}
                        {user ? (
                           <>
                            <button onClick={() => { setIsMobileMenuOpen(false); logout(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform col-span-2">
                                <span className="font-bold text-gray-900 text-sm">Log out ({user.name})</span>
                            </button>
                            {user.role === 'admin' && (
                                <button onClick={() => { setIsMobileMenuOpen(false); window.location.hash = '#admin'; }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-[#0284C7] text-white active:scale-95 transition-transform col-span-2 shadow-md">
                                    <span className="font-bold text-sm">Admin Dashboard</span>
                                </button>
                            )}
                           </>
                        ) : (
                           <>
                            <button onClick={() => { setIsMobileMenuOpen(false); onLoginClick(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform">
                                <LogInIcon className="w-6 h-6 text-gray-700 mb-2" />
                                <span className="font-bold text-gray-900 text-sm">Log in</span>
                            </button>
                            <button onClick={() => { setIsMobileMenuOpen(false); onLoginClick(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-900 text-white active:scale-95 transition-transform shadow-md">
                                <UserIcon className="w-6 h-6 mb-2" />
                                <span className="font-bold text-sm">Sign up</span>
                            </button>
                           </>
                        )}
                      </div>

                      {/* Hero: Become a Host */}
                      <div onClick={() => { setIsMobileMenuOpen(false); onHostClick(); }} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0284C7] to-orange-500 text-white p-6 shadow-lg active:scale-[0.98] transition-transform cursor-pointer">
                          <div className="relative z-10">
                              <h3 className="font-bold text-xl mb-1">Become a Host</h3>
                              <p className="text-white/90 text-sm font-medium mb-3">Earn extra income by renting out your space.</p>
                              <div className="bg-white/20 backdrop-blur-md self-start inline-block px-3 py-1.5 rounded-lg text-xs font-bold">List your space</div>
                          </div>
                          <HouseIcon className="absolute -bottom-4 -right-4 w-24 h-24 text-white/10" />
                      </div>

                      {/* Navigation Links */}
                      <div className="space-y-1">
                          <div 
                             onClick={() => { setIsMobileMenuOpen(false); onReservesClick(); }}
                             className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                          >
                              <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center text-[#0284C7]">
                                  <CalendarIcon className="w-5 h-5" />
                              </div>
                              <span className="font-semibold text-gray-700">Reservations</span>
                          </div>
                          
                          {user && onInboxClick && (
                              <div 
                                 onClick={() => { setIsMobileMenuOpen(false); onInboxClick(); }}
                                 className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                              >
                                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-700 relative">
                                      <MessageCircleIcon className="w-5 h-5" />
                                      {unreadCount > 0 && (
                                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                              {unreadCount}
                                          </span>
                                      )}
                                  </div>
                                  <span className="font-semibold text-gray-700">Messages</span>
                              </div>
                          )}

                          <div 
                             onClick={() => { setIsMobileMenuOpen(false); onWishlistClick(); }}
                             className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                          >
                              <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center text-[#0284C7]">
                                  <HeartIcon className="w-5 h-5" />
                              </div>
                              <span className="font-semibold text-gray-700">Wishlist</span>
                          </div>
                      </div>

                      {/* Contact Section */}
                      <div className="mt-auto pt-6 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Contact & Support</h4>
                          <div className="space-y-3">
                              {whatsappConfig?.enabled && whatsappConfig?.number && (
                                <button onClick={() => window.open(`https://wa.me/${whatsappConfig.number}`, '_blank')} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                                    <MessageCircleIcon className="w-5 h-5" />
                                    <div className="flex flex-col items-start">
                                        <span className="text-xs font-semibold opacity-70">WhatsApp</span>
                                        <span className="font-bold">Message Us</span>
                                    </div>
                                </button>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                  {callConfig?.enabled && callConfig?.number && (
                                    <button onClick={() => window.open(`tel:${callConfig.number}`, '_self')} className="flex items-center justify-center gap-2 p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors">
                                        <PhoneIcon className="w-4 h-4" />
                                        <span className="font-semibold text-sm">Call</span>
                                    </button>
                                  )}
                                  <button className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors ${!(callConfig?.enabled && callConfig?.number) ? 'col-span-2' : ''}`}>
                                      <MailIcon className="w-4 h-4" />
                                      <span className="font-semibold text-sm">Email</span>
                                  </button>
                              </div>
                          </div>
                      </div>

                  </div>
              </div>
          </div>
      )}

    </>
  );
};

export default Header;
