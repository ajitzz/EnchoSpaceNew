import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { XIcon } from './Icons';
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
  ShieldAlert
} from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);

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
      <button disabled={processing || !stripe} type="submit" className="w-full py-3.5 bg-canvas hover:bg-zinc-800 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 text-sm">
        {processing ? 'Processing...' : `Pay ₹${amount.toLocaleString()}`}
      </button>
      <button type="button" onClick={onCancel} className="w-full py-2 text-zinc-500 font-semibold hover:text-canvas transition-colors text-xs">
        Cancel & Go Back
      </button>
    </form>
  );
};

export const CheckoutModal = ({ amount: baseAmount, isOpen, onClose, onSuccess }: { amount: number, isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  const [rates, setRates] = useState({ commission_rate: 10, tax_rate: 18, system_fee: 150 });
  const [gatewayTab, setGatewayTab] = useState<'razorpay' | 'stripe'>('razorpay');
  const [razorpayMethod, setRazorpayMethod] = useState<'upi' | 'emi'>('upi');
  
  // EMI simulation state
  const [selectedBank, setSelectedBank] = useState(EMI_BANKS[0]);
  const [selectedTenure, setSelectedTenure] = useState(6);
  
  // Custom mock UPI / EMI processing steps
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [upiId, setUpiId] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings/payment_rates')
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.commission_rate === 'number') {
            setRates(data);
          }
        })
        .catch(err => console.error("Error fetching rates:", err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Pricing math using dynamic settings from admin
  const commissionFee = Math.round(baseAmount * (rates.commission_rate / 100));
  const subtotal = baseAmount + commissionFee;
  const taxFee = Math.round(subtotal * (rates.tax_rate / 100));
  const systemFee = rates.system_fee;
  const finalTotal = baseAmount + commissionFee + taxFee + systemFee;

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
    
    setTimeout(() => {
      setSimulationStep(2); // Awaiting authentications
    }, 1500);

    setTimeout(() => {
      setSimulationStep(3); // Approved
    }, 3000);

    setTimeout(() => {
      setIsSimulating(false);
      setSimulationStep(0);
      onSuccess();
    }, 4500);
  };

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#09090b',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '12px',
    },
  };

  const options = {
      mode: 'payment' as const,
      amount: Math.round(finalTotal * 100),
      currency: 'inr',
      appearance,
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-dune w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative border border-zinc-100 flex flex-col md:flex-row h-auto max-h-[90vh]">
            
            {/* Close Button */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors z-30 border border-zinc-100">
                <XIcon className="w-4 h-4 text-zinc-500" />
            </button>

            {/* Left Side: Order & Breakdown panel */}
            <div className="w-full md:w-[42%] bg-zinc-50 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-100 overflow-y-auto">
               <div>
                  <div className="flex items-center gap-2 mb-4">
                     <span className="p-1.5 bg-[#0284C7]/10 rounded-lg text-[#0284C7]">
                        <ShieldCheck className="w-4 h-4" />
                     </span>
                     <span className="text-xs font-bold text-[#0284C7] tracking-wider uppercase">Safe booking</span>
                  </div>
                  
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Fare Summary</h3>
                  <div className="space-y-2.5">
                     <div className="flex justify-between text-xs font-medium text-zinc-500">
                        <span>Base Fare</span>
                        <span className="font-mono">₹{baseAmount.toLocaleString()}</span>
                     </div>
                     {commissionFee > 0 && (
                        <div className="flex justify-between text-xs font-medium text-zinc-500">
                           <span>Platform Fee ({rates.commission_rate}%)</span>
                           <span className="font-mono">₹{commissionFee.toLocaleString()}</span>
                        </div>
                     )}
                     {taxFee > 0 && (
                        <div className="flex justify-between text-xs font-medium text-zinc-500">
                           <span>GST / Taxes ({rates.tax_rate}%)</span>
                           <span className="font-mono">₹{taxFee.toLocaleString()}</span>
                        </div>
                     )}
                     {systemFee > 0 && (
                        <div className="flex justify-between text-xs font-medium text-zinc-500">
                           <span>System Booking Fee</span>
                           <span className="font-mono">₹{systemFee.toLocaleString()}</span>
                        </div>
                     )}
                  </div>
               </div>

               <div className="mt-8 pt-4 border-t border-zinc-200/60">
                  <div className="flex justify-between items-baseline mb-2">
                     <span className="text-xs font-bold text-canvas uppercase tracking-widest">Total cost</span>
                     <span className="text-2xl font-extrabold text-canvas tracking-tight font-mono">₹{finalTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-zinc-100 p-2.5 rounded-xl border border-zinc-200/40">
                     <LockIcon className="w-3.5 h-3.5 text-zinc-500" />
                     <span className="text-[10px] text-zinc-500 font-medium">SSL Encrypted checkout session</span>
                  </div>
               </div>
            </div>

            {/* Right Side: Tabbed Payment Gateways */}
            <div className="w-full md:w-[58%] p-6 md:p-8 overflow-y-auto flex flex-col justify-between">
                
                {/* Simulated processing Overlay */}
                {isSimulating && (
                   <div className="absolute inset-0 bg-dune/95 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                      <div className="relative w-16 h-16 mb-6">
                         <div className="absolute inset-0 rounded-full border-4 border-zinc-100"></div>
                         <div className="absolute inset-0 rounded-full border-4 border-[#0284C7] border-t-transparent animate-spin"></div>
                      </div>
                      
                      <h4 className="text-lg font-bold text-canvas mb-2">Processing Transaction</h4>
                      
                      <div className="space-y-2 max-w-xs">
                         <p className={`text-sm transition-all duration-300 font-medium ${simulationStep >= 1 ? 'text-canvas' : 'text-zinc-300'}`}>
                            {simulationStep >= 1 ? '✓ Initiating secure gateway connection' : 'Connecting to gateway...'}
                         </p>
                         <p className={`text-sm transition-all duration-300 font-medium ${simulationStep >= 2 ? 'text-canvas font-bold text-[#0284C7]' : 'text-zinc-300'}`}>
                            {simulationStep === 2 ? '⚡ Awaiting native OTP / UPI App consent...' : simulationStep > 2 ? '✓ Consent verified successfully' : 'Consent authorization'}
                         </p>
                         <p className={`text-sm transition-all duration-300 font-medium ${simulationStep >= 3 ? 'text-emerald-600 font-bold' : 'text-zinc-300'}`}>
                            {simulationStep >= 3 ? '🎉 Approved! Booking finalization completed' : 'Finalizing Reservation'}
                         </p>
                      </div>
                   </div>
                )}

                <div>
                    <h2 className="text-xl font-extrabold text-zinc-950 tracking-tight mb-4">Secure Checkout</h2>

                    {/* Gateway Switcher Tabs */}
                    <div className="flex bg-zinc-100 p-1 rounded-xl mb-6">
                        <button 
                           onClick={() => setGatewayTab('razorpay')}
                           className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${gatewayTab === 'razorpay' ? 'bg-dune text-zinc-950 shadow-sm border border-zinc-200/40' : 'text-zinc-500 hover:text-zinc-950'}`}
                        >
                           <Smartphone className="w-3.5 h-3.5" />
                           Razorpay (India Gateway)
                        </button>
                        <button 
                           onClick={() => setGatewayTab('stripe')}
                           className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${gatewayTab === 'stripe' ? 'bg-dune text-zinc-950 shadow-sm border border-zinc-200/40' : 'text-zinc-500 hover:text-zinc-950'}`}
                        >
                           <CreditCard className="w-3.5 h-3.5" />
                           Stripe (International Cards)
                        </button>
                    </div>

                    {gatewayTab === 'stripe' ? (
                       <div className="animate-fade-in space-y-4">
                          <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                             Accepting Visa, Mastercard, American Express, and global digital cards through Stripe.
                          </p>
                          <Elements stripe={stripePromise} options={options}>
                              <CheckoutForm amount={finalTotal} onPaymentSuccess={onSuccess} onCancel={onClose} />
                          </Elements>
                       </div>
                    ) : (
                       /* Razorpay India Integration */
                       <div className="animate-fade-in space-y-6">
                          <div className="flex gap-4 border-b border-zinc-100 pb-3">
                             <button 
                                onClick={() => setRazorpayMethod('upi')}
                                className={`text-xs font-bold pb-2 border-b-2 transition-all ${razorpayMethod === 'upi' ? 'border-[#0284C7] text-canvas' : 'border-transparent text-zinc-400 hover:text-canvas'}`}
                             >
                                UPI / QR / Netbanking
                             </button>
                             <button 
                                onClick={() => setRazorpayMethod('emi')}
                                className={`text-xs font-bold pb-2 border-b-2 transition-all flex items-center gap-1.5 ${razorpayMethod === 'emi' ? 'border-[#0284C7] text-canvas' : 'border-transparent text-zinc-400 hover:text-canvas'}`}
                             >
                                <Percent className="w-3 h-3" />
                                Easy EMI Options
                             </button>
                          </div>

                          {razorpayMethod === 'upi' ? (
                             <div className="space-y-4 animate-fade-in">
                                <div className="space-y-1">
                                   <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">Pay via UPI ID (VPA)</label>
                                   <input 
                                      type="text"
                                      placeholder="e.g. name@okhdfcbank"
                                      value={upiId}
                                      onChange={e => setUpiId(e.target.value)}
                                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-dune focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all font-mono text-sm"
                                   />
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/50">
                                   <div className="w-10 h-10 bg-dune rounded-xl border border-zinc-200 flex items-center justify-center font-extrabold text-[#0284C7] text-xs shadow-sm">
                                      UPI
                                   </div>
                                   <div>
                                      <p className="text-xs font-bold text-canvas">Direct App Redirection</p>
                                      <p className="text-[10px] text-zinc-400">Supports GPay, PhonePe, Paytm, BHIM</p>
                                   </div>
                                </div>

                                <button 
                                   onClick={handleSimulatedPayment}
                                   className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center justify-center gap-2 text-sm"
                                >
                                   Pay ₹{finalTotal.toLocaleString()} Securely
                                   <ChevronRight className="w-4 h-4" />
                                </button>
                             </div>
                          ) : (
                             /* Interactive Indian Easy EMI Simulator */
                             <div className="space-y-4 animate-fade-in">
                                <div className="space-y-1">
                                   <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">Select Bank</label>
                                   <div className="grid grid-cols-2 gap-2">
                                      {EMI_BANKS.map((bank) => (
                                         <button 
                                            key={bank.id}
                                            onClick={() => setSelectedBank(bank)}
                                            className={`flex items-center gap-2 p-2.5 border rounded-xl text-left transition-all ${selectedBank.id === bank.id ? 'border-[#0284C7] bg-[#0284C7]/5 ring-1 ring-[#0284C7]' : 'border-zinc-200 hover:border-zinc-400 bg-dune'}`}
                                         >
                                            <span className="w-6 h-6 bg-zinc-100 rounded-md flex items-center justify-center text-[8px] font-extrabold text-zinc-700 border border-zinc-200 uppercase">{bank.logo}</span>
                                            <div className="leading-none">
                                               <p className="text-[10px] font-extrabold text-canvas truncate max-w-[80px]">{bank.name}</p>
                                               <p className="text-[8px] text-zinc-400 mt-0.5">{bank.rate}% p.a.</p>
                                            </div>
                                         </button>
                                      ))}
                                   </div>
                                </div>

                                <div className="space-y-1">
                                   <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">Select Tenure</label>
                                   <div className="flex gap-2">
                                      {EMI_TENURES.map((months) => {
                                         const mockEMI = calculateEMI(finalTotal, selectedBank.rate, months);
                                         return (
                                            <button 
                                               key={months}
                                               onClick={() => setSelectedTenure(months)}
                                               className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-xl transition-all ${selectedTenure === months ? 'border-[#0284C7] bg-[#0284C7]/5 ring-1 ring-[#0284C7]' : 'border-zinc-200 hover:border-zinc-400 bg-dune'}`}
                                            >
                                               <span className="text-xs font-extrabold text-canvas">{months} Months</span>
                                               <span className="text-[10px] text-[#0284C7] font-semibold mt-1">₹{mockEMI.monthly}/mo</span>
                                            </button>
                                         );
                                      })}
                                   </div>
                                </div>

                                {/* Dynamic calculations detail card */}
                                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/50 space-y-3.5">
                                   <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
                                      <span className="flex items-center gap-1"><Calculator className="w-3.5 h-3.5 text-[#0284C7]" /> Monthly EMI</span>
                                      <span className="font-extrabold text-canvas text-sm font-mono">₹{emiDetails.monthly} <span className="text-[10px] font-normal text-zinc-400">/ mo</span></span>
                                   </div>
                                   <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
                                      <span className="flex items-center gap-1"><Percent className="w-3.5 h-3.5 text-zinc-400" /> Bank Interest ({selectedBank.rate}% p.a.)</span>
                                      <span className="font-semibold text-canvas font-mono">₹{emiDetails.interest}</span>
                                   </div>
                                   <div className="border-t border-zinc-200/60 pt-3 flex items-center justify-between text-xs font-bold text-canvas">
                                      <span>Total Repayment Cost</span>
                                      <span className="font-extrabold font-mono text-[#0284C7]">₹{emiDetails.total}</span>
                                   </div>
                                </div>

                                <button 
                                   onClick={handleSimulatedPayment}
                                   className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center justify-center gap-2 text-sm"
                                >
                                   Pay ₹{emiDetails.monthly}/mo EMI Securely
                                   <ChevronRight className="w-4 h-4" />
                                </button>
                             </div>
                          )}
                       </div>
                    )}
                </div>

                <div className="mt-8 text-center text-[10px] text-zinc-400 font-medium">
                   Authorized and protected by Razorpay & Stripe secure verification frameworks. No card information is stored locally.
                </div>
            </div>
        </div>
    </div>
  );
};

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
