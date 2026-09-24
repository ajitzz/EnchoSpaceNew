import { describe, it, expect, vi } from 'vitest';
import {
  CrossDomainGoldenPathEngine,
  type DbClientPort,
  type GoldenPathInquiryInput,
  type GoldenPathCampaignInput,
  type GoldenPathTelemetryInput,
  type StaffCaseReviewInput,
} from '../../lib/platform/crossDomainGoldenPathEngine.js';

describe('CR1 Cross-Domain Golden Path Integration Sweep (Guest -> Host -> Staff)', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Connection drops midway through cross-domain inquiry-to-case handoff -> full rollback, 0 zombie records', async () => {
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
        if (sql === 'COMMIT') return { rows: [] };

        if (sql.includes('INSERT INTO messages')) {
          // Step 1: Message persistence succeeds
          return { rows: [{ id: 'msg_cross_01' }] };
        }
        if (shouldDropConnection && sql.includes('INSERT INTO service_cases')) {
          // Step 2: Connection terminated unexpectedly midway
          throw new Error('ECONNRESET: TCP socket stream terminated unexpectedly during staff case handoff');
        }
        return { rows: [] };
      }),
    };

    const engine = new CrossDomainGoldenPathEngine();
    const input: GoldenPathInquiryInput = {
      threadId: 'thread_golden_01',
      listingId: 'listing_1',
      roomTierId: 'room_deluxe_valley',
      guestId: 'user_guest_01',
      hostId: 'user_host_01',
      content: 'Can we check in early around 11 AM?',
      clientEventId: 'client_evt_drop_01',
    };

    shouldDropConnection = true;

    await expect(engine.submitInquiryWithServiceCase(mockDb, input)).rejects.toThrow(
      'ECONNRESET: TCP socket stream terminated unexpectedly during staff case handoff'
    );

    // Verify atomic transaction boundary: BEGIN -> INSERT message -> FAIL case -> ROLLBACK
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
    expect(rollbackExecuted).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms Across Roles
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Rapid 5-click burst in 200ms deduplicates to exactly 1 write and 4 replays', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO messages')) {
          writeCount++;
          // Simulate network latency
          await new Promise(resolve => setTimeout(resolve, 30));
          return { rows: [{ id: 'msg_burst_01' }] };
        }
        if (sql.includes('INSERT INTO service_cases')) {
          return { rows: [{ id: 'case_burst_01' }] };
        }
        return { rows: [] };
      }),
    };

    const engine = new CrossDomainGoldenPathEngine();
    const clientEventId = `client_evt_burst_${Date.now()}`;

    const input: GoldenPathInquiryInput = {
      threadId: 'thread_golden_02',
      listingId: 'listing_1',
      roomTierId: 'room_deluxe_valley',
      guestId: 'user_guest_02',
      hostId: 'user_host_01',
      content: 'Is breakfast included in the booking rate?',
      clientEventId,
    };

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      engine.submitInquiryWithServiceCase(mockDb, input),
      engine.submitInquiryWithServiceCase(mockDb, input),
      engine.submitInquiryWithServiceCase(mockDb, input),
      engine.submitInquiryWithServiceCase(mockDb, input),
      engine.submitInquiryWithServiceCase(mockDb, input),
    ]);

    // Exactly 1 database write executed
    expect(writeCount).toBe(1);

    // All 5 returned valid results with identical message IDs
    const messageIds = results.map(r => r.messageId);
    expect(new Set(messageIds).size).toBe(1);

    // Exactly 1 original execution and 4 replays
    const primary = results.filter(r => !r.isReplay);
    const replays = results.filter(r => r.isReplay);
    expect(primary).toHaveLength(1);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order Webhook Telemetry
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Out-of-order telemetry spend updates are sequence-fenced without regression', async () => {
    const engine = new CrossDomainGoldenPathEngine();
    const campaignId = 'camp_golden_01';

    // Packet 1: Sequence 4 arrives (spend = ₹35,000 INR = 3,500,000 paise at t=4000)
    const packet4: GoldenPathTelemetryInput = {
      campaignId,
      reportedSpendPaise: 3500000,
      sequenceNumber: 4,
      timestamp: 4000,
    };
    const res4 = await engine.ingestCampaignTelemetry(packet4);
    expect(res4.applied).toBe(true);
    expect(res4.isStale).toBe(false);
    expect(res4.currentSequence).toBe(4);
    expect(res4.cumulativeSpendPaise).toBe(3500000);

    // Packet 2: Stale sequence 2 arrives delayed (spend = ₹15,000 INR = 1,500,000 paise at t=2000)
    const packet2: GoldenPathTelemetryInput = {
      campaignId,
      reportedSpendPaise: 1500000,
      sequenceNumber: 2, // Inverted sequence!
      timestamp: 2000,
    };
    const res2 = await engine.ingestCampaignTelemetry(packet2);
    // Monotonic sequence fence must reject stale sequence
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.reason).toBe('STALE_SEQUENCE_REJECTED');
    expect(res2.currentSequence).toBe(4);
    // Spend remains at ₹35,000 (3,500,000 paise), never regressing to ₹15,000
    expect(res2.cumulativeSpendPaise).toBe(3500000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Cross-Tenant Data Isolation & Staff Note Masking
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Rejects cross-tenant access and masks confidential staff notes from guest and host', () => {
    const engine = new CrossDomainGoldenPathEngine();

    // Register active thread with participants
    engine.registerThread('thread_golden_secure', 'listing_1', ['user_guest_01', 'user_host_01']);

    // Competing host attempts access to Listing 1 thread
    expect(() =>
      engine.assertThreadAccess('thread_golden_secure', 'user_competing_host_99', 'host')
    ).toThrow('UNAUTHORIZED_PARTICIPANT: Access denied to thread_golden_secure');

    // Guest views messages: internal notes must be completely omitted
    const threadMessages = [
      { id: 'm1', authorId: 'user_guest_01', content: 'Can we bring a pet dog?', isInternalNote: false },
      { id: 'm2', authorId: 'user_host_01', content: 'Yes, pets are welcome in Deluxe Valley.', isInternalNote: false },
      { id: 'm3', authorId: 'staff_agent_01', content: 'CONFIDENTIAL: Verify pet deposit payment before check-in.', isInternalNote: true },
    ];

    const guestView = engine.projectThreadMessages(threadMessages, 'guest');
    expect(guestView).toHaveLength(2);
    expect(guestView.map(m => m.id)).toEqual(['m1', 'm2']);

    const hostView = engine.projectThreadMessages(threadMessages, 'host');
    expect(hostView).toHaveLength(2);
    expect(hostView.map(m => m.id)).toEqual(['m1', 'm2']);

    const staffView = engine.projectThreadMessages(threadMessages, 'staff');
    expect(staffView).toHaveLength(3);
    expect(staffView.map(m => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: End-to-End Three-Role Golden Path Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Executes complete 3-role lifecycle: Host Campaign -> Guest Inquiry -> Staff Moderation', async () => {
    const engine = new CrossDomainGoldenPathEngine();
    const mockDb: DbClientPort = {
      query: vi.fn(async () => ({ rows: [] })),
    };

    // Step 1: Host launches bounded campaign for Listing 1 within ₹50k stop-loss cap
    const campaignInput: GoldenPathCampaignInput = {
      hostId: 'user_host_01',
      listingId: 'listing_1',
      roomTierId: 'room_deluxe_valley',
      budgetPaise: 4000000, // ₹40,000 INR
      dailyBudgetPaise: 150000, // ₹1,500 INR/day
      idempotencyKey: 'idemp_host_launch_01',
    };
    const campaign = await engine.launchHostCampaign(mockDb, campaignInput);
    expect(campaign.status).toBe('ACTIVE');
    expect(campaign.budgetPaise).toBe(4000000);
    expect(campaign.circuitBreakerTriggered).toBe(false);

    // Step 2: Guest discovers listing and submits inquiry with canonical room offer context
    const inquiryInput: GoldenPathInquiryInput = {
      threadId: 'thread_golden_e2e_01',
      listingId: 'listing_1',
      roomTierId: 'room_deluxe_valley',
      guestId: 'user_guest_01',
      hostId: 'user_host_01',
      content: 'We would love to reserve the Deluxe Valley room for 2 nights.',
      clientEventId: 'client_evt_inquiry_e2e_01',
    };
    const inquiry = await engine.submitInquiryWithServiceCase(mockDb, inquiryInput);
    expect(inquiry.status).toBe('COMMITTED');
    expect(inquiry.caseId).toBeDefined();

    // Step 3: Staff claims service case and adds verified internal review note
    const reviewInput: StaffCaseReviewInput = {
      caseId: inquiry.caseId,
      threadId: inquiryInput.threadId,
      staffId: 'staff_agent_01',
      internalNote: 'Guest profile verified; room inventory hold available for Oct 10-12.',
      makerCheckerApproval: 'APPROVED_FOR_FULFILLMENT',
    };
    const review = await engine.reviewServiceCase(mockDb, reviewInput);
    expect(review.status).toBe('REVIEWED_AND_APPROVED');
    expect(review.caseId).toBe(inquiry.caseId);
    expect(review.auditChecksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
