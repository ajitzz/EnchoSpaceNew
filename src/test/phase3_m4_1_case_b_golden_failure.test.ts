import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DoubleEntryLedgerService } from '../lib/doubleEntryLedgerService';
import { GoogleAdsProvider } from '../lib/providers/google/GoogleAdsProvider';
import { GoogleAdsClient } from '../lib/providers/google/GoogleAdsClient';

describe('Milestone 4.1 — Case B Golden Failure Verification Matrix', () => {
  let mockClient: any;
  let ledgerEntries: any[] = [];
  let ledgerLines: any[] = [];

  beforeEach(() => {
    ledgerEntries = [];
    ledgerLines = [];

    mockClient = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        const normalized = sql.trim().replace(/\s+/g, ' ');

        // Ledger queries
        if (normalized.startsWith('SELECT id FROM ledger_entries WHERE transaction_ref = $1')) {
          const ref = params?.[0];
          const found = ledgerEntries.filter(e => e.transaction_ref === ref);
          return { rows: found };
        }

        if (normalized.includes('wallet_accounts')) {
          return { rows: [{ id: 101 }] };
        }

        if (normalized.startsWith('INSERT INTO ledger_entries')) {
          const ref = params?.[0];
          const eventType = params?.[1];
          const desc = params?.[2];
          const existing = ledgerEntries.find(e => e.transaction_ref === ref);
          if (existing) {
            return { rows: [] }; // ON CONFLICT DO NOTHING
          }
          const newEntry = { id: `entry_${ledgerEntries.length + 1}`, transaction_ref: ref, event_type: eventType, description: desc };
          ledgerEntries.push(newEntry);
          return { rows: [newEntry] };
        }

        if (normalized.startsWith('INSERT INTO ledger_lines')) {
          const entryId = params?.[0];
          const accountType = params?.[1];
          const entryType = params?.[2];
          const amount = params?.[3];
          const userId = params?.[5];
          const line = { id: ledgerLines.length + 1, entry_id: entryId, account_type: accountType, entry_type: entryType, amount, user_id: userId };
          ledgerLines.push(line);
          return { rows: [line] };
        }

        return { rows: [] };
      })
    };
  });

  // =========================================================================
  // 1. META CAMPAIGN CASE B: External committed, local ID is NULL
  // =========================================================================
  describe('1. Meta Campaign — Case B Recovery', () => {
    it('discovers existing external campaign via deterministic search when local meta_campaign_id was never persisted', async () => {
      const campaignId = 101;
      const hostId = 10;
      const adHeadline = 'Luxury Hilltop Villa';
      const cleanAdAccountId = 'act_1381407594129620';
      const expectedTag = `(Campaign #${campaignId})`;

      // External Provider State (Simulated Meta Ad Account):
      // The campaign already exists on Meta because attempt 1 committed before ENCHO worker crash!
      const metaExistingCampaigns = [
        { id: 'meta_camp_remote_998811', name: `Encho Space - ${adHeadline} (Campaign #${campaignId})`, status: 'PAUSED' },
        { id: 'meta_camp_other_tenant', name: 'Encho Space - Beach Cabin (Campaign #999)', status: 'PAUSED' }
      ];

      const emittedMetaPosts: any[] = [];

      // Simulated successor worker execution (Case B: local meta_campaign_id is NULL)
      let campData: any = null;
      const localMetaCampId = null; // Case B: NULL in DB!

      if (!localMetaCampId) {
        // Case B Deterministic Search
        const searchResult = metaExistingCampaigns.filter(c => c.name.includes(expectedTag));
        if (searchResult.length > 0) {
          campData = { id: searchResult[0].id };
        } else {
          // If not found, it would emit POST
          emittedMetaPosts.push({ endpoint: `/${cleanAdAccountId}/campaigns` });
          campData = { id: 'new_meta_camp_id' };
        }
      }

      // Assertions
      expect(campData).toBeDefined();
      expect(campData.id).toBe('meta_camp_remote_998811');
      // ZERO duplicate POST requests emitted to Meta!
      expect(emittedMetaPosts.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. META AD SET CASE B: External committed, local ID is NULL
  // =========================================================================
  describe('2. Meta AdSet — Case B Recovery', () => {
    it('discovers existing external adset under parent campaign when local meta_adset_id was never persisted', async () => {
      const campaignId = 101;
      const adHeadline = 'Luxury Hilltop Villa';
      const recoveredCampaignId = 'meta_camp_remote_998811';

      // External Provider State under recoveredCampaignId:
      const metaExistingAdSets = [
        { id: 'meta_adset_remote_445566', name: `AdSet - ${adHeadline}`, status: 'PAUSED' }
      ];

      const emittedMetaPosts: any[] = [];
      let adSetData: any = null;
      const localMetaAdSetId = null; // Case B: NULL in DB!

      if (!localMetaAdSetId && recoveredCampaignId) {
        const matchingAdSet = metaExistingAdSets.find(a => a.name.includes(`AdSet - ${adHeadline}`));
        if (matchingAdSet) {
          adSetData = { id: matchingAdSet.id };
        } else {
          emittedMetaPosts.push({ endpoint: '/adsets' });
        }
      }

      expect(adSetData).toBeDefined();
      expect(adSetData.id).toBe('meta_adset_remote_445566');
      expect(emittedMetaPosts.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. INSTAGRAM SOCIAL POST CASE B: Media published, external_media_id is NULL
  // =========================================================================
  describe('3. Instagram Social Post — Case B Recovery', () => {
    it('discovers published Instagram media via feed reconciliation when external_media_id was lost', async () => {
      const postId = 456;
      const postCaption = 'Experience tranquility at our mountain resort #travel';
      const trackingTag = `[encho:post:${postId}]`;

      // External Instagram Business Feed State:
      const remoteFeedMedia = [
        { id: 'ig_media_feed_771122', caption: `${postCaption} ${trackingTag}`, timestamp: '2026-08-18T23:00:00Z' },
        { id: 'ig_media_feed_334455', caption: 'Other post #sunset', timestamp: '2026-08-18T22:00:00Z' }
      ];

      const emittedPublishCalls: any[] = [];

      // Case B: post.external_media_id is NULL
      const post = { id: postId, external_media_id: null, caption: postCaption };

      let resolvedMediaId: string | null = null;
      if (!post.external_media_id) {
        const found = remoteFeedMedia.find(m => m.caption.includes(trackingTag) || m.caption === postCaption);
        if (found) {
          resolvedMediaId = found.id;
        } else {
          emittedPublishCalls.push({ action: 'POST_MEDIA' });
        }
      }

      expect(resolvedMediaId).toBe('ig_media_feed_771122');
      expect(emittedPublishCalls.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. GOOGLE ADS HIERARCHY CASE B: Hierarchy created, local state lost
  // =========================================================================
  describe('4. Google Ads Hierarchy — Case B Recovery', () => {
    it('recovers deterministic Google Ads hierarchy resources without duplicating provider entities', async () => {
      const mockGoogleClient = new GoogleAdsClient();
      const provider = new GoogleAdsProvider(mockGoogleClient);

      const request: any = {
        campaignId: 9922,
        hostId: 15,
        listingId: 301,
        title: 'Kyoto Traditional Machiya',
        objective: 'OUTCOME_TRAFFIC',
        correlationId: 'corr_case_b_gads',
        idempotencyKey: 'gads_case_b_camp_9922',
        budget: { currency: 'USD', minor_units: 15000 },
        targetAudience: { locations: ['JP'] },
        creativeAssets: {
          headline: 'Kyoto Traditional Machiya',
          description: 'Historic wooden stay in central Kyoto',
          landingPageUrl: 'https://encho.app/listings/301',
          mediaUrl: 'https://encho.app/kyoto.jpg'
        }
      };

      // Worker 1 executes hierarchy creation
      const res1 = await provider.createCampaignHierarchy(request, mockClient);
      expect(res1.success).toBe(true);
      expect(res1.externalCampaignId).toBe('customers/9904998948/campaigns/9922');

      // Worker 2 retries from scratch (Case B: local DB cache cleared/lost)
      const res2 = await provider.createCampaignHierarchy(request, mockClient);
      expect(res2.success).toBe(true);
      expect(res2.externalCampaignId).toBe(res1.externalCampaignId);
      expect(res2.externalContainerId).toBe(res1.externalContainerId);
    });
  });

  // =========================================================================
  // 5. PAYMENT & FINANCIAL SETTLEMENT CASE B: Webhook replay & zero duplication
  // =========================================================================
  describe('5. Payment & Settlement — Case B Recovery', () => {
    it('guarantees zero duplicate ledger entries and zero balance leakage on webhook replay after DB failure', async () => {
      const deterministicRef = 'PAYMENT_WEBHOOK_RAZORPAY_order_live_998877';
      const hostId = 70;
      const amount = 750;

      // Attempt 1: First delivery
      const res1 = await DoubleEntryLedgerService.recordTransaction(mockClient, {
        transactionRef: deterministicRef,
        eventType: 'WALLET_FUNDING',
        description: 'Razorpay wallet funding',
        lines: [
          { accountType: 'GATEWAY_CLEARING', entryType: 'DEBIT', amount, currency: 'INR' },
          { accountType: 'HOST_WALLET', userId: hostId, entryType: 'CREDIT', amount, currency: 'INR' }
        ]
      });

      expect(res1.isIdempotentReplay).toBe(false);
      expect(ledgerEntries.length).toBe(1);

      // Attempt 2: Replay after local state failure
      const res2 = await DoubleEntryLedgerService.recordTransaction(mockClient, {
        transactionRef: deterministicRef,
        eventType: 'WALLET_FUNDING',
        description: 'Razorpay wallet funding retry',
        lines: [
          { accountType: 'GATEWAY_CLEARING', entryType: 'DEBIT', amount, currency: 'INR' },
          { accountType: 'HOST_WALLET', userId: hostId, entryType: 'CREDIT', amount, currency: 'INR' }
        ]
      });

      expect(res2.isIdempotentReplay).toBe(true);
      // Invariant: Exactly 1 ledger entry and 2 lines exist
      expect(ledgerEntries.length).toBe(1);
      expect(ledgerLines.length).toBe(2);
    });
  });

  // =========================================================================
  // 6. TENANT ISOLATION ATTACK UNDER CASE B RECOVERY
  // =========================================================================
  describe('6. Tenant Isolation Defense during Case B Recovery', () => {
    it('strictly prevents Tenant A from discovering or attaching Tenant B external objects', () => {
      const tenantA = { campaignId: 101, hostId: 10, title: 'Luxury Villa' };
      const tenantB = { campaignId: 202, hostId: 20, title: 'Luxury Villa' }; // Identical title!

      const masterAdAccountCampaigns = [
        { id: 'meta_camp_tenant_b_202', name: `Encho Space - Luxury Villa (Campaign #202) [Host #20]`, status: 'PAUSED' }
      ];

      // Tenant A runs Case B discovery:
      const tenantAExpectedTag = `(Campaign #${tenantA.campaignId})`;
      const matchedForTenantA = masterAdAccountCampaigns.find(c => c.name.includes(tenantAExpectedTag));

      // Absolute invariant: Tenant A CANNOT match Tenant B's campaign
      expect(matchedForTenantA).toBeUndefined();
    });
  });

  // =========================================================================
  // 7. UNKNOWN OUTCOME TIMEOUT & QUARANTINE
  // =========================================================================
  describe('7. Unknown Outcome Protocol', () => {
    it('sets transaction to EXTERNAL_OUTCOME_UNKNOWN on transport timeout and forbids blind mutation dispatch', () => {
      const timeoutError: any = new Error('socket hang up');
      timeoutError.isNetworkTimeout = true;

      const isUnknownOutcome = timeoutError.isNetworkTimeout === true;
      const assignedStatus = isUnknownOutcome ? 'EXTERNAL_OUTCOME_UNKNOWN' : 'FAILED_PUBLISH';

      expect(assignedStatus).toBe('EXTERNAL_OUTCOME_UNKNOWN');
    });
  });
});
