import { describe, expect, it } from 'vitest';
import {
  WorkforceSecurityEngine,
  type DbClientPort,
  type WorkforceAssignmentClaimInput,
  type DirectorySyncWebhookPayload,
  type PrivilegedApprovalInput,
} from '../../lib/iam/workforceSecurityEngine.js';

describe('CR1 Phase P2: Workforce IAM & Privilege Fencing Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Rolls back membership grant and audit event atomically on midway connection drop', async () => {
    const executedQueries: string[] = [];
    let shouldDropConnection = false;

    const mockDb: DbClientPort = {
      query: async (sql: string) => {
        executedQueries.push(sql.trim().split('\n')[0]);
        if (shouldDropConnection && sql.includes('INSERT INTO internal_membership_grants')) {
          throw new Error('ECONNRESET: Database connection stream terminated unexpectedly during grant creation');
        }
        return { rows: [] };
      },
    };

    const engine = new WorkforceSecurityEngine();
    const input: WorkforceAssignmentClaimInput = {
      assignmentId: 'assign_meta_campaign_ops',
      organizationId: 'org_encho_internal',
      memberId: 'mem_operator_01',
      roleKey: 'campaign_operator',
      idempotencyKey: 'idemp_key_drop_01',
      reason: 'Claim operational campaign review task',
    };

    // Simulate database socket dropped midway
    shouldDropConnection = true;

    await expect(engine.claimWorkAssignmentWithOutbox(mockDb, input)).rejects.toThrow(
      'ECONNRESET: Database connection stream terminated unexpectedly during grant creation'
    );

    // Verify transaction safety: BEGIN executed, ROLLBACK executed, COMMIT never reached
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Deduplicates 5 concurrent assignment claims in 200ms into exactly 1 grant write and 4 replays', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: async (sql: string) => {
        if (sql.includes('INSERT INTO internal_assignment_commands')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const engine = new WorkforceSecurityEngine();
    const idempotencyKey = 'idemp_burst_claim_200ms';

    const input: WorkforceAssignmentClaimInput = {
      assignmentId: 'assign_support_desk_01',
      organizationId: 'org_encho_internal',
      memberId: 'mem_support_lead',
      roleKey: 'support_agent',
      idempotencyKey,
      reason: 'Rapid dual-click claim from slow network terminal',
    };

    // Simulate 5 simultaneous rapid clicks within 200ms
    const burstPromises = Array.from({ length: 5 }, () =>
      engine.claimWorkAssignmentWithOutbox(mockDb, input)
    );

    const results = await Promise.all(burstPromises);

    // Exactly 1 insert executed in the database
    expect(writeCount).toBe(1);

    // All 5 returned valid results with identical claim IDs
    const claimIds = results.map(r => r.claimId);
    expect(new Set(claimIds).size).toBe(1);

    // Exactly 1 original execution and 4 replays
    const replays = results.filter(r => r.isReplay);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order Directory Sync Webhook
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Safely rejects stale directory sync webhooks arriving out-of-order', async () => {
    const engine = new WorkforceSecurityEngine();
    const memberId = 'mem_staff_directory_sync';

    // Step 1: Initial directory sync sequence 8 arrives (e.g. role upgraded to Senior Lead)
    const eventSeq8: DirectorySyncWebhookPayload = {
      eventId: 'evt_sync_008',
      memberId,
      sequenceNumber: 8,
      action: 'ROLE_UPDATED',
      assignedRole: 'lead_campaign_operator',
      timestamp: '2026-09-24T21:00:08.000Z',
    };

    const result8 = await engine.applyDirectorySyncEvent(eventSeq8);
    expect(result8.applied).toBe(true);
    expect(result8.currentSequence).toBe(8);

    // Step 2: Stale sequence 4 arrives delayed (e.g. old trainee role assignment)
    const eventSeq4: DirectorySyncWebhookPayload = {
      eventId: 'evt_sync_004',
      memberId,
      sequenceNumber: 4, // Out of order!
      action: 'ROLE_UPDATED',
      assignedRole: 'junior_trainee',
      timestamp: '2026-09-24T21:00:04.000Z',
    };

    const result4 = await engine.applyDirectorySyncEvent(eventSeq4);
    expect(result4.applied).toBe(false);
    expect(result4.isStale).toBe(true);
    expect(result4.currentSequence).toBe(8); // Monotonic ceiling preserved
    expect(result4.reason).toBe('STALE_DIRECTORY_EVENT_REJECTED');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Dual-Control Maker-Checker Invariant
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Rejects self-approval on privileged actions and mandates distinct checker authorization', () => {
    const engine = new WorkforceSecurityEngine();

    const proposal = engine.createPrivilegedActionProposal({
      proposalId: 'prop_spend_increase_01',
      requesterId: 'mem_maker_alice',
      actionType: 'CAMPAIGN_SPEND_LIMIT_OVERRIDE',
      details: { newDailyCapPaise: 10000000 }, // ₹100,000
    });

    expect(proposal.status).toBe('PENDING_CHECKER_APPROVAL');

    // Self-approval attempt: Alice cannot approve her own proposal
    const selfApproval: PrivilegedApprovalInput = {
      proposalId: proposal.proposalId,
      approverId: 'mem_maker_alice', // Same actor!
      approverRole: 'admin',
      hasStepUpMfa: true,
    };

    expect(() => engine.approvePrivilegedAction(selfApproval)).toThrow(
      'MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN: Proposer mem_maker_alice cannot approve their own action'
    );

    // Valid dual-control approval by distinct checker Bob with Step-Up MFA
    const validApproval: PrivilegedApprovalInput = {
      proposalId: proposal.proposalId,
      approverId: 'mem_checker_bob',
      approverRole: 'admin',
      hasStepUpMfa: true,
    };

    const approvalResult = engine.approvePrivilegedAction(validApproval);
    expect(approvalResult.status).toBe('APPROVED');
    expect(approvalResult.approvedBy).toBe('mem_checker_bob');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: Step-Up MFA Requirement for High-Risk Actions
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Strictly rejects privileged approval if Step-Up MFA verification is missing', () => {
    const engine = new WorkforceSecurityEngine();

    const proposal = engine.createPrivilegedActionProposal({
      proposalId: 'prop_payout_hold_01',
      requesterId: 'mem_maker_carol',
      actionType: 'EMERGENCY_PAYOUT_FREEZE',
      details: { hostId: 'host_flagged_101' },
    });

    const approvalWithoutMfa: PrivilegedApprovalInput = {
      proposalId: proposal.proposalId,
      approverId: 'mem_checker_dave',
      approverRole: 'admin',
      hasStepUpMfa: false, // Missing Step-Up MFA!
    };

    expect(() => engine.approvePrivilegedAction(approvalWithoutMfa)).toThrow(
      'STEP_UP_MFA_REQUIRED: Privileged action approval requires step-up multi-factor authentication'
    );
  });
});
