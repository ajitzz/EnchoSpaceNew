import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, Images, MapPin, Search, Sparkles } from 'lucide-react';
import { Listing } from '../types';
import { DEMO_PROPERTIES } from '../src/data/demoProperties';
import { ListingDetailsNew } from './ListingDetailsNew';
import { SanctuaryGalleryModal } from './SanctuaryGalleryModal';

/** An isolated, explicitly fictional product demonstration. Nothing here enters
 * search, inventory, messaging, checkout, marketing, or provider workflows. */
export function InvestorShowcase() {
  const [selected, setSelected] = useState<Listing | null>(null);
  const [gallery, setGallery] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'stays' | 'experiences'>('stays');
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return DEMO_PROPERTIES.filter((listing) =>
      !term || [listing.title, listing.city, listing.type, ...(listing.experience_tags || [])]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term))
    );
  }, [query]);

  const openStay = (listing: Listing) => {
    setSelected(listing);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (selected) {
    return <div className="min-h-screen bg-[#f9f8f6]">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div role="note" className="sticky top-0 z-[70] flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950 sm:px-8">
        <span>Investor concept · Fictional sample stay and illustrative imagery · Prices and experiences are examples · No reservations</span>
        <button type="button" onClick={() => setSelected(null)} className="rounded-full border border-amber-400 px-3 py-1 hover:bg-amber-100">View all 15 concepts</button>
      </div>
      <ListingDetailsNew
        listing={selected}
        demoMode
        isPreview
        onBack={() => setSelected(null)}
        similarListings={DEMO_PROPERTIES.filter((listing) => listing.id !== selected.id).slice(0, 4)}
        onListingClick={openStay}
      />
    </div>;
  }

  return <main className="min-h-screen bg-[#f7f4ed] text-[#173c32]">
    <Helmet><title>Investor concept showcase | Encho Space</title><meta name="robots" content="noindex, nofollow" /></Helmet>
    <header className="relative overflow-hidden bg-[#102a24] px-5 pb-16 pt-6 text-white sm:px-10 sm:pb-24">
      <div className="absolute -right-24 -top-40 h-96 w-96 rounded-full bg-[#c99a5d]/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft size={16} /> Encho home</a>
          <span className="rounded-full border border-[#d5ac70]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e7c695]">Investor concept · 15 sample stays</span>
        </div>
        <div className="mt-16 max-w-3xl sm:mt-24">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.32em] text-[#d5ac70]">The stay is the story</p>
          <h1 className="font-serif text-5xl leading-[1.05] sm:text-7xl">A more beautiful way to discover extraordinary stays.</h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-white/75 sm:text-lg">Explore how Encho presents rooms, spatial galleries, local experiences and thoughtful property details in one guest journey.</p>
          <p className="mt-5 max-w-2xl rounded-xl border border-amber-300/30 bg-amber-100/10 p-4 text-sm leading-6 text-amber-100">All 15 properties, photographs, amenities, experiences and rates on this page are illustrative concepts. They are not verified listings or bookable inventory.</p>
        </div>
      </div>
    </header>

    <section aria-label="Explore sample stays and experiences" className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-10">
      <div className="-mt-8 flex flex-col gap-4 rounded-2xl border border-[#e4ddcf] bg-white p-4 shadow-xl shadow-[#173c32]/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-2" role="tablist" aria-label="Showcase view">
          <button type="button" role="tab" aria-selected={view === 'stays'} onClick={() => setView('stays')} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${view === 'stays' ? 'bg-[#173c32] text-white' : 'text-[#456558] hover:bg-[#f3f0e9]'}`}>Stays</button>
          <button type="button" role="tab" aria-selected={view === 'experiences'} onClick={() => setView('experiences')} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${view === 'experiences' ? 'bg-[#173c32] text-white' : 'text-[#456558] hover:bg-[#f3f0e9]'}`}>Experience ideas</button>
        </div>
        <label className="flex min-w-0 items-center gap-3 rounded-full border border-[#ded9ce] px-4 py-2.5 text-[#658074] sm:w-80">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search sample properties</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a place or mood" className="w-full min-w-0 bg-transparent text-sm text-[#173c32] outline-none placeholder:text-[#83988c]" />
        </label>
      </div>

      <div className="mb-7 mt-14 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a47140]">Concept collection</p><h2 className="mt-2 font-serif text-4xl sm:text-5xl">{view === 'stays' ? 'Fifteen distinct escapes' : 'Experiences around the stay'}</h2></div>
        <span className="text-sm text-[#63796d]">{matches.length} sample {matches.length === 1 ? 'property' : 'properties'}</span>
      </div>

      {matches.length === 0 ? <p className="rounded-2xl bg-white p-10 text-center text-[#63796d]">No concepts match that search. Try a city or experience.</p> :
        <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((listing, index) => <article key={listing.id} className="group overflow-hidden rounded-[1.6rem] border border-[#e2ddd2] bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#173c32]/10">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#e7e3d8]">
              <img src={listing.imageUrl} alt={`Illustrative imagery for ${listing.title}`} loading={index < 3 ? 'eager' : 'lazy'} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <span className="absolute left-4 top-4 rounded-full border border-white/50 bg-[#102a24]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur">Fictional sample</span>
              <span className="absolute bottom-4 right-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#173c32]">{String(index + 1).padStart(2, '0')} / 15</span>
            </div>
            <div className="p-6">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#9c7249]"><MapPin size={13} /> {listing.city}</p>
              <h3 className="mt-2 font-serif text-2xl leading-tight">{listing.title}</h3>
              <p className="mt-2 text-sm text-[#647a6e]">{listing.type}</p>
              {view === 'experiences' ? <div className="mt-5 flex flex-wrap gap-2">{(listing.experience_tags || []).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[#f4efe5] px-3 py-1.5 text-xs text-[#745a3b]">{tag}</span>)}</div> : <p className="mt-5 text-sm"><span className="font-semibold">Illustrative from ₹{Number(listing.price).toLocaleString('en-IN')}</span><span className="text-[#71877b]"> / night</span></p>}
              <div className="mt-6 flex items-center gap-3 border-t border-[#eeeae2] pt-5">
                <button type="button" onClick={() => openStay(listing)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#173c32] px-4 py-3 text-xs font-bold text-white transition hover:bg-[#275847]">Explore concept <ArrowRight size={14} /></button>
                <button type="button" onClick={() => setGallery(listing)} aria-label={`Open ${listing.title} sample gallery`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8d1c3] transition hover:bg-[#f4efe5]"><Images size={18} /></button>
              </div>
            </div>
          </article>)}
        </div>}
    </section>
    <footer className="border-t border-[#e2ddd2] bg-[#efeadf] px-5 py-8 text-center text-xs leading-6 text-[#61786b]"><Sparkles size={14} className="mr-1 inline" /> Concept demonstration only. Availability, reviews, prices, photography and services are illustrative and must be verified before a property goes live.</footer>
    {gallery && <SanctuaryGalleryModal isOpen onClose={() => setGallery(null)} listing={gallery} demoMode onReserve={undefined} />}
  </main>;
}
