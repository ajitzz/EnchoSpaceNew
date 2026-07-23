import React, { useState, useMemo } from 'react';
import { Search, Plus, Check } from 'lucide-react';

const AMENITIES_DB = [
  { id: 'wifi', label: 'Wifi', icon: '📶', category: 'Essentials' },
  { id: 'kitchen', label: 'Kitchen', icon: '🍳', category: 'Essentials' },
  { id: 'washer', label: 'Washer', icon: '🧺', category: 'Essentials' },
  { id: 'dryer', label: 'Dryer', icon: '👕', category: 'Essentials' },
  { id: 'ac', label: 'Air conditioning', icon: '❄️', category: 'Essentials' },
  { id: 'heating', label: 'Heating', icon: '🔥', category: 'Essentials' },
  { id: 'workspace', label: 'Dedicated workspace', icon: '💻', category: 'Essentials' },
  { id: 'tv', label: 'TV', icon: '📺', category: 'Essentials' },
  { id: 'hair_dryer', label: 'Hair dryer', icon: '💨', category: 'Essentials' },
  { id: 'iron', label: 'Iron', icon: '👔', category: 'Essentials' },
  
  { id: 'pool', label: 'Pool', icon: '🏊‍♂️', category: 'Features' },
  { id: 'hot_tub', label: 'Hot tub', icon: '🛁', category: 'Features' },
  { id: 'parking', label: 'Free parking', icon: '🚗', category: 'Features' },
  { id: 'ev_charger', label: 'EV charger', icon: '⚡', category: 'Features' },
  { id: 'cot', label: 'Cot', icon: '🛏️', category: 'Features' },
  { id: 'gym', label: 'Gym', icon: '🏋️‍♂️', category: 'Features' },
  { id: 'bbq', label: 'BBQ grill', icon: '🍖', category: 'Features' },
  { id: 'breakfast', label: 'Breakfast', icon: '🥐', category: 'Features' },
  { id: 'fireplace', label: 'Indoor fireplace', icon: '🪵', category: 'Features' },
  { id: 'smoking', label: 'Smoking allowed', icon: '🚬', category: 'Features' },
  { id: 'beachfront', label: 'Beachfront', icon: '🏖️', category: 'Features' },
  { id: 'waterfront', label: 'Waterfront', icon: '🌊', category: 'Features' },
  { id: 'ski', label: 'Ski-in/Ski-out', icon: '🎿', category: 'Features' },

  { id: 'smoke_alarm', label: 'Smoke alarm', icon: '🚨', category: 'Safety' },
  { id: 'co_alarm', label: 'Carbon monoxide alarm', icon: '⚠️', category: 'Safety' },
  { id: 'fire_ext', label: 'Fire extinguisher', icon: '🧯', category: 'Safety' },
  { id: 'first_aid', label: 'First aid kit', icon: '🩹', category: 'Safety' },
];

export const AmenitiesPicker = ({ selected, onChange }: { selected: string[]; onChange: (sel: string[]) => void }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Default to showing the first 8 essentials if not expanded
  const mainAmenities = useMemo(() => AMENITIES_DB.slice(0, 8), []);

  const toggleAmenity = (id: string, lbl: string) => {
    // Determine the string representation to store (for DB compatibility, we might just use the label)
    // The previous implementation used the ID or label? Let's use `label` directly to be consistent with server.ts rendering.
    // Wait, the previous code stored `amenity.id` but `server.ts` fallback used `['Wifi', 'Kitchen']`. 
    // Let's store the `lbl` directly.
    
    if (selected.includes(lbl)) {
      onChange(selected.filter(a => a !== lbl));
    } else {
      onChange([...selected, lbl]);
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return AMENITIES_DB;
    return AMENITIES_DB.filter(a => a.label.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  const categories = Array.from(new Set(filtered.map(a => a.category)));

  return (
    <div className="space-y-6">
      {!expanded ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {mainAmenities.map((amenity) => {
              const isSelected = selected.includes(amenity.label);
              return (
                <button
                  key={amenity.id}
                  type="button"
                  onClick={() => toggleAmenity(amenity.id, amenity.label)}
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-3 ${
                    isSelected 
                      ? 'border-[#0284C7] bg-[#0284C7]/5 text-[#0284C7]' 
                      : 'border-gray-100 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="text-3xl">{amenity.icon}</span>
                  <span className="text-sm font-bold text-center leading-tight">{amenity.label}</span>
                </button>
              );
            })}
          </div>
          <button 
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full border border-gray-900 font-bold hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Show all amenities
          </button>
        </>
      ) : (
        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-xl">All Amenities</h3>
            <button 
              type="button"
              onClick={() => setExpanded(false)}
              className="text-sm font-bold underline"
            >
              Show less
            </button>
          </div>
          
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search amenities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none text-canvas bg-dune"
            />
          </div>

          <div className="space-y-8 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
            {categories.map(cat => (
              <div key={cat}>
                <h4 className="font-bold text-canvas mb-4">{cat}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {filtered.filter(a => a.category === cat).map(amenity => {
                    const isSelected = selected.includes(amenity.label);
                    return (
                      <button
                        key={amenity.id}
                        type="button"
                        onClick={() => toggleAmenity(amenity.id, amenity.label)}
                        className={`flex items-center gap-3 p-3 text-left rounded-xl border transition-all ${
                          isSelected ? 'border-gray-900 bg-dune shadow-sm ring-1 ring-gray-900' : 'border-gray-200 bg-dune hover:border-gray-400'
                        }`}
                      >
                        <div className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-white ${isSelected ? 'bg-gray-900' : 'border border-gray-300'}`}>
                          {isSelected && <Check className="w-4 h-4" />}
                        </div>
                        <span className="text-xl leading-none">{amenity.icon}</span>
                        <span className="text-sm font-medium flex-1">{amenity.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No amenities found for "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
