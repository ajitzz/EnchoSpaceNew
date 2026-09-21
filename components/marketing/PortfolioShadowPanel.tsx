import React, {useEffect, useRef, useState} from 'react';
import {marketingRequest, observedTime} from './api';
type Receipt={id:string;created_at:string;evidence:{mode:'SHADOW_ONLY';blocking:false;candidateCount:number;truncated:boolean;skippedCampaignIds:number[];limitations:string[];conflicts:Array<{campaignId:number;revision:number;sharedKeywords:string[];sharedGeoConstants:string[];sharedLanguages:string[];confidence:string}>}};
/** Mounted only in the administrative campaign drawer. Inspection cannot publish or block. */
export function PortfolioShadowPanel({campaignId,revision}:{campaignId:string|number;revision:number}){
 const [receipt,setReceipt]=useState<Receipt|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function inspect(){
  const c=new AbortController();request.current?.abort();request.current=c;setBusy(true);setError('');setReceipt(null);
  try{const data=await marketingRequest<Receipt>(`/admin/campaigns/${campaignId}/portfolio-shadow`,{method:'POST',body:JSON.stringify({revision}),signal:c.signal});if(!c.signal.aborted)setReceipt(data);}
  catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Portfolio observation is unavailable.');}
  finally{if(!c.signal.aborted)setBusy(false);}
 }
 return <section className="mkt-panel" aria-label="Search portfolio shadow evidence"><span className="mkt-eyebrow">Administrator observation</span><h3>Search portfolio overlap</h3>
  <p className="mkt-caption">Shadow mode measures possible shared search intent. This inspection cannot approve, block, delay or change campaign publication or funding.</p>
  <button type="button" className="mkt-secondary" disabled={busy} onClick={()=>void inspect()}>{busy?'Inspecting portfolio…':'Inspect shadow overlap'}</button>
  <div aria-live="polite">{error&&<p role="alert">{error}</p>}{receipt&&<>
   <p className="mkt-caption">Receipt {receipt.id} · {observedTime(receipt.created_at)} · {receipt.evidence.candidateCount} candidate revisions inspected</p>
   {(receipt.evidence.truncated||receipt.evidence.skippedCampaignIds.length>0)&&<p role="status">Coverage is incomplete. The bounded observer omitted some candidates or could not establish their scope.</p>}
   {!receipt.evidence.conflicts.length&&<p>No identical normalized terms were found in the inspected scopes. Broader query overlap remains unmeasured.</p>}
   <ul className="mkt-keyword-ideas">{receipt.evidence.conflicts.map(conflict=><li key={`${conflict.campaignId}:${conflict.revision}`}><strong>Campaign {conflict.campaignId} · revision {conflict.revision}</strong><p>{conflict.sharedKeywords.join(', ')}</p><p className="mkt-caption">{conflict.confidence==='SHARED_EXPLICIT_SCOPE'?'Shared terms, explicit locations and languages.':'Shared terms; geographic or language overlap needs investigation.'}</p></li>)}</ul>
   <details className="mkt-details"><summary>Analysis limits</summary><ul>{receipt.evidence.limitations.map(text=><li key={text}>{text}</li>)}</ul></details>
   <ShadowReview key={receipt.id} assessmentId={receipt.id}/>
  </>}</div>
 </section>;
}

function ShadowReview({assessmentId}:{assessmentId:string}){
 const [verdict,setVerdict]=useState('INSUFFICIENT_EVIDENCE'),[note,setNote]=useState(''),[reference,setReference]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<string|null>(null);
 const intent=useRef<{body:string;key:string}|null>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function record(event:React.FormEvent){
  event.preventDefault();if(busy||saved)return;
  const body=JSON.stringify({verdict,note:note.trim(),evidenceReference:reference.trim()});
  if(intent.current?.body!==body)intent.current={body,key:crypto.randomUUID()};
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const result=await marketingRequest<{id:string}>(`/admin/portfolio-assessments/${assessmentId}/reviews`,{method:'POST',headers:{'Idempotency-Key':intent.current.key},body,signal:controller.signal});if(!controller.signal.aborted)setSaved(result.id);}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The review receipt could not be confirmed. Retry the same review.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <form onSubmit={event=>void record(event)} className="mkt-shadow-review" aria-label="Review shadow observation">
  <h4>Record an evidence review</h4><p className="mkt-caption">This annotation measures observer quality. It does not change either campaign.</p>
  <label>Evidence verdict<select value={verdict} disabled={busy||!!saved} onChange={e=>setVerdict(e.target.value)}><option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option><option value="CONFIRMED_OVERLAP">Confirmed overlap</option><option value="FALSE_POSITIVE">False positive</option></select></label>
  <label>Evidence reference<input value={reference} onChange={e=>setReference(e.target.value)} minLength={10} maxLength={255} required disabled={busy||!!saved}/></label>
  <label>Review notes<textarea value={note} onChange={e=>setNote(e.target.value)} minLength={20} maxLength={2000} required disabled={busy||!!saved}/></label>
  <button type="submit" className="mkt-secondary" disabled={busy||!!saved||note.trim().length<20||reference.trim().length<10}>{busy?'Recording review…':saved?'Review recorded':'Record review'}</button>
  <div aria-live="polite">{error&&<p role="alert">{error}</p>}{saved&&<p className="mkt-caption">Immutable review receipt: {saved}</p>}</div>
 </form>;
}
