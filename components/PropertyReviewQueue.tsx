import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from './AuthContext';
import { inventorySourceLabel } from '../lib/inventorySource';

interface Submission {
  id: number; host_id: number; status: string; version: string; updated_at: string;
  published_listing_id?: number; review_note?: string;
  published_listing?: Record<string, any>;
  draft_data: Record<string, any>;
}
const statuses: Record<string, string> = { DRAFT: 'Draft', PENDING_REVIEW: 'Awaiting review', PUBLISHED: 'Published', CHANGES_REQUESTED: 'Changes requested' };
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
const displayValue = (value: any) => value == null || value === '' ? 'Not provided' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

export function PropertyReviewQueue({ admin = false, onResume }: { admin?: boolean; onResume?: (listing: any) => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<number | null>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (before?: string) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (admin) params.set('scope', 'admin');
      if (before) params.set('before', before);
      const res = await fetch(`/api/property-review${params.size ? `?${params}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to load property submissions.');
      if (!Array.isArray(body.submissions)) throw new Error('Property submissions could not be read.');
      if (abort.signal.aborted) return;
      setRows(previous => before ? [...previous, ...body.submissions.filter((row: Submission) => !previous.some(existing => String(existing.id) === String(row.id)))] : body.submissions);
      setNextCursor(typeof body.nextCursor === 'string' ? body.nextCursor : null);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load submissions.'); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, [admin, token]);
  useEffect(() => { setRows([]); setNextCursor(null); void load(); return () => controller.current?.abort(); }, [load]);
  async function decide(row: Submission, decision: 'approve' | 'reject') {
    if (lock.current) return;
    if (decision === 'reject' && !notes[row.id]?.trim()) { setError('Add a note explaining the changes the host should make.'); return; }
    lock.current = true; setPending(row.id); setError(''); setMessage('');
    try {
      const res = await fetch(`/api/property-review/${row.id}/decision`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, version: row.version, note: notes[row.id] || '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'The review decision could not be saved.');
      setMessage(decision === 'approve' ? 'The reviewed property version is published.' : 'Changes requested. Your note is visible to the host.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save decision.'); }
    finally { lock.current = false; setPending(null); }
  }
  return <section className="workspace-panel mb-8" aria-label={admin ? 'Property review queue' : 'Property submissions'}>
    <div className="workspace-section-heading">
      <div><p className="workspace-eyebrow">{admin ? 'Publication control' : 'Your submission progress'}</p><h2>{admin ? 'Property review' : 'Property submissions'}</h2><p>{admin ? 'Inspect the submitted details before approving publication.' : 'Track submitted properties and changes to your published listings.'}</p></div>
      <button type="button" className="workspace-secondary" disabled={loading || pending !== null} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
    </div>
    {error && <div className="workspace-error" role="alert">{error}</div>}
    {message && <p role="status" className="px-6 py-3 text-emerald-800">{message}</p>}
    {loading && <div className="workspace-empty" role="status"><Loader2 className="animate-spin" aria-hidden="true" />Loading submissions…</div>}
    {(loading || error) && !rows.length ? null : !rows.length ? <div className="workspace-empty"><ClipboardCheck size={28} aria-hidden="true" /><h3>{admin ? 'No properties awaiting review' : 'No submissions yet'}</h3><p>{admin ? 'New submissions appear here when hosts send them for review.' : 'Submit a property using the listing form to start its review.'}</p></div> : <div className="divide-y divide-slate-100">
      {rows.map(row => <article key={row.id} className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="p-3 rounded-xl bg-slate-100 text-slate-600"><Building2 aria-hidden="true" /></div>
          <div className="flex-1 min-w-0"><h3 className="font-semibold text-slate-900 break-words">{typeof row.draft_data.title === 'string' && row.draft_data.title || 'Untitled property'}</h3><p className="text-sm text-slate-500">{typeof row.draft_data.city === 'string' && row.draft_data.city || 'Location not provided'} · Submission #{row.id}{admin ? ` · Host #${row.host_id}` : ''}</p><p className="text-xs text-slate-500 mt-1">Saved {new Date(row.updated_at).toLocaleString()}</p></div>
          <span className="workspace-status">{statuses[row.status] || 'Status unavailable'}</span>
        </div>
        {row.review_note && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><strong>Requested changes: </strong>{row.review_note}</p>}
        {Array.isArray(row.draft_data.rooms) && <div className="mt-3 text-sm text-slate-600" aria-label="Submitted room inventory sources">{row.draft_data.rooms.map((room: any, index: number) => <p key={room.id || index}>{typeof room.name === 'string' ? room.name : 'Room'}: {inventorySourceLabel(room.inventory_source)}</p>)}</div>}
        {!admin && onResume && ['DRAFT', 'CHANGES_REQUESTED'].includes(row.status) && <button type="button" className="workspace-secondary mt-4" onClick={() => onResume({ ...row.draft_data, id: row.published_listing_id ? String(row.published_listing_id) : '', _reviewDraftId: row.id, _reviewVersion: row.version })}>{row.status === 'DRAFT' ? 'Resume draft' : 'Revise property'}</button>}
        {Array.isArray(row.draft_data.photos) && row.draft_data.photos.length > 0 && <div className="flex gap-3 overflow-x-auto mt-4 pb-2" aria-label="Submitted property photos">{row.draft_data.photos.filter((photo: any) => typeof photo?.url === 'string' && /^(https?:\/\/|\/uploads\/)/.test(photo.url)).map((photo: any, index: number) => <figure key={`${photo.id}-${index}`} className="shrink-0 w-40"><img src={photo.url} alt={photo.title || 'Submitted property photo'} className="h-28 w-40 rounded-xl object-cover bg-slate-100" loading="lazy" /><figcaption className="text-xs text-slate-500 mt-1 truncate">{photo.title || photo.category || 'Property photo'}</figcaption></figure>)}</div>}
        <details className="mt-4 rounded-xl border border-slate-200">
          <summary className="cursor-pointer p-4 font-medium text-sm text-slate-700">Inspect submitted property details <ChevronDown size={14} className="inline" aria-hidden="true" /></summary>
          <dl className="p-4 pt-0 space-y-4 text-sm">
            {Object.entries(row.draft_data).filter(([key]) => !key.startsWith('_')).map(([key, value]) => {
              const previous = row.published_listing?.[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)];
              const changed = row.published_listing && displayValue(previous) !== displayValue(value);
              return <div key={key} className={changed ? 'rounded-xl bg-amber-50 p-3' : ''}>
                <dt className="capitalize font-semibold text-slate-700">{label(key)}{changed && <span className="ml-2 text-xs text-amber-800 font-normal">Changed</span>}</dt>
                <dd className={`mt-1 text-slate-600 ${row.published_listing ? 'grid sm:grid-cols-2 gap-4' : ''}`}>
                  {row.published_listing && <div><span className="text-xs font-medium text-slate-500">Currently published</span><pre className="whitespace-pre-wrap break-all text-xs max-h-72 overflow-auto mt-1">{displayValue(previous)}</pre></div>}
                  <div>{row.published_listing && <span className="text-xs font-medium text-slate-500">Submitted version</span>}<pre className="whitespace-pre-wrap break-all text-xs max-h-72 overflow-auto mt-1">{displayValue(value)}</pre></div>
                </dd>
              </div>;
            })}
          </dl>
        </details>
        {admin && row.status === 'PENDING_REVIEW' && <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700" htmlFor={`review-note-${row.id}`}>Review note <span className="font-normal">(required when requesting changes)</span></label>
          <textarea id={`review-note-${row.id}`} value={notes[row.id] || ''} maxLength={2000} onChange={e => setNotes(old => ({ ...old, [row.id]: e.target.value }))} className="w-full rounded-xl border border-slate-300 p-3 text-sm" rows={2} disabled={pending !== null} />
          <div className="flex flex-wrap gap-3"><button className="workspace-secondary" type="button" disabled={pending !== null} onClick={() => void decide(row, 'reject')}>Request changes</button><button className="workspace-primary" type="button" disabled={pending !== null} onClick={() => void decide(row, 'approve')}><Check size={16} aria-hidden="true" />{pending === row.id ? 'Saving decision…' : 'Approve & publish'}</button></div>
        </div>}
      </article>)}
      <div className="p-4 flex flex-wrap items-center gap-4"><p className="text-sm text-slate-500">Showing {rows.length} submissions, newest submitted first.</p>{nextCursor && <button type="button" className="workspace-secondary" disabled={loading || pending !== null} onClick={() => void load(nextCursor)}>Load older submissions</button>}</div>
    </div>}
  </section>;
}
