import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';

// Fix typical React-Leaflet icon issue
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface LocationPickerProps {
  address: string;
  city: string;
  lat?: number | null;
  lng?: number | null;
  onChange: (updates: { address: string; city: string; lat?: number; lng?: number }) => void;
}

const DraggableMarker = ({ position, setPosition }: { position: L.LatLng; setPosition: (p: L.LatLng) => void }) => {
  const markerRef = useRef<L.Marker>(null);

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return (
    <Marker
      draggable={true}
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker != null) {
            setPosition(marker.getLatLng());
          }
        },
      }}
      position={position}
      ref={markerRef}
      icon={customIcon}
    />
  );
};

function MapPosition({ position }: { position: L.LatLng }) {
  const map = useMap();
  useEffect(() => { map.panTo(position); }, [map, position]);
  return null;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ address, city, lat, lng, onChange }) => {
  // An initial map center is only a viewing aid; it is never saved as the property address.
  const [position, setPosition] = useState<L.LatLng>(() => new L.LatLng(lat ?? 20.5937, lng ?? 78.9629));
  const [loading, setLoading] = useState(false);
  const selectPosition = (next: L.LatLng) => {
    setPosition(next);
    onChange({ address, city, lat: next.lat, lng: next.lng });
  };

  const useCurrentLocation = () => {
    setLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          selectPosition(new L.LatLng(pos.coords.latitude, pos.coords.longitude));
          setLoading(false);
        },
        () => {
          alert("Could not get your location. Please check browser permissions.");
          setLoading(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h3 className="font-bold text-gray-900">Pinpoint your location</h3>
          <p className="text-sm text-gray-500">Drag the pin to your exact spot.</p>
        </div>
        <button
          onClick={useCurrentLocation}
          type="button"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-colors text-gray-800 disabled:opacity-50"
        >
          {loading ? (
             <span className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-gray-800 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          Use current location
        </button>
      </div>

      <div className="w-full h-80 rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative">
        <MapContainer 
          center={position} 
          zoom={lat != null && lng != null ? 13 : 5}
          scrollWheelZoom={false} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapPosition position={position} />
          <DraggableMarker position={position} setPosition={selectPosition} />
        </MapContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="space-y-2">
          <label htmlFor="property-city" className="text-sm font-bold text-gray-700 uppercase tracking-wider">City</label>
          <input 
            id="property-city"
            required 
            value={city} 
            onChange={(e) => onChange({ city: e.target.value, address })}
            className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none transition-shadow" 
            placeholder="City or destination"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="property-address" className="text-sm font-bold text-gray-700 uppercase tracking-wider">Street Address</label>
          <div className="relative">
            <input 
              id="property-address"
              required 
              value={address} 
              onChange={(e) => onChange({ city, address: e.target.value })}
              className="w-full p-4 pl-12 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none transition-shadow" 
              placeholder="e.g. 123 Main St" 
            />
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
