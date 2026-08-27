import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CreditCard, 
  ShieldCheck, 
  Sparkles, 
  Smartphone, 
  Building,
  Calendar,
  User,
  Phone,
  Mail,
  CheckCircle2,
  Lock,
  ArrowLeft,
  QrCode,
  Clock,
  Loader2,
  MapPin,
  Check,
  Zap,
  Copy,
  ChevronDown,
  ExternalLink,
  Shield
} from 'lucide-react';
import { Listing, Experience } from '../types';
import { loadRazorpayScript, verifyRazorpayPayment } from '../lib/razorpay';
import { uiAudio } from './audio';
import { useCurrency } from './CurrencyContext';
import { useAuth } from './AuthContext';

// Official High-Fidelity SVG Brand Icons
export const GPayIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M23.49 12.28c0-.79-.07-1.54-.19-2.28H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.81z" fill="#4285F4"/>
    <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.33 21.46 7.37 24 12 24z" fill="#34A853"/>
    <path d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" fill="#FBBC05"/>
    <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.33 2.54 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335"/>
  </svg>
);

export const PhonePeIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <circle cx="12" cy="12" r="12" fill="#5F259F"/>
    <path d="M14.8 6.5h-4.3c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h1.5v-3.8h1.8c2.1 0 3.8-1.7 3.8-3.8s-1.7-3.4-3.8-3.4zm-.2 4.6h-2.6V8.7h2.6c.9 0 1.6.7 1.6 1.6s-.7 1.6-1.6 1.6z" fill="#FFFFFF"/>
    <path d="M13.2 13.7l2.8 4.8h-2.3l-2.4-4.2 1.9-.6z" fill="#FFFFFF"/>
  </svg>
);

export const PaytmIcon = ({ className = "w-7 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 40 24" className={className} fill="none">
    <rect width="40" height="24" rx="4" fill="#002E6E"/>
    <text x="4" y="16" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="12" fill="#00BAF2">Pay</text>
    <text x="24" y="16" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="12" fill="#FFFFFF">tm</text>
  </svg>
);

export const UpiIcon = ({ className = "w-6 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 32 24" className={className} fill="none">
    <rect width="32" height="24" rx="4" fill="#09090B"/>
    <path d="M7 6l5 12h3L10 6H7z" fill="#00B9F5"/>
    <path d="M15 6l5 12h3l-5-12h-3z" fill="#78BE20"/>
    <path d="M23 6l3 7.5L29 6h-6z" fill="#FF5F00"/>
  </svg>
);

// Clean International Country Codes
const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+1', flag: '🇺🇸', name: 'USA' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+41', flag: '🇨🇭', name: 'Switzerland' },
];

const ROOM_TIER_META = {
  suites: {
    id: 'suites' as const,
    name: 'Presidential Panorama Suite',
    shortName: 'Suites',
    icon: '👑',
    price: 18500,
    priceUsd: 220,
    capacity: 3,
    specs: '1,200 sq.ft · 270° Valley View · Heated Jacuzzi',
    tag: 'Master Luxury'
  },
  deluxe: {
    id: 'deluxe' as const,
    name: 'Deluxe Garden Double Room',
    shortName: 'Deluxe',
    icon: '🌿',
    price: 11500,
    priceUsd: 140,
    capacity: 2,
    specs: '650 sq.ft · Garden Verandah · Twin Plush Beds',
    tag: 'Recommended Anchor'
  },
  executive: {
    id: 'executive' as const,
    name: 'Executive Studio Sanctuary',
    shortName: 'Executive',
    icon: '💼',
    price: 7500,
    priceUsd: 90,
    capacity: 1,
    specs: '420 sq.ft · Ergonomic Work Enclave · Rain Shower',
    tag: 'Solo & Work'
  }
};

