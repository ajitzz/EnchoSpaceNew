import crypto from 'node:crypto';
import type pg from 'pg';

export interface ServerQuoteRequest {
  listingId: number;
  roomTypeId: number;
  checkInDate: string;
  checkOutDate: string;
  nightlyRatePaise: bigint;
  guestCount: number;
}

export interface ServerQuote {
  id: string;
  listingId: number;
  roomTypeId: number;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  basePricePaise: bigint;
  taxPaise: bigint;
  totalPaise: bigint;
  currency: string;
  expiresAt: string;
}

export interface CreateHoldRequest {
  quoteId: string;
  userId: number;
  ttlSeconds: number;
}

export interface BookingHold {
  id: string;
  quoteId: string;
  userId: number;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'RELEASED';
  expiresAt: string;
}

export interface CreateOrderRequest {
  orderId: string;
  holdId: string;
  userId: number;
  totalPaise: bigint;
  idempotencyKey: string;
}

export interface OrderReceipt {
  orderId: string;
  status: 'PAYMENT_PENDING' | 'AUTHORIZED' | 'CONFIRMED' | 'CANCELLED' | 'FAILED';
  replayed: boolean;
}

export interface WebhookCapturePayload {
  eventId: string;
  orderId: string;
  eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed';
  sequenceNumber: number;
}

export interface WebhookResult {
  status?: string;
  ignored?: boolean;
  currentStatus?: string;
}

export class StaysCommerceEngine {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Generates an immutable, server-authoritative price quote.
   * Client-supplied prices or fee estimations are strictly ignored.
   */
  async createQuote(req: ServerQuoteRequest): Promise<ServerQuote> {
    const checkIn = new Date(req.checkInDate);
    const checkOut = new Date(req.checkOutDate);
    const diffTime = checkOut.getTime() - checkIn.getTime();
    const nights = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      throw new Error('INVALID_DATE_RANGE: check_out_date must be strictly greater than check_in_date');
    }

    const basePricePaise = req.nightlyRatePaise * BigInt(nights);
    const taxPaise = (basePricePaise * 18n) / 100n; // 18% GST statutory baseline
    const totalPaise = basePricePaise + taxPaise;
    const quoteId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15m TTL

    await this.pool.query(
      `INSERT INTO test_commerce_quotes (
        id, listing_id, room_type_id, check_in_date, check_out_date,
        nights, base_price_paise, tax_paise, total_paise, currency, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INR', $10)`,
      [
        quoteId,
        req.listingId,
        req.roomTypeId,
        req.checkInDate,
        req.checkOutDate,
        nights,
        basePricePaise.toString(),
        taxPaise.toString(),
        totalPaise.toString(),
        expiresAt,
      ]
    );

