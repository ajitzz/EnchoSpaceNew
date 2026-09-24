import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  assignmentActionRequestSchema,
  operationsWorkspaceSchema,
  type AssignmentActionId,
  type AssignmentActionRequest,
  type OperationsAssignment,
  type OperationsDeskId,
  type OperationsWorkspace,
} from '../../src/shared/iam/workspace.js';
import { principalTraceIdSchema } from '../../src/shared/iam/principalContext.js';
import './operations.css';

export type OperationsShellState =
  | { status: 'LOADING' }
  | { status: 'UNAVAILABLE' | 'ACCESS_DENIED' | 'SESSION_STALE' | 'ERROR'; correlationId?: string }
  | { status: 'READY'; workspace: unknown };

export interface OperationsShellProps {
  state: OperationsShellState;
  activeDeskId?: string;
  onNavigate?: (deskId: OperationsDeskId) => void;
  onRefresh: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onLoadMore?: (cursor: string) => void;
  onAssignmentAction?: (request: AssignmentActionRequest) => Promise<{ status: 'ACCEPTED' | 'REJECTED' }>;
  renderDesk?: (deskId: OperationsDeskId, workspace: OperationsWorkspace) => React.ReactNode;
  /** Deterministic clock injection for host containers and isolated UI tests. */
  now?: () => number;
}

