export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export interface RazorpayVerificationPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  transaction_type?: string;
  transaction_id?: string;
  campaign_id?: number;
  booking_id?: string | number;
  experience_booking_id?: string | number;
}

export const verifyRazorpayPayment = async (payload: RazorpayVerificationPayload) => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/payments/razorpay/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  return await res.json();
};
