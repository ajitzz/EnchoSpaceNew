import React, { useState, useEffect, useRef } from 'react';
import { uiAudio } from './audio';
import { ChevronDown, FilterIcon, XIcon, HomeIcon, BriefcaseIcon, TreeIcon } from './Icons';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';

interface FilterState {
    minPrice?: string;
    maxPrice?: string;
    type?: string;
    amenities?: string[];
    bedrooms?: number;
    beds?: number;
    bathrooms?: number;
    maxGuests?: number;
    sort?: string;
}

interface FilterBarProps {
    currentFilters: FilterState;
    onFilterChange: (filters: FilterState) => void;
}

function useClickOutside(ref: React.RefObject<any>, handler: () => void) {
  useEffect(() => {
    const listener = (event: any) => {
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

const FilterChip = ({ label, active = false, hasDropdown = false, onClick }: { label: string; active?: boolean, hasDropdown?: boolean, onClick?: () => void }) => (
  <button onClick={onClick} className={`
    group flex items-center justify-center gap-2 px-3 lg:px-5 py-2 lg:py-2.5 rounded-full text-xs lg:text-sm font-medium transition-all duration-200 whitespace-nowrap border select-none
    ${active 
        ? 'bg-gray-900 border-gray-900 text-white shadow-lg lg:shadow-gray-200' 
        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-800 hover:shadow-sm active:bg-gray-50'}
  `}>
    <span>{label}</span>
    {hasDropdown && (
      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-180 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-900'}`} />
    )}
  </button>
);

// Simulated Price Distribution Data
const PRICE_DISTRIBUTION = [
  { price: 1000, count: 5 }, { price: 2000, count: 12 }, { price: 3000, count: 25 },
  { price: 4000, count: 42 }, { price: 5000, count: 56 }, { price: 6000, count: 45 },
  { price: 7000, count: 32 }, { price: 8000, count: 20 }, { price: 9000, count: 15 },
  { price: 10000, count: 10 }, { price: 11000, count: 8 }, { price: 12000, count: 5 },
  { price: 13000, count: 3 }, { price: 14000, count: 2 }, { price: 15000, count: 1 }
];

const FilterBar: React.FC<FilterBarProps> = ({ currentFilters, onFilterChange }) => {
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useClickOutside(popoverRef, () => setActivePopover(null));

  const isMobileView = () => typeof window !== 'undefined' && window.innerWidth < 768;

  // Local state for the unified modal
  const [localMin, setLocalMin] = useState(currentFilters.minPrice || '');
  const [localMax, setLocalMax] = useState(currentFilters.maxPrice || '');
  const [localType, setLocalType] = useState(currentFilters.type || '');
  const [localAmenities, setLocalAmenities] = useState<string[]>(currentFilters.amenities || []);
  const [localBedrooms, setLocalBedrooms] = useState(currentFilters.bedrooms || 0);
  const [localBeds, setLocalBeds] = useState(currentFilters.beds || 0);
  const [localBathrooms, setLocalBathrooms] = useState(currentFilters.bathrooms || 0);
  const [localSort, setLocalSort] = useState(currentFilters.sort || '');

  const openMoreFilters = () => {
    setLocalMin(currentFilters.minPrice || '');
    setLocalMax(currentFilters.maxPrice || '');
    setLocalType(currentFilters.type || '');
    setLocalAmenities(currentFilters.amenities || []);
    setLocalBedrooms(currentFilters.bedrooms || 0);
    setLocalBeds(currentFilters.beds || 0);
    setLocalBathrooms(currentFilters.bathrooms || 0);
    setLocalSort(currentFilters.sort || '');
    setShowMoreFilters(true);
  };

  const handleChipClick = (type: string) => {
    uiAudio.playClick();
    if (isMobileView()) {
        openMoreFilters();
    } else {
        setActivePopover(activePopover === type ? null : type);
    }
  };

  const applyAdvancedFilters = () => {
    onFilterChange({
        ...currentFilters,
        minPrice: localMin,
        maxPrice: localMax,
        type: localType || undefined,
        amenities: localAmenities.length > 0 ? localAmenities : undefined,
        bedrooms: localBedrooms > 0 ? localBedrooms : undefined,
        beds: localBeds > 0 ? localBeds : undefined,
        bathrooms: localBathrooms > 0 ? localBathrooms : undefined,
        sort: localSort || undefined,
    });
    setShowMoreFilters(false);
  };

  const clearAdvancedFilters = () => {
    setLocalMin('');
    setLocalMax('');
    setLocalType('');
    setLocalAmenities([]);
    setLocalBedrooms(0);
    setLocalBeds(0);
    setLocalBathrooms(0);
    setLocalSort('');
    onFilterChange({
        minPrice: undefined,
        maxPrice: undefined,
        type: undefined,
        amenities: undefined,
        bedrooms: undefined,
        beds: undefined,
        bathrooms: undefined,
        sort: undefined,
    });
  };

  // Inline Handlers for Desktop Popovers
  const applyPrice = () => {
    onFilterChange({ ...currentFilters, minPrice: localMin, maxPrice: localMax });
    setActivePopover(null);
  };
  const clearPrice = () => {
    setLocalMin('');
    setLocalMax('');
    onFilterChange({ ...currentFilters, minPrice: undefined, maxPrice: undefined });
    setActivePopover(null);
  };

  const toggleType = (type: string) => {
    const newType = currentFilters.type === type ? undefined : type;
    onFilterChange({ ...currentFilters, type: newType });
    setActivePopover(null);
  };

  const toggleSort = (sortVal: string) => {
    onFilterChange({ ...currentFilters, sort: currentFilters.sort === sortVal ? undefined : sortVal });
    setActivePopover(null);
  };

  const toggleAmenity = (amenity: string) => {
    const currentList = currentFilters.amenities || [];
    const newList = currentList.includes(amenity) 
        ? currentList.filter(a => a !== amenity)
        : [...currentList, amenity];
    onFilterChange({ ...currentFilters, amenities: newList });
  };

  const toggleLocalAmenity = (amenity: string) => {
    setLocalAmenities(prev => 
        prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    );
  };

  const propertyTypes = ['Apartment', 'House', 'Barn', 'Bed & breakfast', 'Boat', 'Cabin', 'Campervan', 'Castle'];
  const allAmenities = ['Wifi', 'Kitchen', 'Washing machine', 'Air conditioning', 'Pool', 'Hot tub', 'Fire pit', 'BBQ grill', 'Free parking', 'First aid kit', 'TV', 'Gym'];
  const sortOptions = [
    { label: 'Recommended', value: '' },
    { label: 'Price: Low to High', value: 'price_asc' },
    { label: 'Price: High to Low', value: 'price_desc' }
  ];

  const renderPriceHistogram = (minVal: string, maxVal: string) => {
    const minP = parseInt(minVal) || 0;
    const maxP = parseInt(maxVal) || Infinity;
    
    return (
      <div className="h-20 w-full flex items-end justify-center mb-4 transition-opacity px-2">
         <ResponsiveContainer width="100%" height="100%">
           <BarChart data={PRICE_DISTRIBUTION} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
             <Bar dataKey="count" radius={[2, 2, 0, 0]}>
               {PRICE_DISTRIBUTION.map((entry, index) => {
                 const isActive = entry.price >= minP && (maxP === Infinity || entry.price <= maxP);
                 return (
                   <Cell key={`cell-${index}`} fill={isActive ? '#000000' : '#E5E7EB'} />
                 );
               })}
             </Bar>
           </BarChart>
         </ResponsiveContainer>
      </div>
    );
  };

  return (
    <>
      <div className="sticky top-20 z-40 bg-white/95 backdrop-blur-3xl border-b border-gray-100 py-3 md:py-4 transition-all duration-300">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 flex items-center justify-between gap-4 relative">
        
        {/* Scrollable Filter List - Removed masking on Desktop, only on mobile */}
        <div className="flex-1 min-w-0 flex items-center gap-2 md:gap-3 overflow-x-auto pb-2 md:pb-0 scrollbar-hide pr-2 md:pr-0">
            <FilterChip label="All homes" active={!currentFilters.minPrice && !currentFilters.maxPrice && !currentFilters.type && !currentFilters.amenities?.length && !currentFilters.bedrooms && !currentFilters.sort} onClick={() => {
                clearPrice();
                onFilterChange({});
            }} />
            <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0 hidden md:block"></div>
            
            <div className="relative group/popover" ref={activePopover === 'price' ? popoverRef : null}>
                <FilterChip 
                    label={currentFilters.minPrice || currentFilters.maxPrice ? `Price: ₹${currentFilters.minPrice || '0'} - ₹${currentFilters.maxPrice || 'Any'}` : 'Price'} 
                    hasDropdown 
                    active={!!currentFilters.minPrice || !!currentFilters.maxPrice}
                    onClick={() => handleChipClick('price')}
                />
                
                {activePopover === 'price' && (
                    <div className="absolute top-[calc(100%+0.5rem)] left-0 bg-white rounded-[2rem] shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-gray-100 p-6 md:p-8 w-[90vw] max-w-[380px] z-50 animate-scale-in">
                        <h4 className="font-bold text-gray-900 mb-2 text-lg">Price range</h4>
                        <p className="text-sm text-gray-500 mb-6">Nightly prices before fees and taxes</p>
                        {renderPriceHistogram(localMin, localMax)}
                        <div className="flex items-center gap-4 mb-8">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Minimum</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-medium">₹</span>
                                    <input 
                                        type="number" 
                                        value={localMin}
                                        onChange={e => setLocalMin(e.target.value)}
                                        className="w-full pl-8 pr-4 py-3.5 bg-white border border-gray-300 hover:border-gray-900 rounded-2xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all font-medium text-gray-900" 
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <span className="text-gray-300 mt-6">-</span>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Maximum</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-medium">₹</span>
                                    <input 
                                        type="number" 
                                        value={localMax}
                                        onChange={e => setLocalMax(e.target.value)}
                                        className="w-full pl-8 pr-4 py-3.5 bg-white border border-gray-300 hover:border-gray-900 rounded-2xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all font-medium text-gray-900" 
                                        placeholder="Any"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-5 border-t border-gray-100">
                            <button onClick={clearPrice} className="text-sm font-semibold underline text-gray-900 hover:text-gray-500 transition-colors">Clear</button>
                            <button onClick={applyPrice} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-black transition-transform active:scale-95 shadow-md">Apply</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative" ref={activePopover === 'type' ? popoverRef : null}>
                <FilterChip 
                    label={currentFilters.type || 'Property type'} 
                    hasDropdown 
                    active={!!currentFilters.type}
                    onClick={() => handleChipClick('type')}
                />
                
                {activePopover === 'type' && (
                    <div className="absolute top-[calc(100%+0.5rem)] left-0 bg-white rounded-[2rem] shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-gray-100 p-6 w-[90vw] max-w-[340px] z-50 animate-scale-in">
                        <div className="grid grid-cols-2 gap-3">
                            {propertyTypes.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => toggleType(type)}
                                    className={`px-4 py-3 md:py-4 text-left rounded-xl md:rounded-2xl text-sm transition-all border-2 ${currentFilters.type === type ? 'bg-gray-900 border-gray-900 text-white font-semibold shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-600'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative" ref={activePopover === 'amenities' ? popoverRef : null}>
                <FilterChip 
                    label={currentFilters.amenities?.length ? `Amenities (${currentFilters.amenities.length})` : 'Amenities'} 
                    hasDropdown 
                    active={!!currentFilters.amenities?.length}
                    onClick={() => handleChipClick('amenities')}
                />
                
                {activePopover === 'amenities' && (
                    <div className="absolute top-[calc(100%+0.5rem)] left-0 bg-white rounded-[2rem] shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-gray-100 p-6 md:p-8 w-[90vw] max-w-[420px] z-50 animate-scale-in">
                        <h4 className="font-bold text-gray-900 mb-6 text-lg">Top Amenities</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {allAmenities.slice(0, 10).map((amenity) => (
                                <label key={amenity} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors group">
                                    <div className="relative flex items-center justify-center">
                                      <input 
                                        type="checkbox" 
                                        checked={currentFilters.amenities?.includes(amenity) || false}
                                        onChange={() => toggleAmenity(amenity)}
                                        className="peer w-5 h-5 appearance-none border-2 border-gray-300 rounded cursor-pointer checked:bg-gray-900 checked:border-gray-900 transition-all hover:border-gray-500" 
                                      />
                                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium select-none group-hover:text-gray-900">{amenity}</span>
                                </label>
                            ))}
                        </div>
                         <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                            <button onClick={openMoreFilters} className="text-sm font-semibold underline text-gray-900 hover:text-gray-600 transition-colors">View all amenities</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative" ref={activePopover === 'sort' ? popoverRef : null}>
                <FilterChip 
                    label={currentFilters.sort ? sortOptions.find(o => o.value === currentFilters.sort)?.label || 'Sort' : 'Sort'} 
                    hasDropdown 
                    active={!!currentFilters.sort}
                    onClick={() => handleChipClick('sort')}
                />
                
                {activePopover === 'sort' && (
                    <div className="absolute top-[calc(100%+0.5rem)] left-0 bg-white rounded-3xl shadow-[0_12px_48px_rgba(0,0,0,0.12)] border border-gray-100 p-4 w-[90vw] max-w-[240px] z-50 animate-scale-in">
                        <div className="flex flex-col gap-1">
                            {sortOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleSort(opt.value)}
                                    className={`px-4 py-3 text-left rounded-xl text-sm transition-all ${currentFilters.sort === opt.value || (!currentFilters.sort && opt.value === '') ? 'bg-gray-50 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Filters Action Button / Toggle right side */}
        <div className="flex items-center gap-3 md:gap-6 flex-shrink-0 pl-3 md:pl-6 border-l border-gray-100">
             <button onClick={openMoreFilters} className="flex items-center gap-2 text-sm font-bold text-gray-900 md:text-gray-700 md:hover:bg-gray-50 md:px-3 py-2 rounded-lg transition-colors">
                <FilterIcon className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden md:block">Filters</span>
             </button>
             
             <div className="hidden lg:flex items-center gap-3 text-sm font-medium text-gray-600 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-900 hover:text-gray-900 transition-colors group">
                <span className="group-hover:font-semibold transition-all">Total price before taxes</span>
                <div className="w-9 h-5 bg-gray-200 rounded-full relative transition-colors group-hover:bg-gray-300">
                    <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 left-0.5 shadow-sm transform transition-transform group-hover:translate-x-4"></div>
                </div>
            </div>
        </div>
      </div>
      </div>

      {/* Advanced Filters Modal - Production Grade Unified Screen */}
      {showMoreFilters && (
        <div className="fixed inset-0 z-[250] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in md:p-6 lg:p-12">
            <div className="bg-white md:rounded-[2rem] shadow-2xl w-full h-[95vh] md:h-[85vh] md:max-w-4xl overflow-hidden flex flex-col rounded-t-[2rem] animate-slide-up sm:animate-scale-in">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <button onClick={() => setShowMoreFilters(false)} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors group">
                        <XIcon className="w-5 h-5 text-gray-900 group-hover:scale-110 transition-transform" />
                    </button>
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Advanced Filters</h2>
                    <div className="w-10"></div>
                </div>
                
                <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 space-y-14 bg-white scroll-smooth relative">
                    
                    {/* Sort By section (important for mobile where hover menu is not accessible) */}
                    {isMobileView() && (
                        <section>
                            <h3 className="text-2xl font-bold text-gray-900 mb-6 tracking-tight">Sort By</h3>
                            <div className="flex flex-wrap gap-3">
                                {sortOptions.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setLocalSort(localSort === opt.value ? '' : opt.value)}
                                        className={`px-5 py-3 rounded-full text-sm font-semibold transition-all border-2 ${localSort === opt.value || (!localSort && opt.value === '') ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                    {isMobileView() && <div className="w-full h-px bg-gray-100"></div>}

                    {/* Price Range */}
                    <section>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Price range</h3>
                        <p className="text-gray-500 text-base mb-4">Nightly prices before fees and taxes</p>
                        <div className="mb-6 -mx-4 md:mx-0 px-4 md:px-0">
                            {renderPriceHistogram(localMin, localMax)}
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="relative w-full">
                                <label className="absolute -top-3 left-4 bg-white px-2 mb-0 text-xs font-bold text-gray-400 uppercase tracking-wider z-10 transition-colors peer-focus-within:text-gray-900">Minimum</label>
                                <div className="relative peer-focus-within:ring-2 ring-gray-900 rounded-2xl transition-shadow border border-gray-300">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-900 font-semibold text-lg">₹</span>
                                    <input 
                                        type="number" 
                                        value={localMin}
                                        onChange={e => setLocalMin(e.target.value)}
                                        className="w-full pl-10 pr-5 py-5 bg-transparent border-none focus:ring-0 outline-none transition-all font-semibold text-gray-900 text-lg rounded-2xl" 
                                        placeholder="1,000"
                                    />
                                </div>
                            </div>
                            <span className="text-gray-400 hidden md:block">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path></svg>
                            </span>
                            <div className="relative w-full">
                                <label className="absolute -top-3 left-4 bg-white px-2 mb-0 text-xs font-bold text-gray-400 uppercase tracking-wider z-10 transition-colors peer-focus-within:text-gray-900">Maximum</label>
                                <div className="relative peer-focus-within:ring-2 ring-gray-900 rounded-2xl transition-shadow border border-gray-300">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-900 font-semibold text-lg">₹</span>
                                    <input 
                                        type="number" 
                                        value={localMax}
                                        onChange={e => setLocalMax(e.target.value)}
                                        className="w-full pl-10 pr-5 py-5 bg-transparent border-none focus:ring-0 outline-none transition-all font-semibold text-gray-900 text-lg rounded-2xl" 
                                        placeholder="Any"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="w-full h-px bg-gray-100"></div>

                    {/* Property Type */}
                    <section>
                        <h3 className="text-2xl font-bold text-gray-900 mb-8 tracking-tight">Property type</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
                            {propertyTypes.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setLocalType(localType === type ? '' : type)}
                                    className={`flex flex-col items-start gap-6 p-5 rounded-[1.5rem] text-sm transition-all border-2 ${localType === type ? 'border-gray-900 bg-gray-50 scale-[0.98]' : 'border-gray-200 bg-white hover:border-gray-400'}`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${localType === type ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {type === 'Apartment' && <BriefcaseIcon className="w-5 h-5" />}
                                        {type === 'House' && <HomeIcon className="w-5 h-5" />}
                                        {type === 'Cabin' && <TreeIcon className="w-5 h-5" />}
                                        {type !== 'Apartment' && type !== 'House' && type !== 'Cabin' && <HomeIcon className="w-5 h-5" />}
                                    </div>
                                    <span className={`font-bold text-base ${localType === type ? 'text-gray-900' : 'text-gray-800'}`}>{type}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="w-full h-px bg-gray-100"></div>

                    {/* Amenities */}
                    <section>
                        <h3 className="text-2xl font-bold text-gray-900 mb-8 tracking-tight">Amenities</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-10">
                            {allAmenities.map((amenity) => (
                                <label key={amenity} className="flex items-center gap-5 p-2 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors group">
                                    <div className="relative flex items-center justify-center border-gray-300">
                                      <input 
                                        type="checkbox" 
                                        checked={localAmenities.includes(amenity)}
                                        onChange={() => toggleLocalAmenity(amenity)}
                                        className="peer w-7 h-7 appearance-none border-2 border-gray-300 rounded-lg cursor-pointer checked:bg-gray-900 checked:border-gray-900 transition-all group-hover:border-gray-500" 
                                      />
                                      <svg className="absolute w-4 h-4 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <span className="text-lg text-gray-800 select-none group-hover:text-gray-900">{amenity}</span>
                                </label>
                            ))}
                        </div>
                    </section>

                    <div className="w-full h-px bg-gray-100"></div>

                    {/* Rooms and beds */}
                    <section>
                        <h3 className="text-2xl font-bold text-gray-900 mb-8 tracking-tight">Rooms and beds</h3>
                        <div className="space-y-8 max-w-2xl">
                            {[
                                { label: 'Bedrooms', value: localBedrooms, setter: setLocalBedrooms },
                                { label: 'Beds', value: localBeds, setter: setLocalBeds },
                                { label: 'Bathrooms', value: localBathrooms, setter: setLocalBathrooms },
                            ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between pb-8 border-b border-gray-100 last:border-0 last:pb-0">
                                    <span className="text-gray-900 text-lg font-medium">{item.label}</span>
                                    <div className="flex items-center gap-4 md:gap-6">
                                        <button 
                                            onClick={() => item.setter(Math.max(0, item.value - 1))}
                                            className={`w-10 h-10 md:w-12 md:h-12 rounded-full border flex items-center justify-center transition-all ${item.value > 0 ? 'border-gray-400 text-gray-600 hover:border-gray-900 hover:text-gray-900 hover:shadow-md active:scale-95' : 'border-gray-200 text-gray-200 cursor-not-allowed bg-gray-50'}`}
                                            disabled={item.value === 0}
                                        >
                                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
                                        </button>
                                        <span className="w-8 text-center text-xl font-medium">{item.value === 0 ? 'Any' : item.value}</span>
                                        <button 
                                            onClick={() => item.setter(item.value + 1)}
                                            className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-400 text-gray-600 flex items-center justify-center hover:border-gray-900 hover:text-gray-900 hover:shadow-md transition-all active:scale-95"
                                        >
                                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <div className="h-10"></div>
                </div>

                <div className="p-5 md:px-10 md:py-6 border-t border-gray-100 flex items-center justify-between bg-white w-full sticky bottom-0 z-20">
                    <button onClick={clearAdvancedFilters} className="text-base font-bold underline text-gray-900 hover:text-gray-600 transition-colors p-2">Clear all</button>
                    <button onClick={applyAdvancedFilters} className="bg-gray-900 text-white px-10 py-3.5 md:py-4 rounded-xl font-bold text-base hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-95">Show places</button>
                </div>
            </div>
        </div>
      )}

    </>
  );
};

export default FilterBar;
