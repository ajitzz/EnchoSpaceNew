import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsShell } from '../../../components/operations/OperationsShell.js';
import type { AssignmentActionRequest, OperationsWorkspace } from '../../../src/shared/iam/workspace.js';

// Isolated browser fixture only. No authenticated API or production data is loaded.
const initialTime = Date.now();
const iso = (delta: number) => new Date(initialTime + delta).toISOString();
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'ready';
function fixture(): OperationsWorkspace {
  return {
    schemaVersion: 1, generatedAt: iso(-1000), freshUntil: scenario === 'stale' ? iso(-500) : iso(600000), correlationId: 'browser.fixture.1',
    organization: { id: '22222222-2222-4222-8222-222222222222', displayName: 'Encho test operations' },
    member: { membershipId: '33333333-3333-4333-8333-333333333333', displayName: 'Fixture reviewer', state: 'ACTIVE' },
    session: { state: 'ACTIVE', expiresAt: scenario === 'expiry' ? iso(2000) : iso(3600000) },
    desks: [{ id: 'my-work', permittedActions: ['work.assignment.read'] }, { id: 'creative', permittedActions: ['creative.read', 'creative.review'] }, { id: 'service', permittedActions: ['service.read'] }],
    work: { items: scenario === 'empty' ? [] : [
      { id: '11111111-1111-4111-8111-111111111111', deskId: 'creative', title: 'Review exact campaign creative', resourceLabel: 'Fixture forest stay / Creative revision 3', state: 'ASSIGNED', priority: 'HIGH', version: 3, fence: '7', assignedAt: iso(-7200000), dueAt: iso(7200000), leaseExpiresAt: null, permittedActions: ['OPEN', 'CLAIM'], blockers: [] },
      { id: '44444444-4444-4444-8444-444444444444', deskId: 'service', title: 'Review assigned guest inquiry', resourceLabel: 'Fixture coastal stay / Assigned service case', state: 'ASSIGNED', priority: 'NORMAL', version: 1, fence: '0', assignedAt: iso(-3600000), dueAt: null, leaseExpiresAt: null, permittedActions: ['OPEN'], blockers: ['A reply requires the current approved service policy.'] },
    ], nextCursor: null, total: scenario === 'empty' ? 0 : 2 },
    audit: { state: 'NOT_PERMITTED', latestReceiptAt: null }, workforce: { state: 'ACTIVE', explanation: 'Access is limited to assigned creative review and service work.' },
  };
}
function Fixture() {
  const [workspace, setWorkspace] = useState(fixture);
  const [desk, setDesk] = useState('my-work');
  const [request, setRequest] = useState<AssignmentActionRequest | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  return <><OperationsShell state={scenario === 'denied' ? { status: 'ACCESS_DENIED' } : { status: 'READY', workspace }} activeDeskId={desk} onNavigate={setDesk} onRefresh={() => setRefreshes(value => value + 1)} onAssignmentAction={async command => {
    setRequest(command);
    await new Promise(resolve => setTimeout(resolve, 30));
    if (command.action === 'CLAIM') setWorkspace(current => ({ ...current, work: { ...current.work, items: current.work.items.map(item => item.id === command.assignmentId ? { ...item, state: 'CLAIMED', version: item.version + 1, fence: String(Number(item.fence) + 1), leaseExpiresAt: iso(120000), permittedActions: ['OPEN', 'RELEASE'] } : item) } }));
    return { status: 'ACCEPTED' };
  }}/><output data-testid="fixture-receipt" hidden>{JSON.stringify({ request, refreshes })}</output></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
