import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createCr1IamFixture } from './helpers/cr1IamFixture.js';
import {
  WorkforceAdminService,
  validateSodRules,
  MASTER_ORGANIZATION_ID,
  GENESIS_HASH,
} from '../../lib/iam/workforceAdminService.js';
import { requireAdmin } from '../../../server.js';

describe('CR1 FAANG L7/L8 Admin God-Mode Workforce Command Portal', () => {
  let fixture: Awaited<ReturnType<typeof createCr1IamFixture>>;
  let service: WorkforceAdminService;
  const adminUserId = 90; // User 90 is admin in fixture

  beforeAll(async () => {
    fixture = await createCr1IamFixture();
    service = new WorkforceAdminService(fixture.pool);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Atomic Rollback on Mid-Transaction Socket Drop / Failure
  // ---------------------------------------------------------------------------
  it('guarantees 100% atomic rollback with 0 zombie records on mid-transaction failure', async () => {
    const testEmail = 'mid_failure_test@encho.test';

    // Mock an intentional failure after inserting user by passing invalid role key
    await expect(
      service.hireStaffMember({
        fullName: 'Socket Drop Test',
        email: testEmail,
        department: 'marketing',
        roleKey: 'NON_EXISTENT_EXPLOSIVE_ROLE_KEY',
        environment: 'PRODUCTION',
        scopeType: 'ORGANIZATION',
        maxDailySpendPaise: 5000000,
        hiringReason: 'Testing atomic rollback boundaries on explosive role.',
        adminUserId,
      })
    ).rejects.toThrow('ROLE_NOT_FOUND');

    // Verify 0 zombie records were committed
    const userRes = await fixture.pool.query('SELECT * FROM users WHERE email = $1', [testEmail]);
    expect(userRes.rows.length).toBe(0);

    const memRes = await fixture.pool.query(
      `SELECT m.* FROM internal_organization_memberships m
       JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
      [testEmail]
    );
    expect(memRes.rows.length).toBe(0);

    const invRes = await fixture.pool.query(
      'SELECT * FROM internal_organization_invitations WHERE email_normalized = $1',
      [testEmail]
    );
    expect(invRes.rows.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Segregation of Duties (SoD) Conflict Detection Engine
  // ---------------------------------------------------------------------------
  describe('Segregation of Duties (SoD) Conflict Engine', () => {
    it('strictly rejects Maker-Checker toxic pairs: campaign_operator vs campaign_approver', () => {
      const res1 = validateSodRules(['campaign_operator'], 'campaign_approver');
      expect(res1.allowed).toBe(false);
      expect(res1.ruleId).toBe('SOD_CAMPAIGN_MAKER_CHECKER');

      const res2 = validateSodRules(['campaign_approver'], 'campaign_operator');
      expect(res2.allowed).toBe(false);
      expect(res2.ruleId).toBe('SOD_CAMPAIGN_MAKER_CHECKER');
    });

    it('strictly rejects Author-Publisher toxic pairs: strategy_architect vs strategy_publisher', () => {
      const res = validateSodRules(['strategy_architect'], 'strategy_publisher');
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe('SOD_STRATEGY_MAKER_CHECKER');
    });

    it('strictly rejects Finance vs Provider spend toxic pairs: finance_risk_reviewer vs provider_operator', () => {
      const res = validateSodRules(['provider_operator'], 'finance_risk_reviewer');
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe('SOD_FINANCE_PROVIDER_SEPARATION');
    });

    it('strictly enforces Auditor neutrality: auditor cannot hold any mutation role', () => {
      const res1 = validateSodRules(['auditor'], 'campaign_operator');
      expect(res1.allowed).toBe(false);
      expect(res1.ruleId).toBe('SOD_AUDITOR_NEUTRALITY');

      const res2 = validateSodRules(['provider_operator'], 'auditor');
      expect(res2.allowed).toBe(false);
      expect(res2.ruleId).toBe('SOD_AUDITOR_NEUTRALITY');
    });

    it('permits non-conflicting operational roles', () => {
      const res1 = validateSodRules(['campaign_operator'], 'strategy_architect');
      expect(res1.allowed).toBe(true);

      const res2 = validateSodRules(['support_analyst'], 'incident_commander');
      expect(res2.allowed).toBe(true);
    });

    it('enforces SoD rejection during transactional hiring if role conflicts with existing member grants', async () => {
      const sodEmail = 'sod_enforcement@encho.test';

      // 1. Hire user as campaign_operator
      const hire1 = await service.hireStaffMember({
        fullName: 'SoD Test Candidate',
        email: sodEmail,
        department: 'marketing',
        roleKey: 'campaign_operator',
        environment: 'PRODUCTION',
        scopeType: 'ORGANIZATION',
        maxDailySpendPaise: 5000000,
        hiringReason: 'Initial campaign operator hire for SoD testing.',
        adminUserId,
      });
      expect(hire1.success).toBe(true);

      // 2. Attempt to add campaign_approver to the same user
      await expect(
        service.hireStaffMember({
          fullName: 'SoD Test Candidate',
          email: sodEmail,
          department: 'approvals',
          roleKey: 'campaign_approver',
          environment: 'PRODUCTION',
          scopeType: 'ORGANIZATION',
          maxDailySpendPaise: 5000000,
          hiringReason: 'Attempting conflicting checker assignment.',
          adminUserId,
        })
      ).rejects.toThrow('SOD_CONFLICT');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Operator Blast-Radius Spend Quotas
  // ---------------------------------------------------------------------------
  it('enforces operator blast-radius daily spend ceilings and allows dynamic quota updates', async () => {
    const quotaEmail = 'quota_test@encho.test';
    const initialQuota = 2500000; // ₹25,000 INR

    const hire = await service.hireStaffMember({
      fullName: 'Quota Operator',
      email: quotaEmail,
      department: 'marketing',
      roleKey: 'campaign_operator',
      environment: 'PRODUCTION',
      scopeType: 'ORGANIZATION',
      maxDailySpendPaise: initialQuota,
      hiringReason: 'Hired with restricted initial blast-radius quota.',
      adminUserId,
    });

    // Verify initial quota in DB
    const grant1 = await fixture.pool.query<{ max_amount_minor: string }>(
      `SELECT max_amount_minor FROM internal_membership_grants WHERE membership_id = $1`,
      [hire.membershipId]
    );
    expect(Number(grant1.rows[0].max_amount_minor)).toBe(initialQuota);

    // Update quota to ₹75,000 INR
    const newQuota = 7500000;
    const update = await service.updateStaffQuotas({
      membershipId: hire.membershipId,
      maxDailySpendPaise: newQuota,
      reason: 'Promoted to lead operator; increased daily spend ceiling.',
      adminUserId,
    });
    expect(update.success).toBe(true);
    expect(update.maxDailySpendPaise).toBe(newQuota);

    // Verify in DB (active unrevoked grant)
    const grant2 = await fixture.pool.query<{ max_amount_minor: string }>(
      `SELECT max_amount_minor FROM internal_membership_grants
       WHERE membership_id = $1
         AND NOT EXISTS (SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id = internal_membership_grants.id)`,
      [hire.membershipId]
    );
    expect(Number(grant2.rows[0].max_amount_minor)).toBe(newQuota);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Admin God-Mode 1-Click Emergency Suspend & Revocation
  // ---------------------------------------------------------------------------
  it('admin 1-click Emergency Suspend immediately revokes active sessions and releases work assignments', async () => {
    const suspendEmail = 'suspend_target@encho.test';
    const hire = await service.hireStaffMember({
      fullName: 'Suspension Candidate',
      email: suspendEmail,
      department: 'adtech',
      roleKey: 'provider_operator',
      environment: 'PRODUCTION',
      scopeType: 'ORGANIZATION',
      maxDailySpendPaise: 5000000,
      hiringReason: 'Personnel for lifecycle emergency suspension test.',
      adminUserId,
    });

    const membershipId = hire.membershipId;

    // Simulate active staff session in DB
    const sessionId = randomUUID();
    const tokenHash = createHash('sha256').update(sessionId).digest('hex');
    await fixture.pool.query(
      `INSERT INTO internal_staff_sessions (
        id, organization_id, membership_id, environment, token_hash, status, assurance_level,
        authenticated_at, idle_expires_at, absolute_expires_at
      ) VALUES (
        $1, $2, $3, 'PRODUCTION', $4, 'ACTIVE', 'AAL2',
        clock_timestamp(), clock_timestamp() + interval '30 minutes', clock_timestamp() + interval '4 hours'
      )`,
      [sessionId, MASTER_ORGANIZATION_ID, membershipId, tokenHash]
    );

    // Simulate active work assignment
    const assignmentId = randomUUID();
    await fixture.pool.query(
      `INSERT INTO internal_work_assignments (
        id, organization_id, queue_key, resource_type, resource_id, assignee_membership_id,
        environment, state, assigned_by, reason, lease_until
      ) VALUES (
        $1, $2, 'provider_sync', 'PROVIDER_ACCOUNT', 'meta_act_123', $3,
        'PRODUCTION', 'ASSIGNED', $4, 'Testing active lease release.', NULL
      )`,
      [assignmentId, MASTER_ORGANIZATION_ID, membershipId, adminUserId]
    );

    // Transition assignment to CLAIMED with active lease
    await fixture.pool.query(
      `UPDATE internal_work_assignments
       SET state = 'CLAIMED', lease_until = clock_timestamp() + interval '10 minutes',
           version = version + 1, fence = fence + 1
       WHERE id = $1`,
      [assignmentId]
    );

    // Execute 1-click Emergency Suspend
    const result = await service.executeLifecycleAction({
      membershipId,
      action: 'SUSPEND',
      reason: 'Security breach detected on staff device; emergency freeze.',
      adminUserId,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('SUSPENDED');
    expect(result.sessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(result.assignmentsReleased).toBeGreaterThanOrEqual(1);

    // Verify session revoked in DB
    const sessRow = await fixture.pool.query<{ status: string }>(
      'SELECT status FROM internal_staff_sessions WHERE id = $1',
      [sessionId]
    );
    expect(sessRow.rows[0].status).toBe('REVOKED');

    // Verify work assignment released in DB
    const workRow = await fixture.pool.query<{ state: string; lease_until: string | null }>(
      'SELECT state, lease_until FROM internal_work_assignments WHERE id = $1',
      [assignmentId]
    );
    expect(workRow.rows[0].state).toBe('RELEASED');
    expect(workRow.rows[0].lease_until).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Cryptographic Merkle Hash Chain Verification & Tamper Detection
  // ---------------------------------------------------------------------------
  it('cryptographic Merkle hash chain mathematically verifies all IAM events and detects tampering', async () => {
    // 1. Verify clean chain initially
    const initialCheck = await service.verifyMerkleAuditChain();
    expect(initialCheck.verified).toBe(true);
    expect(initialCheck.brokenAtSequence).toBeNull();
    expect(initialCheck.totalEvents).toBeGreaterThanOrEqual(0);

    // 2. Insert a known event and verify
    const testEmail = 'merkle_test@encho.test';
    await service.hireStaffMember({
      fullName: 'Merkle Audit Personnel',
      email: testEmail,
      department: 'audit',
      roleKey: 'auditor',
      environment: 'PRODUCTION',
      scopeType: 'ORGANIZATION',
      maxDailySpendPaise: 0,
      hiringReason: 'Assigned as statutory auditor for tamper verification.',
      adminUserId,
    });

    const chainAfterHire = await service.verifyMerkleAuditChain();
    expect(chainAfterHire.verified).toBe(true);
    expect(chainAfterHire.brokenAtSequence).toBeNull();

    // 3. Intentionally tamper with a database row to simulate adversarial modification
    const lastEvent = (
      await fixture.pool.query<{ sequence: string; reason: string }>(
        'SELECT sequence, reason FROM internal_iam_events ORDER BY sequence DESC LIMIT 1'
      )
    ).rows[0];

    // Tamper with reason directly in DB bypassing service (simulate DB compromise)
    await fixture.pool.query('ALTER TABLE internal_iam_events DISABLE TRIGGER internal_iam_immutable');
    try {
      await fixture.pool.query(
        `UPDATE internal_iam_events SET reason = 'MALICIOUS_ADVERSARIAL_MODIFICATION_HERE' WHERE sequence = $1`,
        [lastEvent.sequence]
      );

      // 4. Verify that Merkle chain detects the single-byte tampering
      const tamperedCheck = await service.verifyMerkleAuditChain();
      expect(tamperedCheck.verified).toBe(false);
      expect(tamperedCheck.brokenAtSequence).toBe(Number(lastEvent.sequence));
      expect(tamperedCheck.reason).toContain('Cryptographic digest mismatch');

      // 5. Restore original reason to leave database clean
      await fixture.pool.query(
        `UPDATE internal_iam_events SET reason = $1 WHERE sequence = $2`,
        [lastEvent.reason, lastEvent.sequence]
      );
    } finally {
      await fixture.pool.query('ALTER TABLE internal_iam_events ENABLE TRIGGER internal_iam_immutable');
    }
    const restoredCheck = await service.verifyMerkleAuditChain();
    expect(restoredCheck.verified).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Zero-Bypass Security Boundary (Staff Cannot Access Admin Routes)
  // ---------------------------------------------------------------------------
  it('strictly enforces Zero-Bypass security: staff accounts are blocked with HTTP 403 on admin routes', () => {
    let statusCode: number | null = null;
    let jsonPayload: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonPayload = data;
          },
        };
      },
    };

    let nextCalled = false;
    const mockNext = () => {
      nextCalled = true;
    };

    // Case A: Staff account (role = 'guest')
    const staffReq: any = {
      user: { id: 105, role: 'guest', email: 'rahul.operator@encho.in' },
    };
    requireAdmin(staffReq, mockRes, mockNext);
    expect(statusCode).toBe(403);
    expect(jsonPayload).toEqual({ error: 'Admin access required.' });
    expect(nextCalled).toBe(false);

    // Case B: General user account (role = 'user')
    const userReq: any = {
      user: { id: 106, role: 'user', email: 'guest@example.com' },
    };
    statusCode = null;
    requireAdmin(userReq, mockRes, mockNext);
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);

    // Case C: Platform Administrator (role = 'admin')
    const adminReq: any = {
      user: { id: 90, role: 'admin', email: 'admin@encho.in' },
    };
    statusCode = null;
    requireAdmin(adminReq, mockRes, mockNext);
    expect(statusCode).toBeNull();
    expect(nextCalled).toBe(true);
  });
});
