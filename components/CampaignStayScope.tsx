import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export function CampaignStayScope({ campaignId, readOnly = false, onReviewed }: { campaignId: number | string; readOnly?: boolean; onReviewed?: (version: string | null) => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [scope, setScope] = useState({ checkIn: '', checkOut: '', roomIds: [] as string[] });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    void fetch(`/api/campaign-stay-scope/${campaignId}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (!controller.signal.aborted) { setData(body); setScope(body.scope || { checkIn: '', checkOut: '', roomIds: [] }); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || 'Stay scope unavailable.'); });
    return () => controller.abort();
  }, [campaignId, token, revision]);
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/campaign-stay-scope/${campaignId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, version: data.version }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setData(body); setScope(body.scope);
    } catch (e) { setError(e instanceof Error ? e.message : 'Stay scope could not be saved.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-slate-200 p-4 my-3">
    <summary className="font-semibold cursor-pointer">Advertised stay dates and rooms</summary>
    <p className="text-sm text-slate-500 my-2">Guest stay dates, not the ad schedule. External availability is unverified; this does not authorize ad delivery.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!data ? <button type="button" onClick={() => setRevision(n => n + 1)}>Refresh stay scope</button> : <>
      <fieldset disabled={readOnly || !data.editable || busy} className="space-y-3">
        <label className="block text-sm">Check-in<input aria-label="Advertised check-in" className="block border rounded p-2" type="date" value={scope.checkIn} onChange={e => setScope(old => ({ ...old, checkIn: e.target.value }))} /></label>
        <label className="block text-sm">Checkout<input aria-label="Advertised checkout" className="block border rounded p-2" type="date" value={scope.checkOut} onChange={e => setScope(old => ({ ...old, checkOut: e.target.value }))} /></label>
        <div>{data.rooms?.map((room: any) => <label key={room.id} className="block text-sm"><input type="checkbox" checked={scope.roomIds.includes(room.id)} onChange={e => setScope(old => ({ ...old, roomIds: e.target.checked ? [...old.roomIds, room.id] : old.roomIds.filter(id => id !== room.id) }))} /> {room.name || room.id}</label>)}</div>
      </fieldset>
      {!data.scope && <p className="text-sm">No stay scope saved.</p>}
      {data.availability && <div className="my-3 rounded-lg bg-slate-50 p-3 text-sm" aria-label="Internal room availability">
        <p className="font-semibold">Internal availability: {data.availability.state}</p>
        <p>Checked {new Date(data.availability.checkedAt).toLocaleString()} for the saved dates. Unsaved edits are not included.</p>
        {data.availability.reason && <p>{data.availability.reason}</p>}
        {data.availability.rooms?.map((room: any) => <p key={room.roomId}>{data.rooms.find((item: any) => item.id === room.roomId)?.name || room.roomId}: {room.state}{room.remaining != null ? ` · ${room.remaining} remaining across all nights` : ''}{room.reason ? ` · ${room.reason}` : ''}</p>)}
        <p>External channels are unverified. This is not permission to launch or resume ads.</p>
      </div>}
      <button type="button" className="workspace-secondary mt-2" disabled={busy} onClick={() => setRevision(n => n + 1)}>Refresh saved availability</button>
      {readOnly && data.scope && onReviewed && <label key={data.version} className="block text-sm mt-3"><input type="checkbox" onChange={e => onReviewed(e.target.checked ? data.version : null)} /> I reviewed these stay dates and selected rooms.</label>}
      {!readOnly && data.editable && <button type="button" className="workspace-secondary mt-3" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save stay scope'}</button>}
    </>}
  </details>;
}
