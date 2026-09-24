/**
 * AdTech SAC 998313 Markup Settlement & Variance Hardening Engine
 *
 * Enforces FAANG L7/L8 Zero-Trust commercial invariants for Package P6.4 (`COMM-01` Gate):
 * 1. Transactional Outbox for ad spend settlement ledger and audit trail with atomic rollback.
 * 2. 200ms burst deduplication on concurrent settlement requests via in-flight Promise caching.
 * 3. Strict 3% to 5% AdTech markup bounding per founder directive HARVO-008/009 and Decision CR1-022.
 * 4. Statutory 18% GST calculation under SAC 998313 (Advertising Services) on platform markup.
 * 5. Provider ad spend variance circuit breaker (fails closed if variance > +5%).
 * 6. Monotonic settlement attestation sequence fencing against out-of-order gateway/ERP webhooks.
 */

export interface SettlementDbClientPort {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface AdTechSettlementInput {
  campaignId: string;
  hostId: string;
  mediaSpendCostPaise: number;
  markupRate: number;
  idempotencyKey: string;
  operatorId: string;
}

export interface AdTechSettlementBreakdown {
  mediaSpendCostPaise: number;
  markupRate: number;
  markupPaise: number;
  gstSac998313Paise: number;
  totalHostChargedPaise: number;
}

export interface AdTechSettlementResult {
  settlementId: string;
  campaignId: string;
  hostId: string;
  status: 'COMMITTED';
  isReplay: boolean;
  timestamp: string;
  breakdown: AdTechSettlementBreakdown;
}

export interface SettlementAttestationPayload {
  settlementId: string;
  sequenceNumber: number;
  status: string;
  appliedAt: number;
}

export interface SettlementAttestationResult {
  settlementId: string;
  status: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  reason?: string;
}

export interface VarianceReconciliationInput {
  budgetCostPaise: number;
  actualProviderSpendPaise: number;
}

export interface VarianceReconciliationResult {
  isAcceptable: boolean;
  variancePercentage: number;
}

export class AdTechSettlementHardeningEngine {
  private inFlightSettlements = new Map<string, Promise<AdTechSettlementResult>>();
  private completedSettlements = new Map<string, AdTechSettlementResult>();
  private settlementSequences = new Map<string, number>();
  private settlementStatuses = new Map<string, string>();

  /**
   * Computes AdTech commercial markup and SAC 998313 GST breakdown:
   * - Markup rate must be strictly bounded between 3% and 5% (0.03 to 0.05).
   * - Markup fee M = mediaSpendCostPaise * markupRate.
   * - GST on Markup under SAC 998313 = M * 18%.
   * - Total charged = mediaSpendCostPaise + M + GST.
   */
  calculateSettlementBreakdown(
    mediaSpendCostPaise: number,
    markupRate: number
  ): AdTechSettlementBreakdown {
    if (markupRate < 0.03 || markupRate > 0.05) {
      throw new Error(
        'INVALID_ADTECH_MARKUP_RATE_EXCEPTION: AdTech markup rate must be strictly bounded between 3% and 5% (0.03 to 0.05) per founder directive HARVO-008/009 and Decision CR1-022.'
      );
    }

    const markupPaise = Math.round(mediaSpendCostPaise * markupRate);
    const gstSac998313Paise = Math.round(markupPaise * 0.18);
    const totalHostChargedPaise = mediaSpendCostPaise + markupPaise + gstSac998313Paise;

    return {
      mediaSpendCostPaise,
      markupRate,
      markupPaise,
      gstSac998313Paise,
      totalHostChargedPaise,
    };
  }

  /**
   * Settles AdTech campaign markup and logs transactional audit entry in an atomic SQL transaction.
   * Deduplicates rapid 200ms burst submissions via in-flight Promise caching.
   */
  async settleCampaignMarkupWithAudit(
    dbClient: SettlementDbClientPort,
    input: AdTechSettlementInput
  ): Promise<AdTechSettlementResult> {
    // 1. Check idempotency cache
    const existing = this.completedSettlements.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, isReplay: true };
    }

