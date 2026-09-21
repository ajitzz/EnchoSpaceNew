import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { createLocalPostgresFixture } from './postgres.js';
import { createConversionConsumer } from '../../lib/marketing/conversions/consumer.js';
import { CanonicalConversionProviders } from '../../lib/marketing/conversions/providers.js';
import { ConversionDeliveryStore } from '../../lib/marketing/conversions/store.js';
import { conversionJson } from '../../lib/marketing/conversions/http.js';
import type { VerifiedConversionAttribution, ConversionTransportOptions } from '../../lib/marketing/conversions/contracts.js';
import type { VerifiedCanonicalBooking, ConversionUpload } from '../../lib/marketing/measurement.js';
const now = new Date('2026-09-13T12:00:00Z');
const actor = { id: 90, role: 'system' as const };
const initial = (): VerifiedCanonicalBooking => ({ authority: 'CANONICAL_CHECKOUT', acceptanceReference: 'fixture-accepted-checkout', eventId: 'event-1', bookingId: 'booking-1', orderId: 'order-1', sequence: 1, state: 'CAPTURED', occurredAt: '2026-09-13T10:00:00Z', hostId: 10, listingId: 20, campaignId: 1, currency: 'INR', capturedMinor: '200000', refundedMinor: '0', captureEvidenceId: 'fixture-verified-capture', capturedAt: '2026-09-13T09:59:00Z', attribution: { provider: 'GOOGLE', externalCampaignId: 'customers/1234567890/campaigns/101', evidenceId: 'attr-1' }, consent: { recordId: 'consent-1', purpose: 'ADS_MEASUREMENT', status: 'GRANTED', recordedAt: '2026-09-13T09:58:00Z' } });
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const destination = { operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '1234567890' }, productDestinationId: '5001' };
const diagnostic = (status = 'SUCCESS', extra: Record<string, unknown> = {}) => ({ requestStatusPerDestination: [{ destination, requestStatus: status, eventsIngestionStatus: { recordCount: '1' }, ...extra }] });
describe('HARVO provider conversion delivery — real isolated PostgreSQL', () => {
  let pool: Pool, close: () => Promise<void>, current: VerifiedCanonicalBooking;
  let attribution: VerifiedConversionAttribution, sourceEvents: Map<string, VerifiedCanonicalBooking>;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>, requests: Array<{ url: string; body: any; init: RequestInit }>;
  let handler: (url: string, init: RequestInit) => Promise<Response>;
  let options: ConversionTransportOptions;
  const make = () => createConversionConsumer(pool, { ...options, actorContext: actor, verifyBooking: async request => request.kind === 'CURRENT' ? current : sourceEvents.get(request.reference)!, resolveAttribution: async () => attribution });
  const ingest = async () => { const consumer = make(); await consumer.ingest('source-1'); return consumer; };
  const rows = async () => (await pool.query('SELECT o.status AS outbox_status,o.error_code AS outbox_error,o.payload,d.* FROM marketing_conversion_outbox o LEFT JOIN marketing_conversion_deliveries d ON d.outbox_id=o.id ORDER BY o.created_at,o.id')).rows;
  const due = () => pool.query("UPDATE marketing_conversion_deliveries SET next_observation_at=now()-interval '1 second'");
  const advance = async (patch: Partial<VerifiedCanonicalBooking>) => { current = { ...current, ...patch, sequence: current.sequence + 1, eventId: `event-${current.sequence + 1}` }; sourceEvents.set('next', current); await make().ingest('next'); };
  const acceptGoogle = async () => { const consumer = await ingest(); await consumer.runOnce(); await due(); await consumer.runOnce(); expect((await rows())[0].outbox_status).toBe('ACCEPTED'); return consumer; };
  const meta = async () => {
    current.attribution = { ...current.attribution, provider: 'META', externalCampaignId: '101' }; sourceEvents.set('source-1', current);
    attribution = { ...attribution, provider: 'META', externalCampaignId: '101', google: undefined, meta: { pixelId: '6001', eventSourceUrl: 'https://stays.example/stay/fixture', fbc: 'fb.1.1789293480000.FIXTURE_CLICK', userAgent: 'Fixture browser' } };
    await pool.query("UPDATE provider_entities SET provider='META',external_id='101',account_id='7001'");
    handler = async () => response({ events_received: 1, fbtrace_id: 'meta-fixture-receipt' });
  };
  beforeAll(async () => { ({ pool, close } = await createLocalPostgresFixture());
    await pool.query("ALTER TABLE listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'");
    for (const name of ['011_harvo_marketing_measurement.sql', '013_harvo_marketing_conversion_delivery.sql']) await pool.query(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  });
  afterAll(async () => { await close?.(); });
  beforeEach(async () => {
    await pool.query('TRUNCATE marketing_conversion_delivery_events,marketing_conversion_deliveries,marketing_conversion_outbox,marketing_measurement_events,marketing_booking_measurements,provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings RESTART IDENTITY CASCADE');
    await pool.query("INSERT INTO listings(id,user_id,title,slug,publication_status) VALUES(20,10,'Fixture','fixture','published'),(21,11,'Other','other','published')");
    await pool.query('INSERT INTO host_marketing_campaigns VALUES(1,10,20),(2,11,21)');
    await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status) VALUES(1,'GOOGLE','CAMPAIGN','customers/1234567890/campaigns/101','1234567890','PAUSED','UNKNOWN')");
    current = initial(); sourceEvents = new Map([['source-1', current]]);
    attribution = { authority: 'CANONICAL_ATTRIBUTION', evidenceId: 'attr-1', consentRecordId: 'consent-1', bookingId: 'booking-1', orderId: 'order-1', campaignId: 1, hostId: 10, listingId: 20, provider: 'GOOGLE', externalCampaignId: current.attribution.externalCampaignId, consent: { measurement: 'GRANTED', adUserData: 'GRANTED', adPersonalization: 'DENIED', recordedAt: current.consent.recordedAt }, google: { customerId: '1234567890', conversionActionId: '5001', gclid: 'FIXTURE_PRIVATE_CLICK' } };
    requests = []; handler = async url => url.includes('requestStatus') ? response(diagnostic()) : response({ requestId: 'google-fixture-request' });
    fetcher = vi.fn(async (input, init: RequestInit = {}) => { const url = String(input); requests.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, init }); return handler(url, init); });
    options = { now: () => now, fetch: fetcher, timeoutMs: 500, google: { customerId: '1234567890', servingCustomerId: '1234567890', conversionActionId: '5001', accessToken: async () => 'fixture-google-token' }, meta: { pixelId: '6001', accessToken: 'fixture-meta-token', allowedOrigins: ['https://stays.example'] } };
  });
  it('exposes missing canonical/legal and consent authority without touching providers', async () => {
    const consumer = createConversionConsumer(pool, { ...options, actorContext: actor });
    expect(await consumer.runOnce()).toMatchObject({ blocked: true, blockers: ['CANONICAL_CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED', 'CANONICAL_ATTRIBUTION_CONSENT_AUTHORITY_REQUIRED'] });
    await expect(consumer.ingest('legacy-confirmed-row')).rejects.toMatchObject({ code: 'CANONICAL_CHECKOUT_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('commits the owned intent before Google HTTP and waits for destination-specific processing', async () => {
    handler = async url => { if (!url.includes('requestStatus')) { expect((await rows())[0]).toMatchObject({ status: 'CLAIMED', outbox_status: 'DISPATCHING' }); return response({ requestId: 'google-fixture-request' }); } return response(diagnostic()); };
    const consumer = await ingest(); const first = await consumer.runOnce();
    expect(first.dispatch).toMatchObject({ accepted: 0, unknown: 1 }); expect((await rows())[0]).toMatchObject({ status: 'PROCESSING', outbox_status: 'UNKNOWN' });
    expect(requests[0].url).toBe('https://datamanager.googleapis.com/v1/events:ingest');
    expect(requests[0].body.events[0]).toMatchObject({ transactionId: 'order-1', eventTimestamp: current.capturedAt, conversionValue: 2000, currency: 'INR', consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_DENIED' } });
    await due(); expect(await consumer.runOnce()).toMatchObject({ reconciled: 1, observed: 1 });
    expect((await rows())[0]).toMatchObject({ status: 'ACCEPTED', outbox_status: 'ACCEPTED', provider_receipt: 'google-fixture-request' });
    const evidence = JSON.stringify((await pool.query('SELECT * FROM marketing_conversion_delivery_events')).rows) + JSON.stringify(await rows());
    expect(evidence).not.toContain('FIXTURE_PRIVATE_CLICK'); expect(evidence).not.toContain('fixture-google-token');
  });
  it('sends once under twelve competing consumers and does not replay accepted purchases', async () => {
    const consumer = await ingest(); await Promise.all(Array.from({ length: 12 }, () => consumer.runOnce()));
    expect(requests.filter(x => x.init.method === 'POST')).toHaveLength(1);
    await due(); await consumer.runOnce(); await consumer.runOnce(); expect(requests.filter(x => x.init.method === 'POST')).toHaveLength(1);
  });
  it('polls processing receipts without resending the event', async () => {
    handler = async url => url.includes('requestStatus') ? response(diagnostic('PROCESSING')) : response({ requestId: 'google-fixture-request' });
    const consumer = await ingest(); await consumer.runOnce(); await due(); await consumer.runOnce();
    expect((await rows())[0]).toMatchObject({ status: 'PROCESSING', outbox_status: 'UNKNOWN' }); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it.each([
    ['missing receipt', () => response({})], ['invalid receipt', () => response({ requestId: 'email@example.com' })],
    ['server error', () => response({ error: { code: 500 } }, 500)], ['lost response', () => { throw new Error('fixture-token and private click must not be persisted'); }],
  ])('quarantines %s without automatic write retry', async (_name, reply) => {
    handler = async () => reply(); const consumer = await ingest(); await consumer.runOnce(); await due(); await consumer.runOnce();
    expect((await rows())[0]).toMatchObject({ status: 'UNKNOWN', outbox_status: 'UNKNOWN' }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('records a definitive provider rejection instead of a successful upload', async () => {
    handler = async () => response({ error: { code: 400, message: 'Private raw value omitted from evidence' } }, 400);
    const consumer = await ingest(); await consumer.runOnce(); expect((await rows())[0]).toMatchObject({ status: 'REJECTED', outbox_status: 'REJECTED', error_code: 'PROVIDER_HTTP_400' });
  });
  it.each([
    ['foreign destination', diagnostic('SUCCESS', { destination: { ...destination, productDestinationId: '9999' } }), 'UNKNOWN'],
    ['wrong count', diagnostic('SUCCESS', { eventsIngestionStatus: { recordCount: '2' } }), 'UNKNOWN'],
    ['partial success', diagnostic('PARTIAL_SUCCESS'), 'UNKNOWN'],
    ['failed record', diagnostic('FAILED', { errorInfo: { errorCounts: [{ reason: 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID', recordCount: '1' }] } }), 'REJECTED'],
  ])('handles %s without blanket acceptance', async (_name, data, expected) => {
    const consumer = await ingest(); await consumer.runOnce(); handler = async () => response(data); await due(); await consumer.runOnce();
    expect((await rows())[0].outbox_status).toBe(expected); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it('retains a processing receipt across temporarily unavailable diagnostics', async () => {
    const consumer = await ingest(); await consumer.runOnce(); handler = async () => response({ error: {} }, 503); await due(); await consumer.runOnce();
    expect((await rows())[0].status).toBe('PROCESSING'); handler = async () => response(diagnostic()); await due(); await consumer.runOnce(); expect((await rows())[0].outbox_status).toBe('ACCEPTED');
  });
  it.each(['DENIED', 'REVOKED', 'UNKNOWN'] as const)('does not promote %s user-data consent', async consent => {
    attribution.consent.adUserData = consent; const consumer = await ingest(); await consumer.runOnce();
    expect((await rows())[0].outbox_error).toBe('CONVERSION_CONSENT_REQUIRED'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('suppresses revoked canonical consent before invoking the attribution resolver', async () => {
    const consumer = await ingest(); current = { ...current, consent: { ...current.consent, status: 'REVOKED' } }; await consumer.runOnce();
    expect((await rows())[0].outbox_status).toBe('SUPPRESSED'); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['hostId', 'campaignId', 'listingId', 'orderId', 'consentRecordId'] as const)('rejects a changed %s attribution binding', async key => {
    (attribution as any)[key] = typeof attribution[key] === 'number' ? 999 : 'foreign'; const consumer = await ingest(); await consumer.runOnce();
    expect((await rows())[0].outbox_error).toBe('ATTRIBUTION_BINDING_MISMATCH'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects extra raw contact information rather than accepting arbitrary resolver fields', async () => {
    (attribution as any).email = 'must-not-send@example.com'; const consumer = await ingest(); await consumer.runOnce(); expect((await rows())[0].outbox_error).toBe('ATTRIBUTION_EVIDENCE_INVALID'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires exactly one Google click identifier', async () => {
    attribution.google!.gbraid = 'SECOND_CLICK'; const consumer = await ingest(); await consumer.runOnce(); expect((await rows())[0].outbox_error).toBe('GOOGLE_CLICK_EVIDENCE_REQUIRED'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends Meta only the original captured event and requires a one-event receipt', async () => {
    await meta(); const consumer = await ingest(); await consumer.runOnce(); const payload = requests[0].body.data[0];
    expect(payload).toMatchObject({ event_name: 'Purchase', event_time: 1789293540, action_source: 'website', event_source_url: 'https://stays.example/stay/fixture', custom_data: { value: 2000, currency: 'INR', order_id: 'order-1' } });
    expect(payload.event_id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); expect(payload.opt_out).toBe(true); expect(payload.user_data).not.toHaveProperty('em'); expect((await rows())[0].outbox_status).toBe('ACCEPTED');
  });
  it.each([0, 2, null])('quarantines Meta events_received=%s', async count => {
    await meta(); handler = async () => response({ events_received: count, fbtrace_id: 'trace' }); const consumer = await ingest(); await consumer.runOnce(); expect((await rows())[0].outbox_status).toBe('UNKNOWN');
  });
  it('corrects internal booking truth without fabricating a Meta refund API', async () => {
    await meta(); const consumer = await ingest(); await consumer.runOnce(); await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await consumer.runOnce();
    expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_error).toBe('META_CORRECTION_REQUIRES_REMEDIATION'); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await consumer.measurement.bookingTruth(1, { id: 10, role: 'host' })).toMatchObject({ refundedMinor: '50000' });
  });
  it('restates and retracts accepted Google orders with strict response identities', async () => {
    const consumer = await acceptGoogle(); handler = async (_url, init) => { const a = JSON.parse(String(init.body)).conversionAdjustments[0]; return response({ results: [a] }, 200, { 'request-id': `adjust-${current.sequence}` }); };
    await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await consumer.runOnce();
    expect(requests.at(-1)!.body).toMatchObject({ partialFailure: true, conversionAdjustments: [{ orderId: 'order-1', adjustmentType: 'RESTATEMENT', restatementValue: { adjustedValue: 1500, currencyCode: 'INR' } }] });
    await advance({ refundedMinor: '200000', state: 'REFUNDED', occurredAt: '2026-09-13T11:30:00Z' }); await consumer.runOnce();
    expect(requests.at(-1)!.body.conversionAdjustments[0]).not.toHaveProperty('restatementValue'); expect((await rows()).every(r => r.outbox_status === 'ACCEPTED')).toBe(true);
  });
  it.each([0, 1])('maps only the exact Google failed adjustment index %s', async index => {
    const consumer = await acceptGoogle(); handler = async () => response({ partialFailureError: { code: 3, details: [{ errors: [{ location: { fieldPathElements: [{ fieldName: 'conversion_adjustments', index }] } }] }] }, results: [{}] });
    await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await consumer.runOnce();
    expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_status).toBe(index === 0 ? 'REJECTED' : 'UNKNOWN');
  });
  it('quarantines a foreign adjustment result', async () => {
    const consumer = await acceptGoogle(); handler = async (_url, init) => response({ results: [{ ...JSON.parse(String(init.body)).conversionAdjustments[0], orderId: 'foreign-order' }] }, 200, { 'request-id': 'trace' });
    await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await consumer.runOnce(); expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_status).toBe('UNKNOWN');
  });
  it('refuses adjustment destination changes after original acceptance', async () => {
    await acceptGoogle(); options.google!.conversionActionId = '5002'; attribution.google!.conversionActionId = '5002';
    await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await make().runOnce(); expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_error).toBe('CONVERSION_CORRECTION_SOURCE_REQUIRED'); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it('keeps a lost post-provider persistence result quarantined without another POST', async () => {
    const consumer = await ingest();
    const original = pool.connect.bind(pool); let failed = false;
    const spy = vi.spyOn(pool, 'connect').mockImplementation((async () => {
      const client = await original();
      return new Proxy(client, { get(target, key) {
        if (key === 'query') return async (sql: string, ...args: any[]) => {
          if (!failed && sql.startsWith('UPDATE marketing_conversion_deliveries SET status=')) { failed = true; throw new Error('Injected durable receipt write failure'); }
          return (target.query as any)(sql, ...args);
        };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as any);
    try { await consumer.runOnce(); } finally { spy.mockRestore(); }
    expect((await rows())[0]).toMatchObject({ status: 'CLAIMED', outbox_status: 'UNKNOWN', provider_receipt: null });
    await consumer.runOnce(); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it('does not turn conflicting Meta success/error evidence into an acknowledgement', async () => {
    await meta(); handler = async () => response({ events_received: 1, fbtrace_id: 'trace', error: { code: 100 } });
    const consumer = await ingest(); await consumer.runOnce(); expect((await rows())[0].outbox_status).toBe('UNKNOWN');
  });
  it('disables Meta optimization use unless separate personalization consent is granted', async () => {
    await meta(); attribution.consent.adPersonalization = 'GRANTED'; const consumer = await ingest(); await consumer.runOnce(); expect(requests[0].body.data[0].opt_out).toBe(false);
  });
  it('retains explicit wbraid correction limitations instead of making an unsupported request', async () => {
    attribution.google = { ...attribution.google!, gclid: undefined, wbraid: 'FIXTURE_WBRAID' };
    const consumer = await acceptGoogle(); await advance({ refundedMinor: '50000', occurredAt: '2026-09-13T11:00:00Z' }); await consumer.runOnce();
    expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_error).toBe('GOOGLE_WBRAID_ADJUSTMENT_UNSUPPORTED'); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it('never fabricates a later correction timestamp to evade provider deduplication', async () => {
    const consumer = await acceptGoogle();
    await advance({ refundedMinor: '50000', occurredAt: current.capturedAt }); await consumer.runOnce();
    expect((await rows()).find(r => r.payload.kind === 'RESTATEMENT').outbox_error).toBe('CONVERSION_TIME_INVALID'); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
  it('rejects Meta source URLs carrying private query data', async () => {
    await meta(); attribution.meta!.eventSourceUrl += '?email=private@example.com'; const consumer = await ingest(); await consumer.runOnce();
    expect((await rows())[0].outbox_error).toBe('CONVERSION_SOURCE_INVALID'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires an already committed outbox intent for direct delivery claims', async () => {
    await ingest(); const row = (await pool.query('SELECT * FROM marketing_conversion_outbox')).rows[0]; const item: ConversionUpload = { ...row.payload, id: row.id, idempotencyKey: `harvo:GOOGLE:${row.id}` };
    const store = new ConversionDeliveryStore(pool, actor), prepared = new CanonicalConversionProviders(options).prepare(item, attribution);
    await expect(store.claim(item, prepared)).rejects.toMatchObject({ code: 'CONVERSION_NOT_DISPATCHING' });
    await pool.query("UPDATE marketing_conversion_outbox SET status='DISPATCHING',attempts=1,dispatched_at=now() WHERE id=$1", [row.id]);
    expect(await store.claim(item, prepared)).toEqual({ claimed: true }); expect(await store.claim(item, prepared)).toMatchObject({ claimed: false, outcome: { status: 'UNKNOWN' } });
    await expect(store.claim({ ...item, hostId: 11 }, prepared)).rejects.toMatchObject({ code: 'CONVERSION_OUTBOX_BINDING_MISMATCH' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps evidence immutable and recovers only a stale local completion from verified receipts', async () => {
    await acceptGoogle(); await expect(pool.query("UPDATE marketing_conversion_deliveries SET destination='{}'::jsonb")).rejects.toThrow(/immutable/); await expect(pool.query('DELETE FROM marketing_conversion_delivery_events')).rejects.toThrow(/append-only/);
    await pool.query("UPDATE marketing_conversion_outbox SET status='DISPATCHING',dispatched_at=now()-interval '3 minutes'");
    const store = new ConversionDeliveryStore(pool, actor); expect(await store.synchronize(10)).toBe(1); expect((await rows())[0].outbox_status).toBe('ACCEPTED'); expect(requests.filter(r => r.init.method === 'POST')).toHaveLength(1);
  });
});
describe('provider transport deadlines and origin boundary', () => {
  it('refuses an arbitrary transport origin', async () => { const fetcher = vi.fn<typeof fetch>(); await expect(conversionJson(fetcher, 'https://attacker.invalid/events', {}, 10)).rejects.toThrow('INVALID_PROVIDER_ORIGIN'); expect(fetcher).not.toHaveBeenCalled(); });
  it('bounds a provider that never responds', async () => { const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {})); await expect(conversionJson(fetcher, 'https://datamanager.googleapis.com/v1/events:ingest', {}, 10)).rejects.toThrow('PROVIDER_DEADLINE'); });
  it('bounds a stalled response body', async () => { const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ start() {} }))); await expect(conversionJson(fetcher, 'https://datamanager.googleapis.com/v1/events:ingest', {}, 10)).rejects.toThrow('PROVIDER_DEADLINE'); });
  it('rejects oversized provider evidence', async () => { const fetcher = vi.fn<typeof fetch>(async () => response({ content: 'x'.repeat(140000) })); await expect(conversionJson(fetcher, 'https://datamanager.googleapis.com/v1/events:ingest', {}, 1000)).rejects.toThrow('PROVIDER_RESPONSE_TOO_LARGE'); });
});
