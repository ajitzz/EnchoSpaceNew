/**
 * CR1 Phase P2: Workforce IAM & Privilege Fencing Engine
 *
 * Implements atomic workforce assignment claims with Transactional Outbox,
 * 200ms idempotent burst deduplication, monotonic directory sync sequence fencing,
 * and dual-control maker-checker privileged action approval with Step-Up MFA.
 */

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface WorkforceAssignmentClaimInput {
  assignmentId: string;
  organizationId: string;
  memberId: string;
  roleKey: string;
  idempotencyKey: string;
  reason: string;
}

export interface WorkforceAssignmentClaimResult {
  claimId: string;
  assignmentId: string;
  memberId: string;
  status: 'CLAIMED';
  isReplay: boolean;
  timestamp: string;
}

export interface DirectorySyncWebhookPayload {
  eventId: string;
  memberId: string;
  sequenceNumber: number;
  action: string;
  assignedRole: string;
  timestamp: string;
}

export interface DirectorySyncResult {
  eventId: string;
  memberId: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  reason?: string;
}

export interface PrivilegedActionProposalInput {
  proposalId: string;
  requesterId: string;
  actionType: string;
  details: Record<string, unknown>;
}

export interface PrivilegedActionProposal {
  proposalId: string;
  requesterId: string;
  actionType: string;
  details: Record<string, unknown>;
  status: 'PENDING_CHECKER_APPROVAL' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  createdAt: string;
}

export interface PrivilegedApprovalInput {
  proposalId: string;
  approverId: string;
  approverRole: string;
  hasStepUpMfa: boolean;
}

export class WorkforceSecurityEngine {
  private inFlightClaims = new Map<string, Promise<WorkforceAssignmentClaimResult>>();
  private completedClaims = new Map<string, WorkforceAssignmentClaimResult>();
  private directorySequences = new Map<string, number>();
  private proposals = new Map<string, PrivilegedActionProposal>();

  /**
   * Atomically claims an internal work assignment and inserts a durable audit command.
   * Guarantees all-or-nothing rollback on connection termination and deduplicates 200ms bursts.
   */
  async claimWorkAssignmentWithOutbox(
    dbClient: DbClientPort,
    input: WorkforceAssignmentClaimInput
  ): Promise<WorkforceAssignmentClaimResult> {
    // 1. Check idempotency cache for completed claims
    const existing = this.completedClaims.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, isReplay: true };
    }

    // 2. Deduplicate in-flight concurrent burst promises
    const inFlight = this.inFlightClaims.get(input.idempotencyKey);
    if (inFlight) {
      const result = await inFlight;
      return { ...result, isReplay: true };
    }

    const executionPromise = (async (): Promise<WorkforceAssignmentClaimResult> => {
      await dbClient.query('BEGIN');
      try {
        const claimId = `claim_${input.idempotencyKey}`;

        // 1. Record command in internal_assignment_commands
        await dbClient.query(
          `INSERT INTO internal_assignment_commands (id, assignment_id, member_id, idempotency_key, action)
           VALUES ('${claimId}', '${input.assignmentId}', '${input.memberId}', '${input.idempotencyKey}', 'CLAIM')`
        );

        // 2. Insert membership grant into Transactional Outbox / grants catalog
        await dbClient.query(
          `INSERT INTO internal_membership_grants (id, organization_id, member_id, role_key, reason)
           VALUES ('grant_${claimId}', '${input.organizationId}', '${input.memberId}', '${input.roleKey}', '${input.reason}')`
        );

        await dbClient.query('COMMIT');

        const result: WorkforceAssignmentClaimResult = {
          claimId,
          assignmentId: input.assignmentId,
          memberId: input.memberId,
          status: 'CLAIMED',
          isReplay: false,
          timestamp: new Date().toISOString(),
        };

        this.completedClaims.set(input.idempotencyKey, result);
        return result;
      } catch (err: unknown) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        this.inFlightClaims.delete(input.idempotencyKey);
      }
    })();

    this.inFlightClaims.set(input.idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Applies an incoming external IdP/directory sync event with strict monotonic sequence fencing.
   * Rejects out-of-order or stale sequences without corrupting member authority state.
   */
  async applyDirectorySyncEvent(payload: DirectorySyncWebhookPayload): Promise<DirectorySyncResult> {
    const currentSeq = this.directorySequences.get(payload.memberId) || 0;

    if (payload.sequenceNumber <= currentSeq) {
      return {
        eventId: payload.eventId,
        memberId: payload.memberId,
        applied: false,
        isStale: true,
        currentSequence: currentSeq,
        reason: 'STALE_DIRECTORY_EVENT_REJECTED',
      };
    }

    this.directorySequences.set(payload.memberId, payload.sequenceNumber);

    return {
      eventId: payload.eventId,
      memberId: payload.memberId,
      applied: true,
      isStale: false,
      currentSequence: payload.sequenceNumber,
    };
  }

  /**
   * Creates a privileged action proposal requiring dual-control maker-checker approval.
   */
  createPrivilegedActionProposal(input: PrivilegedActionProposalInput): PrivilegedActionProposal {
    const proposal: PrivilegedActionProposal = {
      proposalId: input.proposalId,
      requesterId: input.requesterId,
      actionType: input.actionType,
      details: input.details,
      status: 'PENDING_CHECKER_APPROVAL',
      createdAt: new Date().toISOString(),
    };

    this.proposals.set(input.proposalId, proposal);
    return proposal;
  }

  /**
   * Evaluates and approves a privileged action proposal under dual-control maker-checker rules.
   * Strictly forbids self-approval and mandates Step-Up MFA authentication.
   */
  approvePrivilegedAction(input: PrivilegedApprovalInput): PrivilegedActionProposal {
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) {
      throw new Error(`PROPOSAL_NOT_FOUND: Proposal ${input.proposalId} does not exist`);
    }

    if (!input.hasStepUpMfa) {
      throw new Error('STEP_UP_MFA_REQUIRED: Privileged action approval requires step-up multi-factor authentication');
    }

    if (input.approverId === proposal.requesterId) {
      throw new Error(
        `MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN: Proposer ${proposal.requesterId} cannot approve their own action`
      );
    }

    proposal.status = 'APPROVED';
    proposal.approvedBy = input.approverId;
    return proposal;
  }
}
