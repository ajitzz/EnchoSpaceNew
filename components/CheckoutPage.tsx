import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  CreditCard, 
  ShieldCheck, 
  Sparkles, 
  Percent, 
  Calculator, 
  Check, 
  Smartphone, 
  Wallet, 
  ChevronRight, 
  TrendingUp, 
  Building2, 
  Building,
  Info,
  ArrowRight,
  ShieldAlert,
  Calendar,
  User,
  Phone,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Briefcase,
  Layers,
  Sparkle
} from 'lucide-react';
import { Listing, Experience } from '../types';
import { uiAudio } from './audio';
import { useCurrency } from './CurrencyContext';

const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY || 'pk_dummy');

// EMI Bank Options with interest rates (per annum)
const EMI_BANKS = [
  { id: 'hdfc', name: 'HDFC Bank', rate: 13.5, logo: 'HDFC' },
  { id: 'icici', name: 'ICICI Bank', rate: 14.0, logo: 'ICICI' },
  { id: 'sbi', name: 'State Bank of India (SBI)', rate: 13.0, logo: 'SBI' },
  { id: 'axis', name: 'Axis Bank', rate: 14.5, logo: 'AXIS' },
  { id: 'kotak', name: 'Kotak Mahindra Bank', rate: 15.0, logo: 'KOTAK' },
];

const EMI_TENURES = [3, 6, 9, 12];

const CheckoutForm = ({ amount, onPaymentSuccess, onCancel }: { amount: number, onPaymentSuccess: () => void, onCancel: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { formatPrice } = useCurrency();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    uiAudio.playClick();

    if (process.env.VITE_STRIPE_PUBLIC_KEY) {
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setError(submitError.message || 'An error occurred.');
          setProcessing(false);
          return;
        }
    }

    const res = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'inr' })
    });
    
    if (!res.ok) {
       let isStripeNotConfigured = false;
       try {
           const data = await res.json();
           if (data.error === 'Stripe is not configured') isStripeNotConfigured = true;
       } catch (e) {
           // ignore
       }
       if (isStripeNotConfigured) {
           onPaymentSuccess();
           return;
       }
       setError("Failed to initialize payment. Stripe API key might be missing.");
       setProcessing(false);
       return;
    }

    const { clientSecret } = await res.json();

    const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
            return_url: window.location.href,
        },
        redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed.');
      setProcessing(false);
    } else {
      onPaymentSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
      <button 
        disabled={processing || !stripe} 
        type="submit" 
        className="w-full py-4 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-2xl transition-all shadow-xl disabled:opacity-50 text-sm active:scale-95"
      >
        {processing ? 'Processing Secure Transaction...' : `Pay ${formatPrice(amount, 'INR')}`}
      </button>
    </form>
  );
};

interface CheckoutPageProps {
  listing?: Listing;
  experience?: Experience;
  numTickets?: number;
  initialData: {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
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
  const [rates, setRates] = useState({ commission_rate: 10, tax_rate: 18, system_fee: 150 });
  const { formatPrice } = useCurrency();
  const [activeStep, setActiveStep] = useState<number>(1); // Step 1: Details, Step 2: Protection, Step 3: Payment
  const [protectionSelected, setProtectionSelected] = useState<boolean>(true);
  const [gatewayTab, setGatewayTab] = useState<'razorpay' | 'stripe'>('razorpay');
  const [razorpayMethod, setRazorpayMethod] = useState<'upi' | 'emi'>('upi');
  
  const isExperience = !!experience;

  // Funnel details
  const [moveInDate, setMoveInDate] = useState(
    isExperience 
      ? (experience?.start_date || new Date().toISOString().split('T')[0])
      : (initialData.moveInDate || new Date().toISOString().split('T')[0])
  );
  const [selectedConfig, setSelectedConfig] = useState(initialData.configuration || 'Entire Place');
  const [guestName, setGuestName] = useState(initialData.name || '');
  const [guestPhone, setGuestPhone] = useState(initialData.phone || '');
  const [guestEmail, setGuestEmail] = useState('');
  
  // EMI simulation state
  const [selectedBank, setSelectedBank] = useState(EMI_BANKS[0]);
  const [selectedTenure, setSelectedTenure] = useState(6);
  
  // Custom mock UPI / EMI processing steps
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiMode, setUpiMode] = useState<'vpa' | 'qr'>('vpa');
  const [qrTimeLeft, setQrTimeLeft] = useState(300); // 5 minutes in seconds

