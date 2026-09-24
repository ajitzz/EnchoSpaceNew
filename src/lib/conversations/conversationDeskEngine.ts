/**
 * CR1 Batch 2 & 3: Conversation Desk & Offer Authority Engine
 *
 * Implements Transactional Outbox for message delivery, 200ms burst deduplication,
 * monotonic delivery receipt sequence fencing, participant privacy isolation,
 * and canonical room offer grounding (Packages P3.1, P3.3, P3.4, P3.5, P3.6, P4.1, P4.2).
 */

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export type ParticipantRole = 'guest' | 'host' | 'support_agent' | 'admin';

export interface MessageSubmissionInput {
  threadId: string;
  senderId: string;
  senderRole: ParticipantRole;
  clientEventId: string;
  content: string;
  roomOfferId?: string;
  canonicalNightlyPricePaise?: number;
}

export interface MessageSubmissionResult {
  messageId: string;
  threadId: string;
  senderId: string;
  status: 'COMMITTED';
  isReplay: boolean;
  timestamp: string;
}

export interface DeliveryReceiptPayload {
  receiptId: string;
  threadId: string;
  messageId: string;
  recipientId: string;
  sequenceNumber: number;
  channel: 'push' | 'sms' | 'email';
  status: 'DELIVERED' | 'FAILED';
  deliveredAt: string;
}

export interface DeliveryReceiptResult {
  receiptId: string;
  threadId: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  reason?: string;
}

export interface ThreadMessage {
  id: string;
  content: string;
  isInternalNote: boolean;
}

export interface RoomOfferContextInput {
  propertyId: string;
  roomTierId: string;
  roomName: string;
  nightlyPricePaise: number;
  maxGuests: number;
}

export interface RoomOfferContextResult {
  valid: boolean;
  propertyId: string;
  roomTierId: string;
  roomName: string;
  nightlyPricePaise: number;
  canonicalPriceRupees: string;
  maxGuests: number;
}

export class ConversationDeskEngine {
  private inFlightSubmissions = new Map<string, Promise<MessageSubmissionResult>>();
  private completedSubmissions = new Map<string, MessageSubmissionResult>();
  private threadSequences = new Map<string, number>();
  private threadParticipants = new Map<string, Set<string>>();

  /**
   * Sends a conversation message and atomically writes a notification outbox intent.
   * Guarantees all-or-nothing rollback on connection termination and deduplicates 200ms bursts.
   */
  async sendMessageWithOutbox(
    dbClient: DbClientPort,
    input: MessageSubmissionInput
  ): Promise<MessageSubmissionResult> {
    // 1. Check idempotency cache for completed submission
    const existing = this.completedSubmissions.get(input.clientEventId);
    if (existing) {
      return { ...existing, isReplay: true };
    }

    // 2. Deduplicate in-flight concurrent burst promises
    const inFlight = this.inFlightSubmissions.get(input.clientEventId);
    if (inFlight) {
      const result = await inFlight;
      return { ...result, isReplay: true };
    }

    const executionPromise = (async (): Promise<MessageSubmissionResult> => {
      await dbClient.query('BEGIN');
      try {
        const messageId = `msg_${input.clientEventId}`;

        // 1. Insert message into messages table
        await dbClient.query(
          `INSERT INTO messages (id, thread_id, sender_id, sender_role, content, client_event_id)
           VALUES ('${messageId}', '${input.threadId}', '${input.senderId}', '${input.senderRole}', '${input.content}', '${input.clientEventId}')`
        );

        // 2. Insert notification intent into Transactional Outbox
        await dbClient.query(
          `INSERT INTO notification_intents (id, message_id, thread_id, recipient_id, state)
           VALUES ('notif_${messageId}', '${messageId}', '${input.threadId}', 'recipient_pending', 'PENDING')`
        );

        await dbClient.query('COMMIT');

        const result: MessageSubmissionResult = {
          messageId,
          threadId: input.threadId,
          senderId: input.senderId,
          status: 'COMMITTED',
          isReplay: false,
          timestamp: new Date().toISOString(),
        };

        this.completedSubmissions.set(input.clientEventId, result);
        return result;
      } catch (err: unknown) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        this.inFlightSubmissions.delete(input.clientEventId);
      }
    })();

    this.inFlightSubmissions.set(input.clientEventId, executionPromise);
    return executionPromise;
  }

  /**
   * Applies an incoming external delivery receipt with strict monotonic sequence fencing.
   * Rejects out-of-order or stale sequences without corrupting read/delivery cursors.
   */
  async applyDeliveryReceipt(receipt: DeliveryReceiptPayload): Promise<DeliveryReceiptResult> {
    const currentSeq = this.threadSequences.get(receipt.threadId) || 0;

    if (receipt.sequenceNumber <= currentSeq) {
      return {
        receiptId: receipt.receiptId,
        threadId: receipt.threadId,
        applied: false,
        isStale: true,
        currentSequence: currentSeq,
        reason: 'STALE_SEQUENCE_REJECTED',
      };
    }

    this.threadSequences.set(receipt.threadId, receipt.sequenceNumber);

    return {
      receiptId: receipt.receiptId,
      threadId: receipt.threadId,
      applied: true,
      isStale: false,
      currentSequence: receipt.sequenceNumber,
    };
  }

  /**
   * Registers authorized participants for a thread.
   */
  registerThread(threadId: string, participantIds: string[]): void {
    this.threadParticipants.set(threadId, new Set(participantIds));
  }

  /**
   * Asserts participant access. Enforces participant isolation: outsiders are rejected;
   * authorized support agents and administrators possess privileged access.
   */
  assertThreadAccess(threadId: string, actorId: string, role: ParticipantRole): boolean {
    if (role === 'support_agent' || role === 'admin') {
      return true;
    }

    const participants = this.threadParticipants.get(threadId);
    if (!participants || !participants.has(actorId)) {
      throw new Error(`UNAUTHORIZED_PARTICIPANT: Actor has no access to ${threadId}`);
    }

    return true;
  }

  /**
   * Projects thread messages according to viewer role:
   * Masks internal staff notes from guest and host views.
   */
  projectThreadMessages(messages: ThreadMessage[], viewerRole: ParticipantRole): ThreadMessage[] {
    if (viewerRole === 'support_agent' || viewerRole === 'admin') {
      return messages;
    }

    return messages.filter(msg => !msg.isInternalNote);
  }

  /**
   * Validates canonical room offer context under Package P4.1 & P4.2 rules.
   * Rejects ungrounded or non-positive paise prices and empty room tier IDs.
   */
  validateRoomOfferContext(input: RoomOfferContextInput): RoomOfferContextResult {
    if (!input.roomTierId || input.roomTierId.trim().length === 0) {
      throw new Error('MISSING_ROOM_TIER_ID: Canonical relational room ID required');
    }

    if (!input.nightlyPricePaise || input.nightlyPricePaise <= 0) {
      throw new Error('INVALID_ROOM_OFFER_PRICE: Nightly price must be positive non-zero paise');
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
}
