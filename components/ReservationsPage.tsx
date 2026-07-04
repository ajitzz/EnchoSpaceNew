
import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ChevronLeft, CalendarIcon, PhoneIcon, MessageCircleIcon } from './Icons';
import { useToast } from './ToastContext';

interface Reservation {
  id: string;
  listing: Listing;
  moveInDate: string;
  configuration: string;
  name: string;
  phone: string;
  totalRent: number;
  bookingDate: string;
  status?: string;
}

interface ReservationsPageProps {
  reservations: Reservation[];
  isOnline?: boolean;
  onBack: () => void;
  onListingClick: (listing: Listing) => void;
  onCancelBooking?: (id: string) => void;
  onContactHost?: (listing: Listing) => void;
}

const ReservationsPage: React.FC<ReservationsPageProps> = ({ reservations, isOnline = true, onBack, onListingClick, onCancelBooking, onContactHost }) => {
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [isCaching, setIsCaching] = useState(false);
  const [cacheComplete, setCacheComplete] = useState(false);
  const { addToast } = useToast();

  const handleCancelClick = (id: string) => {
      if (onCancelBooking) {
          if (window.confirm("Are you sure you want to cancel this booking?")) {
              onCancelBooking(id);
              addToast("Booking Cancelled", "Your booking has been successfully cancelled.", "info");
          }
      }
  };

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setWhatsappConfig(data);
        }
      })
      .catch(console.error);
      
    fetch('/api/settings/call')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setCallConfig(data);
        }
      })
      .catch(console.error);
  }, []);

  const handleCacheItinerary = async () => {
      setIsCaching(true);
      try {
          const cache = await caches.open('offline-itinerary-images');
          const urls = reservations.map(r => r.listing.imageUrl).filter(Boolean);
          // Add other specific assets
          await Promise.all(urls.map(url => {
              // Try to fetch and cache each image individually
              if (url) {
                 return fetch(url, { mode: 'no-cors' }).then(response => {
                     return cache.put(url, response);
                 }).catch(() => null);
              }
          }));
          setCacheComplete(true);
          setTimeout(() => setCacheComplete(false), 3000);
      } catch (err) {
          console.error('Failed to cache itinerary:', err);
      } finally {
          setIsCaching(false);
      }
  };

  const handleWhatsAppClick = (reservation: Reservation) => {
    if (!whatsappConfig?.number) return;
    const message = `Hi, I have a query regarding my booking for ${reservation.listing.title} on ${reservation.moveInDate}.`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${whatsappConfig.number}?text=${encodedMessage}`, '_blank');
  };

  const handleCallClick = () => {
    if (!callConfig?.number) return;
    window.open(`tel:${callConfig.number}`, '_self');
  };

  return (
    <>
      <SEO title="Reservations | Encho Space" description="View and manage your upcoming reservations." />
    <div className="min-h-screen bg-gray-50 animate-fade-in font-sans">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
            <button 
                onClick={onBack} 
                className="flex items-center gap-2 text-gray-900 hover:bg-black/5 px-3 py-2 rounded-full transition-all group font-semibold"
            >
                <div className="p-1.5 rounded-full bg-gray-100 group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-200 shadow-sm">
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                </div>
                <span className="text-sm">Back</span>
            </button>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight hidden md:block">Your Reservations</h1>
            <div className="w-16"></div> {/* Spacer */}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-10">
        {!isOnline && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-blue-100/50 rounded-lg text-blue-600 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2v2a2 2 0 002 2h.5a2 2 0 012 2v2.5M15 9h2.5M3 12a9 9 0 1018 0 9 9 0 00-18 0z" /></svg>
                </div>
                <div>
                    <h3 className="font-bold text-gray-900 text-sm">Offline Itinerary</h3>
                    <p className="text-gray-600 text-xs mt-0.5">You are currently offline. Here's your saved itinerary and bookings for quick access. Certain actions like cancelling or messaging hosts will be unavailable until you reconnect.</p>
                </div>
            </div>
        )}

        <div className="flex items-end justify-between mb-8">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Bookings</h1>
                <p className="text-gray-500 mt-1 text-sm font-medium">{reservations.length} active {reservations.length === 1 ? 'reservation' : 'reservations'}</p>
            </div>
            
            {reservations.length > 0 && isOnline && (
                <button
                    onClick={handleCacheItinerary}
                    disabled={isCaching || cacheComplete}
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 px-4 py-2 rounded-xl transition-colors font-semibold text-sm shadow-sm disabled:opacity-75"
                >
                    {isCaching ? (
                        <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>Saving...</span>
                        </>
                    ) : cacheComplete ? (
                        <>
                            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-green-600">Saved to device</span>
                        </>
                    ) : (
                        <>
                           <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                           <span className="hidden sm:inline">Save for offline</span>
                        </>
                    )}
                </button>
            )}
        </div>

        {reservations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 text-gray-300 ring-8 ring-gray-50/50">
                    <CalendarIcon className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No upcoming stays</h2>
                <p className="text-gray-400 max-w-xs mb-8 text-sm">Your confirmed bookings will appear here. Start exploring to find your next home.</p>
                <button 
                    onClick={onBack}
                    className="bg-black text-white px-8 py-3 rounded-full font-bold text-sm hover:scale-105 transition-transform active:scale-95 shadow-lg"
                >
                    Start exploring
                </button>
            </div>
        ) : (
            <div className="flex flex-col gap-5">
                {reservations.map((reservation) => (
                    <div 
                        key={reservation.id} 
                        className="group relative bg-white rounded-[2rem] p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-gray-200 transition-all duration-500 ease-out flex flex-col md:flex-row gap-6 items-start"
                    >
                        {/* Image Thumbnail with Hover Zoom */}
                        <div 
                            className="w-full md:w-48 aspect-[16/10] md:aspect-[4/3] flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100 cursor-pointer relative isolate"
                            onClick={() => onListingClick(reservation.listing)}
                        >
                            <img 
                                src={reservation.listing.imageUrl} 
                                alt={reservation.listing.title} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            {/* Inner Border for contrast */}
                            <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl z-10"></div>
                            
                            {/* Mobile Status Overlay */}
                            <div className="absolute top-3 left-3 md:hidden">
                                <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm">
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10B981]"></span>
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-900 uppercase tracking-wide">Confirmed</span>
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 w-full flex flex-col h-full justify-between">
                            <div>
                                {/* Top Row: Title & Price */}
                                <div className="flex justify-between items-start mb-1">
                                    <div className="min-w-0 mr-4">
                                         <h3 
                                            className="font-bold text-gray-900 text-lg md:text-xl leading-snug truncate cursor-pointer group-hover:text-[#0284C7] transition-colors"
                                            onClick={() => onListingClick(reservation.listing)}
                                        >
                                            {reservation.listing.displayTitle || reservation.listing.title}
                                        </h3>
                                        <p className="text-sm font-medium text-gray-500 truncate">{reservation.listing.address}</p>
                                    </div>
                                    {/* Price Pill */}
                                     <div className="text-right flex-shrink-0">
                                        <div className="font-extrabold text-gray-900 text-lg tracking-tight">{'₹'}{reservation.totalRent.toLocaleString()}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">/month</div>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="h-px w-full border-t border-dashed border-gray-200 my-4"></div>

                                {/* Meta Grid */}
                                <div className="flex flex-wrap items-center gap-y-4 gap-x-8 md:gap-x-12 mb-5">
                                    {/* Date */}
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Move-in</span>
                                        <span className="text-sm font-semibold text-gray-800">
                                            {new Date(reservation.moveInDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    {/* Config */}
                                     <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Unit</span>
                                        <span className="text-sm font-semibold text-gray-800">{reservation.configuration}</span>
                                    </div>
                                    {/* Desktop Status Indicator */}
                                     <div className="hidden md:flex flex-col">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</span>
                                        <div className="flex items-center gap-2">
                                            {reservation.status === 'confirmed' ? (
                                                <>
                                                 <span className="relative flex h-2 w-2">
                                                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                   <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
                                                 </span>
                                                 <span className="text-xs font-bold text-[#10B981] bg-green-50 px-2.5 py-0.5 rounded-full border border-green-100">Confirmed</span>
                                                </>
                                            ) : reservation.status?.toLowerCase() === 'completed' ? (
                                                <>
                                                 <span className="text-xs font-bold text-[#0284C7] bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-100">Completed</span>
                                                </>
                                            ) : reservation.status === 'pending' ? (
                                                <>
                                                 <span className="relative flex h-2 w-2">
                                                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                                   <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F59E0B]"></span>
                                                 </span>
                                                 <span className="text-xs font-bold text-[#F59E0B] bg-yellow-50 px-2.5 py-0.5 rounded-full border border-yellow-100">Pending</span>
                                                </>
                                            ) : reservation.status === 'cancelled' || reservation.status === 'declined' ? (
                                                <>
                                                 <span className="relative flex h-2 w-2">
                                                   <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                 </span>
                                                 <span className="text-xs font-bold text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100 capitalize">{reservation.status}</span>
                                                </>
                                            ) : (
                                                <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-100 capitalize">{reservation.status || 'Pending'}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Support & Actions Footer */}
                            <div className="mt-2 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg max-w-full sm:max-w-xs">
                                    {reservation.status === 'cancelled' || reservation.status === 'declined' ? (
                                        <span className="text-xs font-medium text-gray-600 leading-tight">This booking is no longer active.</span>
                                    ) : reservation.status?.toLowerCase() === 'completed' ? (
                                        <span className="text-xs font-medium text-gray-600 leading-tight">Your stay has concluded. We hope you enjoyed it!</span>
                                    ) : (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0"></div>
                                            <span className="text-xs font-medium text-gray-600 leading-tight">Our team will reach out to you shortly for assistance.</span>
                                        </>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    {reservation.status?.toLowerCase() === 'completed' && (
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); onListingClick(reservation.listing); }}
                                            disabled={!isOnline}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#0284C7] hover:bg-[#0369A1] text-white px-4 py-2 rounded-xl transition-colors text-xs font-bold shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                         >
                                            <span>Leave a Review</span>
                                         </button>
                                    )}
                                    {(reservation.status === 'pending' || reservation.status === 'confirmed') && onCancelBooking && (
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); handleCancelClick(reservation.id); }}
                                            disabled={!isOnline}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-red-600 px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-red-100 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                         >
                                            <span>Cancel</span>
                                         </button>
                                    )}
                                     <button 
                                        onClick={() => onContactHost?.(reservation.listing)}
                                        disabled={!isOnline}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl transition-colors text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                     >
                                        <MessageCircleIcon className="w-4 h-4" />
                                        <span>Message</span>
                                     </button>
                                     {whatsappConfig?.enabled && whatsappConfig?.number && (
                                         <button 
                                            onClick={() => handleWhatsAppClick(reservation)}
                                            disabled={!isOnline}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#E7F6EC] hover:bg-[#D3EFDC] text-[#0F5C2E] px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-transparent hover:border-[#0F5C2E]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                         >
                                            <MessageCircleIcon className="w-4 h-4" />
                                            <span>WhatsApp</span>
                                         </button>
                                     )}
                                     {callConfig?.enabled && callConfig?.number && (
                                         <button 
                                            onClick={handleCallClick}
                                            disabled={!isOnline}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-gray-200 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                         >
                                            <PhoneIcon className="w-4 h-4" />
                                            <span>Call</span>
                                         </button>
                                     )}
                                </div>
                            </div>
                        </div>

                    </div>
                ))}
            </div>
        )}
      </main>
    </div>
    </>
  );
};

export default ReservationsPage;
