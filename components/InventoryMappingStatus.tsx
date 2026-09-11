import React, { useEffect, useId, useState } from 'react';
import { useAuth } from './AuthContext';

type Room = { id?: string | number; name?: string };
type State = 'loading' | 'disabled' | 'unavailable' | 'unmapped' | 'mapped_not_synchronized' | 'signed_out';
function RoomStatus({ listingId, roomId }: { listingId: string; roomId: string }) {
  const { token } = useAuth();
  const [state, setState] = useState<State>('loading');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(token ? 'loading' : 'signed_out');
    if (!token) return () => controller.abort();
    void fetch(`/api/inventory-mappings/${encodeURIComponent(listingId)}/rooms/${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 503 && body.code === 'INVENTORY_MAPPING_DISABLED') setState('disabled');
      else if (response.status === 401) setState('signed_out');
      else if (!response.ok || !['unmapped', 'mapped_not_synchronized'].includes(body.state) || body.checkoutAuthorized !== false || body.deliveryAuthorized !== false) setState('unavailable');
      else setState(body.state);
    }).catch(() => { if (!controller.signal.aborted) setState('unavailable'); });
    return () => controller.abort();
  }, [listingId, roomId, token, revision]);
  const messages: Record<State, string> = {
    loading: 'Checking room mapping…', disabled: 'External inventory setup is not enabled yet.',
    unavailable: 'Mapping status unavailable. Retry or ask Admin to check access and setup.',
    unmapped: 'No current provider mapping for this room.',
    mapped_not_synchronized: 'Room mapped · synchronization not verified.',
    signed_out: 'Sign in again to check mapping status.',
  };
  return <div aria-busy={state === 'loading'} className="space-y-2">
    <p role={state === 'unavailable' ? 'alert' : 'status'} className="text-sm text-slate-700">{messages[state]}</p>
    <button type="button" className="workspace-secondary" disabled={state === 'loading' || !token} onClick={() => setRevision(value => value + 1)}>{state === 'unavailable' ? 'Retry mapping status' : 'Refresh mapping status'}</button>
  </div>;
}

export function InventoryMappingStatus({ listingId, rooms }: { listingId: string | number; rooms?: Room[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const panelId = useId();
  const candidates = Array.isArray(rooms) ? rooms.filter(room => room.id != null && String(room.id).trim() && !String(room.id).includes(',')) : [];
  const valid = candidates.filter(room => candidates.filter(other => String(other.id) === String(room.id)).length === 1);
  const roomId = valid.some(room => String(room.id) === selected) ? selected : valid[0] ? String(valid[0].id) : '';
  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left" onClick={event => event.stopPropagation()}>
    <button type="button" className="text-sm font-semibold text-slate-800" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>External inventory status</button>
    {open && <div id={panelId} className="mt-3 space-y-3">
      <p className="text-xs text-slate-600">Read-only provider mapping. A mapping is not proof of live availability and does not enable external checkout or advertising.</p>
      {!roomId ? <p role="status" className="text-sm">No unique room identity is available. Review the property’s rooms first.</p> : <>
        <label className="block text-sm">Room<select className="mt-1 block w-full rounded border border-slate-300 bg-white p-2" value={roomId} onChange={event => setSelected(event.target.value)}>
          {valid.map(room => <option key={String(room.id)} value={String(room.id)}>{room.name || String(room.id)}</option>)}
        </select></label>
        <RoomStatus key={`${listingId}:${roomId}`} listingId={String(listingId)} roomId={roomId} />
      </>}
    </div>}
  </div>;
}
