import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Listing } from '../types';
import type { PrivateCalendar } from '../src/lib/calendar';
import { useAuth } from './AuthContext';
import './host-calendar.css';

const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export default function HostCalendar({ listings }: { listings: Listing[]; reservations?: unknown[] }) {
  const { token } = useAuth();
  const [selection, setSelection] = useState('');
  const listing = listings.find(row => String(row.id) === selection) || listings[0];
  if (!listing) return <p className="host-calendar">Add a property to manage its calendar.</p>;
  return <section className="host-calendar" aria-label="Property calendar">
    <header><div><p className="hc-eyebrow">Your properties</p><h2>Availability calendar</h2><p>Room capacity, holds and reservations in one place.</p></div>
      <label>Property<select aria-label="Property" value={String(listing.id)} onChange={event => setSelection(event.target.value)}>{listings.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
    </header>
    {token ? <PropertyCalendar key={`${listing.id}:${token}`} listingId={String(listing.id)} token={token}/> : <p role="status">Sign in to view your private calendar.</p>}
  </section>;
}
function PropertyCalendar({ listingId, token }: { listingId: string; token: string }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const from = dateOnly(month), to = dateOnly(new Date(month.getFullYear(),month.getMonth()+1,1));
  const windowKey = `${from}:${to}`;
  const [snapshot, setSnapshot] = useState<{ key: string; value: PrivateCalendar } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const [roomId, setRoomId] = useState(''), [start, setStart] = useState(from), [end, setEnd] = useState(to), [source, setSource] = useState('manual'), [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const requestIds = useRef(new Map<string,string>());
  const data = snapshot?.key === windowKey ? snapshot.value : null;
  const headers = { Authorization: `Bearer ${token}` };
  const dates = useMemo(() => Array.from({ length: new Date(month.getFullYear(),month.getMonth()+1,0).getDate() },(_, index) => `${from.slice(0,8)}${String(index+1).padStart(2,'0')}`),[from,month]);
  useEffect(() => {
    let disposed = false, controller: AbortController | null = null;
    const fetchCalendar = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort(); controller = new AbortController(); setLoading(true);
      try {
        const response = await fetch(`/api/listings/${listingId}/room-calendar?from=${from}&to=${to}`, { cache:'no-store',headers:{ Authorization:`Bearer ${token}` },signal:controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Calendar is unavailable.');
        if (!disposed) { setSnapshot({ key:windowKey,value:payload }); setError(''); }
      } catch (reason) {
        if (!disposed && !(reason instanceof Error && reason.name === 'AbortError')) { setSnapshot(null); setError(reason instanceof Error ? reason.message : 'Calendar is unavailable.'); }
      } finally { if (!disposed) setLoading(false); }
    };
    void fetchCalendar(); const timer = setInterval(() => { void fetchCalendar(); },30000);
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchCalendar(); };
    document.addEventListener('visibilitychange',onVisible);
    return () => { disposed = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange',onVisible); };
  },[listingId,token,from,to,windowKey,refresh]);
  async function change(blockId?: number) {
    const payload = blockId === undefined ? { roomTypeId:Number(roomId),from:start,to:end,source,note } : { blockId };
    const key = JSON.stringify(payload); let requestId = requestIds.current.get(key);
    if (!requestId) { requestId = crypto.randomUUID(); requestIds.current.set(key,requestId); }
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/listings/${listingId}/room-calendar/block${blockId === undefined ? '' : `/${blockId}`}`, {
        method:blockId === undefined ? 'POST' : 'DELETE', headers:{ ...headers,'Content-Type':'application/json','Idempotency-Key':requestId },
        ...(blockId === undefined ? { body:JSON.stringify({ ...payload,requestId }) } : {})
      });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Calendar change failed.');
      requestIds.current.delete(key); setNotice(blockId === undefined ? 'One room of capacity blocked for the selected nights.' : 'Block removed. Capacity counters updated.');
      setSnapshot(null); setRefresh(value => value+1);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not confirm the change. Refresh before retrying.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="hc-toolbar"><button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button>
      <h3>{month.toLocaleDateString(undefined,{ month:'long',year:'numeric' })}</h3>
      <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button>
      <button className="hc-refresh" disabled={loading} onClick={() => setRefresh(value => value+1)}><RefreshCw size={16}/>Refresh</button></div>
    {error && <p role="alert" className="hc-warning">{error}</p>}
    {!data && !error && <p role="status">Loading this property's calendar…</p>}
    {data && <>
      <p className="hc-caption">Rooms available each night · Updated {new Date(data.observedAt).toLocaleTimeString()} · Refreshes every 30 seconds while visible</p>
      {data.days.some(day => day.issue) && <p className="hc-warning">Some dates need an inventory review. A dash means availability is unconfirmed; it does not mean a room is available.</p>}
      {data.rooms.length ? <div className="hc-table-wrap" tabIndex={0} role="region" aria-label="Scrollable room availability"><table><caption className="sr-only">Available rooms by room type and night</caption>
        <thead><tr><th scope="col">Room type</th>{dates.map(date => <th scope="col" key={date}>{Number(date.slice(-2))}</th>)}</tr></thead>
        <tbody>{data.rooms.map(room => <tr key={room.id}><th scope="row">{room.name}<small>{room.inventoryCount} rooms</small></th>{dates.map(date => {
          const day = data.days.find(row => row.roomTypeId === room.id && row.date === date);
          return <td key={date} className={day?.available === 0 ? 'hc-full' : day?.available == null ? 'hc-unknown' : ''} title={day ? `${date}: ${day.held} held, ${day.booked} booked, ${day.blocked} blocked${day.issue ? '; inventory review needed' : ''}` : 'Unavailable'}>{day?.available ?? '—'}</td>;
        })}</tr>)}</tbody></table></div> : <p>No canonical room types are configured for this property.</p>}
      <div className="hc-panels"><form onSubmit={event => { event.preventDefault(); void change(); }}><h3>Block room capacity</h3><p>Each block reserves one room of the selected type. Checkout day remains available.</p>
        <label>Room type<select required value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">Choose a room type</option>{data.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <div className="hc-dates"><label>First night<input type="date" required value={start} onChange={event => setStart(event.target.value)}/></label><label>Checkout<input type="date" required value={end} min={start} onChange={event => setEnd(event.target.value)}/></label></div>
        <label>Reason<select value={source} onChange={event => setSource(event.target.value)}><option value="manual">Personal use</option><option value="maintenance">Maintenance</option><option value="direct">Direct reservation</option><option value="airbnb">Airbnb reservation</option><option value="booking_com">Booking.com reservation</option></select></label>
        <label>Private note<textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)}/></label>
        <button className="hc-primary" disabled={busy || !roomId || !start || end <= start}>{busy ? 'Saving…' : 'Block one room'}</button>
      </form><section><h3>Calendar blocks</h3>{!data.blocks.length && <p>No blocks in this month.</p>}{data.blocks.map(block => <article key={block.id}><strong>{data.rooms.find(room => room.id === block.roomTypeId)?.name || 'Room mapping needs review'}</strong><p>{block.startDate} → {block.endDate} · {block.source}</p>{block.note && <p>{block.note}</p>}<button disabled={busy} onClick={() => void change(block.id)}>Remove block</button></article>)}</section></div>
      <p role="status" aria-live="polite">{notice}</p>
      <section><h3>Reservations</h3><p>Legacy reservations are listed without guessing a room assignment. Their overlapping dates require reconciliation.</p>{!data.bookings.length && <p>No reservations in this month.</p>}{data.bookings.map(booking => <article key={booking.id}><strong>{booking.guestName || 'Guest name unavailable'}</strong><p>{booking.startDate || 'Start date needs review'} → {booking.endDate || 'End date needs review'} · {booking.status}</p></article>)}</section>
    </>}
  </>;
}
