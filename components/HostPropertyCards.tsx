import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, MapPin, Pencil, Search, Trash2 } from 'lucide-react';
import type { Listing } from '../types';
import { useAuth } from './AuthContext';
import { InventoryMappingStatus } from './InventoryMappingStatus';

function PropertyImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
    {src && !failed ? <img src={src} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setFailed(true)} /> : <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500"><Building2 size={32} aria-hidden="true" /><span className="text-sm">Property photo unavailable</span></div>}
  </div>;
}
function rate(listing: Listing) {
  if (listing.price == null || !Number.isFinite(Number(listing.price)) || !listing.currency || !/^[A-Z]{3}$/.test(listing.currency)) return 'Rate unavailable';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: listing.currency, maximumFractionDigits: 2 }).format(Number(listing.price));
}

export function HostPropertyCards({ listings, onEdit, onDeleted }: { listings: Listing[]; onEdit?: (listing: Listing) => void; onDeleted: (id: string) => void }) {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const locked = useRef(false);
  const visible = useMemo(() => listings.filter(listing => `${listing.title} ${listing.city || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [listings, search]);
  async function remove(listing: Listing) {
    if (locked.current) return;
    if (!token) { setError('Sign in again to manage this property.'); return; }
    if (!window.confirm(`Delete “${listing.title}”? Only unused properties can be permanently removed. Properties with linked history are retained. This action cannot be undone here.`)) return;
    locked.current = true; setPending(String(listing.id)); setError('');
    try {
      const response = await fetch(`/api/listings/${listing.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'The property could not be deleted. Please retry.');
      }
      onDeleted(String(listing.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'The property could not be deleted. Please retry.'); }
    finally { locked.current = false; setPending(null); }
  }
  return <section aria-label="Published properties">
    <div className="flex flex-wrap gap-4 items-center justify-between mb-5">
      <div><h2 className="text-xl font-semibold text-slate-900">Published properties</h2><p className="text-sm text-slate-500">Edit a property to prepare its next reviewed version.</p></div>
      <label className="workspace-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search your properties" placeholder="Property or destination" value={search} onChange={e => setSearch(e.target.value)} /></label>
    </div>
    {error && <div className="workspace-error mb-4" role="alert">{error}</div>}
    {!visible.length ? <div className="workspace-empty rounded-2xl border border-dashed border-slate-300"><Building2 size={30} aria-hidden="true" /><h3>{listings.length ? 'No matching properties' : 'Your first property starts here'}</h3><p>{listings.length ? 'Try another property name or destination.' : 'Create a property and submit it for review. Its progress appears above.'}</p></div> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
      {visible.map(listing => <article key={listing.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <PropertyImage src={listing.imageUrl} title={listing.title} />
        <div className="p-5"><h3 className="text-lg font-semibold text-slate-900 break-words">{listing.title}</h3><p className="flex items-center gap-1 mt-1 text-sm text-slate-500"><MapPin size={14} aria-hidden="true" />{listing.city || 'Location unavailable'}</p>
          <div className="my-4"><strong className="text-lg text-slate-900">{rate(listing)}</strong>{listing.currency && <span className="text-sm text-slate-500"> / night</span>}</div>
          <InventoryMappingStatus listingId={listing.id} rooms={listing.rooms} />
          <div className="flex gap-2 flex-wrap"><button type="button" className="workspace-primary flex-1" disabled={!onEdit || pending !== null} onClick={() => onEdit?.(listing)} aria-label={`Edit ${listing.title}`}><Pencil size={16} aria-hidden="true" />Edit property</button><button type="button" className="workspace-secondary" disabled={pending !== null} onClick={() => void remove(listing)} aria-label={`Delete ${listing.title}`}><Trash2 size={16} aria-hidden="true" />{pending === String(listing.id) ? 'Deleting…' : 'Delete'}</button></div>
        </div>
      </article>)}
    </div>}
  </section>;
}
