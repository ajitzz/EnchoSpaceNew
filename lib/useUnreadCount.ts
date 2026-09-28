import {useEffect,useState} from 'react';
import {z} from 'zod';
import {publicApiErrorSchema} from '../src/shared/platform/apiError';

const countSchema=z.object({unread:z.number().int().nonnegative().safe()}).strict();
export type UnreadCountState=
 | {status:'SIGNED_OUT'}
 | {status:'LOADING'}
 | {status:'AVAILABLE';count:number}
 | {status:'UNAVAILABLE';correlationId?:string};
interface Snapshot {accountId:number;token:string;state:UnreadCountState}

function unavailable(body:unknown):UnreadCountState{
 // The participant router retains an `error` alias for legacy clients. Only a
 // fully catalog-validated error may contribute its diagnostic reference.
 const legacy=z.object({error:z.unknown().optional()}).passthrough().safeParse(body);
 if(legacy.success){
  const {error:_alias,...candidate}=legacy.data;
  const parsed=publicApiErrorSchema.safeParse(candidate);
  if(parsed.success)return {status:'UNAVAILABLE',correlationId:parsed.data.correlationId};
 }
 return {status:'UNAVAILABLE'};
}

/** Read-only participant projection; no private cache or fabricated zero on error. */
export function useUnreadCount(accountId:number|undefined,token:string|null):UnreadCountState{
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 useEffect(()=>{
  if(accountId===undefined||!token)return;
  let active=true,busy=false;
  let controller:AbortController|undefined;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  const publish=(state:UnreadCountState)=>{if(active)setSnapshot({accountId,token,state});};
  const refresh=async()=>{
   if(!active||busy)return;
   busy=true;controller=new AbortController();
   deadline=setTimeout(()=>{controller?.abort();publish({status:'UNAVAILABLE'});},8000);
   try{
    const response=await fetch('/api/unread-counts',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
    const body:unknown=await response.json();
    if(!active||controller.signal.aborted)return;
    const counts=countSchema.safeParse(body);
    publish(response.ok&&counts.success?{status:'AVAILABLE',count:counts.data.unread}:unavailable(body));
   }catch{publish({status:'UNAVAILABLE'});}
   finally{if(deadline)clearTimeout(deadline);busy=false;}
  };
  publish({status:'LOADING'});void refresh();
  const interval=setInterval(()=>{void refresh();},30000);
  const onResume=()=>{void refresh();};
  window.addEventListener('focus',onResume);window.addEventListener('online',onResume);
  return ()=>{
   active=false;controller?.abort();if(deadline)clearTimeout(deadline);clearInterval(interval);
   window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);
  };
 },[accountId,token]);
 if(accountId===undefined)return {status:'SIGNED_OUT'};
 if(!token)return {status:'UNAVAILABLE'};
 // Effects run after render. Never render the previous account/token's count
 // during the transition, even before the obsolete request is aborted.
 return snapshot?.accountId===accountId&&snapshot.token===token?snapshot.state:{status:'LOADING'};
}

export function unreadCountDescription(state:UnreadCountState):string{
 if(state.status==='UNAVAILABLE')return `Unread count unavailable.${state.correlationId?` Reference: ${state.correlationId}.`:''}`;
 if(state.status==='LOADING')return 'Checking unread messages.';
 if(state.status==='AVAILABLE')return state.count===0?'No unread messages.':`${state.count} unread ${state.count===1?'message':'messages'}.`;
 return 'Sign in to view messages.';
}