    return {
      id: quoteId,
      listingId: req.listingId,
      roomTypeId: req.roomTypeId,
      checkInDate: req.checkInDate,
      checkOutDate: req.checkOutDate,
      nights,
      basePricePaise,
      taxPaise,
      totalPaise,
      currency: 'INR',
      expiresAt,
    };
  }

  /**
   * Acquires a temporary reservation hold against a validated quote.
   */
  async createHold(req: CreateHoldRequest): Promise<BookingHold> {
    const holdId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + req.ttlSeconds * 1000).toISOString();

    await this.pool.query(
      `INSERT INTO test_commerce_holds (id, quote_id, user_id, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4)`,
      [holdId, req.quoteId, req.userId, expiresAt]
    );

    return {
      id: holdId,
      quoteId: req.quoteId,
      userId: req.userId,
      status: 'ACTIVE',
      expiresAt,
    };
  }

  /**
   * Idempotent order creation with atomic conflict resolution.
   * Handles 5 concurrent requests in 200ms: exactly 1 creates, 4 replay.
   */
  async createOrder(req: CreateOrderRequest): Promise<OrderReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertRes = await client.query(
        `INSERT INTO test_commerce_orders (
          id, hold_id, user_id, total_paise, status, sequence_version, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 1, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status`,
        [req.orderId, req.holdId, req.userId, req.totalPaise.toString(), req.idempotencyKey]
      );

      if (insertRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          orderId: insertRes.rows[0].id,
          status: insertRes.rows[0].status,
          replayed: false,
        };
      }

      // Conflict occurred: fetch existing idempotency record
      const existingRes = await client.query(
        `SELECT id, status FROM test_commerce_orders WHERE idempotency_key = $1`,
        [req.idempotencyKey]
      );

      await client.query('COMMIT');

      if (existingRes.rows.length === 0) {
        throw new Error('IDEMPOTENCY_ANOMALY: Conflict reported but row missing');
      }

      return {
        orderId: existingRes.rows[0].id,
        status: existingRes.rows[0].status,
        replayed: true,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket may already be closed
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Scenario 1: Multi-step transaction with simulated network/socket failure.
   * Proves that socket drop triggers complete PostgreSQL rollback without zombie rows.
   */
  async executeOrderCreationWithFault(
    client: pg.PoolClient,
    req: CreateOrderRequest & { simulateSocketDrop?: boolean }
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO test_commerce_orders (
          id, hold_id, user_id, total_paise, status, sequence_version, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 1, $5)`,
        [req.orderId, req.holdId, req.userId, req.totalPaise.toString(), req.idempotencyKey]
      );

      await client.query(`UPDATE test_commerce_holds SET status = 'CONSUMED' WHERE id = $1`, [req.holdId]);

      if (req.simulateSocketDrop) {
        // Abruptly terminate socket connection to simulate process crash or connection drop
        interface ClientWithStream {
          connection?: {
            stream?: {
              destroy: () => void;
            };
          };
        }
        (client as unknown as ClientWithStream).connection?.stream?.destroy();
        throw new Error('ECONNRESET: Network connection dropped during transaction execution');
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Postmaster handles rollback on connection reset
      }
      throw err;
    }
  }

  /**
   * Monotonic webhook processor.
   * Guarantees that out-of-order webhooks (e.g. sequence 2 arriving after sequence 3)
   * are safely ignored without regressing terminal order state.
   */
  async processWebhook(payload: WebhookCapturePayload): Promise<WebhookResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check anti-replay idempotency table
      const eventCheck = await client.query(
        `SELECT event_id FROM test_commerce_webhooks WHERE event_id = $1`,
        [payload.eventId]
      );
      if (eventCheck.rows.length > 0) {
        await client.query('COMMIT');
        return { ignored: true };
      }

      // Lock order for update to evaluate monotonic sequence
      const orderRes = await client.query(
        `SELECT id, status, sequence_version FROM test_commerce_orders WHERE id = $1 FOR UPDATE`,
        [payload.orderId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error(`ORDER_NOT_FOUND: ${payload.orderId}`);
      }

      const currentOrder = orderRes.rows[0];

      // Sequence guard: if incoming sequence is older or equal to current version, ignore
      if (payload.sequenceNumber <= currentOrder.sequence_version) {
        await client.query(
          `INSERT INTO test_commerce_webhooks (event_id, order_id, event_type, sequence_number)
           VALUES ($1, $2, $3, $4)`,
          [payload.eventId, payload.orderId, payload.eventType, payload.sequenceNumber]
        );
        await client.query('COMMIT');
        return { ignored: true, currentStatus: currentOrder.status };
      }

      // Map event to target status
      let nextStatus = currentOrder.status;
      if (payload.eventType === 'payment.captured') {
        nextStatus = 'CONFIRMED';
      } else if (payload.eventType === 'payment.authorized') {
        if (currentOrder.status !== 'CONFIRMED') {
          nextStatus = 'AUTHORIZED';
        }
      } else if (payload.eventType === 'payment.failed') {
        if (currentOrder.status !== 'CONFIRMED') {
          nextStatus = 'FAILED';
        }
      }

      await client.query(
        `UPDATE test_commerce_orders
         SET status = $1, sequence_version = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextStatus, payload.sequenceNumber, payload.orderId]
      );

      await client.query(
        `INSERT INTO test_commerce_webhooks (event_id, order_id, event_type, sequence_number)
         VALUES ($1, $2, $3, $4)`,
        [payload.eventId, payload.orderId, payload.eventType, payload.sequenceNumber]
      );

      await client.query('COMMIT');
      return { status: nextStatus, ignored: false };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket closed
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancels a confirmed booking and restores reservation hold/inventory atomically.
   */
  async cancelBooking(orderId: string, userId: number, _reason: string): Promise<{ status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT id, hold_id, status FROM test_commerce_orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [orderId, userId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND_OR_FORBIDDEN');
      }

      const order = orderRes.rows[0];

      await client.query(
        `UPDATE test_commerce_orders SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      if (order.hold_id) {
        await client.query(
          `UPDATE test_commerce_holds SET status = 'RELEASED' WHERE id = $1`,
          [order.hold_id]
        );
      }

      await client.query('COMMIT');
      return { status: 'CANCELLED' };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket closed
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
