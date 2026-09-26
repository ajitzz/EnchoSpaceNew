import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ImageIcon, Loader2, RefreshCw, ShieldCheck, X, Video, Play, Sparkles } from 'lucide-react';
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

export function AdminReelPackageWorkspace() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/marketing/v2/creatives/packages?status=SUBMITTED', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load standalone creative packages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const handleModerate = async (pkgId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(pkgId);
    try {
      const token = localStorage.getItem('token');
      const reason = rejectionNotes[pkgId]?.trim();
      const res = await fetch(`/api/marketing/v2/creatives/packages/${pkgId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          decision,
          rejectionReasons: reason ? [reason] : []
        })
      });
      if (res.ok) {
        await loadPackages();
      }
    } catch (err: any) {
      setError(err.message || 'Moderation action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mkt-creative-workspace" aria-label="Administrator standalone reel review" style={{ marginTop: '24px' }}>
      <div className="mkt-creative-heading">
        <div>
          <span className="mkt-eyebrow">Decision 037-G · Video Queue</span>
          <h4>Review Standalone Phone Reels (9:16)</h4>
        </div>
        <button type="button" className="mkt-icon-button" onClick={() => void loadPackages()} aria-label="Refresh video packages">
          <RefreshCw size={15} />
        </button>
      </div>
      <p className="mkt-caption">
        Verify vertical phone video reels, check that listing photo galleries remain unpolluted, and inspect AI preflight scores before approving for ad deployment.
      </p>
      {error && <p className="mkt-creative-error" role="alert">{error}</p>}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px' }}>
          <Loader2 className="mkt-spin" size={16} /> Loading standalone reel packages...
        </div>
      ) : packages.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
          {packages.map(pkg => {
            const asset = pkg.assets?.[0];
            const isBusy = busyId === pkg.id;
            return (
              <article key={pkg.id} className="mkt-creative-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', width: '100%', height: '320px', backgroundColor: '#09090b', borderRadius: '16px', overflow: 'hidden' }}>
                  {asset?.originalUrl ? (
                    <video
                      src={asset.originalUrl}
                      controls
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717a' }}>
                      <Video size={32} />
                    </div>
                  )}
                  <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#34d399', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                    {asset?.aspectRatio || '9:16'} · {asset?.durationSeconds ? `${asset.durationSeconds}s` : ''}
                  </span>
                </div>
                <div className="mkt-creative-card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div className="mkt-creative-card-heading">
                      <strong>{pkg.headline}</strong>
                      <span className={`mkt-creative-state state-${pkg.moderationStatus.toLowerCase()}`}>
                        {pkg.moderationStatus}
                      </span>
                    </div>
                    <p className="mkt-caption" style={{ marginTop: '4px' }}>{pkg.description}</p>
                    <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#a1a1aa' }}>
                      <div>AI Score: <strong style={{ color: pkg.aiPreflightScore >= 8 ? '#34d399' : '#f87171' }}>{pkg.aiPreflightScore}/10</strong></div>
                      <div>Rights Confirmed: <strong style={{ color: '#34d399' }}>YES</strong></div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Hash: {asset?.sha256Hash?.slice(0, 16)}…</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', borderTop: '1px solid #27272a', paddingTop: '10px' }}>
                    <input
                      type="text"
                      placeholder="Rejection note (if rejecting)..."
                      value={rejectionNotes[pkg.id] || ''}
                      onChange={e => setRejectionNotes(prev => ({ ...prev, [pkg.id]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="mkt-primary"
                        style={{ flex: 1, padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        disabled={isBusy}
                        onClick={() => handleModerate(pkg.id, 'APPROVE')}
                      >
                        {isBusy ? <Loader2 className="mkt-spin" size={13} /> : <Check size={13} />} Approve Reel
                      </button>
                      <button
                        type="button"
                        className="mkt-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        disabled={isBusy}
                        onClick={() => handleModerate(pkg.id, 'REJECT')}
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mkt-caption">No standalone phone reels are waiting for administrator review.</p>
      )}
    </section>
  );
}
