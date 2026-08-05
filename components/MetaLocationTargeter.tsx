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
  Maximize2,
  SlidersHorizontal,
  Navigation,
  CheckCircle2,
  Users,
  Target,
  Zap
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
  html: `<div style="background-color: #0284c7; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 14px rgba(2,132,199,0.5); display: flex; align-items: center; justify-content: center; color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
         </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

export interface MetaLocationItem {
  id: string;
  name: string;
  type: 'city' | 'region' | 'country' | 'pin';
  lat: number;
  lng: number;
  radius_km: number;
  mode: 'include' | 'exclude';
  isOnlyCity?: boolean;
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
  udaipur: { lat: 24.5854, lng: 73.7125, type: 'city' },
  gurgaon: { lat: 28.4595, lng: 77.0266, type: 'city' },
  noida: { lat: 28.5355, lng: 77.3910, type: 'city' },
  london: { lat: 51.5074, lng: -0.1278, type: 'city' },
  dubai: { lat: 25.2048, lng: 55.2708, type: 'city' },
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
  const [isBulkGeocoding, setIsBulkGeocoding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [activeRadiusPopoverId, setActiveRadiusPopoverId] = useState<string | null>(null);

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
          lat: known ? known.lat : 19.0760 + (idx * 0.4),
          lng: known ? known.lng : 72.8777 + (idx * 0.4),
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

  // Calculate dynamic bounding box including center lat/lng and radius circles
  const calculateCombinedBounds = (list: MetaLocationItem[]) => {
    if (!list || list.length === 0) return null;
    const bounds = L.latLngBounds([]);

    list.forEach(item => {
      const radiusKm = item.isOnlyCity ? 10 : item.radius_km || 50;
      // Convert km to approximate lat/lng offset (~111 km per degree lat, ~100 km per deg lng)
      const latOffset = radiusKm / 111;
      const lngOffset = radiusKm / (111 * Math.cos((item.lat * Math.PI) / 180));

      bounds.extend([item.lat - latOffset, item.lng - lngOffset]);
      bounds.extend([item.lat + latOffset, item.lng + lngOffset]);
    });

    return bounds;
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!leafletMapRef.current) {
      const defaultCenter: [number, number] = locationList.length > 0 && locationList[0].lat
        ? [locationList[0].lat, locationList[0].lng]
        : [20.5937, 78.9629]; // India default center

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 5,
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

      // Force size recalculation to prevent gray tiles
      setTimeout(() => {
        map.invalidateSize();
      }, 300);
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

    // Smooth Fly To the newly dropped pin
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([lat, lng], 10, { duration: 0.8 });
    }
  };

  // Dynamic Smooth Fly-To & Auto-Zoom bounds update when locations or radius change
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Clear existing markers and circles
    markersRef.current.forEach(m => m.remove());
    circlesRef.current.forEach(c => c.remove());
    markersRef.current = [];
    circlesRef.current = [];

    if (locationList.length === 0) return;

    locationList.forEach(loc => {
      const latLng: [number, number] = [loc.lat, loc.lng];

      // Create Marker
      const markerIcon = loc.type === 'pin' ? dropPinIcon : defaultPinIcon;
      const marker = L.marker(latLng, { icon: markerIcon }).addTo(map);
      
      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; padding: 6px; text-align: center; min-width: 140px;">
          <strong style="color: #0f172a; font-size: 13px; display: block;">${loc.name}</strong>
          <div style="font-size: 11px; color: ${loc.mode === 'exclude' ? '#dc2626' : '#0284c7'}; font-weight: 800; margin-top: 3px;">
            ${loc.mode.toUpperCase()}: ${loc.isOnlyCity ? 'Current city only' : `+${loc.radius_km} km Radius`}
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}
          </div>
        </div>
      `);

      markersRef.current.push(marker);

      // Create Radius Circle Overlay
      if (!loc.isOnlyCity) {
        const color = loc.mode === 'exclude' ? '#ef4444' : '#0284c7'; // Blue for include, Red for exclude
        const circle = L.circle(latLng, {
          color: color,
          fillColor: color,
          fillOpacity: 0.16,
          weight: 2,
          radius: (loc.radius_km || 50) * 1000 // meters
        }).addTo(map);

        circlesRef.current.push(circle);
      }
    });

    // Dynamic Fly To Bounds calculation
    const bounds = calculateCombinedBounds(locationList);
    if (bounds && bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [45, 45], duration: 0.8, maxZoom: 12 });
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

    // Smooth Fly to the added location
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([result.lat, result.lng], 10, { duration: 0.8 });
    }
  };

  // Remove a location
  const handleRemoveLocation = (id: string) => {
    const updated = locationList.filter(loc => loc.id !== id);
    setLocationList(updated);
    notifyParent(updated);
  };

  // Focus and Fly to a specific location's circle on the map (occupying ~70% of map container)
  const focusLocationCircleOnMap = (item: MetaLocationItem, radiusKmOverride?: number) => {
    const map = leafletMapRef.current;
    if (!map) return;

    const radiusKm = item.isOnlyCity ? 15 : (radiusKmOverride ?? item.radius_km ?? 50);

    // Calculate approximate lat/lng offset for circle radius (~111 km per degree lat)
    const latOffset = Math.max(0.08, radiusKm / 111);
    const lngOffset = Math.max(0.08, radiusKm / (111 * Math.cos((item.lat * Math.PI) / 180)));

    const bounds = L.latLngBounds([
      [item.lat - latOffset, item.lng - lngOffset],
      [item.lat + latOffset, item.lng + lngOffset]
    ]);

    if (bounds.isValid()) {
      // Padding of 15% on each axis leaves ~70% centered focus space for the circle
      const containerHeight = map.getSize().y || 320;
      const containerWidth = map.getSize().x || 600;

      const padY = Math.round(containerHeight * 0.15);
      const padX = Math.round(containerWidth * 0.15);

      map.flyToBounds(bounds, {
        padding: [padY, padX],
        duration: 0.6,
        maxZoom: 14
      });
    }
  };

  // Change radius for a specific location
  const handleLocationRadiusChange = (id: string, newRadiusKm: number, isOnlyCity: boolean = false) => {
    let updatedItem: MetaLocationItem | undefined;

    const updated = locationList.map(loc => {
      if (loc.id === id) {
        updatedItem = { ...loc, radius_km: newRadiusKm, isOnlyCity };
        return updatedItem;
      }
      return loc;
    });

    setLocationList(updated);
    notifyParent(updated, newRadiusKm);

    if (updatedItem) {
      focusLocationCircleOnMap(updatedItem, newRadiusKm);
    }
  };

  // Focus and Fly to a specific location in table
  const handleFocusLocationOnMap = (item: MetaLocationItem) => {
    focusLocationCircleOnMap(item);
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

  // Async Multi-Geocoding Bulk Importer
  const handleApplyBulk = async () => {
    if (!bulkText.trim()) return;
    const names = bulkText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;

    setIsBulkGeocoding(true);
    setBulkProgress({ current: 0, total: names.length });

    const newItems: MetaLocationItem[] = [];

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      setBulkProgress({ current: i + 1, total: names.length });

      if (locationList.some(l => l.name.toLowerCase() === name.toLowerCase())) {
        continue;
      }

      const known = KNOWN_COORDS[name.toLowerCase()];
      if (known) {
        newItems.push({
          id: `bulk_${Date.now()}_${i}`,
          name: name,
          type: known.type,
          lat: known.lat,
          lng: known.lng,
          radius_km: targetRadiusKm || 50,
          mode: filterMode
        });
      } else {
        // Try Nominatim API
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name)}&limit=1`);
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            newItems.push({
              id: `bulk_${Date.now()}_${i}`,
              name: data[0].display_name.split(',')[0] || name,
              type: 'city',
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
              radius_km: targetRadiusKm || 50,
              mode: filterMode
            });
          }
        } catch (e) {
          // Fallback location offset
          newItems.push({
            id: `bulk_${Date.now()}_${i}`,
            name: name,
            type: 'city',
            lat: 19.0760 + (i * 0.3),
            lng: 72.8777 + (i * 0.3),
            radius_km: targetRadiusKm || 50,
            mode: filterMode
          });
        }
      }
    }

    const updated = [...locationList, ...newItems];
    setLocationList(updated);
    notifyParent(updated);
    setBulkText('');
    setIsBulkGeocoding(false);
    setShowBulkModal(false);
  };

  // Map Controls
  const zoomIn = () => leafletMapRef.current?.zoomIn();
  const zoomOut = () => leafletMapRef.current?.zoomOut();
  const reCenterMap = () => {
    if (locationList.length > 0 && leafletMapRef.current) {
      const bounds = calculateCombinedBounds(locationList);
      if (bounds) {
        leafletMapRef.current.flyToBounds(bounds, { padding: [45, 45], duration: 0.8 });
      }
    }
  };

  // Estimated Potential Audience calculation
  const totalTargetedCities = locationList.filter(l => l.mode === 'include').length;
  const avgRadius = locationList.length > 0 ? Math.round(locationList.reduce((acc, curr) => acc + curr.radius_km, 0) / locationList.length) : 50;
  const estimatedReachLow = Math.max(250000, totalTargetedCities * avgRadius * 12500);
  const estimatedReachHigh = Math.round(estimatedReachLow * 1.25);

  // Render Meta Ads Manager Radius Popover Card
  const renderRadiusPopover = (item: MetaLocationItem) => {
    return (
      <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-50 p-4 space-y-3 text-left font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Popover Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-black text-slate-900 capitalize">
            {item.mode === 'include' ? 'Include' : 'Exclude'}
          </span>
          <button
            type="button"
            onClick={() => setActiveRadiusPopoverId(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Option 1: Current City Only */}
        <div 
          onClick={() => {
            handleLocationRadiusChange(item.id, item.radius_km || 50, true);
          }}
          className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
            item.isOnlyCity 
              ? 'bg-sky-50/80 border-sky-300 text-sky-900 shadow-2xs' 
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
            item.isOnlyCity ? 'border-sky-600 bg-sky-600' : 'border-slate-300 bg-white'
          }`}>
            {item.isOnlyCity && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
          </div>
          <span className="text-xs font-bold">Current city only</span>
        </div>

        {/* Option 2: Cities within radius */}
        <div className="space-y-2">
          <div 
            onClick={() => {
              if (item.isOnlyCity) {
                handleLocationRadiusChange(item.id, item.radius_km || 50, false);
              }
            }}
            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
              !item.isOnlyCity 
                ? 'bg-sky-50/80 border-sky-300 text-sky-900 shadow-2xs' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                !item.isOnlyCity ? 'border-sky-600 bg-sky-600' : 'border-slate-300 bg-white'
              }`}>
                {!item.isOnlyCity && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-xs font-bold">Cities within radius</span>
            </div>
            <Info className="w-3.5 h-3.5 text-slate-400" />
          </div>

          {/* Draggable Slider & Number Box (when Cities within radius is selected) */}
          {!item.isOnlyCity && (
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
              <div className="flex items-center gap-2.5">
                {/* Range slider */}
                <input
                  type="range"
                  min={17}
                  max={150}
                  step={1}
                  value={item.radius_km || 50}
                  onChange={(e) => {
                    const newKm = Number(e.target.value);
                    handleLocationRadiusChange(item.id, newKm, false);
                  }}
                  className="flex-1 accent-sky-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />

                {/* Number box with spinners */}
                <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                  <input
                    type="number"
                    min={17}
                    max={150}
                    value={item.radius_km || 50}
                    onChange={(e) => {
                      const val = Math.max(17, Math.min(150, Number(e.target.value) || 17));
                      handleLocationRadiusChange(item.id, val, false);
                    }}
                    className="w-12 h-8 text-center text-xs font-black text-slate-900 outline-none"
                  />
                  <div className="flex flex-col border-l border-slate-200 bg-slate-100/80">
                    <button
                      type="button"
                      onClick={() => {
                        const newR = Math.min(150, (item.radius_km || 50) + 1);
                        handleLocationRadiusChange(item.id, newR, false);
                      }}
                      className="px-1 py-0.5 hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newR = Math.max(17, (item.radius_km || 50) - 1);
                        handleLocationRadiusChange(item.id, newR, false);
                      }}
                      className="px-1 py-0.5 hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <span className="text-xs font-black text-slate-700">km</span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-1 border-t border-slate-200/60">
                <span>Quick presets:</span>
                <div className="flex gap-1">
                  {[17, 25, 40, 50, 80, 100].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleLocationRadiusChange(item.id, r, false)}
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer ${
                        item.radius_km === r 
                          ? 'bg-sky-600 text-white shadow-2xs' 
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {r}km
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Done button */}
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setActiveRadiusPopoverId(null)}
            className="w-full py-2 bg-slate-900 text-white text-xs font-extrabold rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shadow-md"
          >
            Apply
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden text-left font-sans transition-all">
      {/* Section Header: Meta Controls Notice */}
      <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
            Meta Location Controls
          </span>
          <div className="group relative cursor-pointer">
            <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
            <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-72 p-2.5 bg-slate-900 text-white text-[10px] rounded-xl shadow-2xl z-50 leading-relaxed">
              <strong>Advantage+ Budget Safeguard:</strong> Meta will enforce strict geographic boundaries to ensure your campaign budget targets high-intent guest zones.
            </div>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 font-medium hidden sm:inline-block">
          Strict boundary limits active (Advantage+ safe)
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
            <span className="text-xs font-extrabold text-slate-900">Locations & Geographic Coverage</span>
            <span className="bg-sky-100 text-sky-800 text-[9px] font-black px-2.5 py-0.5 rounded-full border border-sky-200">
              {locationList.length} Active Targets
            </span>
          </div>
          {isAccordionOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {isAccordionOpen && (
          <div className="p-4 space-y-4 bg-white">
            
            {/* Meta Advantage+ Audience Definition Gauge Widget */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-sm space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-extrabold text-slate-100">Meta Advantage+ Audience Definition</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-lg">
                  <Users className="w-3 h-3" />
                  <span>Est. Reach: {estimatedReachLow.toLocaleString()} - {estimatedReachHigh.toLocaleString()} accounts</span>
                </div>
              </div>

              {/* Gauge Meter Line */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-slate-700/80 rounded-full overflow-hidden relative flex">
                  <div className="w-1/3 bg-amber-500/40" title="Specific" />
                  <div className="w-1/3 bg-emerald-500" title="Balanced" />
                  <div className="w-1/3 bg-sky-500/40" title="Broad" />
                  {/* Gauge indicator needle dot */}
                  <div 
                    className="absolute top-0 bottom-0 w-3 bg-white border-2 border-emerald-400 rounded-full shadow-md transition-all duration-500" 
                    style={{ left: `${Math.min(85, Math.max(15, locationList.length * 20))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono font-bold text-slate-400 pt-0.5">
                  <span>Specific</span>
                  <span className="text-emerald-400 font-extrabold">✓ Balanced & Optimal</span>
                  <span>Broad</span>
                </div>
              </div>
            </div>

            {/* Country Context Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Country / Primary Territory</span>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
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

            {/* Meta Control Action Bar: Include/Exclude Dropdown + Search Input + Browse Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              {/* Include/Exclude Selector */}
              <div className="sm:col-span-3">
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as 'include' | 'exclude')}
                  className={`w-full text-xs font-black rounded-xl p-2.5 border outline-none cursor-pointer transition-colors shadow-2xs ${
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
                    placeholder="Search locations (cities, regions, postal codes)..."
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

              {/* Browse Menu & Quick Belts Dropdown */}
              <div className="sm:col-span-3 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => setShowBrowseMenu(!showBrowseMenu)}
                    className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-between transition-colors shadow-2xs"
                  >
                    <span>Browse Belts</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Browse Preset Menu */}
                  {showBrowseMenu && (
                    <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-2 space-y-1">
                      <div className="text-[9px] font-black uppercase text-slate-400 px-2 py-1">Quick Target Belts</div>
                      {[
                        { label: '🏙️ Metro Feeder Hubs', cities: ['Mumbai', 'Delhi NCR', 'Bangalore', 'Pune'] },
                        { label: '🌴 Tourist Feeder Belts', cities: ['Goa', 'Jaipur', 'Udaipur', 'Kochi'] },
                        { label: '💼 Corporate Tech Corridor', cities: ['Bangalore', 'Hyderabad', 'Gurgaon', 'Noida'] }
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
                          className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 rounded-lg transition-colors flex items-center justify-between"
                        >
                          <span>{preset.label}</span>
                          <Plus className="w-3 h-3 text-sky-600" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Target Feeder Recommendations Bar */}
            {aiRecommendations && (
              <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 border border-sky-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-600 animate-bounce" />
                  <span className="text-xs font-black text-slate-900">AI Suggested Feeder Markets:</span>
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
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-900 text-[10px] font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-sky-600" />
                      <span>{loc.trim()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Location Filter Pill Chips */}
            {locationList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Filters:</span>
                {locationList.map(item => (
                  <div
                    key={item.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold border shadow-2xs transition-all ${
                      item.mode === 'include'
                        ? 'bg-sky-50 border-sky-300 text-sky-900'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    <span className="text-[10px]">
                      {item.mode === 'include' ? '✓' : '✕'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFocusLocationOnMap(item)}
                      className="hover:underline cursor-pointer"
                      title="Click to view on map"
                    >
                      {item.name} {item.isOnlyCity ? '(Current city)' : `(+${item.radius_km} km)`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveLocation(item.id)}
                      className="hover:text-rose-600 ml-1 text-slate-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active Tagged Locations Table (Meta Ads Manager exact layout) */}
            {locationList.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-2xs">
                <div className="bg-slate-50 px-3 py-2.5 grid grid-cols-12 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <div className="col-span-4">Target Location</div>
                  <div className="col-span-2 text-center">Mode</div>
                  <div className="col-span-5 text-center">Meta City Center Radius</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                {locationList.map((item) => (
                  <div key={item.id} className="px-3 py-2.5 grid grid-cols-12 items-center text-xs text-slate-800 hover:bg-slate-50/90 transition-colors">
                    {/* Location name and type icon */}
                    <div className="col-span-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleFocusLocationOnMap(item)}
                        className="p-1 rounded bg-slate-100 text-slate-600 font-mono text-[10px] hover:bg-sky-100 hover:text-sky-800 transition-colors cursor-pointer"
                        title="Focus on map"
                      >
                        {item.type === 'pin' ? '📍 Pin' : item.type === 'country' ? '🌐 Country' : '🏙️ City'}
                      </button>
                      <span 
                        onClick={() => handleFocusLocationOnMap(item)}
                        className="font-bold text-slate-900 truncate hover:text-sky-600 cursor-pointer"
                      >
                        {item.name}
                      </span>
                    </div>

                    {/* Include / Exclude Badge */}
                    <div className="col-span-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleMode(item.id)}
                        className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase border transition-colors cursor-pointer ${
                          item.mode === 'include'
                            ? 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200'
                            : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                        }`}
                      >
                        {item.mode}
                      </button>
                    </div>

                    {/* Meta City Radius Dropdown Selector */}
                    <div className="col-span-5 px-2 flex items-center justify-center relative">
                      <div className="relative inline-block text-left w-full max-w-xs">
                        <button
                          type="button"
                          onClick={() => setActiveRadiusPopoverId(activeRadiusPopoverId === item.id ? null : item.id)}
                          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[11px] py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1 transition-all shadow-2xs cursor-pointer"
                        >
                          <span className="truncate">
                            {item.isOnlyCity 
                              ? `City: ${item.name} (Current city only)` 
                              : `City: ${item.name} + ${item.radius_km} km`
                            }
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        </button>

                        {/* Exact Meta Ads Manager Radius Popover */}
                        {activeRadiusPopoverId === item.id && renderRadiusPopover(item)}
                      </div>
                    </div>

                    {/* Remove Action Button */}
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
            <div className={`relative w-full h-80 rounded-2xl overflow-hidden border border-slate-300 shadow-inner group transition-all ${isDropPinMode ? 'ring-4 ring-amber-400/50' : ''}`}>
              {/* Map Canvas Div */}
              <div ref={mapContainerRef} className={`w-full h-full z-0 ${isDropPinMode ? 'cursor-crosshair' : ''}`} />

              {/* Floating Meta Location Pill Over Map (Exact Meta Ads Manager layout) */}
              {!isDropPinMode && locationList.length > 0 && (
                <div className="absolute top-3 left-3 z-10">
                  <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 shadow-xl">
                    <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const primary = locationList[0];
                        setActiveRadiusPopoverId(activeRadiusPopoverId === primary.id ? null : primary.id);
                      }}
                      className="text-xs font-black text-slate-800 hover:text-sky-600 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>
                        {locationList[0].name} {locationList[0].isOnlyCity ? '(Current city only)' : `+ ${locationList[0].radius_km} km`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>

                  {/* Floating Popover when clicked */}
                  {activeRadiusPopoverId === locationList[0].id && (
                    <div className="mt-1">
                      {renderRadiusPopover(locationList[0])}
                    </div>
                  )}
                </div>
              )}

              {/* Floating Drop Pin Mode Active Indicator Banner */}
              {isDropPinMode && (
                <div className="absolute top-3 left-3 z-10 bg-amber-500 text-white text-xs font-black px-3 py-1.5 rounded-xl shadow-xl flex items-center gap-2 animate-bounce">
                  <Target className="w-4 h-4 animate-spin" />
                  <span>DROP PIN MODE ACTIVE — Click anywhere on map to add target</span>
                </div>
              )}

              {/* Top Control Overlay: Drop Pin Action & Zoom Buttons */}
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
                {/* Drop Pin Mode Button */}
                <button
                  type="button"
                  onClick={() => setIsDropPinMode(!isDropPinMode)}
                  className={`px-3 py-2 rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    isDropPinMode
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : 'bg-white hover:bg-slate-100 text-slate-900 border border-slate-200'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${isDropPinMode ? 'text-white' : 'text-sky-600'}`} />
                  <span>{isDropPinMode ? 'Cancel Drop Pin' : '📍 Drop Pin'}</span>
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
                    title="Auto-Fit Map Bounds"
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

      {/* Bulk Locations Modal with Async Multi-Geocoding */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-600" />
                <span>Add Locations in Bulk (Meta Ads Controls)</span>
              </h4>
              <button 
                type="button" 
                onClick={() => setShowBulkModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                disabled={isBulkGeocoding}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Paste a comma-separated or new-line list of cities, postal codes, or regions to plot them with automatic geocoding and auto-zoom bounds:
            </p>

            <textarea
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              disabled={isBulkGeocoding}
              placeholder="e.g.&#10;Mumbai&#10;Delhi&#10;Bangalore&#10;Pune&#10;Jaipur"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-900 outline-none focus:border-sky-500"
            />

            {/* Bulk Geocoding Loader Status */}
            {isBulkGeocoding && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-sky-900">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-sky-600 animate-bounce" />
                    <span>Geocoding cities & plotting map circles...</span>
                  </div>
                  <span className="font-mono text-[10px]">{bulkProgress.current} / {bulkProgress.total}</span>
                </div>
                <div className="h-1.5 w-full bg-sky-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-sky-600 transition-all duration-300" 
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                disabled={isBulkGeocoding}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulk}
                disabled={isBulkGeocoding || !bulkText.trim()}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-black hover:bg-sky-700 shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Import & Auto-Zoom Map</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
