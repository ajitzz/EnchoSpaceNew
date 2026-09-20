import React,{useEffect,useState} from 'react';
import {marketingRequest,humanStatus,observedTime} from './api';
import {Notice} from './StudioShared';
type Recovery={revision:number;observedAt:string;assessment:string;quoteId:string|null;automaticRetryAllowed:false;truncated:boolean;nextSteps:string[];
 jobs:{id:string;kind:string;state:string;attempts:number}[];
 operations:{id:number;provider:string;operation_type:string;publish_status:string;correlation_id:string|null}[];
 entities:{provider:string;entity_type:string;external_id:string;account_id:string|null}[]};
export function RecoveryPanel({campaignId,revision}:{campaignId:string|number;revision:number}){
 const [open,setOpen]=useState(false),[data,setData]=useState<Recovery|null>(null),[error,setError]=useState('');
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
   <h4>Next actions</h4><ol>{data.nextSteps.map(step=><li key={step}>{step}</li>)}</ol></>}</>}
 </section>;
}
