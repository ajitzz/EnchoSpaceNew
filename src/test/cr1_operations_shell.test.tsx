import React from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

import { OperationsShell, operationsDeskPath, type OperationsShellProps } from '../../components/operations/OperationsShell.js';
import { operationsWorkspaceSchema, type OperationsWorkspace } from '../shared/iam/workspace.js';

// Initialize DOM after the legacy Node setup; its SQL fixture loader requires
// native file URLs and must not execute inside a jsdom-transformed module.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://encho.test/operations' });
vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react');
afterAll(async () => {
  // React's scheduler can finish a queued task after synchronous cleanup.
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  dom.window.close();
  vi.unstubAllGlobals();
});

const baseTime = Date.parse('2026-09-24T10:00:00Z');
const assignmentId = '11111111-1111-4111-8111-111111111111';
function workspace(): OperationsWorkspace {
  return {
    schemaVersion: 1, generatedAt: '2026-09-24T10:00:00Z', freshUntil: '2026-09-24T10:05:00Z', correlationId: 'test.operation:1',
    organization: { id: '22222222-2222-4222-8222-222222222222', displayName: 'Test organization' },
    member: { membershipId: '33333333-3333-4333-8333-333333333333', displayName: 'Test operator', state: 'ACTIVE' },
    session: { state: 'ACTIVE', expiresAt: '2026-09-24T11:00:00Z' },
    desks: [{ id: 'my-work', permittedActions: ['work.assignment.read'] }, { id: 'creative', permittedActions: ['creative.read', 'creative.review'] }],
    work: { items: [{ id: assignmentId, deskId: 'creative', title: 'Review exact campaign creative', resourceLabel: 'Test stay / Campaign revision 3', state: 'ASSIGNED', priority: 'HIGH', version: 3, fence: '7', assignedAt: '2026-09-24T09:00:00Z', dueAt: null, leaseExpiresAt: null, permittedActions: ['OPEN', 'CLAIM'], blockers: [] }], nextCursor: null, total: 1 },
    audit: { state: 'NOT_PERMITTED', latestReceiptAt: null },
    workforce: { state: 'ACTIVE', explanation: null },
  };
}
function mount(data = workspace(), props: Partial<OperationsShellProps> = {}) {
  const refresh = vi.fn();
  const view = render(<OperationsShell state={{ status: 'READY', workspace: data }} now={() => baseTime} onRefresh={refresh} {...props}/>);
  return { ...view, refresh };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('CR1 operations workspace projection', () => {
  it('accepts the bounded server projection and shared diagnostic ID vocabulary', () => {
    expect(operationsWorkspaceSchema.parse(workspace()).correlationId).toBe('test.operation:1');
  });
  it('rejects role/secret injection, duplicate desks, scope mismatch and contradictory claim evidence', () => {
    expect(operationsWorkspaceSchema.safeParse({ ...workspace(), role: 'admin' }).success).toBe(false);
    expect(operationsWorkspaceSchema.safeParse({ ...workspace(), accessToken: 'never-client-visible' }).success).toBe(false);
    const duplicated = workspace(); duplicated.desks.push(duplicated.desks[0]);
    expect(operationsWorkspaceSchema.safeParse(duplicated).success).toBe(false);
    const outside = workspace(); outside.work.items[0].deskId = 'finance';
    expect(operationsWorkspaceSchema.safeParse(outside).success).toBe(false);
    const invalidClaim = workspace(); invalidClaim.work.items[0].state = 'CLAIMED';
    expect(operationsWorkspaceSchema.safeParse(invalidClaim).success).toBe(false);
  });
  it('rejects audit details without available evidence and mutation affordances on completed assignments', () => {
    const invalidAudit = workspace(); invalidAudit.audit.latestReceiptAt = '2026-09-24T09:00:00Z';
    expect(operationsWorkspaceSchema.safeParse(invalidAudit).success).toBe(false);
    const completed = workspace(); completed.work.items[0].state = 'COMPLETED';
    expect(operationsWorkspaceSchema.safeParse(completed).success).toBe(false);
  });
});

describe('CR1 Operations Shell', () => {
  it('renders only the server-projected desks and assigned work without legacy-role inference', () => {
    mount();
    const nav = screen.getByRole('navigation', { name: 'Operations desks' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    expect(within(nav).queryByRole('link', { name: 'Finance & risk' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Review exact campaign creative' })).toBeTruthy();
    expect(screen.getByText('Audit records are outside your current access.')).toBeTruthy();
  });
  it('denies an unprojected deep link without exposing the assigned item', () => {
    mount(workspace(), { activeDeskId: 'finance' });
    expect(screen.getByRole('heading', { name: 'This desk is outside your access' })).toBeTruthy();
    expect(screen.queryByText('Review exact campaign creative')).toBeNull();
  });
  it('uses fixed deep links and navigation callbacks for permitted desks', () => {
    const navigate = vi.fn(); mount(workspace(), { onNavigate: navigate });
    const link = within(screen.getByRole('navigation')).getByRole('link', { name: 'Creative & policy' });
    expect(link.getAttribute('href')).toBe('/operations/creative');
    fireEvent.click(link); expect(navigate).toHaveBeenCalledWith('creative');
    expect(operationsDeskPath('my-work')).toBe('/operations');
    expect(screen.getByRole('link', { name: 'Skip to assigned work' }).getAttribute('href')).toMatch(/^#/);
  });
  it('renders a truthful empty queue and never inserts demonstration assignments', () => {
    const data = workspace(); data.work = { items: [], nextCursor: null, total: 0 }; mount(data);
    expect(screen.getByRole('heading', { name: 'No assigned work in this view' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Claim work:/ })).toBeNull();
  });
  it('does not manufacture controls when the service projects no executable actions', () => {
    const data = workspace(); data.work.items[0].permittedActions = []; mount(data);
    expect(screen.getByText('No actions are currently available for this assignment.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Claim work:/ })).toBeNull();
  });
  it('explains an unavailable action service and blocks callback execution', () => {
    mount(); const claim = screen.getByRole('button', { name: /Claim work:/ });
    expect(claim.hasAttribute('disabled')).toBe(true);
    expect(document.getElementById(claim.getAttribute('aria-describedby')!)?.textContent).toContain('not connected');
  });
  it('disables stale workspace actions and does not mount a privileged embedded workspace', () => {
    const data = workspace(); data.generatedAt = '2026-09-24T09:00:00Z'; data.freshUntil = '2026-09-24T09:30:00Z';
    const action = vi.fn(); const embed = vi.fn(); mount(data, { activeDeskId: 'creative', onAssignmentAction: action, renderDesk: embed });
    expect(screen.getByText('Workspace evidence is stale')).toBeTruthy();
    const claim = screen.getByRole('button', { name: /Claim work:/ }); fireEvent.click(claim);
    expect(action).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled();
  });
  it('rejects expired workforce sessions and suspended membership before rendering private work', () => {
    const expired = workspace(); expired.session.expiresAt = '2026-09-24T09:59:00Z';
    const first = mount(expired); expect(screen.getByRole('heading', { name: 'Your workforce session needs renewal' })).toBeTruthy();
    expect(screen.queryByText('Review exact campaign creative')).toBeNull(); first.unmount();
    const suspended = workspace(); suspended.member.state = 'SUSPENDED'; mount(suspended);
    expect(screen.getByRole('heading', { name: 'This desk is outside your access' })).toBeTruthy();
  });
  it('shows claim expiry and suppresses a release after its lease has ended', () => {
    const data = workspace(); data.work.items[0] = { ...data.work.items[0], state: 'CLAIMED', leaseExpiresAt: '2026-09-24T09:59:00Z', permittedActions: ['OPEN', 'RELEASE'] };
    mount(data, { onAssignmentAction: vi.fn() });
    expect(screen.getByText('Claim expired')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Release claim:/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Open work:/ }).hasAttribute('disabled')).toBe(false);
  });
  it('submits a claim with the observed fence/version once and waits for canonical refreshed state', async () => {
    let settle: ((value: { status: 'ACCEPTED' }) => void) | undefined;
    const action = vi.fn<NonNullable<OperationsShellProps['onAssignmentAction']>>(() => new Promise<{ status: 'ACCEPTED' }>(resolve => { settle = resolve; }));
    const { refresh } = mount(workspace(), { onAssignmentAction: action });
    const button = screen.getByRole('button', { name: /Claim work:/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0]).toMatchObject({ assignmentId, action: 'CLAIM', expectedVersion: 3, expectedFence: '7' });
    expect(action.mock.calls[0][0]).toHaveProperty('idempotencyKey');
    settle?.({ status: 'ACCEPTED' });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Assigned', { selector: 'dd' })).toBeTruthy();
    expect(screen.queryByText('Claimed')).toBeNull();
  });
  it('retains request identity after an unknown result instead of exposing the raw failure', async () => {
    const action = vi.fn().mockRejectedValue(new Error('Bearer private-secret provider-account-123'));
    mount(workspace(), { onAssignmentAction: action });
    fireEvent.click(screen.getByRole('button', { name: /Claim work:/ }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/private-secret/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /Claim work:/ }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Claim work:/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1][0].idempotencyKey).toBe(action.mock.calls[0][0].idempotencyKey);
  });
  it('keeps an accepted command identity until refreshed canonical version evidence arrives', async () => {
    const action = vi.fn<NonNullable<OperationsShellProps['onAssignmentAction']>>().mockResolvedValue({ status: 'ACCEPTED' });
    const { refresh } = mount(workspace(), { onAssignmentAction: action });
    fireEvent.click(screen.getByRole('button', { name: /Claim work:/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // A slow/failed refresh must not turn the old projected version into a new command.
    await waitFor(() => expect(screen.getByRole('button', { name: /Claim work:/ }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Claim work:/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1][0].idempotencyKey).toBe(action.mock.calls[0][0].idempotencyKey);
  });
  it('suppresses an old in-flight callback result after the authenticated membership changes', async () => {
    let settle: ((value: { status: 'ACCEPTED' }) => void) | undefined;
    const action = vi.fn<NonNullable<OperationsShellProps['onAssignmentAction']>>(() => new Promise(resolve => { settle = resolve; }));
    const { refresh, rerender } = mount(workspace(), { onAssignmentAction: action });
    fireEvent.click(screen.getByRole('button', { name: /Claim work:/ }));
    const changed = workspace(); changed.member.membershipId = '44444444-4444-4444-8444-444444444444';
    changed.work = { items: [], nextCursor: null, total: 0 };
    rerender(<OperationsShell state={{ status: 'READY', workspace: changed }} now={() => baseTime} onRefresh={refresh} onAssignmentAction={action}/>);
    settle?.({ status: 'ACCEPTED' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'No assigned work in this view' })).toBeTruthy());
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Request accepted. Refreshing the current assignment state.')).toBeNull();
  });
  it('shows blocker explanations and preserves independently permitted read/release controls', () => {
    const data = workspace(); data.work.items[0].blockers = ['The exact creative revision requires an independent checker.'];
    mount(data, { onAssignmentAction: vi.fn() });
    expect(screen.getByText('The exact creative revision requires an independent checker.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claim work:/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Open work:/ }).hasAttribute('disabled')).toBe(false);
  });
  it('offers bounded pagination only when a canonical next cursor is supplied', () => {
    const data = workspace(); data.work.nextCursor = 'opaque-test-cursor'; const load = vi.fn();
    mount(data, { onLoadMore: load }); fireEvent.click(screen.getByRole('button', { name: 'Load more assigned work' }));
    expect(load).toHaveBeenCalledWith('opaque-test-cursor');
  });
  it.each(['LOADING', 'UNAVAILABLE', 'ACCESS_DENIED', 'SESSION_STALE', 'ERROR'] as const)('handles %s without rendering private assignment data', status => {
    const refresh = vi.fn(); render(<OperationsShell state={{ status }} onRefresh={refresh}/>);
    expect(screen.queryByText('Review exact campaign creative')).toBeNull();
    if (status !== 'LOADING') { fireEvent.click(screen.getByRole('button', { name: 'Refresh workspace' })); expect(refresh).toHaveBeenCalledOnce(); }
    else expect(screen.getByRole('status')).toBeTruthy();
  });
  it('fails closed on malformed server projection rather than passing arbitrary data to children', () => {
    render(<OperationsShell state={{ status: 'READY', workspace: { ...workspace(), secret: 'hidden' } }} onRefresh={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: 'We could not load your workspace' })).toBeTruthy();
    expect(screen.queryByText('hidden')).toBeNull();
  });
});
