import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import {
  StaysCommerceEngine,
  type ServerQuoteRequest,
  type CreateOrderRequest,
  type WebhookCapturePayload,
} from '../../lib/commerce/staysCommerceEngine.js';

describe('CR1 Batch 7: Commerce Integration & Adversarial Pipeline Suite (P4.4, P4.5, P4.6)', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let engine: StaysCommerceEngine;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });

    // Baseline transactional schema for isolated commerce verification
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS test_commerce_quotes (
        id UUID PRIMARY KEY,
        listing_id INT NOT NULL,
        room_type_id INT NOT NULL,
        check_in_date DATE NOT NULL,
        check_out_date DATE NOT NULL,
        nights INT NOT NULL,
        base_price_paise BIGINT NOT NULL,
        tax_paise BIGINT NOT NULL,
        total_paise BIGINT NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_commerce_holds (
        id UUID PRIMARY KEY,
        quote_id UUID REFERENCES test_commerce_quotes(id),
        user_id INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_commerce_orders (
        id UUID PRIMARY KEY,
        hold_id UUID REFERENCES test_commerce_holds(id),
        user_id INT NOT NULL,
        total_paise BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_PENDING',
        sequence_version INT NOT NULL DEFAULT 1,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        razorpay_order_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS test_commerce_webhooks (
        event_id VARCHAR(255) PRIMARY KEY,
        order_id UUID REFERENCES test_commerce_orders(id),
        event_type VARCHAR(100) NOT NULL,
        sequence_number INT NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    engine = new StaysCommerceEngine(fixture.pool);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(async () => {
    await fixture.pool.query('DELETE FROM test_commerce_webhooks');
    await fixture.pool.query('DELETE FROM test_commerce_orders');
    await fixture.pool.query('DELETE FROM test_commerce_holds');
    await fixture.pool.query('DELETE FROM test_commerce_quotes');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Connection Drops Halfway Through Order Capture Transaction
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Connection drops midway through order capture -> full rollback, 0 zombie records', async () => {
    // 1. Create valid quote & hold
    const quote = await engine.createQuote({
      listingId: 101,
      roomTypeId: 201,
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-12',
      nightlyRatePaise: 500000n, // ₹5,000.00
      guestCount: 2,
    });

    const hold = await engine.createHold({
      quoteId: quote.id,
      userId: 42,
      ttlSeconds: 600,
    });

    // 2. Simulate order creation where network/DB socket severs midway
    const client = await fixture.pool.connect();
    client.on('error', () => {});
    let severed = false;
    try {
      await engine.executeOrderCreationWithFault(client, {
        orderId: '00000000-0000-0000-0000-000000000001',
        holdId: hold.id,
        userId: 42,
        totalPaise: quote.totalPaise,
        idempotencyKey: 'idem-drop-test-1',
        simulateSocketDrop: true,
      });
    } catch (err: unknown) {
      severed = true;
      expect((err as Error).message).toContain('ECONNRESET');
    } finally {
      client.release(true);
    }

    expect(severed).toBe(true);

    // 3. Verify PostgreSQL invariant: zero zombie orders or consumed hold state
    const orderCheck = await fixture.pool.query('SELECT * FROM test_commerce_orders WHERE id = $1', [
      '00000000-0000-0000-0000-000000000001',
    ]);
    expect(orderCheck.rows.length).toBe(0);

    const holdCheck = await fixture.pool.query('SELECT status FROM test_commerce_holds WHERE id = $1', [hold.id]);
    expect(holdCheck.rows[0].status).toBe('ACTIVE');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Concurrency Burst - 5 Clicks in 200 Milliseconds
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Host/guest clicks submit 5 times in 200ms -> exactly 1 execution, 4 replays, 0 double-orders', async () => {
    const quote = await engine.createQuote({
      listingId: 102,
      roomTypeId: 202,
      checkInDate: '2026-10-15',
      checkOutDate: '2026-10-17',
      nightlyRatePaise: 800000n,
      guestCount: 2,
    });

    const hold = await engine.createHold({
      quoteId: quote.id,
      userId: 55,
      ttlSeconds: 600,
    });

    const idempotencyKey = 'idem-burst-click-5x';

    // Fire 5 identical order submissions simultaneously in a 200ms burst
    const requests = Array.from({ length: 5 }, (_, i) =>
      engine.createOrder({
        orderId: `00000000-0000-0000-0000-00000000000${i + 2}`,
        holdId: hold.id,
        userId: 55,
        totalPaise: quote.totalPaise,
        idempotencyKey,
      })
    );

    const results = await Promise.all(requests);

    // Exactly 1 must have been freshly created (replayed: false)
    const freshCreations = results.filter((r) => !r.replayed);
    const replayedResults = results.filter((r) => r.replayed);

    expect(freshCreations.length).toBe(1);
    expect(replayedResults.length).toBe(4);

    // All 5 must report the exact same primary orderId and status
    const primaryOrderId = freshCreations[0].orderId;
    for (const res of results) {
      expect(res.orderId).toBe(primaryOrderId);
      expect(res.status).toBe('PAYMENT_PENDING');
    }

    // Database must hold strictly 1 order record
    const countCheck = await fixture.pool.query(
      'SELECT count(*) FROM test_commerce_orders WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    expect(parseInt(countCheck.rows[0].count, 10)).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Webhook Payload Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Webhook payload arrives out of order -> monotonic state machine prevents regression', async () => {
    const quote = await engine.createQuote({
      listingId: 103,
      roomTypeId: 203,
      checkInDate: '2026-11-01',
      checkOutDate: '2026-11-05',
      nightlyRatePaise: 1000000n,
      guestCount: 2,
    });

    const hold = await engine.createHold({
      quoteId: quote.id,
      userId: 77,
      ttlSeconds: 600,
    });

    const order = await engine.createOrder({
      orderId: '00000000-0000-0000-0000-000000000099',
      holdId: hold.id,
      userId: 77,
      totalPaise: quote.totalPaise,
      idempotencyKey: 'idem-ooo-webhook',
    });

    // 1. Process PAYMENT_CAPTURED webhook (sequence version 3)
    const capturedRes = await engine.processWebhook({
      eventId: 'evt_rzp_capture_001',
      orderId: order.orderId,
      eventType: 'payment.captured',
      sequenceNumber: 3,
    });
    expect(capturedRes.status).toBe('CONFIRMED');

    // 2. Delayed/out-of-order PAYMENT_AUTHORIZED webhook arrives (sequence version 2)
    const delayedAuthRes = await engine.processWebhook({
      eventId: 'evt_rzp_auth_000',
      orderId: order.orderId,
      eventType: 'payment.authorized',
      sequenceNumber: 2, // Inverted sequence
    });

    // Must be rejected as obsolete/stale transition without altering CONFIRMED state
    expect(delayedAuthRes.ignored).toBe(true);
    expect(delayedAuthRes.currentStatus).toBe('CONFIRMED');

    // Verify DB remains in CONFIRMED terminal state
    const orderCheck = await fixture.pool.query('SELECT status FROM test_commerce_orders WHERE id = $1', [
      order.orderId,
    ]);
    expect(orderCheck.rows[0].status).toBe('CONFIRMED');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Cancellation & Inventory Restoration
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Confirmed booking cancellation transitions to CANCELLED and unlocks hold', async () => {
    const quote = await engine.createQuote({
      listingId: 104,
      roomTypeId: 204,
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-03',
      nightlyRatePaise: 400000n,
      guestCount: 1,
    });

    const hold = await engine.createHold({
      quoteId: quote.id,
      userId: 88,
      ttlSeconds: 600,
    });

    const order = await engine.createOrder({
      orderId: '00000000-0000-0000-0000-000000000100',
      holdId: hold.id,
      userId: 88,
      totalPaise: quote.totalPaise,
      idempotencyKey: 'idem-cancel-test',
    });

    await engine.processWebhook({
      eventId: 'evt_rzp_capture_002',
      orderId: order.orderId,
      eventType: 'payment.captured',
      sequenceNumber: 1,
    });

    // Execute verified cancellation
    const cancelRes = await engine.cancelBooking(order.orderId, 88, 'Guest requested cancellation');
    expect(cancelRes.status).toBe('CANCELLED');

    // Hold must be released
    const holdCheck = await fixture.pool.query('SELECT status FROM test_commerce_holds WHERE id = $1', [hold.id]);
    expect(holdCheck.rows[0].status).toBe('RELEASED');
  });
});
