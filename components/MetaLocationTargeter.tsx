import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  X, 
  Plus, 
  Minus, 
  Crosshair, 
  Globe, 
  Check, 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  AlertCircle,
  Maximize2
} from 'lucide-react';
import L from 'leaflet';

// Fix typical Leaflet icon issue in React
const defaultPinIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropPinIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #0284c7; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
         </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

export interface MetaLocationItem {
  id: string;
  name: string;
  type: 'city' | 'region' | 'country' | 'pin';
  lat: number;
  lng: number;
  radius_km: number;
  mode: 'include' | 'exclude';
}

interface MetaLocationTargeterProps {
  targetLocations: string;
  targetRadiusKm: number;
  onChangeLocations: (locationsStr: string, radiusKm: number, structuredLocations?: MetaLocationItem[]) => void;
  aiRecommendations?: {
    recommended_locations?: string[] | string;
    feeder_markets?: string[];
  };
  onApplyAiLocations?: (locations: string[]) => void;
}

// Known coordinates database for instant zero-latency lookup of popular feeder locations
const KNOWN_COORDS: Record<string, { lat: number; lng: number; type: 'city' | 'region' | 'country' }> = {
  mumbai: { lat: 19.0760, lng: 72.8777, type: 'city' },
  delhi: { lat: 28.6139, lng: 77.2090, type: 'city' },
  'delhi ncr': { lat: 28.6139, lng: 77.2090, type: 'region' },
  bangalore: { lat: 12.9716, lng: 77.5946, type: 'city' },
  bengaluru: { lat: 12.9716, lng: 77.5946, type: 'city' },
  goa: { lat: 15.2993, lng: 74.1240, type: 'region' },
  pune: { lat: 18.5204, lng: 73.8567, type: 'city' },
  hyderabad: { lat: 17.3850, lng: 78.4867, type: 'city' },
  chennai: { lat: 13.0827, lng: 80.2707, type: 'city' },
  kolkata: { lat: 22.5726, lng: 88.3639, type: 'city' },
  ahmedabad: { lat: 23.0225, lng: 72.5714, type: 'city' },
  jaipur: { lat: 26.9124, lng: 75.7873, type: 'city' },
  chandigarh: { lat: 30.7333, lng: 76.7794, type: 'city' },
  kochi: { lat: 9.9312, lng: 76.2673, type: 'city' },
  london: { lat: 51.5074, lng: -0.1278, type: 'city' },
  'dubai': { lat: 25.2048, lng: 55.2708, type: 'city' },
  'new york': { lat: 40.7128, lng: -74.0060, type: 'city' },
  'los angeles': { lat: 34.0522, lng: -118.2437, type: 'city' },
  singapore: { lat: 1.3521, lng: 103.8198, type: 'country' },
  india: { lat: 20.5937, lng: 78.9629, type: 'country' }
};

