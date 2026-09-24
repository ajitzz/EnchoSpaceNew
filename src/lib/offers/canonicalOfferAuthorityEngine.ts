import { createHash } from 'node:crypto';

/**
 * CR1 Phase P4 (Packages P4.1 & P4.2): Canonical Room Offer Authority & Guest Presentation Truth Engine
 *
 * Enforces strict price grounding and multi-surface projection truth:
 * 1. Ungrounded price rejection: Rejects rates <= 0 or missing room tier IDs.
 * 2. Multi-surface projection parity: Guarantees identical rate display across Guest, Host, and Admin surfaces.
 * 3. Atomic quote-to-hold binding: Transactions execute BEGIN -> quote insert -> hold insert -> COMMIT with atomic ROLLBACK on error.
 * 4. 200ms burst deduplication: Intercepts rapid repeated submissions via in-flight Promise map and idempotency cache.
 * 5. Monotonic sequence fencing: Rejects stale or out-of-order inventory sync webhooks.
 */

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface AcquireRoomHoldInput {
  listingId: number;
  roomTypeId: number;
  userId: number;
  checkInDate: string;
  checkOutDate: string;
  nightlyRatePaise: number;
  guestCount: number;
  ttlSeconds: number;
  idempotencyKey: string;
}

export interface AcquireRoomHoldResult {
  quoteId: string;
  holdId: string;
  listingId: number;
  roomTypeId: number;
  userId: number;
  totalPaise: number;
  status: 'ACTIVE';
  isReplay: boolean;
  expiresAt: string;
}

export interface InventorySyncWebhookPayload {
  syncEventId: string;
  roomTypeId: number;
  listingId: number;
  date: string;
  availableUnits: number;
  sequenceNumber: number;
  timestamp: number;
}

export interface InventorySyncWebhookResult {
  syncEventId: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  availableUnits: number;
  reason?: string;
}

export interface RoomOfferValidationInput {
  propertyId: string;
  roomTierId: string;
  roomName: string;
  nightlyPricePaise: number;
  maxGuests: number;
}

export interface RoomOfferValidationResult {
  valid: boolean;
  propertyId: string;
  roomTierId: string;
  roomName: string;
  nightlyPricePaise: number;
  canonicalPriceRupees: string;
  maxGuests: number;
}

export type PresentationSurface = 'GUEST_DETAIL' | 'HOST_BUILDER' | 'ADMIN_CONSOLE';

export interface SurfaceOfferProjection {
  surface: PresentationSurface;
  propertyId: string;
  roomTierId: string;
  roomName: string;
  nightlyRatePaise: number;
  displayPrice: string;
  currency: string;
}

export class CanonicalOfferAuthorityEngine {
  private inFlightOffers = new Map<string, Promise<AcquireRoomHoldResult>>();
  private completedOffers = new Map<string, AcquireRoomHoldResult>();
  private roomSequences = new Map<string, number>();
  private roomUnits = new Map<string, number>();

  /**
   * Validates room offer context against canonical relational invariants.
   * Strictly rejects ungrounded or non-positive rates.
   */
  validateRoomOffer(input: RoomOfferValidationInput): RoomOfferValidationResult {
    if (!input.roomTierId || input.roomTierId.trim() === '') {
      throw new Error('MISSING_ROOM_TIER_ID: Canonical relational room ID required');
    }

    if (input.nightlyPricePaise <= 0) {
      throw new Error('INVALID_ROOM_OFFER_PRICE: Nightly rate must be positive non-zero paise');
    }

    const canonicalPriceRupees = (input.nightlyPricePaise / 100).toFixed(2);

    return {
      valid: true,
      propertyId: input.propertyId,
      roomTierId: input.roomTierId,
      roomName: input.roomName,
      nightlyPricePaise: input.nightlyPricePaise,
      canonicalPriceRupees,
      maxGuests: input.maxGuests,
    };
  }

  /**
   * Projects a verified room offer for a specific consumer surface,
   * guaranteeing price parity and consistent currency formatting.
   */
  projectOfferForSurface(
    input: RoomOfferValidationInput,
    surface: PresentationSurface
  ): SurfaceOfferProjection {
    const validated = this.validateRoomOffer(input);
    const formattedRupees = `₹${(validated.nightlyPricePaise / 100).toLocaleString('en-IN')}`;

    return {
      surface,
      propertyId: validated.propertyId,
      roomTierId: validated.roomTierId,
      roomName: validated.roomName,
      nightlyRatePaise: validated.nightlyPricePaise,
      displayPrice: formattedRupees,
      currency: 'INR',
    };
  }

