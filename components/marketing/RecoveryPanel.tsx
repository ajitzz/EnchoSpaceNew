import React,{useEffect,useRef,useState} from 'react';
import {marketingRequest,MarketingRequestError,humanStatus,observedTime} from './api';
import {Notice} from './StudioShared';
type Recovery={revision:number;observedAt:string;assessment:string;quoteId:string|null;automaticRetryAllowed:false;truncated:boolean;nextSteps:string[];
 attempts?:{id:string;revision:number;state:string;error_code:string|null;created_at:string;finished_at:string|null;lease_until:string}[];
 recoveries?:{id:string;revision:number;job_id:string;operation_id:number;created_at:string}[];
 jobs:{id:string;kind:string;state:string;attempts:number}[];
 operations:{id:number;provider:string;operation_type:string;publish_status:string;correlation_id:string|null}[];
 entities:{provider:string;entity_type:string;external_id:string;account_id:string|null}[]};
export function RecoveryPanel({campaignId,revision}:{campaignId:string|number;revision:number}){
 return <CampaignRecoveryPanel key={`${campaignId}:${revision}`} campaignId={campaignId} revision={revision}/>;
}
function CampaignRecoveryPanel({campaignId,revision}:{campaignId:string|number;revision:number}){
 const [open,setOpen]=useState(false),[data,setData]=useState<Recovery|null>(null),[error,setError]=useState('');
 const [newAttemptAllowed,setNewAttemptAllowed]=useState(false);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState('');
 const attempt=useRef<{body:string;key:string}|null>(null);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function adoptPause(){
  const body=JSON.stringify({revision,reason:reason.trim()});
  if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};
  setBusy(true);setError('');setNewAttemptAllowed(false);
  try{const result=await marketingRequest<{id:string}>(`/admin/campaigns/${encodeURIComponent(campaignId)}/recovery/adopt-pause`,{method:'POST',headers:{'Idempotency-Key':attempt.current.key},body});
   if(mounted.current)setReceipt(result.id);
  }catch(failure){if(mounted.current){setError(failure instanceof Error?failure.message:'The recorded pause could not be verified.');setNewAttemptAllowed(failure instanceof MarketingRequestError&&['RECOVERY_ATTEMPT_FINISHED','RECOVERY_ATTEMPT_EXPIRED','RECOVERY_READ_TIMEOUT','PAUSE_RECOVERY_NOT_VERIFIED','RECOVERY_EVIDENCE_CHANGED'].includes(failure.code||''));}}finally{if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{setData(null);setError('');if(!open)return;const controller=new AbortController();
  marketingRequest<Recovery>(`/admin/campaigns/${encodeURIComponent(campaignId)}/recovery?revision=${revision}`,{signal:controller.signal})
   .then(value=>{if(!controller.signal.aborted)setData(value);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Recovery evidence is unavailable.');});
  return()=>controller.abort();
 },[campaignId,revision,open]);
 return <section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Administrator investigation</span><h3>Recovery evidence</h3></div><button className="mkt-secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Close evidence':'Inspect recovery'}</button></div>
  {open&&<>{error&&<Notice error>{error}</Notice>}{!data&&!error&&<p role="status">Reading the recorded operation history…</p>}{data&&<><p>{humanStatus(data.assessment)} · {observedTime(data.observedAt)}</p><p className="mkt-caption">Revision {data.revision}. This inspection preserves the campaign, operation keys and financial history.</p>
   <h4>Recorded account bindings</h4>{data.entities.length?<ul>{data.entities.map((entity,index)=><li key={index}>{entity.provider} · {humanStatus(entity.entity_type)} {entity.external_id} · Account {entity.account_id||'not recorded'}</li>)}</ul>:<p>No external entity is recorded. This does not prove that nothing was created remotely.</p>}
   <h4>Provider operations</h4>{data.operations.length?<ul>{data.operations.map(operation=><li key={operation.id}>{operation.provider} · {humanStatus(operation.operation_type)} · {humanStatus(operation.publish_status)}<br/><small>Correlation {operation.correlation_id||'not recorded'}</small></li>)}</ul>:<p>No provider operation receipt is recorded.</p>}
   <h4>Recent jobs</h4><ul>{data.jobs.map(job=><li key={job.id}>{humanStatus(job.kind)} · {humanStatus(job.state)} · {job.attempts} attempts</li>)}</ul>{data.truncated&&<Notice>This report reached its history limit. Operations must inspect the complete retained history before resolving the case.</Notice>}
   <h4>Next actions</h4><ol>{data.nextSteps.map(step=><li key={step}>{step}</li>)}</ol>
   {!!data.attempts?.length&&<><h4>Recovery inspections</h4><ul>{data.attempts.map(item=><li key={item.id}>{humanStatus(item.state)} · {observedTime(item.created_at)} · Attempt {item.id}{item.error_code&&<> · {humanStatus(item.error_code)}</>}</li>)}</ul></>}
   {!!data.recoveries?.length&&<><h4>Recorded recoveries</h4><ul>{data.recoveries.map(item=><li key={item.id}>Paused-state receipt {item.id} · Revision {item.revision} · {observedTime(item.created_at)}</li>)}</ul></>}
   {data.operations.some(operation=>operation.operation_type==='PAUSE'&&operation.publish_status==='COMMITTED')&&<div>
    <h4>Recover a recorded successful pause</h4><p className="mkt-caption">Encho will read the original ad account again and can record the campaign as paused only if the original successful pause receipt still matches. This action cannot publish, activate, retry an unknown operation or release money.</p>
    <label className="mkt-field">Investigation reason<textarea value={reason} disabled={busy||!!receipt} maxLength={1000} onChange={event=>setReason(event.target.value)} /></label>
    <button className="mkt-secondary" disabled={busy||!!receipt||reason.trim().length<20} onClick={()=>void adoptPause()}>{busy?'Verifying the recorded pause…':'Verify and record paused state'}</button>
    {reason.trim().length<20&&!receipt&&<p className="mkt-caption">Enter at least 20 characters describing the investigation before this action becomes available.</p>}
    {newAttemptAllowed&&!busy&&!receipt&&<button className="mkt-secondary" onClick={()=>{attempt.current=null;setNewAttemptAllowed(false);setError('');}}>Start a new inspection after reviewing the evidence</button>}
    {receipt&&<p role="status">Paused state recovered. Audit receipt {receipt}. The workspace will update automatically.</p>}
   </div>}</>}</>}
 </section>;
}
