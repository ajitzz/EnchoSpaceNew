import React, { useEffect, useId, useState } from 'react';
import { useAuth } from './AuthContext';

type Grant = { id: string; provider: string; provider_property_id: string; approved_by: number; approved_at: string; expires_at: string; status: string; revocation_reason?: string; revoked_by?: number };
const labels: Record<string, string> = { authorized: 'Business authorization recorded', revoked: 'Revoked', expired: 'Expired', ownership_changed: 'Property ownership changed', not_yet_valid: 'Not yet valid' };
function History({ listingId }: { listingId: string }) {
  const { token } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [request, setRequest] = useState({ before: null as string | null, revision: 0 });
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError('');
    if (!token) { setGrants([]); setCursor(null); setError('Sign in again to view authorization history.'); setBusy(false); return () => controller.abort(); }
    if (!request.before) { setGrants([]); setCursor(null); }
    void fetch(`/api/inventory-connections/${encodeURIComponent(listingId)}/grants${request.before ? `?before=${encodeURIComponent(request.before)}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.code === 'INVENTORY_MAPPING_DISABLED' ? 'Connection authorization setup is not enabled yet.' : 'Authorization history unavailable. Check access and retry.');
        if (!Array.isArray(body.grants) || body.providerVerification !== 'unverified' || body.checkoutAuthorized !== false) throw new Error('Authorization response requires review.');
        if (controller.signal.aborted) return;
        setGrants(old => [...new Map([...(request.before ? old : []), ...body.grants].map((grant: Grant) => [grant.id, grant])).values()]); setCursor(body.nextCursor ?? null);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Authorization history unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [listingId, token, request]);
  return <div className="space-y-3 mt-3" aria-busy={busy}>
    <p className="text-xs text-slate-600">Admin business authorization does not establish provider access, synchronized inventory or checkout permission.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status">Loading authorization history…</p>}
    {!busy && !error && !grants.length && <p>No authorization records for this property.</p>}
    {grants.map(grant => <article key={grant.id} className="rounded border border-slate-200 bg-white p-3 text-sm break-words">
      <p className="font-semibold">{labels[grant.status] || 'Status requires review'}</p>
      <p>{grant.provider} · Property {grant.provider_property_id}</p>
      <p>Approved by Admin {grant.approved_by} · {new Date(grant.approved_at).toLocaleString()}</p>
      <p>Expires {new Date(grant.expires_at).toLocaleString()}</p>
      {grant.revocation_reason && <p>Revoked by Admin {grant.revoked_by}: {grant.revocation_reason}</p>}
    </article>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ before: null, revision: old.revision + 1 }))}>Refresh authorization history</button>
      {error && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ ...old, revision: old.revision + 1 }))}>Retry authorization history</button>}
      {cursor && <button type="button" className="workspace-secondary" disabled={busy} onClick={() => setRequest(old => ({ before: cursor, revision: old.revision + 1 }))}>Load older authorizations</button>}
    </div>
  </div>;
}
export function InventoryAuthorizationHistory({ listingId }: { listingId: string | number }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false); const id = useId();
  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left" onClick={event => event.stopPropagation()}>
    <button type="button" className="text-sm font-semibold" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>Connection authorizations</button>
    {open && <div id={id}><History key={`${listingId}:${token}`} listingId={String(listingId)} /></div>}
  </div>;
}
