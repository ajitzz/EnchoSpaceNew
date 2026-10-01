import React, {useCallback, useEffect, useRef, useState} from 'react';
import {notificationEvidencePageSchema, notificationPreferenceReceiptSchema, notificationPreferencesSchema,
  type NotificationEvidencePage, type NotificationPreferences} from '../src/shared/conversation/notifications';
import {publicApiErrorSchema} from '../src/shared/platform/apiError';

type PendingChange={requestId:string;expectedVersion:string;inAppAlerts:boolean};
type LoadState='LOADING'|'READY'|'UNAVAILABLE'|'NOT_CONFIGURED';
type Reply={ok:boolean;status:number;body:unknown};
const knownPreRouteRateLimitMessages=new Set([
  'Message rate limit exceeded. Please wait before sending more.',
  'Too many requests, please try again later.',
]);

/** Optional alert controls never own message delivery or unread/read authority. */
export function ConversationNotificationPanel({accountId,token,onAlertPreference}:{
  accountId:number;token:string;onAlertPreference:(enabled:boolean|null)=>void;
}){
  const [open,setOpen]=useState(false);
  const [state,setState]=useState<LoadState>('LOADING');
  const [preference,setPreference]=useState<NotificationPreferences|null>(null);
  const [evidence,setEvidence]=useState<NotificationEvidencePage|null>(null);
  const [pending,setPending]=useState<PendingChange|null>(null);
  const [saving,setSaving]=useState(false);
  const [loadingEvidence,setLoadingEvidence]=useState(false);
  const [notice,setNotice]=useState('');
  const session=useRef(`${accountId}:${token}`);
  const active=useRef(true);
  const requests=useRef(new Set<AbortController>());
  useEffect(()=>{session.current=`${accountId}:${token}`;},[accountId,token]);

  const request=useCallback(async(path:string,method:'GET'|'PUT'='GET',payload?:PendingChange):Promise<Reply>=>{
    const controller=new AbortController();requests.current.add(controller);
    const deadline=setTimeout(()=>controller.abort(),10_000);
    try{
      const response=await fetch(path,{method,cache:'no-store',signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`,Accept:'application/json',
          ...(method==='PUT'?{'Content-Type':'application/json','X-Encho-Conversation-Command':'1'}:{})},
        ...(payload?{body:JSON.stringify(payload)}:{})});
      return {ok:response.ok,status:response.status,body:await response.json() as unknown};
    }finally{clearTimeout(deadline);requests.current.delete(controller);}
  },[token]);

  const refresh=useCallback(async()=>{
    const key=`${accountId}:${token}`;
    setState('LOADING');
    try{
      const response=await request('/api/conversations/v1/notifications/preferences');
      const problem=response.ok?null:publicApiErrorSchema.safeParse(response.body);
      if(response.status===503&&problem?.success&&problem.data.code==='FEATURE_UNAVAILABLE'){
        if(active.current&&session.current===key){
          setPreference(null);setState('NOT_CONFIGURED');onAlertPreference(null);setNotice('');
        }
        return;
      }
      const parsed=response.ok?notificationPreferencesSchema.safeParse(response.body):null;
      if(!active.current||session.current!==key)return;
      if(!parsed?.success||parsed.data.accountId!==accountId)throw new Error('PREFERENCE_UNAVAILABLE');
      setPreference(parsed.data);setState('READY');onAlertPreference(parsed.data.inAppAlerts);setNotice('');
    }catch{
      if(!active.current||session.current!==key)return;
      setPreference(null);setState('UNAVAILABLE');onAlertPreference(null);
      setNotice('Notification settings are unavailable. Messages and unread counts still work.');
    }
  },[accountId,token,request,onAlertPreference]);

  useEffect(()=>{
    active.current=true;
    void refresh();
    return ()=>{active.current=false;for(const controller of requests.current)controller.abort();onAlertPreference(null);};
  },[refresh,onAlertPreference]);

  const save=async(change:PendingChange)=>{
    const key=`${accountId}:${token}`;
    setPending(change);setSaving(true);setNotice('');
    try{
      const response=await request('/api/conversations/v1/notifications/preferences','PUT',change);
      if(!active.current||session.current!==key)return;
      if(response.ok){
        const receipt=notificationPreferenceReceiptSchema.safeParse(response.body);
        if(!receipt.success||receipt.data.accountId!==accountId||receipt.data.requestId!==change.requestId
          ||receipt.data.previousVersion!==change.expectedVersion||receipt.data.inAppAlerts!==change.inAppAlerts){
          throw new Error('PREFERENCE_RECEIPT_MISMATCH');
        }
        setPending(null);await refresh();return;
      }
      const problem=publicApiErrorSchema.safeParse(response.body);
      if(response.status===409&&problem.success&&problem.data.code==='VERSION_CONFLICT'){
        setPending(null);await refresh();setNotice('The setting changed elsewhere. Review the latest value before trying again.');return;
      }
      if(response.status===409&&problem.success&&problem.data.code==='IDEMPOTENCY_CONFLICT'){
        setPending(null);
        await refresh();
        setNotice('This request ID conflicts with a different change. The current setting was refreshed; do not retry that request.');
        return;
      }
      // The notification route rejects these before a preference mutation. A lost
      // acknowledgement or unknown outcome takes the catch path and keeps its UUID.
      if(response.status===503&&problem.success&&problem.data.code==='FEATURE_UNAVAILABLE'){
        setPending(null);setPreference(null);setState('NOT_CONFIGURED');onAlertPreference(null);
        setNotice('Notification settings are not configured. Messages and unread counts still work.');
        return;
      }
      if((response.status===401&&problem.success&&problem.data.code==='AUTHENTICATION_REQUIRED')
        ||(response.status===403&&problem.success&&problem.data.code==='ACCESS_DENIED')){
        setPending(null);setPreference(null);setState('UNAVAILABLE');onAlertPreference(null);
        setNotice('Notification settings access changed. Sign in again or contact support.');
        return;
      }
      if(response.status===503&&problem.success&&problem.data.code==='DEPENDENCY_UNAVAILABLE'){
        // The server emits this only before a write can commit; an uncertain
        // COMMIT is classified separately as OPERATION_OUTCOME_UNKNOWN.
        setPending(null);
        setNotice('Notification settings are temporarily unavailable. Review the current setting before trying again.');
        return;
      }
      const knownLegacyLimit=response.status===429&&typeof response.body==='object'&&response.body!==null
        &&!Array.isArray(response.body)&&Object.keys(response.body).length===1
        &&'error' in response.body&&typeof response.body.error==='string'
        &&knownPreRouteRateLimitMessages.has(response.body.error);
      if((response.status===422&&problem.success&&problem.data.code==='INVALID_REQUEST')
        ||(response.status===429&&problem.success&&problem.data.code==='RATE_LIMITED')||knownLegacyLimit){
        setPending(null);
        setNotice(response.status===429?'Too many requests. Wait before changing notification settings.':'The setting could not be saved. Review it and try again.');
        return;
      }
      throw new Error('PREFERENCE_OUTCOME_UNKNOWN');
    }catch{
      if(active.current&&session.current===key)setNotice('The result is not confirmed. Retry this same change to reconcile it.');
    }finally{if(active.current&&session.current===key)setSaving(false);}
  };

  const loadEvidence=async(beforeId?:string)=>{
    const key=`${accountId}:${token}`;
    setLoadingEvidence(true);
    try{
      const query=beforeId?`?beforeId=${encodeURIComponent(beforeId)}`:'';
      const response=await request(`/api/conversations/v1/notifications/evidence${query}`);
      const parsed=response.ok?notificationEvidencePageSchema.safeParse(response.body):null;
      if(!active.current||session.current!==key)return;
      if(!parsed?.success||parsed.data.accountId!==accountId)throw new Error('EVIDENCE_UNAVAILABLE');
      setEvidence(current=>{
        if(!current||current.items.length===0)return parsed.data;
        const pages=beforeId?[...current.items,...parsed.data.items]:[...parsed.data.items,...current.items];
        const seen=new Set<string>();
        return {...parsed.data,items:pages.filter(item=>{
          if(seen.has(item.notificationId))return false;
          seen.add(item.notificationId);return true;
        }),
          nextBeforeId:beforeId?parsed.data.nextBeforeId:current.nextBeforeId};
      });
    }catch{if(active.current&&session.current===key)setNotice('Recent notification activity is unavailable.');}
    finally{if(active.current&&session.current===key)setLoadingEvidence(false);}
  };

  return <section aria-label="Notification settings" className="border-b border-gray-200 bg-white px-4 py-3 text-sm">
    <button type="button" className="font-medium text-emerald-900 underline underline-offset-2" aria-expanded={open}
      onClick={()=>{setOpen(value=>!value);if(!open&&!evidence&&state==='READY')void loadEvidence();}}>
      Notification settings
    </button>
    {open&&<div className="mt-3 space-y-3">
      {state==='LOADING'&&<p role="status">Checking notification settings…</p>}
      {state==='UNAVAILABLE'&&<button type="button" onClick={()=>void refresh()} className="underline">Retry settings</button>}
      {state==='NOT_CONFIGURED'&&<p>In-app notification controls are not configured for this service.</p>}
      {state==='READY'&&preference&&<>
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-medium">In-app inquiry alerts</p>
            <p className="text-gray-600">Optional new-message sound. Messages and unread counts still update when muted.</p></div>
          <button type="button" role="switch" aria-label="In-app inquiry alerts" aria-checked={preference.inAppAlerts}
            disabled={saving||Boolean(pending)} onClick={()=>void save({requestId:crypto.randomUUID(),expectedVersion:preference.version,inAppAlerts:!preference.inAppAlerts})}
            className="rounded-full border px-3 py-1 disabled:opacity-50">{preference.inAppAlerts?'On':'Off'}</button>
        </div>
        <p className="text-xs text-gray-600">{preference.source==='SAVED'?'Saved preference':'Default setting'} · Version {preference.version}</p>
        <p className="text-xs text-gray-600">Email, push and SMS alerts are not configured.</p>
        <div>
          <h3 className="font-medium">Recent notification activity</h3>
          {!evidence&&!loadingEvidence&&<button type="button" className="underline" onClick={()=>void loadEvidence()}>Load recent activity</button>}
          {loadingEvidence&&<p role="status">Loading activity…</p>}
          {evidence&&<>
            <button type="button" disabled={loadingEvidence} className="underline disabled:opacity-50"
              onClick={()=>void loadEvidence()}>Refresh recent activity</button>
            {evidence.items.length===0&&<p>No recent notification records.</p>}
            <ul className="max-h-36 overflow-auto space-y-2">
              {evidence.items.map(item=><li key={item.notificationId} className="border-b pb-2 text-xs text-gray-700">
                <span>{new Date(item.createdAt).toLocaleString()}</span> · Queue: {item.queueState.toLowerCase().replaceAll('_',' ')}.
                {' '}Socket hint: {item.socketHint.state==='DISPATCH_RECORDED'?'dispatch recorded':'not recorded'}.
                {' '}Device delivery: not recorded. Read: {item.readAcknowledgement.state==='ACKNOWLEDGED'?'acknowledged':'not recorded'}.
              </li>)}
            </ul>
            {evidence.nextBeforeId&&<button type="button" disabled={loadingEvidence} className="underline disabled:opacity-50"
              onClick={()=>void loadEvidence(evidence.nextBeforeId!)}>Load earlier activity</button>}
          </>}
        </div>
      </>}
      {pending&&<button type="button" disabled={saving} onClick={()=>void save(pending)} className="underline disabled:opacity-50">Retry same change</button>}
      {notice&&<p role="status" className="text-amber-800">{notice}</p>}
    </div>}
  </section>;
}
