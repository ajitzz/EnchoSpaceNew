import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { StaffSessionReader, WorkforceSessionError, staffSessionCredential } from '../lib/iam/staffSessions.js';
import { isRestrictedWorkforceRuntime } from '../lib/iam/runtimeBoundary.js';
import { parsePrincipalContext, type PrincipalContext } from '../shared/iam/principalContext.js';
import { requireExecutionContext } from '../lib/observability/executionContext.js';
import {
  PostgresWorkforceAuthorization,
  WorkforceCommandOutcomeUnknownError,
} from '../lib/iam/postgresAuthorization.js';
import {
  PrivilegedActions,
  PrivilegedActionError,
  type PrivilegedActionReceipt,
  type PrivilegedActionResult,
  type PrivilegedActionRequestInput,
} from '../lib/iam/privilegedActions.js';
import { workforceEnvironmentSchema } from '../shared/iam/contracts.js';

const decimalMinorSchema = z.string().regex(/^[1-9][0-9]*$/);
const reasonCodeSchema = z.string().regex(/^[A-Z0-9_]{1,64}$/);

export const admissionPacketSchema = z.object({
  admissionCommandId: z.string().uuid(),
  decisionRef: z.string().trim().min(1).max(128),
  decisionVersion: z.number().int().positive(),
  reservationId: z.string().uuid(),
  cancellationEventId: z.string().uuid(),
  cancellationReleaseId: z.string().uuid(),
  paidBridgeId: z.string().uuid(),
  paymentAttemptId: z.string().uuid(),
  quoteId: z.string().uuid(),
  payableAuthorityId: z.string().uuid(),
  providerOriginKind: z.enum(['RAZORPAY', 'STRIPE']),
  providerPaymentRef: z.string().trim().min(1),
  supportingProviderEventId: z.string().uuid(),
  supportingEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAmountMinor: decimalMinorSchema,
  currency: z.literal('INR'),
  reasonCode: reasonCodeSchema,
  reasonText: z.string().max(500).nullable(),
  organizationId: z.string().uuid(),
  resource: z.object({
    type: z.literal('FINANCIAL_CONTRACT'),
    id: z.string().uuid(),
  }).strict(),
  environment: workforceEnvironmentSchema,
  schemaVersion: z.literal(1),
  limitedMeaning: z.literal('ACCOMMODATION_CANCELLATION_REFUND_DECISION_ONLY'),
}).strict();

export type AdmissionCommandPacket = z.infer<typeof admissionPacketSchema>;

export type AdmittedDecisionRecord = Readonly<{
  evidenceId: string;
  admissionId: string;
  commandId: string;
  decisionRef: string;
  decisionVersion: number;
  decisionDigest: string;
  reservationId: string;
  approvedAmountPaise: bigint;
  currency: string;
  admittedAt: string;
  makerMembershipId?: string;
  checkerMembershipId?: string;
  replayed: boolean;
}>;

export class CanonicalRefundDecisionAdmissionService {
  private readonly reader: StaffSessionReader;
  private readonly auth: PostgresWorkforceAuthorization;
  private readonly privileged: PrivilegedActions<AdmissionCommandPacket>;

  constructor(
    private readonly staffPool: pg.Pool,
    private readonly environment: z.infer<typeof workforceEnvironmentSchema>
  ) {
    this.reader = new StaffSessionReader(staffPool, environment);
    this.auth = new PostgresWorkforceAuthorization(staffPool, environment);
    this.privileged = new PrivilegedActions<AdmissionCommandPacket>(staffPool, {
      environment,
      commandKind: 'accommodation.cancellation_refund_decision.admit',
      permission: 'accommodation.refund_decision.admit',
      commandSchema: admissionPacketSchema,
    });
  }

