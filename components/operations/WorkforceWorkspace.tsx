import React,{useEffect,useRef,useState} from 'react';
import WorkforceDesk,{type WorkforceDeskState,type WorkforceReviewSection} from './WorkforceDesk.js';
import {operationsWorkspaceSchema,type OperationsWorkspace} from '../../src/shared/iam/workspace.js';
import {workforceReviewSchema,type WorkforceReviewRequest} from '../../src/shared/iam/workforceReview.js';

/** Page state has no persistence. Renewed workspace evidence discards previous
 * cursors and responses, including when the cookie changes during a request. */
export default function WorkforceWorkspace({workspace,onRefreshWorkspace}:{workspace:OperationsWorkspace;onRefreshWorkspace?:()=>void}){
  const [clock,setClock]=useState(Date.now);
  useEffect(()=>{
    setClock(Date.now());
    const expiry=Math.min(Date.parse(workspace.session.expiresAt),Date.parse(workspace.freshUntil));
    const timer=window.setTimeout(()=>setClock(Date.now()),Math.max(0,expiry-Date.now()+5));
    return()=>window.clearTimeout(timer);
  },[workspace.session.expiresAt,workspace.freshUntil]);
  const parsed=operationsWorkspaceSchema.safeParse(workspace);
  if(!parsed.success||!workspace.session.id||workspace.member.state!=='ACTIVE'||workspace.session.state!=='ACTIVE'
    ||Date.parse(workspace.session.expiresAt)<=clock||Date.parse(workspace.freshUntil)<=clock
    ||!workspace.desks.some(desk=>desk.id==='workforce'&&desk.permittedActions.includes('workforce.member.read'))){
    const expired=Date.parse(workspace.session.expiresAt)<=clock;
    const stale=Date.parse(workspace.freshUntil)<=clock;
    return <WorkforceDesk state={{status:expired?'SESSION_STALE':stale?'UNAVAILABLE':'ACCESS_DENIED'}} onRefresh={()=>onRefreshWorkspace?.()}/>;
  }
  const identity=[workspace.organization.id,workspace.member.membershipId,workspace.session.id,workspace.generatedAt].join(':');
  return <CurrentWorkforce key={identity} workspace={workspace}/>;
}

function CurrentWorkforce({workspace}:{workspace:OperationsWorkspace}){
  const [state,setState]=useState<WorkforceDeskState>({status:'LOADING'});
  const [query,setQuery]=useState<WorkforceReviewRequest>({});
  const [refresh,setRefresh]=useState(0);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{
    const active=new AbortController();request.current=active;setState({status:'LOADING'});
    const current=()=>!active.signal.aborted&&Date.now()<Math.min(Date.parse(workspace.freshUntil),Date.parse(workspace.session.expiresAt));
    const expires=window.setTimeout(()=>{active.abort();setState({status:Date.parse(workspace.session.expiresAt)<=Date.now()?'SESSION_STALE':'UNAVAILABLE'});},Math.max(0,Math.min(Date.parse(workspace.freshUntil),Date.parse(workspace.session.expiresAt))-Date.now()));
    const load=async()=>{
      try{
        if(!current())return;
        const params=new URLSearchParams(Object.entries(query).map(([key,value])=>[key,String(value)]));
        const response=await fetch(`/api/operations/v1/workforce?${params}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([active.signal,AbortSignal.timeout(12000)])});
        if(!current())return;
        if(!response.ok){setState({status:response.status===401?'SESSION_STALE':response.status===403?'ACCESS_DENIED':response.status===503?'UNAVAILABLE':'ERROR'});return;}
        const review=workforceReviewSchema.parse(await response.json());
        if(!current())return;
        if(review.organization.id!==workspace.organization.id||Date.parse(review.freshUntil)<=Date.now())throw new Error('Workforce evidence mismatch');
        setState({status:'READY',review});
      }catch{if(current())setState({status:'ERROR'});}
    };
    void load();return()=>{active.abort();window.clearTimeout(expires);};
  },[query,refresh,workspace]);
  const page=(section:WorkforceReviewSection,cursor:string)=>{
    request.current?.abort();
    const fields={members:'memberAfter',grants:'grantAfter',invitations:'invitationAfter'} as const;
    setQuery(previous=>({...previous,[fields[section]]:cursor}));
  };
  return <WorkforceDesk state={state} onPage={page} onRefresh={()=>{request.current?.abort();setQuery({});setRefresh(previous=>previous+1);}}/>;
}
