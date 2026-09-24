import React,{useEffect,useRef,useState} from 'react';
import {serviceCaseStatusSchema,publicServiceCaseSchema,type ServiceCaseStatus} from '../../src/shared/conversation/serviceCases';
import {assistanceDisclosure} from '../../src/shared/conversation/assistanceDisclosure';

/** Participant-owned support request, never an implicit staff content grant. */
export default function ConversationAssistance({threadId,token}:{threadId:number;token:string}){
  const [status,setStatus]=useState<ServiceCaseStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const active=useRef(true),attempt=useRef<string|null>(null),pending=useRef(false);
  const generation=useRef(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const current=()=>active.current&&localStorage.getItem('token')===token;
  const fetchStatus=async(signal?:AbortSignal)=>{
    if(pending.current)return;
    const requested=++generation.current;
    const latest=()=>current()&&!signal?.aborted&&requested===generation.current;
    try{
      const response=await fetch(`/api/conversations/v1/threads/${threadId}/assistance`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
      if(!latest())return;
      if(!response.ok)throw new Error('Unavailable');
      const value=serviceCaseStatusSchema.parse(await response.json());
      if(value.case&&value.case.threadId!==threadId)throw new Error('Mismatched case');
      if(latest()){setStatus(value);setError('');}
    }catch{if(latest())setError('Support assistance could not be loaded. Try again when connected.');}
  };
  useEffect(()=>{
    if(!expanded)return;
    const abort=new AbortController();void fetchStatus(abort.signal);
    return()=>abort.abort();
    // The parent keys this component by actor/token/thread; no private state can cross those boundaries.
  },[expanded]);
  const mutate=async(withdraw:boolean)=>{
    if(pending.current||!status||(!withdraw&&(!accepted||status.disclosureVersion!==assistanceDisclosure.version)))return;
    const existing=status.case;if(withdraw&&!existing)return;
    pending.current=true;++generation.current;setBusy(true);setError('');
    attempt.current??=crypto.randomUUID();
    try{
      const response=await fetch(withdraw?`/api/conversations/v1/cases/${existing!.id}/withdraw`:'/api/conversations/v1/cases',{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000),
        body:JSON.stringify(withdraw?{expectedVersion:existing!.version}:{threadId,requestId:attempt.current,disclosureVersion:status.disclosureVersion,acceptAssistance:true}),
      });
      if(!current())return;
      if(!response.ok)throw new Error('Unconfirmed');
      const value=publicServiceCaseSchema.parse(await response.json());if(value.threadId!==threadId)throw new Error('Wrong thread');
      setStatus({...status,case:value});setAccepted(false);attempt.current=null;
    }catch{if(current())setError('The assistance result was not confirmed. Refresh its status before retrying.');}
    finally{pending.current=false;if(current())setBusy(false);}
  };
  return <details onToggle={event=>setExpanded(event.currentTarget.open)} className="border-t border-gray-200 px-4 py-2 bg-white text-sm text-gray-700">
    <summary className="cursor-pointer min-h-11 flex items-center">Encho assistance{status?.case?.state==='OPEN'?' · Requested':''}</summary>
    <div className="space-y-3 pb-3">
      {error&&<p role="alert">{error}</p>}
      {!status&&!error&&<p role="status">Checking assistance status…</p>}
      {status?.case?.state==='OPEN'?<><p>Assistance is requested. Only assigned staff with current permission can open this conversation. A reply time has not been promised.</p><button disabled={busy} className="min-h-11 underline" onClick={()=>void mutate(true)}>Stop new support access</button></>
        :status&&status.disclosureVersion===assistanceDisclosure.version?<><p>{assistanceDisclosure.text}</p><label className="flex gap-3 min-h-11 items-center"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} disabled={busy}/>I agree to share this conversation with Encho support.</label><button className="min-h-11 px-4 rounded-lg border border-gray-500 disabled:opacity-50" disabled={busy||!accepted} onClick={()=>void mutate(false)}>Request assistance</button></>
          :status&&<p>Assistance is awaiting the current disclosure. Refresh after the service is updated.</p>}
      <button className="min-h-11 underline" disabled={busy} onClick={()=>void fetchStatus()}>Refresh assistance status</button>
    </div>
  </details>;
}
