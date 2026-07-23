/// <reference types="@types/google.maps" />

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { uiAudio } from './audio';
import { Listing } from '../types';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useCurrency } from './CurrencyContext';
import { 
  MapPin, 
  Search, 
  SlidersHorizontal, 
  Heart, 
  Star, 
  Compass, 
  MessageCircle, 
  User, 
  X, 
  ChevronLeft,
  Check,
  Building,
  Home,
  Tent,
  Hotel
} from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MapSidebarProps {
  listings: Listing[];
  highlightedId: string | null;
  className?: string;
  onBoundsChanged?: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number}) => void;
  onClose?: () => void;
  city?: string;
  onSearch?: (searchCity: string) => void;
  onToggleFavorite?: (listing: Listing) => void;
  isFavorite?: (id: string | number) => boolean;
  onSelectListing?: (listing: Listing) => void;
  onNavigate?: (view: any) => void;
  currentView?: string;
}

const getListingCoords = (listing: any, index: number, city: string) => {
  const norm = (city || '').toLowerCase();
  const isYogya = norm.includes('yogyakarta') || norm.includes('jogja') || norm.includes('yogy');
  
  if (isYogya) {
    const coords = [
      { x: 570, y: 380 }, // On Gg. Kepel (our prime property from screenshot!)
      { x: 450, y: 520 }, // Near Jl. Dipokusuman & Jl. Brigjen Katamso intersection
      { x: 230, y: 480 }, // On Jl. Dipokusuman left
      { x: 450, y: 260 }, // On Jl. Brigjen Katamso north
      { x: 580, y: 640 }, // On Gg. Wiyono
      { x: 740, y: 720 }, // On Jl. Keparakan
      { x: 450, y: 780 }, // On Jl. Brigjen Katamso south
    ];
    return coords[index % coords.length];
  }
  
  // Other cities: deterministic grid
  const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = 250 + (hash % 500); // spread across 250 - 750
  const y = 250 + ((hash * 23) % 500); // spread across 250 - 750
  return { x, y };
};

const getStreetNames = (city: string) => {
  const norm = (city || '').toLowerCase();
  if (norm.includes('yogyakarta') || norm.includes('jogja') || norm.includes('yogy')) {
    return {
      mainNS: 'JL. BRIGJEN KATAMSO',
      sideNS: 'JL. PANEMBAHAN',
      mainEW: 'JL. DIPOKUSUMAN',
      topEW: 'JL. IREDA',
      bottomEW: 'JL. PRAWIROTAMAN',
      alley1: 'Gg. Garuda',
      alley2: 'Gg. Kurma',
      alley3: 'Gg. Kepel',
      alley4: 'Gg. Kates',
      alley5: 'Gg. Wiyono',
      sideNS2: 'Jl. Keparakan'
    };
  } else if (norm.includes('bengaluru') || norm.includes('bangalore')) {
    return {
      mainNS: 'MG ROAD',
      sideNS: 'INDIRANAGAR LANE',
      mainEW: 'KORAMANGALA BLVD',
      topEW: 'HAL OLD AIRPORT ROAD',
      bottomEW: 'OUTER RING ROAD',
      alley1: '100 Feet Rd',
      alley2: '80 Feet Rd',
      alley3: 'Lavelle Road',
      alley4: 'Residency Rd',
      alley5: 'Richmond Rd',
      sideNS2: 'Cubbon Park Road'
    };
  } else {
    const upperCity = (city || 'Yogyakarta').toUpperCase();
    return {
      mainNS: `${upperCity} BLVD`,
      sideNS: `${upperCity} AVENUE`,
      mainEW: `${upperCity} EXPRESSWAY`,
      topEW: 'HIGH STREET',
      bottomEW: 'RIVER ROAD',
      alley1: 'Lover\'s Lane',
      alley2: 'Market St',
      alley3: 'Main Alley',
      alley4: 'Park Rd',
      alley5: 'Garden St',
      sideNS2: 'Station Road'
    };
  }
};

const markerPrices = new WeakMap<google.maps.marker.AdvancedMarkerElement, number>();

