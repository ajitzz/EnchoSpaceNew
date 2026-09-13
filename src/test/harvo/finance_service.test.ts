import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { createLocalPostgresFixture } from './postgres.js';
import { authorizeSpending, MarketingFinanceService, type VerifiedCapture, type VerifiedCampaignSettlement, type VerifiedRefund } from '../../lib/marketing/financeService.js';
import { testPolicy, testQuoteInput } from './financeFixtures.js';

describe('M2 finance real PostgreSQL authority and concurrency', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>; let pool: pg.Pool;
  let admin: MarketingFinanceService; let host: MarketingFinanceService; let system: MarketingFinanceService;
  const verifyCapture = vi.fn(async (event: unknown) => event as VerifiedCapture);
  const verifySettlement = vi.fn(async (event: unknown) => event as VerifiedCampaignSettlement);
  const verifyRefund = vi.fn(async (event: unknown) => event as VerifiedRefund);
  beforeAll(async () => {
    fixture = await createLocalPostgresFixture(); pool = fixture.pool!;
    await pool.query('CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT NOT NULL)');
    await pool.query(readFileSync(new URL('../../migrations/009_harvo_marketing_finance.sql', import.meta.url), 'utf8'));
    admin = new MarketingFinanceService(pool, { actorContext: { id: 90, role: 'admin' } });
    host = new MarketingFinanceService(pool, { actorContext: { id: 10, role: 'host' } });
    system = new MarketingFinanceService(pool, { actorContext: { id: 90, role: 'system' }, fundingEnabled: true, verifyCapture, verifySettlement, verifyRefund });
  });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'marketing_finance_%'")).rows.map(row => `"${row.tablename}"`).join(',');
    await pool.query(`TRUNCATE ${tables},users,host_marketing_campaigns,listings CASCADE`);
    await pool.query("INSERT INTO users VALUES(10,'host'),(11,'host'),(90,'admin')");
    await pool.query("INSERT INTO listings VALUES(20,10,'Villa','villa','published'),(21,11,'Other','other','published')");
    await pool.query('INSERT INTO host_marketing_campaigns VALUES(1,10,20),(2,10,20),(3,11,21)');
    await admin.persistPolicy(testPolicy, 90);
    verifyCapture.mockImplementation(async event => event as VerifiedCapture); verifySettlement.mockImplementation(async event => event as VerifiedCampaignSettlement); verifyRefund.mockImplementation(async event => event as VerifiedRefund);
  });
  const quote = async (key = 'quote-1', campaignId = 1) => host.quote(testQuoteInput({ idempotencyKey: key, campaignId }), testPolicy);
  const captureEvent = (quoteId: string, extra: Partial<VerifiedCapture> = {}): VerifiedCapture => ({ provider: 'RAZORPAY', accountId: 'verified-merchant', eventId: 'event-1', paymentId: 'payment-1', orderId: 'order-1', quoteId, currency: 'INR', amountMinor: '105000', payloadHash: 'a'.repeat(64), capturedAt: '2026-01-01T00:00:00.000Z', ...extra });
  const funded = async () => { const q = await quote(); const event = captureEvent(q.id); const capture = await system.recordVerifiedCapture(event); return { q, event, capture }; };
  const reserved = async () => { const f = await funded(); const r = await host.reserve({ quoteId: f.q.id, hostId: 10, idempotencyKey: 'reserve-1' }); return { ...f, r }; };
  const settlement = (reservationId: string, extra: Partial<VerifiedCampaignSettlement> = {}): VerifiedCampaignSettlement => ({ reservationId, evidenceId: 'settlement-1', evidenceHash: 'b'.repeat(64), costs: testQuoteInput().costs, closedAuthorizations: [], remittanceTaxMinor: '0', finalAt: '2026-09-13T00:00:00.000Z', ...extra });
  const balance = async () => (await pool.query('SELECT available_minor,reserved_minor,refund_pending_minor,frozen FROM marketing_finance_accounts WHERE host_id=10 AND currency=$1', ['INR'])).rows[0];
  const authorize = async (reservationId: string, extra = {}) => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query("SELECT set_config('app.marketing_admin','true',true)"); const result = await authorizeSpending(client, { reservationId, campaignId: 1, hostId: 10, revision: 'revision-1', provider: 'GOOGLE', accountId: 'google-serving-account', amountMinor: '40000', idempotencyKey: 'authorize-google', ...extra }); await client.query('COMMIT'); return result; }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  };

  it('requires actual admin identity for immutable policy versions', async () => {
    await expect(host.persistPolicy(testPolicy, 90)).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' });
    await expect(admin.persistPolicy({ ...testPolicy, markupMaxBps: 400 }, 90)).rejects.toMatchObject({ code: 'FINANCE_POLICY_IMMUTABLE' });
    await expect(pool.query("UPDATE marketing_finance_policies SET currency='USD'")).rejects.toThrow(/IMMUTABLE/);
  });
  it('enforces host and property ownership and immutable quote idempotency', async () => {
    const first = await quote(); expect((await quote()).id).toBe(first.id);
    await expect(host.quote(testQuoteInput({ campaignId: 3, hostId: 11, listingId: 21 }), testPolicy)).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' });
    await expect(host.quote(testQuoteInput({ markupBps: 300 }), testPolicy)).rejects.toMatchObject({ code: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    await expect(pool.query('DELETE FROM marketing_finance_quotes')).rejects.toThrow(/IMMUTABLE/);
  });
  it('never accepts client payment success without configured verification', async () => {
    await expect(host.recordVerifiedCapture({ verified: true })).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' });
    await expect(admin.recordVerifiedCapture({ verified: true })).rejects.toMatchObject({ code: 'FINANCE_FUNDING_DISABLED' });
    const q = await quote(); verifyCapture.mockRejectedValueOnce(new Error('invalid signature'));
    await expect(system.recordVerifiedCapture(captureEvent(q.id))).rejects.toThrow(/invalid signature/);
    expect((await pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
  });
  it('credits one captured payment once under concurrent webhook delivery', async () => {
    const q = await quote(); const event = captureEvent(q.id);
    const results = await Promise.all(Array.from({ length: 20 }, () => system.recordVerifiedCapture(event)));
    expect(results.filter(r => !r.idempotent)).toHaveLength(1);
    expect(await balance()).toMatchObject({ available_minor: '105000', reserved_minor: '0' });
    expect((await pool.query('SELECT * FROM marketing_finance_journals')).rows).toHaveLength(1);
    await expect(system.recordVerifiedCapture({ ...event, payloadHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'FINANCE_IDEMPOTENCY_CONFLICT' });
  });
  it('deduplicates distinct event IDs for the same payment and quarantines distinct double payments', async () => {
    const { event } = await funded();
    expect((await system.recordVerifiedCapture({ ...event, eventId: 'event-2', payloadHash: 'c'.repeat(64) })).idempotent).toBe(true);
    expect((await system.recordVerifiedCapture({ ...event, eventId: 'event-3', paymentId: 'payment-2', payloadHash: 'd'.repeat(64) })).requiresReview).toBe(true);
    expect(await balance()).toMatchObject({ available_minor: '210000', frozen: true });
    await expect(host.reserve({ quoteId: event.quoteId, hostId: 10, idempotencyKey: 'reserve' })).rejects.toMatchObject({ code: 'FINANCE_ACCOUNT_FROZEN' });
  });
  it.each([{ amountMinor: '104999' }, { currency: 'USD' }, { capturedAt: '2099-01-01T00:00:00.000Z' }])('rejects mismatched or invalid capture %j', async extra => {
    const q = await quote(); await expect(system.recordVerifiedCapture(captureEvent(q.id, extra as any))).rejects.toMatchObject({ code: 'FINANCE_CAPTURE_MISMATCH' });
    expect((await pool.query('SELECT * FROM marketing_finance_journals')).rows).toHaveLength(0);
  });
  it('prevents two campaigns from reserving the same host funding concurrently', async () => {
    const { q } = await funded(); const other = await quote('quote-2', 2);
    const outcomes = await Promise.allSettled([host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'reserve-1' }), host.reserve({ quoteId: other.id, hostId: 10, idempotencyKey: 'reserve-2' })]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect(await balance()).toMatchObject({ available_minor: '0', reserved_minor: '105000' });
  });
  it('makes concurrent reservation retries replay one journal', async () => {
    const { q } = await funded(); const responses = await Promise.all(Array.from({ length: 12 }, () => host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'reserve-1' })));
    expect(new Set(responses.map(r => r.reservationId)).size).toBe(1);
    expect((await pool.query("SELECT * FROM marketing_finance_journals WHERE kind='RESERVE'")).rows).toHaveLength(1);
  });
  it('keeps a capture accepted before expiry reservable when its webhook arrives after quote expiry', async () => {
    const q = await host.quote(testQuoteInput({ expiresAt: new Date(Date.now() + 700).toISOString() }), testPolicy);
    const capturedAt = new Date().toISOString();
    await pool.query('SELECT pg_sleep(0.8)');
    const result = await system.recordVerifiedCapture(captureEvent(q.id, { capturedAt }));
    expect(result.requiresReview).toBe(false);
    expect((await host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'accepted-expired' })).status).toBe('RESERVED');
    expect(await balance()).toMatchObject({ available_minor: '0', reserved_minor: '105000', frozen: false });
  });
  it('does not let a different quote balance authorize an expired unfunded quote', async () => {
    await funded();
    const q = await host.quote(testQuoteInput({ campaignId: 2, idempotencyKey: 'other-expiring', expiresAt: new Date(Date.now() + 500).toISOString() }), testPolicy);
    await pool.query('SELECT pg_sleep(0.6)');
    await expect(host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'expired-unaccepted' })).rejects.toMatchObject({ code: 'FINANCE_QUOTE_EXPIRED' });
    expect(await balance()).toMatchObject({ available_minor: '105000', reserved_minor: '0' });
  });
  it('journals late actual capture as received cash but freezes spending for quote acceptance review', async () => {
    const q = await host.quote(testQuoteInput({ expiresAt: new Date(Date.now() + 500).toISOString() }), testPolicy);
    await pool.query('SELECT pg_sleep(0.6)');
    expect((await system.recordVerifiedCapture(captureEvent(q.id, { capturedAt: new Date().toISOString() }))).requiresReview).toBe(true);
    expect(await balance()).toMatchObject({ available_minor: '105000', reserved_minor: '0', frozen: true });
    await expect(host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'late-capture' })).rejects.toMatchObject({ code: 'FINANCE_ACCOUNT_FROZEN' });
  });
  it('does not revive expired terms using other campaign money after the accepted capture is allocated for refund', async () => {
    const q = await host.quote(testQuoteInput({ expiresAt: new Date(Date.now() + 700).toISOString() }), testPolicy);
    const captured = await system.recordVerifiedCapture(captureEvent(q.id, { capturedAt: new Date().toISOString() }));
    await host.requestRefund({ captureId: captured.captureId, hostId: 10, amountMinor: '105000', idempotencyKey: 'refund-expiring-quote' });
    const next = await quote('other-funded-quote', 2);
    await system.recordVerifiedCapture(captureEvent(next.id, { eventId: 'other-event', paymentId: 'other-payment', orderId: 'other-order', capturedAt: new Date().toISOString() }));
    await pool.query('SELECT pg_sleep(0.8)');
    await expect(host.reserve({ quoteId: q.id, hostId: 10, idempotencyKey: 'revive-expired' })).rejects.toMatchObject({ code: 'FINANCE_QUOTE_EXPIRED' });
    expect(await balance()).toMatchObject({ available_minor: '105000', reserved_minor: '0', refund_pending_minor: '105000' });
  });
  it('rolls back a reservation and its journal with the caller workflow transaction', async () => {
    const { q } = await funded(); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id','10',true)");
      await host.reserveInTransaction(client, { quoteId: q.id, hostId: 10, idempotencyKey: 'workflow-rollback' });
      await client.query('ROLLBACK');
    } finally { client.release(); }
    expect(await balance()).toMatchObject({ available_minor: '105000', reserved_minor: '0' });
    expect((await pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM marketing_finance_journals WHERE kind='RESERVE'")).rows).toHaveLength(0);
  });
  it('requires risk delay, exact revision and per-provider allocation before spend authorization', async () => {
    const { r } = await reserved();
    await expect(authorize(r.reservationId, { amountMinor: '40001' })).rejects.toMatchObject({ code: 'FINANCE_OVERSPEND' });
    await expect(authorize(r.reservationId, { revision: 'wrong' })).rejects.toMatchObject({ code: 'FINANCE_AUTHORIZATION_BLOCKED' });
    const auth = await authorize(r.reservationId); expect((await authorize(r.reservationId)).authorizationId).toBe(auth.authorizationId);
    await pool.query("UPDATE marketing_finance_reservations SET risk_release_at=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE id=$1", [r.reservationId]);
    await expect(authorize(r.reservationId)).rejects.toMatchObject({ code: 'FINANCE_AUTHORIZATION_BLOCKED' });
  });
  it('settles exact costs and markup without manufacturing host funds', async () => {
    const { r } = await reserved(); const result = await system.reconcile(settlement(r.reservationId));
    expect(result).toMatchObject({ chargedCostMinor: '100000', profitMinor: '5000', returnedMinor: '0', platformOverrunMinor: '0' });
    expect(await balance()).toMatchObject({ available_minor: '0', reserved_minor: '0' });
    expect((await system.reconcile(settlement(r.reservationId))).idempotent).toBe(true);
  });
  it('requires closure of every authorization before refunding unused media', async () => {
    const { r } = await reserved(); const authorization = await authorize(r.reservationId);
    const evidence = settlement(r.reservationId, { costs: testQuoteInput().costs.map(line => ({ ...line, amountMinor: '0' })) });
    await expect(system.release(evidence)).rejects.toMatchObject({ code: 'FINANCE_PROVIDER_FINALITY_REQUIRED' });
    evidence.closedAuthorizations = [{ authorizationId: authorization.authorizationId, provider: 'GOOGLE', accountId: 'google-serving-account' }];
    expect((await system.release(evidence)).returnedMinor).toBe('105000');
    await expect(authorize(r.reservationId)).rejects.toMatchObject({ code: 'FINANCE_AUTHORIZATION_BLOCKED' });
  });
  it('absorbs actual cost overruns without charging past individual host-approved costs', async () => {
    const { r } = await reserved(); const costs = testQuoteInput().costs.map(line => ({ ...line, amountMinor: line.code === 'META_MEDIA' ? '70000' : line.amountMinor }));
    expect(await system.reconcile(settlement(r.reservationId, { costs }))).toMatchObject({ actualCostMinor: '120000', chargedCostMinor: '100000', profitMinor: '5000', platformOverrunMinor: '20000', realizedCampaignContributionMinor: '-15000', returnedMinor: '0' });
    expect(await balance()).toMatchObject({ available_minor: '0', reserved_minor: '0' });
  });
  it('holds refunds pending provider outcome and processes successful duplicate confirmations once', async () => {
    const { event, capture } = await funded();
    const request = await host.requestRefund({ captureId: capture.captureId, hostId: 10, amountMinor: '100000', idempotencyKey: 'refund-1' });
    expect(await balance()).toMatchObject({ available_minor: '5000', refund_pending_minor: '100000' });
    const refund: VerifiedRefund = { ...event, refundRequestId: request.refundRequestId, externalRefundId: 'refund-provider-1', amountMinor: '100000', eventId: 'refund-event-1', status: 'SUCCEEDED' };
    expect((await system.recordVerifiedRefund(refund)).idempotent).toBe(false);
    expect((await system.recordVerifiedRefund(refund)).idempotent).toBe(true);
    expect(await balance()).toMatchObject({ available_minor: '5000', refund_pending_minor: '0' });
  });
  it('restores a definitively failed refund and rejects oversubscribed concurrent refunds', async () => {
    const { event, capture } = await funded();
    const requests = await Promise.allSettled(['refund-1', 'refund-2'].map(idempotencyKey => host.requestRefund({ captureId: capture.captureId, hostId: 10, amountMinor: '100000', idempotencyKey })));
    expect(requests.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const fulfilled = requests.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    await system.recordVerifiedRefund({ ...event, refundRequestId: fulfilled.value.refundRequestId, externalRefundId: 'failed-refund', amountMinor: '100000', eventId: 'refund-event', status: 'FAILED' });
    expect(await balance()).toMatchObject({ available_minor: '105000', refund_pending_minor: '0' });
  });
  it('rejects unbalanced/empty journals at PostgreSQL commit and direct cached balance changes', async () => {
    await funded(); const client = await pool.connect();
    try {
      await client.query('BEGIN'); const id = randomUUID();
      await client.query("INSERT INTO marketing_finance_journals(id,operation_key,fingerprint,kind,host_id,currency,reference_id) VALUES($1,'invalid',$2,'TEST',10,'INR',$1)", [id, 'f'.repeat(64)]);
      await expect(client.query('COMMIT')).rejects.toThrow(/UNBALANCED/);
    } finally { await client.query('ROLLBACK'); client.release(); }
    await expect(pool.query('UPDATE marketing_finance_accounts SET available_minor=available_minor+1')).rejects.toThrow(/BALANCE_DRIFT/);
    await expect(pool.query('UPDATE marketing_finance_lines SET amount_minor=1')).rejects.toThrow(/IMMUTABLE/);
  });
  it('isolates host snapshots and transaction-local role settings', async () => {
    await funded(); expect((await host.getSnapshot(1, 10)).balances[0].available_minor).toBe('105000');
    await expect(host.getSnapshot(3, 11)).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' });
    expect((await pool.query("SELECT current_setting('app.marketing_admin',true) AS admin")).rows[0].admin).not.toBe('true');
  });
  it('enforces FORCE RLS for an ordinary PostgreSQL role', async () => {
    await funded();
    await pool.query('DO $$ BEGIN CREATE ROLE harvo_finance_reader; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await pool.query('GRANT USAGE ON SCHEMA public TO harvo_finance_reader');
    await pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO harvo_finance_reader');
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE harvo_finance_reader');
      await client.query("SELECT set_config('app.current_user_id','11',true),set_config('app.marketing_admin','false',true)");
      expect((await client.query('SELECT * FROM marketing_finance_accounts')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM marketing_finance_lines')).rows).toHaveLength(0);
      await client.query("SELECT set_config('app.current_user_id','10',true)");
      expect((await client.query('SELECT * FROM marketing_finance_accounts')).rows).toHaveLength(1);
      expect((await client.query('SELECT * FROM marketing_finance_lines')).rows).toHaveLength(2);
      await client.query('COMMIT');
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  it('forces RLS on every financial table and grants no public table privileges', async () => {
    expect((await pool.query("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'marketing_finance_%' AND (NOT relrowsecurity OR NOT relforcerowsecurity)")).rows).toHaveLength(0);
    expect((await pool.query("SELECT c.relname,a.privilege_type FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname LIKE 'marketing_finance_%' AND a.grantee=0")).rows).toHaveLength(0);
  });
});
