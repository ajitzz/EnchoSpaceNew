import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ChevronLeft, CalendarIcon, PhoneIcon, MessageCircleIcon } from './Icons';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { Download, Compass, Home, MapPin, Calendar, Smartphone, MessageSquare } from 'lucide-react';

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
  experienceBookings?: any[];
  isOnline?: boolean;
  onBack: () => void;
  onListingClick: (listing: Listing) => void;
  onCancelBooking?: (id: string) => void;
  onCancelExperienceBooking?: (id: string | number) => void;
  onExperienceClick?: (id: number | string) => void;
  onContactHost?: (listing: Listing) => void;
}

const ReservationsPage: React.FC<ReservationsPageProps> = ({ 
  reservations, 
  experienceBookings = [], 
  isOnline = true, 
  onBack, 
  onListingClick, 
  onCancelBooking,
  onCancelExperienceBooking,
  onExperienceClick,
  onContactHost 
}) => {
  const [activeTab, setActiveTab] = useState<'stays' | 'experiences'>('stays');
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [isCaching, setIsCaching] = useState(false);
  const [cacheComplete, setCacheComplete] = useState(false);
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();

  const handleCancelClick = (id: string) => {
      if (onCancelBooking) {
          if (window.confirm("Are you sure you want to cancel this booking?")) {
              onCancelBooking(id);
              addToast("Booking Cancelled", "Your booking has been successfully cancelled.", "info");
          }
      }
  };

  const handleCancelExperienceBookingClick = (id: string | number) => {
      if (onCancelExperienceBooking) {
          if (window.confirm("Are you sure you want to cancel this experience booking?")) {
              onCancelExperienceBooking(id);
              addToast("Booking Cancelled", "Your experience booking has been cancelled.", "info");
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

  const downloadTicket = (booking: any, type: 'stay' | 'experience') => {
    const isStay = type === 'stay';
    const bookingId = booking.id;
    const title = isStay ? (booking.listing.displayTitle || booking.listing.title) : booking.title;
    const subtitle = isStay ? booking.listing.address : booking.destination;
    const dateLabel = isStay ? "Move-In Date" : "Start Date";
    const dateValue = isStay 
      ? new Date(booking.moveInDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(booking.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const detailLabel = isStay ? "Unit Type" : "Tickets Bought";
    const detailValue = isStay ? booking.configuration : `${booking.num_tickets} Tickets`;
    const guestName = booking.name;
    const guestPhone = booking.phone;
    const totalPaid = isStay ? booking.totalRent : booking.total_price;
    const status = booking.status || 'Confirmed';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation - ${bookingId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f3f4f6;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .ticket {
      background: white;
      border-radius: 24px;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 500px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .header {
      background: #000;
      color: white;
      padding: 32px 24px;
      text-align: center;
      position: relative;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 8px 0 0 0;
      color: #9ca3af;
      font-size: 14px;
      font-weight: 500;
    }
    .type-badge {
      display: inline-block;
      background: #2563eb;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 12px;
    }
    .content {
      padding: 32px 24px;
    }
    .title-section {
      text-align: center;
      margin-bottom: 24px;
    }
    .title-section h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }
    .title-section p {
      margin: 4px 0 0 0;
      color: #6b7280;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
      border-top: 1px dashed #e5e7eb;
      border-bottom: 1px dashed #e5e7eb;
      padding: 24px 0;
    }
    .grid-item {
      display: flex;
      flex-direction: column;
    }
    .label {
      font-size: 10px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .value {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
    .footer {
      background: #f9fafb;
      padding: 24px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .barcode {
      font-family: monospace;
      font-size: 12px;
      color: #4b5563;
      letter-spacing: 4px;
      margin-top: 8px;
    }
    .print-btn {
      margin-top: 16px;
      background: #000;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { background: white; }
      .ticket { box-shadow: none; border: none; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="type-badge">${type} Ticket</div>
      <h1>Amigove</h1>
      <p>Booking ID: ${bookingId}</p>
    </div>
    <div class="content">
      <div class="title-section">
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
      <div class="grid">
        <div class="grid-item">
          <span class="label">Guest Name</span>
          <span class="value">${guestName}</span>
        </div>
        <div class="grid-item">
          <span class="label">Phone</span>
          <span class="value">${guestPhone}</span>
        </div>
        <div class="grid-item">
          <span class="label">${dateLabel}</span>
          <span class="value">${dateValue}</span>
        </div>
        <div class="grid-item">
          <span class="label">${detailLabel}</span>
          <span class="value">${detailValue}</span>
        </div>
        <div class="grid-item">
          <span class="label">Total Paid</span>
          <span class="value">${formatPrice(Number(totalPaid), 'INR')}</span>
        </div>
        <div class="grid-item">
          <span class="label">Status</span>
          <span class="value" style="color: ${status.toLowerCase() === 'confirmed' || status.toLowerCase() === 'active' ? '#10b981' : '#f59e0b'}">${status}</span>
        </div>
      </div>
      <div style="text-align: center;">
        <svg style="width: 120px; height: 120px; margin: 0 auto;" viewBox="0 0 100 100">
          <rect x="10" y="10" width="20" height="20" fill="black" />
          <rect x="14" y="14" width="12" height="12" fill="white" />
          <rect x="17" y="17" width="6" height="6" fill="black" />
          
          <rect x="70" y="10" width="20" height="20" fill="black" />
          <rect x="74" y="14" width="12" height="12" fill="white" />
          <rect x="77" y="17" width="6" height="6" fill="black" />
          
          <rect x="10" y="70" width="20" height="20" fill="black" />
          <rect x="14" y="74" width="12" height="12" fill="white" />
          <rect x="17" y="77" width="6" height="6" fill="black" />
          
          <rect x="40" y="10" width="8" height="8" fill="black" />
          <rect x="55" y="15" width="6" height="12" fill="black" />
          <rect x="45" y="30" width="12" height="6" fill="black" />
          <rect x="15" y="45" width="8" height="12" fill="black" />
          <rect x="30" y="40" width="16" height="16" fill="black" />
          <rect x="50" y="50" width="12" height="12" fill="black" />
          <rect x="70" y="45" width="15" height="8" fill="black" />
          <rect x="80" y="60" width="8" height="16" fill="black" />
          <rect x="45" y="70" width="14" height="14" fill="black" />
          <rect x="75" y="80" width="12" height="8" fill="black" />
        </svg>
        <div class="barcode">||||| | |||| ||| ||| | |||</div>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500;">Thank you for booking with Amigove!</p>
      <button class="print-btn" onclick="window.print()">Print Ticket</button>
    </div>
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ticket_${type}_${bookingId}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast("Download Started", "Your ticket has been downloaded successfully.", "success");
  };

  return (
    <>
      <SEO title="Reservations | Amigove" description="View and manage your upcoming reservations." />
    <div className="min-h-screen bg-gray-50 animate-fade-in font-sans">
      {/* Header */}
      <div className="bg-dune/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
            <button 
                onClick={onBack} 
                className="flex items-center gap-2 text-canvas hover:bg-black/5 px-3 py-2 rounded-full transition-all group font-semibold"
            >
                <div className="p-1.5 rounded-full bg-gray-100 group-hover:bg-dune transition-colors border border-transparent group-hover:border-gray-200 shadow-sm">
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                </div>
                <span className="text-sm">Back</span>
            </button>
            <h1 className="text-lg font-bold text-canvas tracking-tight hidden md:block font-sans">Your Reservations</h1>
            <div className="w-16"></div> {/* Spacer */}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-10">
        {!isOnline && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-blue-100/50 rounded-lg text-brand-dark shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2v2a2 2 0 002 2h.5a2 2 0 012 2v2.5M15 9h2.5M3 12a9 9 0 1018 0 9 9 0 00-18 0z" /></svg>
                </div>
                <div>
                    <h3 className="font-bold text-canvas text-sm">Offline Itinerary</h3>
                    <p className="text-gray-600 text-xs mt-0.5">You are currently offline. Here's your saved itinerary and bookings for quick access. Certain actions like cancelling or messaging hosts will be unavailable until you reconnect.</p>
                </div>
            </div>
        )}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
                <h1 className="text-3xl font-extrabold text-canvas tracking-tight">Bookings</h1>
                <p className="text-gray-500 mt-1 text-sm font-medium">
                  {activeTab === 'stays' 
                    ? `${reservations.length} active stay${reservations.length === 1 ? '' : 's'}`
                    : `${experienceBookings.length} active experience${experienceBookings.length === 1 ? '' : 's'}`
                  }
                </p>
            </div>
            
            {activeTab === 'stays' && reservations.length > 0 && isOnline && (
                <button
                    onClick={handleCacheItinerary}
                    disabled={isCaching || cacheComplete}
                    className="flex items-center gap-2 bg-dune border border-gray-200 hover:border-gray-300 text-gray-700 px-4 py-2 rounded-xl transition-colors font-semibold text-sm shadow-sm disabled:opacity-75"
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

        {/* Unified Stays & Experiences Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-2xl w-fit mb-8 border border-gray-200">
            <button
                onClick={() => setActiveTab('stays')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${activeTab === 'stays' ? 'bg-dune text-canvas shadow-sm' : 'text-gray-500 hover:text-canvas'}`}
            >
                <Home className="w-4 h-4" />
                <span>Stays ({reservations.length})</span>
            </button>
            <button
                onClick={() => setActiveTab('experiences')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${activeTab === 'experiences' ? 'bg-dune text-canvas shadow-sm' : 'text-gray-500 hover:text-canvas'}`}
            >
                <Compass className="w-4 h-4" />
                <span>Experiences ({experienceBookings.length})</span>
            </button>
        </div>

        {/* Tab content */}
        {activeTab === 'stays' ? (
          reservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-dune rounded-3xl border border-gray-100 shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 text-gray-300 ring-8 ring-gray-50/50">
                      <CalendarIcon className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-canvas mb-2">No upcoming stays</h2>
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
                          className="group relative bg-dune rounded-[2rem] p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-gray-200 transition-all duration-500 ease-out flex flex-col md:flex-row gap-6 items-start"
                      >
                          {/* Image Thumbnail with Hover Zoom */}
                          <div 
                              className="w-full md:w-48 aspect-[16/10] md:aspect-[4/3] flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100 cursor-pointer relative isolate"
                              onClick={() => onListingClick(reservation.listing)}
                          >
                              <img 
                                  src={reservation.listing.imageUrl || undefined} 
                                  alt={reservation.listing.title} 
                                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                              />
                              {/* Inner Border for contrast */}
                              <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl z-10"></div>
                              
                              {/* Mobile Status Overlay */}
                              <div className="absolute top-3 left-3 md:hidden">
                                  <div className="flex items-center gap-1.5 bg-dune/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10B981]"></span>
                                      </span>
                                      <span className="text-[10px] font-bold text-canvas uppercase tracking-wide">Confirmed</span>
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
                                              className="font-bold text-canvas text-lg md:text-xl leading-snug truncate cursor-pointer group-hover:text-[#0284C7] transition-colors"
                                              onClick={() => onListingClick(reservation.listing)}
                                          >
                                              {reservation.listing.displayTitle || reservation.listing.title}
                                          </h3>
                                          <p className="text-sm font-medium text-gray-500 truncate">{reservation.listing.address}</p>
                                      </div>
                                      {/* Price Pill */}
                                       <div className="text-right flex-shrink-0">
                                          <div className="font-extrabold text-canvas text-lg tracking-tight">{formatPrice(reservation.totalRent, 'INR')}</div>
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
                                              <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse flex-shrink-0"></div>
                                              <span className="text-xs font-medium text-gray-600 leading-tight">Our team will reach out to you shortly for assistance.</span>
                                          </>
                                      )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                                      {reservation.status !== 'cancelled' && reservation.status !== 'declined' && (
                                          <button
                                              onClick={() => downloadTicket(reservation, 'stay')}
                                              className="flex items-center gap-1.5 bg-black hover:bg-gray-800 text-white px-3.5 py-2 rounded-xl transition-all font-bold text-xs shadow-md"
                                          >
                                              <Download className="w-3.5 h-3.5" />
                                              <span>Download Ticket</span>
                                          </button>
                                      )}
                                      {reservation.status?.toLowerCase() === 'completed' && (
                                           <button 
                                              onClick={(e) => { e.stopPropagation(); onListingClick(reservation.listing); }}
                                              disabled={!isOnline}
                                              className="flex items-center justify-center gap-2 bg-[#0284C7] hover:bg-[#0369A1] text-white px-4 py-2 rounded-xl transition-colors text-xs font-bold shadow-lg disabled:opacity-50"
                                           >
                                              <span>Leave a Review</span>
                                           </button>
                                      )}
                                      {(reservation.status === 'pending' || reservation.status === 'confirmed') && onCancelBooking && (
                                           <button 
                                              onClick={(e) => { e.stopPropagation(); handleCancelClick(reservation.id); }}
                                              disabled={!isOnline}
                                              className="flex items-center justify-center gap-2 bg-dune hover:bg-red-50 text-red-600 px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-red-100 hover:border-red-200 disabled:opacity-50"
                                           >
                                              <span>Cancel</span>
                                           </button>
                                      )}
                                       <button 
                                          onClick={() => onContactHost?.(reservation.listing)}
                                          disabled={!isOnline}
                                          className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl transition-colors text-xs font-bold shadow-sm disabled:opacity-50"
                                       >
                                          <MessageCircleIcon className="w-4 h-4" />
                                          <span>Message</span>
                                       </button>
                                       {whatsappConfig?.enabled && whatsappConfig?.number && (
                                           <button 
                                              onClick={() => handleWhatsAppClick(reservation)}
                                              disabled={!isOnline}
                                              className="flex items-center justify-center gap-2 bg-[#E7F6EC] hover:bg-[#D3EFDC] text-[#0F5C2E] px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-transparent hover:border-[#0F5C2E]/20 disabled:opacity-50"
                                           >
                                              <MessageCircleIcon className="w-4 h-4" />
                                              <span>WhatsApp</span>
                                           </button>
                                       )}
                                       {callConfig?.enabled && callConfig?.number && (
                                           <button 
                                              onClick={handleCallClick}
                                              disabled={!isOnline}
                                              className="flex items-center justify-center gap-2 bg-dune hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-gray-200 hover:border-gray-300 disabled:opacity-50"
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
          )
        ) : (
          experienceBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-dune rounded-3xl border border-gray-100 shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 text-gray-300 ring-8 ring-gray-50/50">
                      <Compass className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-canvas mb-2">No booked experiences</h2>
                  <p className="text-gray-400 max-w-xs mb-8 text-sm">Your booked experiences will appear here. Start exploring amazing curated adventures.</p>
                  <button 
                      onClick={onBack}
                      className="bg-black text-white px-8 py-3 rounded-full font-bold text-sm hover:scale-105 transition-transform active:scale-95 shadow-lg"
                  >
                      Find Experiences
                  </button>
              </div>
          ) : (
              <div className="flex flex-col gap-5">
                  {experienceBookings.map((booking) => {
                      let parsedImageUrls = [];
                      try {
                          parsedImageUrls = typeof booking.image_urls === 'string' 
                              ? JSON.parse(booking.image_urls) 
                              : (Array.isArray(booking.image_urls) ? booking.image_urls : []);
                      } catch (e) {
                          parsedImageUrls = [];
                      }
                      const imageUrl = parsedImageUrls[0] || 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=800';

                      return (
                          <div 
                              key={booking.id} 
                              className="group relative bg-dune rounded-[2rem] p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-gray-200 transition-all duration-500 ease-out flex flex-col md:flex-row gap-6 items-start"
                          >
                              {/* Image Thumbnail with Hover Zoom */}
                              <div 
                                  className="w-full md:w-48 aspect-[16/10] md:aspect-[4/3] flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100 cursor-pointer relative isolate"
                                  onClick={() => onExperienceClick?.(booking.experience_id)}
                              >
                                  <img 
                                      src={imageUrl} 
                                      alt={booking.title} 
                                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl z-10"></div>
                              </div>

                              {/* Content Area */}
                              <div className="flex-1 min-w-0 w-full flex flex-col h-full justify-between">
                                  <div>
                                      {/* Top Row */}
                                      <div className="flex justify-between items-start mb-1">
                                          <div className="min-w-0 mr-4">
                                               <h3 
                                                  className="font-bold text-canvas text-lg md:text-xl leading-snug truncate cursor-pointer group-hover:text-[#0284C7] transition-colors"
                                                  onClick={() => onExperienceClick?.(booking.experience_id)}
                                              >
                                                  {booking.title}
                                              </h3>
                                              <p className="text-sm font-medium text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                                  <span>{booking.destination}</span>
                                              </p>
                                          </div>
                                          {/* Price Pill */}
                                           <div className="text-right flex-shrink-0">
                                              <div className="font-extrabold text-canvas text-lg tracking-tight">{formatPrice(Number(booking.total_price), 'INR')}</div>
                                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{booking.num_tickets} ticket{booking.num_tickets === 1 ? '' : 's'}</div>
                                          </div>
                                      </div>

                                      {/* Divider */}
                                      <div className="h-px w-full border-t border-dashed border-gray-200 my-4"></div>

                                      {/* Meta Grid */}
                                      <div className="flex flex-wrap items-center gap-y-4 gap-x-8 md:gap-x-12 mb-5">
                                          {/* Date */}
                                          <div className="flex flex-col">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Starts on</span>
                                              <span className="text-sm font-semibold text-gray-800">
                                                  {new Date(booking.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                              </span>
                                          </div>
                                          {/* Tickets Count */}
                                           <div className="flex flex-col">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Spots booked</span>
                                              <span className="text-sm font-semibold text-gray-800">{booking.num_tickets} Ticket{booking.num_tickets === 1 ? '' : 's'}</span>
                                          </div>
                                          {/* Status Indicator */}
                                           <div className="flex flex-col">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</span>
                                              <div className="flex items-center gap-2">
                                                  {booking.status === 'confirmed' || booking.status === 'Confirmed' ? (
                                                      <>
                                                       <span className="relative flex h-2 w-2">
                                                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                         <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
                                                       </span>
                                                       <span className="text-xs font-bold text-[#10B981] bg-green-50 px-2.5 py-0.5 rounded-full border border-green-100">Confirmed</span>
                                                      </>
                                                  ) : booking.status === 'cancelled' || booking.status === 'declined' ? (
                                                      <>
                                                       <span className="relative flex h-2 w-2">
                                                         <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                       </span>
                                                       <span className="text-xs font-bold text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100 capitalize">{booking.status}</span>
                                                      </>
                                                  ) : (
                                                      <>
                                                       <span className="relative flex h-2 w-2">
                                                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                                         <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F59E0B]"></span>
                                                       </span>
                                                       <span className="text-xs font-bold text-[#F59E0B] bg-yellow-50 px-2.5 py-0.5 rounded-full border border-yellow-100">Pending</span>
                                                      </>
                                                  )}
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  {/* Actions Footer */}
                                  <div className="mt-2 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                      <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg max-w-full sm:max-w-xs">
                                          {booking.status === 'cancelled' || booking.status === 'declined' ? (
                                              <span className="text-xs font-medium text-gray-600 leading-tight">This experience booking is no longer active.</span>
                                          ) : (
                                              <>
                                                  <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse flex-shrink-0"></div>
                                                  <span className="text-xs font-medium text-gray-600 leading-tight">Your spot is secured. Enjoy your adventure!</span>
                                              </>
                                          )}
                                      </div>
                                      
                                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end font-sans">
                                          {booking.status !== 'cancelled' && booking.status !== 'declined' && (
                                              <button
                                                  onClick={() => downloadTicket(booking, 'experience')}
                                                  className="flex items-center gap-1.5 bg-black hover:bg-gray-800 text-white px-3.5 py-2 rounded-xl transition-all font-bold text-xs shadow-md"
                                              >
                                                  <Download className="w-3.5 h-3.5" />
                                                  <span>Download Ticket</span>
                                              </button>
                                          )}
                                          {(booking.status === 'pending' || booking.status === 'confirmed' || booking.status === 'Confirmed') && onCancelExperienceBooking && (
                                               <button 
                                                  onClick={(e) => { e.stopPropagation(); handleCancelExperienceBookingClick(booking.id); }}
                                                  disabled={!isOnline}
                                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-dune hover:bg-red-50 text-red-600 px-4 py-2 rounded-xl transition-colors text-xs font-bold border border-red-100 hover:border-red-200 disabled:opacity-50"
                                               >
                                                  <span>Cancel</span>
                                               </button>
                                          )}
                                      </div>
                                  </div>
                              </div>

                          </div>
                      );
                  })}
              </div>
          )
        )}
      </main>
    </div>
    </>
  );
};

export default ReservationsPage;