  buildRequestEnvelope(
    makerPrincipal: PrincipalContext,
    packet: AdmissionCommandPacket,
    makerStepUpReceiptId: string,
    reason: string
  ): PrivilegedActionRequestInput<AdmissionCommandPacket> {
    return {
      context: {
        tenant: {
          kind: 'INTERNAL_ORGANIZATION',
          organizationId: packet.organizationId,
        },
        principal: makerPrincipal,
        permission: 'accommodation.refund_decision.admit',
        resource: {
          target: { type: 'FINANCIAL_CONTRACT', id: packet.reservationId },
          ancestors: [],
        },
        conditions: {
          environment: this.environment,
          amountMinor: packet.approvedAmountMinor,
          requestedAt: new Date().toISOString(),
        },
        evidence: {
          stepUpReceiptId: makerStepUpReceiptId,
        },
      },
      idempotencyKey: `ref-adm:${packet.reservationId}:${packet.decisionRef}:${packet.decisionVersion}`,
      reason,
      command: packet,
    };
  }

  fingerprint(envelope: PrivilegedActionRequestInput<AdmissionCommandPacket>): string {
    return this.privileged.fingerprint(envelope);
  }

  fingerprintPacket(packet: AdmissionCommandPacket, reason: string): string {
    return this.privileged.fingerprint({
      context: {
        tenant: {
          kind: 'INTERNAL_ORGANIZATION',
          organizationId: packet.organizationId,
        },
        principal: {
          accountId: 1,
          actorKind: 'STAFF',
          organizationId: packet.organizationId,
          membershipId: '00000000-0000-4000-8000-000000000001',
          sessionId: '00000000-0000-4000-8000-000000000001',
          assuranceLevel: 'AAL2',
          authenticatedAt: new Date(0).toISOString(),
          correlationId: 'trace-1',
          operationId: 'op-1',
        },
        permission: 'accommodation.refund_decision.admit',
        resource: {
          target: { type: 'FINANCIAL_CONTRACT', id: packet.reservationId },
          ancestors: [],
        },
        conditions: {
          environment: this.environment,
          amountMinor: packet.approvedAmountMinor,
          requestedAt: new Date(0).toISOString(),
        },
        evidence: {},
      },
      idempotencyKey: `ref-adm:${packet.reservationId}:${packet.decisionRef}:${packet.decisionVersion}`,
      reason,
      command: packet,
    });
  }

  async deriveCanonicalPreview(
    makerToken: string,
    params: {
      admissionCommandId: string;
      decisionRef: string;
      decisionVersion?: number;
      reservationId: string;
      approvedAmountMinor: string;
      reasonCode: string;
      reasonText?: string | null;
      organizationId: string;
    }
  ): Promise<AdmissionCommandPacket> {
    decimalMinorSchema.parse(params.approvedAmountMinor);
    reasonCodeSchema.parse(params.reasonCode);

    return this.reader.read(makerToken, async (client, principal) => {
      if (principal.organizationId !== params.organizationId) {
        throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      }

      // Call protected database preview function
      const previewRes = await client.query<{
        reservation_id: string;
        cancellation_event_id: string;
        cancellation_release_id: string;
        paid_bridge_id: string;
        payment_attempt_id: string;
        quote_id: string;
        payable_authority_id: string;
        provider_origin_kind: 'RAZORPAY' | 'STRIPE';
        provider_payment_ref: string;
        supporting_provider_event_id: string;
        supporting_evidence_hash: string;
        captured_ceiling_paise: string;
        currency: string;
      }>(
        'SELECT * FROM get_cancellation_refund_decision_preview($1)',
        [params.reservationId]
      );

      if (previewRes.rows.length === 0) {
        throw new Error('RESERVATION_NOT_FOUND');
      }

      const preview = previewRes.rows[0];
      const ceiling = BigInt(preview.captured_ceiling_paise);
      const requested = BigInt(params.approvedAmountMinor);

      if (requested <= 0n || requested > ceiling) {
        throw new Error('APPROVED_AMOUNT_INVALID');
      }

      return admissionPacketSchema.parse({
        admissionCommandId: params.admissionCommandId,
        decisionRef: params.decisionRef,
        decisionVersion: params.decisionVersion ?? 1,
        reservationId: params.reservationId,
        cancellationEventId: preview.cancellation_event_id,
        cancellationReleaseId: preview.cancellation_release_id,
        paidBridgeId: preview.paid_bridge_id,
        paymentAttemptId: preview.payment_attempt_id,
        quoteId: preview.quote_id,
        payableAuthorityId: preview.payable_authority_id,
        providerOriginKind: preview.provider_origin_kind,
        providerPaymentRef: preview.provider_payment_ref,
        supportingProviderEventId: preview.supporting_provider_event_id,
        supportingEvidenceHash: preview.supporting_evidence_hash,
        approvedAmountMinor: params.approvedAmountMinor,
        currency: 'INR',
        reasonCode: params.reasonCode,
        reasonText: params.reasonText ?? null,
        organizationId: params.organizationId,
        resource: { type: 'FINANCIAL_CONTRACT', id: params.reservationId },
        environment: this.environment,
        schemaVersion: 1,
        limitedMeaning: 'ACCOMMODATION_CANCELLATION_REFUND_DECISION_ONLY',
      });
    });
  }