const deskPresentation: Record<OperationsDeskId, { name: string; description: string; mark: string }> = {
  'my-work': { name: 'My work', description: 'Assigned work, evidence and the next permitted step.', mark: '01' },
  strategy: { name: 'Strategy', description: 'Versioned programs and audience corridors.', mark: '02' },
  creative: { name: 'Creative & policy', description: 'Exact creative, factual claims and independent review.', mark: '03' },
  flight: { name: 'Campaign flights', description: 'Prepared revisions, paused creation and delivery evidence.', mark: '04' },
  provider: { name: 'Provider operations', description: 'Provider health, readback and reconciliation.', mark: '05' },
  finance: { name: 'Finance & risk', description: 'Funding evidence, exposure and settlement review.', mark: '06' },
  service: { name: 'Service desk', description: 'Assigned guest and host service cases.', mark: '07' },
  incident: { name: 'Incidents', description: 'Safety actions, accountable response and recovery.', mark: '08' },
  audit: { name: 'Audit', description: 'Immutable decisions and authorized access evidence.', mark: '09' },
  workforce: { name: 'Workforce', description: 'Membership, scoped access and periodic review.', mark: '10' },
};
const actionLabels: Record<AssignmentActionId, string> = { OPEN: 'Open work', CLAIM: 'Claim work', RELEASE: 'Release claim', HANDOFF: 'Request handoff' };
const assignmentLabels: Record<OperationsAssignment['state'], string> = {
  ASSIGNED: 'Assigned', CLAIMED: 'Claimed', RELEASED: 'Released', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const fallbackCopy = {
  LOADING: ['Opening your workspace', 'Checking your workforce session and assigned access.'],
  UNAVAILABLE: ['Operations is unavailable', 'The workforce service is not ready. Refresh to check availability.'],
  ACCESS_DENIED: ['This desk is outside your access', 'Your current workforce session does not have access to this workspace. Contact your workforce administrator if this is unexpected.'],
  SESSION_STALE: ['Your workforce session needs renewal', 'Sign in to your workforce session again before continuing.'],
  ERROR: ['We could not load your workspace', 'Refresh to retrieve a new workspace response.'],
} as const;

export function operationsDeskPath(desk: OperationsDeskId): string {
  return desk === 'my-work' ? '/operations' : `/operations/${desk}`;
}
function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function Reference({ value }: { value?: string }) {
  return value && principalTraceIdSchema.safeParse(value).success
    ? <p className="ops-reference">Support reference <code>{value}</code></p> : null;
}
function Fallback({ status, correlationId, onRefresh, onSignIn }: {
  status: keyof typeof fallbackCopy; correlationId?: string; onRefresh: () => void; onSignIn?: () => void;
}) {
  const [title, description] = fallbackCopy[status];
  return <main className="ops-shell ops-fallback" aria-busy={status === 'LOADING'}>
    <span className="ops-eyebrow">Encho / Operations</span>
    <div className="ops-fallback-mark" aria-hidden="true">E</div>
    <h1>{title}</h1><p role={status === 'LOADING' ? 'status' : 'alert'}>{description}</p>
    {status !== 'LOADING' && <div className="ops-actions">
      {status === 'SESSION_STALE' && onSignIn && <button type="button" className="ops-button ops-primary" onClick={onSignIn}>Renew workforce session</button>}
      <button type="button" className="ops-button" onClick={onRefresh}>Refresh workspace</button>
    </div>}
    <Reference value={correlationId}/>
  </main>;
}

/** No account role or locally stored permission is consumed by this component. */
export function OperationsShell(props: OperationsShellProps) {
  const parsed = useMemo(() => props.state.status === 'READY'
    ? operationsWorkspaceSchema.safeParse(props.state.workspace) : null, [props.state]);
  if (props.state.status !== 'READY') return <Fallback {...props.state} onRefresh={props.onRefresh} onSignIn={props.onSignIn}/>;
  if (!parsed?.success) return <Fallback status="ERROR" onRefresh={props.onRefresh}/>;
  // Keying the inner shell prevents an in-flight callback or notice surviving an
  // account/session replacement supplied by the authenticated host container.
  return <ReadyShell key={`${parsed.data.organization.id}:${parsed.data.member.membershipId}:${parsed.data.session.id??''}:${parsed.data.session.expiresAt}`} {...props} workspace={parsed.data}/>;
}

function ReadyShell({ workspace, activeDeskId = 'my-work', onNavigate, onRefresh, onSignIn, onSignOut, onAssignmentAction, onLoadMore, renderDesk, now = Date.now }: OperationsShellProps & { workspace: OperationsWorkspace }) {
  const instance = useId();
  const mainId = `${instance}-work`;
  const [clock, setClock] = useState(now);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const attemptKeys = useRef(new Map<string, string>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const boundaries = [workspace.freshUntil, workspace.session.expiresAt, ...workspace.work.items.flatMap(item => item.leaseExpiresAt ? [item.leaseExpiresAt] : [])]
      .map(Date.parse).filter(time => time > clock);
    const delay = Math.min(60_000, Math.max(20, Math.min(...boundaries) - clock + 20));
    const timer = setTimeout(() => setClock(now()), delay);
    return () => clearTimeout(timer);
  }, [clock, now, workspace]);

  const sessionActive = workspace.session.state === 'ACTIVE' && Date.parse(workspace.session.expiresAt) > clock;
  if (!sessionActive) return <Fallback status="SESSION_STALE" correlationId={workspace.correlationId} onRefresh={onRefresh} onSignIn={onSignIn}/>;
  if (workspace.member.state !== 'ACTIVE') return <Fallback status="ACCESS_DENIED" correlationId={workspace.correlationId} onRefresh={onRefresh}/>;
  const selectedDesk = workspace.desks.find(desk => desk.id === activeDeskId);
  if (!selectedDesk) return <Fallback status="ACCESS_DENIED" correlationId={workspace.correlationId} onRefresh={onRefresh}/>;
  const isFresh = Date.parse(workspace.freshUntil) > clock;
  const desk = deskPresentation[selectedDesk.id];
  const items = selectedDesk.id === 'my-work' ? workspace.work.items : workspace.work.items.filter(item => item.deskId === selectedDesk.id);
  const commandDisabledReason = (item: OperationsAssignment, action: AssignmentActionId): string | null => {
    if (!isFresh) return 'Refresh workspace evidence before taking action.';
    if (!onAssignmentAction) return 'This action is not connected to an available operations service.';
    if (pendingId !== null) return 'Wait for the current request to finish.';
    if (item.state === 'CLAIMED' && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) <= clock && !['OPEN','CLAIM'].includes(action)) return 'This claim expired. Refresh to retrieve current ownership.';
    if (action === 'CLAIM' && !(item.state === 'ASSIGNED'||(item.state==='CLAIMED'&&item.leaseExpiresAt&&Date.parse(item.leaseExpiresAt)<=clock))) return 'Only an assigned item can be claimed.';
    if ((action === 'RELEASE' || action === 'HANDOFF') && item.state !== 'CLAIMED') return 'Claim this work before releasing or handing it off.';
    if (item.blockers.length > 0 && action !== 'OPEN' && action !== 'RELEASE') return 'Resolve the listed requirements before this action.';
    return null;
  };
  const perform = async (item: OperationsAssignment, action: AssignmentActionId) => {
    if (!onAssignmentAction || inFlight.current || !item.permittedActions.includes(action) || commandDisabledReason(item, action)) return;
    // Refresh authority is still checked by the server. Expired browser evidence
    // only removes an affordance; it cannot extend a server grant or claim lease.
    if (Date.parse(workspace.freshUntil) <= now() || Date.parse(workspace.session.expiresAt) <= now()
      || (!['OPEN','CLAIM'].includes(action) && item.leaseExpiresAt !== null && Date.parse(item.leaseExpiresAt) <= now())) { onRefresh(); return; }
    const identity = `${item.id}:${item.version}:${item.fence}:${action}`;
    if (!attemptKeys.current.has(identity)) attemptKeys.current.set(identity, crypto.randomUUID());
    const request = assignmentActionRequestSchema.parse({ assignmentId: item.id, action, expectedVersion: item.version, expectedFence: item.fence, idempotencyKey: attemptKeys.current.get(identity) });
    inFlight.current = true; setPendingId(item.id); setNotice(null);
    try {
      const receipt = await onAssignmentAction(request);
      if (!mounted.current) return;
      if (receipt.status === 'ACCEPTED') {
        // Until a refreshed version arrives, a repeat of the old projection is
        // the same logical command even when its first receipt was accepted.
        setNotice({ error: false, text: 'Request accepted. Refreshing the current assignment state.' });
        onRefresh();
      } else setNotice({ error: true, text: 'The action was not accepted. Refresh the workspace and review your current access.' });
    } catch {
      if (mounted.current) setNotice({ error: true, text: 'The result could not be confirmed. Refresh the workspace before retrying; the same request identity is retained.' });
    } finally {
      inFlight.current = false;
      if (mounted.current) setPendingId(null);
    }
  };

  return <div className="ops-shell">
    <a className="ops-skip" href={`#${mainId}`}>Skip to assigned work</a>
    <aside className="ops-sidebar">
      <a className="ops-brand" href="/operations" onClick={onNavigate ? event => { event.preventDefault(); onNavigate('my-work'); } : undefined} aria-label="Encho operations home"><span aria-hidden="true">E</span><div>Encho<small>Operations</small></div></a>
      <nav aria-label="Operations desks">{workspace.desks.map(allowedDesk => <a key={allowedDesk.id} href={operationsDeskPath(allowedDesk.id)} aria-current={selectedDesk.id === allowedDesk.id ? 'page' : undefined} onClick={onNavigate ? event => { event.preventDefault(); onNavigate(allowedDesk.id); } : undefined}>
        <span aria-hidden="true">{deskPresentation[allowedDesk.id].mark}</span>{deskPresentation[allowedDesk.id].name}
      </a>)}</nav>
      <div className="ops-identity"><strong>{workspace.member.displayName ?? 'Team member'}</strong><span>{workspace.organization.displayName}</span><span className="ops-session-dot">Workforce session active</span></div>
    </aside>
    <main id={mainId} className="ops-main" tabIndex={-1}>
      <header className="ops-header"><div><span className="ops-eyebrow">Encho / {workspace.organization.displayName}</span><h1>{desk.name}</h1><p>{desk.description}</p></div><div className="ops-actions"><button type="button" className="ops-button" onClick={onRefresh}>Refresh workspace</button>{onSignOut&&<button type="button" className="ops-button" onClick={onSignOut}>Sign out of Operations</button>}</div></header>
      <div className="ops-evidence"><span className={`ops-pill ${isFresh ? '' : 'ops-pill-warning'}`}>{isFresh ? 'Current workspace evidence' : 'Workspace evidence is stale'}</span><span>Checked <time dateTime={workspace.generatedAt}>{timeLabel(workspace.generatedAt)}</time></span><span>Session ends <time dateTime={workspace.session.expiresAt}>{timeLabel(workspace.session.expiresAt)}</time></span></div>
      {!isFresh && <p className="ops-banner" role="status">This view is read-only until refreshed. Current access and assignment ownership must be checked again.</p>}
      {notice && <p className={`ops-banner ${notice.error ? 'ops-banner-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {renderDesk && isFresh && selectedDesk.id !== 'my-work' && <section className="ops-domain-workspace" aria-label={`${desk.name} workspace`}>{renderDesk(selectedDesk.id, workspace)}</section>}
      <div className="ops-work-layout"><section className="ops-work-list" aria-labelledby={`${instance}-queue-title`}>
        <div className="ops-section-heading"><div><span className="ops-eyebrow">Your permitted scope</span><h2 id={`${instance}-queue-title`}>{selectedDesk.id === 'my-work' ? 'Assigned to you' : `${desk.name} work`}</h2></div><span className="ops-count">{selectedDesk.id === 'my-work' && workspace.work.total !== null ? `${workspace.work.total} assigned` : `${items.length} on this page`}</span></div>
        <p className="ops-secondary">Ordered by the operations service. Open an item to review its source evidence before making a decision.</p>
        {items.length === 0 && <div className="ops-empty"><span aria-hidden="true">✓</span><h3>No assigned work in this view</h3><p>New assignments appear here when they are available within your access.</p></div>}
        <ol className="ops-assignment-list">{items.map(item => {
          const expired = item.leaseExpiresAt !== null && Date.parse(item.leaseExpiresAt) <= clock;
          return <li key={item.id}><article className="ops-assignment" aria-labelledby={`${instance}-${item.id}`} aria-busy={pendingId === item.id}>
            <div className="ops-assignment-top"><span className={`ops-pill ops-priority-${item.priority.toLowerCase()}`}>{item.priority.toLowerCase()} priority</span><span className="ops-secondary">{deskPresentation[item.deskId].name}</span></div>
            <h3 id={`${instance}-${item.id}`}>{item.title}</h3><p className="ops-resource">{item.resourceLabel}</p>
            <dl className="ops-assignment-meta"><div><dt>State</dt><dd>{expired ? 'Claim expired' : assignmentLabels[item.state]}</dd></div><div><dt>Assigned</dt><dd><time dateTime={item.assignedAt}>{timeLabel(item.assignedAt)}</time></dd></div>{item.dueAt && <div><dt>Due</dt><dd><time dateTime={item.dueAt}>{timeLabel(item.dueAt)}</time></dd></div>}{item.leaseExpiresAt && <div><dt>Claim until</dt><dd><time dateTime={item.leaseExpiresAt}>{timeLabel(item.leaseExpiresAt)}</time></dd></div>}</dl>
            {item.blockers.length > 0 && <div className="ops-requirements"><strong>Before the next action</strong><ul>{item.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div>}
            <div className="ops-actions">{item.permittedActions.map(action => {
              const reason = commandDisabledReason(item, action);
              const descriptionId = `${instance}-${item.id}-${action}-reason`;
              return <div className="ops-action-with-reason" key={action}><button type="button" className={`ops-button ${action === 'CLAIM' ? 'ops-primary' : ''}`} disabled={Boolean(reason)} aria-describedby={reason ? descriptionId : undefined} aria-label={`${actionLabels[action]}: ${item.title}`} onClick={() => void perform(item, action)}>{pendingId === item.id ? 'Submitting…' : actionLabels[action]}</button>{reason && <span id={descriptionId} className="ops-action-reason">{reason}</span>}</div>;
            })}{item.permittedActions.length === 0 && <p className="ops-secondary">No actions are currently available for this assignment.</p>}</div>
          </article></li>;
        })}</ol>
        {workspace.work.nextCursor && onLoadMore && <button type="button" className="ops-button ops-load-more" disabled={!isFresh || Boolean(pendingId)} onClick={() => onLoadMore(workspace.work.nextCursor!)}>Load more assigned work</button>}
      </section><aside className="ops-context" aria-label="Workforce and audit evidence"><section className="ops-context-card"><span className="ops-eyebrow">Access and accountability</span><h2>Workforce status</h2><p className="ops-workforce-state">{workspace.workforce.state === 'ACTIVE' ? 'Access is active' : workspace.workforce.state === 'REVIEW_REQUIRED' ? 'Access review required' : 'Access is restricted'}</p>{workspace.workforce.explanation && <p>{workspace.workforce.explanation}</p>}<p className="ops-secondary">Every action is checked again against your current membership, assigned resource and required approvals.</p></section><section className="ops-context-card"><h2>Audit evidence</h2>{workspace.audit.state === 'AVAILABLE' ? <p>{workspace.audit.latestReceiptAt ? <>Latest visible receipt <time dateTime={workspace.audit.latestReceiptAt}>{timeLabel(workspace.audit.latestReceiptAt)}</time></> : 'No audit receipt is available in this response.'}</p> : <p>{workspace.audit.state === 'NOT_PERMITTED' ? 'Audit records are outside your current access.' : 'Audit evidence is temporarily unavailable.'}</p>}<Reference value={workspace.correlationId}/></section></aside></div>
    </main>
  </div>;
}

export default OperationsShell;
