import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Building2, Search, Inbox, Loader2, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import type { Listing } from '../types';

interface Reservation {
  id: string | number; status?: string; name?: string; moveInDate?: string; totalRent?: number | string;
  listing?: { title?: string; imageUrl?: string; currency?: string };
}

export function HostOverview({ name, listings, reservations, loading, error, onRetry, onCreate, onMarketing, onUpdate, pendingId, formatPrice }: {
  name?: string; listings: Listing[]; reservations: Reservation[]; loading: boolean; error: string | null;
  onRetry: () => void; onCreate?: () => void; onMarketing: () => void;
  onUpdate: (id: string | number, status: string) => Promise<void>; pendingId: string | number | null;
  formatPrice: (amount: number, currency: string) => string;
}) {
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const tabs = [{ id: 'pending', label: 'Needs attention' }, { id: 'confirmed', label: 'Confirmed' }, { id: 'completed', label: 'Completed' }, { id: 'all', label: 'All reservations' }];
  const counts = useMemo(() => reservations.reduce<Record<string, number>>((result, row) => {
    const state = row.status?.toLowerCase() || 'unknown';
    result[state] = (result[state] || 0) + 1;
    return result;
  }, {}), [reservations]);
  const visible = reservations.filter(row => (filter === 'all' || row.status?.toLowerCase() === filter) && `${row.name || ''} ${row.listing?.title || ''}`.toLowerCase().includes(search.toLowerCase()));
  const firstName = name?.trim().split(/\s+/)[0];
  return (
    <div className="workspace-content">
      <header className="workspace-page-header">
        <div><p className="workspace-eyebrow">Your stays, in focus</p><h1>{firstName ? `Welcome back, ${firstName}` : 'Your host overview'}</h1><p>Manage reservations, prepare your properties and grow your reach.</p></div>
        {onCreate && <button type="button" className="workspace-primary" onClick={onCreate}><Plus size={18} aria-hidden="true" />Add a property</button>}
      </header>
      {error && <div className="workspace-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><span>{error}</span><button type="button" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />Retry</button></div>}
      <div className="workspace-metrics" aria-busy={loading}>
        {[{ label: 'Your properties', value: listings.length, icon: Building2, note: 'Manage rooms, photos and rates' }, { label: 'Needs attention', value: counts.pending || 0, icon: Inbox, note: 'Reservations awaiting a decision' }, { label: 'Confirmed reservations', value: counts.confirmed || 0, icon: CalendarDays, note: 'Review dates and guest details' }].map(({ label, value, icon: Icon, note }) => (
          <div className="workspace-metric" key={label}><div className="flex justify-between items-center"><span>{label}</span><Icon size={20} aria-hidden="true" /></div><strong>{loading || error ? '—' : value}</strong><p>{note}</p></div>
        ))}
      </div>
      <section className="workspace-panel">
        <div className="workspace-section-heading"><div><h2>Reservations</h2><p>Every guest request, with a clear next step.</p></div><label className="workspace-search"><Search size={18} aria-hidden="true" /><input aria-label="Search reservations" value={search} onChange={event => setSearch(event.target.value)} placeholder="Guest or property" type="search" /></label></div>
        <div className="workspace-tabs" aria-label="Filter reservations">
          {tabs.map(tab => <button type="button" key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.id === 'all' ? reservations.length : counts[tab.id] || 0}</span></button>)}
        </div>
        {loading ? <div className="workspace-empty" role="status"><Loader2 className="animate-spin" size={26} /><p>Loading your reservations…</p></div> : visible.length === 0 ? <div className="workspace-empty"><Inbox size={30} aria-hidden="true" /><h3>{search ? 'No matching reservations' : 'You’re up to date'}</h3><p>{search ? 'Try another guest or property name.' : 'Reservations in this category will appear here.'}</p></div> : (
          <div className="workspace-reservations">
            {visible.map(row => <article key={row.id} className="workspace-reservation">
              {row.listing?.imageUrl ? <img src={row.listing.imageUrl} alt="" width={72} height={72} loading="lazy" decoding="async" /> : <div className="workspace-image-empty"><Building2 aria-hidden="true" /></div>}
              <div className="min-w-0 flex-1"><h3>{row.listing?.title || 'Property details unavailable'}</h3><p>{row.name || 'Guest'} · {row.moveInDate ? new Date(row.moveInDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable'}</p><span className="workspace-status">{row.status || 'Status unavailable'}</span></div>
              <div className="workspace-reservation-actions"><strong>{Number.isFinite(Number(row.totalRent)) && row.totalRent != null && row.listing?.currency ? formatPrice(Number(row.totalRent), row.listing.currency) : 'Amount unavailable'}</strong>
                {row.status?.toLowerCase() === 'pending' && <div className="flex gap-2"><button type="button" className="workspace-secondary" disabled={pendingId !== null} onClick={() => onUpdate(row.id, 'declined')}>Decline</button><button type="button" className="workspace-primary" disabled={pendingId !== null} onClick={() => onUpdate(row.id, 'confirmed')}>{pendingId === row.id ? 'Saving…' : 'Accept'}</button></div>}
                {row.status?.toLowerCase() === 'confirmed' && <div className="flex gap-2"><button type="button" className="workspace-secondary" disabled={pendingId !== null} onClick={() => { if (window.confirm('Cancel this reservation? Any required refund must be handled separately.')) void onUpdate(row.id, 'cancelled'); }}>Cancel</button><button type="button" className="workspace-secondary" disabled={pendingId !== null} onClick={() => onUpdate(row.id, 'Completed')}>Mark completed</button></div>}
              </div>
            </article>)}
          </div>
        )}
      </section>
      <section className="workspace-marketing-callout"><div><p className="workspace-eyebrow">Reach your next guest</p><h2>Turn your property into a campaign.</h2><p>Start with your listing’s photos and details. Review the audience, submit for approval and follow delivery from here.</p></div><button type="button" className="workspace-primary" onClick={onMarketing}>Open marketing<ArrowUpRight size={18} aria-hidden="true" /></button></section>
    </div>
  );
}
