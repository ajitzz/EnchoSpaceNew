import { describe, expect, it } from 'vitest';
import {
  ConversationDeskEngine,
  type DbClientPort,
  type MessageSubmissionInput,
  type DeliveryReceiptPayload,
} from '../../lib/conversations/conversationDeskEngine.js';

describe('CR1 Batch 2 & 3: Phase P3/P4 Conversation Desk & Offer Authority Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Rolls back message and notification intent atomically on midway connection drop', async () => {
    const executedQueries: string[] = [];
    let shouldDropConnection = false;

    const mockDb: DbClientPort = {
      query: async (sql: string, _params?: unknown[]) => {
        executedQueries.push(sql.trim().split('\n')[0]);
        if (shouldDropConnection && sql.includes('INSERT INTO notification_intents')) {
          throw new Error('ECONNRESET: Database connection stream terminated unexpectedly');
        }
        return { rows: [] };
      },
    };

    const engine = new ConversationDeskEngine();
    const input: MessageSubmissionInput = {
      threadId: 'thread_101',
      senderId: 'user_guest_1',
      senderRole: 'guest',
      clientEventId: 'client_evt_drop_test_01',
      content: 'Is early check-in available at 10 AM?',
      roomOfferId: 'room_tier_ocean_villa',
      canonicalNightlyPricePaise: 450000,
    };

    // Inject connection failure during outbox write
    shouldDropConnection = true;

    await expect(engine.sendMessageWithOutbox(mockDb, input)).rejects.toThrow(
      'ECONNRESET: Database connection stream terminated unexpectedly'
    );

    // Verify atomic transaction boundary: BEGIN -> INSERT message -> FAIL outbox -> ROLLBACK
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Deduplicates 5 concurrent message submissions in 200ms into exactly 1 write and 4 replays', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: async (sql: string) => {
        if (sql.includes('INSERT INTO messages')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const engine = new ConversationDeskEngine();
    const clientEventId = 'client_evt_burst_click_200ms';

    const input: MessageSubmissionInput = {
      threadId: 'thread_102',
      senderId: 'user_host_1',
      senderRole: 'host',
      clientEventId,
      content: 'Welcome to Encho! We look forward to hosting you.',
    };

    // Simulate 5 simultaneous rapid clicks within 200ms
    const burstPromises = Array.from({ length: 5 }, () =>
      engine.sendMessageWithOutbox(mockDb, input)
    );

    const results = await Promise.all(burstPromises);

    // Exactly 1 insert executed in the database
    expect(writeCount).toBe(1);

    // All 5 returned valid results with identical message IDs
    const messageIds = results.map(r => r.messageId);
    expect(new Set(messageIds).size).toBe(1);

    // Exactly 1 original execution and 4 replays
    const replays = results.filter(r => r.isReplay);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order Webhook / Delivery Receipt Sequencing
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Safely rejects stale delivery receipts arriving out-of-order', async () => {
    const engine = new ConversationDeskEngine();
    const threadId = 'thread_103';

    // Step 1: Initial delivery sequence 5 arrives
    const receiptSeq5: DeliveryReceiptPayload = {
      receiptId: 'rcpt_005',
      threadId,
      messageId: 'msg_005',
      recipientId: 'user_guest_2',
      sequenceNumber: 5,
      channel: 'push',
      status: 'DELIVERED',
      deliveredAt: '2026-09-24T21:00:05.000Z',
    };

    const result5 = await engine.applyDeliveryReceipt(receiptSeq5);
    expect(result5.applied).toBe(true);
    expect(result5.currentSequence).toBe(5);

    // Step 2: Stale sequence 3 arrives delayed (out-of-order)
    const receiptSeq3: DeliveryReceiptPayload = {
      receiptId: 'rcpt_003',
      threadId,
      messageId: 'msg_003',
      recipientId: 'user_guest_2',
      sequenceNumber: 3, // Inverted sequence!
      channel: 'sms',
      status: 'DELIVERED',
      deliveredAt: '2026-09-24T21:00:03.000Z',
    };

    const result3 = await engine.applyDeliveryReceipt(receiptSeq3);
    expect(result3.applied).toBe(false);
    expect(result3.isStale).toBe(true);
    expect(result3.currentSequence).toBe(5); // Retains highest monotonic sequence
    expect(result3.reason).toBe('STALE_SEQUENCE_REJECTED');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Participant Isolation & Staff Note Segregation
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Rejects unauthorized thread access and strictly isolates staff internal notes', async () => {
    const engine = new ConversationDeskEngine();

    // Register active participants for thread
    engine.registerThread('thread_secure_1', ['user_guest_99', 'user_host_99']);

    // Unauthorized outsider attempts access
    expect(() =>
      engine.assertThreadAccess('thread_secure_1', 'user_outsider_404', 'guest')
    ).toThrow('UNAUTHORIZED_PARTICIPANT: Actor has no access to thread_secure_1');

    // Authorized staff with support role can access
    expect(
      engine.assertThreadAccess('thread_secure_1', 'user_staff_01', 'support_agent')
    ).toBe(true);

    // Filter messages for guest: internal staff notes must be hidden
    const messages = [
      { id: 'm1', content: 'Guest inquiry', isInternalNote: false },
      { id: 'm2', content: 'Host reply', isInternalNote: false },
      { id: 'm3', content: 'CONFIDENTIAL: Host requested security deposit waiver', isInternalNote: true },
    ];

    const guestView = engine.projectThreadMessages(messages, 'guest');
    expect(guestView).toHaveLength(2);
    expect(guestView.map(m => m.id)).toEqual(['m1', 'm2']);

    const staffView = engine.projectThreadMessages(messages, 'support_agent');
    expect(staffView).toHaveLength(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: Package P4.1/P4.2 Canonical Room Offer Grounding
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Enforces canonical room offer grounding and rejects synthetic or ungrounded prices', () => {
    const engine = new ConversationDeskEngine();

    // Valid canonical room offer with explicit paise rate
    const validOffer = engine.validateRoomOfferContext({
      propertyId: 'prop_wayanad_sanctuary',
      roomTierId: 'room_deluxe_valley',
      roomName: 'Valley View Deluxe',
      nightlyPricePaise: 450000, // ₹4,500.00
      maxGuests: 2,
    });

    expect(validOffer.valid).toBe(true);
    expect(validOffer.canonicalPriceRupees).toBe('4500.00');

    // Reject non-positive or ungrounded prices
    expect(() =>
      engine.validateRoomOfferContext({
        propertyId: 'prop_wayanad_sanctuary',
        roomTierId: 'room_fake_suite',
        roomName: 'Invented Penthouse',
        nightlyPricePaise: 0, // Ungrounded free room!
        maxGuests: 4,
      })
    ).toThrow('INVALID_ROOM_OFFER_PRICE: Nightly price must be positive non-zero paise');

    // Reject synthetic ungrounded room tier
    expect(() =>
      engine.validateRoomOfferContext({
        propertyId: 'prop_wayanad_sanctuary',
        roomTierId: '',
        roomName: 'Nameless Tier',
        nightlyPricePaise: 250000,
        maxGuests: 2,
      })
    ).toThrow('MISSING_ROOM_TIER_ID: Canonical relational room ID required');
  });
});
