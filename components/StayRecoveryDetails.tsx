import React, { useEffect, useId, useState } from 'react';
import { useAuth } from './AuthContext';

type Observation = { id: string; actor_id: number; provider_order_id: string; classification: string; observed_at: string; recorded_at: string;
  payments: { id: string; status: string; amount: number; amount_refunded: number; currency: string }[] };
type AuditEvent = { id: string; actor_id: number; event_type: string; created_at: string };
type Detail = { order: { id: string; state: string; booking_id: number | null }; observations: Observation[]; events: AuditEvent[]; nextObservationCursor: string | null; nextEventCursor: string | null; readOnly: true };
const labels: Record<string, string> = { captured_observed: 'Capture observed · not a booking confirmation', no_capture_observed: 'No capture observed · outcome still unresolved', provider_review: 'Provider evidence requires review', refund_review: 'Refund evidence requires review' };
function timestamp(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Timestamp requires review' : date.toLocaleString(); }
function Details({ checkoutId }: { checkoutId: string }) {
  const { token } = useAuth();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [request, setRequest] = useState({ observationBefore: null as string | null, eventBefore: null as string | null, revision: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setBusy(true); setError('');
    if (!request.observationBefore && !request.eventBefore) setDetail(null);
    if (!token) { setBusy(false); setError('Sign in as Admin to inspect checkout history.'); return () => controller.abort(); }
    const query = new URLSearchParams();
    if (request.observationBefore) query.set('observationBefore', request.observationBefore);
    if (request.eventBefore) query.set('eventBefore', request.eventBefore);
    void fetch(`/api/stay-recovery/${encodeURIComponent(checkoutId)}?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'Checkout is no longer available for inspection.' : 'Checkout history unavailable. Retry or check Admin access.');
        const body: Detail = await response.json();
        if (body.readOnly !== true || body.order?.id !== checkoutId || !Array.isArray(body.observations) || !Array.isArray(body.events) || body.observations.some(item => !Array.isArray(item.payments))) throw new Error('Checkout history response requires review.');
        if (controller.signal.aborted) return;
        setDetail(old => ({ ...body,
          observations: request.eventBefore && old ? old.observations : [...new Map([...(request.observationBefore && old ? old.observations : []), ...body.observations].map(item => [item.id, item])).values()],
          events: request.observationBefore && old ? old.events : [...new Map([...(request.eventBefore && old ? old.events : []), ...body.events].map(item => [item.id, item])).values()],
          nextObservationCursor: request.eventBefore && old ? old.nextObservationCursor : body.nextObservationCursor,
          nextEventCursor: request.observationBefore && old ? old.nextEventCursor : body.nextEventCursor,
        }));
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Checkout history unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [checkoutId, token, open, request]);
  return <div>
    <button type="button" aria-expanded={open} aria-controls={panelId} className="workspace-secondary" onClick={() => { setOpen(value => !value); setDetail(null); setRequest(old => ({ observationBefore: null, eventBefore: null, revision: old.revision + 1 })); }}>{open ? 'Hide checkout history' : 'Inspect checkout history'}</button>
    {open && <section id={panelId} aria-label="Checkout evidence" aria-busy={busy} className="mt-4 space-y-3 border-t pt-4">
      <p>Historical evidence only. Refresh reads saved records, not the payment provider. No observation confirms a booking, releases inventory or issues a refund.</p>
      {busy && <p role="status">Loading checkout history…</p>}
      {error && <p role="alert">{error}</p>}
      {detail && <>
        <p>Current stored state: {detail.order.state}. Booking reference: {detail.order.booking_id ?? 'Not recorded'}.</p>
        <h3 className="font-semibold">Saved payment observations</h3>
        {!detail.observations.length && <p>No payment observations recorded. Payment outcome is not established.</p>}
        {detail.observations.map(item => <article key={item.id} className="rounded-lg border p-3 space-y-1">
          <h4 className="font-medium">{labels[item.classification] || 'Observation requires review'}</h4>
          <p>Observation {item.id} · Admin {item.actor_id}</p>
          <p>Observed: {timestamp(item.observed_at)} · Recorded: {timestamp(item.recorded_at)}</p>
          <p>Provider order: {item.provider_order_id}</p>
          {item.payments.map(payment => <p key={payment.id}>Payment {payment.id} · {payment.status} · {payment.currency} {payment.amount} minor units · Refunded amount observed: {payment.amount_refunded} minor units</p>)}
        </article>)}
        {detail.nextObservationCursor && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ observationBefore: detail.nextObservationCursor, eventBefore: null, revision: old.revision + 1 }))}>Load older observations</button>}
        <h3 className="font-semibold">Checkout audit history</h3>
        {!detail.events.length && <p>No audit events recorded.</p>}
        <ol className="space-y-2">{detail.events.map(event => <li key={event.id}>Event {event.id} · {event.event_type} · Actor {event.actor_id} · {timestamp(event.created_at)}</li>)}</ol>
        {detail.nextEventCursor && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ eventBefore: detail.nextEventCursor, observationBefore: null, revision: old.revision + 1 }))}>Load older audit events</button>}
      </>}
      <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ observationBefore: null, eventBefore: null, revision: old.revision + 1 }))}>Refresh saved history</button>
      {error && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ ...old, revision: old.revision + 1 }))}>Retry checkout history</button>}
    </section>}
  </div>;
}
export function StayRecoveryDetails({ checkoutId }: { checkoutId: string }) { const { token } = useAuth(); return <Details key={`${token}:${checkoutId}`} checkoutId={checkoutId} />; }