  async prepareRefundDecisionAdmission(
    makerToken: string,
    params: {
      packet: AdmissionCommandPacket;
      makerStepUpReceiptId: string;
      reason: string;
    }
  ): Promise<{
    actionReceipt: PrivilegedActionReceipt;
    commandFingerprint: string;
    envelope: PrivilegedActionRequestInput<AdmissionCommandPacket>;
    replayed: boolean;
  }> {
    const envelope = await this.reader.read(makerToken, async (_client, makerPrincipal) => {
      return this.buildRequestEnvelope(
        makerPrincipal,
        params.packet,
        params.makerStepUpReceiptId,
        params.reason
      );
    });

    const commandFingerprint = this.fingerprint(envelope);

    // Call privilegedActions.request to create/replay PENDING action authorization
    const requested = await this.privileged.request(envelope);

    // Retain exact prepared packet in database via protected routine
    const prepResult = await this.executeWithStaffSessionWrite(makerToken, async (client, _makerPrincipal) => {
      const res = await client.query<{
        preparation_id: string;
        command_id: string;
        action_authorization_id: string;
        reservation_id: string;
        command_fingerprint: string;
        maker_membership_id: string;
        packet_payload: unknown;
        created_at: Date;
        replayed: boolean;
      }>(
        `SELECT * FROM prepare_cancellation_refund_decision(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
        )`,
        [
          params.packet.admissionCommandId,
          requested.receipt.id,
          params.packet.reservationId,
          params.packet.decisionRef,
          params.packet.decisionVersion,
          BigInt(params.packet.approvedAmountMinor),
          params.packet.currency,
          params.packet.reasonCode,
          params.reason,
          commandFingerprint,
          JSON.stringify(params.packet),
        ]
      );
      return res.rows[0];
    });

    return {
      actionReceipt: requested.receipt,
      commandFingerprint,
      envelope,
      replayed: prepResult.replayed,
    };
  }