    // 2. Check in-flight burst deduplication
    const inFlight = this.inFlightSettlements.get(input.idempotencyKey);
    if (inFlight) {
      const res = await inFlight;
      return { ...res, isReplay: true };
    }

    const executionPromise = (async (): Promise<AdTechSettlementResult> => {
      await dbClient.query('BEGIN');
      try {
        const settlementId = `settle_${input.idempotencyKey}`;
        const breakdown = this.calculateSettlementBreakdown(
          input.mediaSpendCostPaise,
          input.markupRate
        );

        // Step 1: Insert into adtech_settlement_ledger
        await dbClient.query(
          `INSERT INTO adtech_settlement_ledger (id, campaign_id, host_id, media_spend_cost_paise, markup_rate, markup_paise, gst_sac_998313_paise, total_host_charged_paise, operator_id, idempotency_key, status)
           VALUES ('${settlementId}', '${input.campaignId}', '${input.hostId}', ${breakdown.mediaSpendCostPaise}, ${breakdown.markupRate}, ${breakdown.markupPaise}, ${breakdown.gstSac998313Paise}, ${breakdown.totalHostChargedPaise}, '${input.operatorId}', '${input.idempotencyKey}', 'COMMITTED')`
        );

        // Step 2: Insert into platform_audit_log (Transactional Outbox)
        await dbClient.query(
          `INSERT INTO platform_audit_log (id, event_type, aggregate_id, actor_id, status)
           VALUES ('audit_${settlementId}', 'ADTECH_MARKUP_SETTLED', '${settlementId}', '${input.operatorId}', 'COMMITTED')`
        );

        await dbClient.query('COMMIT');

        const outcome: AdTechSettlementResult = {
          settlementId,
          campaignId: input.campaignId,
          hostId: input.hostId,
          status: 'COMMITTED',
          isReplay: false,
          timestamp: new Date().toISOString(),
          breakdown,
        };

        this.completedSettlements.set(input.idempotencyKey, outcome);
        return outcome;
      } catch (err: unknown) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        this.inFlightSettlements.delete(input.idempotencyKey);
      }
    })();

    this.inFlightSettlements.set(input.idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Validates provider media spend variance against agreed campaign budget.
   * If actual provider spend exceeds budget by more than 5%, fails closed with an exception.
   */
  validateProviderVariance(input: VarianceReconciliationInput): VarianceReconciliationResult {
    const variance = input.actualProviderSpendPaise - input.budgetCostPaise;
    const variancePercentage = (variance / input.budgetCostPaise) * 100;

    if (variancePercentage > 5.0) {
      throw new Error(
        `EXCESSIVE_PROVIDER_VARIANCE_EXCEPTION: Provider spend variance (${variancePercentage.toFixed(2)}%) exceeds permissible 5% tolerance threshold. Requires manual Finance Desk audit.`
      );
    }

    return {
      isAcceptable: true,
      variancePercentage,
    };
  }

  /**
   * Applies an incoming settlement attestation update with monotonic sequence fencing.
   */
  async applySettlementSequence(
    payload: SettlementAttestationPayload
  ): Promise<SettlementAttestationResult> {
    const currentSeq = this.settlementSequences.get(payload.settlementId) || 0;
    const currentStatus = this.settlementStatuses.get(payload.settlementId) || 'NOT_INITIALIZED';

    if (payload.sequenceNumber <= currentSeq) {
      return {
        settlementId: payload.settlementId,
        status: currentStatus,
        applied: false,
        isStale: true,
        currentSequence: currentSeq,
        reason: 'STALE_SETTLEMENT_SEQUENCE_REJECTED',
      };
    }

    this.settlementSequences.set(payload.settlementId, payload.sequenceNumber);
    this.settlementStatuses.set(payload.settlementId, payload.status);

    return {
      settlementId: payload.settlementId,
      status: payload.status,
      applied: true,
      isStale: false,
      currentSequence: payload.sequenceNumber,
    };
  }
}
