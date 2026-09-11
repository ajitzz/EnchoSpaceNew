import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { StayRecoveryDetails } from './StayRecoveryDetails';
type Order = { id: string; listing_id: number; room_id: string; check_in: string; check_out: string; total_minor: string; currency: string; state: string; reason: string; provider_order_id?: string; payment_id?: string };
const reasons: Record<string, string> = { order_creation_unresolved: 'Order creation unresolved', provider_outcome_unknown: 'Provider outcome unknown', expired_checkout_requires_payment_check: 'Expired checkout · payment check required' };
function amount(order: Order) {
  if (!/^\d+$/.test(order.total_minor)) return 'Amount requires review';
  const minor = BigInt(order.total_minor); return `${order.currency} ${(minor / 100n).toLocaleString('en-IN')}.${String(minor % 100n).padStart(2, '0')}`;
}
function Queue() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]), [next, setNext] = useState<string | null>(null);
  const [request, setRequest] = useState({ before: null as string | null, revision: 0 });
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError('');
    if (!request.before) { setOrders([]); setNext(null); }
    if (!token) { setError('Sign in as Admin to inspect recovery.'); setBusy(false); return () => controller.abort(); }
    void fetch(`/api/stay-recovery${request.before ? `?before=${encodeURIComponent(request.before)}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => {
        const body = await response.json(); if (!response.ok) throw new Error(body.code === 'RECOVERY_DISABLED' ? 'Recovery rollout is not enabled yet.' : 'Recovery queue unavailable. Retry or check Admin access.');
        if (!Array.isArray(body.orders) || body.readOnly !== true) throw new Error('Recovery response requires review.');
        if (controller.signal.aborted) return;
        setOrders(old => [...new Map([...(request.before ? old : []), ...body.orders].map((order: Order) => [order.id, order])).values()]); setNext(body.nextCursor ?? null);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Recovery unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [token, request]);
  return <section aria-label="Checkout recovery" aria-busy={busy} className="space-y-4">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Read-only triage. An expired checkout is not proof of failed payment. Do not charge again, release unresolved holds or promise a refund without provider reconciliation.</p>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {busy && <p role="status">Loading checkout recovery…</p>}
    {!busy && !error && !orders.length && <p>No checkout attempts currently require triage.</p>}
    {orders.map(order => <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 break-words">
      <h2 className="font-semibold">{reasons[order.reason] || 'Checkout requires review'}</h2>
      <p className="text-sm">Reference: {order.id}</p><p>Property {order.listing_id} · Room {order.room_id}</p>
      <p>{order.check_in} → {order.check_out} · {amount(order)}</p>
      <p className="text-sm">Stored state: {order.state}. Provider order: {order.provider_order_id || 'Not recorded'}. Payment: {order.payment_id || 'Not recorded'}.</p>
      <StayRecoveryDetails checkoutId={order.id} />
    </article>)}
    <div className="flex flex-wrap gap-3">
      <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ before: null, revision: old.revision + 1 }))}>Refresh recovery queue</button>
      {error && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ ...old, revision: old.revision + 1 }))}>Retry recovery queue</button>}
      {next && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ before: next, revision: old.revision + 1 }))}>Load older checkout attempts</button>}
    </div>
  </section>;
}
export function StayRecoveryQueue() { const { token } = useAuth(); return <Queue key={token} />; }