interface CheckoutPageProps {
  listing?: Listing;
  experience?: Experience;
  numTickets?: number;
  initialData: {
    roomTier?: 'suites' | 'deluxe' | 'executive';
    roomTierName?: string;
    roomTierIcon?: string;
    roomTierSpecs?: string;
    nightlyRate?: number;
    moveInDate: string;
    checkOutDate?: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent?: number;
    baseRent?: number;
    fees?: number;
    taxes?: number;
    guests?: number;
    adultsCount?: number;
    childrenCount?: number;
    infantsCount?: number;
    currency?: 'INR' | 'USD';
  };
  onSuccess: (data: {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
    roomIds: string[];
  }) => void;
  onCancel: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ listing, experience, numTickets = 1, initialData, onSuccess, onCancel }) => {
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const isExperience = !!experience;

  // Active In-Checkout Room Tier
  const [activeRoomTier, setActiveRoomTier] = useState<'suites' | 'deluxe' | 'executive'>(() => {
    return initialData.roomTier || 'deluxe';
  });

  // Stay Dates State
  const [moveInDate, setMoveInDate] = useState(
    isExperience 
      ? (experience?.start_date || new Date().toISOString().split('T')[0])
      : (initialData.moveInDate || new Date().toISOString().split('T')[0])
  );

  const [checkOutDate, setCheckOutDate] = useState(
    initialData.checkOutDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d.toISOString().split('T')[0];
    })()
  );

  // Guest Identity Dossier Auto-Filled from User / Google Auth
  const [guestName, setGuestName] = useState(() => initialData.name || user?.name || '');
  const [guestEmail, setGuestEmail] = useState(() => user?.email || '');
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]);
  const [guestPhone, setGuestPhone] = useState(() => {
    if (initialData.phone) return initialData.phone.replace(/^\+\d+\s*/, '');
    if (user?.phone) return user.phone.replace(/^\+\d+\s*/, '');
    return '';
  });
  const [isEditingGuest, setIsEditingGuest] = useState(false);

  // Granular Occupancy
  const [adultsCount, setAdultsCount] = useState<number>(initialData.adultsCount || 2);
  const [childrenCount, setChildrenCount] = useState<number>(initialData.childrenCount || 0);
  const [infantsCount, setInfantsCount] = useState<number>(initialData.infantsCount || 0);
  const [showOccupancyModal, setShowOccupancyModal] = useState<boolean>(false);

  const [copiedVpa, setCopiedVpa] = useState<boolean>(false);

  // 10-Minute Escrow Lock Timer
  const [escrowTimeLeft, setEscrowTimeLeft] = useState(599);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState('Securing Escrow Vault...');

  useEffect(() => {
    const timer = setInterval(() => {
      setEscrowTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update info when user logs in or profile changes
  useEffect(() => {
    if (user) {
      if (!guestName && user.name) setGuestName(user.name);
      if (!guestEmail && user.email) setGuestEmail(user.email);
      if (!guestPhone && user.phone) setGuestPhone(user.phone.replace(/^\+\d+\s*/, ''));
    }
  }, [user]);

  const formatEscrowTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Dynamic Double-Entry Ledger Calculation
  const tierMeta = ROOM_TIER_META[activeRoomTier];
  const nights = useMemo(() => {
    const start = new Date(moveInDate).getTime();
    const end = new Date(checkOutDate).getTime();
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [moveInDate, checkOutDate]);

  const nightlyRate = useMemo(() => {
    if (isExperience) return experience?.price || 0;
    if (listing?.currency === 'USD') return tierMeta.priceUsd;
    if (listing?.price && listing.price > 1000) {
      if (activeRoomTier === 'suites') return Math.round(listing.price * 1.35);
      if (activeRoomTier === 'executive') return Math.round(listing.price * 0.65);
      return listing.price;
    }
    return tierMeta.price;
  }, [isExperience, experience, listing, activeRoomTier, tierMeta]);

  const baseRentTotal = isExperience ? nightlyRate * numTickets : nightlyRate * nights;
  const enchoOptimizationFee = Math.round(baseRentTotal * 0.15); // 15% Concierge & Escrow
  const statutoryGst = Math.round((baseRentTotal + enchoOptimizationFee) * 0.18); // 18% Statutory GST
  const grandTotal = baseRentTotal + enchoOptimizationFee + statutoryGst;

  const handleCopyVpa = () => {
    navigator.clipboard.writeText('encho.space@icici');
    setCopiedVpa(true);
    uiAudio.playClick();
    setTimeout(() => setCopiedVpa(false), 2000);
  };

  // 10/10 Razorpay Default Gateway Execution
  const handleExecutePayment = async () => {
    const effectivePhone = guestPhone.trim() ? `${countryCode.code} ${guestPhone.trim()}` : (user?.phone || '+91 9876543210');
    const effectiveName = guestName.trim() || user?.name || 'Guest Traveler';
    const effectiveEmail = guestEmail.trim() || user?.email || `${effectiveName.toLowerCase().replace(/\s+/g, '.')}@encho.space`;

    setIsProcessingPayment(true);
    setProcessingStatusText('Initializing Razorpay Gateway...');
    uiAudio.playClick();

    try {
      const token = localStorage.getItem('token');
      const orderRes = await fetch('/api/checkout/razorpay/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          listingId: listing?.id,
          experienceId: experience?.id,
          moveInDate,
          checkOutDate,
          configuration: isExperience ? `${numTickets} Tickets` : tierMeta.name,
          numTickets: isExperience ? numTickets : 1,
          name: effectiveName,
          phone: effectivePhone,
          email: effectiveEmail,
          amount: grandTotal
        })
      });

      const orderData = orderRes.headers.get('content-type')?.includes('json') ? await orderRes.json() : { error: 'Server returned non-JSON response: ' + (await orderRes.text()).slice(0, 150) } as any;
      if (!orderRes.ok || !orderData.order_id) {
        throw new Error(orderData.error || 'Failed to initialize payment gateway order');
      }

      const scriptLoaded = await loadRazorpayScript();

      if (scriptLoaded && (window as any).Razorpay && !orderData.isSimulated) {
        setProcessingStatusText('Awaiting Authorization...');

        const options: any = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: 'INR',
          name: 'Encho Space Sanctuary',
          description: `${tierMeta.name} Escrow Booking`,
          image: 'https://encho-space-chi.vercel.app/favicon.ico',
          order_id: orderData.order_id,
          prefill: {
            name: effectiveName,
            contact: effectivePhone,
            email: effectiveEmail
          },
          theme: { color: '#09090b', backdrop_color: 'rgba(0,0,0,0.85)' },
          handler: async function (response: any) {
            setProcessingStatusText('Verifying Cryptographic Signature...');
            const verifyData = await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              booking_id: orderData.bookingType === 'listing' ? orderData.bookingId : undefined,
              experience_booking_id: orderData.bookingType === 'experience' ? orderData.bookingId : undefined
            });

            if (verifyData.success) {
              uiAudio.playSuccess();
              setIsProcessingPayment(false);
              onSuccess({
                moveInDate,
                configuration: isExperience ? `${numTickets} Tickets` : tierMeta.name,
                name: effectiveName,
                phone: effectivePhone,
                totalRent: grandTotal,
                roomIds: []
              });
            } else {
              uiAudio.playError();
              alert(`Signature Verification Failed: ${verifyData.error}`);
              setIsProcessingPayment(false);
            }
          },
          modal: {
            ondismiss: function () {
              setIsProcessingPayment(false);
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // High-Fidelity Test Mode
        setTimeout(async () => {
          setProcessingStatusText('Connecting Razorpay Gateway Sandbox...');
          const mockPaymentId = `pay_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const mockSignature = `rzp_sig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          setTimeout(async () => {
            setProcessingStatusText('Locking Sanctuary in Escrow...');
            const verifyData = await verifyRazorpayPayment({
              razorpay_order_id: orderData.order_id,
              razorpay_payment_id: mockPaymentId,
              razorpay_signature: mockSignature,
              booking_id: orderData.bookingType === 'listing' ? orderData.bookingId : undefined,
              experience_booking_id: orderData.bookingType === 'experience' ? orderData.bookingId : undefined
            });

            setIsProcessingPayment(false);
            if (verifyData.success) {
              uiAudio.playSuccess();
              onSuccess({
                moveInDate,
                configuration: isExperience ? `${numTickets} Tickets` : tierMeta.name,
                name: effectiveName,
                phone: effectivePhone,
                totalRent: grandTotal,
                roomIds: []
              });
            } else {
              uiAudio.playError();
              alert(`Payment Verification Error: ${verifyData.error}`);
            }
          }, 600);
        }, 500);
      }
    } catch (err: any) {
      uiAudio.playError();
      alert(`Payment Gateway Error: ${err.message}`);
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans text-zinc-900 pb-28 lg:pb-16 selection:bg-amber-500/20">
      
      {/* Top Header */}
      <header className="w-full bg-white/90 backdrop-blur-2xl border-b border-zinc-200/80 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => { uiAudio.playClick(); onCancel(); }}
            className="flex items-center gap-2 text-xs font-bold text-zinc-600 hover:text-zinc-950 transition-all cursor-pointer bg-zinc-100 hover:bg-zinc-200/80 px-3.5 py-1.5 rounded-full"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Sanctuary</span>
            <span className="sm:hidden">Back</span>
          </button>

          <div className="flex items-center gap-2 select-none">
            <span className="font-black text-xl tracking-tight text-zinc-950 font-display">ENCHO</span>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase font-mono">Vault</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-900 px-3 py-1 rounded-full border border-emerald-200/80 text-[10px] font-bold font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-Bit SSL</span>
          </div>
        </div>
      </header>

      {/* Escrow Timer Pill Bar */}
      <div className="bg-zinc-950 text-white py-2 px-4 text-center text-xs font-medium flex items-center justify-center gap-2">
        <Clock className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-zinc-300">Sanctuary held in escrow for</span>
        <span className="font-mono font-bold text-amber-300 bg-zinc-900 px-2 py-0.5 rounded text-[11px] border border-zinc-800">
          {formatEscrowTime(escrowTimeLeft)}
        </span>
      </div>

      {/* Main Single-Screen Grid */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-4 md:px-8 py-6 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN (42% / 5 Cols): SANCTUARY DOSSIER                             */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-5">
            
            {/* Sanctuary Image & Title Hero */}
            <div className="space-y-3">
              <div className="w-full h-44 rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200 relative">
                <img 
                  src={isExperience ? (experience?.image_urls?.[0] || undefined) : (listing?.imageUrl || undefined)} 
                  alt={isExperience ? experience?.title : listing?.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent pointer-events-none" />
                
                <div className="absolute top-3 left-3">
                  <span className="bg-zinc-900/90 backdrop-blur-md text-amber-300 border border-white/15 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono flex items-center gap-1">
                    <span>{tierMeta.icon}</span>
                    <span>{tierMeta.shortName}</span>
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h3 className="font-extrabold text-base md:text-lg leading-tight truncate font-display">
                    {isExperience ? experience?.title : listing?.title}
                  </h3>
                  <p className="text-xs text-zinc-200 font-medium truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{isExperience ? experience?.destination : listing?.address}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Room Tier Selector */}
            {!isExperience && (
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
                  Room Tier
                </span>

                <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-100 rounded-2xl">
                  {(['suites', 'deluxe', 'executive'] as const).map(tierKey => {
                    const t = ROOM_TIER_META[tierKey];
                    const isSelected = activeRoomTier === tierKey;
                    const tRate = listing?.currency === 'USD' ? t.priceUsd : (listing?.price && listing.price > 1000 ? (tierKey === 'suites' ? Math.round(listing.price * 1.35) : tierKey === 'executive' ? Math.round(listing.price * 0.65) : listing.price) : t.price);
                    return (
                      <button
                        key={tierKey}
                        type="button"
                        onClick={() => {
                          uiAudio.playClick();
                          setActiveRoomTier(tierKey);
                          if (tierKey === 'executive') setAdultsCount(1);
                        }}
                        className={`py-2 px-1.5 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                          isSelected
                            ? 'bg-white text-zinc-950 shadow-xs font-bold'
                            : 'text-zinc-500 hover:text-zinc-900'
                        }`}
                      >
                        <span className="text-xs">{t.icon}</span>
                        <span className="text-[11px] font-bold tracking-tight mt-0.5 font-display">{t.shortName}</span>
                        <span className="text-[10px] font-mono text-zinc-600">
                          {listing?.currency === 'USD' ? `$${tRate}` : `₹${Math.round(tRate / 1000)}k`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stay Dates & Occupancy */}
            <div className="pt-4 border-t border-zinc-100 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
                <span>Stay Details</span>
                <span className="text-zinc-900 font-bold">{nights} {nights === 1 ? 'Night' : 'Nights'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded-2xl border border-zinc-200/70 text-xs">
                <div>
                  <span className="block text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 font-mono">Check-in</span>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={moveInDate}
                    onChange={(e) => { uiAudio.playClick(); setMoveInDate(e.target.value); }}
                    className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-bold text-zinc-800 outline-none cursor-pointer"
                  />
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 font-mono">Check-out</span>
                  <input
                    type="date"
                    min={moveInDate}
                    value={checkOutDate}
                    onChange={(e) => { uiAudio.playClick(); setCheckOutDate(e.target.value); }}
                    className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-bold text-zinc-800 outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Occupancy Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { uiAudio.playClick(); setShowOccupancyModal(prev => !prev); }}
                  className="w-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/70 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-800 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{adultsCount} Adult{adultsCount > 1 ? 's' : ''} {childrenCount > 0 ? `· ${childrenCount} Child` : ''}</span>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500 font-mono">Modify ✎</span>
                </button>

                {showOccupancyModal && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 shadow-xl rounded-2xl p-4 z-50 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-900">Adults (Age 13+)</span>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={adultsCount <= 1} onClick={() => setAdultsCount(p => Math.max(1, p - 1))} className="w-6 h-6 rounded bg-zinc-100 font-bold">-</button>
                        <span className="font-mono font-bold w-4 text-center">{adultsCount}</span>
                        <button type="button" onClick={() => setAdultsCount(p => p + 1)} className="w-6 h-6 rounded bg-zinc-100 font-bold">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                      <span className="font-bold text-zinc-900">Children (Ages 2–12)</span>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={childrenCount <= 0} onClick={() => setChildrenCount(p => Math.max(0, p - 1))} className="w-6 h-6 rounded bg-zinc-100 font-bold">-</button>
                        <span className="font-mono font-bold w-4 text-center">{childrenCount}</span>
                        <button type="button" onClick={() => setChildrenCount(p => p + 1)} className="w-6 h-6 rounded bg-zinc-100 font-bold">+</button>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowOccupancyModal(false)} className="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl mt-1">Apply</button>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Ledger */}
            <div className="pt-4 border-t border-zinc-100 space-y-2.5 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>{tierMeta.name} ({formatPrice(nightlyRate, listing?.currency || 'INR')} × {nights} nts)</span>
                <span className="font-mono font-bold text-zinc-900">{formatPrice(baseRentTotal, listing?.currency || 'INR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Concierge & Escrow Protection (15%)</span>
                <span className="font-mono font-bold text-zinc-900">{formatPrice(enchoOptimizationFee, listing?.currency || 'INR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Statutory GST (18%)</span>
                <span className="font-mono font-bold text-zinc-900">{formatPrice(statutoryGst, listing?.currency || 'INR')}</span>
              </div>

              <div className="pt-3 border-t border-zinc-100 flex justify-between items-baseline">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-900 font-display">Total Amount</span>
                <span className="text-2xl font-black text-zinc-950 font-display tabular-nums">
                  {formatPrice(grandTotal, listing?.currency || 'INR')}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN (58% / 7 Cols): 10/10 GUEST DOSSIER & UNIFIED UPI + RAZORPAY  */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 border border-zinc-200 shadow-xs space-y-6">
          
          {/* SECTION 1: Guest Contact Information (Auto-Fetched from Account / Google Sign-in) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-black flex items-center justify-center font-mono">1</span>
                <h3 className="text-sm font-extrabold text-zinc-900 tracking-tight uppercase font-display">Guest Identity</h3>
              </div>
              {user && !isEditingGuest && (
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                  ✓ Verified Account
                </span>
              )}
            </div>

            {/* If logged in: Show clean verified profile card with 1-tap Edit */}
            {user && !isEditingGuest ? (
              <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 text-white font-bold flex items-center justify-center text-sm font-mono">
                    {(guestName || user.name || 'G').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900">{guestName || user.name}</span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {user.email} {guestPhone ? `· ${countryCode.code} ${guestPhone}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { uiAudio.playClick(); setIsEditingGuest(true); }}
                  className="text-xs font-bold text-zinc-700 hover:text-zinc-950 px-3 py-1.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Edit ✎
                </button>
              </div>
            ) : (
              /* If not logged in or in Edit mode: Show clean minimal Name + Phone and Optional Email */
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 font-mono">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="e.g. Johnathan Doe"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:bg-white focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 font-mono">
                      Mobile / WhatsApp
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={countryCode.code}
                        onChange={(e) => {
                          const found = COUNTRY_CODES.find(c => c.code === e.target.value);
                          if (found) setCountryCode(found);
                        }}
                        className="bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-2.5 text-xs font-bold text-zinc-800 outline-none cursor-pointer"
                      >
                        {COUNTRY_CODES.map(c => (
                          <option key={c.name} value={c.code}>{c.flag} {c.code}</option>
                        ))}
                      </select>

                      <div className="relative flex-1">
                        <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="98765 43210"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:bg-white focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
                      Email Address <span className="text-zinc-400 font-normal lowercase">(optional)</span>
                    </label>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="e.g. johnathan.doe@gmail.com (optional)"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:bg-white focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all outline-none font-mono"
                    />
                  </div>
                </div>

                {user && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingGuest(false)}
                      className="text-xs font-bold text-zinc-700 hover:text-zinc-950 font-mono cursor-pointer"
                    >
                      Done Editing ✓
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-px bg-zinc-100" />

          {/* SECTION 2: Unified Universal UPI QR & Razorpay Hub */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-black flex items-center justify-center font-mono">2</span>
                <h3 className="text-sm font-extrabold text-zinc-900 tracking-tight uppercase font-display">Payment Vault</h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 font-bold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-500" />
                <span>Instant Auto-QR Sync</span>
              </span>
            </div>

            {/* Universal Dynamic UPI QR Code Box */}
            <div className="bg-zinc-50 rounded-3xl p-5 md:p-6 border border-zinc-200/90 flex flex-col items-center text-center space-y-4">
              
              <div className="space-y-1">
                <span className="text-xs font-extrabold text-zinc-950 uppercase tracking-wider font-display block">
                  Scan & Pay with Any UPI App
                </span>
                <p className="text-[11px] text-zinc-500 font-medium max-w-sm">
                  Point your camera or open Google Pay, PhonePe, Paytm, or BHIM to approve ₹{grandTotal.toLocaleString()}
                </p>
              </div>

              {/* Dynamic Live QR Canvas */}
              <div className="w-48 h-48 bg-white rounded-2xl flex items-center justify-center border border-zinc-200/90 p-2.5 shadow-sm">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=encho.space@icici&pn=ENCHO_SPACE&am=${grandTotal}&cu=INR&tn=${encodeURIComponent(tierMeta.name)}`)}`}
                  alt="Universal UPI Payment QR Code"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Official Brand Logo Trust Badges */}
              <div className="flex items-center justify-center gap-3 bg-white px-4 py-2 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="flex items-center gap-1.5" title="Google Pay">
                  <GPayIcon className="w-4 h-4" />
                  <span className="text-[10px] font-bold text-zinc-700 font-display">GPay</span>
                </div>
                <span className="text-zinc-300">·</span>
                <div className="flex items-center gap-1.5" title="PhonePe">
                  <PhonePeIcon className="w-4 h-4" />
                  <span className="text-[10px] font-bold text-zinc-700 font-display">PhonePe</span>
                </div>
                <span className="text-zinc-300">·</span>
                <div className="flex items-center gap-1.5" title="Paytm">
                  <PaytmIcon className="w-5 h-3" />
                  <span className="text-[10px] font-bold text-zinc-700 font-display">Paytm</span>
                </div>
                <span className="text-zinc-300">·</span>
                <div className="flex items-center gap-1" title="BHIM / Any UPI">
                  <UpiIcon className="w-4 h-3" />
                  <span className="text-[10px] font-bold text-zinc-700 font-display">BHIM</span>
                </div>
              </div>

              {/* Copyable UPI VPA Pill */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-600 bg-white px-3 py-1 rounded-lg border border-zinc-200">
                  encho.space@icici
                </span>
                <button
                  type="button"
                  onClick={handleCopyVpa}
                  className="text-xs font-bold text-zinc-800 bg-white hover:bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-zinc-600" />
                  <span>{copiedVpa ? 'Copied!' : 'Copy UPI ID'}</span>
                </button>
              </div>

            </div>

            {/* Clear "OR" Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="border-t border-zinc-200 w-full" />
              <span className="bg-white px-3 text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest font-mono shrink-0">
                OR PAY VIA RAZORPAY GATEWAY
              </span>
              <div className="border-t border-zinc-200 w-full" />
            </div>

            {/* Primary Razorpay Action Trigger */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExecutePayment}
                disabled={isProcessingPayment}
                className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-bold font-display py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm tracking-wide"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>{processingStatusText}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span>Pay {formatPrice(grandTotal, listing?.currency || 'INR')} with Razorpay Gateway ↗</span>
                  </>
                )}
              </button>
              
              <p className="text-center text-[11px] text-zinc-500 font-medium">
                Supports Credit & Debit Cards (Visa, Mastercard, Amex), Apple Pay, Netbanking, & EMI
              </p>

              <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400 font-medium pt-2">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Instant WhatsApp Confirmation</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>100% Escrow Protection</span>
                </span>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Mobile Sticky Bottom Vault Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-zinc-200 shadow-lg z-50 px-4 py-3 pb-safe">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-zinc-400 uppercase">{tierMeta.shortName} · {nights} nts</span>
            <span className="text-lg font-black text-zinc-950 font-display tabular-nums">
              {formatPrice(grandTotal, listing?.currency || 'INR')}
            </span>
          </div>
          <button 
            onClick={handleExecutePayment}
            disabled={isProcessingPayment}
            className="bg-zinc-950 hover:bg-zinc-900 text-white font-bold font-display uppercase tracking-wider text-xs py-3.5 px-6 rounded-full active:scale-95 transition-all shadow-md flex-1 max-w-[200px] cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isProcessingPayment ? 'Securing...' : 'Pay & Lock ↗'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default CheckoutPage;
