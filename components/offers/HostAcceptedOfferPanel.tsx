import React,{useCallback,useEffect,useState} from 'react';

type Room={id:number;name:string;capacity:number;min_stay_nights:number};
type Offer={offerId:string;listingId:number;roomTypeId:number;revision:number;version:number;status:string;
  amountMinor:string;currency:string;stayStart:string;stayEnd:string;effectiveFrom:string;effectiveUntil:string;
  maxGuests:number;minNights:number;submittedAt?:string|null;acceptedAt?:string|null};

function minorFromRupees(value:string):string|null{
  const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if(!match)return null;
  const minor=BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0'));
  return minor>0n&&minor<=9223372036854775807n?minor.toString():null;
}
function rupeesFromMinor(value:string):string{
  try{const amount=BigInt(value);return `₹${amount/100n}${amount%100n===0n?'':'.'+String(amount%100n).padStart(2,'0')}`;}
  catch{return 'Price unavailable';}
}
function rupeesInputFromMinor(value:string):string{
  const amount=BigInt(value);return `${amount/100n}${amount%100n===0n?'':'.'+String(amount%100n).padStart(2,'0')}`;
}
function indianDate(value:string):string{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function indianMidnight(date:string):string{return new Date(`${date}T00:00:00+05:30`).toISOString();}
function message(code:unknown):string{
  switch(code){
    case 'OFFER_STALE_REVIEW':return 'Property, room or approved media facts changed. Create a fresh revision for review.';
    case 'OFFER_VERSION_CONFLICT':case 'OFFER_STATE_CONFLICT':return 'This offer revision changed. Refresh current offers before trying again.';
    case 'OFFER_PROPERTY_INELIGIBLE':return 'The property is not currently eligible for a public room offer.';
    case 'ROOM_UNAVAILABLE':return 'The room has no available inventory in the proposed stay dates.';
    case 'LEGACY_DATA_UNRECONCILED':return 'Room or calendar data still needs canonical reconciliation before this offer can be submitted.';
    case 'OFFER_AUTHORITY_UNAVAILABLE':return 'Offer authority is temporarily unavailable. Your current offer has not changed.';
    case 'OFFER_NOT_FOUND':return 'This offer is no longer available to your account.';
    default:return 'The offer command was not accepted. Refresh current offers before trying again.';
  }
}

export function HostAcceptedOfferPanel({listingId,publicationStatus,token}:{listingId:number;publicationStatus:string;token:string}){
  const [rooms,setRooms]=useState<Room[]>([]),[offers,setOffers]=useState<Offer[]>([]);
  const [roomTypeId,setRoomTypeId]=useState(''),[amount,setAmount]=useState('');
  const [stayStart,setStayStart]=useState(''),[stayEnd,setStayEnd]=useState('');
  const [effectiveFrom,setEffectiveFrom]=useState(''),[effectiveUntil,setEffectiveUntil]=useState('');
  const [maxGuests,setMaxGuests]=useState(''),[minNights,setMinNights]=useState('');
  const [successor,setSuccessor]=useState<Offer|null>(null);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(!token)return;
    const [roomsResponse,offersResponse]=await Promise.all([
      fetch(`/api/listings/${listingId}/rooms`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal}),
      fetch(`/api/offers/v1/listings/${listingId}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal}),
    ]);
    if(!roomsResponse.ok||!offersResponse.ok)throw new Error('OFFER_AUTHORITY_UNAVAILABLE');
    const roomData=await roomsResponse.json(),offerData=await offersResponse.json();
    if(!Array.isArray(roomData.rooms)||!Array.isArray(offerData))throw new Error('OFFER_AUTHORITY_UNAVAILABLE');
    setRooms(roomData.rooms.filter((room:Room)=>Number.isSafeInteger(room.id)&&room.id>0));
    setOffers(offerData);
  },[listingId,token]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    refresh(controller.signal).catch(error=>{if(error?.name!=='AbortError')setNotice('Offer authority could not be loaded. Refresh before making changes.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[refresh]);
  const beginSuccessor=(offer:Offer)=>{
    setSuccessor(offer);setRoomTypeId(String(offer.roomTypeId));setAmount(rupeesInputFromMinor(offer.amountMinor));
    setStayStart(offer.stayStart);setStayEnd(offer.stayEnd);setEffectiveFrom(indianDate(offer.effectiveFrom));
    setEffectiveUntil(indianDate(offer.effectiveUntil));setMaxGuests(String(offer.maxGuests));setMinNights(String(offer.minNights));
    setNotice('This will create a new draft revision. The accepted price stays current until staff accepts the successor.');
  };
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    const minor=minorFromRupees(amount),selected=rooms.find(room=>String(room.id)===roomTypeId);
    if(!minor||!selected||!stayStart||!stayEnd||!effectiveFrom||!effectiveUntil||!Number.isInteger(Number(maxGuests))||Number(maxGuests)<1||!Number.isInteger(Number(minNights))||Number(minNights)<1){
      setNotice('Choose a canonical room, positive nightly amount, dates and valid guest conditions.');return;
    }
    setBusy(true);setNotice('');
    try{
      const response=await fetch(`/api/offers/v1/listings/${listingId}/drafts`,{method:'POST',headers,
        body:JSON.stringify({roomTypeId:selected.id,amountMinor:minor,stayStart,stayEnd,
          effectiveFrom:indianMidnight(effectiveFrom),effectiveUntil:indianMidnight(effectiveUntil),
          maxGuests:Number(maxGuests),minNights:Number(minNights),...(successor?{offerId:successor.offerId,expectedVersion:successor.version}:{})})});
      const data=await response.json();
      if(!response.ok){setNotice(message(data.code));return;}
      await refresh();setSuccessor(null);setAmount('');
      setNotice(`Revision ${data.revision} was saved as a draft. Submit that exact revision when ready for staff review.`);
    }catch{setNotice('The draft outcome is unknown. Refresh current offers before trying again.');}
    finally{setBusy(false);}
  };
  const submit=async(offer:Offer)=>{
    if(busy)return;setBusy(true);setNotice('');
    try{
      const response=await fetch(`/api/offers/v1/${encodeURIComponent(offer.offerId)}/revisions/${offer.revision}/submit`,{
        method:'POST',headers,body:JSON.stringify({expectedVersion:offer.version})});
      const data=await response.json();
      if(!response.ok){setNotice(message(data.code));return;}
      await refresh();setNotice(`Offer ${offer.offerId} revision ${offer.revision} was submitted for staff review.`);
    }catch{setNotice('Submission outcome is unknown. Refresh current offers before trying again.');}
    finally{setBusy(false);}
  };
  return <section aria-labelledby="accepted-offer-heading" className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-6">
    <div className="rounded-3xl border border-sky-400/30 bg-slate-900/90 p-5 sm:p-6 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="accepted-offer-heading" className="text-lg font-bold">Sellable room offers</h2>
          <p className="text-sm text-slate-300 mt-1">Set a dated nightly room price for staff review. Booking totals and taxes are determined later.</p></div>
        <button type="button" onClick={()=>{setLoading(true);refresh().catch(()=>setNotice('Offer authority could not be loaded.'))
          .finally(()=>setLoading(false));}} className="rounded-xl border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">Refresh offers</button>
      </div>
      {notice&&<p role="status" className="mt-4 rounded-xl bg-slate-800 px-3 py-2 text-sm">{notice}</p>}
      {loading?<p className="mt-4 text-sm text-slate-300">Loading offer authority…</p>:<div className="mt-5 grid gap-3">
        {offers.length===0?<p className="text-sm text-slate-300">No accepted or submitted room offers for this property.</p>:offers.map(offer=><div key={`${offer.offerId}:${offer.revision}`} className="rounded-xl border border-slate-700 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>Room #{offer.roomTypeId} · revision {offer.revision} · {offer.status}</strong><span>{rupeesFromMinor(offer.amountMinor)} per room night</span></div>
          <p className="text-slate-300 mt-1">Stay {offer.stayStart} to {offer.stayEnd} (exclusive) · Effective {indianDate(offer.effectiveFrom)} to {indianDate(offer.effectiveUntil)} (exclusive)</p>
          <p className="text-xs text-slate-400 mt-1 break-all">Offer ID {offer.offerId}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {offer.status==='DRAFT'&&<button type="button" disabled={busy} onClick={()=>submit(offer)} className="rounded-lg bg-sky-600 px-3 py-2 font-semibold disabled:opacity-50">Submit this revision</button>}
            {offer.status==='ACCEPTED'&&<button type="button" onClick={()=>beginSuccessor(offer)} className="rounded-lg border border-slate-600 px-3 py-2">Create successor revision</button>}
          </div>
        </div>)}
      </div>}
      {publicationStatus==='published'?<form onSubmit={create} className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <h3 className="sm:col-span-2 lg:col-span-4 font-semibold">{successor?`New revision of ${successor.offerId}`:'New room offer draft'}</h3>
        <label className="text-sm">Canonical room<select required disabled={Boolean(successor)} value={roomTypeId} onChange={event=>{const room=rooms.find(item=>String(item.id)===event.target.value);setRoomTypeId(event.target.value);if(room){setMaxGuests(String(room.capacity));setMinNights(String(room.min_stay_nights));}}} className="mt-1 block w-full rounded-lg bg-slate-800 p-2 disabled:opacity-50">
          <option value="">Choose room</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name} · #{room.id}</option>)}
        </select></label>
        <label className="text-sm">Proposed room-night price (INR)<input required inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="5500.00" className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Stay start<input required type="date" value={stayStart} onChange={event=>setStayStart(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Stay end (exclusive)<input required type="date" value={stayEnd} onChange={event=>setStayEnd(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Effective from<input required type="date" value={effectiveFrom} onChange={event=>setEffectiveFrom(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Effective until (exclusive)<input required type="date" value={effectiveUntil} onChange={event=>setEffectiveUntil(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Maximum guests<input required type="number" min="1" value={maxGuests} onChange={event=>setMaxGuests(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <label className="text-sm">Minimum nights<input required type="number" min="1" value={minNights} onChange={event=>setMinNights(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <div className="sm:col-span-2 lg:col-span-4 flex gap-2"><button type="submit" disabled={busy||loading||rooms.length===0} className="rounded-xl bg-sky-600 px-4 py-2 font-semibold disabled:opacity-50">Save draft revision</button>
          {successor&&<button type="button" onClick={()=>setSuccessor(null)} className="rounded-xl border border-slate-600 px-4 py-2">Cancel successor</button>}</div>
      </form>:<p className="mt-5 text-sm text-amber-200">The property must be published before a room offer can be submitted for acceptance.</p>}
    </div>
  </section>;
}
