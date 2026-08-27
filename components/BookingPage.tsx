import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SEO } from './SEO';
import { Listing } from '../types';
import { 
  Calendar, 
  CheckCircle2, 
  MapPin, 
  Download, 
  ArrowLeft, 
  Phone, 
  Lock, 
  Sparkles,
  Key,
  Copy,
  Check,
  Printer,
  Navigation,
  UserCheck,
  FileText,
  Clock,
  Wifi,
  Share2,
  ExternalLink,
  ShieldCheck,
  Compass,
  MessageCircle,
  HelpCircle
} from 'lucide-react';
import { uiAudio } from './audio';
import { useCurrency } from './CurrencyContext';

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
    adultsCount?: number;
    childrenCount?: number;
  };
  onBackToHome: () => void;
}

export const BookingPage: React.FC<BookingPageProps> = ({ listing, bookingDetails, onBackToHome }) => {
  const { formatPrice } = useCurrency();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean; number: string } | null>(null);

  // Deterministic Luxury Booking Reference Token
  const bookingReference = useMemo(() => {
    const seed = (listing?.id || '3').toString() + (bookingDetails?.name || 'GUEST').slice(0, 3).toUpperCase();
    const numId = Number(listing?.id) || 3;
    return `ENC-${seed}-${Math.abs(numId * 7331).toString().slice(0, 4)}`;
  }, [listing?.id, bookingDetails?.name]);

  const accessPin = useMemo(() => {
    return '4829';
  }, []);

  const wifiPassword = useMemo(() => {
    return 'EnchoSanctuary2026';
  }, []);

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setWhatsappConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  // Calculate Stay Duration
  const { nights, checkInFormatted, checkOutFormatted } = useMemo(() => {
    const start = bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate) : new Date();
    const end = bookingDetails?.checkOutDate ? new Date(bookingDetails.checkOutDate) : new Date(Date.now() + 3 * 86400000);
    
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const n = diff > 0 ? diff : 1;

    return {
      nights: n,
      checkInFormatted: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      checkOutFormatted: end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    };
  }, [bookingDetails?.moveInDate, bookingDetails?.checkOutDate]);

  const handleCopy = (text: string, type: 'ref' | 'pin' | 'wifi') => {
    navigator.clipboard.writeText(text);
    uiAudio.playClick();
    if (type === 'ref') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else if (type === 'pin') {
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } else {
      setCopiedWifi(true);
      setTimeout(() => setCopiedWifi(false), 2000);
    }
  };

  const handleWhatsAppRedirect = () => {
    uiAudio.playClick();
    const phone = whatsappConfig?.number || '919876543210';
    const message = `Hello! I have just confirmed my reservation on ENCHO Space.

*Booking Ref:* ${bookingReference}
*Sanctuary:* ${listing?.title || 'Sanctuary'}
*Tier:* ${bookingDetails?.configuration || 'Deluxe'}
*Check-in:* ${checkInFormatted}
*Guest:* ${bookingDetails?.name || 'Guest'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleOpenMaps = () => {
    uiAudio.playClick();
    const query = encodeURIComponent(`${listing?.title || ''}, ${listing?.address || ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  // Apple/Google Calendar Sync (.ics)
  const downloadCalendarEvent = () => {
    uiAudio.playClick();
    const startDate = bookingDetails?.moveInDate ? new Date(bookingDetails.moveInDate).toISOString().replace(/-|:|\.\d+/g, '') : '';
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `SUMMARY:Stay at ${listing?.title || 'ENCHO Sanctuary'}`,
      `DESCRIPTION:Your confirmed reservation ${bookingReference} for ${bookingDetails?.configuration || 'Sanctuary'} is active. Keyless Access PIN: #${accessPin}`,
      `LOCATION:${listing?.address || ''}`,
      `DTSTART:${startDate}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `encho_pass_${bookingReference}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintInvoice = () => {
    uiAudio.playClick();
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col font-sans selection:bg-amber-500/30 pb-24">
      <SEO 
        title={`Reservation Pass · ${listing?.title || 'ENCHO Sanctuary'}`} 
        description="Your luxury sanctuary pass is active with 100% Escrow Protection." 
      />

      {/* Top Header */}
      <header className="w-full bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-800/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => { uiAudio.playClick(); onBackToHome(); }}
            className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-all cursor-pointer bg-zinc-900/90 hover:bg-zinc-800 px-4 py-2 rounded-full border border-zinc-800 group shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-zinc-400 group-hover:text-white" />
            <span>Return to Portfolio</span>
          </button>

          <div className="flex items-center gap-2 select-none">
            <span className="font-black text-xl tracking-tighter text-white font-display">ENCHO</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.25em] text-emerald-400 uppercase font-mono">Pass Vault</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-[10px] font-bold font-mono shadow-inner">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Escrow Protected</span>
          </div>
        </div>
      </header>

      {/* Main Apple-Standard Booking Pass Suite */}
      <main className="flex-grow max-w-5xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
        
        {/* ========================================================================= */}
        {/* 1. HERO CELEBRATION & SANCTUARY SHOWCASE                                  */}
        {/* ========================================================================= */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 p-6 md:p-10 shadow-2xl">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: Typography & Status */}
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-400 text-xs font-bold font-mono tracking-wide">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Sanctuary Escrow Verified · Check-in Ready</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl md:text-5xl font-black tracking-tight font-display text-white leading-tight">
                  Your Sanctuary is Reserved.
                </h1>
                <p className="text-zinc-400 text-sm md:text-base font-normal max-w-xl leading-relaxed">
                  Welcome, <span className="text-white font-semibold">{bookingDetails?.name || 'Valued Guest'}</span>. Your reservation at <span className="text-white font-semibold">{listing?.title}</span> is locked in the Encho Escrow Vault.
                </p>
              </div>

              {/* Quick Details Chips */}
              <div className="flex flex-wrap gap-2.5 pt-2">
                <div className="bg-zinc-900/90 border border-zinc-800 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 text-zinc-300">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-medium">{checkInFormatted}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="font-medium">{checkOutFormatted}</span>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold text-amber-300">
                  {nights} {nights === 1 ? 'Night' : 'Nights'}
                </div>
              </div>
            </div>

            {/* Right: Sanctuary Hero Card Image */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl overflow-hidden border border-zinc-700/80 shadow-2xl aspect-video sm:aspect-4/3 group">
                <img 
                  src={listing?.imageUrl || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200'} 
                  alt={listing?.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-transparent" />
                
                <div className="absolute top-3 left-3">
                  <span className="bg-zinc-950/85 backdrop-blur-md text-amber-300 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono">
                    {bookingDetails?.configuration || 'Deluxe Room'}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h3 className="font-bold text-sm truncate">{listing?.title}</h3>
                  <p className="text-xs text-zinc-300 truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{listing?.address}</span>
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. APPLE WALLET DIGITAL PASS (NFC / KEYLESS ENCLAVE)                      */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-black rounded-3xl border border-zinc-800 p-6 md:p-8 shadow-2xl relative overflow-hidden">
          
          {/* Subtle Pass Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Digital Access Pass</span>
                <span className="text-sm font-bold text-white font-display">Keyless Entry & Reception Bypass</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900 px-3.5 py-1.5 rounded-xl border border-zinc-800">
              <span className="text-xs font-mono text-zinc-400">Pass Ref:</span>
              <span className="text-xs font-mono font-bold text-amber-300">{bookingReference}</span>
              <button
                type="button"
                onClick={() => handleCopy(bookingReference, 'ref')}
                className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Copy Reference"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Pass Body: 4-Column High-Density Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
            
            {/* 1. Room Category */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 font-mono block">Reserved Category</span>
              <span className="text-sm font-bold text-white font-display truncate block">{bookingDetails?.configuration || 'Deluxe Room'}</span>
              <span className="text-[11px] text-zinc-400 block font-mono">Capacity: {bookingDetails?.adultsCount || 2} Adults</span>
            </div>

            {/* 2. Keyless Lock PIN */}
            <div className="bg-zinc-900/60 border border-amber-500/30 rounded-2xl p-4 space-y-1 relative group">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 font-mono flex items-center justify-between">
                <span>Smart Lock PIN</span>
                <button
                  type="button"
                  onClick={() => handleCopy(accessPin, 'pin')}
                  className="text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Copy PIN"
                >
                  {copiedPin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </span>
              <span className="text-xl font-mono font-black text-amber-300 tracking-widest block">#{accessPin}</span>
              <span className="text-[10px] text-zinc-400 block">Tap lock keypad & enter PIN</span>
            </div>

            {/* 3. Sanctuary High-Speed Wi-Fi */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 font-mono flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-zinc-400" />
                  <span>Wi-Fi Network</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(wifiPassword, 'wifi')}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy Wi-Fi Password"
                >
                  {copiedWifi ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </span>
              <span className="text-xs font-bold text-white font-mono truncate block">Encho_Ultra_5G</span>
              <span className="text-[10px] text-zinc-400 font-mono block truncate">Pass: {wifiPassword}</span>
            </div>

            {/* 4. Express Check-in QR */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-14 h-14 bg-white rounded-xl p-1 shrink-0 flex items-center justify-center">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`ENCHO_PASS:${bookingReference}`)}`} 
                  alt="Pass QR" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Reception QR</span>
                <span className="text-xs font-bold text-zinc-200 block">Instant Gate Pass</span>
              </div>
            </div>

          </div>

          {/* Pass Footer Bar */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Check-in: <strong className="text-white">3:00 PM</strong> · Check-out: <strong className="text-white">11:00 AM</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={downloadCalendarEvent}
                className="text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer font-mono"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Sync to Apple / Google Calendar ↗</span>
              </button>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 3. DUAL ACTION SUITE: GPS NAVIGATION & 24/7 CONCIERGE                     */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Turn-by-Turn GPS Navigation Card */}
          <div className="bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-800 shadow-xl flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">GPS Routing</span>
                  <h3 className="text-base font-bold text-white font-display">Turn-by-Turn Navigation</h3>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {listing?.address || 'Sanctuary location secured'}. Private driveway access and valet bay instructions will be broadcasted upon arrival.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenMaps}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-98 font-display uppercase tracking-wider"
            >
              <Navigation className="w-4 h-4 text-zinc-950" />
              <span>Open in Apple Maps / Google Maps ↗</span>
            </button>
          </div>

          {/* Verified Sanctuary Host Concierge Card */}
          <div className="bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-800 shadow-xl flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Host Direct</span>
                  <h3 className="text-base font-bold text-white font-display">Personal Sanctuary Concierge</h3>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Your dedicated host is on standby for luggage drop, private chef coordination, or customized arrival amenities.
              </p>
            </div>

            <button
              type="button"
              onClick={handleWhatsAppRedirect}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-98 font-display uppercase tracking-wider"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chat with Concierge (WhatsApp 24/7) ↗</span>
            </button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 4. POST-RESERVATION AUDIT & PDF TAX INVOICE                               */}
        {/* ========================================================================= */}
        <div className="bg-zinc-950 rounded-3xl p-6 md:p-8 border border-zinc-800 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono block">Financial Statement</span>
              <h3 className="text-base font-bold text-white font-display">Escrow Ledger & VAT Tax Invoice</h3>
            </div>

            <button
              type="button"
              onClick={handlePrintInvoice}
              className="py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-400" />
              <span>Print Tax Invoice (PDF)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[10px] font-mono uppercase">Total Paid</span>
              <span className="text-lg font-black text-white font-display block">
                {formatPrice(bookingDetails?.totalRent || (listing?.price || 11500) * nights, listing?.currency || 'INR')}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">✓ 100% Escrow Secured</span>
            </div>

            <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[10px] font-mono uppercase">Payment Method</span>
              <span className="text-sm font-bold text-zinc-200 font-display block">Razorpay Vault & Instant UPI</span>
              <span className="text-[10px] text-zinc-400 font-mono">Verified 256-Bit SSL</span>
            </div>

            <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[10px] font-mono uppercase">Cancellation Policy</span>
              <span className="text-sm font-bold text-emerald-300 font-display block">Free cancellation</span>
              <span className="text-[10px] text-zinc-400">Up to 48 hours before check-in</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default BookingPage;
