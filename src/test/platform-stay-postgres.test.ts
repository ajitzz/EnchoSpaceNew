import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createStayCheckoutRouter } from '../server/stayCheckout';
import { createStayRecoveryRouter } from '../server/stayRecovery';
import { observeStayPayment } from '../server/stayPaymentObservation';

// Opt-in only: never consume DATABASE_URL or load dotenv. Only an explicitly
// named private temporary Unix socket is accepted. This test owns its whole DB.
const socket = process.env.ENCHO_STAY_TEST_SOCKET;
const safeSocket = socket && /^\/private\/tmp\/encho-stay-test\.[a-zA-Z0-9]+$/.test(socket);
describe.skipIf(!safeSocket)('Isolated PostgreSQL stay checkout', () => {
  const pool = new pg.Pool({ host: socket, port: 55439, user: 'encho_test', database: 'postgres', max: 8 });
  let router: ReturnType<typeof createStayCheckoutRouter>;
  const payments = new Map<string, any>();
  const gateway = { orders: { create: vi.fn(async (body: any) => ({ id: 'order_' + body.receipt, ...body })) }, payments: { fetch: vi.fn(async (id: string) => payments.get(id)) } };
  const selection = { listingId: '8', roomId: 'garden', moveInDate: '2090-04-01', checkOutDate: '2090-04-04', guests: 2 };
  beforeAll(async () => {
    const existing = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'");
    if (Number(existing.rows[0].count) !== 0) throw new Error('Refusing to initialize a non-empty database.');
    await pool.query(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE listings (id INTEGER PRIMARY KEY, title TEXT, currency TEXT, rooms JSONB);
      CREATE TABLE payment_settings (id INTEGER PRIMARY KEY, commission_rate NUMERIC, tax_rate NUMERIC, system_fee NUMERIC);
      CREATE TABLE calendar_prices (listing_id INTEGER, date_string TEXT, price NUMERIC, offer_id INTEGER, status TEXT);
      CREATE TABLE bookings (id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id),listing_id INTEGER REFERENCES listings(id),room_id TEXT,move_in_date TEXT,check_out_date TEXT,configuration TEXT,name TEXT,phone TEXT,total_rent NUMERIC,status TEXT,payment_gateway TEXT,payment_intent_id TEXT);
      INSERT INTO users VALUES (1),(2);
      INSERT INTO payment_settings VALUES (1,10,18,150);
      INSERT INTO listings VALUES (8,'Garden Stay','INR','[{"id":"garden","name":"Garden","price":1000,"capacity":2,"inventory_count":1,"inventory_source":"encho_allocation"}]');
    `);
    await pool.query(readFileSync(new URL('../../docs/migrations/20260909_stay_checkout.sql', import.meta.url), 'utf8'));
    await pool.query(readFileSync(new URL('../../docs/migrations/20260911_stay_payment_observations.sql', import.meta.url), 'utf8'));
    await pool.query('CREATE ROLE encho_guest NOLOGIN; GRANT SELECT ON stay_checkout_orders TO encho_guest');
    router = createStayCheckoutRouter({ pool, authenticate: (_req, _res, next) => next(), enabled: () => true, gateway: () => gateway, keyId: () => 'test-key', secret: () => 'test-secret' });
  });
  beforeEach(async () => {
    // Records remain append-only. Separate dates for each test avoid deleting them.
    selection.moveInDate = new Date(Date.UTC(2090, month++ - 1, 1)).toISOString().slice(0, 10);
    selection.checkOutDate = selection.moveInDate.slice(0, 8) + '04';
    gateway.orders.create.mockClear(); payments.clear();
  });
  let month = 4;
  afterAll(async () => { await pool.end(); });
  async function call(path: string, body: any, userId = 1, key?: string) {
    const handler: any = router.stack.find((s: any) => s.route?.path === path)!.route.stack[0].handle;
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
    await handler({ user: { id: userId }, body, get: () => key }, res, vi.fn());
    return res;
  }
  async function payload() {
    const q = await call('/quote', selection);
    expect(q.statusCode).toBe(200);
    return { ...selection, quoteHash: q.body.quoteHash, name: 'Test Guest', phone: '+919876543210' };
  }
  function verification(order: any, paymentId: string) {
    payments.set(paymentId, { id: paymentId, status: 'captured', order_id: order.order_id, amount: order.amount, currency: order.currency, amount_refunded: 0 });
    return { checkoutId: order.checkoutId, razorpay_payment_id: paymentId, razorpay_signature: createHmac('sha256', 'test-secret').update(order.order_id + '|' + paymentId).digest('hex') };
  }
  it('serializes competing guests so only one can reserve the last room', async () => {
    const p = await payload();
    const results = await Promise.all([call('/orders', p, 1, 'concurrent_guest_one'), call('/orders', p, 2, 'concurrent_guest_two')]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200,409]);
    expect(gateway.orders.create).toHaveBeenCalledTimes(1);
  });
  it('retries one idempotency key without creating another gateway order', async () => {
    const p = await payload();
    await Promise.all([call('/orders', p, 1, 'same_attempt_key_01'), call('/orders', p, 1, 'same_attempt_key_01')]);
    const retry = await call('/orders', p, 1, 'same_attempt_key_01');
    expect(retry.statusCode).toBe(200); expect(gateway.orders.create).toHaveBeenCalledTimes(1);
    const conflict = await call('/orders', { ...p, name: 'Changed Name' }, 1, 'same_attempt_key_01');
    expect(conflict.statusCode).toBe(409);
  });
  it('confirms one booking on repeated valid verification and denies another guest', async () => {
    const order = await call('/orders', await payload(), 1, 'verify_attempt_key_01');
    expect(order.statusCode).toBe(200);
    const v = verification(order.body, 'payment_captured_01');
    expect((await call('/verify', v, 2)).statusCode).toBe(404);
    const first = await call('/verify', v);
    expect(first.statusCode).toBe(200);
    const again = await call('/verify', v);
    expect(again.body.booking.id).toBe(first.body.booking.id);
    expect((await pool.query('SELECT count(*) FROM bookings WHERE payment_intent_id=$1', ['payment_captured_01'])).rows[0].count).toBe('1');
    expect(first.body.booking.check_out_date).toBe(selection.checkOutDate);
  });
  it('allows a new hold after expiry but does not oversell on late captured payment', async () => {
    const p = await payload();
    const first = await call('/orders', p, 1, 'expiry_attempt_key_01');
    expect(first.statusCode).toBe(200);
    await pool.query("UPDATE stay_checkout_orders SET expires_at=now()-interval '1 minute' WHERE id=$1", [first.body.checkoutId]);
    const second = await call('/orders', p, 2, 'expiry_attempt_key_02');
    expect(second.statusCode).toBe(200);
    const late = await call('/verify', verification(first.body, 'payment_late_01'));
    expect(late.statusCode).toBe(409); expect(late.body.code).toBe('SOLD_OUT');
  });
  it('never retries an unknown external order creation outcome', async () => {
    const p = await payload();
    gateway.orders.create.mockRejectedValueOnce(new Error('Gateway timeout'));
    expect((await call('/orders', p, 1, 'unknown_attempt_key_01')).statusCode).toBe(503);
    expect((await call('/orders', p, 1, 'unknown_attempt_key_01')).statusCode).toBe(409);
    expect(gateway.orders.create).toHaveBeenCalledTimes(1);
  });
  it('prevents audit event rewriting', async () => {
    await expect(pool.query("UPDATE stay_checkout_events SET event_type='REWRITTEN'")).rejects.toThrow('append-only');
  });
  it('records one immutable provider observation on concurrent retries without changing checkout', async () => {
    const order = await call('/orders', await payload(), 1, 'observation_fixture_01'); expect(order.statusCode).toBe(200);
    const fetchPayments = vi.fn(async () => ({ count: 1, items: [{ id: 'pay_observation', order_id: order.body.order_id, amount: order.body.amount, currency: order.body.currency, amount_refunded: 0, status: 'captured' }] }));
    const input = { checkoutId: order.body.checkoutId, operationId: randomUUID(), actorId: 2 };
    const results = await Promise.all([observeStayPayment({ pool, fetchPayments }, input), observeStayPayment({ pool, fetchPayments }, input)]);
    expect(results.map(result => result.id)).toEqual([input.operationId,input.operationId]);
    expect((await pool.query('SELECT state FROM stay_checkout_orders WHERE id=$1', [input.checkoutId])).rows[0].state).toBe('ready');
    expect((await pool.query('SELECT * FROM stay_payment_observations WHERE checkout_id=$1', [input.checkoutId])).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM stay_checkout_events WHERE checkout_id=$1 AND event_type='PROVIDER_PAYMENT_OBSERVED'", [input.checkoutId])).rowCount).toBe(1);
    await expect(pool.query("UPDATE stay_payment_observations SET classification='no_capture_observed'")).rejects.toThrow('append-only');
  });
  it('keeps missing-order recovery explicit and blocks provider calls without a persisted order', async () => {
    const checkoutId = (await pool.query("SELECT id FROM stay_checkout_orders WHERE state='review' LIMIT 1")).rows[0].id;
    const fetchPayments = vi.fn();
    await expect(observeStayPayment({ pool, fetchPayments }, { checkoutId, operationId: randomUUID(), actorId: 2 })).rejects.toThrow('Stored provider order is missing');
    expect(fetchPayments).not.toHaveBeenCalled();
  });
  it('returns the real Admin recovery queue and denies guest access', async () => {
    const recovery = createStayRecoveryRouter({ pool, authenticate: (_req,_res,next) => next(), enabled: () => true });
    const handler: any = recovery.stack.find((s: any) => s.route?.path === '/')!.route.stack[0].handle;
    const response = () => ({ code: 200, body: null as any, status(code: number) { this.code=code; return this; }, json(body: any) { this.body=body; return this; } });
    const denied = response(); await handler({ user: { id: 1, role: 'guest' }, query: {} }, denied); expect(denied.code).toBe(403);
    const admin = response(); await handler({ user: { id: 2, role: 'admin' }, query: {} }, admin); expect(admin.code).toBe(200);
    expect(admin.body.orders.some((order: any) => order.state === 'review')).toBe(true);
    expect(admin.body.orders.every((order: any) => !('guest_phone' in order) && !('quote' in order))).toBe(true);
  });
  it('enforces row visibility under an unprivileged database role', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE encho_guest');
      await client.query("SELECT set_config('app.current_user_id','1',true),set_config('app.bypass_rls','false',true)");
      const rows = (await client.query('SELECT user_id FROM stay_checkout_orders')).rows;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.user_id === 1)).toBe(true);
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });
  it('reads scoped observation and event history with real pagination and no state changes', async () => {
    const order = await call('/orders', await payload(), 1, 'detail_fixture_01'); expect(order.statusCode).toBe(200);
    const checkoutId = order.body.checkoutId;
    for (let index = 0; index < 21; index++) {
      await pool.query(`INSERT INTO stay_payment_observations(id,checkout_id,actor_id,provider_order_id,classification,payments,observed_at)
        VALUES($1,$2,2,$3,'no_capture_observed','[]',clock_timestamp())`, [randomUUID(), checkoutId, order.body.order_id]);
    }
    await pool.query("INSERT INTO stay_checkout_events(checkout_id,actor_id,event_type) SELECT $1,2,'DETAIL_TEST' FROM generate_series(1,51)", [checkoutId]);
    const recovery = createStayRecoveryRouter({ pool, authenticate: (_req,_res,next) => next(), enabled: () => true });
    const handler: any = recovery.stack.find((s: any) => s.route?.path === '/:checkoutId')!.route.stack[0].handle;
    async function detail(id: string, query = {}, role = 'admin') {
      const res = { code: 200, body: null as any, setHeader: vi.fn(), status(code: number) { this.code=code; return this; }, json(body: any) { this.body=body; return this; } };
      await handler({ user: { id: 2, role }, params: { checkoutId: id }, query }, res); return res;
    }
    const first = await detail(checkoutId); expect(first.code).toBe(200);
    expect(first.body.observations).toHaveLength(20); expect(first.body.events).toHaveLength(50);
    expect(JSON.stringify(first.body)).not.toMatch(/guest_phone|guest_name|quote|request_hash|idempotency_key/);
    const second = await detail(checkoutId, { observationBefore: first.body.nextObservationCursor, eventBefore: first.body.nextEventCursor });
    expect(second.code).toBe(200); expect(second.body.observations).toHaveLength(1); expect(second.body.nextObservationCursor).toBeNull();
    expect(second.body.events.length).toBeGreaterThan(0); expect(second.body.nextEventCursor).toBeNull();
    expect(second.body.events.every((event: any) => !first.body.events.some((prior: any) => prior.id === event.id))).toBe(true);
    const other = (await pool.query('SELECT id FROM stay_checkout_orders WHERE id<>$1 LIMIT 1', [checkoutId])).rows[0].id;
    expect((await detail(other, { observationBefore: first.body.nextObservationCursor })).code).toBe(400);
    expect((await detail(other, { eventBefore: first.body.nextEventCursor })).code).toBe(400);
    expect((await detail(checkoutId, {}, 'host')).code).toBe(403);
    expect((await detail(randomUUID())).code).toBe(404);
    expect((await pool.query('SELECT state FROM stay_checkout_orders WHERE id=$1', [checkoutId])).rows[0].state).toBe('ready');
  });
  it.each(['stock', 'source', 'calendar'])('rejects capture when %s changes during provider verification', async change => {
    const order = await call('/orders', await payload(), 1, `fulfillment_change_${change}`); expect(order.statusCode).toBe(200);
    const paymentId = `payment_changed_${change}`;
    const v = verification(order.body, paymentId);
    gateway.payments.fetch.mockImplementationOnce(async () => {
      if (change === 'calendar') await pool.query("INSERT INTO calendar_prices(listing_id,date_string,status) VALUES(8,$1,'blocked')", [selection.moveInDate]);
      else await pool.query("UPDATE listings SET rooms=jsonb_set(rooms,$1::text[],$2::jsonb) WHERE id=8", [change === 'stock' ? ['0','inventory_count'] : ['0','inventory_source'], change === 'stock' ? '0' : '"external_sync"']);
      return payments.get(paymentId);
    });
    try {
      const result = await call('/verify', v); expect(result.statusCode).toBe(409);
      expect(result.body.code).toBe(change === 'stock' ? 'SOLD_OUT' : change === 'source' ? 'INVENTORY_REVIEW' : 'DATES_UNAVAILABLE');
      expect((await pool.query('SELECT count(*) FROM bookings WHERE payment_intent_id=$1', [paymentId])).rows[0].count).toBe('0');
      expect((await pool.query('SELECT state FROM stay_checkout_orders WHERE id=$1', [order.body.checkoutId])).rows[0].state).toBe('ready');
    } finally {
      await pool.query(`UPDATE listings SET rooms=jsonb_set(jsonb_set(rooms,'{0,inventory_count}','1'),'{0,inventory_source}','"encho_allocation"') WHERE id=8`);
    }
  });
  it.each(['quote', 'amount', 'refund', 'payment_identity'])('rejects %s mismatch at the locked capture boundary', async change => {
    const order = await call('/orders', await payload(), 1, `capture_contract_${change}`); expect(order.statusCode).toBe(200);
    const paymentId = `payment_contract_${change}`;
    const v = verification(order.body, paymentId);
    gateway.payments.fetch.mockImplementationOnce(async () => {
      if (change === 'quote') await pool.query("UPDATE stay_checkout_orders SET quote=jsonb_set(quote,'{roomId}','\"different-room\"') WHERE id=$1", [order.body.checkoutId]);
      if (change === 'amount') await pool.query('UPDATE stay_checkout_orders SET total_minor=total_minor+1 WHERE id=$1', [order.body.checkoutId]);
      return { ...payments.get(paymentId), ...(change === 'refund' ? { amount_refunded: 1 } : {}), ...(change === 'payment_identity' ? { id: 'different-payment' } : {}) };
    });
    const result = await call('/verify', v); expect(result.statusCode).toBe(409);
    expect(result.body.code).toBe(['quote','amount'].includes(change) ? 'CAPTURE_CONTRACT_REVIEW' : 'PAYMENT_REVIEW');
    expect((await pool.query('SELECT count(*) FROM bookings WHERE payment_intent_id=$1', [paymentId])).rows[0].count).toBe('0');
    expect((await pool.query("SELECT count(*) FROM stay_checkout_events WHERE checkout_id=$1 AND event_type='BOOKING_CONFIRMED'", [order.body.checkoutId])).rows[0].count).toBe('0');
    expect((await pool.query('SELECT state FROM stay_checkout_orders WHERE id=$1', [order.body.checkoutId])).rows[0].state).toBe('ready');
  });
});
