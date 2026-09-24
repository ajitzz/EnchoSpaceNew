import { describe, it, expect, vi } from 'vitest';
import {
  CanonicalOfferAuthorityEngine,
  type DbClientPort,
  type AcquireRoomHoldInput,
  type InventorySyncWebhookPayload,
  type RoomOfferValidationInput,
} from '../../lib/offers/canonicalOfferAuthorityEngine.js';

describe('CR1 Batch 3: Phase P4 Canonical Room Offer Authority & Guest Presentation Truth Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Connection drops midway through quote-to-hold binding -> full rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let shouldDropConnection = false;
    let rollbackExecuted = false;

    const mockDb: DbClientPort = {
      query: vi.fn(async (sql: string) => {
        executedQueries.push(sql.trim().split('\n')[0]);
        if (sql === 'BEGIN') return { rows: [] };
        if (sql === 'ROLLBACK') {
          rollbackExecuted = true;
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO test_commerce_quotes')) {
          return { rows: [{ id: 'quote_123' }] };
        }
        if (shouldDropConnection && sql.includes('INSERT INTO test_commerce_holds')) {
          throw new Error('ECONNRESET: TCP socket stream terminated unexpectedly during hold creation');
        }
        return { rows: [] };
      }),
    };

    const engine = new CanonicalOfferAuthorityEngine();
    const input: AcquireRoomHoldInput = {
      listingId: 101,
      roomTypeId: 201,
      userId: 42,
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-12',
      nightlyRatePaise: 500000, // ₹5,000.00
      guestCount: 2,
      ttlSeconds: 600,
      idempotencyKey: 'idemp_p4_drop_01',
    };

    // Inject connection failure during second step of transaction
    shouldDropConnection = true;

    await expect(engine.createQuoteAndAcquireHold(mockDb, input)).rejects.toThrow(
      'ECONNRESET: TCP socket stream terminated unexpectedly during hold creation'
    );

    // Verify atomic transaction boundary: BEGIN -> INSERT quote -> FAIL hold -> ROLLBACK
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
    expect(rollbackExecuted).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Host/guest clicks submit 5 times in 200ms -> exactly 1 execution, 4 replays, 0 duplicate holds', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO test_commerce_quotes')) {
          writeCount++;
          // Simulate slight asynchronous processing latency
          await new Promise(resolve => setTimeout(resolve, 30));
          return { rows: [{ id: 'quote_burst_1' }] };
        }
        if (sql.includes('INSERT INTO test_commerce_holds')) {
          return { rows: [{ id: 'hold_burst_1' }] };
        }
        return { rows: [] };
      }),
    };

    const engine = new CanonicalOfferAuthorityEngine();
    const idempotencyKey = `idemp_offer_burst_${Date.now()}`;

    const input: AcquireRoomHoldInput = {
      listingId: 101,
      roomTypeId: 201,
      userId: 42,
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-12',
      nightlyRatePaise: 500000,
      guestCount: 2,
      ttlSeconds: 600,
      idempotencyKey,
    };

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      engine.createQuoteAndAcquireHold(mockDb, input),
      engine.createQuoteAndAcquireHold(mockDb, input),
      engine.createQuoteAndAcquireHold(mockDb, input),
      engine.createQuoteAndAcquireHold(mockDb, input),
      engine.createQuoteAndAcquireHold(mockDb, input),
    ]);

    // Exactly 1 database transaction execution
    expect(writeCount).toBe(1);

    // All 5 returned valid results with identical quote & hold IDs
    const holdIds = results.map(r => r.holdId);
    expect(new Set(holdIds).size).toBe(1);

    // Exactly 1 primary execution and 4 deduplicated replays
    const primary = results.filter(r => !r.isReplay);
    const replays = results.filter(r => r.isReplay);
    expect(primary).toHaveLength(1);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order Webhook / Inventory Sync Fencing
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Out-of-order inventory sync webhook -> monotonic sequence fencing rejects stale regression', async () => {
    const engine = new CanonicalOfferAuthorityEngine();
    const roomKey = 'room_inventory_sync_101_201';

    // Packet 1: Sequence 5 arrives first (available units = 2 at t=5000)
    const packet5: InventorySyncWebhookPayload = {
      syncEventId: 'sync_005',
      roomTypeId: 201,
      listingId: 101,
      date: '2026-10-10',
      availableUnits: 2,
      sequenceNumber: 5,
      timestamp: 5000,
    };

    const res5 = await engine.applyInventorySyncWebhook(packet5);
    expect(res5.applied).toBe(true);
    expect(res5.isStale).toBe(false);
    expect(res5.currentSequence).toBe(5);
    expect(res5.availableUnits).toBe(2);

    // Packet 2: Stale sequence 3 arrives delayed (available units = 5 at t=3000)
    const packet3: InventorySyncWebhookPayload = {
      syncEventId: 'sync_003',
      roomTypeId: 201,
      listingId: 101,
      date: '2026-10-10',
      availableUnits: 5, // Stale inventory claim!
      sequenceNumber: 3, // Inverted sequence!
      timestamp: 3000,
    };

    const res3 = await engine.applyInventorySyncWebhook(packet3);
    // Monotonic sequence fence must reject stale sequence
    expect(res3.applied).toBe(false);
    expect(res3.isStale).toBe(true);
    expect(res3.reason).toBe('STALE_INVENTORY_SEQUENCE_REJECTED');
    expect(res3.currentSequence).toBe(5);
    // Preserves the authoritative sequence 5 value (2 units), never regressing to 5
    expect(res3.availableUnits).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Ungrounded Price & Synthetic Room ID Rejection
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Strictly rejects non-positive paise prices and synthetic room tier IDs', () => {
    const engine = new CanonicalOfferAuthorityEngine();

    // Valid canonical room offer with explicit paise rate
    const validOffer: RoomOfferValidationInput = {
      propertyId: 'prop_wayanad_sanctuary',
      roomTierId: 'room_deluxe_valley',
      roomName: 'Valley View Deluxe',
      nightlyPricePaise: 450000, // ₹4,500.00
      maxGuests: 2,
    };
    const validated = engine.validateRoomOffer(validOffer);
    expect(validated.valid).toBe(true);
    expect(validated.canonicalPriceRupees).toBe('4500.00');

    // Reject zero price
    expect(() =>
      engine.validateRoomOffer({
        ...validOffer,
        nightlyPricePaise: 0,
      })
    ).toThrow('INVALID_ROOM_OFFER_PRICE: Nightly rate must be positive non-zero paise');

    // Reject negative price
    expect(() =>
      engine.validateRoomOffer({
        ...validOffer,
        nightlyPricePaise: -1000,
      })
    ).toThrow('INVALID_ROOM_OFFER_PRICE: Nightly rate must be positive non-zero paise');

    // Reject empty room tier ID
    expect(() =>
      engine.validateRoomOffer({
        ...validOffer,
        roomTierId: '',
      })
    ).toThrow('MISSING_ROOM_TIER_ID: Canonical relational room ID required');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: Multi-Surface Projection Parity
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Multi-surface projection parity guarantees identical price across Guest, Host, and Admin', () => {
    const engine = new CanonicalOfferAuthorityEngine();

    const offer: RoomOfferValidationInput = {
      propertyId: 'prop_wayanad_sanctuary',
      roomTierId: 'room_deluxe_valley',
      roomName: 'Valley View Deluxe',
      nightlyPricePaise: 450000,
      maxGuests: 2,
    };

    const guestView = engine.projectOfferForSurface(offer, 'GUEST_DETAIL');
    const hostView = engine.projectOfferForSurface(offer, 'HOST_BUILDER');
    const adminView = engine.projectOfferForSurface(offer, 'ADMIN_CONSOLE');

    // All surfaces MUST match on canonical nightly rate in paise and formatted currency
    expect(guestView.nightlyRatePaise).toBe(450000);
    expect(hostView.nightlyRatePaise).toBe(450000);
    expect(adminView.nightlyRatePaise).toBe(450000);

    expect(guestView.displayPrice).toBe('₹4,500');
    expect(hostView.displayPrice).toBe('₹4,500');
    expect(adminView.displayPrice).toBe('₹4,500');
  });
});
