import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FilePenLine, LockKeyhole, MapPin, Search, X } from 'lucide-react';
import type { Listing } from '../../types';

type DraftListing = Listing;

type DraftFields = {
  title: string;
  description: string;
  type: string;
  city: string;
  address: string;
  amenities: string;
  lat: string;
  lng: string;
  rental_mode: string;
  raw_rules: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
};

type DraftPatch = Record<string, string | number | string[] | null>;

export interface AdminDraftPropertyEditorProps {
  listing: Listing;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

const initialFields = (listing: DraftListing): DraftFields => ({
  title: listing.title ?? '',
  description: listing.description ?? '',
  type: listing.type ?? '',
  city: listing.city ?? '',
  address: listing.address ?? '',
  amenities: Array.isArray(listing.amenities) ? listing.amenities.join(', ') : '',
  lat: listing.lat == null ? '' : String(listing.lat),
  lng: listing.lng == null ? '' : String(listing.lng),
  rental_mode: listing.rental_mode ?? '',
  raw_rules: listing.raw_rules ?? '',
  seo_title: listing.seo_title ?? '',
  seo_description: listing.seo_description ?? '',
  seo_keywords: listing.seo_keywords ?? ''
});

const textFields = ['title', 'description', 'type', 'city', 'address'] as const;
const optionalAdvancedTextFields = ['raw_rules', 'seo_title', 'seo_description', 'seo_keywords'] as const;

/** Admin corrections are field-scoped and draft-only. The server remains the authority. */
export const AdminDraftPropertyEditor: React.FC<AdminDraftPropertyEditorProps> = ({ listing, token, onClose, onSaved }) => {
  const [source, setSource] = useState<DraftListing | null>(null);
  const original = useMemo(() => initialFields(source ?? listing), [source, listing]);
  const [fields, setFields] = useState<DraftFields>(() => initialFields(listing));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const savingRef = useRef(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const beforeDiscardFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) returnFocusRef.current = active;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!token) {
      setError('Your Admin session is unavailable. Sign in again before editing.');
      setLoading(false);
      return () => controller.abort();
    }
    const loadCanonical = async () => {
      try {
        const response = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        const value: unknown = await response.json().catch(() => null);
        if (!response.ok || typeof value !== 'object' || value === null || !('id' in value) || String(value.id) !== String(listing.id)) {
          throw new Error('Could not load the authoritative property. Close and reopen this editor.');
        }
        const canonical = value as DraftListing;
        if (canonical.publication_status !== 'draft') {
          throw new Error('This property is no longer a draft. A reviewed successor is required.');
        }
        setSource(canonical);
        setFields(initialFields(canonical));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the property.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadCanonical();
    return () => controller.abort();
  }, [listing.id, token]);

  useEffect(() => {
    if (source) firstInputRef.current?.focus();
  }, [source]);

  useEffect(() => {
    if (showDiscardConfirm) keepEditingRef.current?.focus();
  }, [showDiscardConfirm]);

  const setField = (key: keyof DraftFields, value: string) => {
    setFields(current => ({ ...current, [key]: value }));
    setError(null);
  };

  const hasChanges = Object.keys(fields).some(key => fields[key as keyof DraftFields] !== original[key as keyof DraftFields]);