  useEffect(() => {
    if (upiMode !== 'qr') return;
    setQrTimeLeft(300); // Reset timer to 5m when switching to QR
    const interval = setInterval(() => {
      setQrTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [upiMode]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Auto-fetch settings from Admin Panel
  useEffect(() => {
    fetch('/api/settings/payment_rates')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.commission_rate === 'number') {
          setRates(data);
        }
      })
      .catch(err => console.error("Error fetching payment rates:", err));
  }, []);

  // Determine current room price based on selected configuration
  const getSelectedPrice = () => {
    if (isExperience) {
      return (experience?.price || 0) * numTickets;
    }
    if (selectedConfig === 'Entire Place') {
      return listing?.price || 0;
    }
    const foundRoom = listing?.rooms?.find(r => r.name === selectedConfig);
    return foundRoom ? foundRoom.price : (listing?.price || 0);
  };

  const baseAmount = getSelectedPrice();
  const commissionFee = Math.round(baseAmount * (rates.commission_rate / 100));
  const subtotal = baseAmount + commissionFee;
  const taxFee = Math.round(subtotal * (rates.tax_rate / 100));
  const systemFee = rates.system_fee;
  const protectionFee = protectionSelected ? 1499 : 0;
  const finalTotal = baseAmount + commissionFee + taxFee + systemFee + protectionFee;
  const deposit = isExperience ? 0 : baseAmount * 3;

  // EMI math helper
  const calculateEMI = (principal: number, annualRate: number, months: number) => {
    const monthlyRate = annualRate / 12 / 100;
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    const totalPayment = emi * months;
    const totalInterest = totalPayment - principal;
    return {
      monthly: Math.round(emi),
      total: Math.round(totalPayment),
      interest: Math.round(totalInterest)
    };
  };

  const emiDetails = calculateEMI(finalTotal, selectedBank.rate, selectedTenure);

  // Simulated gateway execution
  const handleSimulatedPayment = () => {
    setIsSimulating(true);
    setSimulationStep(1); // Contacting Razorpay
    uiAudio.playClick();
    
    setTimeout(() => {
      setSimulationStep(2); // Awaiting authentications
    }, 1500);

    setTimeout(() => {
      setSimulationStep(3); // Approved
    }, 3000);

    setTimeout(() => {
      setIsSimulating(false);
      setSimulationStep(0);
      onSuccess({
        moveInDate,
        configuration: isExperience ? `${numTickets} Tickets` : selectedConfig,
        name: guestName,
        phone: guestPhone,
        totalRent: finalTotal,
        roomIds: isExperience ? [] : (listing?.rooms?.filter(r => r.name === selectedConfig).map(r => r.id) || [])
      });
    }, 4500);
  };

  const validateStep1 = () => {
    if (!moveInDate) {
      alert("Please select a valid date.");
      return;
    }
    if (!isExperience) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parsedDate = new Date(moveInDate);
      if (!isNaN(parsedDate.getTime()) && parsedDate < today) {
        alert("Move-in date cannot be in the past.");
        return;
      }
    }
    if (!guestName || guestName.trim().length < 2) {
      alert("Please enter a valid guest name.");
      return;
    }
    if (!guestPhone || guestPhone.replace(/\D/g, '').length < 6) {
      alert("Please enter a valid phone number.");
      return;
    }
    uiAudio.playClick();
    setActiveStep(2);
  };

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#09090b',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '16px',
    },
  };

  const options = {
      mode: 'payment' as const,
      amount: Math.round(finalTotal * 100),
      currency: 'inr',
      appearance,
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-between font-sans">
      
      {/* Complete Booking Funnel Header - Focused, Clean, No Menu */}
      <header className="w-full bg-white border-b border-zinc-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={
              activeStep === 3 
                ? () => setActiveStep(2) 
                : activeStep === 2 
                ? () => setActiveStep(1) 
                : onCancel
            }
            className="flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {activeStep === 3 ? 'Back to Protection' : activeStep === 2 ? 'Back to Details' : 'Cancel & Exit'}
          </button>

          <div className="flex items-center gap-1.5 select-none">
             <span className="font-black text-lg tracking-tighter text-zinc-950">ENCHO</span>
             <span className="text-[8px] font-bold tracking-[0.3em] text-zinc-400 uppercase">Space</span>
          </div>

          <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100">
            <Lock className="w-3 h-3 text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Secured</span>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Order details & Dynamic Calculations (Always visible for clarity) */}
        <div className="md:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/50 shadow-sm space-y-5">
            <div className="flex gap-4">
              <img 
                src={isExperience ? (experience?.image_urls?.[0] || undefined) : (listing?.imageUrl || undefined)} 
                alt={isExperience ? experience?.title : listing?.title} 
                className="w-24 h-24 object-cover rounded-2xl bg-zinc-100 flex-shrink-0"
              />
              <div className="flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[#0284C7] uppercase tracking-wider bg-[#0284C7]/5 px-2 py-0.5 rounded-md">
                    {isExperience ? "Experience" : (listing?.type || "")}
                  </span>
                  <h3 className="font-extrabold text-zinc-950 text-base leading-snug mt-1.5">
                    {isExperience ? experience?.title : listing?.title}
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 font-medium truncate max-w-[200px]">
                  {isExperience ? experience?.destination : listing?.address}
                </p>
              </div>
            </div>

            {/* Custom Interactive Selection inside the Checkout Funnel (High converting) */}
            {!isExperience && listing && (
              <div className="pt-4 border-t border-zinc-100 space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Configuration</h4>
                
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => { setSelectedConfig('Entire Place'); uiAudio.playClick(); }}
                    className={`flex items-center justify-between p-3 border rounded-xl text-left transition-all ${selectedConfig === 'Entire Place' ? 'border-[#0284C7] bg-[#0284C7]/5' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}
                  >
                    <div>
                      <p className="text-xs font-bold text-zinc-900">Entire Place</p>
                      <p className="text-[10px] text-zinc-400">Full exclusive access</p>
                    </div>
                    <span className="text-xs font-bold font-mono">{formatPrice(listing.price, 'INR')}</span>
                  </button>

                  {listing.rooms && listing.rooms.map(room => (
                    <button 
                      key={room.id}
                      onClick={() => { setSelectedConfig(room.name); uiAudio.playClick(); }}
                      className={`flex items-center justify-between p-3 border rounded-xl text-left transition-all ${selectedConfig === room.name ? 'border-[#0284C7] bg-[#0284C7]/5' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}
                    >
                      <div>
                        <p className="text-xs font-bold text-zinc-900">{room.name}</p>
                        <p className="text-[10px] text-zinc-400">Private bedroom suite</p>
                      </div>
                      <span className="text-xs font-bold font-mono">{formatPrice(room.price, 'INR')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isExperience && experience && (
              <div className="pt-4 border-t border-zinc-100 space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Quantity Details</h4>
                <div className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl flex items-center justify-between text-xs font-bold text-zinc-900">
                  <span>Selected Tickets</span>
                  <span className="font-mono bg-white border border-zinc-200 rounded-md px-2.5 py-1">{numTickets}</span>
                </div>
              </div>
            )}

            {/* Fare Summary Breakdown */}
            <div className="pt-4 border-t border-zinc-100 space-y-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pricing breakdown</h4>
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-medium text-zinc-500">
                  <span>{isExperience ? "Tickets base price" : "Base rent per month"}</span>
                  <span className="font-mono font-bold text-zinc-900">{formatPrice(baseAmount, 'INR')}</span>
                </div>
                {commissionFee > 0 && (
                  <div className="flex justify-between text-xs font-medium text-zinc-500">
                    <span>Platform service fee ({rates.commission_rate}%)</span>
                    <span className="font-mono font-bold text-zinc-900">{formatPrice(commissionFee, 'INR')}</span>
                  </div>
                )}
                {taxFee > 0 && (
                  <div className="flex justify-between text-xs font-medium text-zinc-500">
                    <span>Estimated GST / Taxes ({rates.tax_rate}%)</span>
                    <span className="font-mono font-bold text-zinc-900">{formatPrice(taxFee, 'INR')}</span>
                  </div>
                )}
                {systemFee > 0 && (
                  <div className="flex justify-between text-xs font-medium text-zinc-500">
                    <span>Flat system booking fee</span>
                    <span className="font-mono font-bold text-zinc-900">{formatPrice(systemFee, 'INR')}</span>
                  </div>
                )}
                {protectionSelected && (
                  <div className="flex justify-between text-xs font-medium text-zinc-500">
                    <span>Premium Booking Protection</span>
                    <span className="font-mono font-bold text-zinc-900">{formatPrice(1499, 'INR')}</span>
                  </div>
                )}
                {!isExperience && (
                  <div className="flex justify-between text-xs font-medium text-zinc-500">
                    <span className="flex items-center gap-1">Security deposit <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-sm">3 mo</span></span>
                    <span className="font-mono font-bold text-zinc-900">{formatPrice(deposit, 'INR')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Total */}
            <div className="pt-4 border-t border-zinc-100">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Total amount</span>
                <span className="text-2xl font-black text-zinc-950 font-mono tracking-tight">{formatPrice(finalTotal, 'INR')}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] text-zinc-500 font-semibold">Your price has been matched and is fully secured</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Step-by-Step interactive Checkout Funnel */}
        <div className="md:col-span-7 bg-white rounded-3xl p-6 md:p-8 border border-zinc-200/50 shadow-sm relative min-h-[500px]">
          
          {/* Simulation Processing overlay */}
          {isSimulating && (
             <div className="absolute inset-0 bg-white/95 backdrop-blur-xs z-50 rounded-3xl flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                <div className="relative w-16 h-16 mb-6">
                   <div className="absolute inset-0 rounded-full border-4 border-zinc-100"></div>
                   <div className="absolute inset-0 rounded-full border-4 border-[#0284C7] border-t-transparent animate-spin"></div>
                </div>
                
                <h4 className="text-lg font-bold text-zinc-950 mb-2">Processing Secure Gateway</h4>
                
                <div className="space-y-2 max-w-xs">
                   <p className={`text-xs transition-all duration-300 font-medium ${simulationStep >= 1 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                      {simulationStep >= 1 ? '✓ Connected to payment gateway' : 'Connecting...'}
                   </p>
                   <p className={`text-xs transition-all duration-300 font-medium ${simulationStep >= 2 ? 'text-[#0284C7] font-bold' : 'text-zinc-300'}`}>
                      {simulationStep === 2 ? '⚡ Waiting for customer OTP / UPI approval...' : simulationStep > 2 ? '✓ Authorized successfully' : 'Verifying transaction'}
                   </p>
                   <p className={`text-xs transition-all duration-300 font-medium ${simulationStep >= 3 ? 'text-emerald-600 font-bold animate-pulse' : 'text-zinc-300'}`}>
                      {simulationStep >= 3 ? '🎉 Approved! Finalizing reservation' : 'Securing booking slot'}
                   </p>
                </div>
             </div>
          )}

          {/* Funnel Progress Steps */}
          <div className="flex items-center gap-3 mb-8 pb-5 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeStep >= 1 ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-400'}`}>1</span>
              <span className={`text-xs font-bold ${activeStep === 1 ? 'text-zinc-950' : 'text-zinc-400'}`}>Details</span>
            </div>
            <div className="h-px bg-zinc-200 flex-grow"></div>
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeStep >= 2 ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-400'}`}>2</span>
              <span className={`text-xs font-bold ${activeStep === 2 ? 'text-zinc-950' : 'text-zinc-400'}`}>Protection</span>
            </div>
            <div className="h-px bg-zinc-200 flex-grow"></div>
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeStep === 3 ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-400'}`}>3</span>
              <span className={`text-xs font-bold ${activeStep === 3 ? 'text-zinc-950' : 'text-zinc-400'}`}>Payment</span>
            </div>
          </div>

          {activeStep === 1 && (
            /* Step 1: Booking Information */
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-black text-zinc-950 tracking-tight">Booking Information</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isExperience 
                  ? "Please verify your booking details and enter contact information. Your details will be sent to the guide automatically upon complete checkout."
                  : "Please enter your desired move-in date and contact information. Your details will be sent to the host automatically upon complete checkout."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" /> {isExperience ? "Departure Date" : "Move-in Date"}
                  </label>
                  <input 
                    type={isExperience ? "text" : "date"}
                    value={moveInDate}
                    disabled={isExperience}
                    onChange={(e) => setMoveInDate(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-zinc-950 focus:outline-none transition-all text-xs font-bold text-zinc-850 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-zinc-400" /> Guest Full Name
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g. Ajith Sab"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-zinc-950 focus:outline-none transition-all text-xs font-bold text-zinc-850"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-zinc-400" /> Phone number
                  </label>
                  <input 
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-zinc-950 focus:outline-none transition-all text-xs font-bold text-zinc-850"
                  />
                </div>
              </div>

              <button 
                onClick={validateStep1}
                className="w-full py-4 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 text-sm mt-4 active:scale-95 cursor-pointer"
              >
                Proceed to Protection Pack
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeStep === 2 && (
            /* Step 2: Protection Package */
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-zinc-950 tracking-tight">Booking Protection</h2>
                <button 
                  onClick={() => setActiveStep(1)}
                  className="text-xs font-bold text-zinc-400 hover:text-zinc-950 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Secure your investment with our Encho Premium Protection Shield. Cover cancellation fees, medical emergencies, and luggage losses.
              </p>

              <div className="space-y-4">
                {/* Option A: Premium Coverage */}
                <button
                  type="button"
                  onClick={() => { setProtectionSelected(true); uiAudio.playClick(); }}
                  className={`w-full p-5 rounded-2xl text-left transition-all duration-300 border-2 relative overflow-hidden group flex items-start gap-4 cursor-pointer ${
                    protectionSelected 
                      ? 'border-[#0284C7] bg-[#0284C7]/5' 
                      : 'border-zinc-200 bg-white hover:border-zinc-400'
                  }`}
                >
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    protectionSelected ? 'border-[#0284C7] bg-[#0284C7] text-white' : 'border-zinc-300 bg-white'
                  }`}>
                    {protectionSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <h4 className="font-bold text-sm text-zinc-900 group-hover:text-[#0284C7] transition-colors">Encho Care Premium Protection</h4>
                      <span className="text-xs font-black text-zinc-950 font-mono">{formatPrice(1499, 'INR')}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      100% full refund on medical issues, trip cancellations, or transport delays. Includes 24/7 dedicated guest support.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Fully Refundable</span>
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-zinc-100 text-zinc-600 border border-zinc-200">Luggage Covered</span>
                    </div>
                  </div>
                </button>

                {/* Option B: Standard Stay (No Protection) */}
                <button
                  type="button"
                  onClick={() => { setProtectionSelected(false); uiAudio.playClick(); }}
                  className={`w-full p-5 rounded-2xl text-left transition-all duration-300 border-2 relative overflow-hidden group flex items-start gap-4 cursor-pointer ${
                    !protectionSelected 
                      ? 'border-zinc-950 bg-zinc-50/50' 
                      : 'border-zinc-200 bg-white hover:border-zinc-400'
                  }`}
                >
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    !protectionSelected ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-300 bg-white'
                  }`}>
                    {!protectionSelected && <Check className="w-3.5 h-3.5" />}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <h4 className="font-bold text-sm text-zinc-900">Standard Coverage</h4>
                      <span className="text-xs font-bold text-zinc-400">No extra charge</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Standard cancellation policy applies. No coverage for dynamic transport delays, damage liability waiver, or extreme weather refunds.
                    </p>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => { uiAudio.playClick(); setActiveStep(3); }}
                className="w-full py-4 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 text-sm mt-6 active:scale-95 cursor-pointer"
              >
                Continue to Secure Payment
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeStep === 3 && (
            /* Step 3: Secure Payment */
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-zinc-950 tracking-tight">Secure Payment</h2>
                <button 
                  onClick={() => setActiveStep(2)}
                  className="text-xs font-bold text-zinc-400 hover:text-zinc-950 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              </div>

              {/* Gateway switcher */}
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button 
                   onClick={() => setGatewayTab('razorpay')}
                   className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${gatewayTab === 'razorpay' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/40' : 'text-zinc-500 hover:text-zinc-950'}`}
                >
                   <Smartphone className="w-3.5 h-3.5" />
                   Razorpay (India Gateway)
                </button>
                <button 
                   onClick={() => setGatewayTab('stripe')}
                   className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${gatewayTab === 'stripe' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/40' : 'text-zinc-500 hover:text-zinc-950'}`}
                >
                   <CreditCard className="w-3.5 h-3.5" />
                   Stripe (International Cards)
                </button>
              </div>

              {gatewayTab === 'stripe' ? (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                     Accepting Visa, Mastercard, American Express, and global digital cards through Stripe secure portal.
                  </p>
                  <Elements stripe={stripePromise} options={options}>
                      <CheckoutForm amount={finalTotal} onPaymentSuccess={() => {
                        onSuccess({
                          moveInDate,
                          configuration: isExperience ? `${numTickets} Tickets` : selectedConfig,
                          name: guestName,
                          phone: guestPhone,
                          totalRent: finalTotal,
                          roomIds: isExperience ? [] : (listing?.rooms?.filter(r => r.name === selectedConfig).map(r => r.id) || [])
                        });
                      }} onCancel={() => setActiveStep(2)} />
                  </Elements>
                </div>
              ) : (
                /* Razorpay Gateways */
                <div className="space-y-6 animate-fade-in">
                  <div className="flex gap-4 border-b border-zinc-150 pb-3">
                     <button 
                        onClick={() => { setRazorpayMethod('upi'); uiAudio.playClick(); }}
                        className={`text-xs font-bold pb-2 border-b-2 transition-all ${razorpayMethod === 'upi' ? 'border-[#0284C7] text-zinc-950 font-black' : 'border-transparent text-zinc-400 hover:text-zinc-950'}`}
                     >
                        UPI / QR / Netbanking
                     </button>
                     <button 
                        onClick={() => { setRazorpayMethod('emi'); uiAudio.playClick(); }}
                        className={`text-xs font-bold pb-2 border-b-2 transition-all flex items-center gap-1.5 ${razorpayMethod === 'emi' ? 'border-[#0284C7] text-zinc-950 font-black' : 'border-transparent text-zinc-400 hover:text-zinc-950'}`}
                     >
                        <Percent className="w-3.5 h-3.5 text-zinc-400" />
                        Easy EMI Options
                     </button>
                  </div>

                  {razorpayMethod === 'upi' ? (
                    <div className="space-y-5 animate-fade-in">
                      {/* Sub-tab switcher for UPI Type */}
                      <div className="flex bg-zinc-50 border border-zinc-200/60 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => { setUpiMode('vpa'); uiAudio.playClick(); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${upiMode === 'vpa' ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200/40' : 'text-zinc-400 hover:text-zinc-950'}`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          UPI ID / VPA
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUpiMode('qr'); uiAudio.playClick(); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${upiMode === 'qr' ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200/40' : 'text-zinc-400 hover:text-zinc-950'}`}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Scan QR Code
                        </button>
                      </div>

                      {upiMode === 'vpa' ? (
                        <div className="space-y-4 animate-fade-in">
                          <div className="space-y-1.5">
                             <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Pay via UPI ID (VPA)</label>
                             <input 
                                type="text"
                                placeholder="e.g. name@okhdfcbank"
                                value={upiId}
                                onChange={e => setUpiId(e.target.value)}
                                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all font-mono text-xs text-zinc-850 font-bold"
                             />
                          </div>

                          <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/50">
                             <div className="w-10 h-10 bg-white rounded-xl border border-zinc-200 flex items-center justify-center font-extrabold text-[#0284C7] text-xs shadow-sm">
                                UPI
                             </div>
                             <div>
                                <p className="text-xs font-bold text-zinc-950">Direct App Redirect</p>
                                <p className="text-[10px] text-zinc-400">Google Pay, PhonePe, Paytm, BHIM</p>
                             </div>
                          </div>

                          <button 
                             type="button"
                             onClick={handleSimulatedPayment}
                             className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center justify-center gap-2 text-sm mt-4"
                          >
                             Pay {formatPrice(finalTotal, 'INR')} Securely
                             <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 animate-fade-in flex flex-col items-center">
                          <p className="text-xs text-zinc-500 text-center max-w-xs leading-relaxed">
                            Scan this dynamic secure QR code using any UPI App (GPay, PhonePe, Paytm, BHIM) to complete checkout.
                          </p>

                          {/* Beautiful Interactive QR Code with Simulated Scanning laser line */}
                          <div className="relative p-4 bg-white border border-zinc-200 rounded-3xl shadow-sm flex flex-col items-center justify-center mt-2 group overflow-hidden">
                            {/* Scanning Laser Line */}
                            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#0284C7] to-transparent animate-pulse" style={{
                              animation: 'scan 2.5s ease-in-out infinite',
                              top: '10%'
                            }} />

                            {/* Custom CSS for scan laser animation */}
                            <style>{`
                              @keyframes scan {
                                0% { top: 10%; }
                                50% { top: 90%; }
                                100% { top: 10%; }
                              }
                            `}</style>

                            {/* Generous visual QR Mock using beautiful vectors */}
                            <div className="w-44 h-44 bg-zinc-150 rounded-2xl flex items-center justify-center relative border border-zinc-200/60 p-2">
                              {/* Custom high fidelity QR representation */}
                              <div className="w-full h-full relative opacity-90 group-hover:scale-102 transition-transform duration-500">
                                {/* Corner anchors */}
                                <div className="absolute top-0 left-0 w-8 h-8 border-4 border-zinc-950 rounded-xs" />
                                <div className="absolute top-0 right-0 w-8 h-8 border-4 border-zinc-950 rounded-xs" />
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-4 border-zinc-950 rounded-xs" />
                                {/* Center branding circle */}
                                <div className="absolute inset-12 bg-white rounded-xl border border-zinc-200 shadow-sm flex items-center justify-center">
                                  <span className="text-[10px] font-black text-[#0284C7] tracking-tighter">UPI</span>
                                </div>
                                {/* Scattered QR pixels */}
                                <div className="absolute top-2.5 left-10 w-4 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute top-10 left-2.5 w-4 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-10 left-2.5 w-4 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute top-10 right-2.5 w-4 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-2.5 right-10 w-4 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-10 right-2.5 w-4 h-4 bg-zinc-950 rounded-xs" />
                                
                                <div className="absolute top-16 left-3 w-4 h-1.5 bg-zinc-950 rounded-xs" />
                                <div className="absolute top-3 left-16 w-1.5 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-16 right-3 w-4 h-1.5 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-3 right-16 w-1.5 h-4 bg-zinc-950 rounded-xs" />
                                <div className="absolute top-16 right-10 w-3 h-3 bg-zinc-950 rounded-xs" />
                                <div className="absolute bottom-16 left-10 w-3 h-3 bg-zinc-950 rounded-xs" />
                              </div>
                            </div>

                            {/* Countdown Timer Badge */}
                            <div className="mt-4 flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1 rounded-full border border-rose-100 text-xs font-bold">
                              <Calendar className="w-3.5 h-3.5 animate-pulse text-rose-600" />
                              <span>QR Expires in {formatTime(qrTimeLeft)}</span>
                            </div>
                          </div>

                          <button 
                             type="button"
                             onClick={handleSimulatedPayment}
                             className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm mt-4"
                          >
                             <CheckCircle2 className="w-4 h-4" />
                             I have scanned & paid successfully
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Interactive EMI simulator */
                    <div className="space-y-4 animate-fade-in">
                      <div className="space-y-1.5">
                         <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Select Bank</label>
                         <div className="grid grid-cols-2 gap-2">
                            {EMI_BANKS.map((bank) => (
                               <button 
                                  key={bank.id}
                                  onClick={() => { setSelectedBank(bank); uiAudio.playClick(); }}
                                  className={`flex items-center gap-2 p-2.5 border rounded-xl text-left transition-all ${selectedBank.id === bank.id ? 'border-[#0284C7] bg-[#0284C7]/5 ring-1 ring-[#0284C7]' : 'border-zinc-200 hover:border-zinc-400 bg-white'}`}
                               >
                                  <span className="w-6 h-6 bg-zinc-100 rounded-md flex items-center justify-center text-[8px] font-extrabold text-zinc-700 border border-zinc-200 uppercase">{bank.logo}</span>
                                  <div className="leading-none">
                                     <p className="text-[10px] font-extrabold text-zinc-950 truncate max-w-[80px]">{bank.name}</p>
                                     <p className="text-[8px] text-zinc-400 mt-0.5">{bank.rate}% p.a.</p>
                                  </div>
                               </button>
                            ))}
                         </div>
                      </div>

                      <div className="space-y-1.5">
                         <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Select Tenure</label>
                         <div className="flex gap-2">
                            {EMI_TENURES.map((months) => {
                               const mockEMI = calculateEMI(finalTotal, selectedBank.rate, months);
                               return (
                                  <button 
                                     key={months}
                                     onClick={() => { setSelectedTenure(months); uiAudio.playClick(); }}
                                     className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-xl transition-all ${selectedTenure === months ? 'border-[#0284C7] bg-[#0284C7]/5 ring-1 ring-[#0284C7]' : 'border-zinc-200 hover:border-zinc-400 bg-white'}`}
                                  >
                                     <span className="text-xs font-extrabold text-zinc-950">{months} Mo</span>
                                     <span className="text-[10px] text-[#0284C7] font-semibold mt-1">{formatPrice(mockEMI.monthly, 'INR')}/mo</span>
                                  </button>
                               );
                            })}
                         </div>
                      </div>

                      <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/50 space-y-3.5">
                         <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
                            <span className="flex items-center gap-1"><Calculator className="w-3.5 h-3.5 text-[#0284C7]" /> Monthly EMI</span>
                            <span className="font-extrabold text-zinc-950 text-sm font-mono">{formatPrice(emiDetails.monthly, 'INR')} <span className="text-[10px] font-normal text-zinc-400">/ mo</span></span>
                         </div>
                         <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
                            <span className="flex items-center gap-1"><Percent className="w-3.5 h-3.5 text-zinc-400" /> Bank Interest ({selectedBank.rate}% p.a.)</span>
                            <span className="font-semibold text-zinc-950 font-mono">{formatPrice(emiDetails.interest, 'INR')}</span>
                         </div>
                         <div className="border-t border-zinc-200/60 pt-3 flex items-center justify-between text-xs font-bold text-zinc-950">
                            <span>Total Repayment Cost</span>
                            <span className="font-extrabold font-mono text-[#0284C7]">{formatPrice(emiDetails.total, 'INR')}</span>
                         </div>
                      </div>

                      <button 
                         onClick={handleSimulatedPayment}
                         className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center justify-center gap-2 text-sm mt-4"
                      >
                         Pay {formatPrice(emiDetails.monthly, 'INR')}/mo EMI Securely
                         <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Trust Seal Footer */}
      <footer className="w-full bg-white border-t border-zinc-150 py-6 text-center text-[10px] text-zinc-400 font-medium">
         Authorized and protected by SSL secure protocols. Encho Space Secure booking. All transactions are fully encrypted.
      </footer>
    </div>
  );
};
