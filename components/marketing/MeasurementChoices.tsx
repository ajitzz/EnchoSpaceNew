import React,{useEffect,useRef,useState} from 'react';
import {attributionTokenPattern} from '../../src/shared/marketingAttribution';
import './measurement.css';

/** Optional first-party measurement. Rendering this component sends no visit or provider event. */
export function MeasurementChoices(){
 const [link,setLink]=useState(()=>{const u=new URL(window.location.href);return {token:u.searchParams.get('enc_ref')??'',path:u.pathname,parameters:Object.fromEntries(['gclid','gbraid','wbraid','fbclid'].flatMap(k=>u.searchParams.get(k)?[[k,u.searchParams.get(k)!]]:[]))};});
 const [choice,setChoice]=useState(()=>{try{return localStorage.getItem('encho-measurement-choice');}catch{return null;}});
 const [open,setOpen]=useState(()=>attributionTokenPattern.test(link.token)&&choice!=='declined');
 const [adData,setAdData]=useState(false),[personalization,setPersonalization]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const update=()=>{const u=new URL(window.location.href),token=u.searchParams.get('enc_ref')??'';if(attributionTokenPattern.test(token)&&(token!==link.token||u.pathname!==link.path)){setLink({token,path:u.pathname,parameters:Object.fromEntries(['gclid','gbraid','wbraid','fbclid'].flatMap(k=>u.searchParams.get(k)?[[k,u.searchParams.get(k)!]]:[]))});setOpen(choice!=='declined');setAdData(false);setPersonalization(false);}};window.addEventListener('popstate',update);window.addEventListener('encho:navigation',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('encho:navigation',update);};},[link,choice]);
 const intentKeys=useRef(new Map<string,string>());
 function remember(value:string){setChoice(value);try{localStorage.setItem('encho-measurement-choice',value);}catch{/* Optional preference storage is unavailable in this browser. */}}
 async function choose(allow:boolean){
  setBusy(true);setError('');
  try{
   if(allow||choice==='accepted'){
    const intent=JSON.stringify({allow,adData,personalization});if(!intentKeys.current.has(intent))intentKeys.current.set(intent,crypto.randomUUID());const requestId=intentKeys.current.get(intent)!;
    if(allow){const session=await fetch('/api/marketing/measurement/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!session.ok)throw new Error('Measurement is unavailable. You can continue browsing without it.');}
    const response=await fetch(`/api/marketing/measurement/${allow?'visit':'revoke'}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(allow?{eventId:requestId,token:link.token,path:link.path,parameters:adData?link.parameters:{},disclosureVersion:'encho-measurement-v1',measurement:true,adUserData:adData,personalization}:{requestId})});
    if(!response.ok)throw new Error(allow?'Measurement could not be saved. You can continue browsing without it.':'Withdrawal could not be saved. Please retry.');
    const receipt=await response.json();
    try{if(allow)sessionStorage.setItem('encho-measurement-visit',receipt.eventId);else sessionStorage.removeItem('encho-measurement-visit');}catch{/* Cookie consent still applies when optional local storage is unavailable. */}
   }
   remember(allow?'accepted':'declined');setOpen(false);intentKeys.current.clear();
   const clean=new URL(window.location.href);for(const key of ['enc_ref','gclid','gbraid','wbraid','fbclid'])clean.searchParams.delete(key);
   window.history.replaceState(window.history.state,'',clean.pathname+clean.search+clean.hash);
  }catch(e){setError(e instanceof Error?e.message:'Your choice could not be saved.');}finally{setBusy(false);}
 }
 if(!open)return choice==='accepted'?<button className="encho-measurement-settings" onClick={()=>setOpen(true)}>Measurement choices</button>:null;
 return <aside className="encho-measurement" aria-labelledby="measurement-title">
  <h2 id="measurement-title">Your measurement choices</h2>
  <p>Allow Encho to use this campaign visit for 30 days to link it to inquiries or bookings you make here? Your stay and browsing access are the same if you decline.</p>
  <label><input type="checkbox" checked={adData} disabled={busy} onChange={e=>{setAdData(e.target.checked);if(!e.target.checked)setPersonalization(false);}}/> Also allow advertising data to be sent to the campaign’s ad provider for conversion measurement.</label>
  <label><input type="checkbox" checked={personalization} disabled={!adData||busy} onChange={e=>setPersonalization(e.target.checked)}/> Also allow personalized advertising.</label>
  <p><a href="/privacy">Read our privacy policy</a>. You can withdraw permission here at any time.</p>
  {error&&<p role="alert">{error}</p>}
  <div><button disabled={busy} onClick={()=>void choose(false)}>{choice==='accepted'?'Withdraw permission':'Decline'}</button><button disabled={busy||!attributionTokenPattern.test(link.token)} onClick={()=>void choose(true)}>Allow measurement</button></div>
 </aside>;
}
