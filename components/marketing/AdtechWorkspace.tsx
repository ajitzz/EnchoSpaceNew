import React,{useEffect,useRef,useState} from 'react';
import {marketingRequest} from './api';
import {AdtechProfileForm} from './AdtechProfileForm';
import {AdtechCorridors} from './AdtechCorridors';
import {AdtechInference} from './AdtechInference';
import {profileSchema,type AdtechProfile} from '../../src/shared/adtech/contracts';
import './marketing.css';
import './adtech.css';
export default function AdtechWorkspace(){
 const [data,setData]=useState<any>(null),[selected,setSelected]=useState(0),[draft,setDraft]=useState<AdtechProfile|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState('Profiles');const keys=useRef(new Map<string,string>());
 const load=()=>marketingRequest<any>('/admin/adtech/profiles').then(setData);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 const current=data?.profiles[selected];
 useEffect(()=>{setDraft(current?.config?structuredClone(current.config):null);setReason('');},[current]);
 const run=async(path:string,body:unknown,method='POST')=>{
  const intent=JSON.stringify({path,body,method});if(!keys.current.has(intent))keys.current.set(intent,crypto.randomUUID());setBusy(true);setError('');setNotice('');
  try{const result=await marketingRequest(`/admin/adtech${path}`,{method,headers:{'Idempotency-Key':keys.current.get(intent)!},body:JSON.stringify(body)});keys.current.delete(intent);await load();setNotice('Change recorded with an immutable audit receipt. Existing campaign revisions keep their saved strategy.');return result;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}
 };
 const save=async()=>{const parsed=profileSchema.safeParse(draft);if(!parsed.success){setError(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' · '));return;}try{await run(`/profiles/${current.id}`,{expectedVersion:current.version,profile:parsed.data,reason},'PUT');}catch{/* run presents the error and retains the idempotency key. */}};
 const release=data?.releases.find((r:any)=>r.id===data.currentReleaseId);
 const published=data?.versions.filter((v:any)=>release?.version_ids.includes(v.id))??[];
 return <main className="mkt-studio adt-workspace"><span className="mkt-eyebrow">Encho / Marketing operations</span><h1>Strategy control center</h1><p>Release audience and price-tier strategies with evidence, clear limits and a permanent history.</p>
  <nav className="adt-actions" aria-label="Strategy sections">{['Profiles','Corridors','Research','Audit'].map(name=><button type="button" className={tab===name?'mkt-primary':'mkt-secondary'} key={name} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)}>{name}</button>)}</nav>
  {error&&<p role="alert" className="adt-status">{error}</p>}{notice&&<p role="status" className="adt-status">{notice}</p>}{!data&&!error&&<p role="status">Loading strategy registry…</p>}
  {tab==='Profiles'&&data&&<div className="adt-layout"><section className="adt-card"><div className="adt-actions">{data.profiles.map((p:any,i:number)=><button key={p.id} type="button" className={i===selected?'mkt-primary':'mkt-secondary'} disabled={busy} onClick={()=>setSelected(i)}>{p.tier_code} · v{p.version}</button>)}</div>
   {draft&&<AdtechProfileForm value={draft} onChange={setDraft} disabled={busy}/>}
   {current&&Object.entries(current.capabilityIssues).map(([provider,issues])=>(issues as string[]).length>0&&<p key={provider} role="status">{provider} publication blockers: {(issues as string[]).join(', ')}</p>)}
   <label className="mkt-fields">Reason for change<textarea value={reason} onChange={e=>setReason(e.target.value)} disabled={busy} minLength={10} maxLength={2000}/></label>
   <button type="button" className="mkt-primary" disabled={busy||reason.trim().length<10} onClick={()=>void save()}>Save immutable profile version</button>
  </section><aside className="adt-card"><h2>Review & release</h2><p>Current release #{data.currentReleaseId}. Saving a profile does not activate it. Release all three latest saved versions together.</p><details><summary>Compare published and proposed profiles</summary><div className="adt-diff"><div><strong>Published</strong><pre>{JSON.stringify(published.map((v:any)=>v.config),null,2)}</pre></div><div><strong>Latest saved</strong><pre>{JSON.stringify(data.profiles.map((v:any)=>v.config),null,2)}</pre></div></div></details>
   <button type="button" className="mkt-primary" disabled={busy||reason.trim().length<10} onClick={()=>void run('/releases',{expectedReleaseId:data.currentReleaseId,versionIds:data.profiles.map((p:any)=>p.version_id),reason}).catch(()=>{})}>Publish reviewed saved versions</button>
   <p className="mkt-caption">This action publishes the saved versions shown above, not unsaved form edits. Concurrent changes require a fresh review.</p>
   <details><summary>Rollback receipts</summary>{data.releases.map((r:any)=><div key={r.id}><p>Release #{r.id} · {r.reason}</p><button type="button" className="mkt-secondary" disabled={busy||r.id===data.currentReleaseId||reason.trim().length<10} onClick={()=>void run(`/releases/${r.id}/rollback`,{expectedReleaseId:data.currentReleaseId,reason}).catch(()=>{})}>Restore release #{r.id} as a new release</button></div>)}</details>
  </aside></div>}
  {tab==='Corridors'&&<AdtechCorridors run={run} busy={busy}/>}
  {tab==='Research'&&<AdtechInference run={run} busy={busy}/>}
  {tab==='Audit'&&<section className="adt-card"><h2>Immutable change history</h2>{data?.audits.map((audit:any)=><details key={audit.id}><summary>{audit.action} · {new Date(audit.created_at).toLocaleString()}</summary><p>{audit.reason}</p><p>Actor {audit.actor_id} · Receipt {audit.id}</p><div className="adt-diff"><pre>{JSON.stringify(audit.previous_state,null,2)}</pre><pre>{JSON.stringify(audit.new_state,null,2)}</pre></div></details>)}</section>}
 </main>;
}
