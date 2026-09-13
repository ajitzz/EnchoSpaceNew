import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { createLocalPostgresFixture } from './postgres.js';
import { MarketingMeasurementService, normalizeMarketingTelemetry, type VerifiedCanonicalBooking, type ConversionUpload, type ConversionUploadResult, type TelemetryInput } from '../../lib/marketing/measurement.js';
const now = new Date('2026-09-13T12:00:00Z');
const booking = (overrides: Partial<VerifiedCanonicalBooking> = {}): VerifiedCanonicalBooking => ({
    authority: 'CANONICAL_CHECKOUT', acceptanceReference: 'accepted-checkout-2026', eventId: 'event-1', bookingId: 'booking-1', orderId: 'order-1', sequence: 1, state: 'CAPTURED', occurredAt: '2026-09-13T10:00:00Z', hostId: 10, listingId: 20, campaignId: 1, currency: 'INR', capturedMinor: '200000', refundedMinor: '0', captureEvidenceId: 'verified-gateway-capture-1', capturedAt: '2026-09-13T09:59:00Z', attribution: { provider: 'GOOGLE', externalCampaignId: 'customers/1234567890/campaigns/101', evidenceId: 'consented-attribution-1' }, consent: { recordId: 'consent-1', purpose: 'ADS_MEASUREMENT', status: 'GRANTED', recordedAt: '2026-09-13T09:58:00Z' }, ...overrides,
});
describe('HARVO canonical measurement — isolated real PostgreSQL', () => {
    let pool: Pool, close: () => Promise<void>, current: VerifiedCanonicalBooking, events: Map<string, VerifiedCanonicalBooking>;
    let upload: ReturnType<typeof vi.fn<(items: readonly ConversionUpload[]) => Promise<readonly ConversionUploadResult[]>>>;
    let service: MarketingMeasurementService;
    beforeAll(async () => {
        ({ pool, close } = await createLocalPostgresFixture());
        await pool.query("ALTER TABLE listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'");
        await pool.query(readFileSync(new URL('../../migrations/011_harvo_marketing_measurement.sql', import.meta.url), 'utf8'));
    });
    afterAll(async () => { await close?.(); });
    beforeEach(async () => {
        await pool.query('TRUNCATE marketing_conversion_outbox,marketing_measurement_events,marketing_booking_measurements,provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings RESTART IDENTITY CASCADE');
        await pool.query("INSERT INTO listings(id,user_id,title,slug,publication_status) VALUES(20,10,'Property','property','published'),(21,11,'Other','other','published')");
        await pool.query('INSERT INTO host_marketing_campaigns VALUES(1,10,20),(2,11,21)');
        await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status) VALUES(1,'GOOGLE','CAMPAIGN','customers/1234567890/campaigns/101','1234567890','PAUSED','UNKNOWN')");
        current = booking();
        events = new Map([['source-1', current]]);
        upload = vi.fn(async (items) => items.map(item => ({ id: item.id, status: 'ACCEPTED' as const, receipt: `receipt:${item.id}` })));
        service = new MarketingMeasurementService(pool, { actorContext: { id: 90, role: 'system' }, now: () => now, verifyBooking: async (request) => request.kind === 'CURRENT' ? current : events.get(request.reference)!, uploader: upload });
    });
    const ingest = () => service.ingest('source-1');
    const advance = async (patch: Partial<VerifiedCanonicalBooking>) => {
        current = booking({ ...current, ...patch, eventId: `event-${current.sequence + 1}`, sequence: current.sequence + 1 });
        events.set('source-next', current);
        return service.ingest('source-next');
    };
    it('requires canonical verification and leaves conversion upload disabled by default', async () => {
        await expect(new MarketingMeasurementService(pool).ingest('source-1')).rejects.toMatchObject({ code: 'CANONICAL_CHECKOUT_REQUIRED' });
        await expect(new MarketingMeasurementService(pool).dispatch()).rejects.toMatchObject({ code: 'CONVERSION_UPLOAD_DISABLED' });
        expect((await pool.query('SELECT * FROM marketing_conversion_outbox')).rowCount).toBe(0);
    });
    it('records one exact paid order and durable conversion event without claiming attribution', async () => {
        const result = await ingest();
        expect(result.duplicate).toBe(false);
        const row = (await pool.query('SELECT * FROM marketing_conversion_outbox')).rows[0];
        expect(row).toMatchObject({ kind: 'PURCHASE', status: 'PENDING', attempts: 0, payload: { orderId: 'order-1', amountMinor: '200000', currency: 'INR', consentRecordId: 'consent-1', attributionEvidenceId: 'consented-attribution-1' } });
        expect(row.payload).not.toHaveProperty('email');
        expect(upload).not.toHaveBeenCalled();
        const truth = await service.bookingTruth(1, { id: 10, role: 'host' });
        expect(truth).toMatchObject({ capturedBookings: '1', fulfilledBookings: '0', capturedMinor: '200000', completeness: 'NOT_ESTABLISHED', scope: 'RECORDED_VERIFIED_EVENTS' });
    });
    it('deduplicates twelve concurrent notifications using the same canonical order/event', async () => {
        const results = await Promise.all(Array.from({ length: 12 }, () => ingest()));
        expect(results.filter(x => !x.duplicate)).toHaveLength(1);
        expect((await pool.query('SELECT * FROM marketing_conversion_outbox')).rowCount).toBe(1);
        expect((await pool.query('SELECT * FROM marketing_measurement_events')).rowCount).toBe(1);
    });
    it.each(['host', 'listing', 'providerCampaign', 'capture', 'refund', 'authority', 'missingConsent', 'currency', 'future'])('rejects invalid %s evidence before persistence', async (kind) => {
        const value: any = booking();
        if (kind === 'host')
            value.hostId = 11;
        if (kind === 'listing')
            value.listingId = 21;
        if (kind === 'providerCampaign')
            value.attribution.externalCampaignId = 'customers/1234567890/campaigns/999';
        if (kind === 'capture')
            value.capturedMinor = '0';
        if (kind === 'refund')
            value.refundedMinor = '200001';
        if (kind === 'authority')
            value.authority = 'LEGACY_CONFIRMED';
        if (kind === 'missingConsent')
            delete value.consent;
        if (kind === 'currency')
            value.currency = 'USD';
        if (kind === 'future')
            value.occurredAt = '2026-09-14T12:00:00Z';
        events.set('source-1', value);
        await expect(ingest()).rejects.toBeDefined();
        expect((await pool.query('SELECT * FROM marketing_booking_measurements')).rowCount).toBe(0);
    });
    it('rejects changed event identity and changed immutable order attribution', async () => {
        await ingest();
        events.set('source-1', booking({ capturedMinor: '199999' }));
        await expect(ingest()).rejects.toMatchObject({ code: 'MEASUREMENT_EVENT_CONFLICT' });
        events.set('source-1', booking({ eventId: 'new-event', sequence: 2, orderId: 'different-order' }));
        await expect(ingest()).rejects.toMatchObject({ code: 'BOOKING_BINDING_MISMATCH' });
    });
    it('rejects decreasing refunds and stale event sequence', async () => {
        await ingest();
        await advance({ refundedMinor: '10000' });
        await expect(advance({ refundedMinor: '0' })).rejects.toMatchObject({ code: 'MEASUREMENT_AMOUNT_CONFLICT' });
        events.set('source-1', booking({ eventId: 'late-event' }));
        await expect(ingest()).rejects.toMatchObject({ code: 'MEASUREMENT_SEQUENCE_CONFLICT' });
    });
    it('fulfilled truth advances without emitting a second purchase', async () => {
        await ingest();
        await service.dispatch();
        await advance({ state: 'FULFILLED' });
        expect((await pool.query('SELECT * FROM marketing_conversion_outbox')).rowCount).toBe(1);
        expect(await service.bookingTruth(1, { id: 10, role: 'host' })).toMatchObject({ capturedBookings: '1', fulfilledBookings: '1' });
    });
    it('serializes partial refund and cancellation adjustments after accepted purchase', async () => {
        await ingest();
        await service.dispatch();
        await advance({ refundedMinor: '50000' });
        await advance({ state: 'CANCELLED' });
        expect((await pool.query('SELECT kind FROM marketing_conversion_outbox ORDER BY created_at')).rows.map(x => x.kind)).toEqual(['PURCHASE', 'RESTATEMENT', 'RETRACTION']);
        await service.dispatch();
        expect(upload.mock.calls[1][0]).toMatchObject([{ kind: 'RESTATEMENT', orderId: 'order-1', amountMinor: '150000' }]);
        await service.dispatch();
        expect(upload.mock.calls[2][0]).toMatchObject([{ kind: 'RETRACTION', orderId: 'order-1', amountMinor: '0' }]);
        expect(await service.bookingTruth(1, { id: 10, role: 'host' })).toMatchObject({ capturedBookings: '1', cancelledBookings: '1', capturedMinor: '200000', refundedMinor: '50000' });
    });
    it('suppresses a cancelled order before any purchase upload', async () => {
        await ingest();
        await advance({ state: 'CANCELLED' });
        await service.dispatch();
        expect(upload).not.toHaveBeenCalled();
        expect((await pool.query('SELECT status FROM marketing_conversion_outbox')).rows).toEqual([{ status: 'SUPPRESSED' }]);
    });
    it('does not create a purchase for consent denied or an already fully refunded order', async () => {
        current = booking({ consent: { ...current.consent, status: 'DENIED' } });
        events.set('source-1', current);
        await ingest();
        expect((await pool.query('SELECT * FROM marketing_conversion_outbox')).rowCount).toBe(0);
        expect(await service.bookingTruth(1, { id: 10, role: 'host' })).toMatchObject({ capturedBookings: '1' });
    });
    it('rechecks current consent immediately before dispatch without relying on old event consent', async () => {
        await ingest();
        current = booking({ consent: { ...current.consent, status: 'REVOKED' } });
        expect(await service.dispatch()).toMatchObject({ suppressed: 1, accepted: 0 });
        expect(upload).not.toHaveBeenCalled();
    });
    it('defers dispatch until a newer current canonical event is ingested', async () => {
        await ingest();
        current = booking({ sequence: 2, eventId: 'event-2', state: 'FULFILLED' });
        expect(await service.dispatch()).toMatchObject({ deferred: 1, accepted: 0 });
        expect(upload).not.toHaveBeenCalled();
        events.set('source-2', current);
        await service.ingest('source-2');
        expect(await service.dispatch()).toMatchObject({ accepted: 1 });
    });
    it('records mixed per-item acceptance and rejection without blanket uploaded status', async () => {
        await ingest();
        const second = booking({ bookingId: 'booking-2', orderId: 'order-2', eventId: 'event-2' });
        events.set('source-2', second);
        await service.ingest('source-2');
        const verifier = async (request: any) => request.kind === 'CURRENT' ? (request.bookingId === 'booking-1' ? booking() : second) : events.get(request.reference)!;
        const batch = new MarketingMeasurementService(pool, { actorContext: { id: 90, role: 'system' }, now: () => now, verifyBooking: verifier, uploader: async (items) => items.map((item, i) => ({ id: item.id, status: i === 0 ? 'ACCEPTED' : 'REJECTED', receipt: i === 0 ? 'provider-receipt' : undefined, code: i === 1 ? 'INVALID_CONVERSION_ACTION' : undefined })) });
        expect(await batch.dispatch()).toMatchObject({ accepted: 1, rejected: 1, unknown: 0 });
        expect((await pool.query('SELECT status FROM marketing_conversion_outbox ORDER BY status')).rows).toEqual([{ status: 'ACCEPTED' }, { status: 'REJECTED' }]);
    });
    it.each(['throws', 'missing', 'duplicates', 'foreign', 'receiptMissing'])('quarantines %s results and never automatically resends', async (scenario) => {
        await ingest();
        upload.mockImplementationOnce(async (items) => {
            if (scenario === 'throws')
                throw new Error('Sensitive raw transport token');
            if (scenario === 'missing')
                return [];
            if (scenario === 'duplicates')
                return [{ id: items[0].id, status: 'ACCEPTED', receipt: 'r' }, { id: items[0].id, status: 'ACCEPTED', receipt: 'r' }];
            if (scenario === 'foreign')
                return [{ id: 'different', status: 'ACCEPTED', receipt: 'r' }];
            return [{ id: items[0].id, status: 'ACCEPTED' }];
        });
        expect(await service.dispatch()).toMatchObject({ accepted: 0, unknown: 1 });
        await service.dispatch();
        expect(upload).toHaveBeenCalledTimes(1);
        const row = (await pool.query('SELECT status,error_code,attempts FROM marketing_conversion_outbox')).rows[0];
        expect(row).toMatchObject({ status: 'UNKNOWN', attempts: 1, error_code: 'PROVIDER_UNKNOWN_OUTCOME' });
        expect(JSON.stringify(row)).not.toContain('Sensitive');
    });
    it('bounds a hung uploader and leaves its outcome unknown', async () => {
        await ingest();
        const hung = new MarketingMeasurementService(pool, { actorContext: { id: 90, role: 'system' }, now: () => now, uploadTimeoutMs: 10, verifyBooking: async () => current, uploader: async () => new Promise(() => { }) });
        expect(await hung.dispatch()).toMatchObject({ unknown: 1 });
    });
    it('allows only one of eight competing dispatchers to send a purchase', async () => {
        await ingest();
        await Promise.all(Array.from({ length: 8 }, () => service.dispatch()));
        expect(upload).toHaveBeenCalledTimes(1);
        expect((await pool.query('SELECT attempts,status FROM marketing_conversion_outbox')).rows).toEqual([{ attempts: 1, status: 'ACCEPTED' }]);
    });
    it('does not retry abandoned DISPATCHING evidence after restart', async () => {
        await ingest();
        await pool.query("UPDATE marketing_conversion_outbox SET status='DISPATCHING',attempts=1,dispatched_at=now()-interval '1 day'");
        await service.dispatch();
        expect(upload).not.toHaveBeenCalled();
    });
    it('keeps an accepted external result ambiguous if the final database commit fails', async () => {
        await ingest();
        await pool.query("CREATE OR REPLACE FUNCTION reject_conversion_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='ACCEPTED' THEN RAISE EXCEPTION 'fixture persist failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_conversion_result BEFORE UPDATE ON marketing_conversion_outbox FOR EACH ROW EXECUTE FUNCTION reject_conversion_result()");
        try {
            await expect(service.dispatch()).rejects.toThrow('fixture persist failure');
            expect((await pool.query('SELECT status FROM marketing_conversion_outbox')).rows).toEqual([{ status: 'DISPATCHING' }]);
            await service.dispatch();
            expect(upload).toHaveBeenCalledTimes(1);
        }
        finally {
            await pool.query('DROP TRIGGER reject_conversion_result ON marketing_conversion_outbox');
        }
    });
    it('enforces owner reads and append-only canonical evidence', async () => {
        await ingest();
        await expect(service.bookingTruth(1, { id: 11, role: 'host' })).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
        await expect(pool.query("UPDATE marketing_measurement_events SET evidence='{}'")).rejects.toThrow('append-only');
        await expect(pool.query("UPDATE marketing_conversion_outbox SET payload='{}'")).rejects.toThrow('immutable');
    });
    it('applies row-level security even to a separately granted tenant database role', async () => {
        await ingest();
        await pool.query('CREATE ROLE harvo_measurement_tenant');
        try {
            await pool.query('GRANT SELECT,UPDATE ON marketing_booking_measurements TO harvo_measurement_tenant');
            const c = await pool.connect();
            try {
                await c.query('BEGIN');
                await c.query('SET LOCAL ROLE harvo_measurement_tenant');
                await c.query("SELECT set_config('app.current_user_id','11',true),set_config('app.marketing_admin','false',true)");
                expect((await c.query('SELECT * FROM marketing_booking_measurements')).rowCount).toBe(0);
                await c.query("SELECT set_config('app.current_user_id','10',true)");
                expect((await c.query('SELECT * FROM marketing_booking_measurements')).rowCount).toBe(1);
                expect((await c.query("UPDATE marketing_booking_measurements SET currency='USD' RETURNING *")).rowCount).toBe(0);
                await c.query('ROLLBACK');
            }
            finally {
                c.release();
            }
        }
        finally {
            await pool.query('DROP OWNED BY harvo_measurement_tenant');
            await pool.query('DROP ROLE harvo_measurement_tenant');
        }
    });
});
const telemetry = (patch: Partial<TelemetryInput> = {}): TelemetryInput => ({ provider: 'GOOGLE', currency: 'INR', observedAt: '2026-09-13T11:59:00Z', dataAsOf: '2026-09-13T11:55:00Z', windowStart: '2026-09-01', windowEnd: '2026-09-14', accountTimezone: 'Asia/Kolkata', source: 'PROVIDER_API', impressions: '1000', clicks: '25', providerAttributedConversions: '2.5', spendMicros: '123456789', ...patch });
describe('HARVO truthful telemetry normalization', () => {
    it('preserves fractional attribution, explicit money units, provenance and missing metrics', () => {
        expect(normalizeMarketingTelemetry(telemetry(), now)).toMatchObject({ impressions: 1000, clicks: 25, ctrPercent: 2.5, providerAttributedConversions: 2.5, profileVisits: null, leads: null, spendMinor: '12346', spendMicros: '123456789', freshness: 'DELAYED', conversionMeaning: 'PROVIDER_ATTRIBUTED_NOT_CANONICAL_BOOKINGS' });
    });
    it.each([undefined, null, '', -1, '1e5', 'NaN', Infinity, '3.5'])('does not fabricate a count from %s', input => {
        expect(normalizeMarketingTelemetry(telemetry({ impressions: input }), now).impressions).toBeNull();
    });
    it('preserves actual measured zero and leaves a zero-denominator CTR unavailable', () => {
        expect(normalizeMarketingTelemetry(telemetry({ impressions: '0', clicks: 0 }), now)).toMatchObject({ impressions: 0, clicks: 0, ctrPercent: null });
    });
    it('uses provider data timestamp for staleness even when polling just completed', () => {
        expect(normalizeMarketingTelemetry(telemetry({ dataAsOf: '2026-09-12T12:00:00Z' }), now).freshness).toBe('STALE');
    });
    it('can show an observed provider report while explicitly preserving unknown data settlement time', () => {
        expect(normalizeMarketingTelemetry(telemetry({ dataAsOf: null }), now)).toMatchObject({ impressions: 1000, dataAsOf: null, freshness: 'UNKNOWN', errors: ['PROVIDER_DATA_AS_OF_UNAVAILABLE'] });
    });
    it.each([{ observedAt: null }, { dataAsOf: '2026-09-13T12:01:00Z' }, { accountTimezone: 'bogus/timezone' }, { source: 'UNAVAILABLE' as const }])('marks unavailable provenance as unknown, not fake zeros', patch => {
        expect(normalizeMarketingTelemetry(telemetry(patch), now)).toMatchObject({ freshness: 'UNAVAILABLE', impressions: null, spendMinor: null });
    });
    it('rejects ambiguous units and exactly rounds major-unit fractions', () => {
        expect(normalizeMarketingTelemetry(telemetry({ spendMinor: '123', spendMicros: '1230000' }), now)).toMatchObject({ spendMinor: null, errors: ['AMBIGUOUS_SPEND_UNITS'] });
        expect(normalizeMarketingTelemetry(telemetry({ spendMicros: undefined, spendMajor: '1.005000' }), now)).toMatchObject({ spendMinor: '101', spendMicros: '1005000' });
    });
});
