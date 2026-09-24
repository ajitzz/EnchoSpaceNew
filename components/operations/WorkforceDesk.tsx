import React,{useEffect,useState} from 'react';
import {workforceReviewSchema,type WorkforceReview} from '../../src/shared/iam/workforceReview.js';
import './WorkforceDesk.css';

export type WorkforceReviewSection='members'|'grants'|'invitations';
export type WorkforceDeskState={status:'LOADING'|'ACCESS_DENIED'|'SESSION_STALE'|'UNAVAILABLE'|'ERROR'}|{status:'READY';review:unknown};
export type WorkforceDeskProps={state:WorkforceDeskState;onRefresh:()=>void;
  onPage?:(section:WorkforceReviewSection,cursor:string)=>void;now?:()=>number};
const labels={members:'Members',grants:'Role grants',invitations:'Pending invitations'};
const names:Record<string,string>={'workforce.invite':'Invite staff','workforce.grant':'Change role grants',
  'workforce.suspend':'Suspend or offboard staff','workforce.access_review':'Attest a formal access review'};
const titleCase=(value:string)=>value.toLowerCase().replaceAll('_',' ');
function Timestamp({value}:{value:string|null}){return value?<time dateTime={value}>{new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time>:<>No expiry recorded</>;}

/** Read-only current evidence. A rendered permission is never a mutation grant. */
export default function WorkforceDesk({state,onRefresh,onPage,now=Date.now}:WorkforceDeskProps){
  const [clock,setClock]=useState(()=>now());
  useEffect(()=>{setClock(now());const timer=window.setInterval(()=>setClock(now()),1000);return()=>window.clearInterval(timer);},[now]);
  const parsed=state.status==='READY'?workforceReviewSchema.safeParse(state.review):null;
  if(state.status!=='READY'||!parsed?.success){
    const status=state.status==='READY'?'ERROR':state.status;
    const message={LOADING:'Loading current workforce evidence…',ACCESS_DENIED:'This staff session does not have workforce review access.',
      SESSION_STALE:'Your staff session has ended. Sign in again to view workforce evidence.',
      UNAVAILABLE:'Workforce evidence is unavailable. No access changes have been made.',ERROR:'Workforce evidence could not be verified. Try refreshing.'}[status];
    return <section className="ops-workforce" aria-labelledby="workforce-title"><h2 id="workforce-title">Workforce desk</h2>
      <p role={status==='LOADING'?'status':'alert'}>{message}</p>
      {status!=='LOADING'&&<button className="ops-button" onClick={onRefresh}>Refresh workforce evidence</button>}</section>;
  }
  const data:WorkforceReview=parsed.data,stale=clock>=Date.parse(data.freshUntil);
  const next=(section:WorkforceReviewSection)=>{
    const cursor=data[section].nextCursor;
    return cursor?<button className="ops-button" disabled={stale||!onPage}
      onClick={()=>{if(!stale&&onPage)onPage(section,cursor);}}>Next {labels[section].toLowerCase()}</button>:null;
  };
  const count=(section:WorkforceReviewSection)=><p className="ops-secondary">Showing {data[section].items.length} of {data[section].total} {labels[section].toLowerCase()} · {data[section].nextCursor?'More pages available':'End of this page sequence'}</p>;
  return <section className="ops-workforce" aria-labelledby="workforce-title">
    <header className="ops-section-heading"><div><p className="ops-eyebrow">Organization access</p><h2 id="workforce-title">Workforce desk</h2>
      <p className="ops-secondary">{data.organization.displayName} · {data.environment} evidence</p></div>
      <button className="ops-button" onClick={onRefresh}>Refresh workforce evidence</button></header>
    <div className="ops-workforce-notice"><strong>Current evidence, not an approved access review.</strong>
      <p>Memberships belong to this organization. Role grants and invitations below belong to {data.environment}. Reading this page does not retain, revoke or approve anyone’s access.</p>
      <p>Observed <Timestamp value={data.generatedAt}/></p></div>
    {stale&&<p className="ops-banner" role="status">This evidence is stale. Refresh before relying on it.</p>}
    {data.policy.approvalStatus!=='APPROVED'&&<p className="ops-banner">Operational policy approval is pending. This evidence does not authorize production access.</p>}
    <section aria-labelledby="workforce-members"><h3 id="workforce-members">Members</h3>{count('members')}
      {!data.members.items.length?<p className="ops-empty">No members in this page.</p>:<ul className="ops-workforce-grid">{data.members.items.map(member=><li key={member.id} className="ops-assignment">
        <div className="ops-assignment-top"><strong>Staff account #{member.accountId}</strong><span className="ops-pill">{titleCase(member.effectiveState)}</span></div>
        <dl className="ops-assignment-meta"><div><dt>Membership</dt><dd>{member.id}</dd></div><div><dt>Version</dt><dd>{member.version}</dd></div>
          <div><dt>Accepted</dt><dd><Timestamp value={member.acceptedAt}/></dd></div><div><dt>Expires</dt><dd><Timestamp value={member.expiresAt}/></dd></div></dl>
      </li>)}</ul>}{next('members')}</section>
    <section aria-labelledby="workforce-grants"><h3 id="workforce-grants">Role grants</h3>{count('grants')}
      {!data.grants.items.length?<p className="ops-empty">No role grants in this page.</p>:<ul className="ops-workforce-grid">{data.grants.items.map(grant=><li key={grant.id} className="ops-assignment">
        <div className="ops-assignment-top"><strong>{grant.role.name} · v{grant.role.version}</strong><span className="ops-pill">{titleCase(grant.state)}</span></div>
        <p>Staff account #{grant.accountId}</p><dl className="ops-assignment-meta">
          <div><dt>Scope</dt><dd>{grant.scope.type}: {grant.scope.id}</dd></div><div><dt>Provider</dt><dd>{grant.provider??'No provider restriction'}</dd></div>
          <div><dt>Valid from</dt><dd><Timestamp value={grant.validFrom}/></dd></div><div><dt>Valid until</dt><dd><Timestamp value={grant.validUntil}/></dd></div>
          <div><dt>Amount ceiling</dt><dd>{grant.maxAmountMinor===null?'No amount ceiling on this grant':`${grant.maxAmountMinor} minor units`}</dd></div>
          {grant.revokedAt&&<div><dt>Revoked</dt><dd><Timestamp value={grant.revokedAt}/></dd></div>}</dl>
        <details><summary>Grant identity</summary><p className="ops-reference">{grant.id}</p><p className="ops-reference">Role version {grant.role.versionId}</p></details>
      </li>)}</ul>}{next('grants')}</section>
    <section aria-labelledby="workforce-invitations"><h3 id="workforce-invitations">Pending invitations</h3>{count('invitations')}
      <p className="ops-secondary">Invitation addresses and acceptance secrets are excluded from this review view.</p>
      {!data.invitations.items.length?<p className="ops-empty">No pending invitations in this page.</p>:<ul className="ops-workforce-grid">{data.invitations.items.map(invitation=><li key={invitation.id} className="ops-assignment">
        <strong>{invitation.status==='PENDING'?'Awaiting acceptance':'Expired; stored as pending'}</strong><p className="ops-reference">{invitation.id}</p>
        <dl className="ops-assignment-meta"><div><dt>Created</dt><dd><Timestamp value={invitation.createdAt}/></dd></div><div><dt>Expires</dt><dd><Timestamp value={invitation.expiresAt}/></dd></div></dl>
      </li>)}</ul>}{next('invitations')}</section>
    <aside className="ops-context-card" aria-labelledby="workforce-protected"><h3 id="workforce-protected">Protected access changes</h3>
      <p>Changes require their own exact command, current authority and any identity verification or independent approval below. This desk provides no mutation controls.</p>
      <ul className="ops-workforce-requirements">{data.protectedActions.map(action=><li key={action.permission}><strong>{names[action.permission]??action.permission}</strong>
        <span>{!action.permissionGranted?'Permission not granted':[
          'Current scoped permission recorded',action.stepUpRequired?'additional identity verification required':null,
          action.independentApprovalRequired?'independent approval required':null].filter(Boolean).join(' · ')}</span></li>)}</ul>
    </aside>
    <details><summary>Evidence reference</summary><p className="ops-reference">Correlation {data.correlationId}</p>
      <p className="ops-reference">Read receipt {data.receiptId}</p><p className="ops-reference">Policy {data.policy.hash}</p></details>
  </section>;
}
