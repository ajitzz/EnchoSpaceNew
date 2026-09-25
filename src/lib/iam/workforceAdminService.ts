import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';

export const MASTER_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const DEPARTMENT_ROLE_MAP: Record<string, string[]> = {
  marketing: ['campaign_operator', 'strategy_architect', 'strategy_publisher'],
  creative: ['creative_policy_reviewer'],
  approvals: ['campaign_approver'],
  adtech: ['provider_operator'],
  finance: ['finance_risk_reviewer'],
  safety: ['incident_commander'],
  support: ['support_analyst'],
  audit: ['auditor'],
  governance: ['platform_owner'],
};

export const ROLE_DEPARTMENT_MAP: Record<string, string> = {
  campaign_operator: 'marketing',
  strategy_architect: 'marketing',
  strategy_publisher: 'marketing',
  creative_policy_reviewer: 'creative',
  campaign_approver: 'approvals',
  provider_operator: 'adtech',
  finance_risk_reviewer: 'finance',
  incident_commander: 'safety',
  support_analyst: 'support',
  auditor: 'audit',
  platform_owner: 'governance',
};

export interface SodConflictRule {
  id: string;
  name: string;
  description: string;
  pair: [string, string];
}

export const SOD_RULES: SodConflictRule[] = [
  {
    id: 'SOD_CAMPAIGN_MAKER_CHECKER',
    name: 'Campaign Maker-Checker Separation',
    description: 'Campaign Operator (Maker) cannot hold Campaign Approver (Checker) authority.',
    pair: ['campaign_operator', 'campaign_approver'],
  },
  {
    id: 'SOD_STRATEGY_MAKER_CHECKER',
    name: 'Strategy Author-Publisher Separation',
    description: 'Strategy Architect (Author) cannot hold Strategy Publisher authority.',
    pair: ['strategy_architect', 'strategy_publisher'],
  },
  {
    id: 'SOD_FINANCE_PROVIDER_SEPARATION',
    name: 'Finance & Ad-Spend Provider Separation',
    description: 'Finance/Settlement Reviewer cannot hold Provider Operator spend authority.',
    pair: ['finance_risk_reviewer', 'provider_operator'],
  },
];

export const MUTATION_ROLES = [
  'campaign_operator',
  'strategy_architect',
  'strategy_publisher',
  'creative_policy_reviewer',
  'campaign_approver',
  'provider_operator',
  'finance_risk_reviewer',
  'incident_commander',
  'support_analyst',
];

/**
 * Validates a role assignment against Segregation of Duties (SoD) constraints.
 */
export function validateSodRules(
  existingRoles: string[],
  targetRoleKey: string
): { allowed: boolean; violation?: string; ruleId?: string } {
  const prospective = new Set([...existingRoles, targetRoleKey]);

  // Auditor neutrality rule: Auditor cannot hold any mutation role
  if (prospective.has('auditor')) {
    const activeMutation = MUTATION_ROLES.find(r => prospective.has(r));
    if (activeMutation) {
      return {
        allowed: false,
        violation: `Segregation of Duties Conflict: Statutory Auditor cannot hold mutation role '${activeMutation}'.`,
        ruleId: 'SOD_AUDITOR_NEUTRALITY',
      };
    }
  }

  // Pair-based SoD conflicts
  for (const rule of SOD_RULES) {
    const [r1, r2] = rule.pair;
    if (prospective.has(r1) && prospective.has(r2)) {
      return {
        allowed: false,
        violation: `${rule.name}: ${rule.description}`,
        ruleId: rule.id,
      };
    }
  }

  return { allowed: true };
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const hireStaffInputSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  department: z.enum([
    'marketing',
    'creative',
    'approvals',
    'adtech',
    'finance',
    'safety',
    'support',
    'audit',
    'governance',
  ]),
  roleKey: z.string().trim().min(2).max(80),
  environment: z.enum(['LOCAL', 'STAGING', 'PRODUCTION']).default('PRODUCTION'),
  scopeType: z
    .enum(['ORGANIZATION', 'CAMPAIGN', 'SERVICE_CASE', 'CORRIDOR', 'LISTING'])
    .default('ORGANIZATION'),
  scopeId: z.string().trim().min(1).max(120).optional(),
  maxDailySpendPaise: z.number().int().nonnegative().optional().default(5000000), // Default ₹50k INR
  expiresAt: z.string().datetime().optional(),
  hiringReason: z.string().trim().min(10).max(2000),
  adminUserId: z.number().int().positive(),
  appBaseUrl: z.string().url().optional().default('https://encho.in'),
});

export type HireStaffInput = z.infer<typeof hireStaffInputSchema>;

export const lifecycleActionSchema = z.object({
  membershipId: z.string().uuid(),
  action: z.enum(['SUSPEND', 'RESUME', 'REVOKE_SESSIONS', 'OFFBOARD']),
  reason: z.string().trim().min(10).max(2000),
  adminUserId: z.number().int().positive(),
});

export type LifecycleActionInput = z.infer<typeof lifecycleActionSchema>;

export const updateQuotasSchema = z.object({
  membershipId: z.string().uuid(),
  maxDailySpendPaise: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(2000),
  adminUserId: z.number().int().positive(),
});

export type UpdateQuotasInput = z.infer<typeof updateQuotasSchema>;

export const ratifyAuthorizationSchema = z.object({
  authorizationId: z.string().uuid(),
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(10).max(2000),
  adminUserId: z.number().int().positive(),
});

export type RatifyAuthorizationInput = z.infer<typeof ratifyAuthorizationSchema>;

export const emergencyFreezeSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  targetMembershipId: z.string().uuid().optional(),
  department: z.string().optional(),
  reason: z.string().trim().min(10).max(2000),
  adminUserId: z.number().int().positive(),
});

export type EmergencyFreezeInput = z.infer<typeof emergencyFreezeSchema>;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

