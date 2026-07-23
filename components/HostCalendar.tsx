import React, { useState, useMemo, useEffect } from 'react';
import { Listing, Offer } from '../types';
import { ChevronRight, ChevronLeft, ChevronDown, Check } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useCurrency } from './CurrencyContext';

interface HostCalendarProps {
  listings: Listing[];
  reservations: any[]; 
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HostCalendar({ listings, reservations }: HostCalendarProps) {
  const { formatPrice, currency } = useCurrency();
  const [selectedListingId, setSelectedListingId] = useState<string | null>(listings.length > 0 ? listings[0].id : null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<number[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [calendarPrices, setCalendarPrices] = useState<any[]>([]);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [status, setStatus] = useState<'available' | 'blocked'>('available');
  
  const { token } = useAuth();
  
  useEffect(() => {
     // Fetch offers
     fetch('/api/admin/offers', { headers: { 'Authorization': `Bearer ${token}` } })
       .then(res => res.json())
       .then(data => {
          if (Array.isArray(data)) setOffers(data);
       })
       .catch(err => console.error(err));
  }, [token]);
  
  useEffect(() => {
     if (!selectedListingId) return;
     fetch(`/api/listings/${selectedListingId}/calendar`, { headers: { 'Authorization': `Bearer ${token}` }})
       .then(res => res.json())
       .then(data => {
          if (Array.isArray(data)) setCalendarPrices(data);
       })
       .catch(err => console.error(err));
  }, [selectedListingId, token]);
  
  const selectedListing = useMemo(() => listings.find(l => l.id === selectedListingId) || listings[0], [listings, selectedListingId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
      if (selectedDates.length > 0 && selectedListing) {
          // pre-fill with first selected date's info or default
          const firstDate = selectedDates[0];
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(firstDate).padStart(2,'0')}`;
          const currentDayInfo = calendarPrices.find(cp => cp.date_string === dateStr);
          
          if (currentDayInfo) {
              setCustomPrice(currentDayInfo.price);
              setSelectedOfferId(currentDayInfo.offer_id);
              setStatus(currentDayInfo.status || 'available');
          } else {
              setCustomPrice(selectedListing.price.toString());
              setSelectedOfferId(null);
              setStatus('available');
          }
      }
  }, [selectedDates, selectedListing, calendarPrices, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDates([]);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDates([]);
  };
  
  const toggleDateSelection = (day: number) => {
      // Very simple multi-select for visual demo
      setSelectedDates(prev => {
          if (prev.includes(day)) return prev.filter(d => d !== day);
          return [...prev, day];
      });
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Generate cells
  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(<div key={`empty-prev-${i}`} className="h-32 border border-transparent bg-dune"></div>);
  }

  const handleSave = async () => {
      if (!selectedListingId || selectedDates.length === 0) return;
      
      const dates = selectedDates.map(day => `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
      
      try {
          const res = await fetch(`/api/listings/${selectedListingId}/calendar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                  dates,
                  price: Number(customPrice),
                  offer_id: selectedOfferId,
                  status
              })
          });
          
          if (res.ok) {
              // Update local state instantly for UI
              const updatedCalendarPrices = [...calendarPrices];
              const appliedOffer = offers.find(o => o.id === selectedOfferId);
              
              dates.forEach(dateStr => {
                  const existingIdx = updatedCalendarPrices.findIndex(cp => cp.date_string === dateStr);
                  const newEntry = {
                      listing_id: selectedListingId,
                      date_string: dateStr,
                      price: Number(customPrice),
                      offer_id: selectedOfferId,
                      status,
                      offer: appliedOffer
                  };
                  if (existingIdx >= 0) {
                      updatedCalendarPrices[existingIdx] = newEntry;
                  } else {
                      updatedCalendarPrices.push(newEntry);
                  }
              });
              
              setCalendarPrices(updatedCalendarPrices);
              setSelectedDates([]);
              alert('Prices and offers updated successfully.');
          }
      } catch (err) {
          console.error(err);
          alert('Failed to update calendar');
      }
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const basePrice = selectedListing ? selectedListing.price : 2500;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayInfo = calendarPrices.find(cp => cp.date_string === dateStr);
    
    // priority: custom calendar price > default price calculation
    let displayPrice = basePrice;
    if (dayInfo && dayInfo.price) {
        displayPrice = Number(dayInfo.price);
    } else {
        const currentDayOfWeek = new Date(year, month, day).getDay();
        const isWeekend = currentDayOfWeek === 5 || currentDayOfWeek === 6; 
        if (isWeekend) displayPrice = Math.round(basePrice * 1.1);
    }
    
    // If offer is applied
    if (dayInfo && dayInfo.offer) {
        displayPrice = Math.round(displayPrice * (1 - dayInfo.offer.discount_percentage / 100));
    }
    
    const formattedPrice = displayPrice >= 1000 
        ? `${formatPrice(Number((displayPrice / 1000).toFixed(1)), currency)}K` 
        : formatPrice(displayPrice, currency);
        
    const isSelected = selectedDates.includes(day);
    const isBlocked = dayInfo && dayInfo.status === 'blocked';

    cells.push(
      <div 
        key={`day-${day}`} 
        onClick={() => toggleDateSelection(day)}
        className={`h-32 border ${isSelected ? 'border-gray-900 bg-gray-50 z-10 relative shadow-sm scale-[1.02]' : isBlocked ? 'border-gray-200 bg-gray-100 opacity-50' : 'border-gray-200 bg-dune hover:bg-gray-50'} p-3 flex flex-col justify-between cursor-pointer transition-all rounded-2xl m-1 group`}
      >
        <div className={`font-semibold text-lg flex justify-between ${isSelected ? 'text-canvas' : 'text-gray-700 group-hover:text-canvas'}`}>
            {day}
            {dayInfo && dayInfo.offer && <span className="text-xs bg-[#0284C7] text-white px-1.5 rounded flex items-center font-bold">-{dayInfo.offer.discount_percentage}%</span>}
        </div>
        <div className={`text-sm font-medium ${isSelected ? 'text-canvas' : isBlocked ? 'line-through text-gray-400' : 'text-gray-500'}`}>{formattedPrice}</div>
      </div>
    );
  }

  const trailingEmptyCells = (7 - ((firstDayOfMonth + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailingEmptyCells; i++) {
    cells.push(<div key={`empty-next-${i}`} className="h-32 border border-transparent bg-dune"></div>);
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-8 flex gap-8 h-[calc(100vh-100px)]">
      
      {/* Left Sidebar - Listings list */}
      <div className="w-20 lg:w-64 flex flex-col gap-4 border-r border-gray-100 pr-4">
        <h2 className="hidden lg:block text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Properties</h2>
        {listings.map(listing => (
          <div 
            key={listing.id}
            onClick={() => setSelectedListingId(listing.id)}
            className={`flex items-center gap-3 p-2 rounded-2xl cursor-pointer transition-all ${selectedListingId === listing.id ? 'bg-gray-100 border-gray-200' : 'hover:bg-gray-50 border-transparent'} border`}
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
               <img src={listing.imageUrl || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500'} alt={listing.title} className="w-full h-full object-cover" />
            </div>
            <div className="hidden lg:block overflow-hidden">
                <div className="text-sm font-bold text-canvas truncate">{(listing as any).city}</div>
                <div className="text-xs text-gray-500 truncate">{listing.title}</div>
            </div>
          </div>
        ))}
        {listings.length === 0 && (
            <div className="text-sm text-gray-500 hidden lg:block">No properties available.</div>
        )}
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col overflow-y-auto pr-4">
         <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                <h1 className="text-4xl font-bold text-canvas flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-xl transition-colors">
                    {monthName} <ChevronDown className="w-6 h-6" />
                </h1>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-full">
                    <button className="bg-dune text-canvas px-4 py-1.5 rounded-full font-bold text-sm shadow-sm flex items-center gap-2">
                        Month <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center gap-2 border border-gray-200 rounded-full p-1 bg-dune">
                    <button onClick={handlePrevMonth} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={handleNextMonth} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
         </div>

         {/* Calendar Grid */}
         <div className="w-full rounded-3xl border border-gray-200 bg-dune overflow-hidden shadow-sm">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                {DAYS_OF_WEEK.map(day => (
                    <div key={day} className="py-4 text-center text-sm font-bold text-gray-500 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 p-2 gap-0">
                {cells}
            </div>
         </div>
      </div>

      {/* Right Sidebar - Pricing & Availability settings */}
      <div className="hidden xl:flex w-80 border-l border-gray-100 pl-8 flex-col overflow-y-auto">
          {selectedListing ? (
            <div className="space-y-8 pb-10">
                {selectedDates.length > 0 && (
                     <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4">
                         <h3 className="font-bold text-canvas mb-1">{selectedDates.length} {selectedDates.length === 1 ? 'night' : 'nights'} selected</h3>
                         <div className="text-sm text-gray-500">{monthName} {Math.min(...selectedDates)} - {Math.max(...selectedDates)}</div>
                     </div>
                )}
                
                {selectedDates.length > 0 && (
                <div>
                     <h3 className="text-xl font-bold text-canvas mb-4">Status</h3>
                     <div className="flex bg-gray-100 p-1 rounded-full w-full mb-6 relative">
                         <button onClick={() => setStatus('available')} className={`flex-1 px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all z-10 text-center ${status === 'available' ? 'bg-dune text-canvas' : 'text-gray-500 hover:text-canvas'}`}>Available</button>
                         <button onClick={() => setStatus('blocked')} className={`flex-1 px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all z-10 text-center ${status === 'blocked' ? 'bg-dune text-canvas' : 'text-gray-500 hover:text-canvas'}`}>Blocked</button>
                     </div>
                </div>
                )}
                
                <div>
                     <div className="flex items-center justify-between mb-4">
                         <h3 className="text-xl font-bold text-canvas">Pricing</h3>
                         <button 
                             onClick={async () => {
                                 if (!selectedListingId || selectedDates.length === 0) return;
                                 try {
                                     const pToken = localStorage.getItem('token');
                                     const res = await fetch('/api/ai/suggest-price', {
                                         method: 'POST',
                                         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pToken}` },
                                         body: JSON.stringify({
                                             listingId: selectedListingId,
                                             dates: selectedDates.map(day => `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`)
                                         })
                                     });
                                     if (res.ok) {
                                         const data = await res.json();
                                         if (data.price) setCustomPrice(data.price.toString());
                                     }
                                 } catch(e) {
                                     console.error(e);
                                 }
                             }}
                             disabled={selectedDates.length === 0}
                             className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50"
                         >
                             ✨ Smart Pricing
                         </button>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-dune border border-gray-200 rounded-2xl cursor-pointer transition-colors group mb-3 hover:border-gray-900">
                         <div className="w-full">
                            <label className="text-sm text-gray-500 block mb-1">Nightly price</label>
                            <div className="flex items-center">
                                <span className="font-bold text-canvas text-xl mr-1">{currency === 'USD' ? '$' : '₹'}</span>
                                <input 
                                    type="number" 
                                    className="font-bold text-canvas text-xl focus:outline-none w-full bg-transparent"
                                    value={customPrice}
                                    onChange={e => setCustomPrice(e.target.value)}
                                    disabled={selectedDates.length === 0}
                                    placeholder={selectedListing.price.toString()}
                                />
                            </div>
                         </div>
                     </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                <div>
                     <div className="flex items-center justify-between mb-4">
                         <h3 className="text-xl font-bold text-canvas">Platform Offers</h3>
                     </div>
                     {offers.length === 0 && (
                         <div className="text-sm text-gray-500 mb-4">No platform offers available currently. Admin can create offers.</div>
                     )}
                     <div className="space-y-3">
                         {offers.map(offer => (
                             <div 
                                key={offer.id}
                                onClick={() => setSelectedDates.length > 0 && setSelectedOfferId(selectedOfferId === offer.id ? null : offer.id)}
                                className={`flex items-center justify-between p-4 bg-dune border ${selectedOfferId === offer.id ? 'border-[#0284C7] bg-[#0284C7]/5' : 'border-gray-200 hover:border-gray-900'} rounded-2xl cursor-pointer transition-colors group `}
                             >
                                 <div>
                                    <div className={`font-bold ${selectedOfferId === offer.id ? 'text-[#0284C7]' : 'text-canvas'}`}>{offer.title}</div>
                                    <div className="text-sm text-gray-500 mt-1">{offer.discount_percentage}% discount on base price</div>
                                 </div>
                                 {selectedOfferId === offer.id && <Check className="w-5 h-5 text-[#0284C7]" />}
                             </div>
                         ))}
                     </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                <div>
                     <h3 className="text-xl font-bold text-canvas mb-4">Availability</h3>
                     <div className="flex items-center justify-between p-4 bg-dune border border-gray-200 rounded-2xl hover:border-gray-900 cursor-pointer transition-colors group">
                         <div>
                            <div className="font-bold text-canvas">1–1 night stays</div>
                            <div className="text-sm text-gray-500 mt-1">Same-day advance notice</div>
                         </div>
                         <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-canvas transition-colors" />
                     </div>
                </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-20 font-medium">
               Select a listing to view its settings
            </div>
          )}
          
          {selectedDates.length > 0 && selectedListing && (
              <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between pb-8 sticky bottom-0 bg-dune">
                  <button onClick={() => setSelectedDates([])} className="text-canvas font-bold underline hover:text-gray-700">Cancel</button>
                  <button onClick={handleSave} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg">Save Changes</button>
              </div>
          )}
      </div>

    </div>
  );
}