export const MetaLocationTargeter: React.FC<MetaLocationTargeterProps> = ({
  targetLocations,
  targetRadiusKm,
  onChangeLocations,
  aiRecommendations,
  onApplyAiLocations
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(true);
  const [filterMode, setFilterMode] = useState<'include' | 'exclude'>('include');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number; type: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropPinMode, setIsDropPinMode] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [showBrowseMenu, setShowBrowseMenu] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Structured list of active targeted locations
  const [locationList, setLocationList] = useState<MetaLocationItem[]>([]);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circlesRef = useRef<L.Circle[]>([]);

  // Initialize structured locations from comma-separated targetLocations prop
  useEffect(() => {
    if (!targetLocations) {
      if (locationList.length > 0) setLocationList([]);
      return;
    }

    const rawNames = targetLocations.split(',').map(s => s.trim()).filter(Boolean);
    const updatedList: MetaLocationItem[] = [];

    rawNames.forEach((name, idx) => {
      const existing = locationList.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        updatedList.push(existing);
      } else {
        const key = name.toLowerCase();
        const known = KNOWN_COORDS[key];
        updatedList.push({
          id: `loc_${Date.now()}_${idx}`,
          name: name,
          type: known ? known.type : 'city',
          lat: known ? known.lat : 19.0760 + (idx * 0.5),
          lng: known ? known.lng : 72.8777 + (idx * 0.5),
          radius_km: targetRadiusKm || 50,
          mode: 'include'
        });
      }
    });

    setLocationList(updatedList);
  }, [targetLocations]);

  // Sync back to parent whenever locationList changes
  const notifyParent = (newList: MetaLocationItem[], radius: number = targetRadiusKm) => {
    const namesStr = newList.map(item => item.name).join(', ');
    onChangeLocations(namesStr, radius, newList);
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!leafletMapRef.current) {
      const defaultCenter: [number, number] = locationList.length > 0 && locationList[0].lat
        ? [locationList[0].lat, locationList[0].lng]
        : [20.5937, 78.9629]; // India default center

      const zoomLevel = locationList.length === 1 ? 9 : locationList.length > 1 ? 5 : 4;

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: zoomLevel,
        zoomControl: false, // Custom zoom buttons in Meta design
        attributionControl: false
      });

      // Clean OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      // Click event for Drop Pin Mode
      map.on('click', (e: L.LeafletMouseEvent) => {
        handleMapClick(e.latlng.lat, e.latlng.lng);
      });

      leafletMapRef.current = map;
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Handle map click when Drop Pin mode is active
  const handleMapClick = async (lat: number, lng: number) => {
    // Reverse geocode clicked location
    let placeName = `Dropped Pin (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.address) {
        placeName = data.address.city || data.address.town || data.address.state || data.address.county || data.display_name.split(',')[0];
      }
    } catch (err) {
      console.warn("Reverse geocode warning:", err);
    }

    const newItem: MetaLocationItem = {
      id: `pin_${Date.now()}`,
      name: placeName,
      type: 'pin',
      lat: lat,
      lng: lng,
      radius_km: targetRadiusKm || 50,
      mode: filterMode
    };

    const updated = [...locationList, newItem];
    setLocationList(updated);
    notifyParent(updated);
    setIsDropPinMode(false);
  };

  // Render Markers and Radius Circles on Map whenever locationList or targetRadiusKm changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Clear existing markers and circles
    markersRef.current.forEach(m => m.remove());
    circlesRef.current.forEach(c => c.remove());
    markersRef.current = [];
    circlesRef.current = [];

    if (locationList.length === 0) return;

    const bounds = L.latLngBounds([]);

    locationList.forEach(loc => {
      const latLng: [number, number] = [loc.lat, loc.lng];
      bounds.extend(latLng);

      // Create Marker
      const markerIcon = loc.type === 'pin' ? dropPinIcon : defaultPinIcon;
      const marker = L.marker(latLng, { icon: markerIcon }).addTo(map);
      
      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; padding: 4px; text-align: center;">
          <strong style="color: #0f172a; font-size: 13px;">${loc.name}</strong>
          <div style="font-size: 11px; color: #0284c7; font-weight: 700; margin-top: 2px;">
            ${loc.mode.toUpperCase()}: +${loc.radius_km} km Radius
          </div>
        </div>
      `);

      markersRef.current.push(marker);

      // Create Radius Circle Overlay
      const color = loc.mode === 'exclude' ? '#ef4444' : '#0284c7'; // Blue for include, Red for exclude
      const circle = L.circle(latLng, {
        color: color,
        fillColor: color,
        fillOpacity: 0.15,
        radius: (loc.radius_km || 50) * 1000 // meters
      }).addTo(map);

      circlesRef.current.push(circle);
    });

    if (locationList.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [locationList, targetRadiusKm]);

  // Debounced search geocoding via Nominatim API
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data.map(item => ({
            name: item.display_name.split(',').slice(0, 2).join(','),
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            type: item.type || 'city'
          })));
        }
      } catch (err) {
        console.warn("Geocoding search failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Add location from search result or text enter
  const handleSelectSearchResult = (result: { name: string; lat: number; lng: number; type: string }) => {
    const newItem: MetaLocationItem = {
      id: `loc_${Date.now()}`,
      name: result.name,
      type: result.type as any,
      lat: result.lat,
      lng: result.lng,
      radius_km: targetRadiusKm || 50,
      mode: filterMode
    };

    const updated = [...locationList.filter(l => l.name.toLowerCase() !== result.name.toLowerCase()), newItem];
    setLocationList(updated);
    notifyParent(updated);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Remove a location
  const handleRemoveLocation = (id: string) => {
    const updated = locationList.filter(loc => loc.id !== id);
    setLocationList(updated);
    notifyParent(updated);
  };

  // Change radius for a specific location
  const handleLocationRadiusChange = (id: string, newRadiusKm: number) => {
    const updated = locationList.map(loc => {
      if (loc.id === id) {
        return { ...loc, radius_km: newRadiusKm };
      }
      return loc;
    });
    setLocationList(updated);
    notifyParent(updated, newRadiusKm);
  };

  // Change mode (include/exclude) for a location
  const handleToggleMode = (id: string) => {
    const updated = locationList.map(loc => {
      if (loc.id === id) {
        return { ...loc, mode: (loc.mode === 'include' ? 'exclude' : 'include') as 'include' | 'exclude' };
      }
      return loc;
    });
    setLocationList(updated);
    notifyParent(updated);
  };

  // Handle Bulk Add Submit
  const handleApplyBulk = () => {
    if (!bulkText.trim()) return;
    const names = bulkText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    const existingNames = locationList.map(l => l.name.toLowerCase());
    
    const newItems: MetaLocationItem[] = [];
    names.forEach((name, idx) => {
      if (!existingNames.includes(name.toLowerCase())) {
        const known = KNOWN_COORDS[name.toLowerCase()];
        newItems.push({
          id: `bulk_${Date.now()}_${idx}`,
          name: name,
          type: known ? known.type : 'city',
          lat: known ? known.lat : 19.0760 + (idx * 0.2),
          lng: known ? known.lng : 72.8777 + (idx * 0.2),
          radius_km: targetRadiusKm || 50,
          mode: filterMode
        });
      }
    });

    const updated = [...locationList, ...newItems];
    setLocationList(updated);
    notifyParent(updated);
    setBulkText('');
    setShowBulkModal(false);
  };

  // Map Controls
  const zoomIn = () => leafletMapRef.current?.zoomIn();
  const zoomOut = () => leafletMapRef.current?.zoomOut();
  const reCenterMap = () => {
    if (locationList.length > 0 && leafletMapRef.current) {
      const bounds = L.latLngBounds(locationList.map(l => [l.lat, l.lng]));
      leafletMapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden text-left font-sans transition-all">
      {/* Section Header: Meta Controls Notice */}
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-900 uppercase tracking-wide">Controls</span>
          <div className="group relative cursor-pointer">
            <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-64 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-xl z-50 leading-tight">
              Meta Advantage+ Budget Safeguard: We won't reach people beyond these boundary settings.
            </div>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 font-medium">
          We won't reach people beyond these settings, even with Advantage+ on.
        </span>
      </div>

      {/* Accordion Box: Locations */}
      <div className="border-b border-slate-200">
        <button
          type="button"
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          className="w-full px-4 py-3 bg-slate-100/60 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900">Locations</span>
            <span className="bg-sky-100 text-sky-800 text-[9px] font-black px-2 py-0.5 rounded-full border border-sky-200">
              {locationList.length} Selected
            </span>
          </div>
          {isAccordionOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {isAccordionOpen && (
          <div className="p-4 space-y-4 bg-white">
            {/* Country Context Selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Country / Primary Territory</span>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xs font-bold text-emerald-800">
                  🌐
                </div>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-4"
                >
                  <option value="India">India (IN)</option>
                  <option value="United States">United States (US)</option>
                  <option value="United Arab Emirates">United Arab Emirates (UAE)</option>
                  <option value="United Kingdom">United Kingdom (UK)</option>
                  <option value="Global Feeder">Global Top Feeder Markets</option>
                </select>
              </div>
            </div>

            {/* Meta Control Action Bar: Include/Exclude Dropdown + Search Input + Browse Dropdown + Expand */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              {/* Include/Exclude Selector */}
              <div className="sm:col-span-3">
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as 'include' | 'exclude')}
                  className={`w-full text-xs font-black rounded-xl p-2.5 border outline-none cursor-pointer transition-colors ${
                    filterMode === 'include'
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  <option value="include">Include ▾</option>
                  <option value="exclude">Exclude ▾</option>
                </select>
              </div>

              {/* Location Search Input with instant suggestions */}
              <div className="sm:col-span-6 relative">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search locations (cities, regions, zip codes)..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-8 text-xs font-medium text-slate-900 outline-none focus:border-sky-500 focus:bg-white transition-all shadow-2xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* Instant Search Autocomplete Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100">
                    {searchResults.map((res, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectSearchResult(res)}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-sky-50 flex items-center justify-between transition-colors"
                      >
                        <span className="truncate">{res.name}</span>
                        <span className="text-[9px] uppercase font-mono text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded">
                          + Add {filterMode}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Browse Menu & Drop Pin Toggle */}
              <div className="sm:col-span-3 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => setShowBrowseMenu(!showBrowseMenu)}
                    className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-between transition-colors"
                  >
                    <span>Browse</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Browse Preset Menu */}
                  {showBrowseMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 space-y-1">
                      <div className="text-[9px] font-black uppercase text-slate-400 px-2 py-1">Quick Target Belts</div>
                      {[
                        { label: '🏙️ Metro Feeder Hubs', cities: ['Mumbai', 'Delhi NCR', 'Bangalore', 'Pune'] },
                        { label: '🌴 Tourist Feeder Belts', cities: ['Goa', 'Jaipur', 'Udaipur', 'Kochi'] },
                        { label: '💼 Corporate Tech Hubs', cities: ['Bangalore', 'Hyderabad', 'Gurgaon'] }
                      ].map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            preset.cities.forEach(c => {
                              const known = KNOWN_COORDS[c.toLowerCase()];
                              if (known && !locationList.some(l => l.name.toLowerCase() === c.toLowerCase())) {
                                locationList.push({
                                  id: `preset_${Date.now()}_${c}`,
                                  name: c,
                                  type: known.type,
                                  lat: known.lat,
                                  lng: known.lng,
                                  radius_km: targetRadiusKm || 50,
                                  mode: filterMode
                                });
                              }
                            });
                            notifyParent([...locationList]);
                            setShowBrowseMenu(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 rounded-lg transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Feeder Recommendations Quick Bar (Rahul-Proof Guard) */}
            {aiRecommendations && (
              <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 border border-sky-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-600 animate-bounce" />
                  <span className="text-xs font-black text-slate-900">AI Feeder High-Yield Target Markets:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Array.isArray(aiRecommendations.recommended_locations)
                    ? aiRecommendations.recommended_locations
                    : typeof aiRecommendations.recommended_locations === 'string'
                    ? aiRecommendations.recommended_locations.split(',')
                    : ['Mumbai', 'Delhi NCR', 'Bangalore']
                  ).slice(0, 4).map((loc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const trimmed = loc.trim();
                        if (!locationList.some(l => l.name.toLowerCase() === trimmed.toLowerCase())) {
                          const known = KNOWN_COORDS[trimmed.toLowerCase()];
                          const updated = [...locationList, {
                            id: `ai_${Date.now()}_${idx}`,
                            name: trimmed,
                            type: (known ? known.type : 'city') as any,
                            lat: known ? known.lat : 19.0760 + idx,
                            lng: known ? known.lng : 72.8777 + idx,
                            radius_km: targetRadiusKm || 50,
                            mode: 'include' as const
                          }];
                          setLocationList(updated);
                          notifyParent(updated);
                        }
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-900 text-[10px] font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-sky-600" />
                      <span>{loc.trim()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Tagged Locations Table (Meta Ads Manager exact layout) */}
            {locationList.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="bg-slate-50 px-3 py-2 grid grid-cols-12 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <div className="col-span-5">Target Location</div>
                  <div className="col-span-2 text-center">Mode</div>
                  <div className="col-span-4 text-center">Radius Coverage</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                {locationList.map((item) => (
                  <div key={item.id} className="px-3 py-2.5 grid grid-cols-12 items-center text-xs text-slate-800 hover:bg-slate-50/80 transition-colors">
                    {/* Location name and type icon */}
                    <div className="col-span-5 flex items-center gap-2">
                      <span className="p-1 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                        {item.type === 'pin' ? '📍 Pin' : item.type === 'country' ? '🌐 Country' : '🏙️ City'}
                      </span>
                      <span className="font-bold text-slate-900 truncate">{item.name}</span>
                    </div>

                    {/* Include / Exclude Badge */}
                    <div className="col-span-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleMode(item.id)}
                        className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase border transition-colors cursor-pointer ${
                          item.mode === 'include'
                            ? 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200'
                            : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                        }`}
                      >
                        {item.mode}
                      </button>
                    </div>

                    {/* Radius Slider Control per location */}
                    <div className="col-span-4 px-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={25}
                        max={150}
                        step={5}
                        value={item.radius_km}
                        onChange={(e) => handleLocationRadiusChange(item.id, Number(e.target.value))}
                        className="w-full accent-sky-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                      />
                      <span className="text-[10px] font-mono font-black text-sky-700 shrink-0 w-12 text-right">
                        +{item.radius_km} km
                      </span>
                    </div>

                    {/* Remove Action Button */}
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Remove location"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
                <MapPin className="w-6 h-6 text-slate-400 mx-auto animate-pulse" />
                <div className="text-xs font-bold text-slate-700">No specific locations added yet</div>
                <p className="text-[10px] text-slate-500">Search cities above, browse feeder belts, or drop a pin on the map to target exact guest zones.</p>
              </div>
            )}

            {/* REAL Leaflet Interactive Map Container */}
            <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-300 shadow-inner group">
              {/* Map Canvas Div */}
              <div ref={mapContainerRef} className="w-full h-full z-0" />

              {/* Top Control Overlay: Drop Pin Action & Zoom Buttons */}
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
                {/* Drop Pin Mode Button */}
                <button
                  type="button"
                  onClick={() => setIsDropPinMode(!isDropPinMode)}
                  className={`px-3 py-2 rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    isDropPinMode
                      ? 'bg-amber-500 text-white animate-pulse ring-2 ring-amber-300'
                      : 'bg-white hover:bg-slate-100 text-slate-900 border border-slate-200'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${isDropPinMode ? 'text-white' : 'text-sky-600'}`} />
                  <span>{isDropPinMode ? 'Click Map to Drop Pin...' : '📍 Drop Pin'}</span>
                </button>

                {/* Zoom Controls */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="p-2 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors"
                    title="Zoom In"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="p-2 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors"
                    title="Zoom Out"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={reCenterMap}
                    className="p-2 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors"
                    title="Re-Center Map"
                  >
                    <Crosshair className="w-4 h-4 text-sky-600" />
                  </button>
                </div>
              </div>

              {/* Bottom Info Banner on Map */}
              <div className="absolute bottom-3 left-3 right-3 z-10 bg-slate-900/90 backdrop-blur-md text-white p-2.5 rounded-xl border border-white/10 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    Meta Housing Rule: Min 25 km radius enforced | Active Zone: ~{Math.round(Math.PI * Math.pow(targetRadiusKm || 50, 2) * Math.max(1, locationList.length)).toLocaleString()} km²
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="text-sky-300 hover:text-white font-bold underline cursor-pointer"
                >
                  Add locations in bulk
                </button>
              </div>
            </div>

            {/* Add Locations in Bulk Trigger */}
            <div className="pt-1 flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="text-sky-700 hover:text-sky-900 font-bold underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add locations in bulk</span>
              </button>
              <span className="text-[10px] text-slate-400 font-mono">
                {locationList.length} total active target pins
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Locations Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-600" />
                <span>Add Locations in Bulk (Meta Controls)</span>
              </h4>
              <button type="button" onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Paste a comma-separated or new-line list of cities, postal codes, or regions to add them all at once:
            </p>

            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="e.g. Mumbai, Delhi, Bangalore, Pune, Goa, Jaipur"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-900 outline-none focus:border-sky-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulk}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-black hover:bg-sky-700 shadow-md"
              >
                Apply Bulk Locations
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
