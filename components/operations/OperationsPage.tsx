import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Helmet} from 'react-helmet-async';
import OperationsShell, {operationsDeskPath, type OperationsShellState,type OperationsShellProps} from './OperationsShell.js';
import {assignmentActionResponseSchema,operationsWorkspaceSchema, type OperationsDeskId} from '../../src/shared/iam/workspace.js';
import {diagnosticIdSchema} from '../../src/shared/platform/apiError.js';
import WorkforceSignIn from './WorkforceSignIn.js';
import ServiceDesk from './ServiceDesk.js';
import WorkforceWorkspace from './WorkforceWorkspace.js';

const CampaignStudio = React.lazy(() => import('../marketing/CampaignStudio.js'));
const AdtechWorkspace = React.lazy(() => import('../marketing/AdtechWorkspace.js'));
const AdminCreativeWorkspace = React.lazy(() => import('../marketing/CreativeWorkspace.js').then(m => ({ default: m.AdminCreativeWorkspace })));
const AdminSettlementWorkspace = React.lazy(() => import('../marketing/SettlementWorkspace.js').then(m => ({ default: m.AdminSettlementWorkspace })));

/** Staff identity uses a separate HttpOnly cookie; consumer tokens/caches are never read. */
export default function OperationsPage() {
  const [state, setState] = useState<OperationsShellState>({status:'LOADING'});
  const [signingIn,setSigningIn]=useState(false);
  const signingOut=useRef(false);
  const stateRef=useRef(state);useLayoutEffect(()=>{stateRef.current=state;},[state]);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [desk, setDesk] = useState(() => window.location.pathname.split('/')[2] || 'my-work');
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (background = false) => {
    if(signingOut.current)return;
    request.current?.abort();
    const active = new AbortController();
    request.current = active;
    if (!background) setState({status:'LOADING'});
    try {
      const response = await fetch('/api/operations/v1/workspace', {credentials:'same-origin', cache:'no-store', signal:AbortSignal.any([active.signal, AbortSignal.timeout(12_000)])});
      const correlation = diagnosticIdSchema.safeParse(response.headers.get('x-correlation-id'));
      if (active.signal.aborted) return;
      if (!response.ok) {
        setState({status:response.status === 401 ? 'SESSION_STALE' : response.status === 403 ? 'ACCESS_DENIED' : response.status === 503 ? 'UNAVAILABLE' : 'ERROR',
          ...(correlation.success ? {correlationId:correlation.data} : {})});
        return;
      }
      const workspace = operationsWorkspaceSchema.parse(await response.json());
      if (!active.signal.aborted) setState({status:'READY', workspace});
    } catch {
      if (!active.signal.aborted) setState({status:'ERROR'});
    }
  }, []);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    const navigation = () => setDesk(window.location.pathname.split('/')[2] || 'my-work');
    const visible = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30_000);
    window.addEventListener('popstate', navigation);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); window.removeEventListener('popstate', navigation); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  const navigate = (next: OperationsDeskId) => { window.history.pushState(null, '', operationsDeskPath(next)); setDesk(next); };
  const assignment:NonNullable<OperationsShellProps['onAssignmentAction']>=async command=>{
    const snapshot=stateRef.current;
    const projected=snapshot.status==='READY'?operationsWorkspaceSchema.safeParse(snapshot.workspace):null;
    if(!projected?.success)return {status:'REJECTED'};
    const current=()=>{
      const state=stateRef.current;
      const now=state.status==='READY'?operationsWorkspaceSchema.safeParse(state.workspace):null;
      return mounted.current&&now?.success===true
        &&now.data.member.membershipId===projected.data.member.membershipId
        &&now.data.organization.id===projected.data.organization.id
        &&now.data.session.id===projected.data.session.id
        &&now.data.session.expiresAt===projected.data.session.expiresAt;
    };
    const response=await fetch(`/api/operations/v1/assignments/${command.assignmentId}/actions`,{
      method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'},body:JSON.stringify(command),
    });
    if(!current())throw new Error('Workforce session changed while the command was pending.');
    if(!response.ok){
      if(response.status===401)setState({status:'SESSION_STALE'});
      if(response.status>=500)throw new Error('Assignment outcome could not be confirmed.');
      return {status:'REJECTED'};
    }
    const result=assignmentActionResponseSchema.parse(await response.json());
    if(!current())throw new Error('Workforce session changed while the receipt was pending.');
    if(result.receipt.assignmentId!==command.assignmentId||result.receipt.operation!==command.action
      ||result.receipt.version<=command.expectedVersion||BigInt(result.receipt.fence)<=BigInt(command.expectedFence)){
      throw new Error('Assignment receipt did not match the submitted command.');
    }
    return {status:'ACCEPTED'};
  };
  const logout=async()=>{
    if(signingOut.current)return;
    signingOut.current=true;request.current?.abort();setState({status:'LOADING'});
    try{
      const response=await fetch('/api/operations/v1/session/logout',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),
        headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'},body:'{}'});
      if(!mounted.current)return;
      if(response.ok||response.status===401){request.current?.abort();setState({status:'SESSION_STALE'});}
      else setState({status:'ERROR'});
    }catch{if(mounted.current)setState({status:'ERROR'});}
    finally{signingOut.current=false;}
  };
  const [hasInvite] = useState(() => {
    try {
      return Boolean(new URLSearchParams(window.location.search).get('invite'));
    } catch {
      return false;
    }
  });

  return <><Helmet><title>Encho Operations</title><meta name="robots" content="noindex,nofollow"/></Helmet>
    {signingIn ? (
      <WorkforceSignIn autoStart={true} onComplete={() => { setSigningIn(false); void load(); }} onCancel={() => setSigningIn(false)} />
    ) : (hasInvite && state.status === 'SESSION_STALE') ? (
      <main className="ops-shell ops-fallback" aria-labelledby="workforce-onboarding-title">
        <span className="ops-eyebrow">Encho Operations</span>
        <div className="ops-fallback-mark" aria-hidden="true">E</div>
        <h1 id="workforce-onboarding-title">Welcome to the Encho Operations Team</h1>
        <p>Sign in with your invited Google account to activate your workforce session and access your assigned desk.</p>
        <div className="ops-actions">
          <button type="button" className="ops-button ops-primary" onClick={() => setSigningIn(true)}>
            Activate Workforce Access
          </button>
          <button type="button" className="ops-button" onClick={() => void load()}>
            Refresh workspace
          </button>
        </div>
        <p className="ops-secondary">Staff access is strictly isolated from guest and host accounts. All actions are logged and auditable.</p>
      </main>
    ) : (
      <OperationsShell state={state} activeDeskId={desk} onNavigate={navigate} onAssignmentAction={assignment} onRefresh={() => {void load();}} onSignIn={()=>setSigningIn(true)} onSignOut={()=>void logout()}
        renderDesk={(selected, workspace) => {
          switch (selected) {
            case 'service':
              return <ServiceDesk workspace={workspace} onRefresh={() => void load(true)}/>;
            case 'workforce':
              return <WorkforceWorkspace workspace={workspace} onRefreshWorkspace={() => void load(true)}/>;
            case 'flight':
              return (
                <React.Suspense fallback={<div className="ops-loading-panel" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>Loading campaign flights workspace…</div>}>
                  <CampaignStudio />
                </React.Suspense>
              );
            case 'strategy':
              return (
                <React.Suspense fallback={<div className="ops-loading-panel" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>Loading strategy control center…</div>}>
                  <AdtechWorkspace />
                </React.Suspense>
              );
            case 'creative':
              return (
                <React.Suspense fallback={<div className="ops-loading-panel" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>Loading creative review workspace…</div>}>
                  <AdminCreativeWorkspace />
                </React.Suspense>
              );
            case 'finance':
              return (
                <React.Suspense fallback={<div className="ops-loading-panel" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>Loading financial settlement workspace…</div>}>
                  <AdminSettlementWorkspace />
                </React.Suspense>
              );
            default:
              return null;
          }
        }}/>
    )}
  </>;
}