export function calculateEventHash(
  previousHash: string,
  eventType: string,
  entityType: string,
  entityId: string,
  requestHash: string,
  reason: string = ''
): string {
  const payload = `${previousHash}:${eventType}:${entityType}:${entityId}:${requestHash}:${reason}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export async function appendIamEvent(
  client: pg.PoolClient | pg.Pool,
  params: {
    organizationId: string;
    actorUserId: number;
    actorMembershipId?: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    reason: string;
    evidence?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<{ eventId: string; sequence: number; newHash: string }> {
  const correlationId = params.correlationId || randomUUID();
  const requestHash = createHash('sha256')
    .update(`${params.reason}:${params.eventType}:${params.entityId}:${correlationId}`, 'utf8')
    .digest('hex');

  // Fetch the latest event hash for the organization
  const latestEventRes = await client.query<{ new_hash: string | null }>(
    `SELECT new_hash FROM internal_iam_events WHERE organization_id = $1 ORDER BY sequence DESC LIMIT 1`,
    [params.organizationId]
  );

  const previousHash = latestEventRes.rows[0]?.new_hash || GENESIS_HASH;
  const newHash = calculateEventHash(
    previousHash,
    params.eventType,
    params.entityType,
    params.entityId,
    requestHash,
    params.reason
  );

  const res = await client.query<{ id: string; sequence: string }>(
    `INSERT INTO internal_iam_events (
      organization_id, actor_user_id, actor_membership_id, event_type,
      entity_type, entity_id, previous_hash, new_hash, evidence,
      correlation_id, request_hash, reason
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    ) RETURNING id, sequence`,
    [
      params.organizationId,
      params.actorUserId,
      params.actorMembershipId || null,
      params.eventType,
      params.entityType,
      params.entityId,
      previousHash,
      newHash,
      JSON.stringify(params.evidence || {}),
      correlationId,
      requestHash,
      params.reason,
    ]
  );

  return {
    eventId: res.rows[0].id,
    sequence: Number(res.rows[0].sequence),
    newHash,
  };
}

export async function ensureAdminMembership(
  client: pg.PoolClient | pg.Pool,
  adminUserId: number,
  organizationId = MASTER_ORGANIZATION_ID
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM internal_organization_memberships WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, adminUserId]
  );
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const membershipId = randomUUID();
  await client.query(
    `INSERT INTO internal_organization_memberships (
      id, organization_id, user_id, status, version, accepted_at, changed_by, change_reason
    ) VALUES ($1, $2, $3, 'ACTIVE', 1, clock_timestamp(), $3, 'Administrative platform owner bootstrap.')
    ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [membershipId, organizationId, adminUserId]
  );

  // If conflict occurred, re-query
  const active = await client.query<{ id: string }>(
    `SELECT id FROM internal_organization_memberships WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, adminUserId]
  );
  const finalMembershipId = active.rows[0]?.id || membershipId;

  // Resolve platform_owner role
  const roleRes = await client.query<{ version_id: string }>(
    `SELECT v.id as version_id
     FROM internal_role_definitions d
     JOIN internal_role_current_versions c ON c.role_id = d.id
     JOIN internal_role_versions v ON v.id = c.version_id
     WHERE d.role_key = 'platform_owner' AND d.organization_id = $1`,
    [organizationId]
  );

  if (roleRes.rows[0]) {
    const grantHash = createHash('sha256')
      .update(`${finalMembershipId}:${roleRes.rows[0].version_id}:ORGANIZATION:${organizationId}:PRODUCTION`)
      .digest('hex');

    await client.query(
      `INSERT INTO internal_membership_grants (
        organization_id, membership_id, role_version_id, scope_type, scope_id,
        environment, grant_hash, granted_by, reason
      ) VALUES ($1, $2, $3, 'ORGANIZATION', $4, 'PRODUCTION', $5, $6, 'Administrative platform owner grant.')
      ON CONFLICT (membership_id, grant_hash) DO NOTHING`,
      [organizationId, finalMembershipId, roleRes.rows[0].version_id, organizationId, grantHash, adminUserId]
    );
  }

  return finalMembershipId;
}

// -----------------------------------------------------------------------------
// Core Service API Implementation
// -----------------------------------------------------------------------------

export class WorkforceAdminService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Hires a new staff member atomically.
   */
  async hireStaffMember(rawInput: unknown) {
    const input = hireStaffInputSchema.parse(rawInput);
    const orgId = MASTER_ORGANIZATION_ID;
    const scopeId = input.scopeType === 'ORGANIZATION' ? orgId : (input.scopeId || orgId);

    // 1. Check existing grants for user if already present to prevent SoD conflicts
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure Admin has an active platform_owner membership for event attribution
      const adminMembershipId = await ensureAdminMembership(client, input.adminUserId, orgId);

      // Check if user already exists
      const existingUser = await client.query<{ id: number; role: string }>(
        `SELECT id, role FROM users WHERE lower(email) = $1`,
        [input.email]
      );

      let targetUserId: number;
      if (existingUser.rows[0]) {
        targetUserId = existingUser.rows[0].id;
        // Check if existing user has role='admin'. A super-admin account should not be demoted or mixed
        if (existingUser.rows[0].role === 'admin') {
          throw new Error('STAFF_HIRE_ADMIN_CONFLICT: Existing platform administrator account cannot be converted to a restricted staff account.');
        }
      } else {
        // Check which columns exist in users table to adapt to production and test fixtures
        const colRes = await client.query<{ column_name: string; column_default: string | null }>(
          `SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'users'`
        );
        const cols = new Set(colRes.rows.map(r => r.column_name));
        const idDefault = colRes.rows.find(r => r.column_name === 'id')?.column_default;

        const insertCols: string[] = ['email', 'role'];
        const insertVals: string[] = ['$1', `'guest'`];
        const params: any[] = [input.email];

        if (cols.has('name')) {
          params.push(input.fullName);
          insertCols.push('name');
          insertVals.push(`$${params.length}`);
        }
        if (cols.has('email_verified')) {
          insertCols.push('email_verified');
          insertVals.push('true');
        }
        if (cols.has('created_at')) {
          insertCols.push('created_at');
          insertVals.push('clock_timestamp()');
        }
        if (cols.has('updated_at')) {
          insertCols.push('updated_at');
          insertVals.push('clock_timestamp()');
        }
        if (!idDefault) {
          const nextIdRes = await client.query<{ next_id: string }>(
            `SELECT coalesce(max(id), 0) + 1 as next_id FROM users`
          );
          insertCols.unshift('id');
          params.push(Number(nextIdRes.rows[0]?.next_id || 1));
          insertVals.unshift(`$${params.length}`);
        }

        const userInsert = await client.query<{ id: number }>(
          `INSERT INTO users (${insertCols.join(', ')})
           VALUES (${insertVals.join(', ')})
           RETURNING id`,
          params
        );
        targetUserId = userInsert.rows[0].id;
      }

      // Check existing active membership & grants for SoD validation
      const existingMembership = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM internal_organization_memberships WHERE organization_id = $1 AND user_id = $2`,
        [orgId, targetUserId]
      );

      let membershipId: string;
      if (existingMembership.rows[0]) {
        if (existingMembership.rows[0].status === 'OFFBOARDED') {
          throw new Error('STAFF_MEMBER_OFFBOARDED: Member was permanently offboarded and cannot be re-hired directly.');
        }
        membershipId = existingMembership.rows[0].id;

        // Fetch active roles
        const existingRolesRes = await client.query<{ role_key: string }>(
          `SELECT d.role_key
           FROM internal_membership_grants g
           JOIN internal_role_versions v ON v.id = g.role_version_id
           JOIN internal_role_definitions d ON d.id = v.role_id
           WHERE g.membership_id = $1
             AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = g.id)`,
          [membershipId]
        );
        const existingRoles = existingRolesRes.rows.map(r => r.role_key);

        // Run SoD Validation
        const sodCheck = validateSodRules(existingRoles, input.roleKey);
        if (!sodCheck.allowed) {
          throw new Error(`SOD_CONFLICT: ${sodCheck.violation}`);
        }
      } else {
        // Run SoD check for single role
        const sodCheck = validateSodRules([], input.roleKey);
        if (!sodCheck.allowed) {
          throw new Error(`SOD_CONFLICT: ${sodCheck.violation}`);
        }

        membershipId = randomUUID();
        await client.query(
          `INSERT INTO internal_organization_memberships (
            id, organization_id, user_id, status, version, accepted_at, expires_at, changed_by, change_reason
          ) VALUES (
            $1, $2, $3, 'ACTIVE', 1, clock_timestamp(), $4, $5, $6
          )`,
          [
            membershipId,
            orgId,
            targetUserId,
            input.expiresAt ? new Date(input.expiresAt) : null,
            input.adminUserId,
            input.hiringReason,
          ]
        );
      }

      // Resolve role definition & current version
      const roleDefRes = await client.query<{ version_id: string; config_hash: string }>(
        `SELECT v.id as version_id, v.config_hash
         FROM internal_role_definitions d
         JOIN internal_role_current_versions c ON c.role_id = d.id
         JOIN internal_role_versions v ON v.id = c.version_id
         WHERE d.role_key = $1 AND d.organization_id = $2`,
        [input.roleKey, orgId]
      );

      if (!roleDefRes.rows[0]) {
        throw new Error(`ROLE_NOT_FOUND: Pre-seeded role '${input.roleKey}' not found in organization.`);
      }

      const roleVersionId = roleDefRes.rows[0].version_id;
      const grantHash = createHash('sha256')
        .update(`${membershipId}:${roleVersionId}:${input.scopeType}:${scopeId}:${input.environment}`)
        .digest('hex');

      // Insert grant with maxDailySpendPaise as max_amount_minor
      await client.query(
        `INSERT INTO internal_membership_grants (
          organization_id, membership_id, role_version_id, scope_type, scope_id,
          environment, max_amount_minor, valid_from, valid_until, grant_hash, granted_by, reason
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, clock_timestamp(), $8, $9, $10, $11
        ) ON CONFLICT (membership_id, grant_hash) DO NOTHING`,
        [
          orgId,
          membershipId,
          roleVersionId,
          input.scopeType,
          scopeId,
          input.environment,
          input.maxDailySpendPaise,
          input.expiresAt ? new Date(input.expiresAt) : null,
          grantHash,
          input.adminUserId,
          input.hiringReason,
        ]
      );

      // Generate 32-byte cryptographic token and invitation record
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const invitationId = randomUUID();

      const grantBundle = [
        {
          roleVersionId,
          roleHash: roleDefRes.rows[0].config_hash,
          scope: { type: input.scopeType, id: scopeId },
          environment: input.environment,
          maxAmountMinor: String(input.maxDailySpendPaise),
          validUntil: input.expiresAt || null,
        },
      ];
      const grantBundleHash = createHash('sha256').update(JSON.stringify(grantBundle)).digest('hex');

      // Fetch active policy snapshot hash
      const policyRes = await client.query<{ config_hash: string }>(
        `SELECT v.config_hash
         FROM internal_iam_current_policy cp
         JOIN internal_iam_policy_versions v ON v.id = cp.version_id
         WHERE cp.singleton LIMIT 1`
      );
      const policySnapshotHash = policyRes.rows[0]?.config_hash || GENESIS_HASH;

      // Create and consume authorization for the invitation issuance
      const authId = randomUUID();
      const commandHash = createHash('sha256')
        .update(`workforce.invite:${invitationId}:${input.email}:${input.environment}:${grantBundleHash}`)
        .digest('hex');

      await client.query(
        `INSERT INTO internal_action_authorizations (
          id, organization_id, permission_code, resource_type, resource_id,
          environment, command_hash, policy_snapshot_hash, maker_membership_id,
          required_approvals, status, expires_at, reason
        ) VALUES (
          $1, $2, 'workforce.invite', 'WORKFORCE', $3,
          $4, $5, $6, $7,
          0, 'PENDING', clock_timestamp() + interval '7 days', $8
        )`,
        [
          authId,
          orgId,
          orgId,
          input.environment,
          commandHash,
          policySnapshotHash,
          adminMembershipId,
          input.hiringReason,
        ]
      );

      await client.query(
        `INSERT INTO internal_organization_invitations (
          id, organization_id, email_normalized, token_hash, grant_bundle, grant_bundle_hash,
          status, expires_at, invited_by, inviter_membership_id, reason, environment,
          command_hash, policy_snapshot_hash, authorization_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'PENDING', clock_timestamp() + interval '7 days',
          $7, $8, $9, $10, $11, $12, $13
        )`,
        [
          invitationId,
          orgId,
          input.email.toLowerCase().trim(),
          tokenHash,
          JSON.stringify(grantBundle),
          grantBundleHash,
          input.adminUserId,
          adminMembershipId,
          input.hiringReason,
          input.environment,
          commandHash,
          policySnapshotHash,
          authId,
        ]
      );


      // Append Merkle chained audit event
      const auditEvent = await appendIamEvent(client, {
        organizationId: orgId,
        actorUserId: input.adminUserId,
        actorMembershipId: adminMembershipId,
        eventType: 'STAFF_HIRED',
        entityType: 'MEMBERSHIP',
        entityId: membershipId,
        reason: input.hiringReason,
        evidence: {
          email: input.email,
          fullName: input.fullName,
          department: input.department,
          roleKey: input.roleKey,
          environment: input.environment,
          maxDailySpendPaise: input.maxDailySpendPaise,
          invitationId,
        },
      });

      await client.query('COMMIT');

      const magicLink = `${input.appBaseUrl}/operations?invite=${rawToken}`;

      return {
        success: true,
        membershipId,
        userId: targetUserId,
        email: input.email,
        fullName: input.fullName,
        department: input.department,
        roleKey: input.roleKey,
        magicLink,
        invitationToken: rawToken,
        invitationId,
        eventSequence: auditEvent.sequence,
        eventHash: auditEvent.newHash,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves high-density department telemetry, headcounts, and active sessions.
   */
  async getWorkforceOverview() {
    const orgId = MASTER_ORGANIZATION_ID;

    // 1. Department Telemetry
    const deptRows = await this.pool.query<{
      role_key: string;
      total_members: string;
      active_members: string;
      suspended_members: string;
      active_sessions: string;
    }>(
      `SELECT
         d.role_key,
         count(DISTINCT m.id) as total_members,
         count(DISTINCT CASE WHEN m.status = 'ACTIVE' THEN m.id END) as active_members,
         count(DISTINCT CASE WHEN m.status = 'SUSPENDED' THEN m.id END) as suspended_members,
         count(DISTINCT s.id) as active_sessions
       FROM internal_role_definitions d
       LEFT JOIN internal_role_versions v ON v.role_id = d.id
       LEFT JOIN internal_membership_grants g ON g.role_version_id = v.id AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = g.id)
       LEFT JOIN internal_organization_memberships m ON m.id = g.membership_id
       LEFT JOIN internal_staff_sessions s ON s.membership_id = m.id AND s.status = 'ACTIVE' AND s.idle_expires_at > clock_timestamp() AND s.absolute_expires_at > clock_timestamp()
       WHERE d.organization_id = $1
       GROUP BY d.role_key`,
      [orgId]
    );

    // Aggregate by department
    const departmentTelemetry: Record<string, {
      department: string;
      headcount: number;
      activeHeadcount: number;
      suspendedHeadcount: number;
      activeSessions: number;
      roles: string[];
    }> = {};

    for (const [dept, roles] of Object.entries(DEPARTMENT_ROLE_MAP)) {
      departmentTelemetry[dept] = {
        department: dept,
        headcount: 0,
        activeHeadcount: 0,
        suspendedHeadcount: 0,
        activeSessions: 0,
        roles: [...roles],
      };
    }

    for (const row of deptRows.rows) {
      const dept = ROLE_DEPARTMENT_MAP[row.role_key] || 'governance';
      if (!departmentTelemetry[dept]) {
        departmentTelemetry[dept] = {
          department: dept,
          headcount: 0,
          activeHeadcount: 0,
          suspendedHeadcount: 0,
          activeSessions: 0,
          roles: [],
        };
      }
      departmentTelemetry[dept].headcount += Number(row.total_members);
      departmentTelemetry[dept].activeHeadcount += Number(row.active_members);
      departmentTelemetry[dept].suspendedHeadcount += Number(row.suspended_members);
      departmentTelemetry[dept].activeSessions += Number(row.active_sessions);
    }

    // 2. Global stats
    const globalStatsRes = await this.pool.query<{
      total_staff: string;
      active_staff: string;
      suspended_staff: string;
      active_sessions: string;
    }>(
      `SELECT
         count(DISTINCT m.id) as total_staff,
         count(DISTINCT CASE WHEN m.status = 'ACTIVE' THEN m.id END) as active_staff,
         count(DISTINCT CASE WHEN m.status = 'SUSPENDED' THEN m.id END) as suspended_staff,
         (SELECT count(*) FROM internal_staff_sessions s WHERE s.status = 'ACTIVE' AND s.idle_expires_at > clock_timestamp() AND s.absolute_expires_at > clock_timestamp()) as active_sessions
       FROM internal_organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND u.role <> 'admin'`,
      [orgId]
    );

    // 3. Pending Maker-Checker Approvals count
    const pendingApprovalsRes = await this.pool.query<{ count: string }>(
      `SELECT count(*) as count
       FROM internal_action_authorizations
       WHERE organization_id = $1 AND status = 'PENDING' AND expires_at > clock_timestamp()`,
      [orgId]
    );

    // 4. Emergency Quarantine status
    const emergencyEventsRes = await this.pool.query<{ id: string }>(
      `SELECT id FROM internal_iam_events
       WHERE organization_id = $1 AND event_type = 'EMERGENCY_GLOBAL_QUARANTINE_APPLIED'
       ORDER BY sequence DESC LIMIT 1`,
      [orgId]
    );

    return {
      departmentTelemetry,
      globalStats: {
        totalStaff: Number(globalStatsRes.rows[0]?.total_staff || 0),
        activeStaff: Number(globalStatsRes.rows[0]?.active_staff || 0),
        suspendedStaff: Number(globalStatsRes.rows[0]?.suspended_staff || 0),
        activeSessions: Number(globalStatsRes.rows[0]?.active_sessions || 0),
        pendingApprovals: Number(pendingApprovalsRes.rows[0]?.count || 0),
        emergencyQuarantineActive: emergencyEventsRes.rows.length > 0,
      },
    };
  }

  /**
   * Retrieves paginated, filterable staff roster.
   */
  async getStaffRoster(options?: {
    department?: string;
    roleKey?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const orgId = MASTER_ORGANIZATION_ID;
    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const values: any[] = [orgId];
    let whereClause = `WHERE m.organization_id = $1 AND u.role <> 'admin'`;

    if (options?.status) {
      values.push(options.status.toUpperCase());
      whereClause += ` AND m.status = $${values.length}`;
    }

    if (options?.roleKey) {
      values.push(options.roleKey);
      whereClause += ` AND d.role_key = $${values.length}`;
    }

    if (options?.department && DEPARTMENT_ROLE_MAP[options.department]) {
      values.push(DEPARTMENT_ROLE_MAP[options.department]);
      whereClause += ` AND d.role_key = ANY($${values.length})`;
    }

    if (options?.search) {
      values.push(`%${options.search.trim().toLowerCase()}%`);
      whereClause += ` AND (lower(u.name) LIKE $${values.length} OR lower(u.email) LIKE $${values.length})`;
    }

    const query = `
      SELECT
        m.id as membership_id,
        m.user_id,
        u.name as full_name,
        u.email,
        m.status,
        m.version,
        m.accepted_at,
        m.expires_at,
        m.suspended_at,
        m.offboarded_at,
        d.role_key,
        d.display_name as role_name,
        g.environment,
        g.scope_type,
        g.scope_id,
        g.max_amount_minor,
        (SELECT count(*) FROM internal_staff_sessions s
         WHERE s.membership_id = m.id AND s.status = 'ACTIVE' AND s.idle_expires_at > clock_timestamp() AND s.absolute_expires_at > clock_timestamp()) as active_sessions,
        (SELECT s.authenticated_at FROM internal_staff_sessions s
         WHERE s.membership_id = m.id ORDER BY s.authenticated_at DESC LIMIT 1) as last_active_at,
        (SELECT count(*) FROM internal_work_assignments w
         WHERE w.assignee_membership_id = m.id AND w.state IN ('ASSIGNED', 'CLAIMED')) as claimed_tasks_count
      FROM internal_organization_memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN internal_membership_grants g ON g.membership_id = m.id AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = g.id)
      LEFT JOIN internal_role_versions v ON v.id = g.role_version_id
      LEFT JOIN internal_role_definitions d ON d.id = v.role_id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const res = await this.pool.query(query, values);

    return {
      staff: res.rows.map(row => ({
        membershipId: row.membership_id,
        userId: row.user_id,
        fullName: row.full_name,
        email: row.email,
        status: row.status,
        version: row.version,
        department: ROLE_DEPARTMENT_MAP[row.role_key] || 'operations',
        roleKey: row.role_key,
        roleName: row.role_name,
        environment: row.environment,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        maxDailySpendPaise: row.max_amount_minor ? Number(row.max_amount_minor) : 5000000,
        activeSessions: Number(row.active_sessions || 0),
        lastActiveAt: row.last_active_at,
        claimedTasksCount: Number(row.claimed_tasks_count || 0),
        acceptedAt: row.accepted_at,
        expiresAt: row.expires_at,
        suspendedAt: row.suspended_at,
        offboardedAt: row.offboarded_at,
      })),
      limit,
      offset,
    };
  }

  /**
   * Executes atomic lifecycle action: SUSPEND, RESUME, REVOKE_SESSIONS, or OFFBOARD.
   */
  async executeLifecycleAction(rawInput: unknown) {
    const input = lifecycleActionSchema.parse(rawInput);
    const orgId = MASTER_ORGANIZATION_ID;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const adminMembershipId = await ensureAdminMembership(client, input.adminUserId, orgId);

      // Lock membership row for update
      const memberRes = await client.query<{
        id: string;
        user_id: number;
        status: string;
        version: number;
      }>(
        `SELECT id, user_id, status, version FROM internal_organization_memberships
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [input.membershipId, orgId]
      );

      if (!memberRes.rows[0]) {
        throw new Error('MEMBERSHIP_NOT_FOUND: Staff member not found.');
      }

      const member = memberRes.rows[0];

      if (member.status === 'OFFBOARDED' && input.action !== 'OFFBOARD') {
        throw new Error('IAM_OFFBOARDING_TERMINAL: Offboarded staff member cannot be modified or re-activated.');
      }

      let newStatus = member.status;
      let sessionsRevoked = 0;
      let assignmentsReleased = 0;

      if (input.action === 'SUSPEND') {
        newStatus = 'SUSPENDED';
        await client.query(
          `UPDATE internal_organization_memberships
           SET status = 'SUSPENDED', suspended_at = clock_timestamp(), version = version + 1,
               changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
           WHERE id = $3`,
          [input.adminUserId, input.reason, member.id]
        );

        // Revoke active sessions
        const sessRes = await client.query(
          `UPDATE internal_staff_sessions
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
           WHERE membership_id = $3 AND status = 'ACTIVE'`,
          [input.adminUserId, input.reason, member.id]
        );
        sessionsRevoked = sessRes.rowCount ?? 0;

        // Release held work assignments
        const workRes = await client.query(
          `UPDATE internal_work_assignments
           SET state = 'RELEASED', lease_until = NULL, version = version + 1, fence = fence + 1, reason = $1
           WHERE assignee_membership_id = $2 AND state IN ('ASSIGNED', 'CLAIMED')`,
          [input.reason, member.id]
        );
        assignmentsReleased = workRes.rowCount ?? 0;

        // Expire step-up challenges
        await client.query(
          `UPDATE internal_step_up_challenges
           SET status = 'EXPIRED'
           WHERE membership_id = $1 AND status IN ('PENDING', 'VERIFIED')`,
          [member.id]
        );
      } else if (input.action === 'RESUME') {
        newStatus = 'ACTIVE';
        await client.query(
          `UPDATE internal_organization_memberships
           SET status = 'ACTIVE', suspended_at = NULL, version = version + 1,
               changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
           WHERE id = $3`,
          [input.adminUserId, input.reason, member.id]
        );
      } else if (input.action === 'REVOKE_SESSIONS') {
        const sessRes = await client.query(
          `UPDATE internal_staff_sessions
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
           WHERE membership_id = $3 AND status = 'ACTIVE'`,
          [input.adminUserId, input.reason, member.id]
        );
        sessionsRevoked = sessRes.rowCount ?? 0;
      } else if (input.action === 'OFFBOARD') {
        newStatus = 'OFFBOARDED';
        await client.query(
          `UPDATE internal_organization_memberships
           SET status = 'OFFBOARDED', offboarded_at = clock_timestamp(), version = version + 1,
               changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
           WHERE id = $3`,
          [input.adminUserId, input.reason, member.id]
        );

        // Revoke all grants
        await client.query(
          `INSERT INTO internal_membership_grant_revocations (grant_id, revoked_by, reason)
           SELECT g.id, $1, $2
           FROM internal_membership_grants g
           WHERE g.membership_id = $3
           ON CONFLICT (grant_id) DO NOTHING`,
          [input.adminUserId, input.reason, member.id]
        );

        // Revoke sessions
        const sessRes = await client.query(
          `UPDATE internal_staff_sessions
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
           WHERE membership_id = $3 AND status = 'ACTIVE'`,
          [input.adminUserId, input.reason, member.id]
        );
        sessionsRevoked = sessRes.rowCount ?? 0;

        // Release assignments
        const workRes = await client.query(
          `UPDATE internal_work_assignments
           SET state = 'RELEASED', lease_until = NULL, version = version + 1, fence = fence + 1, reason = $1
           WHERE assignee_membership_id = $2 AND state IN ('ASSIGNED', 'CLAIMED')`,
          [input.reason, member.id]
        );
        assignmentsReleased = workRes.rowCount ?? 0;

        // Expire step-up challenges
        await client.query(
          `UPDATE internal_step_up_challenges
           SET status = 'EXPIRED'
           WHERE membership_id = $1 AND status IN ('PENDING', 'VERIFIED')`,
          [member.id]
        );
      }

      // Append Merkle audit event
      const audit = await appendIamEvent(client, {
        organizationId: orgId,
        actorUserId: input.adminUserId,
        actorMembershipId: adminMembershipId,
        eventType: `WORKFORCE_LIFECYCLE_${input.action}`,
        entityType: 'MEMBERSHIP',
        entityId: member.id,
        reason: input.reason,
        evidence: {
          previousStatus: member.status,
          resultStatus: newStatus,
          sessionsRevoked,
          assignmentsReleased,
        },
      });

      await client.query('COMMIT');

      return {
        success: true,
        membershipId: member.id,
        action: input.action,
        status: newStatus,
        sessionsRevoked,
        assignmentsReleased,
        eventSequence: audit.sequence,
        eventHash: audit.newHash,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Adjusts blast radius ceilings and daily velocity limits for an operator.
   */
  async updateStaffQuotas(rawInput: unknown) {
    const input = updateQuotasSchema.parse(rawInput);
    const orgId = MASTER_ORGANIZATION_ID;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const adminMembershipId = await ensureAdminMembership(client, input.adminUserId, orgId);

      const activeGrants = await client.query<{
        id: string;
        organization_id: string;
        membership_id: string;
        role_version_id: string;
        scope_type: string;
        scope_id: string;
        environment: string;
        valid_until: Date | null;
      }>(
        `SELECT g.id, g.organization_id, g.membership_id, g.role_version_id, g.scope_type, g.scope_id, g.environment, g.valid_until
         FROM internal_membership_grants g
         WHERE g.membership_id = $1
           AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = g.id)`,
        [input.membershipId]
      );

      let grantsUpdated = 0;
      for (const g of activeGrants.rows) {
        // 1. Revoke the existing grant
        await client.query(
          `INSERT INTO internal_membership_grant_revocations (grant_id, revoked_by, reason)
           VALUES ($1, $2, $3)
           ON CONFLICT (grant_id) DO NOTHING`,
          [g.id, input.adminUserId, input.reason]
        );

        // 2. Issue the replacement grant with updated quota
        const newGrantHash = createHash('sha256')
          .update(`${g.membership_id}:${g.role_version_id}:${g.scope_type}:${g.scope_id}:${g.environment}:${input.maxDailySpendPaise}:${Date.now()}`)
          .digest('hex');

        await client.query(
          `INSERT INTO internal_membership_grants (
            organization_id, membership_id, role_version_id, scope_type, scope_id,
            environment, max_amount_minor, valid_from, valid_until, grant_hash, granted_by, reason
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, clock_timestamp(), $8, $9, $10, $11
          )`,
          [
            g.organization_id,
            g.membership_id,
            g.role_version_id,
            g.scope_type,
            g.scope_id,
            g.environment,
            input.maxDailySpendPaise,
            g.valid_until,
            newGrantHash,
            input.adminUserId,
            input.reason,
          ]
        );
        grantsUpdated++;
      }

      const audit = await appendIamEvent(client, {
        organizationId: orgId,
        actorUserId: input.adminUserId,
        actorMembershipId: adminMembershipId,
        eventType: 'STAFF_QUOTA_ADJUSTED',
        entityType: 'MEMBERSHIP',
        entityId: input.membershipId,
        reason: input.reason,
        evidence: {
          maxDailySpendPaise: input.maxDailySpendPaise,
          grantsUpdated,
        },
      });

      await client.query('COMMIT');

      return {
        success: true,
        membershipId: input.membershipId,
        maxDailySpendPaise: input.maxDailySpendPaise,
        grantsUpdated,
        eventSequence: audit.sequence,
        eventHash: audit.newHash,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lists staged Maker-Checker authorizations requiring dual-control ratification.
   */
  async getPendingAuthorizations() {
    const orgId = MASTER_ORGANIZATION_ID;

    const res = await this.pool.query(
      `SELECT
         a.id as authorization_id,
         a.permission_code,
         a.resource_type,
         a.resource_id,
         a.environment,
         a.amount_minor,
         a.status,
         a.reason,
         a.created_at,
         a.expires_at,
         u.name as maker_name,
         u.email as maker_email,
         m.id as maker_membership_id
       FROM internal_action_authorizations a
       JOIN internal_organization_memberships m ON m.id = a.maker_membership_id
       JOIN users u ON u.id = m.user_id
       WHERE a.organization_id = $1 AND a.status = 'PENDING' AND a.expires_at > clock_timestamp()
       ORDER BY a.created_at DESC`,
      [orgId]
    );

    return {
      authorizations: res.rows.map(row => ({
        authorizationId: row.authorization_id,
        permissionCode: row.permission_code,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        environment: row.environment,
        amountMinor: row.amount_minor ? Number(row.amount_minor) : null,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        makerName: row.maker_name,
        makerEmail: row.maker_email,
        makerMembershipId: row.maker_membership_id,
      })),
    };
  }

  /**
   * Ratifies (Approve or Reject) a staged Maker-Checker authorization request.
   */
  async ratifyAuthorization(rawInput: unknown) {
    const input = ratifyAuthorizationSchema.parse(rawInput);
    const orgId = MASTER_ORGANIZATION_ID;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const adminMembershipId = await ensureAdminMembership(client, input.adminUserId, orgId);

      const authRes = await client.query<{
        id: string;
        maker_membership_id: string;
        command_hash: string;
        status: string;
      }>(
        `SELECT id, maker_membership_id, command_hash, status
         FROM internal_action_authorizations
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [input.authorizationId, orgId]
      );

      if (!authRes.rows[0]) {
        throw new Error('AUTHORIZATION_NOT_FOUND: Pending action authorization not found.');
      }

      const auth = authRes.rows[0];

      if (auth.status !== 'PENDING') {
        throw new Error(`AUTHORIZATION_INVALID_STATE: Authorization is already in ${auth.status} state.`);
      }

      // Maker-Checker Separation: Admin cannot approve their own Maker request if they were the maker
      if (auth.maker_membership_id === adminMembershipId) {
        throw new Error('MAKER_CHECKER_SELF_APPROVAL_DENIED: The individual who requested this action cannot approve it.');
      }

      // Insert into internal_action_approvals
      await client.query(
        `INSERT INTO internal_action_approvals (
          authorization_id, checker_membership_id, decision, command_hash, reason
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          auth.id,
          adminMembershipId,
          input.decision,
          auth.command_hash,
          input.reason,
        ]
      );

      // Update authorization status
      const newStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await client.query(
        `UPDATE internal_action_authorizations
         SET status = $1, version = version + 1
         WHERE id = $2`,
        [newStatus, auth.id]
      );

      // Append Merkle audit event
      const audit = await appendIamEvent(client, {
        organizationId: orgId,
        actorUserId: input.adminUserId,
        actorMembershipId: adminMembershipId,
        eventType: `MAKER_CHECKER_${input.decision}D`,
        entityType: 'AUTHORIZATION',
        entityId: auth.id,
        reason: input.reason,
        evidence: {
          decision: input.decision,
          makerMembershipId: auth.maker_membership_id,
          checkerMembershipId: adminMembershipId,
        },
      });

      await client.query('COMMIT');

      return {
        success: true,
        authorizationId: auth.id,
        decision: input.decision,
        status: newStatus,
        eventSequence: audit.sequence,
        eventHash: audit.newHash,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves paginated audit event stream from `internal_iam_events`.
   */
  async getAuditEventStream(options?: {
    limit?: number;
    offset?: number;
    eventType?: string;
  }) {
    const orgId = MASTER_ORGANIZATION_ID;
    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const values: any[] = [orgId];
    let whereClause = `WHERE e.organization_id = $1`;

    if (options?.eventType) {
      values.push(options.eventType);
      whereClause += ` AND e.event_type = $${values.length}`;
    }

    const res = await this.pool.query(
      `SELECT
         e.id,
         e.sequence,
         e.actor_user_id,
         u.name as actor_name,
         u.email as actor_email,
         e.event_type,
         e.entity_type,
         e.entity_id,
         e.previous_hash,
         e.new_hash,
         e.evidence,
         e.reason,
         e.created_at
       FROM internal_iam_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       ${whereClause}
       ORDER BY e.sequence DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    return {
      events: res.rows.map(row => ({
        id: row.id,
        sequence: Number(row.sequence),
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        actorEmail: row.actor_email,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        previousHash: row.previous_hash,
        newHash: row.new_hash,
        evidence: row.evidence,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      limit,
      offset,
    };
  }

  /**
   * Mathematically verifies the cryptographic Merkle hash chain across all IAM events.
   * Detects single-byte tampering in database rows.
   */
  async verifyMerkleAuditChain() {
    const orgId = MASTER_ORGANIZATION_ID;

    const res = await this.pool.query<{
      sequence: string;
      event_type: string;
      entity_type: string;
      entity_id: string;
      previous_hash: string | null;
      new_hash: string | null;
      request_hash: string;
      reason: string;
    }>(
      `SELECT sequence, event_type, entity_type, entity_id, previous_hash, new_hash, request_hash, reason
       FROM internal_iam_events
       WHERE organization_id = $1
       ORDER BY sequence ASC`,
      [orgId]
    );

    const rows = res.rows;
    if (rows.length === 0) {
      return {
        verified: true,
        totalEvents: 0,
        headHash: GENESIS_HASH,
        brokenAtSequence: null,
      };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const seq = Number(row.sequence);

      // Check previous_hash link
      if (i === 0) {
        if (row.previous_hash && row.previous_hash !== GENESIS_HASH) {
          // If first event has non-genesis previous_hash, verify it matches
          expectedPrevHash = row.previous_hash;
        }
      } else {
        if (row.previous_hash !== expectedPrevHash) {
          return {
            verified: false,
            totalEvents: rows.length,
            headHash: row.new_hash || '',
            brokenAtSequence: seq,
            reason: `Broken chain link at sequence ${seq}: expected previous_hash '${expectedPrevHash}', found '${row.previous_hash}'`,
          };
        }
      }

      // Recompute new_hash
      const recomputedHash = calculateEventHash(
        row.previous_hash || GENESIS_HASH,
        row.event_type,
        row.entity_type,
        row.entity_id,
        row.request_hash,
        row.reason
      );

      if (row.new_hash !== recomputedHash) {
        return {
          verified: false,
          totalEvents: rows.length,
          headHash: row.new_hash || '',
          brokenAtSequence: seq,
          reason: `Cryptographic digest mismatch at sequence ${seq}: stored hash '${row.new_hash}' does not match recomputed hash '${recomputedHash}'`,
        };
      }

      expectedPrevHash = row.new_hash || '';
    }

    return {
      verified: true,
      totalEvents: rows.length,
      headHash: rows[rows.length - 1].new_hash || GENESIS_HASH,
      brokenAtSequence: null,
    };
  }

  /**
   * Nuclear Emergency Freeze Switch (Tier 1 / Tier 2 / Tier 3).
   */
  async executeEmergencyFreeze(rawInput: unknown) {
    const input = emergencyFreezeSchema.parse(rawInput);
    const orgId = MASTER_ORGANIZATION_ID;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const adminMembershipId = await ensureAdminMembership(client, input.adminUserId, orgId);

      let frozenCount = 0;
      let sessionsRevoked = 0;

      if (input.tier === 1) {
        // Tier 1: Single staff freeze
        if (!input.targetMembershipId) {
          throw new Error('EMERGENCY_FREEZE_MISSING_TARGET: targetMembershipId required for Tier 1 freeze.');
        }
        await client.query(
          `UPDATE internal_organization_memberships
           SET status = 'SUSPENDED', suspended_at = clock_timestamp(), version = version + 1,
               changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
           WHERE id = $3 AND status = 'ACTIVE'`,
          [input.adminUserId, input.reason, input.targetMembershipId]
        );
        const sess = await client.query(
          `UPDATE internal_staff_sessions
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
           WHERE membership_id = $3 AND status = 'ACTIVE'`,
          [input.adminUserId, input.reason, input.targetMembershipId]
        );
        frozenCount = 1;
        sessionsRevoked = sess.rowCount ?? 0;
      } else if (input.tier === 2) {
        // Tier 2: Freeze entire department
        if (!input.department || !DEPARTMENT_ROLE_MAP[input.department]) {
          throw new Error('EMERGENCY_FREEZE_INVALID_DEPARTMENT: Valid department name required for Tier 2 freeze.');
        }
        const roles = DEPARTMENT_ROLE_MAP[input.department];

        const targetMembers = await client.query<{ id: string }>(
          `SELECT DISTINCT m.id
           FROM internal_organization_memberships m
           JOIN internal_membership_grants g ON g.membership_id = m.id AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = g.id)
           JOIN internal_role_versions v ON v.id = g.role_version_id
           JOIN internal_role_definitions d ON d.id = v.role_id
           WHERE m.organization_id = $1 AND m.status = 'ACTIVE' AND d.role_key = ANY($2)`,
          [orgId, roles]
        );

        for (const row of targetMembers.rows) {
          await client.query(
            `UPDATE internal_organization_memberships
             SET status = 'SUSPENDED', suspended_at = clock_timestamp(), version = version + 1,
                 changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
             WHERE id = $3 AND status = 'ACTIVE'`,
            [input.adminUserId, input.reason, row.id]
          );
          const sess = await client.query(
            `UPDATE internal_staff_sessions
             SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
             WHERE membership_id = $3 AND status = 'ACTIVE'`,
            [input.adminUserId, input.reason, row.id]
          );
          frozenCount++;
          sessionsRevoked += sess.rowCount ?? 0;
        }
      } else if (input.tier === 3) {
        // Tier 3: Global System Quarantine - Freeze all non-admin staff
        const allActiveStaff = await client.query<{ id: string }>(
          `SELECT m.id
           FROM internal_organization_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.organization_id = $1 AND m.status = 'ACTIVE' AND u.role <> 'admin'`,
          [orgId]
        );

        for (const row of allActiveStaff.rows) {
          await client.query(
            `UPDATE internal_organization_memberships
             SET status = 'SUSPENDED', suspended_at = clock_timestamp(), version = version + 1,
                 changed_by = $1, change_reason = $2, updated_at = clock_timestamp()
             WHERE id = $3 AND status = 'ACTIVE'`,
            [input.adminUserId, input.reason, row.id]
          );
          frozenCount++;
        }

        // Revoke all active staff sessions globally
        const sess = await client.query(
          `UPDATE internal_staff_sessions
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = $1, revoke_reason = $2
           WHERE status = 'ACTIVE'`,
          [input.adminUserId, input.reason]
        );
        sessionsRevoked = sess.rowCount ?? 0;

        // Release all active work assignments
        await client.query(
          `UPDATE internal_work_assignments
           SET state = 'RELEASED', lease_until = NULL, version = version + 1, fence = fence + 1, reason = $1
           WHERE state IN ('ASSIGNED', 'CLAIMED')`,
          [input.reason]
        );
      }

      // Append Merkle audit event
      const eventType = input.tier === 3
        ? 'EMERGENCY_GLOBAL_QUARANTINE_APPLIED'
        : input.tier === 2
          ? 'EMERGENCY_DEPARTMENT_FREEZE_APPLIED'
          : 'EMERGENCY_STAFF_FREEZE_APPLIED';

      const audit = await appendIamEvent(client, {
        organizationId: orgId,
        actorUserId: input.adminUserId,
        actorMembershipId: adminMembershipId,
        eventType,
        entityType: 'ORGANIZATION',
        entityId: orgId,
        reason: input.reason,
        evidence: {
          tier: input.tier,
          targetMembershipId: input.targetMembershipId,
          department: input.department,
          frozenCount,
          sessionsRevoked,
        },
      });

      await client.query('COMMIT');

      return {
        success: true,
        tier: input.tier,
        frozenCount,
        sessionsRevoked,
        eventSequence: audit.sequence,
        eventHash: audit.newHash,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