  /**
   * Creates an authoritative price quote and reservation hold within an atomic SQL transaction.
   * Intercepts 200ms burst concurrent requests and guarantees exactly 1 execution + cached replays.
   */
  async createQuoteAndAcquireHold(
    dbClient: DbClientPort,
    input: AcquireRoomHoldInput
  ): Promise<AcquireRoomHoldResult> {
    if (input.nightlyRatePaise <= 0) {
      throw new Error('INVALID_ROOM_OFFER_PRICE: Nightly rate must be positive non-zero paise');
    }

    // 1. Check idempotency cache for completed submission
    const existing = this.completedOffers.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, isReplay: true };
    }

    // 2. Deduplicate in-flight concurrent burst promises
    const inFlight = this.inFlightOffers.get(input.idempotencyKey);
    if (inFlight) {
      const result = await inFlight;
      return { ...result, isReplay: true };
    }

    const executionPromise = (async (): Promise<AcquireRoomHoldResult> => {
      await dbClient.query('BEGIN');
      try {
        const checkIn = new Date(input.checkInDate);
        const checkOut = new Date(input.checkOutDate);
        const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

        const basePricePaise = input.nightlyRatePaise * nights;
        const taxPaise = Math.round((basePricePaise * 18) / 100);
        const totalPaise = basePricePaise + taxPaise;

        const quoteId = `quote_${input.idempotencyKey}`;
        const holdId = `hold_${input.idempotencyKey}`;
        const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();

        // 1. Insert immutable price quote
        await dbClient.query(
          `INSERT INTO test_commerce_quotes (id, listing_id, room_type_id, check_in_date, check_out_date, nights, base_price_paise, tax_paise, total_paise, expires_at)
           VALUES ('${quoteId}', ${input.listingId}, ${input.roomTypeId}, '${input.checkInDate}', '${input.checkOutDate}', ${nights}, ${basePricePaise}, ${taxPaise}, ${totalPaise}, '${expiresAt}')`
        );

        // 2. Insert atomic reservation hold
        await dbClient.query(
          `INSERT INTO test_commerce_holds (id, quote_id, user_id, status, expires_at)
           VALUES ('${holdId}', '${quoteId}', ${input.userId}, 'ACTIVE', '${expiresAt}')`
        );

        await dbClient.query('COMMIT');

        const outcome: AcquireRoomHoldResult = {
          quoteId,
          holdId,
          listingId: input.listingId,
          roomTypeId: input.roomTypeId,
          userId: input.userId,
          totalPaise,
          status: 'ACTIVE',
          isReplay: false,
          expiresAt,
        };

        this.completedOffers.set(input.idempotencyKey, outcome);
        return outcome;
      } catch (err: unknown) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        this.inFlightOffers.delete(input.idempotencyKey);
      }
    })();

    this.inFlightOffers.set(input.idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Monotonic inventory sync webhook receiver.
   * Enforces sequence fencing to reject stale or delayed updates.
   */
  async applyInventorySyncWebhook(payload: InventorySyncWebhookPayload): Promise<InventorySyncWebhookResult> {
    const key = `${payload.listingId}_${payload.roomTypeId}_${payload.date}`;
    const currentSeq = this.roomSequences.get(key) || 0;
    const currentUnits = this.roomUnits.get(key) || 0;

    if (payload.sequenceNumber <= currentSeq) {
      return {
        syncEventId: payload.syncEventId,
        applied: false,
        isStale: true,
        currentSequence: currentSeq,
        availableUnits: currentUnits,
        reason: 'STALE_INVENTORY_SEQUENCE_REJECTED',
      };
    }

    this.roomSequences.set(key, payload.sequenceNumber);
    this.roomUnits.set(key, payload.availableUnits);

    return {
      syncEventId: payload.syncEventId,
      applied: true,
      isStale: false,
      currentSequence: payload.sequenceNumber,
      availableUnits: payload.availableUnits,
    };
  }

  /**
   * Hashes string payload with SHA-256 for audit logging.
   */
  hashAuditPayload(payload: string): string {
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }
}
