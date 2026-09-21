import React,{useEffect,useRef,useState} from 'react';
import {marketingRequest,money,observedTime} from './api';
import {Notice} from './StudioShared';

type Scenario={currency:string;nightlyRateMinor:string;grossBookingRevenueMinor:string;contributionBeforeAdvertisingMinor:string;plannedAcquisitionCostMinor:string;breakEvenAcquisitionCostMinor:string;dailyScenarioRangeMinor:{low:string;high:string};warning:string;explanation:string};
export function EconomicsPreflight({listingId,mediaBudgetMinor,flightDays}:{listingId:number;mediaBudgetMinor:string;flightDays:number}){
 const [nights,setNights]=useState('2'),[margin,setMargin]=useState(''),[bookings,setBookings]=useState('1');
 const [result,setResult]=useState<Scenario|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 function changed(){pending.current?.abort();setBusy(false);setResult(null);setError('');}
 async function calculate(){
  changed();const abort=new AbortController();pending.current=abort;setBusy(true);
  try{const value=await marketingRequest<Scenario>('/preflight/economics',{method:'POST',signal:abort.signal,body:JSON.stringify({listingId,mediaBudgetMinor,flightDays,nightsPerBooking:Number(nights),retainedMarginBps:Math.round(Number(margin)*100),targetBookings:Number(bookings)})});if(!abort.signal.aborted)setResult(value);}
  catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Planning could not be calculated.');}
  finally{if(!abort.signal.aborted)setBusy(false);}
 }
 return <section className="mkt-panel mkt-preflight" aria-label="Campaign economics scenario"><span className="mkt-eyebrow">Plan before spending</span><h3>What would break-even require?</h3><p className="mkt-caption">Uses the property’s current nightly rate. Enter your assumptions; this does not forecast bookings or change your budget.</p>
  <div className="mkt-fields"><label>Nights per booking<input type="number" min="1" max="90" value={nights} onChange={e=>{changed();setNights(e.target.value);}}/></label><label>Retained margin after stay costs, commission and taxes (%)<input type="number" min="0" max="100" step="0.01" value={margin} onChange={e=>{changed();setMargin(e.target.value);}}/></label><label>Target bookings for this flight<input type="number" min="1" max="1000" value={bookings} onChange={e=>{changed();setBookings(e.target.value);}}/></label></div>
  <button type="button" className="mkt-secondary" disabled={busy||margin===''||!nights||!bookings||flightDays<2||flightDays>90} onClick={()=>void calculate()}>{busy?'Calculating scenario…':'Calculate planning scenario'}</button>
  {error&&<Notice error>{error}</Notice>}{result&&<><dl className="mkt-review-list"><div><dt>Canonical nightly rate</dt><dd>{money(result.nightlyRateMinor,result.currency)}</dd></div><div><dt>Contribution per assumed booking</dt><dd>{money(result.contributionBeforeAdvertisingMinor,result.currency)}</dd></div><div><dt>Planned media cost per target booking</dt><dd>{money(result.plannedAcquisitionCostMinor,result.currency)}</dd></div><div><dt>Break-even acquisition cost before advertising fees</dt><dd>{money(result.breakEvenAcquisitionCostMinor,result.currency)}</dd></div><div><dt>Daily media scenario · 25–50% of contribution</dt><dd>{money(result.dailyScenarioRangeMinor.low,result.currency)} – {money(result.dailyScenarioRangeMinor.high,result.currency)}</dd></div></dl><Notice error={result.warning!=='SCENARIO_ONLY'}>{result.warning==='ABOVE_BREAK_EVEN'?'This budget exceeds the contribution from your target bookings. Revisit your assumptions before spending. ':result.warning==='NO_CONTRIBUTION'?'These assumptions leave no contribution available for advertising. ':''}{result.explanation}</Notice></>}
 </section>;
}
export function PortfolioPreflight({campaignId,revision}:{campaignId:string|number;revision:number}){
 const [value,setValue]=useState<{status:string;observedAt:string|null;message:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();setValue(null);setError('');void marketingRequest<{status:string;observedAt:string|null;message:string}>(`/campaigns/${campaignId}/preflight?revision=${revision}`,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setValue(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[campaignId,revision]);
 return <section className="mkt-panel"><span className="mkt-eyebrow">Search planning · advisory</span><h3>Portfolio context</h3>{error?<Notice>{error}</Notice>:value?<><p>{value.message}</p><p className="mkt-caption">Observed: {observedTime(value.observedAt)}. Publication and funding remain governed by their existing checks.</p></>:<p className="mkt-caption">Loading the latest portfolio observation…</p>}</section>;
}
