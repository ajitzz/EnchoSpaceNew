import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { MarketingError, fingerprint, minorAmount, type Actor, type MarketingProvider } from './domain.js';
import { inTransaction } from './database.js';
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const instant = z.string().datetime({ offset: true });
const canonicalSchema = z.object({
    authority: z.literal('CANONICAL_CHECKOUT'), acceptanceReference: identifier,
    eventId: identifier, bookingId: identifier, orderId: identifier, sequence: z.number().int().positive().safe(),
    state: z.enum(['CAPTURED', 'FULFILLED', 'CANCELLED', 'REFUNDED']), occurredAt: instant,
    hostId: z.number().int().positive().safe(), listingId: z.number().int().positive().safe(), campaignId: z.number().int().positive().safe(),
    currency: z.enum(['INR', 'USD']), capturedMinor: minorAmount, refundedMinor: minorAmount,
    captureEvidenceId: identifier, capturedAt: instant,
    attribution: z.object({ provider: z.enum(['META', 'GOOGLE']), externalCampaignId: z.string().min(1).max(200), evidenceId: identifier }).strict(),
    consent: z.object({ recordId: identifier, purpose: z.literal('ADS_MEASUREMENT'), status: z.enum(['GRANTED', 'DENIED', 'REVOKED']), recordedAt: instant }).strict(),
}).strict().superRefine((v, ctx) => {
    if (BigInt(v.capturedMinor) <= 0n || BigInt(v.refundedMinor) > BigInt(v.capturedMinor))
        ctx.addIssue({ code: 'custom', message: 'Invalid captured/refunded amounts' });
    if (v.state === 'REFUNDED' && v.refundedMinor !== v.capturedMinor)
        ctx.addIssue({ code: 'custom', message: 'Fully refunded state requires full refund evidence' });
    if (Date.parse(v.capturedAt) > Date.parse(v.occurredAt))
        ctx.addIssue({ code: 'custom', message: 'Capture cannot follow the booking event' });
});
export type VerifiedCanonicalBooking = z.infer<typeof canonicalSchema>;
export type BookingVerificationRequest = {
    kind: 'EVENT';
    reference: string;
} | {
    kind: 'CURRENT';
    bookingId: string;
};
/** Trusted server port: must query the accepted canonical checkout/payment/consent authority.
 * EVENT verifies an immutable event and current consent; CURRENT verifies current booking truth.
 * A legacy CONFIRMED row, caller-supplied amount, or deployment flag is insufficient evidence.
 */
