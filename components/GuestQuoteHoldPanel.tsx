import {useEffect,useMemo,useState} from 'react';
import {z} from 'zod';
import type {PublicAcceptedOffer} from '../types';
import {useAuth} from './AuthContext';

const quoteSchema=z.object({id:z.string().uuid(),offerId:z.string().uuid(),revision:z.number().int(),
  checkIn:z.string(),checkOut:z.string(),nights:z.number().int(),guestCount:z.number().int(),
  roomSubtotalMinor:z.string().regex(/^\d+$/),currency:z.literal('INR'),
  payableTotalMinor:z.null(),expiresAt:z.string()});
const holdSchema=z.object({id:z.string().uuid(),quoteId:z.string().uuid(),
  status:z.string(),expiresAt:z.string()});
type Quote=z.infer<typeof quoteSchema>;
type Hold=z.infer<typeof holdSchema>;
type Props={offer:PublicAcceptedOffer|null;checkIn:string;checkOut:string;guests:number;
  eligible:boolean;isDemo:boolean;onCheckIn:(value:string)=>void;onCheckOut:(value:string)=>void;
  onGuestCount:(value:number)=>void};

const money=(minor:string)=>{
  const amount=BigInt(minor),whole=new Intl.NumberFormat('en-IN').format(amount/100n);
  const fraction=String(amount%100n).padStart(2,'0');
  return `₹${whole}${fraction==='00'?'':`.${fraction}`}`;
};
const errorText=(code:unknown)=>{
  switch(code){
    case 'INVENTORY_CONFLICT':case 'INSUFFICIENT_INVENTORY':case 'CALENDAR_BLOCK_CONFLICT':
    case 'ROOM_UNAVAILABLE':return 'The room is no longer available for every selected night. Choose other dates.';
    case 'QUOTE_EXPIRED':return 'The quote expired. Request a fresh room subtotal.';
    case 'OFFER_STALE':case 'OFFER_UNAVAILABLE':case 'QUOTE_INVALID':
      return 'The accepted room offer changed. Refresh this stay and request a new quote.';
    case 'ITINERARY_OUT_OF_SCOPE':return 'These dates are outside this room offer.';
    case 'OCCUPANCY_EXCEEDED':return 'This room offer does not cover that many guests.';
    case 'AUTHORITY_UNAVAILABLE':return 'Verified pricing is temporarily unavailable. Please try again.';
    default:return 'We could not verify this request. Please try again.';
  }
};
const readSaved=(key:string):Record<string,string>=>{
  try{const value=sessionStorage.getItem(key);return value?JSON.parse(value) as Record<string,string>:{};}
  catch{return {};}
};
const save=(key:string,value:Record<string,string>)=>{
  try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* Private mode may block storage; server remains authoritative. */}
};

/** W2 presents a server-confirmed room subtotal and an expiring inventory hold.
 * No action in this component pays, confirms a booking, or computes taxes. */
