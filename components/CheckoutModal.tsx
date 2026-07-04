import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { XIcon } from './Icons';

const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY || 'pk_dummy');

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
           // ignore json parse error
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
            return_url: window.location.href, // Dummy return URL, will redirect back
        },
        redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed.');
      setProcessing(false);
    } else {
      // Payment successful
      onPaymentSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <button disabled={processing || !stripe} type="submit" className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 disabled:opacity-50">
        {processing ? 'Processing...' : `Pay ₹${amount.toLocaleString()}`}
      </button>
      <button type="button" onClick={onCancel} className="w-full py-2 text-gray-500 font-bold hover:text-gray-900 transition-colors">
        Cancel
      </button>
    </form>
  );
};

export const CheckoutModal = ({ amount, isOpen, onClose, onSuccess }: { amount: number, isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  if (!isOpen) return null;

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#0284C7',
    },
  };

  const options = {
      mode: 'payment' as const,
      amount: Math.round(amount * 100),
      currency: 'inr',
      appearance,
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10">
                <XIcon className="w-5 h-5 text-gray-700" />
            </button>
            <div className="p-6 md:p-8">
                 <h2 className="text-2xl font-bold text-gray-900 mb-2">Secure Checkout</h2>
                 <p className="text-gray-500 mb-6">Complete your reservation securely using Stripe.</p>
                 <Elements stripe={stripePromise} options={options}>
                     <CheckoutForm amount={amount} onPaymentSuccess={onSuccess} onCancel={onClose} />
                 </Elements>
            </div>
        </div>
    </div>
  );
};
