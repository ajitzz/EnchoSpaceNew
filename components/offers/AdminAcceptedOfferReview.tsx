import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {Listing} from '../../types';

type Offer={offerId:string;listingId:number;roomTypeId:number;revision:number;version:number;status:string;
  amountMinor:string;currency:string;priceBasis:string;stayStart:string;stayEnd:string;effectiveFrom:string;
  effectiveUntil:string;maxGuests:number;minNights:number;sourceHash:string;mediaHash:string;submittedAt?:string|null};

function amountLabel(value:string,currency:string):string{
  try{const minor=BigInt(value);return `${currency} ${minor/100n}${minor%100n===0n?'':'.'+String(minor%100n).padStart(2,'0')}`;}
  catch{return 'Price unavailable';}
}
function indianDate(value:string):string{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function AdminAcceptedOfferReview({listings}:{listings:Listing[]}){
  const [listingId,setListingId]=useState(()=>{
    if(typeof window==='undefined')return '';
    const value=new URLSearchParams(window.location.search).get('offerListingId')??'';
    return /^[1-9]\d*$/.test(value)?value:'';
  });
  const [offers,setOffers]=useState<Offer[]>([]),[accepted,setAccepted]=useState<Offer[]>([]);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [pendingRetirement,setPendingRetirement]=useState('');
  const requestSequence=useRef(0);
  const refresh=useCallback(async()=>{
    const requestId=++requestSequence.current;
    setOffers([]);setAccepted([]);setPendingRetirement('');
    if(!/^[1-9]\d*$/.test(listingId)){setLoading(false);setNotice('');return;}
    setLoading(true);setNotice('');
    try{
      const base=`/api/operations/v1/offers/listings/${encodeURIComponent(listingId)}`;
      const [response,acceptedResponse]=await Promise.all(['submitted','accepted'].map(kind=>
        fetch(`${base}/${kind}`,{credentials:'include',cache:'no-store'})));
      const [data,acceptedData]=await Promise.all([response.json(),acceptedResponse.json()]);
      if(requestSequence.current!==requestId)return;
      if(!response.ok||!acceptedResponse.ok){setOffers([]);setAccepted([]);setNotice(response.status===401||acceptedResponse.status===401?'Sign in to the staff workspace to review offers.':
        'Submitted offer authority is unavailable. Refresh staff access and try again.');return;}
      if(!Array.isArray(data)||!Array.isArray(acceptedData))throw new Error('INVALID_PROJECTION');
      setOffers(data);setAccepted(acceptedData);setPendingRetirement('');
    }catch{if(requestSequence.current===requestId){setOffers([]);setAccepted([]);setNotice('Offer authority could not be loaded.');}}
    finally{if(requestSequence.current===requestId)setLoading(false);}
  },[listingId]);
  useEffect(()=>{void refresh();},[refresh]);
  const accept=async(offer:Offer)=>{
    if(busy)return;setBusy(true);setNotice('');
    try{
      const response=await fetch(`/api/operations/v1/offers/${encodeURIComponent(offer.offerId)}/revisions/${offer.revision}/accept`,{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'},
        body:JSON.stringify({expectedVersion:offer.version})});
      const data=await response.json();
      if(!response.ok){setNotice(data.code==='OFFER_STALE_REVIEW'||data.code==='OFFER_PROPERTY_INELIGIBLE'||data.code==='ROOM_UNAVAILABLE'
        ?'Submitted facts changed. The Host must create and submit a fresh revision.'
        :data.code==='OFFER_VERSION_CONFLICT'||data.code==='OFFER_STATE_CONFLICT'
        ?'Offer version or state changed. Refresh current authority before deciding.'
        :data.code==='STAFF_SESSION_REQUIRED'?'Sign in to the staff workspace before accepting offers.'
        :'The exact revision was not accepted. Refresh the queue and current authority.');return;}
      await refresh();setNotice(`Offer ${offer.offerId} revision ${offer.revision} accepted.`);
    }catch{setNotice('Acceptance outcome is unknown. Refresh the queue before another action.');}
    finally{setBusy(false);}
  };
  const retire=async(offer:Offer)=>{
    if(busy)return;setBusy(true);setNotice('');
    try{
      const response=await fetch(`/api/operations/v1/offers/${encodeURIComponent(offer.offerId)}/revisions/${offer.revision}/retire`,{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'},
        body:JSON.stringify({expectedVersion:offer.version})});
      const data=await response.json();
      if(!response.ok){setNotice(data.code==='OFFER_VERSION_CONFLICT'||data.code==='OFFER_STATE_CONFLICT'
        ?'Accepted authority changed. Refresh before requesting retirement again.'
        :'Retirement was not committed. Refresh current authority before trying again.');return;}
      await refresh();setNotice(`Offer ${offer.offerId} revision ${offer.revision} retired.`);
    }catch{setNotice('Retirement outcome is unknown. Refresh current authority before another action.');}
    finally{setBusy(false);}
  };
  return <section aria-labelledby="sellable-offer-review-heading" className="mb-8 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-6">
    <h2 id="sellable-offer-review-heading" className="text-xl font-bold text-slate-900">Sellable offer review</h2>
    <p className="mt-1 text-sm text-slate-700">Review the Host’s exact submitted room price and date scope. Only a current staff session with scoped offer authority can accept it.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-52 flex-1 text-sm font-medium text-slate-800">Property ID
        <input value={listingId} onChange={event=>setListingId(event.target.value)} inputMode="numeric" pattern="[1-9][0-9]*"
          list="offer-property-suggestions" placeholder="Enter exact property ID"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2" />
      </label>
      <datalist id="offer-property-suggestions">{listings.map(listing=><option key={listing.id} value={String(listing.id)}>{listing.title}</option>)}</datalist>
      <button type="button" onClick={()=>void refresh()} disabled={!listingId||loading} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold disabled:opacity-50">Refresh submissions</button>
    </div>
    {notice&&<p role="status" className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">{notice}</p>}
    {loading?<p className="mt-4 text-sm">Loading offers…</p>:listingId&&offers.length===0&&!notice?<p className="mt-4 text-sm text-slate-700">No submitted offer revisions for this property.</p>:null}
    <div className="mt-4 grid gap-3">{offers.map(offer=><article key={`${offer.offerId}:${offer.revision}`} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2"><strong>Room #{offer.roomTypeId} · revision {offer.revision}</strong><strong>{amountLabel(offer.amountMinor,offer.currency)} per room night</strong></div>
      <p className="mt-2">Stay {offer.stayStart} to {offer.stayEnd} (exclusive) · Effective {indianDate(offer.effectiveFrom)} to {indianDate(offer.effectiveUntil)} (exclusive)</p>
      <p>Up to {offer.maxGuests} guests · Minimum {offer.minNights} nights · {offer.priceBasis}</p>
      <dl className="mt-3 text-xs break-all text-slate-600"><dt>Offer identity</dt><dd>{offer.offerId}</dd><dt>Property and room fact hash</dt><dd>{offer.sourceHash}</dd><dt>Approved media hash</dt><dd>{offer.mediaHash}</dd></dl>
      <button type="button" disabled={busy||offer.status!=='SUBMITTED'} onClick={()=>void accept(offer)} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Accept exact revision</button>
    </article>)}</div>
    {accepted.length>0&&<div className="mt-6 grid gap-3"><h3 className="font-semibold text-slate-900">Currently accepted authority</h3>
      {accepted.map(offer=>{const key=`${offer.offerId}:${offer.revision}`;return <article key={key} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2"><strong>Room #{offer.roomTypeId} · revision {offer.revision}</strong><strong>{amountLabel(offer.amountMinor,offer.currency)} per room night</strong></div>
        <p className="mt-2">Stay {offer.stayStart} to {offer.stayEnd} (exclusive) · Effective {indianDate(offer.effectiveFrom)} to {indianDate(offer.effectiveUntil)} (exclusive)</p>
        <p className="mt-1 break-all text-xs">Offer ID {offer.offerId}</p>
        {pendingRetirement===key?<div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p>Retiring this exact revision removes its public price authority unless another eligible offer exists.</p>
          <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={()=>void retire(offer)} className="rounded-lg bg-red-800 px-3 py-2 font-semibold text-white disabled:opacity-50">Confirm retirement</button>
            <button type="button" onClick={()=>setPendingRetirement('')} className="rounded-lg border border-slate-400 px-3 py-2">Cancel</button></div></div>
          :<button type="button" disabled={busy} onClick={()=>setPendingRetirement(key)} className="mt-3 rounded-lg border border-red-400 px-3 py-2 font-semibold text-red-800 disabled:opacity-50">Retire exact revision</button>}
      </article>;})}</div>}
  </section>;
}
