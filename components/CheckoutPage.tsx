import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, Loader2, CalendarDays, ShieldCheck } from 'lucide-react';
import type { Listing, Experience } from '../types';
import type { StayQuote } from '../lib/stayQuote';
import { loadRazorpayScript } from '../lib/razorpay';
import { useAuth } from './AuthContext';

interface CheckoutPageProps {
  listing?: Listing; experience?: Experience; numTickets?: number;
  initialData: {
    roomId?: string; roomIds?: string[]; roomTier?: string; roomTierName?: string; roomTierIcon?: string; roomTierSpecs?: string;
    nightlyRate?: number; moveInDate: string; checkOutDate?: string; configuration: string;
    name: string; phone: string; totalRent?: number; baseRent?: number; fees?: number; taxes?: number;
    guests?: number; adultsCount?: number; childrenCount?: number; infantsCount?: number; currency?: string;
  };
  onSuccess: (data: { bookingId: string; status: string; moveInDate: string; checkOutDate: string; configuration: string; name: string; phone: string; totalRent: number; roomIds: string[] }) => void;
  onCancel: () => void;
}
const money = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
async function request(path: string, body: unknown, signal?: AbortSignal, key?: string) {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Sign in before continuing to payment.');
  const res = await fetch('/api/stays/' + path, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(key ? { 'X-Idempotency-Key': key } : {}) },
    body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Checkout is temporarily unavailable.');
  return data;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ listing, experience, initialData, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const rooms = listing?.rooms || [];
  const [roomId, setRoomId] = useState(() => initialData.roomId || initialData.roomIds?.[0] || rooms.find(r => r.id === initialData.roomTier || r.type === initialData.roomTier)?.id || '');
  const [checkIn, setCheckIn] = useState(initialData.moveInDate);
  const [checkOut, setCheckOut] = useState(initialData.checkOutDate || '');
  const [guests, setGuests] = useState(initialData.guests || 1);
  const [name, setName] = useState(initialData.name || user?.name || '');
  const [phone, setPhone] = useState(initialData.phone || user?.phone || '');
  const [quote, setQuote] = useState<{ quote: StayQuote; quoteHash: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const pendingVerification = useRef<any>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const selection = { listingId: String(listing?.originalId || listing?.id || ''), roomId, moveInDate: checkIn, checkOutDate: checkOut, guests };

  useEffect(() => {
    setQuote(null);
    setLoading(false);
    if (experience || !user || !roomId || !checkIn || !checkOut) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    request('quote', { listingId: String(listing?.originalId || listing?.id), roomId, moveInDate: checkIn, checkOutDate: checkOut, guests }, controller.signal)
      .then(setQuote).catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [listing?.id, listing?.originalId, roomId, checkIn, checkOut, guests, user?.id, experience, retry]);

  function finish(data: any) {
    const b = data.booking;
    if (!data.success || !b?.id || b.status !== 'confirmed') throw new Error('Payment is not yet linked to a confirmed booking. Do not pay again.');
    pendingVerification.current = null;
    setVerificationRequired(false);
    onSuccess({ bookingId: String(b.id), status: b.status, moveInDate: b.move_in_date, checkOutDate: b.check_out_date,
      configuration: b.configuration, name: b.name, phone: b.phone, totalRent: Number(b.total_rent), roomIds: [String(b.room_id)] });
  }
  const release = () => { inFlight.current = false; setBusy(false); };
  async function verify(payload: any) {
    pendingVerification.current = payload;
    setVerificationRequired(true);
    try { finish(await request('verify', payload)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Verification failed. Do not pay again.'); }
    finally { release(); }
  }
  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    if (pendingVerification.current) { await verify(pendingVerification.current); return; }
    try {
      if (!quote || !name.trim() || !phone.trim()) throw new Error('Review your quote and enter your real name and phone number.');
      if (!await loadRazorpayScript() || !(window as any).Razorpay) throw new Error('Payment checkout could not load. Check your connection and retry.');
      const payload = { ...selection, quoteHash: quote.quoteHash, name: name.trim(), phone: phone.trim() };
      const fingerprint = JSON.stringify(payload);
      // Persist an attempt key, not PII or payment credentials, across reloads.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(user?.id) + fingerprint));
      const storageKey = 'stay-attempt:' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (attempt.current?.fingerprint !== fingerprint) {
        const key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
        attempt.current = { fingerprint, key };
      }
      const order = await request('orders', payload, undefined, attempt.current!.key);
      if (order.state === 'confirmed') throw new Error('This attempt already has a confirmed booking. Open your reservations; do not pay again.');
      if (!order.order_id || order.amount !== quote.quote.totalMinor || order.currency !== quote.quote.currency) throw new Error('The payment order differs from your quote. Do not continue.');
      const gateway = new (window as any).Razorpay({
        key: order.keyId, order_id: order.order_id, amount: order.amount, currency: order.currency,
        name: 'Encho Stays', description: quote.quote.configuration,
        prefill: { name: name.trim(), contact: phone.trim(), ...(user?.email ? { email: user.email } : {}) },
        theme: { color: '#102d2a' },
        handler: (response: any) => verify({ checkoutId: order.checkoutId, ...response }),
        modal: { ondismiss: release }
      });
      gateway.on('payment.failed', () => { setError('Payment was not completed. If debited, contact support before trying again.'); release(); });
      gateway.open();
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment could not start.'); release(); }
  }
  return <main className="min-h-screen bg-stone-50 text-zinc-900 px-4 py-8 md:py-14">
    <div className="max-w-5xl mx-auto">
      <button onClick={onCancel} disabled={busy} className="flex items-center gap-2 min-h-11 text-sm font-semibold mb-8"><ArrowLeft size={18} /> Back to property</button>
      <p className="uppercase tracking-[0.2em] text-xs text-emerald-800 font-bold">Encho Stays · Checkout</p>
      <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-3 mb-3">Make room for your next stay.</h1>
      <p className="text-zinc-600 mb-10">Review the room, dates and complete price before opening payment.</p>
      {experience ? <p role="status">Experience checkout is not part of the current stays release.</p> : !user ? <p role="alert">Please return and sign in to book this stay.</p> :
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-8">
        <fieldset disabled={busy || verificationRequired} className="bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 space-y-6 min-w-0">
          <legend className="sr-only">Stay and guest details</legend>
          <h2 className="text-xl font-semibold">{listing?.title}</h2>
          <label className="block text-sm font-medium">Your room<select className="block w-full border rounded-xl p-3 mt-2" value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">Select a host-listed room</option>{rooms.map(r => <option key={r.id} value={r.id} disabled={r.isAvailable === false || r.inventory_count === 0}>{r.name}</option>)}
          </select></label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium">Check-in<input aria-label="Check-in" type="date" className="block w-full border rounded-xl p-3 mt-2" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label>
            <label className="text-sm font-medium">Checkout<input aria-label="Checkout" type="date" className="block w-full border rounded-xl p-3 mt-2" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label>
          </div>
          <label className="block text-sm font-medium">Guests<input type="number" min="1" className="block w-full border rounded-xl p-3 mt-2" value={guests} onChange={e => setGuests(Number(e.target.value))} /></label>
          <label className="block text-sm font-medium">Full name<input autoComplete="name" className="block w-full border rounded-xl p-3 mt-2" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block text-sm font-medium">Phone number<input type="tel" autoComplete="tel" className="block w-full border rounded-xl p-3 mt-2" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        </fieldset>
        <section aria-label="Price summary" className="bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 self-start space-y-5">
          <div className="flex gap-3 items-center"><CalendarDays className="text-emerald-800" /><h2 className="text-xl font-semibold">Your stay, clearly priced</h2></div>
          {loading && <p role="status" className="flex gap-2"><Loader2 className="animate-spin" /> Checking price and availability…</p>}
          {quote && <dl className="space-y-4 text-sm">
            {[['Room · ' + quote.quote.nights + ' nights', quote.quote.baseMinor], ['Service fee', quote.quote.feeMinor], ['Configured taxes', quote.quote.taxMinor], ['Booking fee', quote.quote.systemFeeMinor], ['Total charged in INR', quote.quote.totalMinor]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-semibold tabular-nums">{money(Number(value))}</dd></div>)}
          </dl>}
          <p className="text-xs text-zinc-500">The server checks availability again before creating payment. No booking is confirmed until payment is captured and your reservation is saved.</p>
          {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</div>}
          <button onClick={() => setRetry(r => r + 1)} disabled={busy || verificationRequired} className="min-h-11 text-sm underline">Refresh price and availability</button>
          <button onClick={pay} disabled={busy || (!verificationRequired && (!quote || loading))} className="flex w-full gap-2 justify-center items-center min-h-12 rounded-xl bg-emerald-950 text-white font-semibold px-4 py-3 disabled:opacity-50">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}{busy ? 'Processing…' : verificationRequired ? 'Retry payment verification' : 'Continue to payment'}
          </button>
          <p className="flex gap-2 text-xs text-zinc-500"><ShieldCheck size={16} className="shrink-0" /> Payment methods are provided by Razorpay. Encho does not collect your card details.</p>
        </section>
      </div>}
    </div>
  </main>;
};
export default CheckoutPage;