  const buildPatch = (): DraftPatch => {
    const patch: DraftPatch = {};
    for (const key of textFields) {
      if (fields[key] !== original[key]) patch[key] = fields[key].trim();
    }
    for (const key of optionalAdvancedTextFields) {
      if (fields[key] !== original[key]) patch[key] = fields[key].trim() || null;
    }
    if (fields.rental_mode !== original.rental_mode) {
      if (!['entire_place', 'private_rooms', 'hybrid'].includes(fields.rental_mode)) {
        throw new Error('Choose a valid rental mode.');
      }
      patch.rental_mode = fields.rental_mode;
    }
    if (fields.lat !== original.lat || fields.lng !== original.lng) {
      const latText = fields.lat.trim();
      const lngText = fields.lng.trim();
      if (Boolean(latText) !== Boolean(lngText)) {
        throw new Error('Set both latitude and longitude, or clear both.');
      }
      const decimal = /^-?\d+(?:\.\d+)?$/;
      if ((latText && !decimal.test(latText)) || (lngText && !decimal.test(lngText))) {
        throw new Error('Enter latitude and longitude as decimal numbers.');
      }
      const lat = latText ? Number(latText) : null;
      const lng = lngText ? Number(lngText) : null;
      if ((lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
          (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
        throw new Error('Latitude must be between -90 and 90; longitude must be between -180 and 180.');
      }
      // Coordinates are one fact: compare-and-swap both values when either changes.
      patch.lat = lat;
      patch.lng = lng;
    }
    if (fields.amenities !== original.amenities) {
      const amenities = fields.amenities.split(',').map(item => item.trim()).filter(Boolean);
      const seen = new Set<string>();
      const uniqueAmenities = amenities.filter(item => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (uniqueAmenities.length > 80 || amenities.some(item => item.length > 100)) {
        throw new Error('Use at most 80 amenities, each under 100 characters.');
      }
      patch.amenities = uniqueAmenities;
    }
    for (const key of ['title', 'type', 'city', 'address'] as const) {
      if (key in patch && !String(patch[key]).trim()) throw new Error(`${key} cannot be empty.`);
    }
    return patch;
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!source || source.publication_status !== 'draft') {
      setError('This property is no longer a draft. Reload its current state before requesting a reviewed correction.');
      return;
    }
    if (!token) {
      setError('Your Admin session is unavailable. Sign in again before saving.');
      return;
    }
    let patch: DraftPatch;
    try {
      patch = buildPatch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please check the property fields.');
      setAdvancedOpen(true);
      return;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const sourceFields = source as unknown as Record<string, unknown>;
    const expectedCurrent: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      if (!Object.prototype.hasOwnProperty.call(sourceFields, key) || sourceFields[key] === undefined) {
        setError(`The current ${key.replaceAll('_', ' ')} value was not supplied. Reload this property before editing it.`);
        return;
      }
      expectedCurrent[key] = sourceFields[key];
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/listings/${encodeURIComponent(listing.id)}/draft-property`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, expected_current: expectedCurrent })
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'The property could not be saved. Reload its current state and try again.';
        setError(reason);
        return;
      }
      onSaved();
    } catch {
      setError('The save outcome is unknown. Reload the property before trying again so a concurrent change is not overwritten.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (savingRef.current) return;
    if (!hasChanges) {
      onClose();
      return;
    }
    const active = document.activeElement;
    beforeDiscardFocusRef.current = active instanceof HTMLElement ? active : null;
    setShowDiscardConfirm(true);
  };

  const keepEditing = () => {
    setShowDiscardConfirm(false);
    window.setTimeout(() => {
      if (beforeDiscardFocusRef.current?.isConnected) beforeDiscardFocusRef.current.focus();
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ?? [])
      .filter(element => !element.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDiscardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      keepEditing();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = discardDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (!buttons?.length) return;
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      event.preventDefault();
      buttons[0].focus();
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-hidden={showDiscardConfirm || undefined} aria-labelledby="admin-draft-property-title" onKeyDown={handleKeyDown} className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-[0_30px_100px_rgba(15,23,42,.35)]">
        <header className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700"><FilePenLine size={15} /> Property authority</div>
            <h2 id="admin-draft-property-title" className="text-xl font-semibold text-slate-950 sm:text-2xl">Edit draft property</h2>
            <p className="mt-1 text-sm text-slate-600">Correct the guest-facing facts for {listing.title}. Published and unlisted offers require a reviewed successor.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={saving} aria-label="Close property editor" className="rounded-full p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"><X size={20} /></button>
        </header>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><LockKeyhole size={18} className="mt-0.5 shrink-0" /><p>Only changed fields are sent. Room capacity and prices, photos, publication state and booked terms need their own reviewed workflows.</p></div>
            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
            {loading && <p role="status" className="text-sm text-slate-600">Loading current property facts…</p>}
            <fieldset disabled={loading || !source || saving} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
              <label className="sm:col-span-2"> <span className="mb-1 block text-sm font-medium text-slate-800">Property title</span><input ref={firstInputRef} value={fields.title} onChange={event => setField('title', event.target.value)} maxLength={255} required className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
              <label className="sm:col-span-2"> <span className="mb-1 block text-sm font-medium text-slate-800">Guest description</span><textarea value={fields.description} onChange={event => setField('description', event.target.value)} maxLength={20000} rows={4} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
              <label> <span className="mb-1 block text-sm font-medium text-slate-800">Property type</span><input value={fields.type} onChange={event => setField('type', event.target.value)} maxLength={50} required className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
              <label> <span className="mb-1 block text-sm font-medium text-slate-800">City</span><input value={fields.city} onChange={event => setField('city', event.target.value)} maxLength={100} required className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
              <label className="sm:col-span-2"> <span className="mb-1 block text-sm font-medium text-slate-800">Address · private management detail</span><input value={fields.address} onChange={event => setField('address', event.target.value)} maxLength={255} required className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
            </fieldset>
            <fieldset disabled={loading || !source || saving} className="disabled:opacity-60"><label className="block"><span className="mb-1 block text-sm font-medium text-slate-800">Amenities</span><textarea value={fields.amenities} onChange={event => setField('amenities', event.target.value)} rows={2} placeholder="Wi-Fi, Pool, Breakfast" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /><span className="mt-1 block text-xs text-slate-500">Separate amenities with commas. Only confirmed amenities should appear in the guest view.</span></label></fieldset>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <button type="button" aria-expanded={advancedOpen} aria-controls="admin-advanced-draft-facts" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100 sm:px-5">
                <span><span className="block text-sm font-semibold text-slate-900">Advanced draft facts</span><span className="block text-xs text-slate-600">Location, rental mode, house rules, and search details</span></span>
                <ChevronDown size={18} className={`shrink-0 text-slate-600 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <div id="admin-advanced-draft-facts" hidden={!advancedOpen} className="space-y-5 border-t border-slate-200 bg-white px-4 py-5 sm:px-5">
                <fieldset disabled={loading || !source || saving} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
                  <legend className="col-span-full mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><MapPin size={16} aria-hidden="true" /> Location coordinates</legend>
                  <p className="col-span-full -mt-2 text-xs text-slate-600">Set both coordinates together, or clear both. Check the pin against the property address.</p>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">Latitude</span><input type="text" inputMode="decimal" value={fields.lat} onChange={event => setField('lat', event.target.value)} placeholder="-90 to 90" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">Longitude</span><input type="text" inputMode="decimal" value={fields.lng} onChange={event => setField('lng', event.target.value)} placeholder="-180 to 180" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                </fieldset>
                <fieldset disabled={loading || !source || saving} className="grid gap-4 disabled:opacity-60">
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">Rental mode</span><select value={fields.rental_mode} onChange={event => setField('rental_mode', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"><option value="" disabled>Select rental mode</option><option value="entire_place">Entire place</option><option value="private_rooms">Private rooms</option><option value="hybrid">Entire place and private rooms</option></select></label>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">House rules</span><textarea value={fields.raw_rules} onChange={event => setField('raw_rules', event.target.value)} maxLength={8000} rows={4} placeholder="Enter only confirmed rules" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                </fieldset>
                <fieldset disabled={loading || !source || saving} className="grid gap-4 disabled:opacity-60">
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><Search size={16} aria-hidden="true" /> Search details</legend>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">SEO title</span><input value={fields.seo_title} onChange={event => setField('seo_title', event.target.value)} maxLength={255} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">SEO description</span><textarea value={fields.seo_description} onChange={event => setField('seo_description', event.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                  <label><span className="mb-1 block text-sm font-medium text-slate-800">SEO keywords</span><input value={fields.seo_keywords} onChange={event => setField('seo_keywords', event.target.value)} maxLength={1000} placeholder="Comma-separated, evidence-based terms" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
                </fieldset>
              </div>
            </section>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
            <span className="text-xs text-slate-500">Draft #{listing.id} · Changes are audit logged</span>
            <div className="flex gap-2"><button type="button" onClick={requestClose} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={!source || !hasChanges || saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"><Check size={16} />{saving ? 'Saving…' : 'Save draft changes'}</button></div>
          </footer>
        </form>
      </div>
    </div>
    {showDiscardConfirm && (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
        <div ref={discardDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="admin-discard-title" aria-describedby="admin-discard-description" onKeyDown={handleDiscardKeyDown} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertCircle size={21} aria-hidden="true" /></div>
          <h3 id="admin-discard-title" className="text-lg font-semibold text-slate-950">Discard unsaved changes?</h3>
          <p id="admin-discard-description" className="mt-2 text-sm text-slate-600">Your draft edits have not been saved.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={keepEditingRef} type="button" onClick={keepEditing} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Keep editing</button>
            <button type="button" onClick={() => { setShowDiscardConfirm(false); onClose(); }} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">Discard changes</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default AdminDraftPropertyEditor;
