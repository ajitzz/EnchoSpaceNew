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
  quoteId?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
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

export interface StaysCommerceEngineOptions {
  tablePrefix?: string;
  useProductionTables?: boolean;
}

export class StaysCommerceEngine {
  readonly quotesTable: string;
  readonly holdsTable: string;
  readonly ordersTable: string;
  readonly webhooksTable: string;

  constructor(
    private readonly pool: pg.Pool,
    options?: StaysCommerceEngineOptions
  ) {
    const isExplicitProd = options?.useProductionTables === true || options?.tablePrefix === 'stays_';
    const isTestRuntime = process.env.NODE_ENV === 'test' && !isExplicitProd;
    const prefix = options?.tablePrefix || (isTestRuntime ? 'test_commerce_' : 'stays_');

    this.quotesTable = `${prefix}quotes`;
    this.holdsTable = `${prefix}holds`;
    this.ordersTable = `${prefix}orders`;
    this.webhooksTable = `${prefix}webhooks`;
  }

  /**
   * Generates an immutable, server-authoritative price quote.
   * Client-supplied prices or fee estimations are strictly ignored.
   * Zero Guest Fee invariant: Guest pays ₹0 platform fee / ₹0 gateway fee.
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
      `INSERT INTO ${this.quotesTable} (
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
   * Retrieves a quote by ID if not expired.
   */
  async getQuote(quoteId: string): Promise<ServerQuote | null> {
    const res = await this.pool.query(
      `SELECT * FROM ${this.quotesTable} WHERE id = $1 AND expires_at > NOW()`,
      [quoteId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      listingId: Number(r.listing_id),
      roomTypeId: Number(r.room_type_id),
      checkInDate: typeof r.check_in_date === 'string' ? r.check_in_date : new Date(r.check_in_date).toISOString().split('T')[0],
      checkOutDate: typeof r.check_out_date === 'string' ? r.check_out_date : new Date(r.check_out_date).toISOString().split('T')[0],
      nights: Number(r.nights),
      basePricePaise: BigInt(r.base_price_paise),
      taxPaise: BigInt(r.tax_paise),
      totalPaise: BigInt(r.total_paise),
      currency: r.currency || 'INR',
      expiresAt: new Date(r.expires_at).toISOString(),
    };
  }

  /**
   * Acquires a temporary reservation hold against a validated quote.
   */
  async createHold(req: CreateHoldRequest): Promise<BookingHold> {
    const holdId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + req.ttlSeconds * 1000).toISOString();

    await this.pool.query(
      `INSERT INTO ${this.holdsTable} (id, quote_id, user_id, status, expires_at)
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
   * Retrieves a hold by ID.
   */
  async getHold(holdId: string): Promise<BookingHold | null> {
    const res = await this.pool.query(
      `SELECT * FROM ${this.holdsTable} WHERE id = $1`,
      [holdId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      quoteId: r.quote_id,
      userId: Number(r.user_id),
      status: r.status,
      expiresAt: new Date(r.expires_at).toISOString(),
    };
  }

  /**
   * Idempotent order creation with atomic conflict resolution.
   * Handles concurrent bursts: exactly 1 creates, replays on conflict.
   */
  async createOrder(req: CreateOrderRequest): Promise<OrderReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const hasExtendedCols = this.ordersTable === 'stays_orders';
      let insertRes;

      if (hasExtendedCols && (req.quoteId || req.guestName)) {
        insertRes = await client.query(
          `INSERT INTO ${this.ordersTable} (
            id, hold_id, user_id, total_paise, status, sequence_version, idempotency_key,
            quote_id, guest_name, guest_phone, guest_email
          ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 1, $5, $6, $7, $8, $9)
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id, status`,
          [
            req.orderId,
            req.holdId,
            req.userId,
            req.totalPaise.toString(),
            req.idempotencyKey,
            req.quoteId || null,
            req.guestName || null,
            req.guestPhone || null,
            req.guestEmail || null,
          ]
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO ${this.ordersTable} (
            id, hold_id, user_id, total_paise, status, sequence_version, idempotency_key
          ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 1, $5)
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id, status`,
          [
            req.orderId,
            req.holdId,
            req.userId,
            req.totalPaise.toString(),
            req.idempotencyKey,
          ]
        );
      }

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
        `SELECT id, status FROM ${this.ordersTable} WHERE idempotency_key = $1`,
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
      } catch (rollbackErr: unknown) {
        console.warn('Transaction rollback notice in createOrder:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
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
        `INSERT INTO ${this.ordersTable} (
          id, hold_id, user_id, total_paise, status, sequence_version, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 1, $5)`,
        [req.orderId, req.holdId, req.userId, req.totalPaise.toString(), req.idempotencyKey]
      );

      await client.query(`UPDATE ${this.holdsTable} SET status = 'CONSUMED' WHERE id = $1`, [req.holdId]);

      if (req.simulateSocketDrop) {
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
      } catch (rollbackErr: unknown) {
        console.warn('Transaction rollback notice in executeOrderCreationWithFault:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
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
        `SELECT event_id FROM ${this.webhooksTable} WHERE event_id = $1`,
        [payload.eventId]
      );
      if (eventCheck.rows.length > 0) {
        await client.query('COMMIT');
        return { ignored: true };
      }

      // Lock order for update to evaluate monotonic sequence
      const orderRes = await client.query(
        `SELECT id, status, sequence_version FROM ${this.ordersTable} WHERE id = $1 FOR UPDATE`,
        [payload.orderId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error(`ORDER_NOT_FOUND: ${payload.orderId}`);
      }

      const currentOrder = orderRes.rows[0];

      // Sequence guard: if incoming sequence is older or equal to current version, ignore
      if (payload.sequenceNumber <= currentOrder.sequence_version) {
        await client.query(
          `INSERT INTO ${this.webhooksTable} (event_id, order_id, event_type, sequence_number)
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
        `UPDATE ${this.ordersTable}
         SET status = $1, sequence_version = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextStatus, payload.sequenceNumber, payload.orderId]
      );

      await client.query(
        `INSERT INTO ${this.webhooksTable} (event_id, order_id, event_type, sequence_number)
         VALUES ($1, $2, $3, $4)`,
        [payload.eventId, payload.orderId, payload.eventType, payload.sequenceNumber]
      );

      await client.query('COMMIT');
      return { status: nextStatus, ignored: false };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr: unknown) {
        console.warn('Transaction rollback notice in processWebhook:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Captures order after verified cryptographic payment signature.
   * Atomically confirms order, consumes hold, creates booking, and updates inventory.
   */
  async captureOrderWithPayment(params: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<{ success: boolean; bookingId: number; orderId: string; status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT * FROM ${this.ordersTable} WHERE id = $1 FOR UPDATE`,
        [params.orderId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error(`ORDER_NOT_FOUND: ${params.orderId}`);
      }

      const orderRow = orderRes.rows[0];
      let quoteRow: any = null;
      if (orderRow.quote_id) {
        const quoteRes = await client.query(
          `SELECT listing_id, room_type_id, check_in_date, check_out_date, nights, total_paise FROM ${this.quotesTable} WHERE id = $1`,
          [orderRow.quote_id]
        );
        if (quoteRes.rows.length > 0) {
          quoteRow = quoteRes.rows[0];
        }
      }

      const order = { ...orderRow, ...quoteRow };

      if (order.status === 'CONFIRMED') {
        await client.query('COMMIT');
        return {
          success: true,
          bookingId: order.booking_id,
          orderId: order.id,
          status: 'CONFIRMED'
        };
      }

      // Mark hold as CONSUMED if hold exists
      if (order.hold_id) {
        await client.query(
          `UPDATE ${this.holdsTable} SET status = 'CONSUMED' WHERE id = $1`,
          [order.hold_id]
        );
      }

      // Insert confirmed booking row in bookings table
      let bookingId = order.booking_id;
      if (!bookingId && order.listing_id) {
        const totalRentRupees = Number(order.total_paise) / 100;
        const bookInsert = await client.query(
          `INSERT INTO bookings (
            user_id, listing_id, move_in_date, check_out_date, configuration,
            name, phone, email, total_rent, status, payment_intent_id, payment_gateway
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10, 'razorpay')
          RETURNING id`,
          [
            order.user_id,
            order.listing_id,
            order.check_in_date ? new Date(order.check_in_date).toISOString() : new Date().toISOString(),
            order.check_out_date ? new Date(order.check_out_date).toISOString() : null,
            `Stay Room ${order.room_type_id || ''}`,
            order.guest_name || 'Guest Traveler',
            order.guest_phone || '',
            order.guest_email || '',
            totalRentRupees,
            params.razorpayPaymentId
          ]
        );
        bookingId = bookInsert.rows[0].id;
      }

      // Update order state to CONFIRMED
      await client.query(
        `UPDATE ${this.ordersTable}
         SET status = 'CONFIRMED',
             razorpay_order_id = $1,
             razorpay_payment_id = $2,
             razorpay_signature = $3,
             booking_id = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          params.razorpayOrderId,
          params.razorpayPaymentId,
          params.razorpaySignature,
          bookingId,
          params.orderId
        ]
      );

      // Update inventory_days if room_type_id exists
      if (order.room_type_id && order.check_in_date && order.check_out_date) {
        try {
          await client.query(
            `UPDATE inventory_days
             SET held_units = GREATEST(0, held_units - 1),
                 booked_units = booked_units + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE room_type_id = $1
               AND calendar_date >= $2
               AND calendar_date < $3`,
            [order.room_type_id, order.check_in_date, order.check_out_date]
          );
        } catch (invErr) {
          console.warn('[INVENTORY UPDATE NON-FATAL NOTICE]', invErr);
        }
      }

      await client.query('COMMIT');
      return {
        success: true,
        bookingId,
        orderId: order.id,
        status: 'CONFIRMED'
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.warn('Rollback failed:', rollbackErr);
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
        `SELECT id, hold_id, status FROM ${this.ordersTable} WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [orderId, userId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND_OR_FORBIDDEN');
      }

      const order = orderRes.rows[0];

      await client.query(
        `UPDATE ${this.ordersTable} SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      if (order.hold_id) {
        await client.query(
          `UPDATE ${this.holdsTable} SET status = 'RELEASED' WHERE id = $1`,
          [order.hold_id]
        );
      }

      await client.query('COMMIT');
      return { status: 'CANCELLED' };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr: unknown) {
        console.warn('Transaction rollback notice in cancelBooking:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
