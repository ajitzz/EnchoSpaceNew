import React,{useEffect,useState} from 'react';
import {marketingRequest} from './api';
import {AdtechMap} from './AdtechMap';
export function AdtechInference({run,busy}:{run:(path:string,body:unknown,method?:string)=>Promise<any>;busy:boolean}){
 const [data,setData]=useState<any>(null),[catalog,setCatalog]=useState<any>(null),[error,setError]=useState(''),[reasons,setReasons]=useState<Record<number,string>>({}),[retryReasons,setRetryReasons]=useState<Record<number,string>>({});
 const load=async()=>{try{const [research,corridors]=await Promise.all([marketingRequest('/admin/adtech/inference'),marketingRequest('/admin/adtech/corridors')]);setData(research);setCatalog(corridors);setError('');}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[]);
 const review=async(p:any,action:'APPROVE'|'REJECT')=>{
  const corridor=catalog?.corridors.find((c:any)=>c.name.toLowerCase()===p.destination_name.toLowerCase());
  const expectedVersion=Math.max(0,...(catalog?.versions??[]).filter((v:any)=>v.corridor_id===corridor?.id&&v.tier_code===p.tier_code&&v.provider===p.provider).map((v:any)=>v.version));
  try{await run(`/inference/${p.id}/review`,{action,expectedHash:p.content_hash,expectedVersion,reason:reasons[p.id]??''});await load();}catch{/* Parent displays the failed mutation. */}
 };
 return <section className="adt-card"><h2>Destination research</h2><p>AI proposes feeder cities. Provider validation confirms location identity; you review commercial suitability. Approval saves a corridor version. Publish that version separately in Corridors before hosts can use it.</p><button type="button" className="mkt-secondary" onClick={()=>void load()} disabled={busy}>Refresh research</button>
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading destination research…</p>}
 {data?.proposals.map((p:any)=><article className="adt-card" key={p.id}><h3>{p.destination_name} · {p.tier_code} · {p.provider}</h3><p>Review status: {p.state}</p><AdtechMap pins={p.content.geography.filter((g:any)=>g.kind!=='PROVIDER_REGION_EXCLUSION')}/><p className="adt-lock">Required exclusion: {p.content.destination.districtName} district</p>{p.content.feeders.map((f:any)=><p key={f.city}><strong>{f.city} · {f.radiusKm} km</strong><br/>{f.rationale}</p>)}<p>{p.content.assumptions.join(' ')}</p>
 <details><summary>Provider verification evidence</summary><pre>{JSON.stringify(p.content.geography,null,2)}</pre><p>Immutable proposal hash: {p.content_hash}</p></details>
 {p.state==='PROPOSED'&&<><label className="mkt-fields">Review reason for {p.destination_name}<textarea value={reasons[p.id]??''} maxLength={2000} onChange={e=>setReasons({...reasons,[p.id]:e.target.value})}/></label><div className="adt-actions"><button type="button" className="mkt-primary" disabled={busy||(reasons[p.id]??'').trim().length<10} onClick={()=>void review(p,'APPROVE')}>Approve as saved corridor version</button><button type="button" className="mkt-secondary" disabled={busy||(reasons[p.id]??'').trim().length<10} onClick={()=>void review(p,'REJECT')}>Reject proposal</button></div></>}
 </article>)}
 {data?.jobs.length===0&&<p>No destination research has been requested.</p>}
 {data?.jobs.map((j:any)=><details key={j.id}><summary>{j.destination_name} · {j.provider} · {j.state}</summary><p>Job {j.id} · Attempts {j.attempts} · Lease generation {j.fence}</p>{j.last_error&&<p>Diagnostic: {j.last_error}</p>}{j.state==='DEAD'&&<><label className="mkt-fields">Retry reason for research #{j.id}<textarea value={retryReasons[j.id]??''} onChange={e=>setRetryReasons({...retryReasons,[j.id]:e.target.value})} maxLength={2000}/></label><button type="button" className="mkt-secondary" disabled={busy||(retryReasons[j.id]??'').trim().length<10} onClick={()=>void run(`/inference/jobs/${j.id}/retry`,{expectedFence:j.fence,reason:retryReasons[j.id]}).then(load).catch(()=>{})}>Retry research after resolving its diagnostic</button></>}</details>)}
 </section>;
}
