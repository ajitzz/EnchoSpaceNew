import type pg from 'pg';
import {z} from 'zod';
import type {PrincipalContext} from '../../shared/iam/principalContext.js';
import {workforceEnvironmentSchema, workforcePermissionCodeSchema, type WorkforcePermissionCode} from '../../shared/iam/contracts.js';
import {operationsWorkspaceSchema, type OperationsDeskId, type OperationsWorkspace} from '../../shared/iam/workspace.js';

export const ROLE_AUTHORIZED_DESKS: Record<string, OperationsDeskId[]> = {
  platform_owner: ['workforce', 'audit', 'incident', 'my-work'],
  strategy_architect: ['strategy', 'my-work'],
  strategy_publisher: ['strategy', 'my-work'],
  campaign_operator: ['flight', 'my-work'],
  creative_policy_reviewer: ['creative', 'my-work'],
  campaign_approver: ['flight', 'my-work'],
  provider_operator: ['provider', 'my-work'],
  finance_risk_reviewer: ['finance', 'my-work'],
  incident_commander: ['incident', 'my-work'],
  support_analyst: ['service', 'my-work'],
  auditor: ['audit', 'my-work'],
};

const deskForPermission = (permission: WorkforcePermissionCode): OperationsDeskId => {
  const prefix = permission.split('.')[0];
  return ({workforce: 'workforce', work: 'my-work', listing: 'creative', strategy: 'strategy', corridor: 'strategy',
    creative: 'creative', campaign: 'flight', provider: 'provider', finance: 'finance', service: 'service',
    audit: 'audit', incident: 'incident'} as Record<string, OperationsDeskId>)[prefix] ?? 'my-work';
};