const MarkerWithInfoWindow = ({ 
  listing, 
  isActive, 
  setActiveMarkerId, 
  setMarkerRef,
  isMobile,
  onMarkerClick,
  activePrice
}: { 
  key?: string | number,
  listing: Listing, 
  isActive: boolean, 
  setActiveMarkerId: (id: string | null) => void, 
  setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => void,
  isMobile?: boolean,
  onMarkerClick?: (listing: Listing) => void,
  activePrice?: number
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { formatPrice } = useCurrency();
  const currentPrice = activePrice !== undefined ? activePrice : listing.price;

  useEffect(() => {
    if (marker && setMarkerRef) {
        markerPrices.set(marker, currentPrice);
        setMarkerRef(listing.id, marker);
    }
    return () => {
        if (setMarkerRef) setMarkerRef(listing.id, null);
    };
  }, [marker, listing.id, currentPrice, setMarkerRef]);

  // Generate deterministic lat/lng if not present
  const position = useMemo(() => {
    const lat = listing.lat, lng = listing.lng;
    if (lat && lng && Number(lat) !== 0 && Number(lng) !== 0) return { lat: Number(lat), lng: Number(lng) };
    const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Bangalore center ~ 12.9716, 77.5946
    const fallBackLat = 12.9716 + ((hash % 100) - 50) * 0.002;
    const fallBackLng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
    return { lat: fallBackLat, lng: fallBackLng };
  }, [listing.id, listing.lat, listing.lng]);

  return (
    <>
      <AdvancedMarker 
        ref={markerRef} 
        position={position} 
        onClick={() => {
            uiAudio.playPop();
            if (onMarkerClick) {
                onMarkerClick(listing);
            }
        }}
      >
        {isMobile ? (
            isActive ? (
                // Active custom red pin marker
                <div className="relative flex flex-col items-center justify-center transition-all duration-300 scale-110 z-50">
                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white ring-4 ring-red-500/20 transform animate-bounce duration-[1500ms]">
                        <MapPin className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div className="w-2.5 h-1.5 bg-black/20 rounded-full blur-[2px] mt-1" />
                </div>
            ) : (
                // Inactive custom white/gray badge with price
                <div className="bg-white text-gray-900 border border-gray-150 rounded-full px-2.5 py-1 text-[11px] font-black shadow-[0_4px_10px_rgba(0,0,0,0.12)] hover:scale-110 active:scale-95 transition-all">
                    {formatPrice(currentPrice)}
                </div>
            )
        ) : (
            // Desktop marker
            <div 
              onMouseEnter={() => {
                  if (!isActive) uiAudio.playClick();
                  setActiveMarkerId(listing.id);
              }}
              onMouseLeave={() => setActiveMarkerId(null)}
              className={`
                  relative flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] 
                  transition-all duration-500 ring-1 ring-black/5 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${isActive 
                      ? 'bg-gray-900 text-white px-5 py-2.5 scale-125 z-50 shadow-[0_20px_40px_rgba(0,0,0,0.4)] -translate-y-2 ring-2 ring-white/50' 
                      : 'bg-white text-gray-900 px-3.5 py-1.5 hover:scale-110 hover:shadow-xl z-10'}
              `}
            >
                <span className={`font-bold whitespace-nowrap ${isActive ? 'text-sm' : 'text-xs'}`}>
                    {formatPrice(currentPrice)}
                </span>
            </div>
        )}
      </AdvancedMarker>
    </>
  );
};

const MapInner = ({ 
  listings, 
  highlightedId, 
  onBoundsChanged, 
  setActiveMarkerId, 
  activeMarkerId,
  isMobile,
  onMarkerClick,
  getActivePrice
}: any) => {
    const map = useMap();
    const { formatPrice } = useCurrency();
    const formatPriceRef = useRef(formatPrice);
    
    useEffect(() => {
        formatPriceRef.current = formatPrice;
    }, [formatPrice]);

    const [searchAsIMove, setSearchAsIMove] = useState(true);
    const [markers, setMarkers] = useState<{[key: string]: google.maps.marker.AdvancedMarkerElement}>({});
    const clusterer = useRef<MarkerClusterer | null>(null);

    const setMarkerRef = useCallback((key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => {
        setMarkers((prev) => {
             if (marker && prev[key] === marker) return prev;
             if (!marker && !prev[key]) return prev;
             const next = { ...prev };
             if (marker) next[key] = marker;
             else delete next[key];
             return next;
         });
    }, []);

    useEffect(() => {
        if (!map) return;
        if (!clusterer.current) {
            clusterer.current = new MarkerClusterer({ 
                map,
                renderer: {
                    render: ({ count, position, markers }: any) => {
                        let sum = 0;
                        
                        markers.forEach((marker: any) => {
                            if (markerPrices.has(marker)) {
                                sum += markerPrices.get(marker) || 0;
                            }
                        });
                        
                        const average = count > 0 ? Math.round(sum / count) : 0;
                        const formattedPrice = formatPriceRef.current(average);
                        
                        const div = document.createElement('div');
                        div.className = 'flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.2)] bg-[#0284C7] text-white px-4 py-2 ring-2 ring-white z-50 transition-transform duration-300 hover:scale-110 cursor-pointer';
                        
                        div.innerHTML = `
                           <div class="flex items-center gap-1.5">
                              <span class="font-bold whitespace-nowrap text-sm">${formattedPrice}</span>
                              <span class="text-[10px] font-bold bg-white/25 px-1.5 py-0.5 rounded-full">${count}</span>
                           </div>
                        `;
                        
                        return new google.maps.marker.AdvancedMarkerElement({
                            position,
                            content: div,
                        });
                    }
                }
            });
        }
    }, [map]);

    useEffect(() => {
        if (!clusterer.current) return;
        clusterer.current.clearMarkers();
        clusterer.current.addMarkers(Object.values(markers));
    }, [markers, formatPrice]);
    
    useEffect(() => {
        if (!map) return;
        const listener = map.addListener('idle', () => {
             if (searchAsIMove && onBoundsChanged) {
                 try {
                     const bounds = map.getBounds();
                     if (bounds) {
                          const ne = bounds.getNorthEast();
                          const sw = bounds.getSouthWest();
                          onBoundsChanged({
                             minLat: sw.lat(),
                             maxLat: ne.lat(),
                             minLng: sw.lng(),
                             maxLng: ne.lng()
                          });
                     }
                 } catch (e) {
                     console.warn("Map bounds error, safely ignoring:", e);
                 }
             }
        });
        return () => google.maps.event.removeListener(listener);
    }, [map, searchAsIMove, onBoundsChanged]);
    
    const fitBounds = () => {
        if (!map || !listings || listings.length === 0) return;
        uiAudio.playSuccess();
        const bounds = new google.maps.LatLngBounds();
        listings.forEach((listing: Listing) => {
             let lat = listing.lat, lng = listing.lng;
             if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0)) {
                 const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                 lat = 12.9716 + ((hash % 100) - 50) * 0.002;
                 lng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
             }
             bounds.extend(new google.maps.LatLng(Number(lat), Number(lng)));
        });
        map.fitBounds(bounds, 50); // 50px padding
    };

    // Center on active marker on mobile with an offset to push pin to the top-middle
    useEffect(() => {
        if (!map || !activeMarkerId || !isMobile) return;
        const activeListing = listings.find((l: any) => l.id === activeMarkerId);
        if (activeListing) {
            let lat = activeListing.lat;
            let lng = activeListing.lng;
            if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0)) {
                const hash = String(activeListing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                lat = 12.9716 + ((hash % 100) - 50) * 0.002;
                lng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
            }
            
            // Adjust center slightly south (lower latitude) so that the pin is pushed 
            // upward into the top-half of the viewport, away from the bottom carousel card overlay!
            const targetLat = Number(lat) - 0.0035;
            map.panTo({ lat: targetLat, lng: Number(lng) });
        }
    }, [activeMarkerId, map, listings, isMobile]);
    
    // Fit bounds on first load if we have listings
    const didInitialFit = useRef(false);
    useEffect(() => {
        if (map && listings.length > 0 && !didInitialFit.current) {
             const bounds = new google.maps.LatLngBounds();
             listings.forEach((listing: Listing) => {
                 let lat = listing.lat, lng = listing.lng;
                 if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0)) {
                     const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                     lat = 12.9716 + ((hash % 100) - 50) * 0.002;
                     lng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
                 }
                 bounds.extend(new google.maps.LatLng(Number(lat), Number(lng)));
              });
             map.fitBounds(bounds, 50);
             didInitialFit.current = true;
        }
    }, [map, listings]);
    
    return (
        <>
          {/* Top Floating Control - ONLY on Desktop */}
          {!isMobile && (
             <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 w-full flex justify-center gap-3 px-4 pointer-events-none">
                <label className="pointer-events-auto flex items-center gap-3 bg-white/90 backdrop-blur-xl px-5 py-2.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 cursor-pointer hover:scale-105 transition-all active:scale-95 group select-none">
                   <div className="relative flex items-center justify-center">
                     <input type="checkbox" checked={searchAsIMove} onChange={(e) => { uiAudio.playClick(); setSearchAsIMove(e.target.checked); }} className="peer w-5 h-5 appearance-none border-2 border-gray-300 rounded-md checked:bg-gray-900 checked:border-gray-900 transition-all cursor-pointer" />
                     <svg className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-all scale-50 peer-checked:scale-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                   </div>
                   <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900">Search as I move</span>
                </label>
                <button
                   onClick={fitBounds}
                   className="pointer-events-auto flex items-center justify-center bg-white/90 backdrop-blur-xl p-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 cursor-pointer hover:scale-105 hover:text-gray-900 transition-all active:scale-95 group"
                   title="Focus on listings"
                >
                   <svg className="w-5 h-5 text-gray-700 group-hover:text-gray-900" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                       <circle cx="12" cy="12" r="3"></circle>
                       <path d="M19 12h2"></path>
                       <path d="M3 12h2"></path>
                       <path d="M12 3v2"></path>
                       <path d="M12 19v2"></path>
                   </svg>
                </button>
             </div>
          )}
          
          {listings.map((listing: Listing) => {
               const isActive = isMobile 
                   ? activeMarkerId === listing.id 
                   : (activeMarkerId === listing.id || highlightedId === listing.id);
               return (
                   <MarkerWithInfoWindow 
                       key={listing.id} 
                       listing={listing} 
                       isActive={isActive} 
                       setActiveMarkerId={setActiveMarkerId} 
                       setMarkerRef={setMarkerRef}
                       isMobile={isMobile}
                       onMarkerClick={onMarkerClick}
                       activePrice={getActivePrice ? getActivePrice(listing) : listing.price}
                   />
               );
           })}
        </>
    );
};