export function GuestQuoteHoldPanel({offer,checkIn,checkOut,guests,eligible,isDemo,onCheckIn,onCheckOut,onGuestCount}:Props){
  const {user,token}=useAuth();
  const key=useMemo(()=>`encho:quote-hold:${user?.id??'guest'}:${offer?.offerId??'none'}:${offer?.revision??0}:${checkIn}:${checkOut}:${guests}`,
    [user?.id,offer?.offerId,offer?.revision,checkIn,checkOut,guests]);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [hold,setHold]=useState<Hold|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [now,setNow]=useState(0);
  const headers=useMemo(()=>token?{'Authorization':`Bearer ${token}`}:{},[token]);
  const activeQuote=quote!==null&&Date.parse(quote.expiresAt)>now;
  const activeHold=hold?.status==='ACTIVE'&&Date.parse(hold.expiresAt)>now;

  useEffect(()=>{
    if(!quote&&!hold)return;
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[quote,hold]);

  useEffect(()=>{
    let active=true;
    setQuote(null);setHold(null);setMessage('');
    if(!offer||isDemo)return()=>{active=false;};
    const stored=readSaved(key);
    const restore=async()=>{
      try{
        if(stored.quoteId){
          const response=await fetch(`/api/v2/stays/quotes/${encodeURIComponent(stored.quoteId)}`,
            {credentials:'include',headers});
          const body=await response.json() as {quote?:unknown};
          const parsed=quoteSchema.safeParse(body.quote);
          if(active&&response.ok&&parsed.success)setQuote(parsed.data);
        }
        if(stored.holdId){
          const response=await fetch(`/api/v2/stays/holds/${encodeURIComponent(stored.holdId)}`,
            {credentials:'include',headers});
          const body=await response.json() as {hold?:unknown};
          const parsed=holdSchema.safeParse(body.hold);
          if(active&&response.ok&&parsed.success)setHold(parsed.data);
        }
      }catch{/* A transient read error does not manufacture a confirmed hold. */}
    };
    void restore();
    return()=>{active=false;};
  },[key,offer?.offerId,isDemo,headers]);

  const post=async(path:string,body:Record<string,unknown>)=>{
    const response=await fetch(path,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    const data=await response.json() as Record<string,unknown>;
    if(!response.ok)throw new Error(errorText(data.code));
    return data;
  };
  const requestQuote=async()=>{
    if(!offer||!eligible||busy)return;
    setBusy(true);setMessage('');
    const stored=readSaved(key),requestId=stored.requestId||crypto.randomUUID();
    save(key,{...stored,requestId});
    try{
      const response=await post('/api/v2/stays/quotes',{offerId:offer.offerId,revision:offer.revision,
        checkIn,checkOut,guestCount:guests,requestId});
      const parsed=quoteSchema.safeParse(response.quote);
      if(!parsed.success)throw new Error('The quote response could not be verified. Try again.');
      setQuote(parsed.data);setHold(null);
      save(key,{...readSaved(key),quoteId:parsed.data.id});
    }catch(error){setMessage(error instanceof Error?error.message:'Quote temporarily unavailable.');}
    finally{setBusy(false);}
  };
  const requestHold=async()=>{
    if(!quote||!activeQuote||busy)return;
    setBusy(true);setMessage('');
    const stored=readSaved(key),idempotencyKey=stored.holdRequestId||crypto.randomUUID();
    save(key,{...stored,holdRequestId:idempotencyKey});
    try{
      const response=await post('/api/v2/stays/holds',{quoteId:quote.id,idempotencyKey});
      const parsed=holdSchema.safeParse({
        ...(response.hold&&typeof response.hold==='object'?response.hold:{}),quoteId:quote.id});
      if(!parsed.success)throw new Error('The hold response could not be verified. Check again shortly.');
      setHold(parsed.data);save(key,{...readSaved(key),holdId:parsed.data.id});
    }catch(error){setMessage(error instanceof Error?error.message:'Temporary hold unavailable.');}
    finally{setBusy(false);}
  };
  const release=async()=>{
    if(!hold||!activeHold||busy)return;
    setBusy(true);setMessage('');
    try{
      await post(`/api/v2/stays/holds/${encodeURIComponent(hold.id)}/release`,{});
      setHold({...hold,status:'RELEASED'});
    }catch(error){setMessage(error instanceof Error?error.message:'Could not release the hold.');}
    finally{setBusy(false);}
  };
  const resetExpired=()=>{
    try{sessionStorage.removeItem(key);}catch{/* Storage is optional. */}
    setQuote(null);setHold(null);setMessage('');
  };
  if(isDemo)return null;
  return <section aria-label="Room quote and temporary hold" className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm">
    <h3 className="text-base font-semibold">Check this room</h3>
    <p className="mt-1 text-xs text-zinc-600">A quote shows the verified room subtotal. A temporary hold is not a booking or payment.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
      <label className="text-xs font-medium">Arrival date<input aria-label="Quote check-in" type="date" value={checkIn}
        onChange={event=>onCheckIn(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 p-2" /></label>
      <label className="text-xs font-medium">Departure date<input aria-label="Quote check-out" type="date" min={checkIn}
        value={checkOut} onChange={event=>onCheckOut(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 p-2" /></label>
      <label className="col-span-2 text-xs font-medium">Guests<input aria-label="Quote guests" type="number" min={1}
        max={offer?.maxGuests??10} value={guests}
        onChange={event=>onGuestCount(Number(event.target.value))}
        className="mt-1 w-full rounded-lg border border-zinc-300 p-2" /></label>
    </div>
    {!eligible&&<p className="mt-3 text-sm text-amber-800">Select an eligible room, dates and guest count to request a quote.</p>}
    {eligible&&!quote&&!activeHold&&<button type="button" disabled={busy} onClick={()=>void requestQuote()}
      className="mt-3 min-h-11 w-full rounded-xl bg-zinc-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
      {busy?'Checking…':'Get verified room subtotal'}</button>}
    {activeQuote&&quote&&<div className="mt-3 space-y-2" role="status">
      <p className="text-lg font-semibold">Room subtotal: {money(quote.roomSubtotalMinor)}</p>
      <p className="text-xs text-zinc-600">{quote.nights} night{quote.nights===1?'':'s'} · {quote.guestCount} guest{quote.guestCount===1?'':'s'} · Taxes and final payable total are not yet available.</p>
      <p className="text-xs text-zinc-600">Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}.</p>
      {!hold&&<button type="button" disabled={busy} onClick={()=>void requestHold()}
        className="min-h-11 w-full rounded-xl bg-emerald-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {busy?'Checking inventory…':'Temporarily hold this room'}</button>}
    </div>}
    {hold&&<div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm" role="status">
      {activeHold?<>Temporarily held until {new Date(hold.expiresAt).toLocaleTimeString()}. This is not a confirmed booking.
        <button type="button" disabled={busy} onClick={()=>void release()}
          className="mt-2 block min-h-11 rounded-lg border border-emerald-800 px-3 text-sm font-semibold disabled:opacity-50">Release hold</button></>
        :`Hold ${Date.parse(hold.expiresAt)<=now?'expired':hold.status.toLowerCase()}. Request a fresh quote if you still want this room.`}
    </div>}
    {((quote&&!activeQuote&&!activeHold)||(hold&&!activeHold))&&<button type="button" onClick={resetExpired}
      className="mt-3 min-h-11 w-full rounded-xl border border-zinc-400 px-4 py-2 font-semibold">
      Request a fresh quote</button>}
    {message&&<p className="mt-3 text-sm text-rose-800" role="alert">{message}</p>}
  </section>;
}
