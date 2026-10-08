import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { StaffSessionReader, WorkforceSessionError } from '../lib/iam/staffSessions.js';
import { PostgresWorkforceAuthorization } from '../lib/iam/postgresAuthorization.js';
import {
  PrivilegedActions,
  PrivilegedActionError,
  type PrivilegedActionReceipt,
  type PrivilegedActionResult,
  type PrivilegedActionRequestInput,
} from '../lib/iam/privilegedActions.js';
import { workforceEnvironmentSchema } from '../shared/iam/contracts.js';
import type { PrincipalContext } from '../shared/iam/principalContext.js';

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

      // 1. Validate reservation root
      const res = (await client.query<{ id: string }>(
        'SELECT id FROM canonical_reservations WHERE id = $1',
        [params.reservationId]
      )).rows[0];
      if (!res) throw new Error('RESERVATION_NOT_FOUND');

      // 2. Validate latest event is CANCELLED by INTERNAL_DECISION for ENCHO_DIRECT
      const cancelEvent = (await client.query<{
        event_id: string;
        event_type: string;
        origin_kind: string;
        actor_kind: string;
        decision_source_kind: string;
      }>(
        `SELECT event_id, event_type, origin_kind, actor_kind, decision_source_kind
         FROM canonical_reservation_events
         WHERE reservation_id = $1
         ORDER BY sequence_number DESC
         LIMIT 1`,
        [params.reservationId]
      )).rows[0];

      if (!cancelEvent || cancelEvent.event_type !== 'CANCELLED' ||
          cancelEvent.origin_kind !== 'ENCHO_DIRECT' ||
          cancelEvent.actor_kind !== 'INTERNAL_DECISION' ||
          cancelEvent.decision_source_kind !== 'INTERNAL_AUTHORITY_PRIMITIVE') {
        throw new Error('RESERVATION_NOT_CANCELLED');
      }

      // 3. Validate unique V1 cancellation release
      const release = (await client.query<{
        release_id: string;
        released_effective_version: number;
        released_revision_id: string | null;
      }>(
        `SELECT release_id, released_effective_version, released_revision_id
         FROM canonical_reservation_cancellation_inventory_releases
         WHERE reservation_id = $1`,
        [params.reservationId]
      )).rows[0];

      if (!release || release.released_effective_version !== 1 || release.released_revision_id !== null) {
        throw new Error('CANCELLATION_RELEASE_INVALID');
      }

      // 4. Validate paid bridge
      const bridge = (await client.query<{
        id: string;
        payment_attempt_id: string;
        quote_id: string;
      }>(
        'SELECT id, payment_attempt_id, quote_id FROM canonical_payment_reservations WHERE reservation_id = $1',
        [params.reservationId]
      )).rows[0];
      if (!bridge) throw new Error('PAID_BRIDGE_NOT_FOUND');

      // 5. Validate payable authority
      const payable = (await client.query<{
        id: string;
        currency: string;
      }>(
        'SELECT id, currency FROM canonical_payable_authorities WHERE quote_id = $1',
        [bridge.quote_id]
      )).rows[0];
      if (!payable || payable.currency !== 'INR') throw new Error('PAYABLE_AUTHORITY_INVALID');

      // 6. Validate capture facts
      const captures = (await client.query<{
        id: string;
        origin_kind: 'RAZORPAY' | 'STRIPE';
        provider_payment_ref: string;
        evidence_hash: string;
        reported_amount_paise: string;
      }>(
        `SELECT id, origin_kind, provider_payment_ref, evidence_hash, reported_amount_paise
         FROM canonical_provider_events
         WHERE payment_attempt_id = $1
           AND normalized_event_type = 'PAYMENT_CAPTURED'`,
        [bridge.payment_attempt_id]
      )).rows;

      if (!captures.length) throw new Error('NO_VERIFIED_CAPTURES_FOUND');

      const distinctAmounts = new Set(captures.map(c => c.reported_amount_paise));
      if (distinctAmounts.size > 1) throw new Error('CAPTURE_AMOUNT_CONFLICT');

      const capture = captures[0];
      const ceiling = BigInt(capture.reported_amount_paise);
      const requested = BigInt(params.approvedAmountMinor);

      if (requested <= 0n || requested > ceiling) {
        throw new Error('APPROVED_AMOUNT_INVALID');
      }

      return admissionPacketSchema.parse({
        admissionCommandId: params.admissionCommandId,
        decisionRef: params.decisionRef,
        decisionVersion: params.decisionVersion ?? 1,
        reservationId: params.reservationId,
        cancellationEventId: cancelEvent.event_id,
        cancellationReleaseId: release.release_id,
        paidBridgeId: bridge.id,
        paymentAttemptId: bridge.payment_attempt_id,
        quoteId: bridge.quote_id,
        payableAuthorityId: payable.id,
        providerOriginKind: capture.origin_kind,
        providerPaymentRef: capture.provider_payment_ref,
        supportingProviderEventId: capture.id,
        supportingEvidenceHash: capture.evidence_hash,
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

    // Call privilegedActions.request to create PENDING action authorization
    const requested = await this.privileged.request(envelope);

    // Retain exact prepared packet in database
    await this.staffPool.query(
      `INSERT INTO canonical_cancellation_refund_decision_preparations (
        command_id,
        action_authorization_id,
        reservation_id,
        command_fingerprint,
        maker_membership_id,
        packet_payload
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        params.packet.admissionCommandId,
        requested.receipt.id,
        params.packet.reservationId,
        commandFingerprint,
        envelope.context.principal.membershipId,
        JSON.stringify(params.packet),
      ]
    );

    return {
      actionReceipt: requested.receipt,
      commandFingerprint,
      envelope,
    };
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
      // 1. Verify checker possesses accommodation_finance_approver appointment
      const appointment = (await client.query<{ valid: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM internal_membership_grants g
          JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
          JOIN internal_role_definitions r ON r.id = v.role_id
          LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
          WHERE g.organization_id = $1
            AND g.membership_id = $2
            AND r.role_key = 'accommodation_finance_approver'
            AND g.environment = $3
            AND g.valid_from <= clock_timestamp()
            AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
            AND rev.grant_id IS NULL
        ) AS valid`,
        [checkerPrincipal.organizationId, checkerPrincipal.membershipId, this.environment]
      )).rows[0]?.valid;

      if (!appointment) {
        throw new PrivilegedActionError('PERMISSION_DENIED');
      }

      // 2. Read action authorization
      const readResult = await this.privileged.read({
        principal: checkerPrincipal,
        organizationId: checkerPrincipal.organizationId,
        authorizationId,
      });

      // 3. Load retained preparation
      const prepRow = (await client.query<{
        packet_payload: unknown;
        command_fingerprint: string;
      }>(
        `SELECT packet_payload, command_fingerprint
         FROM canonical_cancellation_refund_decision_preparations
         WHERE action_authorization_id = $1`,
        [authorizationId]
      )).rows[0];

      if (!prepRow) {
        throw new PrivilegedActionError('ACTION_NOT_FOUND');
      }

      const packet = admissionPacketSchema.parse(prepRow.packet_payload);
      if (prepRow.command_fingerprint !== readResult.receipt.commandHash) {
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
      // 1. Verify checker appointment in PostgreSQL
      const appointment = (await client.query<{ valid: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM internal_membership_grants g
          JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
          JOIN internal_role_definitions r ON r.id = v.role_id
          LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
          WHERE g.organization_id = $1
            AND g.membership_id = $2
            AND r.role_key = 'accommodation_finance_approver'
            AND g.environment = $3
            AND g.valid_from <= clock_timestamp()
            AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
            AND rev.grant_id IS NULL
        ) AS valid`,
        [checkerPrincipal.organizationId, checkerPrincipal.membershipId, this.environment]
      )).rows[0]?.valid;

      if (!appointment) {
        throw new PrivilegedActionError('PERMISSION_DENIED');
      }

      // 2. Execute approve
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
    }
  ): Promise<AdmittedDecisionRecord> {
    // 1. Authenticate maker session and check replay / load preparation
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
        // Enforce maker equality
        if (row.maker_membership_id !== makerPrincipal.membershipId) {
          throw new PrivilegedActionError('PERMISSION_DENIED');
        }

        // Load prepared packet & reason to verify fingerprint on replay
        const prepRow = (await client.query<{
          packet_payload: AdmissionCommandPacket;
          command_fingerprint: string;
          reason: string;
        }>(
          `SELECT p.packet_payload, p.command_fingerprint, a.reason
           FROM canonical_cancellation_refund_decision_preparations p
           JOIN internal_action_authorizations a ON a.id = p.action_authorization_id
           WHERE p.command_id = $1`,
          [params.packet.admissionCommandId]
        )).rows[0];

        if (!prepRow) {
          throw new PrivilegedActionError('COMMAND_CONFLICT');
        }

        const expectedEnvelope = this.buildRequestEnvelope(
          makerPrincipal,
          params.packet,
          params.makerStepUpReceiptId,
          prepRow.reason
        );
        const expectedFingerprint = this.fingerprint(expectedEnvelope);

        if (row.command_fingerprint !== expectedFingerprint) {
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
                a.reason, a.command_hash
         FROM canonical_cancellation_refund_decision_preparations p
         JOIN internal_action_authorizations a ON a.id = p.action_authorization_id
         WHERE p.action_authorization_id = $1`,
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
    const envelope = this.buildRequestEnvelope(
      makerPrincipal,
      params.packet,
      params.makerStepUpReceiptId,
      prep.reason
    );
    const commandHash = this.fingerprint(envelope);

    if (commandHash !== prep.command_fingerprint || commandHash !== prep.command_hash) {
      throw new PrivilegedActionError('COMMAND_CONFLICT');
    }

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
        // Optional failure injection hook (for testing rollback in A08)
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
          error.message.includes('WorkforceCommandOutcomeUnknownError') ||
          (error as any).code === '40001' || // serialization_failure
          (error as any).code === '40P01' || // deadlock_detected
          (error as any).code === '23505' || // unique_violation
          (error as any).name === 'PermissionNotGrantedError' ||
          (error as any).name === 'WorkforceCommandOutcomeUnknownError'
        )) ||
        (error && typeof error === 'object' && (
          ('code' in error && (error as { code: string }).code === 'POLICY_CHANGED') ||
          ('reason' in error && (error as { reason: string }).reason === 'POLICY_CHANGED')
        ));

      if (isRecoveryCandidate) {
        const recovered = await this.reader.read(makerToken, async (client, principal) => {
          const res = await client.query<{
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

          if (res.rows.length === 1) {
            const row = res.rows[0];
            if (row.maker_membership_id === principal.membershipId &&
                row.command_fingerprint === commandHash &&
                row.reservation_id === params.packet.reservationId) {
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
          }
          return null;
        });

        if (recovered) {
          return recovered;
        }
      }

      throw error;
    }
  }
}
