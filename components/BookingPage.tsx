import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ShieldCheck, StarIcon, HouseIcon, MessageCircleIcon } from './Icons';
import { 
  Calendar, 
  CheckCircle2, 
  MapPin, 
  Download, 
  ArrowLeft, 
  Phone, 
  Lock, 
  Sparkles,
  Compass,
  Key,
  Copy,
  Check,
  Printer,
  Navigation,
  UserCheck,
  FileText
} from 'lucide-react';
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
  const [copiedCode, setCopiedCode] = useState(false);

  // Generate deterministic luxury reference token
  const bookingReference = React.useMemo(() => {
    const seed = (listing?.id || '99') + (bookingDetails?.name || 'GUEST').slice(0, 3).toUpperCase();
    return `ENCHO-SANCTUARY-${seed}-8842`;
  }, [listing?.id, bookingDetails?.name]);

  const accessPin = React.useMemo(() => {
    return '4829';
  }, []);

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
    const message = `Hello! I have just confirmed my reservation on ENCHO Space.\n\n*Booking Ref:* ${bookingReference}\n*Sanctuary:* ${listing?.title || 'Sanctuary'}\n*Room Tier:* ${bookingDetails?.configuration || 'Deluxe Room'}\n*Check-in Date:* ${safeMoveInDate}\n*Guest Name:* ${safeName}`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappConfig.number}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  }, [whatsappConfig, bookingReference, listing?.title, bookingDetails?.configuration, bookingDetails?.moveInDate, bookingDetails?.name]);

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
      `DESCRIPTION:Your confirmed reservation ${bookingReference} for ${bookingDetails?.configuration || 'Sanctuary'} is active. Access PIN: ${accessPin}`,
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

  const handleCopyBookingRef = () => {
    navigator.clipboard.writeText(bookingReference);
    setCopiedCode(true);
    uiAudio.playClick();
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenMaps = () => {
    uiAudio.playClick();
    const query = encodeURIComponent(`${listing?.title || ''}, ${listing?.address || ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] flex flex-col font-sans selection:bg-amber-500/20 text-zinc-900 pb-20">
      <SEO 
        title={`Reservation Confirmed · ${listing?.title || 'ENCHO Sanctuary'}`} 
        description="Your luxury sanctuary reservation is confirmed and held in 256-bit escrow protection." 
      />

      {/* Top Header */}
      <header className="w-full bg-white/90 backdrop-blur-2xl border-b border-zinc-200/80 sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => { uiAudio.playClick(); onBackToHome(); }}
            className="flex items-center gap-2 text-xs font-bold text-zinc-700 hover:text-zinc-950 transition-all cursor-pointer bg-zinc-100/90 hover:bg-zinc-200/80 px-3.5 py-1.5 rounded-full group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to Portfolio</span>
          </button>

          <div className="flex items-center gap-2 select-none">
            <span className="font-black text-xl tracking-tighter text-zinc-950 font-display">ENCHO</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-600 uppercase font-mono">Confirmed</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-900 px-3.5 py-1.5 rounded-full border border-emerald-200/80 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-wider font-mono">Escrow Locked</span>
          </div>
        </div>
      </header>

      {/* Main Confirmation Content */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
        
        {/* Obsidian Hero Status Card */}
        <div className="bg-zinc-950 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-2xl border border-zinc-800">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider font-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Sanctuary Escrow Verified</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-400">Ref:</span>
                <span className="text-xs font-mono font-bold text-amber-300 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md">{bookingReference}</span>
                <button
                  type="button"
                  onClick={handleCopyBookingRef}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-md border border-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                  title="Copy Reference"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight font-display text-white">
                Your Sanctuary is Locked & Reserved.
              </h1>
              <p className="text-zinc-400 text-sm md:text-base font-normal max-w-2xl leading-relaxed">
                Welcome, <strong className="text-white font-semibold">{bookingDetails?.name || 'Valued Guest'}</strong>. Your stay at <strong className="text-white font-semibold">{listing?.title || 'the sanctuary'}</strong> is secured with 100% Escrow Protection.
              </p>
            </div>

            {/* Smart Access Pass Token Box */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Room Category</span>
                <span className="text-sm font-bold text-white font-display block truncate">{bookingDetails?.configuration || 'Deluxe Double'}</span>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Check-In Date</span>
                <span className="text-sm font-bold text-white font-display block">
                  {bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Confirmed'}
                </span>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 font-mono flex items-center gap-1">
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>Keyless Entry PIN</span>
                </span>
                <span className="text-sm font-mono font-black text-amber-300 block tracking-widest">#{accessPin}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Turn-by-Turn GPS & Verified Host Dossier */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Turn-by-Turn Map Action */}
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-xs space-y-3.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                <h3 className="font-extrabold text-sm text-zinc-900 font-display">Sanctuary Location</h3>
              </div>
              <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                {listing?.address || 'Exclusive Sanctuary Location'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenMaps}
              className="w-full py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-zinc-700" />
              <span>Open in Google / Apple Maps ↗</span>
            </button>
          </div>

          {/* Verified Host Concierge */}
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-xs space-y-3.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold text-sm text-zinc-900 font-display">Verified Sanctuary Host</h3>
              </div>
              <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                Host Concierge is on standby for personalized arrival, early luggage drop, or chef requests.
              </p>
            </div>

            <button
              type="button"
              onClick={handleWhatsAppRedirect}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <MessageCircleIcon className="w-4 h-4" />
              <span>Chat with Concierge ({whatsappConfig?.number ? 'Instant' : '24/7'})</span>
            </button>
          </div>
        </div>

        {/* Action Suite: View in Account, Calendar Sync & Printable VAT Invoice */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <h3 className="text-sm font-extrabold text-zinc-900 font-display uppercase tracking-tight">
              Post-Reservation Actions
            </h3>
            <span className="text-[10px] font-mono text-zinc-400">Instant PDF & Sync</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={downloadCalendarEvent}
              className="py-3.5 px-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Calendar className="w-4 h-4 text-zinc-600" />
              <span>Add to Calendar (.ics)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                uiAudio.playClick();
                window.print();
              }}
              className="py-3.5 px-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4 text-zinc-600" />
              <span>Print Tax Invoice (PDF)</span>
            </button>

            <button
              type="button"
              onClick={onBackToHome}
              className="py-3.5 px-4 rounded-2xl bg-zinc-950 hover:bg-zinc-900 text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <span>Explore More Sanctuaries ↗</span>
            </button>
          </div>
        </div>

      </main>
    </div>
  );
};

export default BookingPage;
