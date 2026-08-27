import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ShieldCheck, StarIcon, HouseIcon, MessageCircleIcon } from './Icons';
import { Calendar, CheckCircle2, MapPin, Download, ArrowLeft, Phone, Lock, Sparkles } from 'lucide-react';
import { uiAudio } from './audio';

interface BookingPageProps {
  listing: Listing;
  bookingDetails: {
    moveInDate: string;
    checkOutDate?: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
    roomTier?: string;
  };
  onBackToHome: () => void;
}

const BookingPage: React.FC<BookingPageProps> = ({ listing, bookingDetails, onBackToHome }) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setWhatsappConfig(data);
          setCountdown(5);
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

  const handleWhatsAppRedirect = React.useCallback(() => {
    if (!whatsappConfig?.number) return;
    uiAudio.playClick();
    
    const safeMoveInDate = bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate).toLocaleDateString() : new Date().toLocaleDateString();
    const safeName = bookingDetails?.name || 'Guest';
    const message = `Hello! I have just confirmed my reservation on ENCHO Space.\n\n*Sanctuary:* ${listing?.title || 'Sanctuary'}\n*Room Tier:* ${bookingDetails?.configuration || 'Deluxe Room'}\n*Check-in Date:* ${safeMoveInDate}\n*Guest Name:* ${safeName}`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappConfig.number}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  }, [whatsappConfig, listing?.title, bookingDetails?.configuration, bookingDetails?.moveInDate, bookingDetails?.name]);

  useEffect(() => {
    if (countdown === null || !whatsappConfig?.enabled) return;
    
    if (countdown === 0) {
      handleWhatsAppRedirect();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : prev));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, whatsappConfig, handleWhatsAppRedirect]);

  // Calendar sync file generator (.ics)
  const downloadCalendarEvent = () => {
    uiAudio.playClick();
    const startDate = bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate).toISOString().replace(/-|:|\.\d+/g, '') : '';
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `SUMMARY:Stay at ${listing?.title || 'ENCHO Sanctuary'}`,
      `DESCRIPTION:Your confirmed reservation for ${bookingDetails?.configuration || 'Sanctuary'} is active.`,
      `LOCATION:${listing?.address || ''}`,
      `DTSTART:${startDate}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `encho_reservation_${listing?.id || 'stay'}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <SEO title={`Reservation Confirmed - ${listing?.title || 'Encho'}`} description={`Your luxury stay at ${listing?.title || 'Sanctuary'} is confirmed and held in escrow.`} />
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center font-sans selection:bg-amber-500/20 text-zinc-900 pb-16">
        
        {/* Navigation Header */}
        <header className="w-full bg-white/90 backdrop-blur-xl border-b border-zinc-200/80 sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
            <div onClick={onBackToHome} className="cursor-pointer flex items-center gap-1.5 select-none group">
              <span className="font-black text-xl tracking-tighter text-zinc-950 group-hover:text-zinc-700 transition-colors font-display">ENCHO</span>
              <div className="w-1.5 h-1.5 bg-zinc-950 rounded-full" />
              <span className="text-[9px] font-bold tracking-[0.3em] text-zinc-400 uppercase font-mono">Space</span>
            </div>

            <button 
              onClick={onBackToHome}
              className="text-xs font-bold text-zinc-600 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Explore</span>
            </button>
          </div>
        </header>

        {/* Confirmation Container */}
        <div className="w-full max-w-2xl mt-8 px-4 sm:px-6">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-200/80 space-y-0">
            
            {/* Obsidian Luxury Confirmation Hero */}
            <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8 text-center text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md shadow-inner">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              
              <div className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest text-amber-300 border border-white/10 mb-2">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Verified Escrow Lock</span>
              </div>
              
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight font-display mb-1.5">
                Sanctuary Reservation Confirmed
              </h1>
              <p className="text-zinc-300 text-xs md:text-sm font-medium max-w-md mx-auto">
                Your luxury stay has been locked in the Encho Escrow Vault. Your concierge is now preparing your arrival.
              </p>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              
              {/* Sanctuary & Room Recap */}
              <div className="flex gap-4 items-center pb-6 border-b border-zinc-100">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200 shadow-2xs">
                  <img 
                    src={listing?.imageUrl || undefined} 
                    alt={listing?.title || 'Sanctuary'} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    {bookingDetails?.configuration || 'Deluxe Room'}
                  </span>
                  <h3 className="font-bold text-zinc-900 text-base leading-tight mt-1 truncate font-display">
                    {listing?.title || 'Villa Satori'}
                  </h3>
                  <p className="text-xs text-zinc-400 font-medium truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-zinc-400" />
                    <span>{listing?.address || 'Sanctuary Address'}</span>
                  </p>
                </div>
              </div>

              {/* Booking Specifications Grid */}
              <div className="grid grid-cols-2 gap-4 bg-zinc-50 rounded-2xl p-4 border border-zinc-100 text-xs">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono mb-0.5">Check-in Date</label>
                  <div className="font-bold text-zinc-900 font-display">
                    {bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Immediate Confirmation'}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono mb-0.5">Room Category</label>
                  <div className="font-bold text-zinc-900 font-display">
                    {bookingDetails?.configuration || 'Deluxe Double Room'}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono mb-0.5">Primary Guest</label>
                  <div className="font-bold text-zinc-900 font-display">
                    {bookingDetails?.name || 'Verified Guest'}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono mb-0.5">Total Amount Paid</label>
                  <div className="font-bold text-zinc-950 font-mono text-sm">
                    ₹{(bookingDetails?.totalRent ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* WhatsApp Concierge Dispatch */}
              <div className="bg-emerald-50/80 rounded-2xl p-4 border border-emerald-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-center sm:text-left">
                  <h4 className="font-bold text-emerald-950 text-xs font-display flex items-center gap-1.5 justify-center sm:justify-start">
                    <MessageCircleIcon className="w-4 h-4 text-emerald-600" />
                    <span>Instant Concierge Dispatch</span>
                  </h4>
                  <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    {countdown !== null ? `Auto-redirecting to WhatsApp in ${countdown}s...` : 'Your stay details and check-in key are ready on WhatsApp.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleWhatsAppRedirect} 
                    className="bg-[#25D366] hover:bg-[#20b85a] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open WhatsApp</span>
                  </button>
                  {callConfig?.enabled && callConfig?.number && (
                    <button 
                      onClick={() => window.open(`tel:${callConfig.number}`, '_self')} 
                      className="bg-white hover:bg-zinc-100 text-zinc-900 px-3.5 py-2 rounded-xl font-bold text-xs border border-zinc-200 shadow-2xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Call Host</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons: View in Account, Calendar Sync & Printable Invoice */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={downloadCalendarEvent}
                  className="py-3 px-3 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-bold text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Sync Calendar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    window.print();
                  }}
                  className="py-3 px-3 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-bold text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Print Tax Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={onBackToHome}
                  className="py-3 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>View in My Account ↗</span>
                </button>
              </div>

            </div>
          </div>
          
          <div className="mt-6 text-zinc-400 text-xs font-medium flex items-center gap-1.5 justify-center font-mono">
            <Lock className="w-3 h-3 text-emerald-600" />
            <span>Encho Walled Garden Escrow Protected</span>
          </div>
        </div>

      </div>
    </>
  );
};

export default BookingPage;
