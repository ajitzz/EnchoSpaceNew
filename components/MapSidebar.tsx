/// <reference types="@types/google.maps" />

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { uiAudio } from './audio';
import { Listing } from '../types';
import { StarIcon } from './Icons';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useCurrency } from './CurrencyContext';

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
}

const markerPrices = new WeakMap<google.maps.marker.AdvancedMarkerElement, number>();

const MarkerWithInfoWindow = ({ listing, isActive, setActiveMarkerId, setMarkerRef }: { key?: React.Key, listing: Listing, isActive: boolean, setActiveMarkerId: (id: string | null) => void, setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => void }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (marker && setMarkerRef) {
        markerPrices.set(marker, listing.price);
        setMarkerRef(listing.id, marker);
    }
    return () => {
        if (setMarkerRef) setMarkerRef(listing.id, null);
    };
  }, [marker, listing.id, listing.price, setMarkerRef]);

  // Generate deterministic lat/lng if not present
  const position = useMemo(() => {
    const lat = listing.lat, lng = listing.lng;
    if (lat && lng && Number(lat) !== 0 && Number(lng) !== 0 && Number(lat) !== 0 && Number(lng) !== 0) return { lat: Number(lat), lng: Number(lng) };
    const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Bangalore center ~ 12.9716, 77.5946
    const fallBackLat = 12.9716 + ((hash % 100) - 50) * 0.002;
    const fallBackLng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
    return { lat: fallBackLat, lng: fallBackLng };
  }, [listing.id, listing.lat, listing.lng]);

  useEffect(() => {
    if (isActive) {
         
        setOpen(true);
    }
  }, [isActive]);

  return (
    <>
      <AdvancedMarker 
        ref={markerRef} 
        position={position} 
        onClick={() => {
            uiAudio.playPop();
        setOpen(true);
        }}
      >
        <div 
          onMouseEnter={() => {
              if (!isActive && !open) uiAudio.playClick();
              setActiveMarkerId(listing.id);
          }}
          onMouseLeave={() => setActiveMarkerId(null)}
          className={`
              relative flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] 
              transition-all duration-500 ring-1 ring-black/5 ease-[cubic-bezier(0.34,1.56,0.64,1)]
              ${(isActive || open) 
                  ? 'bg-gray-900 text-white px-5 py-2.5 scale-125 z-50 shadow-[0_20px_40px_rgba(0,0,0,0.4)] -translate-y-2 ring-2 ring-white/50' 
                  : 'bg-white text-gray-900 px-3.5 py-1.5 hover:scale-110 hover:shadow-xl z-10'}
          `}
        >
            <span className={`font-bold whitespace-nowrap ${(isActive || open) ? 'text-sm' : 'text-xs'}`}>
                {formatPrice(listing.price)}
            </span>
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => { uiAudio.playClick(); setOpen(false); }} style={{padding: 0, overflow: 'hidden', borderRadius: '16px'}}>
           <div className="w-[240px] bg-white overflow-hidden">
               <div className="aspect-[16/9] relative">
                    <img src={listing.imageUrl} className="w-full h-full object-cover" alt={listing.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                    <div className="absolute bottom-3 left-3 text-white">
                       <div className="text-xs font-medium opacity-90">{listing.type}</div>
                       <div className="font-bold text-lg leading-none">{formatPrice(listing.price)}</div>
                    </div>
               </div>
               <div className="p-3 bg-white">
                    <h4 className="font-bold text-gray-900 text-sm leading-tight mb-1 truncate">{listing.title}</h4>
                    <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                       <StarIcon className="w-3 h-3 text-orange-400 fill-current" />
                       {listing.rating} ({listing.reviewCount})
                    </div>
               </div>
           </div>
        </InfoWindow>
      )}
    </>
  );
};

const MapInner = ({ listings, highlightedId, onBoundsChanged, setActiveMarkerId, activeMarkerId }: any) => {
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
             if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0) || (Number(lat) === 0 && Number(lng) === 0)) {
                 const hash = String(listing.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                 lat = 12.9716 + ((hash % 100) - 50) * 0.002;
                 lng = 77.5946 + (((hash * 13) % 100) - 50) * 0.002;
             }
             bounds.extend(new google.maps.LatLng(Number(lat), Number(lng)));
        });
        map.fitBounds(bounds, 50); // 50px padding
    };
    
    // Fit bounds on first load if we have listings
    const didInitialFit = useRef(false);
    useEffect(() => {
        if (map && listings.length > 0 && !didInitialFit.current) {
             const bounds = new google.maps.LatLngBounds();
             listings.forEach((listing: Listing) => {
                 let lat = listing.lat, lng = listing.lng;
                 if (!lat || !lng || (Number(lat) === 0 && Number(lng) === 0) || (Number(lat) === 0 && Number(lng) === 0)) {
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
          {/* Top Floating Control: "Search as I move" and "Fit Bounds" */}
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
          
          {listings.map((listing: Listing) => {
               const isActive = activeMarkerId === listing.id || highlightedId === listing.id;
               return <MarkerWithInfoWindow key={listing.id} listing={listing} isActive={isActive} setActiveMarkerId={setActiveMarkerId} setMarkerRef={setMarkerRef} />
           })}
        </>
    );
};

const MapSidebar: React.FC<MapSidebarProps> = ({ listings, highlightedId, className = "", onBoundsChanged }) => {
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  if (!hasValidKey) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 p-6 text-center ${className}`}>
        <div className="max-w-sm">
          <h2 className="text-lg font-bold mb-2">Google Maps API Key Required</h2>
          <p className="text-sm text-gray-500 mb-4">You need to add your <strong>GOOGLE_MAPS_PLATFORM_KEY</strong> in the AI Studio settings to enable the dynamic map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-gray-50 isolate overflow-hidden shadow-inner ${className}`}>
        <Map
          defaultCenter={{lat: 12.9716, lng: 77.5946}}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{width: '100%', height: '100%'}}
          disableDefaultUI={true}
        >
            <MapInner 
               listings={listings} 
               highlightedId={highlightedId} 
               onBoundsChanged={onBoundsChanged} 
               setActiveMarkerId={setActiveMarkerId} 
               activeMarkerId={activeMarkerId} 
            />
        </Map>
    </div>
  );
};

export default MapSidebar;