const MapSidebar: React.FC<MapSidebarProps> = ({ 
  listings, 
  highlightedId, 
  className = "", 
  onBoundsChanged,
  onClose,
  city = 'Bengaluru',
  onSearch,
  onToggleFavorite,
  isFavorite,
  onSelectListing,
  onNavigate,
  currentView = 'SEARCH'
}) => {
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const activeListing = useMemo(() => {
    return listings.find((l: any) => l.id === activeListingId) || null;
  }, [listings, activeListingId]);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState(city);
  const [showLocalFilters, setShowLocalFilters] = useState(false);
  const [localMinPrice, setLocalMinPrice] = useState<string>('');
  const [localMaxPrice, setLocalMaxPrice] = useState<string>('');
  const [localType, setLocalType] = useState<string>('');
  const { formatPrice } = useCurrency();

  const [selectedRoomIdForListing, setSelectedRoomIdForListing] = useState<{[listingId: string]: string}>({});
  const [isSearchingArea, setIsSearchingArea] = useState(false);

  const getActivePrice = useCallback((listing: Listing) => {
    const selRoomId = selectedRoomIdForListing[listing.id];
    if (selRoomId && listing.rooms) {
      const room = listing.rooms.find(r => r.id === selRoomId);
      if (room) return room.price;
    }
    return listing.price;
  }, [selectedRoomIdForListing]);

  // Handle live indicator when listings filter updates
  useEffect(() => {
    setIsSearchingArea(true);
    const timer = setTimeout(() => setIsSearchingArea(false), 800);
    return () => clearTimeout(timer);
  }, [localType, localMinPrice, localMaxPrice, city]);

  const [mapMode, setMapMode] = useState<'vector' | 'google'>('vector');
  const [googleMapsError, setGoogleMapsError] = useState(false);

  useEffect(() => {
    const originalAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      console.warn("Google Maps failed to load due to authentication/billing restrictions. Switched to Custom Vector Map.");
      setGoogleMapsError(true);
      setMapMode('vector');
      if (originalAuthFailure) originalAuthFailure();
    };
    return () => {
      (window as any).gm_authFailure = originalAuthFailure || null;
    };
  }, []);

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.1);
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const streetNames = useMemo(() => getStreetNames(city), [city]);

  // Center vector map on a specific listing coordinate
  const centerOnListing = useCallback((listing: Listing, index: number, targetZoom?: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const W = rect.width || 800;
    const H = rect.height || 600;
    
    const coords = getListingCoords(listing, index, city);
    const activeZoom = targetZoom !== undefined ? targetZoom : zoom;
    
    // Offset center for mobile bottom card overlays (carousel details + bottom tab overlay)
    const verticalOffset = isMobile ? -140 : 0;
    
    const newX = (W / 2) - (coords.x * activeZoom);
    const newY = (H / 2 + verticalOffset) - (coords.y * activeZoom);
    
    setPanOffset({ x: newX, y: newY });
  }, [zoom, isMobile, city]);

  // Dragging event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mapMode !== 'vector') return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { x: panOffset.x, y: panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || mapMode !== 'vector') return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPanOffset({
      x: panStart.current.x + dx,
      y: panStart.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mapMode !== 'vector') return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStart.current = { x: panOffset.x, y: panOffset.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || mapMode !== 'vector' || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.current.x;
    const dy = e.touches[0].clientY - dragStart.current.y;
    setPanOffset({
      x: panStart.current.x + dx,
      y: panStart.current.y + dy
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (mapMode !== 'vector') return;
    const zoomFactor = 1.1;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(zoom * zoomFactor, 3.0);
    } else {
      nextZoom = Math.max(zoom / zoomFactor, 0.5);
    }
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const mapX = (mouseX - panOffset.x) / zoom;
      const mapY = (mouseY - panOffset.y) / zoom;
      
      const nextX = mouseX - mapX * nextZoom;
      const nextY = mouseY - mapY * nextZoom;
      
      setZoom(nextZoom);
      setPanOffset({ x: nextX, y: nextY });
    } else {
      setZoom(nextZoom);
    }
  };

  const carouselRef = useRef<HTMLDivElement>(null);

  // Sync city prop to search query input
  useEffect(() => {
    if (city) setSearchQuery(city);
  }, [city]);

  // Determine screen size for mobile layouts (breakpoint xl:)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1280);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filter listings locally to reflect quick filters instantly (both desktop and mobile)
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (localMinPrice && listing.price < Number(localMinPrice)) return false;
      if (localMaxPrice && listing.price > Number(localMaxPrice)) return false;
      if (localType) {
        const typeLower = (listing.type || '').toLowerCase();
        const localTypeLower = localType.toLowerCase();
        if (!typeLower.includes(localTypeLower) && !localTypeLower.includes(typeLower)) return false;
      }
      return true;
    });
  }, [listings, localMinPrice, localMaxPrice, localType]);

  // Initialize active listing ID
  useEffect(() => {
    if (listings && listings.length > 0 && !activeListingId) {
      setActiveListingId(listings[0].id);
    }
  }, [listings, activeListingId]);

  // Vector map auto-centering when active listing changes
  useEffect(() => {
    if (mapMode === 'vector' && activeListingId && filteredListings.length > 0) {
      const idx = filteredListings.findIndex(l => l.id === activeListingId);
      if (idx !== -1) {
        const listing = filteredListings[idx];
        centerOnListing(listing, idx);
      }
    }
  }, [activeListingId, mapMode, filteredListings, centerOnListing]);

  // Initial centering on mount or city search change
  useEffect(() => {
    if (mapMode === 'vector' && filteredListings.length > 0) {
      const timer = setTimeout(() => {
        const firstListing = filteredListings[0];
        centerOnListing(firstListing, 0, 1.1);
        setZoom(1.1);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [mapMode, filteredListings, city, centerOnListing]);

  // Scroll to horizontal carousel card with smooth positioning
  const scrollToCard = useCallback((index: number) => {
    const el = carouselRef.current;
    if (!el || !el.children[index]) return;
    const child = el.children[index] as HTMLElement;
    const scrollPos = child.offsetLeft - (el.offsetWidth - child.offsetWidth) / 2;
    el.scrollTo({ left: scrollPos, behavior: 'smooth' });
  }, []);

  // Sync horizontal swiping to active listing ID
  const onCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.offsetWidth / 2;
    let closestIndex = 0;
    let closestDist = Infinity;
    
    const children = el.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(center - childCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    
    const listing = filteredListings[closestIndex];
    if (listing && activeListingId !== listing.id) {
      setActiveListingId(listing.id);
    }
  }, [filteredListings, activeListingId]);

  // Bidirectional link: Marker click centers horizontal carousel on the card
  const handleMarkerClick = useCallback((listing: Listing) => {
    const index = filteredListings.findIndex(l => l.id === listing.id);
    if (index !== -1) {
      setActiveListingId(listing.id);
      scrollToCard(index);
    }
  }, [filteredListings, scrollToCard]);

  // Trigger search city submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
    }
  };

  return (
    <div className={`relative bg-gray-50 isolate overflow-hidden ${isMobile ? 'fixed inset-0 z-[150] w-screen h-[100dvh] flex flex-col' : 'shadow-inner ' + className}`}>
        
        {/* MOBILE FLOATING TOP ROW & CONTROLS */}
        {isMobile && (
          <div className="absolute top-4 left-0 right-0 z-[110] px-4 flex flex-col gap-3 pointer-events-none">
             {/* Row 1: Back Button, Location Pill, Filter Button */}
             <div className="flex items-center justify-between w-full">
                <button 
                  onClick={() => {
                    uiAudio.playClick();
                    if (onClose) onClose();
                  }}
                  className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:text-gray-900 active:scale-95 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-5 h-11 rounded-full shadow-lg border border-gray-100 flex items-center justify-center gap-1.5 text-xs font-extrabold text-gray-800">
                  <MapPin className="w-3.5 h-3.5 text-red-500 fill-red-100" />
                  <span>{city || 'Yogyakarta, id'}</span>
                </div>

                <button 
                  onClick={() => {
                    uiAudio.playClick();
                    setShowLocalFilters(true);
                  }}
                  className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:text-gray-900 active:scale-95 transition-all cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
             </div>

             {/* Row 2: Search Input Card */}
             <div className="pointer-events-auto w-full bg-white/95 backdrop-blur-md h-12 rounded-2xl flex items-center px-4 shadow-lg border border-gray-100/50">
               <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center">
                 <Search className="w-4 h-4 text-gray-400 mr-2.5 shrink-0" />
                 <input 
                   type="text"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder="Search destinations..."
                   className="w-full bg-transparent border-none text-xs font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 outline-none"
                 />
               </form>
             </div>

             {/* Row 3: Map Mode Selector (Only shown if key is valid) */}
             {hasValidKey && !googleMapsError && (
               <div className="pointer-events-auto self-center flex p-1 bg-white/95 backdrop-blur-md rounded-full shadow-lg border border-gray-100/50">
                 <button 
                   type="button"
                   onClick={() => { uiAudio.playClick(); setMapMode('vector'); }}
                   className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all uppercase tracking-wider ${mapMode === 'vector' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                 >
                   Scenic Map
                 </button>
                 <button 
                   type="button"
                   onClick={() => { uiAudio.playClick(); setMapMode('google'); }}
                   className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all uppercase tracking-wider ${mapMode === 'google' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                 >
                   Satellite Map
                 </button>
               </div>
             )}
          </div>
        )}

        {/* DESKTOP FLOATING CONTROLS (MODE SELECTOR, RE-CENTER) */}
        {!isMobile && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 pointer-events-none">
             {/* Map Mode Selector */}
             {hasValidKey && !googleMapsError && (
               <div className="pointer-events-auto flex p-1 bg-white/95 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50">
                 <button 
                   type="button"
                   onClick={() => { uiAudio.playClick(); setMapMode('vector'); }}
                   className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${mapMode === 'vector' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
                 >
                   Scenic Map
                 </button>
                 <button 
                   type="button"
                   onClick={() => { uiAudio.playClick(); setMapMode('google'); }}
                   className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${mapMode === 'google' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
                 >
                   Satellite Map
                 </button>
               </div>
             )}

             {/* Focus Listings / Re-center Button */}
             <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  if (mapMode === 'vector') {
                    if (filteredListings.length > 0) {
                      centerOnListing(filteredListings[0], 0, 1.1);
                      setZoom(1.1);
                    }
                  } else {
                    // Fit bounds on google map (triggers window event inside MapInner)
                    const el = document.getElementById('fit-bounds-trigger');
                    if (el) el.click();
                  }
                }}
                className="pointer-events-auto flex items-center justify-center bg-white/95 backdrop-blur-md p-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 cursor-pointer hover:scale-105 hover:text-gray-900 transition-all active:scale-95 group"
                title="Focus on listings"
             >
                <svg className="w-5 h-5 text-gray-700 group-hover:text-gray-900" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19 12h2"></path>
                    <path d="M3 12h2"></path>
                    <path d="M12 3v2"></path>
                    <path d="M12 19v2"></path>
                </svg>
             </button>
          </div>
        )}

        {/* MAP STAGE AND CANVAS AREA */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-100">
          {mapMode === 'vector' ? (
            /* SCENIC VECTOR MAP ENGINE */
            <div 
               ref={containerRef}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
               onTouchStart={handleTouchStart}
               onTouchMove={handleTouchMove}
               onTouchEnd={handleTouchEnd}
               onWheel={handleWheel}
               className={`w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing bg-[#f4f4f5]`}
            >
               {/* Vector Map Canvas Stage */}
               <div 
                  className="absolute inset-0 w-[1000px] h-[1000px] origin-top-left"
                  style={{ 
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                    transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
               >
                   {/* Beautiful Cartographic SVG Vector Streets */}
                   <svg viewBox="0 0 1000 1000" className="w-full h-full pointer-events-none">
                      {/* Waterbodies (River/Ocean) */}
                      <path d="M 850,0 Q 750,300 850,600 T 780,1000" fill="none" stroke="#bae6fd" strokeWidth="52" strokeLinecap="round" opacity="0.6" />
                      <path d="M 850,0 Q 750,300 850,600 T 780,1000" fill="none" stroke="#e0f2fe" strokeWidth="38" strokeLinecap="round" opacity="0.8" />
                      
                      {/* Green Central Park */}
                      <rect x="150" y="320" width="130" height="150" rx="20" fill="#f0fdf4" stroke="#dcfce7" strokeWidth="4" />
                      <text x="215" y="400" fill="#166534" fontFamily="system-ui" fontSize="10" fontWeight="800" textAnchor="middle" opacity="0.75">KRATON GARDENS</text>

                      {/* Scenic park details / trees */}
                      <g fill="#86efac" opacity="0.7">
                         <circle cx="170" cy="350" r="5" />
                         <circle cx="200" cy="340" r="6" />
                         <circle cx="240" cy="360" r="5" />
                         <circle cx="180" cy="420" r="7" />
                         <circle cx="220" cy="410" r="5" />
                         <circle cx="250" cy="430" r="6" />
                      </g>

                      {/* Mini architectural building shapes */}
                      <g fill="#e4e4e7" opacity="0.6">
                         <rect x="400" y="80" width="30" height="40" rx="4" />
                         <rect x="400" y="140" width="30" height="50" rx="4" />
                         <rect x="480" y="90" width="40" height="30" rx="4" />
                         <rect x="480" y="150" width="35" height="40" rx="4" />
                         <rect x="180" y="540" width="50" height="30" rx="4" />
                         <rect x="250" y="540" width="40" height="30" rx="4" />
                         <rect x="310" y="540" width="45" height="30" rx="4" />
                         <rect x="500" y="470" width="40" height="30" rx="4" />
                         <rect x="590" y="320" width="30" height="25" rx="4" />
                         <rect x="590" y="360" width="30" height="30" rx="4" />
                         <rect x="590" y="400" width="30" height="25" rx="4" />
                      </g>

                     {/* Road Network Outlines */}
                     <g stroke="#e4e4e7" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
                       <path d="M 450,0 L 450,1000" strokeWidth="26" />
                       <path d="M 100,0 L 100,1000" strokeWidth="20" />
                       <path d="M 0,520 L 750,520" strokeWidth="26" />
                       <path d="M 0,280 L 1000,280" strokeWidth="20" />
                       <path d="M 0,800 L 1000,800" strokeWidth="22" />
                       {/* Alleys / Side lanes */}
                       <path d="M 550,280 L 550,520" strokeWidth="16" />
                       <path d="M 450,310 L 750,310" strokeWidth="16" />
                       <path d="M 570,310 L 570,520" strokeWidth="16" />
                       <path d="M 450,450 L 750,450" strokeWidth="16" />
                       <path d="M 450,640 L 750,640" strokeWidth="16" />
                       <path d="M 750,520 L 750,1000" strokeWidth="18" />
                     </g>

                     {/* Road Network Inlines */}
                     <g stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
                       <path d="M 450,0 L 450,1000" strokeWidth="20" />
                       <path d="M 100,0 L 100,1000" strokeWidth="14" />
                       <path d="M 0,520 L 750,520" strokeWidth="20" />
                       <path d="M 0,280 L 1000,280" strokeWidth="14" />
                       <path d="M 0,800 L 1000,800" strokeWidth="16" />
                       {/* Alleys / Side lanes */}
                       <path d="M 550,280 L 550,520" strokeWidth="10" />
                       <path d="M 450,310 L 750,310" strokeWidth="10" />
                       <path d="M 570,310 L 570,520" strokeWidth="10" />
                       <path d="M 450,450 L 750,450" strokeWidth="10" />
                       <path d="M 450,640 L 750,640" strokeWidth="10" />
                       <path d="M 750,520 L 750,1000" strokeWidth="12" />
                     </g>

                     {/* Street Names and Typography */}
                     <g fill="#71717a" fontFamily="system-ui" fontSize="11" fontWeight="700" letterSpacing="0.05em">
                       <text x="430" y="150" transform="rotate(-90, 430, 150)" opacity="0.8">{streetNames.mainNS}</text>
                       <text x="80" y="200" transform="rotate(-90, 80, 200)" opacity="0.7">{streetNames.sideNS}</text>
                       <text x="250" y="505" opacity="0.8">{streetNames.mainEW}</text>
                       <text x="180" y="265" opacity="0.7">{streetNames.topEW}</text>
                       <text x="150" y="785" opacity="0.8">{streetNames.bottomEW}</text>
                       
                       {/* Specific Side Alleys */}
                       <g fontSize="9" fill="#a1a1aa" fontWeight="600">
                         <text x="560" y="300">{streetNames.alley1}</text>
                         <text x="470" y="300">{streetNames.alley2}</text>
                         <text x="580" y="390" transform="rotate(90, 580, 390)" fill="#ef4444" fontWeight="800">{streetNames.alley3}</text>
                         <text x="470" y="440">{streetNames.alley4}</text>
                         <text x="470" y="630">{streetNames.alley5}</text>
                         <text x="735" y="650" transform="rotate(-90, 735, 650)">{streetNames.sideNS2}</text>
                       </g>
                     </g>
                  </svg>

                  {/* Dynamic interactive property pins overlay */}
                  {filteredListings.map((listing, index) => {
                     const coords = getListingCoords(listing, index, city);
                     const isActive = activeListingId === listing.id;
                     return (
                        <div 
                           key={listing.id}
                           onClick={(e) => {
                             e.stopPropagation();
                             uiAudio.playPop();
                             setActiveListingId(listing.id);
                             scrollToCard(index);
                           }}
                           className="absolute cursor-pointer select-none"
                           style={{ 
                             left: `${coords.x}px`, 
                             top: `${coords.y}px`, 
                             transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                             transformOrigin: 'bottom center',
                             zIndex: isActive ? 100 : 10,
                             transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                           }}
                        >
                           {isActive ? (
                             // Beautiful Red Location Pin matching user's custom reference screenshots!
                             <div className="relative flex flex-col items-center justify-center scale-110">
                               <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white ring-4 ring-red-500/20 animate-bounce duration-[1500ms]">
                                 <MapPin className="w-5 h-5 text-white fill-white" />
                               </div>
                               <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[2px] mt-1" />
                             </div>
                           ) : (
                             // Cozy, premium badge with price text
                             <div className="bg-white text-gray-900 border border-gray-150 rounded-full px-2.5 py-1.5 text-[11px] font-black shadow-md hover:scale-110 active:scale-95 transition-all select-none whitespace-nowrap">
                               {formatPrice(getActivePrice(listing))}
                             </div>
                           )}
                        </div>
                     );
                  })}
               </div>

               {/* Floating Zoom Plus/Minus Controls inside canvas */}
               <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2 pointer-events-none">
                  <button 
                     type="button"
                     onClick={(e) => {
                       e.stopPropagation();
                       uiAudio.playClick();
                       setZoom(prev => Math.min(prev + 0.2, 3.0));
                     }}
                     className="pointer-events-auto w-10 h-10 rounded-xl bg-white/95 backdrop-blur-md shadow-lg border border-gray-100 flex items-center justify-center text-gray-800 hover:bg-gray-50 active:scale-95 transition-all font-black text-lg select-none"
                  >
                     +
                  </button>
                  <button 
                     type="button"
                     onClick={(e) => {
                       e.stopPropagation();
                       uiAudio.playClick();
                       setZoom(prev => Math.max(prev - 0.2, 0.5));
                     }}
                     className="pointer-events-auto w-10 h-10 rounded-xl bg-white/95 backdrop-blur-md shadow-lg border border-gray-100 flex items-center justify-center text-gray-800 hover:bg-gray-50 active:scale-95 transition-all font-black text-lg select-none"
                  >
                     −
                  </button>
               </div>

               {/* Fixed Compass Rose inside Vector Map container */}
               <div className="absolute bottom-6 left-6 z-30 pointer-events-none flex flex-col items-start gap-2">
                  <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-100 flex items-center justify-center pointer-events-auto">
                     <Compass className="w-6 h-6 text-gray-700 animate-spin-slow" />
                  </div>
                  
                  {/* Map Scale Legend Bar */}
                  <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-gray-150 shadow-sm flex flex-col gap-0.5 pointer-events-auto">
                     <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Scale</div>
                     <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-12 h-1 bg-gray-900 relative">
                           <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-900 -translate-y-1 h-3"></div>
                           <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-900 -translate-y-1 h-3"></div>
                        </div>
                        <span className="text-[9px] font-black text-gray-800 whitespace-nowrap">{zoom > 2 ? '150 m' : zoom > 1.2 ? '300 m' : zoom > 0.8 ? '500 m' : '1.2 km'}</span>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            /* GOOGLE MAPS CANVAS fallback */
            <Map
              defaultCenter={{lat: 12.9716, lng: 77.5946}}
              defaultZoom={13}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{width: '100%', height: '100%'}}
              disableDefaultUI={true}
            >
                <MapInner 
                   listings={filteredListings} 
                   highlightedId={highlightedId} 
                   onBoundsChanged={onBoundsChanged} 
                   setActiveMarkerId={setActiveListingId} 
                   activeMarkerId={activeListingId} 
                   isMobile={isMobile}
                   onMarkerClick={handleMarkerClick}
                   getActivePrice={getActivePrice}
                />
            </Map>
          )}

          {/* Dynamic "Searching this area..." live visual toast indicator */}
          {isSearchingArea && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-fade-in">
               <div className="bg-gray-900/90 backdrop-blur-md text-white text-[11px] font-bold px-4 py-2 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.25)] flex items-center gap-2 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span className="tracking-wide uppercase text-[9px] font-black">Searching this area...</span>
               </div>
            </div>
          )}

          {/* ADVANCED DESKTOP MAP FILTER DASHBOARD */}
          {!isMobile && (
            <div className="absolute top-6 left-6 z-30 max-w-[calc(100%-120px)] pointer-events-auto flex items-center gap-2">
               {/* Back Button */}
               <button 
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    if (onClose) onClose();
                  }}
                  className="w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:text-gray-900 active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Go Back"
               >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
               </button>

               {/* Floating Filter Dashboard Panel */}
               <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-gray-100/50 flex items-center gap-2">
                  {/* Search Input field inside the bar */}
                  <div className="flex items-center px-4 py-1.5 border-r border-gray-100 gap-2">
                     <Search className="w-4 h-4 text-gray-400" />
                     <form onSubmit={handleSearchSubmit}>
                        <input 
                           type="text"
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           placeholder="Search city..."
                           className="w-28 bg-transparent border-none text-[11px] font-bold text-gray-800 placeholder-gray-400 focus:ring-0 outline-none p-0"
                        />
                     </form>
                  </div>

                  {/* Type filter button choices */}
                  <div className="flex items-center gap-1 px-1">
                     {[
                       { label: 'All', value: '' },
                       { label: 'Hotel', value: 'hotel' },
                       { label: 'Villa', value: 'villa' },
                       { label: 'Resort', value: 'resort' }
                     ].map((item) => {
                        const isSel = localType === item.value;
                        return (
                           <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                 uiAudio.playClick();
                                 setLocalType(item.value);
                              }}
                              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                                 isSel ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                              }`}
                           >
                              {item.label}
                           </button>
                        );
                     })}
                  </div>

                  {/* Price range inputs inside the bar */}
                  <div className="flex items-center gap-1.5 px-3 border-l border-gray-100">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Price</span>
                     <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400">Min</span>
                        <input 
                           type="number"
                           placeholder="Any"
                           value={localMinPrice}
                           onChange={(e) => setLocalMinPrice(e.target.value)}
                           className="w-12 bg-transparent text-[11px] font-black text-gray-800 focus:ring-0 outline-none p-0 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                     </div>
                     <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400">Max</span>
                        <input 
                           type="number"
                           placeholder="Any"
                           value={localMaxPrice}
                           onChange={(e) => setLocalMaxPrice(e.target.value)}
                           className="w-12 bg-transparent text-[11px] font-black text-gray-800 focus:ring-0 outline-none p-0 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* DESKTOP UNIFIED FLOATING PREMIUM PREVIEW CARD */}
          {!isMobile && activeListing && (
            <div className="absolute bottom-6 left-6 z-30 w-[330px] bg-white rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-gray-100/80 flex flex-col pointer-events-auto animate-fade-in">
               {/* Main Card Media */}
               <div className="relative h-44 w-full overflow-hidden group">
                  <img 
                     src={activeListing.imageUrl || undefined} 
                     alt={activeListing.title} 
                     className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
                  
                  {/* Dismiss X Button */}
                  <button 
                     type="button"
                     onClick={() => {
                        uiAudio.playClick();
                        setActiveListingId(null);
                     }}
                     className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md border border-white/10 animate-pulse"
                  >
                     <X className="w-4 h-4" />
                  </button>

                  {/* Rating Badge */}
                  <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-black text-gray-800 tracking-tight shadow-md">
                     <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                     <span>{activeListing.rating || 4.8}</span>
                     <span className="text-gray-300">•</span>
                     <span>{activeListing.reviewCount || 12} reviews</span>
                  </div>

                  {/* Type Pill */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider text-gray-700 shadow-sm border border-gray-100">
                     {activeListing.type || 'Stay'}
                  </div>
               </div>

               {/* Content Details */}
               <div className="p-4 flex flex-col gap-3">
                  <div>
                     <h4 className="font-extrabold text-sm text-gray-900 leading-snug line-clamp-1">{activeListing.title}</h4>
                     <p className="text-[11px] font-medium text-gray-500 mt-0.5 line-clamp-1">{activeListing.address || 'Central Area'}</p>
                  </div>

                  {/* ADVANCED Accommodation Choice Selector */}
                  {activeListing.rooms && activeListing.rooms.length > 0 && (
                     <div className="flex flex-col gap-1.5 bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
                        <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Accommodation Choices</div>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 pointer-events-auto">
                           {activeListing.rooms.map((room) => {
                              const isSelected = selectedRoomIdForListing[activeListing.id] === room.id || (!selectedRoomIdForListing[activeListing.id] && room.id === activeListing.rooms?.[0].id);
                              return (
                                 <button 
                                    key={room.id}
                                    type="button"
                                    onClick={() => {
                                       uiAudio.playClick();
                                       setSelectedRoomIdForListing(prev => ({ ...prev, [activeListing.id]: room.id }));
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-[9.5px] font-black transition-all whitespace-nowrap border flex items-center gap-1 cursor-pointer ${
                                       isSelected 
                                          ? 'bg-gray-900 text-white border-gray-900 scale-102 shadow-sm' 
                                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                    }`}
                                 >
                                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                    {room.name}
                                 </button>
                              );
                           })}
                        </div>
                     </div>
                  )}

                  {/* Pricing & CTA Row */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                     <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Price / stay</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                           <span className="text-base font-black text-gray-900">{formatPrice(getActivePrice(activeListing))}</span>
                           <span className="text-[10px] font-bold text-gray-500">/ night</span>
                        </div>
                     </div>

                     <div className="flex items-center gap-1.5">
                        {/* Heart Fav Button */}
                        <button 
                           type="button"
                           onClick={() => {
                              uiAudio.playClick();
                              if (onToggleFavorite) onToggleFavorite(activeListing);
                           }}
                           className="w-10 h-10 rounded-full border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-500 hover:text-red-500 transition-all active:scale-90"
                        >
                           <Heart className={`w-4 h-4 ${isFavorite && isFavorite(activeListing.id) ? 'text-red-500 fill-red-500' : ''}`} />
                        </button>

                        {/* View Details Button */}
                        <button 
                           type="button"
                           onClick={() => {
                              uiAudio.playClick();
                              if (onSelectListing) onSelectListing(activeListing);
                           }}
                           className="px-4 h-10 rounded-full bg-gray-900 hover:bg-gray-800 text-white text-xs font-black tracking-wide transition-all shadow-md active:scale-95 flex items-center justify-center cursor-pointer"
                        >
                           View Details
                        </button>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* MOBILE HORIZONTAL SCROLL CAROUSEL */}
        {isMobile && filteredListings && filteredListings.length > 0 && (
          <div 
             ref={carouselRef}
             onScroll={onCarouselScroll}
             className="absolute bottom-[80px] left-0 right-0 z-[110] flex gap-4 overflow-x-auto px-5 pb-4 snap-x snap-mandatory scroll-smooth scrollbar-hide pointer-events-auto"
          >
             {filteredListings.map((listing, index) => {
                 const isActive = activeListingId === listing.id;
                 return (
                     <div 
                         key={listing.id}
                         onClick={() => {
                             uiAudio.playClick();
                             setActiveListingId(listing.id);
                             scrollToCard(index);
                             if (onSelectListing) onSelectListing(listing);
                         }}
                         className={`
                             w-[290px] h-[124px] bg-white rounded-3xl overflow-hidden flex-shrink-0 snap-center shadow-[0_12px_36px_rgba(0,0,0,0.15)] flex relative border-2 transition-all duration-300 cursor-pointer
                             ${isActive ? 'border-red-500 ring-4 ring-red-500/10' : 'border-transparent'}
                         `}
                     >
                         {/* Card Image */}
                         <div className="w-[110px] h-full relative">
                             <img src={listing.imageUrl || undefined} alt={listing.title} className="w-full h-full object-cover" />
                             <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-full text-[9px] font-black text-gray-800 tracking-tight shadow-sm">
                                 {listing.type || 'Resort'}
                             </div>
                         </div>
                         
                         {/* Card Content */}
                         <div className="flex-1 p-3 flex flex-col justify-between">
                             <div>
                                 <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold mb-0.5">
                                     <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                                     <span>{listing.rating}</span>
                                     <span className="text-gray-300">•</span>
                                     <span>{listing.reviewCount} reviews</span>
                                 </div>
                                 <h4 className="font-extrabold text-xs text-gray-900 leading-tight line-clamp-2">{listing.title}</h4>
                                 
                                 {/* Mobile quick room selector chips */}
                                 {listing.rooms && listing.rooms.length > 0 && (
                                     <div className="flex items-center gap-1 mt-1 overflow-x-auto scrollbar-hide py-0.5 pointer-events-auto">
                                         {listing.rooms.map((room) => {
                                             const isSelected = selectedRoomIdForListing[listing.id] === room.id || (!selectedRoomIdForListing[listing.id] && room.id === listing.rooms?.[0].id);
                                             return (
                                                 <span 
                                                     key={room.id}
                                                     onClick={(e) => {
                                                         e.stopPropagation();
                                                         uiAudio.playClick();
                                                         setSelectedRoomIdForListing(prev => ({ ...prev, [listing.id]: room.id }));
                                                     }}
                                                     className={`px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-tight whitespace-nowrap transition-all border ${
                                                         isSelected 
                                                             ? 'bg-gray-900 text-white border-gray-900' 
                                                             : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'
                                                     }`}
                                                 >
                                                     {room.name}
                                                 </span>
                                             );
                                         })}
                                     </div>
                                 )}
                             </div>
                             
                             <div className="flex items-baseline justify-between mt-0.5">
                                 <div>
                                     <span className="text-sm font-black text-gray-900">{formatPrice(getActivePrice(listing))}</span>
                                     <span className="text-[9px] text-gray-400 font-bold"> / night</span>
                                 </div>
                             </div>
                         </div>
                         
                         {/* Favorite Circle Button */}
                         <button 
                             onClick={(e) => {
                                 e.stopPropagation();
                                 uiAudio.playClick();
                                 if (onToggleFavorite) onToggleFavorite(listing);
                             }}
                             className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 backdrop-blur-md shadow-md flex items-center justify-center text-gray-600 hover:text-red-500 hover:scale-105 active:scale-90 transition-all border border-gray-100/50"
                         >
                             <Heart className={`w-4 h-4 ${isFavorite && isFavorite(listing.id) ? 'text-red-500 fill-red-500' : 'text-gray-600'}`} />
                         </button>
                     </div>
                 );
             })}
          </div>
        )}

        {/* MOBILE LOCAL QUICK FILTER BOTTOM SHEET */}
        {isMobile && showLocalFilters && (
            <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-xs transition-all duration-300 animate-fade-in pointer-events-auto">
                <div className="bg-white rounded-t-[2.5rem] w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-slide-up">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                        <button onClick={() => setShowLocalFilters(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-sm font-black text-gray-900">Filters</h3>
                        <button 
                            onClick={() => {
                                setLocalMinPrice('');
                                setLocalMaxPrice('');
                                setLocalType('');
                            }}
                            className="text-xs font-bold text-gray-500 hover:text-gray-900 underline"
                        >
                            Clear
                        </button>
                    </div>
                    
                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Price Section */}
                        <div>
                            <h4 className="font-extrabold text-xs text-gray-900 mb-3 uppercase tracking-wider">Price Range</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Min Price</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                                        <input 
                                            type="number"
                                            value={localMinPrice}
                                            onChange={(e) => setLocalMinPrice(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-6 pr-3 py-3 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:bg-white"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Max Price</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                                        <input 
                                            type="number"
                                            value={localMaxPrice}
                                            onChange={(e) => setLocalMaxPrice(e.target.value)}
                                            placeholder="Any"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-6 pr-3 py-3 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Property Type Section */}
                        <div>
                            <h4 className="font-extrabold text-xs text-gray-900 mb-3 uppercase tracking-wider">Property Type</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {['Apartment', 'House', 'Cabin', 'Resort'].map((type) => {
                                    const isSel = localType === type;
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setLocalType(isSel ? '' : type)}
                                            className={`
                                                py-3 rounded-xl text-xs font-bold border-2 transition-all
                                                ${isSel ? 'border-gray-900 bg-gray-900 text-white shadow-md' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}
                                            `}
                                        >
                                            {type}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="p-5 border-t border-gray-100 pb-safe">
                        <button 
                            onClick={() => {
                                uiAudio.playSuccess();
                                setShowLocalFilters(false);
                            }}
                            className="w-full bg-gray-900 text-white font-black text-xs py-4 rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 uppercase tracking-wider"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MOBILE FLOATING GLASSMORPHIC BOTTOM TAB BAR */}
        {isMobile && (
          <div className="absolute bottom-0 left-0 right-0 h-[72px] bg-white/90 backdrop-blur-lg border-t border-gray-150/50 flex items-center justify-between px-8 z-[120] pb-safe pointer-events-auto">
              {/* Explore Button */}
              <button 
                  onClick={() => {
                      uiAudio.playClick();
                      if (onClose) onClose();
                  }}
                  className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-900 transition-colors p-2"
              >
                  <Compass className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-extrabold tracking-tight">Explore</span>
              </button>
              
              {/* Places Active Capsule */}
              <button 
                  className="bg-gray-900 text-white px-4 py-2 rounded-full flex items-center gap-1.5 font-extrabold text-xs shadow-md transition-all active:scale-95"
              >
                  <MapPin className="w-3.5 h-3.5 text-red-500 fill-white" />
                  <span>Places</span>
              </button>
              
              {/* Inbox Button */}
              <button 
                  onClick={() => {
                      uiAudio.playClick();
                      if (onNavigate) {
                          onNavigate('MESSAGES');
                      }
                      if (onClose) onClose();
                  }}
                  className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-900 transition-colors p-2"
              >
                  <MessageCircle className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-extrabold tracking-tight">Inbox</span>
              </button>
              
              {/* Profile Button */}
              <button 
                  onClick={() => {
                      uiAudio.playClick();
                      if (onClose) onClose();
                      setTimeout(() => {
                          const profileBtn = document.querySelector('[aria-label="Profile"], .profile-trigger-btn') as HTMLElement;
                          if (profileBtn) {
                              profileBtn.click();
                          } else {
                              // fallback
                              const customTrigger = document.getElementById('mobile-profile-btn') || document.querySelector('.mobile-profile-sheet-btn');
                              if (customTrigger) (customTrigger as HTMLElement).click();
                          }
                      }, 100);
                  }}
                  className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-900 transition-colors p-2"
              >
                  <User className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-extrabold tracking-tight">Profile</span>
              </button>
          </div>
        )}

    </div>
  );
};

export default MapSidebar;
