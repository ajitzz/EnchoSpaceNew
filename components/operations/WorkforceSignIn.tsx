import React,{useCallback,useEffect,useRef,useState} from 'react';
import {GoogleLogin,GoogleOAuthProvider} from '@react-oauth/google';
import {workforceLoginChallengeSchema,workforceLoginReceiptSchema,type WorkforceLoginChallenge} from '../../src/shared/iam/sessionTransport.js';
import './operations.css';

type State={status:'IDLE'|'STARTING'|'COMPLETING'|'ERROR';message?:string}|{status:'READY';challenge:WorkforceLoginChallenge};
const commandHeaders={'Content-Type':'application/json','X-Encho-Workforce-Command':'1'};
/** Only challenge metadata reaches React. Session and browser-binding secrets
 * remain in same-origin HttpOnly cookies; no consumer storage/cache is used. */
export default function WorkforceSignIn({onComplete,onCancel,autoStart=false}:{onComplete:()=>void;onCancel:()=>void;autoStart?:boolean}){
  const[state,setState]=useState<State>({status:'IDLE'}),busy=useRef(false),request=useRef<AbortController|null>(null),mounted=useRef(true);
  const post=useCallback(async(action:string,body:unknown)=>{
    request.current?.abort();const abort=new AbortController();request.current=abort;
    return fetch(`/api/operations/v1/session/${action}`,{method:'POST',headers:commandHeaders,body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
  },[]);
  const begin=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setState({status:'STARTING'});
    try{
      const response=await post('begin',{});
      if(!mounted.current)return;
      if(!response.ok){setState({status:'ERROR',message:response.status===429?'Too many sign-in attempts. Try again later.':'Workforce sign-in is not available. Contact your workforce administrator.'});return;}
      const challenge=workforceLoginChallengeSchema.parse(await response.json());
      if(Date.parse(challenge.expiresAt)<=Date.now())throw new Error('Expired challenge');
      if(mounted.current)setState({status:'READY',challenge});
    }catch{if(mounted.current)setState({status:'ERROR',message:'The sign-in service could not be reached. Start again when connected.'});}
    finally{busy.current=false;}
  },[post]);
  const complete=useCallback(async(challenge:WorkforceLoginChallenge,credential:string|undefined)=>{
    if(!mounted.current||busy.current||!credential||Date.parse(challenge.expiresAt)<=Date.now())return;
    busy.current=true;setState({status:'COMPLETING'});
    try{
      const response=await post('complete',{challengeId:challenge.challengeId,credential});
      if(!mounted.current)return;
      if(!response.ok){setState({status:'ERROR',message:response.status===401?'Sign-in was not accepted. Use the invited Google account with current workforce access.':'The session result could not be confirmed. Start a new sign-in.'});return;}
      workforceLoginReceiptSchema.parse(await response.json());
      if(mounted.current)onComplete();
    }catch{if(mounted.current)setState({status:'ERROR',message:'The session result could not be confirmed. Start a new sign-in.'});}
    finally{busy.current=false;}
  },[post,onComplete]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  useEffect(()=>{if(autoStart)void begin();},[autoStart,begin]);
  useEffect(()=>{
    if(state.status!=='READY')return;
    const timer=window.setTimeout(()=>setState({status:'ERROR',message:'This sign-in challenge expired. Start a new sign-in.'}),Math.max(0,Date.parse(state.challenge.expiresAt)-Date.now()));
    return()=>window.clearTimeout(timer);
  },[state]);
  return <main className="ops-shell ops-fallback" aria-labelledby="workforce-signin-title">
    <span className="ops-eyebrow">Encho Operations</span><h1 id="workforce-signin-title">Your work, within your access.</h1>
    <p>Use the Google account invited to your Encho team. Your guest and host account stays separate from this workforce session.</p>
    {state.status==='ERROR'&&<p role="alert">{state.message}</p>}
    {(state.status==='STARTING'||state.status==='COMPLETING')&&<p role="status">{state.status==='STARTING'?'Preparing secure sign-in…':'Checking current workforce access…'}</p>}
    {state.status==='READY'&&<GoogleOAuthProvider clientId={state.challenge.clientId} onScriptLoadError={()=>setState({status:'ERROR',message:'Google sign-in could not load. Check your connection and try again.'})}>
      <GoogleLogin nonce={state.challenge.nonce} auto_select={false} useOneTap={false} text="signin_with" theme="outline" size="large"
        onSuccess={result=>void complete(state.challenge,result.credential)} onError={()=>setState({status:'ERROR',message:'Google sign-in was not completed. You can start again.'})}/>
    </GoogleOAuthProvider>}
    <div className="ops-actions">
      {(state.status==='IDLE'||state.status==='ERROR')&&<button className="ops-button ops-primary" onClick={()=>void begin()}>Start workforce sign-in</button>}
      <button className="ops-button" onClick={onCancel}>Back to workspace</button>
    </div>
    <p className="ops-secondary">Protected decisions may require a separate verification step. Signing in does not grant new permissions.</p>
  </main>;
}
