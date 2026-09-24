/**
 * CR1 Phase P5: Offer-Led Marketing & Creative Pipeline Engine
 *
 * Implements canonical room offer binding, multi-aspect creative package management,
 * and adversarial protections (burst deduplication, monotonic revision fencing,
 * transactional rollbacks, and price drift detection).
 */

export interface CreativePackageDraft {
  listingId: string;
  roomTypeId: string;
  advertisedPricePaise: number;
  flightStartDate: string;
  flightEndDate: string;
}

export interface AuthoritativeRoomData {
  roomTypeId: string;
  authoritativePricePaise: number;
  availableUnits: number;
}

export interface CampaignState {
  campaignId: string;
  revision: number;
  contentApproval: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    revision: number;
  };
  aiScore: number | null;
}

export interface CreativeEvaluationWebhookPayload {
  campaignId: string;
  revision: number;
  aiScore: number;
  approvalDecision: 'APPROVED' | 'REJECTED';
}

export interface CreativePackageResult {
  packageId: string;
  manifestHash: string;
  outputHash: string;
  aspectRatios: string[];
  isReplay?: boolean;
}

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export class CreativePackageEngine {
  private inFlightOperations = new Map<string, Promise<CreativePackageResult>>();
  private completedStore = new Map<string, CreativePackageResult>();

  /**
   * Executes creative package creation inside an explicit transaction with fail-closed rollback.
   */
  async executeCreativePackageTransaction(
    dbClient: DbClientPort,
    payload: {
      hostId: string;
      listingId: string;
      roomTypeId: string;
      mediaId: string;
    }
  ): Promise<unknown> {
    await dbClient.query('BEGIN');
    try {
      const result = await dbClient.query(
        `INSERT INTO marketing_creative_packages (host_id, listing_id, room_type_id, source_media_id)
         VALUES ('${payload.hostId}', '${payload.listingId}', '${payload.roomTypeId}', '${payload.mediaId}')`
      );
      await dbClient.query('COMMIT');
      return result;
    } catch (err: unknown) {
      await dbClient.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Processes a creative package generation request with strict idempotency and burst deduplication.
   */
  async processCreativePackageIdempotent(params: {
    idempotencyKey: string;
    hostId: string;
    listingId: string;
    roomTypeId: string;
    handler: () => Promise<Omit<CreativePackageResult, 'isReplay'>>;
  }): Promise<CreativePackageResult> {
    const { idempotencyKey, handler } = params;

    if (!idempotencyKey) {
      throw new Error('MISSING_IDEMPOTENCY_KEY: Operation requires a valid idempotency key');
    }

    // 1. Check if completed result exists
    if (this.completedStore.has(idempotencyKey)) {
      const cached = this.completedStore.get(idempotencyKey)!;
      return { ...cached, isReplay: true };
    }

    // 2. Check if identical request is currently in-flight (5-click burst within 200ms)
    if (this.inFlightOperations.has(idempotencyKey)) {
      const activePromise = this.inFlightOperations.get(idempotencyKey)!;
      const result = await activePromise;
      return { ...result, isReplay: true };
    }

    // 3. Execute handler under promise guard
    const executionPromise = (async (): Promise<CreativePackageResult> => {
      try {
        const outcome = await handler();
        const finalResult: CreativePackageResult = { ...outcome, isReplay: false };
        this.completedStore.set(idempotencyKey, finalResult);
        return finalResult;
      } finally {
        this.inFlightOperations.delete(idempotencyKey);
      }
    })();

    this.inFlightOperations.set(idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Enforces monotonic revision fencing on asynchronous AI evaluation and webhook payloads.
   */
  handleCreativeEvaluationWebhook(
    currentState: CampaignState,
    payload: CreativeEvaluationWebhookPayload
  ): {
    accepted: boolean;
    reason?: string;
    updatedState: CampaignState;
  } {
    // Monotonic guard: Stale revision is dropped
    if (payload.revision < currentState.revision) {
      return {
        accepted: false,
        reason: 'STALE_REVISION_DROPPED',
        updatedState: currentState,
      };
    }

    // Revision matches or advances: Apply updates
    const updatedState: CampaignState = {
      ...currentState,
      revision: Math.max(currentState.revision, payload.revision),
      contentApproval: {
        status: payload.approvalDecision,
        revision: payload.revision,
      },
      aiScore: payload.aiScore,
    };

    return {
      accepted: true,
      updatedState,
    };
  }

  /**
   * Validates room offer price and inventory availability before campaign creation.
   */
  validateRoomOfferBinding(
    draft: CreativePackageDraft,
    authoritative: AuthoritativeRoomData
  ): {
    valid: boolean;
    error?: string;
  } {
    if (draft.advertisedPricePaise !== authoritative.authoritativePricePaise) {
      return {
        valid: false,
        error: `PRICE_MISMATCH_DETECTED: Advertised price (${draft.advertisedPricePaise}) diverges from authoritative room price (${authoritative.authoritativePricePaise})`,
      };
    }

    if (authoritative.availableUnits <= 0) {
      return {
        valid: false,
        error: 'ROOM_INVENTORY_UNAVAILABLE: Room type has 0 available units for advertised dates',
      };
    }

    return { valid: true };
  }
}