/** Use only inside StaffSessionReader.read; all rows remain under fenced RLS. */
export async function projectOperationsWorkspace(client: pg.PoolClient, principal: PrincipalContext,
  expiresAt: Date, environment: z.infer<typeof workforceEnvironmentSchema>,commandsEnabled=false): Promise<OperationsWorkspace> {
  const organization = (await client.query<{display_name: string}>('SELECT display_name FROM internal_organizations WHERE id=$1', [principal.organizationId])).rows[0];
  if (!organization) throw new Error('WORKFORCE_PROJECTION_UNAVAILABLE');
  const rows = (await client.query<{permission_code: string; role_key: string | null}>(`SELECT DISTINCT p.permission_code, d.role_key
    FROM internal_membership_grants g
    JOIN internal_role_permissions p ON p.role_version_id=g.role_version_id
    JOIN internal_permission_catalog c ON c.permission_code=p.permission_code AND c.active
    LEFT JOIN internal_role_versions v ON v.id=g.role_version_id
    LEFT JOIN internal_role_definitions d ON d.id=v.role_id
    WHERE g.membership_id=$1 AND g.organization_id=$2 AND g.environment=$3
      AND g.valid_from<=clock_timestamp() AND (g.valid_until IS NULL OR g.valid_until>clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations r WHERE r.grant_id=g.id)
    ORDER BY p.permission_code`, [principal.membershipId, principal.organizationId, environment])).rows;

  const grantedRoles = new Set<string>();
  for (const row of rows) {
    if (row.role_key) grantedRoles.add(row.role_key);
  }

  // Authoritative role-to-desk whitelist enforcing strict departmental isolation
  const allowedDesks = new Set<OperationsDeskId>(['my-work']);
  if (grantedRoles.size > 0) {
    for (const roleKey of grantedRoles) {
      const desks = ROLE_AUTHORIZED_DESKS[roleKey];
      if (desks) {
        for (const d of desks) allowedDesks.add(d);
      }
    }
  }

  // This is navigation evidence only. Exact scope/provider/amount and step-up
  // remain command-specific; the UI cannot turn a desk label into authority.
  const byDesk = new Map<OperationsDeskId, WorkforcePermissionCode[]>([['my-work', []]]);
  for (const row of rows) {
    const permission = workforcePermissionCodeSchema.parse(row.permission_code);
    const desk = deskForPermission(permission);
    // Strict zero-trust filter: Only attach permissions to desks within the member's department
    if (grantedRoles.size === 0 || allowedDesks.has(desk)) {
      byDesk.set(desk, [...(byDesk.get(desk) ?? []), permission]);
    }
  }
  const mayReadWork = (await client.query<{allowed: boolean}>(`SELECT internal_iam_has_permission(
    $1,'work.assignment.read','WORKFORCE',$2,NULL,$3,NULL) AS allowed`, [principal.organizationId, principal.organizationId, environment])).rows[0]?.allowed === true;
  const assignments = mayReadWork ? (await client.query<{
    id: string; resource_type: string; resource_id: string; state: string; version: number; fence: string;
    created_at: Date; lease_until: Date | null; may_claim:boolean;
  }>(`SELECT id,resource_type,resource_id,state,version,fence::text,created_at,lease_until,
    (required_permission_code IS NOT NULL
      AND internal_iam_has_permission(organization_id,'work.assignment.claim','WORKFORCE',organization_id::text,NULL,$3,NULL)
      AND internal_iam_has_permission(organization_id,required_permission_code,resource_type,resource_id,provider,$3,NULL)) AS may_claim
    FROM internal_work_assignments WHERE organization_id=$1 AND assignee_membership_id=$2 AND state IN ('ASSIGNED','CLAIMED')
    AND environment=$3 ORDER BY created_at,id LIMIT 100`, [principal.organizationId, principal.membershipId,environment])).rows : [];
  const total = mayReadWork ? Number((await client.query<{total: string}>(`SELECT count(*)::text AS total
    FROM internal_work_assignments WHERE organization_id=$1 AND assignee_membership_id=$2 AND state IN ('ASSIGNED','CLAIMED') AND environment=$3`,
  [principal.organizationId, principal.membershipId,environment])).rows[0].total) : 0;
  const now = new Date();
  const policy = (await client.query<{approval_status: string}>(`SELECT v.approval_status FROM internal_iam_current_policy p
    JOIN internal_iam_policy_versions v ON v.id=p.version_id WHERE p.singleton`)).rows[0];
  return operationsWorkspaceSchema.parse({
    schemaVersion: 1, generatedAt: now.toISOString(), freshUntil: new Date(now.getTime() + 30_000).toISOString(),
    correlationId: principal.correlationId,
    organization: {id: principal.organizationId, displayName: organization.display_name},
    member: {membershipId: principal.membershipId, state: 'ACTIVE'}, session: {id:principal.sessionId,state: 'ACTIVE', expiresAt: expiresAt.toISOString()},
    desks: [...byDesk].map(([id, permittedActions]) => ({id, permittedActions})),
    work: {items: assignments.map(row => ({
      id: row.id, deskId:row.resource_type==='SERVICE_CASE'&&byDesk.has('service')?'service':'my-work', title: `${row.resource_type.toLowerCase().replaceAll('_', ' ')} assignment`,
      resource:{type:row.resource_type,id:row.resource_id},
      resourceLabel: `${row.resource_type}: ${row.resource_id}`, state: row.state, priority: 'NORMAL',
      version: row.version, fence: row.fence, assignedAt: row.created_at.toISOString(), dueAt: null,
      leaseExpiresAt: row.lease_until?.toISOString() ?? null,
      permittedActions:commandsEnabled&&row.may_claim?[row.state==='CLAIMED'&&row.lease_until&&row.lease_until>now?'RELEASE':'CLAIM']:[],
      blockers:!commandsEnabled?['Assignment commands are not enabled in this rollout.']:!row.may_claim?['Current permission and an exact assignment binding are required.']:[],
    })), total, nextCursor: null},
    audit: {state: byDesk.has('audit') ? 'UNAVAILABLE' : 'NOT_PERMITTED', latestReceiptAt: null},
    workforce: {state: policy?.approval_status === 'APPROVED' ? 'ACTIVE' : 'REVIEW_REQUIRED',
      explanation: policy?.approval_status === 'APPROVED' ? null : 'Workforce policy is awaiting operational approval; production access remains disabled.'},
  });
}
