import { describe, expect, it, vi } from 'vitest';
import {
  ProviderPackageEngine,
  type ProviderPublishingPayload,
  type ProviderCampaignState,
  type ProviderWebhookSpendPayload,
} from '../../lib/marketing/providerPackageEngine.js';

describe('CR1 Phase P6: Provider Programs, Expert Studios & Finance Control Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Database Connection Drops Halfway Through
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through Provider Dispatch', () => {
    it('executes atomic rollback, creates 0 zombie publishing records, and leaves wallet uncommitted', async () => {
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
          if (sql.includes('INSERT INTO provider_publishing_transactions')) {
            recordsInserted.push('provider_txn');
            // Network failure happens immediately before commit
            throw new Error('ECONNRESET: Database connection closed by server during multi-step provider write');
          }
          return {};
        }),
      };

      const engine = new ProviderPackageEngine();

      await expect(
        engine.executeProviderPublishTransaction(mockDbClient as any, {
          campaignId: 'camp_p6_101',
          hostId: 'host_wayanad',
          provider: 'META',
          allocatedSpendPaise: 200000, // ₹2,000 INR
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbacksCount).toBe(1);
      expect(commitsCount).toBe(0);
      expect(recordsInserted.length).toBe(0); // Zero zombie rows!
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: Host Clicks Submit 5 Times in 200 Milliseconds
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host Clicks Submit 5 Times in 200 Milliseconds', () => {
    it('deduplicates rapid burst submissions via idempotency key, executing exactly 1 provider call', async () => {
      const engine = new ProviderPackageEngine();
      const idempotencyKey = 'idemp_provider_publish_' + Date.now();

      let providerApiInvocations = 0;
      const triggerProviderPublish = async () => {
        return engine.processProviderPublishIdempotent({
          idempotencyKey,
          campaignId: 'camp_p6_101',
          provider: 'META',
          payload: {
            campaignName: 'Wayanad Sanctuary Autumn Stays',
            dailyBudgetPaise: 200000,
          },
          handler: async () => {
            providerApiInvocations++;
            // Simulate 50ms network round-trip to Meta Graph API
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              providerCampaignId: 'meta_act_987654_camp_1',
              status: 'PAUSED',
              remoteSpendPaise: 0,
            };
          },
        });
      };

      // Fire 5 identical requests concurrently within 200ms
      const results = await Promise.all([
        triggerProviderPublish(),
        triggerProviderPublish(),
        triggerProviderPublish(),
        triggerProviderPublish(),
        triggerProviderPublish(),
      ]);

      // Exactly ONE remote provider API call must have occurred
      expect(providerApiInvocations).toBe(1);

      // All 5 callers receive identical successful output with deduplicated replay flag
      for (const res of results) {
        expect(res.providerCampaignId).toBe('meta_act_987654_camp_1');
        expect(res.status).toBe('PAUSED');
        expect(res.remoteSpendPaise).toBe(0);
      }

      const replays = results.filter((r) => r.isReplay === true);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Webhook Payload Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Telemetry / Spend Webhook Arrives Out of Order', () => {
    it('maintains monotonic cumulative spend and prevents regression from late stale payloads', () => {
      const engine = new ProviderPackageEngine();

      let campaignState: ProviderCampaignState = {
        campaignId: 'camp_p6_101',
        cumulativeSpendPaise: 0,
        status: 'ACTIVE',
        lastReportedSequence: 1,
      };

      // Event 1 arrives (Sequence 1: Day 1 spend = ₹1,000 = 100,000 paise)
      campaignState = engine.handleProviderSpendWebhook(campaignState, {
        sequence: 1,
        cumulativeSpendPaise: 100000,
        reportedStatus: 'ACTIVE',
      }).updatedState;

      expect(campaignState.cumulativeSpendPaise).toBe(100000);
      expect(campaignState.status).toBe('ACTIVE');

      // Event 3 arrives out-of-order before Event 2:
      // Sequence 3: Cumulative spend = ₹48,000 = 4,800,000 paise (> 95% stop-loss threshold of ₹47,500)
      const outcomeSeq3 = engine.handleProviderSpendWebhook(campaignState, {
        sequence: 3,
        cumulativeSpendPaise: 4800000,
        reportedStatus: 'ACTIVE',
      });

      campaignState = outcomeSeq3.updatedState;
      expect(campaignState.cumulativeSpendPaise).toBe(4800000);
      expect(campaignState.status).toBe('CIRCUIT_BREAKER_PAUSED'); // Must auto-trip stop loss!

      // Event 2 arrives late (stale sequence 2 with cumulative spend = ₹20,000 = 2,000,000 paise)
      const outcomeSeq2 = engine.handleProviderSpendWebhook(campaignState, {
        sequence: 2, // Out of order!
        cumulativeSpendPaise: 2000000,
        reportedStatus: 'ACTIVE',
      });

      // Must be detected as stale or monotonic guard must preserve higher spend
      expect(outcomeSeq2.updatedState.cumulativeSpendPaise).toBe(4800000); // Does NOT regress!
      expect(outcomeSeq2.updatedState.status).toBe('CIRCUIT_BREAKER_PAUSED'); // Stays paused!
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Provider Zero-Spend Paused Invariant & Housing Category
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Provider Zero-Spend Paused Invariant & Housing Category', () => {
    it('strictly enforces PAUSED creation and Meta HOUSING special ad category', () => {
      const engine = new ProviderPackageEngine();

      const invalidActivePayload: ProviderPublishingPayload = {
        campaignName: 'Invalid Active Stays',
        dailyBudgetPaise: 200000,
        status: 'ACTIVE', // Forbidden!
        specialAdCategory: 'HOUSING',
      };

      const checkActive = engine.validateProviderPayload('META', invalidActivePayload);
      expect(checkActive.valid).toBe(false);
      expect(checkActive.error).toContain('ACTIVE_CREATION_FORBIDDEN');

      const invalidCategoryPayload: ProviderPublishingPayload = {
        campaignName: 'Invalid Category Stays',
        dailyBudgetPaise: 200000,
        status: 'PAUSED',
        specialAdCategory: 'NONE', // Forbidden for Meta hospitality!
      };

      const checkCategory = engine.validateProviderPayload('META', invalidCategoryPayload);
      expect(checkCategory.valid).toBe(false);
      expect(checkCategory.error).toContain('HOUSING_CATEGORY_REQUIRED');

      const validPayload: ProviderPublishingPayload = {
        campaignName: 'Valid Paused Stays',
        dailyBudgetPaise: 200000,
        status: 'PAUSED',
        specialAdCategory: 'HOUSING',
      };

      const checkValid = engine.validateProviderPayload('META', validPayload);
      expect(checkValid.valid).toBe(true);
    });
  });
});
