import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ImageIcon, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { marketingRequest } from './api';
import type { CreativeRecord, CreativePage } from './creativeTypes';
import './marketing.css';

type Selection = { id: string; manifestHash: string; url?: string };

function key(prefix: string) { return prefix; }

function formatLabel(format: CreativeRecord['format']) {
  return { SQUARE: 'Feed square', PORTRAIT: 'Portrait', STORY: 'Story / Reel frame', LANDSCAPE: 'Landscape' }[format];
}

function useProtectedImage(record: CreativeRecord | undefined, view: 'SOURCE' | 'DERIVATIVE') {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setUrl(null);
    setError('');
    if (!record || (view === 'DERIVATIVE' && !record.output)) return () => undefined;
    const token = localStorage.getItem('token');
    if (!token) { setError('Sign in again to inspect this image.'); return () => undefined; }
    void fetch(`/api/marketing/v2/creatives/${encodeURIComponent(record.id)}/image?view=${view}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error('The protected image could not be loaded.'); return response.blob(); })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'The protected image could not be loaded.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [record?.id, record?.manifestHash, view]);
  return { url, error };
}

function CreativeCard({ record, selected, onSelect, admin = false, onReview }: { record: CreativeRecord; selected?: boolean; onSelect?: () => void; admin?: boolean; onReview?: (decision: 'APPROVE' | 'REJECT', note: string) => Promise<void> }) {
  const image = useProtectedImage(record, 'DERIVATIVE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canSelect = record.state === 'APPROVED' && !!record.url && !!onSelect;
  async function review(decision: 'APPROVE' | 'REJECT') {
    if (!onReview || note.trim().length < 10) return;
    setBusy(true);
    try { await onReview(decision, note.trim()); setNote(''); } finally { setBusy(false); }
  }
  return <article className={`mkt-creative-card${selected ? ' is-selected' : ''}`}>
    <div className="mkt-creative-card-media">
      {image.url ? <img src={image.url} alt={`${formatLabel(record.format)} reviewed campaign variant`} /> : <div className="mkt-media-empty"><ImageIcon size={22}/><small>{image.error || record.state === 'QUEUED' || record.state === 'PROCESSING' ? 'Preparing the exact image…' : 'Image evidence is unavailable.'}</small></div>}
    </div>
    <div className="mkt-creative-card-body">
      <div className="mkt-creative-card-heading"><strong>{formatLabel(record.format)}</strong><span className={`mkt-creative-state state-${record.state.toLowerCase()}`}>{record.state.replaceAll('_', ' ')}</span></div>
      <p className="mkt-caption">Source asset {record.sourceAssetId}. The prepared bytes are checksum-bound and require both host and admin review.</p>
      {record.manifestHash && <code className="mkt-creative-hash">{record.manifestHash.slice(0, 16)}…</code>}
      {canSelect && <button type="button" className={selected ? 'mkt-primary' : 'mkt-secondary'} onClick={onSelect}>{selected ? <><Check size={15}/> Selected for this Meta campaign</> : 'Use this reviewed variant'}</button>}
      {admin && record.state === 'ADMIN_REVIEW' && <div className="mkt-creative-admin-form"><label>Review note<textarea minLength={10} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Record what you verified about the source and prepared image." /></label><div className="mkt-review-actions"><button type="button" className="mkt-primary" disabled={busy || note.trim().length < 10} onClick={() => void review('APPROVE')}>{busy ? <Loader2 className="mkt-spin" size={15}/> : <Check size={15}/>} Approve</button><button type="button" className="mkt-secondary" disabled={busy || note.trim().length < 10} onClick={() => void review('REJECT')}><X size={15}/> Reject</button></div></div>}
    </div>
  </article>;
}

export function HostCreativeWorkspace({ listingId, sourceAssetId, selected, onSelect }: { listingId: number; sourceAssetId: string; selected?: Selection; onSelect: (selection: Selection | null) => void }) {
  const [page, setPage] = useState<CreativePage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const result = await marketingRequest<CreativePage>(`/creatives?listingId=${listingId}&limit=20`); setPage(result); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Creative review is unavailable.'); }
  }, [listingId]);
  useEffect(() => { void load(); }, [load]);
  const records = useMemo(() => (page?.items || []).filter(item => item.sourceAssetId === sourceAssetId), [page, sourceAssetId]);
  const active = records.find(item => item.state === 'APPROVED' && item.id === selected?.id);
  async function request() {
    setBusy(true); setMessage(''); setError('');
    try { await marketingRequest<CreativePage>('/creatives', { method: 'POST', headers: { 'Idempotency-Key': key(`creative:${listingId}:${sourceAssetId}:v1`) }, body: JSON.stringify({ listingId, sourceAssetId, formats: ['SQUARE', 'PORTRAIT', 'STORY', 'LANDSCAPE'], rightsConfirmed: true }) }); setMessage('Image preparation queued. We will keep the evidence visible here for your confirmation.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Image preparation could not be queued.'); }
    finally { setBusy(false); }
  }
  async function confirm(record: CreativeRecord) {
    if (!record.manifestHash) return;
    setBusy(true); setError('');
    try { await marketingRequest(`/creatives/${record.id}/confirm`, { method: 'POST', headers: { 'Idempotency-Key': key(`confirm:${record.id}:v1`) }, body: JSON.stringify({ manifestHash: record.manifestHash, rightsConfirmed: true, appearanceConfirmed: true }) }); setMessage('Your confirmation is recorded. An administrator must complete the final image review.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Image confirmation could not be recorded.'); }
    finally { setBusy(false); }
  }
  const hasPending = records.some(record => ['QUEUED', 'PROCESSING', 'HOST_REVIEW', 'ADMIN_REVIEW'].includes(record.state));
  useEffect(() => { if (!hasPending) return () => undefined; const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 8000); return () => window.clearInterval(timer); }, [hasPending, load]);
  return <section className="mkt-creative-workspace" aria-label="Reviewed campaign images"><div className="mkt-creative-heading"><div><span className="mkt-eyebrow">Creative evidence</span><h4>Prepare one exact campaign image</h4></div><button type="button" className="mkt-icon-button" onClick={() => void load()} aria-label="Refresh creative evidence"><RefreshCw size={15}/></button></div><p className="mkt-caption">We preserve the original approved photo, generate bounded provider canvases and keep the source, output and review fingerprints together. No image is sent to Meta until the exact variant is approved.</p>{message && <p className="mkt-creative-message" role="status"><ShieldCheck size={15}/>{message}</p>}{error && <p className="mkt-creative-error" role="alert">{error}</p>}<div className="mkt-creative-actions"><button type="button" className="mkt-secondary" disabled={busy} onClick={() => void request()}>{busy ? <Loader2 className="mkt-spin" size={15}/> : <ImageIcon size={15}/>} Prepare provider formats</button>{active && <span className="mkt-caption">{formatLabel(active.format)} is selected.</span>}</div>{records.length ? <div className="mkt-creative-grid">{records.map(record => <div key={record.id}><CreativeCard record={record} selected={record.id === selected?.id} onSelect={() => onSelect({ id: record.id, manifestHash: record.manifestHash!, url: record.url || undefined })}/>{record.state === 'HOST_REVIEW' && <button type="button" className="mkt-text-button" disabled={busy} onClick={() => void confirm(record)}>Confirm this prepared image for admin review <Check size={14}/></button>}</div>)}</div> : <p className="mkt-caption">Prepare the approved source image to see its review canvases here.</p>}</section>;
}

export function AdminCreativeWorkspace() {
  const [page, setPage] = useState<CreativePage | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setPage(await marketingRequest<CreativePage>('/admin/creatives?state=ADMIN_REVIEW&limit=20')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Creative review is unavailable.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function review(record: CreativeRecord, decision: 'APPROVE' | 'REJECT', note: string) {
    if (!record.manifestHash) return;
    await marketingRequest(`/admin/creatives/${record.id}/review`, { method: 'POST', headers: { 'Idempotency-Key': key(`admin-review:${record.id}:${decision}`) }, body: JSON.stringify({ manifestHash: record.manifestHash, decision, note, appearanceConfirmed: decision === 'APPROVE' }) });
    await load();
  }
  return <section className="mkt-creative-workspace" aria-label="Administrator creative review"><div className="mkt-creative-heading"><div><span className="mkt-eyebrow">Admin evidence queue</span><h4>Review prepared campaign images</h4></div><button type="button" className="mkt-icon-button" onClick={() => void load()} aria-label="Refresh creative review"><RefreshCw size={15}/></button></div><p className="mkt-caption">Approve only the exact source and derivative you can inspect. The immutable review is bound to the campaign revision before provider publishing.</p>{error && <p className="mkt-creative-error" role="alert">{error}</p>}{page?.items.length ? <div className="mkt-creative-grid">{page.items.map(record => <CreativeCard key={record.id} record={record} admin onReview={(decision, note) => review(record, decision, note)}/>)}</div> : <p className="mkt-caption">No prepared images are waiting for administrator review.</p>}</section>;
}