  private async executeWithStaffSessionWrite<T>(
    authorization: unknown,
    work: (client: pg.PoolClient, principal: PrincipalContext) => Promise<T>
  ): Promise<T> {
    const credential = staffSessionCredential(authorization);
    const digest = createHash('sha256').update(credential).digest('hex');
    const trace = requireExecutionContext();
    const client = await this.staffPool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      if (!(await isRestrictedWorkforceRuntime(client))) {
        throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      }
      await client.query("SELECT set_config('app.workforce_environment',$1,true)", [this.environment]);
      const result = await client.query('SELECT * FROM internal_iam_authenticate_session($1)', [digest]);
      if (result.rowCount !== 1 || !result.rows[0]) {
        throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      }
      const session = result.rows[0];
      const principal = parsePrincipalContext({
        accountId: session.account_id,
        actorKind: 'STAFF',
        organizationId: session.organization_id,
        membershipId: session.membership_id,
        sessionId: session.session_id,
        assuranceLevel: session.assurance_level,
        authenticatedAt: session.authenticated_at instanceof Date ? session.authenticated_at.toISOString() : String(session.authenticated_at),
        correlationId: trace.correlationId,
        operationId: trace.operationId,
      });
      await client.query(
        `SELECT set_config('app.current_user_id',$1,true),
                set_config('app.organization_id',$2,true),
                set_config('app.membership_id',$3,true),
                set_config('app.staff_session_id',$4,true),
                set_config('app.bypass_rls','false',true),
                set_config('app.marketing_admin','false',true)`,
        [String(principal.accountId), principal.organizationId, principal.membershipId, principal.sessionId]
      );
      const active = (await client.query<{valid: boolean}>('SELECT internal_iam_lock_authority() AS valid')).rows[0];
      if (!active?.valid) {
        throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      }
      if (this.environment === 'PRODUCTION') {
        const approved = await client.query(`SELECT 1 FROM internal_iam_current_policy p
          JOIN internal_iam_policy_versions v ON v.id=p.version_id
          WHERE p.singleton AND v.approval_status='APPROVED'`);
        if (approved.rowCount !== 1) throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      }
      const value = await work(client, principal);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async getRefundDecisionPreview(
    checkerToken: string,
    authorizationId: string
  ): Promise<{
    actionReceipt: PrivilegedActionReceipt;
    packet: AdmissionCommandPacket;
    commandFingerprint: string;
  }> {
    return this.reader.read(checkerToken, async (client, checkerPrincipal) => {
      // 1. Read action authorization (verifies checker membership and scope)
      const readResult = await this.privileged.read({
        principal: checkerPrincipal,
        organizationId: checkerPrincipal.organizationId,
        authorizationId,
      });

      // 2. Verify dedicated checker appointment in PostgreSQL
      const appointment = (await client.query<{ valid: boolean }>(
        `SELECT EXISTS (
          SELECT 1
          FROM internal_membership_grants g
          JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
          JOIN internal_role_definitions r ON r.id = v.role_id AND r.organization_id = g.organization_id
          JOIN internal_role_current_versions rcv ON rcv.role_id = r.id AND rcv.version_id = v.id
          LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
          WHERE g.organization_id = $1
            AND g.membership_id = $2
            AND r.role_key = 'accommodation_finance_approver'
            AND g.environment = $3
            AND g.valid_from <= clock_timestamp()
            AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
            AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= $4::bigint)
            AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = $5))
            AND rev.grant_id IS NULL
        ) AS valid`,
        [
          checkerPrincipal.organizationId,
          checkerPrincipal.membershipId,
          this.environment,
          readResult.receipt.amountMinor ? BigInt(readResult.receipt.amountMinor) : 0n,
          readResult.receipt.resource.id,
        ]
      )).rows[0]?.valid;

      if (!appointment) {
        throw new PrivilegedActionError('PERMISSION_DENIED');
      }

      // 3. Load retained preparation
      const prepRow = (await client.query<{
        packet_payload: unknown;
        command_fingerprint: string;
        reason: string;
      }>(
        `SELECT packet_payload, command_fingerprint, reason
         FROM get_cancellation_refund_decision_preparation($1)`,
        [authorizationId]
      )).rows[0];

      if (!prepRow) {
        throw new PrivilegedActionError('ACTION_NOT_FOUND');
      }

      const packet = admissionPacketSchema.parse(prepRow.packet_payload);
      const recomputedFingerprint = this.fingerprintPacket(packet, prepRow.reason);

      if (
        prepRow.command_fingerprint !== readResult.receipt.commandHash ||
        recomputedFingerprint !== readResult.receipt.commandHash ||
        prepRow.command_fingerprint !== recomputedFingerprint
      ) {
        throw new PrivilegedActionError('COMMAND_CONFLICT');
      }

      return {
        actionReceipt: readResult.receipt,
        packet,
        commandFingerprint: prepRow.command_fingerprint,
      };
    });
  }

  async approveRefundDecisionAdmission(
    checkerToken: string,
    params: {
      authorizationId: string;
      expectedCommandHash: string;
      checkerStepUpReceiptId: string;
      reason: string;
    }
  ): Promise<PrivilegedActionResult> {
    return this.reader.read(checkerToken, async (client, checkerPrincipal) => {
      // 1. Load authorization to inspect amount and scope
      const authRow = (await client.query<{
        amount_minor: string | null;
        maker_membership_id: string;
        resource_id: string;
      }>(
        `SELECT amount_minor, maker_membership_id, resource_id
         FROM internal_action_authorizations
         WHERE id = $1`,
        [params.authorizationId]
      )).rows[0];

      if (!authRow) {
        throw new PrivilegedActionError('ACTION_NOT_FOUND');
      }

      if (authRow.maker_membership_id === checkerPrincipal.membershipId) {
        throw new PrivilegedActionError('MAKER_CHECKER_CONFLICT');
      }

      // 2. Verify dedicated checker appointment in PostgreSQL
      const approvedMinor = authRow.amount_minor ? BigInt(authRow.amount_minor) : 0n;
      const appointment = (await client.query<{ valid: boolean }>(
        `SELECT EXISTS (
          SELECT 1
          FROM internal_membership_grants g
          JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
          JOIN internal_role_definitions r ON r.id = v.role_id AND r.organization_id = g.organization_id
          JOIN internal_role_current_versions rcv ON rcv.role_id = r.id AND rcv.version_id = v.id
          LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
          WHERE g.organization_id = $1
            AND g.membership_id = $2
            AND r.role_key = 'accommodation_finance_approver'
            AND g.environment = $3
            AND g.valid_from <= clock_timestamp()
            AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
            AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= $4)
            AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = $5))
            AND rev.grant_id IS NULL
        ) AS valid`,
        [checkerPrincipal.organizationId, checkerPrincipal.membershipId, this.environment, approvedMinor, authRow.resource_id]
      )).rows[0]?.valid;

      if (!appointment) {
        throw new PrivilegedActionError('PERMISSION_DENIED');
      }

      // 3. Execute approve
      return this.privileged.approve({
        principal: checkerPrincipal,
        organizationId: checkerPrincipal.organizationId,
        authorizationId: params.authorizationId,
        expectedCommandHash: params.expectedCommandHash,
        reason: params.reason,
        stepUpReceiptId: params.checkerStepUpReceiptId,
      });
    });
  }

  async admitRefundDecision(
    makerToken: string,
    params: {
      packet: AdmissionCommandPacket;
      actionAuthorizationId: string;
      makerStepUpReceiptId: string;
      injectedFailureHook?: (client: pg.PoolClient) => Promise<void>;
      postAdmissionHook?: (client: pg.PoolClient, result: unknown) => Promise<void>;
    }
  ): Promise<AdmittedDecisionRecord> {
    // 1. Authenticate maker session and check protected guarded replay
    const prepData = await this.reader.read(makerToken, async (client, makerPrincipal) => {
      // A. Guarded Replay Check before entering NEW path
      const replayRes = await client.query<{
        evidence_id: string;
        admission_id: string;
        command_id: string;
        decision_ref: string;
        decision_version: number;
        decision_digest: string;
        reservation_id: string;
        approved_amount_paise: string;
        currency: string;
        admitted_at: Date;
        maker_membership_id: string;
        checker_membership_id: string;
        command_fingerprint: string;
        replayed: boolean;
      }>(
        'SELECT * FROM get_admitted_cancellation_refund_decision($1)',
        [params.packet.admissionCommandId]
      );

      if (replayRes.rows.length === 1) {
        const row = replayRes.rows[0];

        // Reject changed-semantic replay: verify params.packet matches existing admitted record
        if (
          params.packet.admissionCommandId !== row.command_id ||
          params.packet.reservationId !== row.reservation_id ||
          params.packet.decisionRef !== row.decision_ref ||
          params.packet.decisionVersion !== row.decision_version ||
          BigInt(params.packet.approvedAmountMinor) !== BigInt(row.approved_amount_paise) ||
          params.packet.currency !== row.currency
        ) {
          throw new PrivilegedActionError('COMMAND_CONFLICT');
        }

        return {
          isReplay: true as const,
          makerPrincipal,
          record: {
            evidenceId: row.evidence_id,
            admissionId: row.admission_id,
            commandId: row.command_id,
            decisionRef: row.decision_ref,
            decisionVersion: row.decision_version,
            decisionDigest: row.decision_digest,
            reservationId: row.reservation_id,
            approvedAmountPaise: BigInt(row.approved_amount_paise),
            currency: row.currency,
            admittedAt: row.admitted_at.toISOString(),
            makerMembershipId: row.maker_membership_id,
            checkerMembershipId: row.checker_membership_id,
            replayed: true,
          },
        };
      }

      // B. Load Staged Preparation Packet for NEW admission
      const prepRes = await client.query<{
        command_fingerprint: string;
        action_authorization_id: string;
        maker_membership_id: string;
        packet_payload: AdmissionCommandPacket;
        reason: string;
        command_hash: string;
      }>(
        `SELECT p.command_fingerprint, p.action_authorization_id, p.maker_membership_id, p.packet_payload,
                p.reason, a.command_hash
         FROM get_cancellation_refund_decision_preparation($1) p
         JOIN internal_action_authorizations a ON a.id = p.action_authorization_id`,
        [params.actionAuthorizationId]
      );

      if (prepRes.rows.length === 0) {
        throw new Error('PREPARATION_NOT_FOUND');
      }

      const prep = prepRes.rows[0];
      if (prep.maker_membership_id !== makerPrincipal.membershipId) {
        throw new PrivilegedActionError('PERMISSION_DENIED');
      }

      return {
        isReplay: false as const,
        makerPrincipal,
        prep,
      };
    });

    if (prepData.isReplay) {
      return prepData.record;
    }

    const { makerPrincipal, prep } = prepData;

    // Verify packet has not been altered since preparation
    const recomputedFromParams = this.fingerprintPacket(params.packet, prep.reason);
    const recomputedFromPrep = this.fingerprintPacket(prep.packet_payload, prep.reason);

    if (
      recomputedFromParams !== prep.command_fingerprint ||
      recomputedFromParams !== prep.command_hash ||
      recomputedFromPrep !== prep.command_fingerprint ||
      recomputedFromParams !== recomputedFromPrep
    ) {
      throw new PrivilegedActionError('COMMAND_CONFLICT');
    }

    const commandHash = recomputedFromParams;

    // 2. NEW Admission Path: execute via PostgresWorkforceAuthorization.runAuthorized
    try {
      const admittedRecord = await this.auth.runAuthorized({
        tenant: {
          kind: 'INTERNAL_ORGANIZATION',
          organizationId: params.packet.organizationId,
        },
        principal: makerPrincipal,
        permission: 'accommodation.refund_decision.admit',
        resource: {
          target: { type: 'FINANCIAL_CONTRACT', id: params.packet.reservationId },
          ancestors: [],
        },
        conditions: {
          environment: this.environment,
          amountMinor: params.packet.approvedAmountMinor,
          commandHash,
          requestedAt: new Date().toISOString(),
        },
        evidence: {
          actionAuthorizationId: params.actionAuthorizationId,
          stepUpReceiptId: params.makerStepUpReceiptId,
        },
      }, async (client, _decision) => {
        // Optional pre-registrar failure hook
        if (params.injectedFailureHook) {
          await params.injectedFailureHook(client);
        }

        const result = (await client.query<{
          evidence_id: string;
          admission_id: string;
          command_id: string;
          decision_ref: string;
          decision_version: number;
          decision_digest: string;
          reservation_id: string;
          approved_amount_paise: string;
          currency: string;
          admitted_at: Date;
          replayed: boolean;
        }>(
          'SELECT * FROM admit_cancellation_refund_decision($1, $2)',
          [params.packet.admissionCommandId, params.actionAuthorizationId]
        )).rows[0];

        if (!result) {
          throw new Error('ADMISSION_REGISTRATION_FAILED');
        }

        // Optional post-admission failure hook (for testing rollback at audit stage in A08)
        if (params.postAdmissionHook) {
          await params.postAdmissionHook(client, result);
        }

        return {
          evidenceId: result.evidence_id,
          admissionId: result.admission_id,
          commandId: result.command_id,
          decisionRef: result.decision_ref,
          decisionVersion: result.decision_version,
          decisionDigest: result.decision_digest,
          reservationId: result.reservation_id,
          approvedAmountPaise: BigInt(result.approved_amount_paise),
          currency: result.currency,
          admittedAt: result.admitted_at.toISOString(),
          makerMembershipId: makerPrincipal.membershipId,
          replayed: false,
        };
      });

      return admittedRecord;
    } catch (error: unknown) {
      // 3. Concurrent Loser Recovery & Lost COMMIT uncertainty recovery
      const isRecoveryCandidate =
        (error instanceof Error && (
          (error as any).code === 'POLICY_CHANGED' ||
          error.message.includes('POLICY_CHANGED') ||
          (error as any).code === 'OUTCOME_UNKNOWN' ||
          error.message.includes('OUTCOME_UNKNOWN') ||
          error instanceof WorkforceCommandOutcomeUnknownError ||
          (error as any).code === '40001' || // serialization_failure
          (error as any).code === '40P01' || // deadlock_detected
          (error as any).code === '23505' || // unique_violation
          (error as any).name === 'PermissionNotGrantedError' ||
          (error as any).name === 'WorkforceCommandOutcomeUnknownError'
        )) ||
        (error && typeof error === 'object' && (
          (error as any).code === 'POLICY_CHANGED' ||
          (error as any).code === 'OUTCOME_UNKNOWN'
        ));

      if (isRecoveryCandidate) {
        try {
          const recovery = await this.reader.read(makerToken, async (client, recoveryPrincipal) => {
            const recoveryRes = await client.query<{
              evidence_id: string;
              admission_id: string;
              command_id: string;
              decision_ref: string;
              decision_version: number;
              decision_digest: string;
              reservation_id: string;
              approved_amount_paise: string;
              currency: string;
              admitted_at: Date;
              maker_membership_id: string;
              checker_membership_id: string;
              command_fingerprint: string;
              replayed: boolean;
            }>(
              'SELECT * FROM get_admitted_cancellation_refund_decision($1)',
              [params.packet.admissionCommandId]
            );

            if (recoveryRes.rows.length === 1) {
              const row = recoveryRes.rows[0];
              if (
                params.packet.admissionCommandId !== row.command_id ||
                params.packet.reservationId !== row.reservation_id ||
                params.packet.decisionRef !== row.decision_ref ||
                params.packet.decisionVersion !== row.decision_version ||
                BigInt(params.packet.approvedAmountMinor) !== BigInt(row.approved_amount_paise) ||
                params.packet.currency !== row.currency
              ) {
                return null;
              }
              return {
                evidenceId: row.evidence_id,
                admissionId: row.admission_id,
                commandId: row.command_id,
                decisionRef: row.decision_ref,
                decisionVersion: row.decision_version,
                decisionDigest: row.decision_digest,
                reservationId: row.reservation_id,
                approvedAmountPaise: BigInt(row.approved_amount_paise),
                currency: row.currency,
                admittedAt: row.admitted_at.toISOString(),
                makerMembershipId: row.maker_membership_id,
                checkerMembershipId: row.checker_membership_id,
                replayed: true,
              };
            }
            return null;
          });

          if (recovery) {
            return recovery;
          }
        } catch {
          // If recovery lookup fails, rethrow the original error
        }
      }

      throw error;
    }
  }
}
