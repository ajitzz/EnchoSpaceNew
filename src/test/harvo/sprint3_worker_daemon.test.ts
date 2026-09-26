/**
 * src/test/harvo/sprint3_worker_daemon.test.ts
 *
 * FAANG L7/L8 Zero-Trust Adversarial Test Suite for Worker Daemon & Smart Auto-Pause Circuit Breaker (Sprint 3).
 * Fulfills Blueprint Section 7 & Decision CR1-045.
 *
 * Verifies:
 * 1. Smart Auto-Pause Invariant: 100% calendar occupancy automatically pauses active ad campaigns.
 * 2. Invariant Check: Partial occupancy (<100%) never trips circuit breaker.
 * 3. Budget Stop-Loss: Spend >= 95% trips circuit breaker to prevent overages.
 * 4. Time-Series Telemetry Rollups: Atomic daily aggregations sync with campaign analytics cache.
 * 5. Outbox & Dead Letter Queue (DLQ): Poisoned events retry with backoff and route to DLQ without data loss.
 * 6. Admin Override Desk: Admins can resume auto-paused campaigns with mandatory justification and audit logging.
 * 7. Dedicated Worker Daemon: Deterministic runWorkerCycle executes all 3 loops cleanly.
 * 8. HTTP Router Contract: RBAC enforcement on circuit breaker endpoints.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createLocalPostgresFixture } from './postgres.js';
import { CircuitBreakerService } from '../../services/circuitBreakerService.js';
import { PlatformWorkerDaemon } from '../../workers/platformWorker.js';
import { createCircuitBreakerRouter } from '../../server/marketing/circuitBreakerRouter.js';

describe('Sprint 3: Worker Daemon & Smart Auto-Pause Circuit Breaker Adversarial Suite', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let service: CircuitBreakerService;
  let daemon: PlatformWorkerDaemon;
  let app: express.Express;

  const HOST_ID = 201;
  const ADMIN_ID = 901;
  let listingFullId: number;
  let listingPartialId: number;
  let campaignFullId: number;
  let campaignPartialId: number;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });

    // 1. Deploy base tables
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        photos JSONB DEFAULT '[]'::jsonb,
        price NUMERIC NOT NULL DEFAULT 5000,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR'
      );

      CREATE TABLE IF NOT EXISTS room_types (
        id SERIAL PRIMARY KEY,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        base_price NUMERIC NOT NULL DEFAULT 5000,
        inventory_count INT NOT NULL DEFAULT 2
      );

      CREATE TABLE IF NOT EXISTS inventory_days (
        id SERIAL PRIMARY KEY,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        room_type_id INT REFERENCES room_types(id) ON DELETE CASCADE,
        calendar_date DATE NOT NULL,
        total_inventory INT NOT NULL DEFAULT 2,
        booked_units INT NOT NULL DEFAULT 0,
        held_units INT NOT NULL DEFAULT 0,
        price NUMERIC NOT NULL DEFAULT 5000
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'confirmed'
      );

      CREATE TABLE IF NOT EXISTS host_marketing_campaigns (
        id SERIAL PRIMARY KEY,
        host_id INT REFERENCES users(id) ON DELETE CASCADE,
        listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        budget DECIMAL DEFAULT 5000,
        status VARCHAR(50) DEFAULT 'active',
        spent DECIMAL DEFAULT 0,
        accumulated_spent DECIMAL DEFAULT 0,
        accumulated_impressions INT DEFAULT 0,
        accumulated_clicks INT DEFAULT 0,
        accumulated_conversions INT DEFAULT 0,
        analytics JSONB DEFAULT '{"impressions": 0, "clicks": 0, "ctr": 0, "conversions": 0, "spent": 0}'::jsonb,
        target_locations TEXT,
        pause_reason TEXT,
        pause_actor VARCHAR(50),
        paused_at TIMESTAMPTZ,
        resumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_intents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_id INT NOT NULL,
        payload JSONB NOT NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- Sprint 3 Tables
      CREATE TABLE IF NOT EXISTS marketing_daily_rollups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        rollup_date DATE NOT NULL,
        impressions INT NOT NULL DEFAULT 0,
        clicks INT NOT NULL DEFAULT 0,
        conversions INT NOT NULL DEFAULT 0,
        spend_paise BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (campaign_id, rollup_date)
      );

      CREATE TABLE IF NOT EXISTS circuit_breaker_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        trigger_reason VARCHAR(100) NOT NULL,
        occupancy_ratio DECIMAL(5, 4) DEFAULT 1.0000,
        target_date_start DATE,
        target_date_end DATE,
        previous_status VARCHAR(50) NOT NULL,
        new_status VARCHAR(50) NOT NULL DEFAULT 'CIRCUIT_BREAKER_PAUSED',
        provider_pause_receipt JSONB DEFAULT '{}'::jsonb,
        override_actor_id INT REFERENCES users(id),
        override_reason TEXT,
        version INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_queue VARCHAR(100) NOT NULL,
        original_event_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        attempts INT NOT NULL,
        last_error TEXT NOT NULL,
        failed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMPTZ,
        resolution_notes TEXT
      );
    `);

    // Seed users
    await fixture.pool.query(`
      INSERT INTO users (id, email, name, role) VALUES
      (${HOST_ID}, 'host_occupancy@encho.in', 'Host Helen', 'host'),
      (${ADMIN_ID}, 'admin_ops@encho.in', 'Admin Officer', 'admin')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed Listing 1: Fully Occupied (100% capacity)
    const list1 = await fixture.pool.query(`
      INSERT INTO listings (user_id, title, price)
      VALUES (${HOST_ID}, 'Wayanad Cloud Peak Sanctuary', 12000)
      RETURNING id;
    `);
    listingFullId = list1.rows[0].id;

    await fixture.pool.query(`
      INSERT INTO inventory_days (listing_id, calendar_date, total_inventory, booked_units, held_units)
      VALUES (${listingFullId}, '2026-10-01', 2, 2, 0); -- 2 of 2 units booked (100% full)
    `);

    const camp1 = await fixture.pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, status, budget)
      VALUES (${HOST_ID}, ${listingFullId}, 'Cloud Peak Meta Reel Campaign', 'active', 6000)
      RETURNING id;
    `);
    campaignFullId = camp1.rows[0].id;

    // Seed Listing 2: Partially Occupied (50% capacity)
    const list2 = await fixture.pool.query(`
      INSERT INTO listings (user_id, title, price)
      VALUES (${HOST_ID}, 'Munnar Valley Villa', 8500)
      RETURNING id;
    `);
    listingPartialId = list2.rows[0].id;

    await fixture.pool.query(`
      INSERT INTO inventory_days (listing_id, calendar_date, total_inventory, booked_units, held_units)
      VALUES (${listingPartialId}, '2026-10-01', 2, 1, 0); -- 1 of 2 units booked (50% full)
    `);

    const camp2 = await fixture.pool.query(`
      INSERT INTO host_marketing_campaigns (host_id, listing_id, title, status, budget)
      VALUES (${HOST_ID}, ${listingPartialId}, 'Munnar Valley Google Campaign', 'active', 5000)
      RETURNING id;
    `);
    campaignPartialId = camp2.rows[0].id;

    service = new CircuitBreakerService(fixture.pool);
    daemon = new PlatformWorkerDaemon(fixture.pool, { maxRetries: 3 });

    // Setup Express App
    app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      const uid = req.headers['x-test-user-id'];
      const role = req.headers['x-test-user-role'] || 'host';
      if (uid) {
        (req as any).user = { id: Number(uid), role: String(role) };
      }
      next();
    });

    const router = createCircuitBreakerRouter(fixture.pool);
    app.use('/api/marketing/v2/circuit-breaker', router);
  });

  afterAll(async () => {
    await fixture.close();
  });

  // TEST 1: Full occupancy trips Smart Auto-Pause Circuit Breaker
  it('Test 1: 100% Calendar Occupancy automatically pauses active campaign and emits audit event', async () => {
    const tripped = await service.evaluateOccupancyCircuitBreaker(campaignFullId);

    expect(tripped).toHaveLength(1);
    const ev = tripped[0];
    expect(ev.campaignId).toBe(campaignFullId);
    expect(ev.listingId).toBe(listingFullId);
    expect(ev.triggerReason).toBe('FULL_OCCUPANCY_100');
    expect(ev.occupancyRatio).toBe(1.0);
    expect(ev.newStatus).toBe('CIRCUIT_BREAKER_PAUSED');

    // Verify DB campaign status updated
    const campRes = await fixture.pool.query(
      'SELECT status, pause_reason, pause_actor FROM host_marketing_campaigns WHERE id = $1',
      [campaignFullId]
    );
    expect(campRes.rows[0].status).toBe('CIRCUIT_BREAKER_PAUSED');
    expect(campRes.rows[0].pause_actor).toBe('CIRCUIT_BREAKER');
    expect(campRes.rows[0].pause_reason).toContain('100%');

    // Verify notification intent was dispatched for host
    const notifRes = await fixture.pool.query(
      'SELECT payload FROM notification_intents WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [HOST_ID]
    );
    expect(notifRes.rows.length).toBeGreaterThan(0);
    const rawPayload = notifRes.rows[0].payload;
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    expect(payload.topic).toBe('MARKETING.CIRCUIT_BREAKER.AUTO_PAUSED');
  });

  // TEST 2: Invariant Check: Partial occupancy (<100%) does NOT trip circuit breaker
  it('Test 2: Partial Occupancy (50%) does NOT trip circuit breaker; campaign remains active', async () => {
    const tripped = await service.evaluateOccupancyCircuitBreaker(campaignPartialId);

    expect(tripped).toHaveLength(0);

    const campRes = await fixture.pool.query(
      'SELECT status FROM host_marketing_campaigns WHERE id = $1',
      [campaignPartialId]
    );
    expect(campRes.rows[0].status).toBe('active');
  });

  // TEST 3: Budget stop-loss circuit breaker trips at >= 95% spend
  it('Test 3: Budget Stop-Loss trips when ad spend crosses 95% threshold', async () => {
    const budgetPaise = 1000000; // ₹10,000 INR
    const spendPaise = 960000;   // ₹9,600 INR (96% spent)

    const ev = await service.evaluateBudgetStopLoss(campaignPartialId, spendPaise, budgetPaise);

    expect(ev).toBeDefined();
    expect(ev?.triggerReason).toBe('BUDGET_STOP_LOSS_95');
    expect(ev?.newStatus).toBe('CIRCUIT_BREAKER_PAUSED');

    const campRes = await fixture.pool.query(
      'SELECT status, pause_reason FROM host_marketing_campaigns WHERE id = $1',
      [campaignPartialId]
    );
    expect(campRes.rows[0].status).toBe('CIRCUIT_BREAKER_PAUSED');
    expect(campRes.rows[0].pause_reason).toContain('95% threshold');
  });

  // TEST 4: Time-series telemetry rollups: Atomic daily aggregations
  it('Test 4: Atomic Daily Telemetry Rollups update marketing_daily_rollups and sync campaign cache', async () => {
    const today = new Date().toISOString().split('T')[0];

    // First ingestion delta
    await service.aggregateDailyRollups(campaignFullId, today, {
      impressions: 1250,
      clicks: 84,
      conversions: 3,
      spendPaise: 45000, // ₹450
    });

    // Second ingestion delta on the same date (proves ON CONFLICT DO UPDATE behavior)
    const rollup = await service.aggregateDailyRollups(campaignFullId, today, {
      impressions: 750,
      clicks: 40,
      conversions: 1,
      spendPaise: 25000, // ₹250
    });

    expect(rollup.impressions).toBe(2000); // 1250 + 750
    expect(rollup.clicks).toBe(124);        // 84 + 40
    expect(rollup.conversions).toBe(4);     // 3 + 1
    expect(rollup.spendPaise).toBe(70000);  // ₹700

    // Verify parent campaign analytics column updated
    const campRes = await fixture.pool.query(
      'SELECT analytics, spent, accumulated_impressions, accumulated_clicks FROM host_marketing_campaigns WHERE id = $1',
      [campaignFullId]
    );
    const camp = campRes.rows[0];
    expect(Number(camp.spent)).toBe(700);
    expect(camp.accumulated_impressions).toBe(2000);
    expect(camp.accumulated_clicks).toBe(124);
    expect(camp.analytics.clicks).toBe(124);
  });

  // TEST 5: Outbox poller with Dead Letter Queue (DLQ)
  it('Test 5: Poisoned outbox events retry with backoff and route to Dead Letter Queue after max attempts', async () => {
    // Insert a poisoned notification intent
    const intentId = crypto.randomUUID();
    await fixture.pool.query(
      `INSERT INTO notification_intents (id, recipient_id, payload, state, attempts)
       VALUES ($1, $2, $3, 'PENDING', 2)`,
      [intentId, HOST_ID, JSON.stringify({ simulateFailure: true })]
    );

    // Run pollOutboxBatch with maxRetries = 3 (current attempt 2 + 1 = 3 >= maxRetries -> DLQ)
    const batchStats = await daemon.pollOutboxBatch();

    expect(batchStats.deadLettered).toBe(1);

    // Verify moved to dead_letter_queue
    const dlqRes = await fixture.pool.query(
      'SELECT * FROM dead_letter_queue WHERE original_event_id = $1',
      [intentId]
    );
    expect(dlqRes.rows).toHaveLength(1);
    const dlq = dlqRes.rows[0];
    expect(dlq.source_queue).toBe('notification_intents');
    expect(dlq.attempts).toBe(3);
    expect(dlq.last_error).toContain('SIMULATED_GATEWAY_TIMEOUT');
    expect(dlq.resolved).toBe(false);

    // Verify intent in notification_intents is marked DEAD
    const intentRes = await fixture.pool.query(
      'SELECT state FROM notification_intents WHERE id = $1',
      [intentId]
    );
    expect(intentRes.rows[0].state).toBe('DEAD');
  });

  // TEST 6: Admin Override Desk
  it('Test 6: Admin Override resumes paused campaign with required justification and audit logging', async () => {
    // Fetch tripped event from Test 1
    const eventRes = await fixture.pool.query(
      'SELECT id FROM circuit_breaker_events WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 1',
      [campaignFullId]
    );
    const eventId = eventRes.rows[0].id;

    // 6a. Override without detailed reason fails closed
    await expect(
      service.overrideCircuitBreaker(eventId, ADMIN_ID, 'Short')
    ).rejects.toThrow('OVERRIDE_REASON_REQUIRED');

    // 6b. Valid override resumes campaign to active
    const overrideResult = await service.overrideCircuitBreaker(
      eventId,
      ADMIN_ID,
      'Host manually confirmed 2 offline villas released for this weekend flight.'
    );

    expect(overrideResult.success).toBe(true);
    expect(overrideResult.campaignStatus).toBe('active');
    expect(overrideResult.event.newStatus).toBe('OVERRIDDEN_ACTIVE');
    expect(overrideResult.event.overrideActorId).toBe(ADMIN_ID);
    expect(overrideResult.event.version).toBe(2);

    // Verify campaign is active in DB
    const campRes = await fixture.pool.query(
      'SELECT status, resumed_at FROM host_marketing_campaigns WHERE id = $1',
      [campaignFullId]
    );
    expect(campRes.rows[0].status).toBe('active');
    expect(campRes.rows[0].resumed_at).not.toBeNull();
  });

  // TEST 7: Platform Worker Daemon Deterministic Single Cycle
  it('Test 7: Dedicated PlatformWorkerDaemon executes complete single cycle cleanly', async () => {
    // Insert a normal passing notification
    await fixture.pool.query(
      `INSERT INTO notification_intents (id, recipient_id, payload, state, attempts)
       VALUES ($1, $2, $3, 'PENDING', 0)`,
      [crypto.randomUUID(), HOST_ID, JSON.stringify({ message: 'Welcome to Encho Stays' })]
    );

    const stats = await daemon.runWorkerCycle();

    expect(stats.outboxProcessed).toBeGreaterThanOrEqual(1);
    expect(stats.telemetryRollupsUpdated).toBeGreaterThanOrEqual(1);
    expect(typeof stats.circuitBreakersTripped).toBe('number');
  });

  // TEST 8: Full HTTP Router Contract & RBAC
  it('Test 8: HTTP Circuit Breaker Router enforces RBAC and provides status and override controls', async () => {
    // 8a. GET /status returns system health and counts
    const statusRes = await request(app).get('/api/marketing/v2/circuit-breaker/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.success).toBe(true);
    expect(typeof statusRes.body.activeTrippedCount).toBe('number');
    expect(typeof statusRes.body.deadLetterCount).toBe('number');

    // 8b. POST /override with host token fails with 403 Forbidden
    const hostOverrideRes = await request(app)
      .post('/api/marketing/v2/circuit-breaker/override/some-event-id')
      .set('x-test-user-id', String(HOST_ID))
      .set('x-test-user-role', 'host')
      .send({ reason: 'Host trying to unpause themselves' });

    expect(hostOverrideRes.status).toBe(403);

    // 8c. POST /dlq/:id/resolve with admin token resolves DLQ item
    const dlqItem = (await fixture.pool.query('SELECT id FROM dead_letter_queue LIMIT 1')).rows[0];
    if (dlqItem) {
      const resolveRes = await request(app)
        .post(`/api/marketing/v2/circuit-breaker/dlq/${dlqItem.id}/resolve`)
        .set('x-test-user-id', String(ADMIN_ID))
        .set('x-test-user-role', 'admin')
        .send({ notes: 'Resolved by senior ops engineer' });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.resolved).toBe(true);
    }
  });
});
