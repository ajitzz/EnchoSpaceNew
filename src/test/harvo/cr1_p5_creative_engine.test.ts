import { describe, expect, it, vi } from 'vitest';
import {
  CreativePackageEngine,
  type CreativePackageDraft,
  type CampaignState,
} from '../../lib/marketing/creativePackageEngine.js';

describe('CR1 Phase P5: Offer-Led Marketing & Creative Pipeline Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Database Connection Drops Halfway Through
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through', () => {
    it('executes atomic rollback, creates 0 zombie records, and cleans up state', async () => {
      let rollbacksCount = 0;
      let commitsCount = 0;
      const recordsInserted: string[] = [];

      const mockDbClient = {
        query: vi.fn(async (sql: string) => {
          if (sql === 'BEGIN') return {};
          if (sql === 'ROLLBACK') {
            rollbacksCount++;
            recordsInserted.length = 0;
            return {};
          }
          if (sql === 'COMMIT') {
            commitsCount++;
            return {};
          }
          if (sql.includes('INSERT INTO marketing_creative_packages')) {
            recordsInserted.push('creative_pkg_record');
            // Simulate sudden network termination halfway through
            throw new Error('ECONNRESET: Connection terminated by peer at step 2 of transaction');
          }
          return {};
        }),
      };

      const engine = new CreativePackageEngine();

      await expect(
        engine.executeCreativePackageTransaction(mockDbClient as any, {
          hostId: 'host_10',
          listingId: 'listing_1',
          roomTypeId: 'room_deluxe_101',
          mediaId: 'asset_hero_1',
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbacksCount).toBe(1);
      expect(commitsCount).toBe(0);
      expect(recordsInserted.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: Host Clicks Submit 5 Times in 200 Milliseconds
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host Clicks Submit 5 Times in 200 Milliseconds', () => {
    it('deduplicates concurrent burst requests via idempotency key, allowing exactly 1 execution', async () => {
      const engine = new CreativePackageEngine();
      const idempotencyKey = 'idemp_creative_burst_' + Date.now();

      let executions = 0;
      const triggerGeneration = async () => {
        return engine.processCreativePackageIdempotent({
          idempotencyKey,
          hostId: 'host_10',
          listingId: 'listing_1',
          roomTypeId: 'room_deluxe_101',
          handler: async () => {
            executions++;
            // Simulate 50ms compute delay
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              packageId: 'pkg_creative_' + executions,
              manifestHash: 'a'.repeat(64),
              outputHash: 'b'.repeat(64),
              aspectRatios: ['1:1', '9:16', '16:9'],
            };
          },
        });
      };

      // Fire 5 identical requests concurrently within 200ms
      const results = await Promise.all([
        triggerGeneration(),
        triggerGeneration(),
        triggerGeneration(),
        triggerGeneration(),
        triggerGeneration(),
      ]);

      // Exactly ONE actual pipeline execution must have occurred
      expect(executions).toBe(1);

      // All 5 responses return identical successful output with deduplicated replay flag
      for (const res of results) {
        expect(res.packageId).toBe('pkg_creative_1');
        expect(res.aspectRatios).toEqual(['1:1', '9:16', '16:9']);
      }

      const replays = results.filter((r) => r.isReplay === true);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Webhook Payload Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Telemetry / AI Review Payload Arrives Out of Order', () => {
    it('enforces monotonic revision fencing and prevents state regression', () => {
      const engine = new CreativePackageEngine();

      const campaignState: CampaignState = {
        campaignId: 'camp_100',
        revision: 2, // Current active revision
        contentApproval: { status: 'PENDING', revision: 2 },
        aiScore: null,
      };

      // Stale evaluation for Revision 1 arrives late (out of order)
      const stalePayload = {
        campaignId: 'camp_100',
        revision: 1, // Stale!
        aiScore: 9.2,
        approvalDecision: 'APPROVED' as const,
      };

      const outcomeStale = engine.handleCreativeEvaluationWebhook(
        campaignState,
        stalePayload
      );

      // Must be dropped without updating revision or approval status
      expect(outcomeStale.accepted).toBe(false);
      expect(outcomeStale.reason).toBe('STALE_REVISION_DROPPED');
      expect(outcomeStale.updatedState.revision).toBe(2);
      expect(outcomeStale.updatedState.contentApproval.status).toBe('PENDING');

      // Fresh evaluation for Revision 2 arrives
      const freshPayload = {
        campaignId: 'camp_100',
        revision: 2,
        aiScore: 8.8,
        approvalDecision: 'APPROVED' as const,
      };

      const outcomeFresh = engine.handleCreativeEvaluationWebhook(
        campaignState,
        freshPayload
      );

      expect(outcomeFresh.accepted).toBe(true);
      expect(outcomeFresh.updatedState.revision).toBe(2);
      expect(outcomeFresh.updatedState.aiScore).toBe(8.8);
      expect(outcomeFresh.updatedState.contentApproval.status).toBe('APPROVED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Canonical Room Offer Price & Availability Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Canonical Room Offer Price & Inventory Validation', () => {
    it('rejects campaigns where advertised price drifts from authoritative room price', () => {
      const engine = new CreativePackageEngine();

      const draft: CreativePackageDraft = {
        listingId: 'listing_1',
        roomTypeId: 'room_deluxe_101',
        advertisedPricePaise: 500000, // ₹5,000 INR
        flightStartDate: '2026-10-01',
        flightEndDate: '2026-10-15',
      };

      // Case A: Price mismatch (Room price is ₹7,500, but draft claims ₹5,000)
      const mismatchCheck = engine.validateRoomOfferBinding(draft, {
        roomTypeId: 'room_deluxe_101',
        authoritativePricePaise: 750000, // ₹7,500 INR
        availableUnits: 3,
      });

      expect(mismatchCheck.valid).toBe(false);
      expect(mismatchCheck.error).toContain('PRICE_MISMATCH_DETECTED');

      // Case B: Sold out inventory
      const soldOutCheck = engine.validateRoomOfferBinding(draft, {
        roomTypeId: 'room_deluxe_101',
        authoritativePricePaise: 500000,
        availableUnits: 0,
      });

      expect(mismatchCheck.valid).toBe(false);
      expect(soldOutCheck.error).toContain('ROOM_INVENTORY_UNAVAILABLE');

      // Case C: Exact match with verified inventory
      const validCheck = engine.validateRoomOfferBinding(draft, {
        roomTypeId: 'room_deluxe_101',
        authoritativePricePaise: 500000,
        availableUnits: 2,
      });

      expect(validCheck.valid).toBe(true);
    });
  });
});