export type CanonicalBookingVerifier = (request: BookingVerificationRequest, client: pg.PoolClient) => Promise<VerifiedCanonicalBooking>;
export type ConversionUpload = {
    purchaseEventId?:string;
    id: string;
    idempotencyKey: string;
    kind: 'PURCHASE' | 'RESTATEMENT' | 'RETRACTION';
    orderId: string;
    bookingId: string;
    provider: MarketingProvider;
    campaignId: number;
    hostId: number;
    listingId: number;
    externalCampaignId: string;
    amountMinor: string;
    currency: 'INR' | 'USD';
    occurredAt: string;
    capturedAt: string;
    attributionEvidenceId: string;
    consentRecordId: string;
    acceptanceReference: string;
};
export type ConversionUploadResult = {
    id: string;
    status: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
    receipt?: string;
    code?: string;
};
/** Adapters must return one result per item. Acceptance is receipt, never attribution or delivery. */
export type ConversionUploader = (items: readonly ConversionUpload[]) => Promise<readonly ConversionUploadResult[]>;
const net = (v: VerifiedCanonicalBooking) => v.state === 'CANCELLED' || v.state === 'REFUNDED' ? 0n : BigInt(v.capturedMinor) - BigInt(v.refundedMinor);
const sameBinding = (row: any, v: VerifiedCanonicalBooking) => row.order_id === v.orderId && row.booking_id === v.bookingId && Number(row.host_id) === v.hostId && Number(row.listing_id) === v.listingId && Number(row.campaign_id) === v.campaignId && row.provider === v.attribution.provider && row.external_campaign_id === v.attribution.externalCampaignId && row.currency === v.currency;
const safeCode = (value: unknown, fallback: string) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : fallback;
const safeReceipt = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : null;
/** No default verifier or uploader: the legally gated checkout remains disconnected. */
export class MarketingMeasurementService {
    constructor(private readonly pool: pg.Pool, private readonly options: {
        actorContext?: Actor;
        verifyBooking?: CanonicalBookingVerifier;
        uploader?: ConversionUploader;
        now?: () => Date;
        uploadTimeoutMs?: number;
    } = {}) {
        if (options.uploadTimeoutMs !== undefined && (!Number.isSafeInteger(options.uploadTimeoutMs) || options.uploadTimeoutMs < 1 || options.uploadTimeoutMs > 30000))
            throw new MarketingError('INVALID_ARGUMENT', 'Upload timeout must be within 1–30000 milliseconds', 400);
    }
    private actor(): Actor { const actor = this.options.actorContext; if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0 || !['admin', 'system'].includes(actor.role))
        throw new MarketingError('SERVICE_ACTOR_REQUIRED', 'An explicitly configured audited measurement service principal is required', 503); return actor; }
    private now() { return this.options.now?.() ?? new Date(); }
    private async verify(request: BookingVerificationRequest, c: pg.PoolClient) {
        if (!this.options.verifyBooking)
            throw new MarketingError('CANONICAL_CHECKOUT_REQUIRED', 'Accepted canonical booking verification is not configured', 503);
        const parsed = canonicalSchema.safeParse(await this.options.verifyBooking(request, c));
        if (!parsed.success)
            throw new MarketingError('CANONICAL_EVIDENCE_INVALID', 'Canonical booking evidence is invalid');
        const v = parsed.data;
        if (Date.parse(v.occurredAt) > this.now().getTime() || Date.parse(v.consent.recordedAt) > this.now().getTime())
            throw new MarketingError('CANONICAL_EVIDENCE_INVALID', 'Canonical event or consent is in the future');
        if (request.kind === 'CURRENT' && v.bookingId !== request.bookingId)
            throw new MarketingError('BOOKING_BINDING_MISMATCH', 'Canonical booking identity changed');
        return v;
    }
    async ingest(reference: string): Promise<{
        orderId: string;
        duplicate: boolean;
        outboxId: string | null;
    }> {
        identifier.parse(reference);
        if (!this.options.verifyBooking)
            throw new MarketingError('CANONICAL_CHECKOUT_REQUIRED', 'Accepted canonical booking verification is not configured', 503);
        return inTransaction(this.pool, this.actor(), async (c) => {
            const v = await this.verify({ kind: 'EVENT', reference }, c);
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`harvo-booking:${v.bookingId}`]);
            const campaign = (await c.query('SELECT id,host_id,listing_id FROM host_marketing_campaigns WHERE id=$1 FOR SHARE', [v.campaignId])).rows[0];
            const entity = (await c.query("SELECT external_id FROM provider_entities WHERE campaign_id=$1 AND provider=$2 AND entity_type='CAMPAIGN' AND external_id=$3 FOR SHARE", [v.campaignId, v.attribution.provider, v.attribution.externalCampaignId])).rows;
            if (!campaign || Number(campaign.host_id) !== v.hostId || Number(campaign.listing_id) !== v.listingId || entity.length !== 1)
                throw new MarketingError('BOOKING_BINDING_MISMATCH', 'Booking attribution must match the host, property and observed provider campaign');
            const previous = (await c.query('SELECT * FROM marketing_booking_measurements WHERE order_id=$1 OR booking_id=$2 FOR UPDATE', [v.orderId, v.bookingId])).rows;
            if (previous.length > 1 || previous[0] && !sameBinding(previous[0], v))
                throw new MarketingError('BOOKING_BINDING_MISMATCH', 'An order or booking cannot change its attribution identity');
            if (!previous.length) {
                const property = (await c.query('SELECT user_id,currency FROM listings WHERE id=$1 FOR SHARE', [v.listingId])).rows[0];
                if (Number(property?.user_id) !== v.hostId || property?.currency !== v.currency)
                    throw new MarketingError('BOOKING_BINDING_MISMATCH', 'Initial booking measurement must match the canonical property owner and currency');
            }
            const hash = fingerprint(v);
            const oldEvent = (await c.query('SELECT * FROM marketing_measurement_events WHERE event_id=$1', [v.eventId])).rows[0];
            if (oldEvent) {
                if (oldEvent.order_id !== v.orderId || oldEvent.fingerprint !== hash)
                    throw new MarketingError('MEASUREMENT_EVENT_CONFLICT', 'Canonical event identity was reused with different evidence');
                const outbox = (await c.query('SELECT id FROM marketing_conversion_outbox WHERE event_id=$1', [v.eventId])).rows[0];
                return { orderId: v.orderId, duplicate: true, outboxId: outbox?.id ?? null };
            }
            const old = previous[0];
            if (old) {
                if (v.sequence <= Number(old.sequence))
                    throw new MarketingError('MEASUREMENT_SEQUENCE_CONFLICT', 'Canonical booking events must advance monotonically');
                if (v.capturedMinor !== old.captured_minor || BigInt(v.refundedMinor) < BigInt(old.refunded_minor))
                    throw new MarketingError('MEASUREMENT_AMOUNT_CONFLICT', 'Captured amount is immutable and refunds cannot decrease');
                if (v.captureEvidenceId !== old.canonical_evidence.captureEvidenceId || v.capturedAt !== old.canonical_evidence.capturedAt)
                    throw new MarketingError('MEASUREMENT_AMOUNT_CONFLICT', 'The original verified capture identity and timestamp are immutable');
                if (['CANCELLED', 'REFUNDED'].includes(old.state) && !['CANCELLED', 'REFUNDED'].includes(v.state))
                    throw new MarketingError('MEASUREMENT_STATE_CONFLICT', 'A terminal booking cannot silently reopen');
                if (old.state === 'FULFILLED' && v.state === 'CAPTURED')
                    throw new MarketingError('MEASUREMENT_STATE_CONFLICT', 'Fulfilled bookings cannot regress to captured');
            }
            await c.query(`INSERT INTO marketing_booking_measurements(order_id,booking_id,campaign_id,host_id,listing_id,provider,external_campaign_id,currency,captured_minor,refunded_minor,state,sequence,canonical_evidence,consent_status,occurred_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(order_id) DO UPDATE SET refunded_minor=EXCLUDED.refunded_minor,state=EXCLUDED.state,sequence=EXCLUDED.sequence,canonical_evidence=EXCLUDED.canonical_evidence,consent_status=EXCLUDED.consent_status,occurred_at=EXCLUDED.occurred_at,verified_at=now()`, [v.orderId, v.bookingId, v.campaignId, v.hostId, v.listingId, v.attribution.provider, v.attribution.externalCampaignId, v.currency, v.capturedMinor, v.refundedMinor, v.state, v.sequence, JSON.stringify(v), v.consent.status, v.occurredAt]);
            await c.query('INSERT INTO marketing_measurement_events(event_id,order_id,host_id,sequence,fingerprint,evidence) VALUES($1,$2,$3,$4,$5,$6)', [v.eventId, v.orderId, v.hostId, v.sequence, hash, JSON.stringify(v)]);
            const uploads = (await c.query('SELECT * FROM marketing_conversion_outbox WHERE order_id=$1 ORDER BY created_at,id FOR UPDATE', [v.orderId])).rows;
            const purchase = uploads.find(x => x.kind === 'PURCHASE');
            if (v.consent.status !== 'GRANTED' || net(v) === 0n && purchase?.status === 'PENDING') {
                await c.query("UPDATE marketing_conversion_outbox SET status='SUPPRESSED',error_code=$2,resolved_at=now() WHERE order_id=$1 AND status='PENDING'", [v.orderId, v.consent.status !== 'GRANTED' ? 'CONSENT_REQUIRED' : 'BOOKING_CANCELLED_BEFORE_UPLOAD']);
                return { orderId: v.orderId, duplicate: false, outboxId: null };
            }
            if (v.consent.status !== 'GRANTED' || !purchase && net(v) === 0n || purchase?.status === 'SUPPRESSED')
                return { orderId: v.orderId, duplicate: false, outboxId: null };
            let kind: ConversionUpload['kind'] | null = !purchase ? 'PURCHASE' : null;
            if (purchase && old && net(v) !== net(old.canonical_evidence))
                kind = net(v) === 0n ? 'RETRACTION' : 'RESTATEMENT';
            if (!kind)
                return { orderId: v.orderId, duplicate: false, outboxId: null };
            const purchaseEventId=purchase?purchase.payload.purchaseEventId:randomUUID();
            const payload: Omit<ConversionUpload, 'id' | 'idempotencyKey'> = { ...(purchaseEventId?{purchaseEventId}:{}),kind, orderId: v.orderId, bookingId: v.bookingId, provider: v.attribution.provider, campaignId: v.campaignId, hostId: v.hostId, listingId: v.listingId, externalCampaignId: v.attribution.externalCampaignId, amountMinor: net(v).toString(), currency: v.currency, occurredAt: v.occurredAt, capturedAt: v.capturedAt, attributionEvidenceId: v.attribution.evidenceId, consentRecordId: v.consent.recordId, acceptanceReference: v.acceptanceReference };
            const inserted = await c.query('INSERT INTO marketing_conversion_outbox(order_id,host_id,provider,event_id,kind,depends_on,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [v.orderId, v.hostId, v.attribution.provider, v.eventId, kind, uploads.at(-1)?.id ?? null, JSON.stringify(payload)]);
            return { orderId: v.orderId, duplicate: false, outboxId: inserted.rows[0].id };
        });
    }
    async dispatch(limit = 25): Promise<{
        accepted: number;
        rejected: number;
        unknown: number;
        suppressed: number;
        deferred: number;
    }> {
        if (!this.options.uploader)
            throw new MarketingError('CONVERSION_UPLOAD_DISABLED', 'Canonical provider conversion upload is not enabled', 503);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
            throw new MarketingError('INVALID_ARGUMENT', 'Conversion batch size must be between 1 and 25', 400);
        const count = { accepted: 0, rejected: 0, unknown: 0, suppressed: 0, deferred: 0 };
        const items = await inTransaction(this.pool, this.actor(), async (c) => {
            const candidates = (await c.query(`SELECT o.* FROM marketing_conversion_outbox o WHERE o.status='PENDING'
    AND (o.depends_on IS NULL OR EXISTS(SELECT 1 FROM marketing_conversion_outbox p WHERE p.id=o.depends_on AND p.status='ACCEPTED'))
    ORDER BY o.created_at,o.id LIMIT $1`, [limit])).rows;
            const ready: ConversionUpload[] = [];
            for (const row of candidates) {
                const stored = (await c.query('SELECT * FROM marketing_booking_measurements WHERE order_id=$1', [row.order_id])).rows[0];
                // Match ingestion's booking lock order before locking outbox rows. A stale
                // candidate from another worker cannot become a second dispatch.
                const lock = (await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired', [`harvo-booking:${stored.booking_id}`])).rows[0];
                if (!lock.acquired)
                    continue;
                const pending = await c.query("SELECT id FROM marketing_conversion_outbox WHERE id=$1 AND status='PENDING' FOR UPDATE SKIP LOCKED", [row.id]);
                if (!pending.rows.length)
                    continue;
                const current = await this.verify({ kind: 'CURRENT', bookingId: stored.booking_id }, c);
                if (!sameBinding(stored, current))
                    throw new MarketingError('BOOKING_BINDING_MISMATCH', 'Current canonical attribution differs from recorded evidence');
                if (current.consent.status !== 'GRANTED' || row.kind === 'PURCHASE' && net(current) === 0n) {
                    await c.query("UPDATE marketing_conversion_outbox SET status='SUPPRESSED',error_code=$2,resolved_at=now() WHERE id=$1", [row.id, current.consent.status !== 'GRANTED' ? 'CONSENT_REQUIRED' : 'BOOKING_CANCELLED_BEFORE_UPLOAD']);
                    count.suppressed++;
                    continue;
                }
                if (current.sequence !== Number(stored.sequence) || fingerprint(current) !== fingerprint(stored.canonical_evidence)) {
                    count.deferred++;
                    continue;
                }
                await c.query("UPDATE marketing_conversion_outbox SET status='DISPATCHING',attempts=1,dispatched_at=now() WHERE id=$1 AND status='PENDING'", [row.id]);
                ready.push({ ...row.payload, id: row.id, idempotencyKey: `harvo:${row.provider}:${row.id}` });
            }
            return ready;
        });
        if (!items.length)
            return count;
        let results: readonly ConversionUploadResult[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            results = await Promise.race([this.options.uploader(items), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('UPLOAD_TIMEOUT')), this.options.uploadTimeoutMs ?? 15000); })]);
        }
        catch { /* The committed dispatch intent preserves an ambiguous external outcome. */ }
        finally {
            if (timer)
                clearTimeout(timer);
        }
        const valid = Array.isArray(results) && results.length === items.length && new Set(results.map(x => x?.id)).size === items.length && results.every(x => items.some(i => i.id === x?.id) && ['ACCEPTED', 'REJECTED', 'UNKNOWN'].includes(x?.status));
        // A malformed batch cannot justify a blanket success. Quarantine each dispatched item.
        await inTransaction(this.pool, this.actor(), async (c) => {
            for (const item of items) {
                const result = valid ? results.find(r => r.id === item.id)! : { id: item.id, status: 'UNKNOWN' as const };
                const status = result.status === 'ACCEPTED' && !safeReceipt(result.receipt) ? 'UNKNOWN' : result.status;
                const updated = await c.query("UPDATE marketing_conversion_outbox SET status=$2,provider_receipt=$3,error_code=$4,resolved_at=now() WHERE id=$1 AND status='DISPATCHING' RETURNING id", [item.id, status, safeReceipt(result.receipt), status === 'ACCEPTED' ? null : safeCode(result.code, status === 'UNKNOWN' ? 'PROVIDER_UNKNOWN_OUTCOME' : 'PROVIDER_ITEM_REJECTED')]);
                if (updated.rowCount !== 1)
                    throw new MarketingError('CONVERSION_UNKNOWN_OUTCOME', 'Conversion dispatch evidence changed; reconcile before retrying');
                count[status === 'ACCEPTED' ? 'accepted' : status === 'REJECTED' ? 'rejected' : 'unknown']++;
            }
        });
        return count;
    }
    /** Read only: captured payment and fulfilled stay counts are never provider attribution. */
    async bookingTruth(campaignId: number, actor: Actor) {
        if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !Number.isSafeInteger(actor.id) || actor.id <= 0)
            throw new MarketingError('INVALID_ARGUMENT', 'Valid campaign and principal required', 400);
        return inTransaction(this.pool, actor, async (c) => {
            const owned = await c.query('SELECT id FROM host_marketing_campaigns WHERE id=$1 AND ($2 OR host_id=$3)', [campaignId, actor.role === 'admin' || actor.role === 'system', actor.id]);
            if (!owned.rows.length)
                throw new MarketingError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404);
            const result = (await c.query(`SELECT count(*)::text AS captured_bookings,count(*) FILTER(WHERE state='FULFILLED')::text AS fulfilled_bookings,
    count(*) FILTER(WHERE state='CANCELLED')::text AS cancelled_bookings,count(*) FILTER(WHERE state='REFUNDED')::text AS refunded_bookings,
    COALESCE(sum(captured_minor),0)::text AS captured_minor,COALESCE(sum(refunded_minor),0)::text AS refunded_minor,max(verified_at) AS verified_at
    FROM marketing_booking_measurements WHERE campaign_id=$1 AND ($2 OR host_id=$3)`, [campaignId, actor.role === 'admin' || actor.role === 'system', actor.id])).rows[0];
            return { source: 'CANONICAL_CHECKOUT' as const, scope: 'RECORDED_VERIFIED_EVENTS' as const, capturedBookings: result.captured_bookings, fulfilledBookings: result.fulfilled_bookings, cancelledBookings: result.cancelled_bookings, refundedBookings: result.refunded_bookings, capturedMinor: result.captured_minor, refundedMinor: result.refunded_minor, lastVerifiedAt: result.verified_at?.toISOString() ?? null, completeness: 'NOT_ESTABLISHED' as const };
        });
    }
}
export interface TelemetryInput {
    provider: MarketingProvider;
    currency: 'INR' | 'USD';
    observedAt: string | null;
    dataAsOf: string | null;
    windowStart: string;
    windowEnd: string;
    accountTimezone: string;
    source: 'PROVIDER_API' | 'UNAVAILABLE';
    impressions?: unknown;
    clicks?: unknown;
    profileVisits?: unknown;
    leads?: unknown;
    providerAttributedConversions?: unknown;
    spendMinor?: unknown;
    spendMicros?: unknown;
    spendMajor?: unknown;
}
const metric = (value: unknown, integer: boolean): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !/^(0|[1-9]\d*)(\.\d+)?$/.test(value))
        return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER && (!integer || Number.isSafeInteger(n)) ? n : null;
};
/** Decimal parsing avoids silently treating micros as minor units or missing values as zero. */
function scaledMoney(value: unknown, scale: number): bigint | null {
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const text = String(value);
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text))
        return null;
    const [whole, fraction = ''] = text.split('.');
    if (fraction.length > scale)
        return null;
    const n = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
    return n <= 90071992547409910000n ? n : null;
}
export function normalizeMarketingTelemetry(input: TelemetryInput, now = new Date(), staleAfterMs = 15 * 60 * 1000) {
    const errors: string[] = [];
    const timestamp = (value: string | null) => value && instant.safeParse(value).success && Date.parse(value) <= now.getTime() ? new Date(value).toISOString() : null;
    const observedAt = timestamp(input.observedAt), dataAsOf = timestamp(input.dataAsOf);
    const validWindow = Number.isFinite(Date.parse(input.windowStart)) && Number.isFinite(Date.parse(input.windowEnd)) && Date.parse(input.windowStart) < Date.parse(input.windowEnd);
    let timezoneValid = true;
    try {
        new Intl.DateTimeFormat('en', { timeZone: input.accountTimezone }).format(now);
    }
    catch {
        timezoneValid = false;
    }
    if (!validWindow)
        errors.push('INVALID_REPORTING_WINDOW');
    if (!timezoneValid)
        errors.push('INVALID_ACCOUNT_TIMEZONE');
    const usable = input.source === 'PROVIDER_API' && observedAt !== null && validWindow && timezoneValid && (input.dataAsOf === null || dataAsOf !== null && Date.parse(dataAsOf) <= Date.parse(observedAt));
    if (usable && dataAsOf === null)
        errors.push('PROVIDER_DATA_AS_OF_UNAVAILABLE');
    if (input.source === 'PROVIDER_API' && !usable)
        errors.push('REPORTING_EVIDENCE_INCOMPLETE');
    const normalized = { impressions: null as number | null, clicks: null as number | null, profileVisits: null as number | null, leads: null as number | null, providerAttributedConversions: null as number | null };
    for (const name of Object.keys(normalized) as (keyof typeof normalized)[]) {
        if (!usable)
            continue;
        normalized[name] = metric(input[name], name !== 'providerAttributedConversions');
        if (input[name] !== undefined && input[name] !== null && normalized[name] === null)
            errors.push(`INVALID_${name.toUpperCase()}`);
    }
    let spendMinor: string | null = null;
    let spendMicros: string | null = null;
    const amounts = [input.spendMinor, input.spendMicros, input.spendMajor].filter(x => x !== undefined && x !== null);
    if (usable && amounts.length === 1) {
        const micros = input.spendMicros != null ? scaledMoney(input.spendMicros, 0) : input.spendMinor != null ? (() => { const n = scaledMoney(input.spendMinor, 0); return n === null ? null : n * 10000n; })() : scaledMoney(input.spendMajor, 6);
        if (micros !== null) {
            spendMicros = micros.toString();
            spendMinor = ((micros + 5000n) / 10000n).toString();
        }
        else
            errors.push('INVALID_SPEND');
    }
    else if (amounts.length > 1)
        errors.push('AMBIGUOUS_SPEND_UNITS');
    const ctrPercent = normalized.impressions !== null && normalized.impressions > 0 && normalized.clicks !== null ? normalized.clicks / normalized.impressions * 100 : null;
    return { provider: input.provider, source: input.source, currency: input.currency, windowStart: input.windowStart, windowEnd: input.windowEnd, accountTimezone: timezoneValid ? input.accountTimezone : null, observedAt, dataAsOf, freshness: !usable ? 'UNAVAILABLE' as const : dataAsOf === null ? 'UNKNOWN' as const : now.getTime() - Date.parse(dataAsOf) > staleAfterMs ? 'STALE' as const : 'DELAYED' as const, ...normalized, ctrPercent, spendMinor, spendMicros, moneyRounding: 'HALF_UP_TO_MINOR' as const, conversionMeaning: 'PROVIDER_ATTRIBUTED_NOT_CANONICAL_BOOKINGS' as const, errors };
}
