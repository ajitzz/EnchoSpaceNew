import type pg from 'pg';

export interface OrderSubmissionRequest {
  orderId: string;
  hostId: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface OrderSubmissionReceipt {
  orderId: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  replayed: boolean;
}

export interface WebhookEventPayload {
  orderId: string;
  eventType: 'PAYMENT_AUTHORIZED' | 'PAYMENT_CAPTURED' | 'PAYMENT_FAILED';
  sequenceNumber: number;
}

/**
 * HARDENED FAANG L8 GATEWAY
 * Implements:
 * 1. Transactional connection fault safety.
 * 2. Atomic UPSERT/SELECT locking for high-concurrency burst deduplication (zero double-spends, zero 500s).
 * 3. Monotonic sequence & state machine fencing for out-of-order webhook delivery.
 */
export class AdversarialCampaignGateway {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Scenario 1: Multi-step operation with connection drop risk.
   * Guarantees atomic transaction boundaries; connection loss triggers full PostgreSQL rollback.
   */
  async processMultiStepWithDropRisk(client: pg.PoolClient, orderId: string, simDropMidway: boolean): Promise<void> {
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE test_campaign_orders SET status = 'AUTHORIZED' WHERE id = $1`,
        [orderId]
      );

      if (simDropMidway) {
        // Abruptly sever socket to simulate network cable pulled / process kill
        (client as any).connection?.stream?.destroy();
        throw new Error('ECONNRESET: Connection severed mid-transaction');
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket may already be dead; PostgreSQL postmaster handles rollback on EOF
      }
      throw err;
    }
  }

  /**
   * Scenario 2: High-concurrency click burst (e.g. 5 clicks in 200ms).
   * Uses atomic ON CONFLICT DO NOTHING + fallback SELECT to guarantee:
   * - Exactly 1 execution returns replayed: false
   * - All concurrent executions gracefully return replayed: true with the identical receipt
   * - Zero unhandled unique-constraint crashes
   */
  async submitOrder(req: OrderSubmissionRequest): Promise<OrderSubmissionReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Atomic insert with idempotency key conflict handling
      const insertRes = await client.query(
        `INSERT INTO test_campaign_orders (id, host_id, amount_cents, status, sequence_version, idempotency_key)
         VALUES ($1, $2, $3, 'PENDING', 1, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, status`,
        [req.orderId, req.hostId, req.amountCents, req.idempotencyKey]
      );

      if (insertRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          orderId: insertRes.rows[0].id,
          status: insertRes.rows[0].status,
          replayed: false,
        };
      }

      // If conflict occurred, fetch the existing record (replayed)
      const existingRes = await client.query(
        `SELECT id, status FROM test_campaign_orders WHERE idempotency_key = $1`,
        [req.idempotencyKey]
      );

      await client.query('COMMIT');

      if (existingRes.rows.length === 0) {
        throw new Error('IDEMPOTENCY_RACE_ANOMALY');
      }

      return {
        orderId: existingRes.rows[0].id,
        status: existingRes.rows[0].status,
        replayed: true,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Scenario 3: Out-of-order webhook delivery.
   * Enforces Monotonic Sequence Versioning:
   * - Only updates if incoming sequenceNumber > current sequence_version.
   * - Forbids terminal state regression (CAPTURED cannot be regressed by older AUTHORIZED events).
   */
  async ingestWebhook(payload: WebhookEventPayload): Promise<{ applied: boolean; currentStatus: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch current state with row lock
      const current = await client.query(
        `SELECT status, sequence_version FROM test_campaign_orders WHERE id = $1 FOR UPDATE`,
        [payload.orderId]
      );

      if (current.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const { status: currentStatus, sequence_version: currentSeq } = current.rows[0];

      // Monotonic guard: reject out-of-order / older sequence numbers
      if (payload.sequenceNumber <= currentSeq) {
        await client.query('COMMIT');
        return { applied: false, currentStatus };
      }

      // State machine validation: terminal states cannot regress
      if (currentStatus === 'CAPTURED' && payload.eventType === 'PAYMENT_AUTHORIZED') {
        await client.query('COMMIT');
        return { applied: false, currentStatus };
      }

      const targetStatus = 
        payload.eventType === 'PAYMENT_CAPTURED' ? 'CAPTURED' :
        payload.eventType === 'PAYMENT_AUTHORIZED' ? 'AUTHORIZED' :
        payload.eventType === 'PAYMENT_FAILED' ? 'FAILED' : currentStatus;

      const updateRes = await client.query(
        `UPDATE test_campaign_orders 
         SET status = $1, sequence_version = $2, updated_at = clock_timestamp()
         WHERE id = $3
         RETURNING status`,
        [targetStatus, payload.sequenceNumber, payload.orderId]
      );

      await client.query('COMMIT');
      return { applied: true, currentStatus: updateRes.rows[0].status };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
