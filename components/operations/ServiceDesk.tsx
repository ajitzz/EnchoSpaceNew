import React, {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {operationsWorkspaceSchema,type OperationsAssignment,type OperationsWorkspace} from '../../src/shared/iam/workspace.js';
import {serviceCaseContentSchema,serviceCaseNoteResultSchema,type ServiceCaseContent} from '../../src/shared/conversation/serviceCases.js';
import './serviceDesk.css';

export interface ServiceDeskProps {
 workspace:OperationsWorkspace;
 onRefresh?:()=>void;
 now?:()=>number;
}
const dateLabel=(date:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(date));
const caseFor=(assignment:OperationsAssignment)=>assignment.resource?.type==='SERVICE_CASE'?assignment.resource.id:null;
function allowed(workspace:OperationsWorkspace,now:number){
 return workspace.session.id!==undefined&&workspace.member.state==='ACTIVE'&&workspace.session.state==='ACTIVE'
  &&Date.parse(workspace.session.expiresAt)>now&&Date.parse(workspace.freshUntil)>now
  &&workspace.desks.some(d=>d.id==='service'&&d.permittedActions.includes('service.read'));
}
function claimed(assignment:OperationsAssignment,now:number){
 return assignment.state==='CLAIMED'&&assignment.leaseExpiresAt!==null
  &&Date.parse(assignment.leaseExpiresAt)>now&&caseFor(assignment)!==null;
}

/** Memory-only assigned-case view. No content fetch occurs until a staff member
 * explicitly opens a conversation; every read remains audited by the server. */
export default function ServiceDesk({workspace:raw,onRefresh,now=Date.now}:ServiceDeskProps){
 const parsed=operationsWorkspaceSchema.safeParse(raw);
 const [clock,setClock]=useState(now);
 const currentTime=now();
 useEffect(()=>{
  const times=[raw.freshUntil,raw.session.expiresAt,...raw.work.items.flatMap(i=>i.leaseExpiresAt?[i.leaseExpiresAt]:[])].map(Date.parse).filter(t=>t>currentTime);
  const timer=setTimeout(()=>setClock(now()),Math.min(60000,Math.max(10,Math.min(...times)-currentTime+10)));
  return()=>clearTimeout(timer);
 },[raw,clock,now,currentTime]);
 const [selected,setSelected]=useState<string|null>(null);
 if(!parsed.success)return <section className="service-desk"><p role="alert">The Service Desk response could not be verified.</p></section>;
 const workspace=parsed.data;
 if(!allowed(workspace,currentTime))return <section className="service-desk"><h2>Case access needs a fresh workforce session</h2><p role="status">Private conversation content is closed. Refresh your workspace to check current access.</p><button type="button" onClick={onRefresh}>Refresh workspace</button></section>;
 const assignments=workspace.work.items.filter(i=>i.deskId==='service'&&caseFor(i)!==null);
 const active=assignments.find(i=>i.id===selected);
 const identity=[workspace.organization.id,workspace.member.membershipId,workspace.session.id,workspace.session.expiresAt].join(':');
 return <section className="service-desk" aria-label="Assigned service cases">
  <header className="service-desk-intro"><div><p className="service-desk-eyebrow">Assisted service</p><h2>Context before action.</h2></div><p>Open only the conversation you are assigned to help with. Each access is recorded; internal notes stay within Encho.</p></header>
  {assignments.length===0?<div className="service-desk-empty"><h3>No assigned service cases</h3><p>New assistance requests appear here after a permitted coordinator assigns them to you.</p></div>:
   <div className="service-desk-grid"><nav className="service-desk-cases" aria-label="Your assigned cases">
    {assignments.map(a=><button type="button" key={a.id} aria-pressed={selected===a.id} onClick={()=>setSelected(a.id)}><span className="service-desk-state">{a.state==='CLAIMED'?(claimed(a,currentTime)?'Claim active':'Claim expired'):a.state==='ASSIGNED'?'Claim required':'Closed assignment'}</span><strong>{a.title}</strong><span>{a.resourceLabel}</span></button>)}
   </nav><div className="service-desk-detail">
    {!active?<div className="service-desk-empty"><h3>Select an assigned case</h3><p>Conversation history stays closed until you explicitly request an audited view.</p></div>:
     !claimed(active,currentTime)?<div className="service-desk-empty"><h3>{active.state==='ASSIGNED'?'Claim this work first':'This claim is no longer active'}</h3><p>Use the assignment controls in My work, then refresh this desk. A previous claim never grants continuing access.</p><button type="button" onClick={onRefresh}>Refresh workspace</button></div>:
      <PrivateCase key={`${identity}:${active.id}:${active.version}:${active.fence}:${active.leaseExpiresAt}:${workspace.desks.find(d=>d.id==='service')?.permittedActions.join(',')}`} workspace={workspace} assignment={active} now={now} onRefresh={onRefresh}/>
    }
   </div></div>}
 </section>;
}

function PrivateCase({workspace,assignment,now,onRefresh}:ServiceDeskProps&{assignment:OperationsAssignment;now:()=>number}){
 const inputId=useId();const [content,setContent]=useState<ServiceCaseContent|null>(null);
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<string|null>(null);
 const [denied,setDenied]=useState(false);const [draft,setDraft]=useState('');const [uncertain,setUncertain]=useState(false);
 const pendingNote=useRef<{requestId:string;body:string}|null>(null);
 const controller=useRef<AbortController|null>(null);const mounted=useRef(true);const inFlight=useRef(false);
 const evidence=useRef({workspace,assignment});
 useLayoutEffect(()=>{evidence.current={workspace,assignment};},[workspace,assignment]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();pendingNote.current=null;};},[]);
 const caseId=caseFor(assignment)!;
 const canNote=workspace.desks.find(d=>d.id==='service')?.permittedActions.includes('service.note')===true;
 const fresh=()=>mounted.current&&allowed(evidence.current.workspace,now())&&claimed(evidence.current.assignment,now());
 const command={caseId,assignmentId:assignment.id,assignmentVersion:assignment.version,assignmentFence:assignment.fence};
 const clearAccess=()=>{setContent(null);setDraft('');pendingNote.current=null;setUncertain(false);setDenied(true);onRefresh?.();};
 const post=async(path:string,body:unknown,signal:AbortSignal)=>fetch(`/api/operations/v1/service/${path}`,{
  method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),
 });
 async function load(signal:AbortSignal,beforeSequence?:string){
  const response=await post('read',{...command,...(beforeSequence?{beforeSequence}:{}),limit:50},signal);
  if(!fresh()||signal.aborted)return false;
  if(!response.ok){
   if(response.status===401||response.status===403){clearAccess();setNotice('Current case access was not accepted. Refresh the workforce workspace.');}
   else setNotice('Conversation access is unavailable. No private content has been opened.');
   return false;
  }
  const result=serviceCaseContentSchema.parse(await response.json());
  if(!fresh()||signal.aborted)return false;
  if(result.caseId!==caseId)throw new Error('Case response mismatch');
  setContent(result);return true;
 }
 async function open(beforeSequence?:string){
  if(inFlight.current||denied||!fresh())return;
  inFlight.current=true;setBusy(true);setNotice(null);setContent(null);
  const request=new AbortController();controller.current=request;
  try{await load(request.signal,beforeSequence);}catch{if(fresh()&&!request.signal.aborted)setNotice('Conversation access could not be confirmed. Try an audited read again.');}
  finally{inFlight.current=false;if(mounted.current){setBusy(false);}}
 }
 async function saveNote(){
  if(inFlight.current||!canNote||denied||!fresh())return;
  const body=draft.trim();if(!pendingNote.current&&!body)return;
  if(!pendingNote.current)pendingNote.current={requestId:crypto.randomUUID(),body};
  const pending=pendingNote.current;
  inFlight.current=true;setBusy(true);setNotice(null);
  const request=new AbortController();controller.current=request;
  try{
   const response=await post('notes',{...command,...pending},request.signal);
   if(!fresh()||request.signal.aborted)return;
   if(response.status===401||response.status===403){clearAccess();setNotice('Current note authority was not accepted. Refresh your workspace.');return;}
   if(!response.ok){
    if(response.status>=500){setUncertain(true);setNotice('The note result is unknown. Retry the same note safely; it has not been shown as saved.');}
    else{setNotice('The note was not accepted. Refresh the case before changing the request.');setUncertain(true);}
    return;
   }
   const receipt=serviceCaseNoteResultSchema.parse(await response.json());
   if(!fresh()||request.signal.aborted)return;
   if(receipt.caseId!==caseId)throw new Error('Note receipt mismatch');
   pendingNote.current=null;setDraft('');setUncertain(false);setContent(null);
   const refreshed=await load(request.signal);
   if(refreshed)setNotice('Internal note saved. Conversation access has been recorded again.');
  }catch{if(fresh()&&!request.signal.aborted){setUncertain(pendingNote.current!==null);setNotice(pendingNote.current?'The note result could not be confirmed. Retry the same note safely.':'The note was saved, but its updated view is unavailable. Open an audited view again.');}}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 return <article className="service-desk-private" aria-busy={busy}>
  <header><p className="service-desk-eyebrow">Assigned conversation</p><h3>{assignment.title}</h3><p>Claim valid until {dateLabel(assignment.leaseExpiresAt!)}. Assistance can be withdrawn by either participant.</p></header>
  {!denied&&<div className="service-desk-controls"><button type="button" className="service-desk-primary" disabled={busy} onClick={()=>void open()}>{content?'Refresh audited conversation':'Open audited conversation'}</button>{content&&BigInt(content.messages[0]?.conversation_sequence??'0')>1n&&<button type="button" disabled={busy} onClick={()=>void open(content.messages[0].conversation_sequence)}>Read earlier messages</button>}</div>}
  {busy&&<p role="status">Checking current assignment and recording access…</p>}
  {notice&&<p className="service-desk-notice" role="status">{notice}</p>}
  {!content&&!busy&&!denied&&<p className="service-desk-disclosure">Opening records an access authorization for this conversation history. It does not mark participant messages as read or send a reply.</p>}
  {content&&<>
   <div className="service-desk-receipt"><span>Audited access reference</span><code>{content.receiptId}</code></div>
   <section aria-labelledby={`${inputId}-history`}><h4 id={`${inputId}-history`}>Conversation history</h4>
    {content.messages.length===0?<p>No messages in this history window.</p>:<ol className="service-desk-messages">{content.messages.map(m=><li key={m.id}><span>Participant message{m.created_at?` · ${dateLabel(m.created_at)}`:''}</span><p>{m.content}</p></li>)}</ol>}
   </section>
   <section className="service-desk-notes" aria-labelledby={`${inputId}-notes`}><h4 id={`${inputId}-notes`}>Internal notes · Encho staff only</h4><p>These notes are not sent to the guest or host. Replying as either participant is unavailable.</p>
    {content.internalNotes.length===0?<p>No internal notes in this snapshot.</p>:<ol>{content.internalNotes.map(n=><li key={n.id}><time>{dateLabel(n.created_at)}</time><p>{n.body}</p></li>)}</ol>}
   </section>
  </>}
  {!denied&&canNote&&<form className="service-desk-note-form" onSubmit={e=>{e.preventDefault();void saveNote();}}><label htmlFor={inputId}>Internal case note</label><textarea id={inputId} value={draft} maxLength={4000} disabled={busy||uncertain} onChange={e=>setDraft(e.target.value)} aria-describedby={`${inputId}-hint`}/><p id={`${inputId}-hint`}>Keep notes relevant to the case. Never include passwords or payment credentials.</p><button type="submit" disabled={busy||(!draft.trim()&&!uncertain)}>{uncertain?'Retry the same note':'Save internal note and refresh'}</button></form>}
 </article>;
}
