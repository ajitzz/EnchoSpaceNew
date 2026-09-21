import React,{useEffect,useState} from 'react';
import type {AdtechTierCode,AdtechProfile,CanonicalMarketingPriceEvidence,StrategySelection} from '../../src/shared/adtech/contracts';
import {marketingRequest,money} from './api';
import {AdtechMap,type FeederPin} from './AdtechMap';
import './adtech.css';
export interface AudienceDefaults {provider:'META'|'GOOGLE';tier:AdtechTierCode;price:CanonicalMarketingPriceEvidence;budget:AdtechProfile['budget'];limits:AdtechProfile['hostOverrides'];selection:StrategySelection;google?:{geoMode:'PRESENCE'|'PRESENCE_OR_INTEREST';matchTypes:Array<'EXACT'|'PHRASE'>};keywordResearchLocations?:Array<{evidenceHash:string;geoTargetConstant:string}>;geography:Array<({kind:'PROVIDER_CITY_RADIUS'|'COORDINATE_RADIUS';evidenceHash:string}&FeederPin)|{kind:'PROVIDER_REGION_EXCLUSION';label:string;evidenceHash:string}>;assumptions:string[];}
export function useStrategyDefaults(listingId:string,provider:'META'|'GOOGLE',enabled:boolean){
 const [data,setData]=useState<AudienceDefaults|null>(null),[error,setError]=useState(''),[code,setCode]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setData(null);setError('');setCode('');if(!enabled||!listingId)return ()=>controller.abort();
  void marketingRequest<AudienceDefaults>(`/listings/${encodeURIComponent(listingId)}/targeting-defaults?provider=${provider}`,{signal:controller.signal}).then(value=>{
   if(value.price?.listingId!==Number(listingId)||value.provider!==provider||!value.selection||!Array.isArray(value.geography))throw new Error('Audience defaults do not match the selected property and channel.');
   if(!controller.signal.aborted)setData(value);
  }).catch(e=>{if(!controller.signal.aborted){setError(e.message);setCode(e.code??'');}});return ()=>controller.abort();
 },[listingId,provider,enabled,refresh]);
 return {data:data?.price.listingId===Number(listingId)&&data.provider===provider?data:null,error,code,reload:()=>setRefresh(n=>n+1)};
}
export function RequestAudienceResearch({listingId,provider}:{listingId:string;provider:'META'|'GOOGLE'}){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setStatus('');},[listingId,provider]);
 const request=async()=>{setBusy(true);try{const result=await marketingRequest<{state:string;review_state?:string}>(`/listings/${encodeURIComponent(listingId)}/corridor-research`,{method:'POST',body:JSON.stringify({provider})});setStatus(result.state==='DONE'?'Destination research is ready for Encho’s review. The audience becomes available after a reviewed release.':result.state==='DEAD'?'Research needs attention from Encho. Contact support to resolve the destination evidence.':'Destination research is queued. Encho will verify the feeder cities and district before your campaign can proceed.');}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}};
 return <span><button type="button" className="mkt-secondary" disabled={busy} onClick={()=>void request()}>Request verified audience plan</button>{status&&<span role="status">{status}</span>}</span>;
}
export function AdaptiveAudience({data,selection,onChange,onBudget}:{data:AudienceDefaults;selection:StrategySelection;onChange:(value:StrategySelection)=>void;onBudget:(total:string,daily:string)=>void}){
 const [search,setSearch]=useState('');
 const feeders=data.geography.filter(g=>g.kind!=='PROVIDER_REGION_EXCLUSION');
 const selected=selection.feederHashes??feeders.map(g=>g.evidenceHash);
 const pins=feeders.filter(g=>selected.includes(g.evidenceHash)).map(g=>({...g,radiusKm:selection.overrides.find(o=>o.evidenceHash===g.evidenceHash)?.radiusKm??g.radiusKm}));
 const adjust=(hash:string,radius:number)=>onChange({...selection,overrides:[...selection.overrides.filter(o=>o.evidenceHash!==hash),{evidenceHash:hash,radiusKm:radius}]});
 const totals=[data.budget.total.min,((BigInt(data.budget.total.min)+BigInt(data.budget.total.max))/2n).toString(),data.budget.total.max];
 return <section className="adt-host mkt-fields"><span className="mkt-eyebrow">Prepared for your stay</span><h4>{data.tier==='BUDGET'?'Budget-friendly':data.tier==='COMFORT'?'Comfort':'Premium'} audience plan</h4><p className="mkt-caption">Based on your verified nightly rate of {money(data.price.amountMinor)}. Audience exclusions and conversion settings are managed by Encho.</p>
  <div className="adt-actions" aria-label="Suggested campaign media budgets">{[...new Set(totals)].map(total=><button type="button" className="mkt-secondary" key={total} onClick={()=>onBudget(total,data.budget.daily.min)}>{money(total)} media</button>)}</div>
  <p className="mkt-caption">Suggested daily pacing: {money(data.budget.daily.min)}–{money(data.budget.daily.max)}. Provider daily spend may vary within the authorized flight.</p>
  {data.geography.filter(g=>g.kind==='PROVIDER_REGION_EXCLUSION').map(g=><span className="adt-lock" key={g.evidenceHash}>Excluded: {g.label} district · locked</span>)}
  <details><summary>Adjust audience locations</summary><AdtechMap pins={pins}/><label>Find an approved feeder city<input type="search" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label>
   {feeders.filter(g=>g.label.toLowerCase().includes(search.toLowerCase())).map(g=>{const included=selected.includes(g.evidenceHash),radius=selection.overrides.find(o=>o.evidenceHash===g.evidenceHash)?.radiusKm??g.radiusKm;return <div key={g.evidenceHash} className="mkt-fields"><label className="mkt-checkbox"><input type="checkbox" checked={included} disabled={!data.limits.enabled||included&&selected.length===1} onChange={e=>onChange({...selection,feederHashes:e.target.checked?[...selected,g.evidenceHash]:selected.filter(h=>h!==g.evidenceHash),overrides:selection.overrides.filter(o=>o.evidenceHash!==g.evidenceHash)})}/>{g.label}</label><label>{g.label} radius · {radius} km<input type="range" min={data.limits.minRadiusKm} max={data.limits.maxRadiusKm} step={1} value={radius} disabled={!included||!data.limits.enabled} onChange={e=>adjust(g.evidenceHash,Number(e.target.value))}/></label></div>;})}
   <p className="mkt-caption">Choose from verified feeder locations. Contact Encho to review an additional city. District exclusions cannot be removed.</p>
  </details>{data.assumptions.map(message=><p className="mkt-caption" key={message}>{message}</p>)}
 </section>;
}
