import { createHash } from 'node:crypto';
import { MarketingError } from '../domain.js';
import type { ConversionUpload } from '../measurement.js';
import { conversionJson } from './http.js';
import { safeReceipt, type ConversionTransportOptions, type DeliveryOutcome, type PreparedConversion, type VerifiedConversionAttribution } from './contracts.js';

const id = (v: unknown) => typeof v === 'string' && /^[1-9][0-9]{0,29}$/.test(v);
const customer = (v: unknown) => typeof v === 'string' && /^\d{10}$/.test(v);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const rejected = (code: string): DeliveryOutcome => ({ status: 'REJECTED', code });
const unknown = (code = 'PROVIDER_UNKNOWN_OUTCOME'): DeliveryOutcome => ({ status: 'UNKNOWN', code });
const wireMoney = (minor: string) => {
  if (!/^(0|[1-9]\d*)$/.test(minor) || BigInt(minor) > BigInt(Number.MAX_SAFE_INTEGER)) throw new MarketingError('CONVERSION_AMOUNT_INVALID', 'A safe nonnegative captured value is required');
  const value = Number(minor) / 100;
  const decimal = value.toFixed(2).replace('.', '');
  if (BigInt(decimal) !== BigInt(minor)) throw new MarketingError('CONVERSION_AMOUNT_INVALID', 'Provider numeric value cannot preserve this minor-unit amount');
  return value;
};
const dateTime = (v: string) => new Date(v).toISOString().slice(0, 19).replace('T', ' ') + '+00:00';
const stablePurchaseId = (order: string) => `harvo-purchase-${createHash('sha256').update(order).digest('hex')}`;

export class CanonicalConversionProviders {
  private readonly fetcher: typeof fetch;
  private readonly timeout: number;
  constructor(private readonly options: ConversionTransportOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeoutMs ?? 8000;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > 15000) throw new MarketingError('INVALID_ARGUMENT', 'Conversion HTTP timeout must be 1–15000ms', 400);
  }
  configured(provider: 'GOOGLE' | 'META') { return provider === 'GOOGLE' ? !!this.options.google : !!this.options.meta; }
  prepare(item: ConversionUpload, attribution: VerifiedConversionAttribution): PreparedConversion {
    const now = this.options.now?.() ?? new Date();
    if (!Number.isFinite(Date.parse(item.capturedAt)) || !Number.isFinite(Date.parse(item.occurredAt)) || Date.parse(item.capturedAt) > Date.parse(item.occurredAt) || Date.parse(item.occurredAt) > now.getTime()) throw new MarketingError('CONVERSION_TIME_INVALID', 'Verified conversion times are invalid');
    if(item.purchaseEventId!==undefined&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.purchaseEventId))throw new MarketingError('CONVERSION_EVENT_ID_INVALID','Purchase deduplication requires its canonical event UUID');
    const value = wireMoney(item.amountMinor);
    if (item.kind === 'PURCHASE' && value <= 0 || item.kind === 'RETRACTION' && value !== 0) throw new MarketingError('CONVERSION_AMOUNT_INVALID', 'Conversion kind and value disagree');
    if (item.provider === 'GOOGLE') {
      const cfg = this.options.google, a = attribution.google;
      if (!cfg || !customer(cfg.customerId) || !customer(cfg.servingCustomerId) || !id(cfg.conversionActionId) || cfg.loginCustomerId && !customer(cfg.loginCustomerId)) throw new MarketingError('GOOGLE_CONVERSION_CONFIG_REQUIRED', 'Configured conversion owner/action and serving account are required', 503);
      if (a?.customerId !== cfg.customerId || a.conversionActionId !== cfg.conversionActionId || !new RegExp(`^customers/${cfg.servingCustomerId}/campaigns/[1-9][0-9]*$`).test(item.externalCampaignId)) throw new MarketingError('CONVERSION_DESTINATION_MISMATCH', 'Canonical attribution does not match the Google conversion destination');
      const destination = { accountId: cfg.customerId, actionId: cfg.conversionActionId, ...(cfg.loginCustomerId ? { loginAccountId: cfg.loginCustomerId } : {}) };
      const action = `customers/${cfg.customerId}/conversionActions/${cfg.conversionActionId}`;
      if (item.kind !== 'PURCHASE') {
        if (a.wbraid) throw new MarketingError('GOOGLE_WBRAID_ADJUSTMENT_UNSUPPORTED', 'Google does not support these wbraid conversion adjustments');
        if (Date.parse(item.occurredAt) <= Date.parse(item.capturedAt)) throw new MarketingError('CONVERSION_TIME_INVALID', 'A correction must occur after the original capture');
        return { transport: 'GOOGLE_ADJUSTMENT_V25', destination, url: `https://googleads.googleapis.com/v25/customers/${cfg.customerId}:uploadConversionAdjustments`, body: { partialFailure: true, conversionAdjustments: [{ conversionAction: action, orderId: item.orderId, adjustmentType: item.kind, adjustmentDateTime: dateTime(item.occurredAt), ...(item.kind === 'RESTATEMENT' ? { restatementValue: { adjustedValue: value, currencyCode: item.currency } } : {}) }] } };
      }
      const identifiers = Object.fromEntries(['gclid', 'gbraid', 'wbraid'].filter(k => a[k as keyof typeof a]).map(k => [k, a[k as keyof typeof a]]));
      if (Object.keys(identifiers).length !== 1) throw new MarketingError('GOOGLE_CLICK_EVIDENCE_REQUIRED', 'Exactly one verified Google click identifier is required');
      return { transport: 'GOOGLE_DATA_MANAGER_V1', destination, url: 'https://datamanager.googleapis.com/v1/events:ingest', body: {
        destinations: [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: cfg.customerId }, ...(cfg.loginCustomerId ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: cfg.loginCustomerId } } : {}), productDestinationId: cfg.conversionActionId }],
        events: [{ transactionId: item.orderId, eventTimestamp: item.capturedAt, eventSource: 'WEB', conversionValue: value, currency: item.currency, adIdentifiers: identifiers,
          consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: attribution.consent.adPersonalization === 'GRANTED' ? 'CONSENT_GRANTED' : 'CONSENT_DENIED' } }],
      } };
    }
    const cfg = this.options.meta, a = attribution.meta;
    if (!cfg || !id(cfg.pixelId) || !cfg.accessToken || /[\r\n]/.test(cfg.accessToken)) throw new MarketingError('META_CONVERSION_CONFIG_REQUIRED', 'A configured Meta dataset and token are required', 503);
    if (!a || a.pixelId !== cfg.pixelId || !id(item.externalCampaignId)) throw new MarketingError('CONVERSION_DESTINATION_MISMATCH', 'Canonical attribution does not match the Meta dataset');
    if (item.kind !== 'PURCHASE') throw new MarketingError('META_CORRECTION_REQUIRES_REMEDIATION', 'Standard CAPI Purchase does not establish a supported booking retraction or restatement path');
    if (now.getTime() - Date.parse(item.capturedAt) > 7 * 86400000) throw new MarketingError('META_CONVERSION_TOO_OLD', 'The captured event exceeds the supported CAPI event age');
    const source = new URL(a.eventSourceUrl);
    if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash || !cfg.allowedOrigins.includes(source.origin) || !source.pathname.startsWith('/stay/')) throw new MarketingError('CONVERSION_SOURCE_INVALID', 'The canonical property event URL must be an approved HTTPS stay page');
    if (!a.fbc && !a.externalIdSha256) throw new MarketingError('META_MATCH_EVIDENCE_REQUIRED', 'A verified Meta click or consented hashed external identifier is required');
    const user = { client_user_agent: a.userAgent, ...(a.fbc ? { fbc: a.fbc } : {}), ...(a.fbp ? { fbp: a.fbp } : {}), ...(a.externalIdSha256 ? { external_id: [a.externalIdSha256] } : {}) };
    return { transport: 'META_CAPI_V26', destination: { accountId: cfg.pixelId, actionId: 'Purchase' }, url: `https://graph.facebook.com/v26.0/${cfg.pixelId}/events`, body: { data: [{ event_name: 'Purchase', event_id: item.purchaseEventId??stablePurchaseId(item.orderId), event_time: Math.floor(Date.parse(item.capturedAt) / 1000), action_source: 'website', event_source_url: source.href, opt_out: attribution.consent.adPersonalization !== 'GRANTED', user_data: user, custom_data: { value, currency: item.currency, order_id: item.orderId } }] } };
  }
  private async headers(transport: PreparedConversion['transport']) {
    if (transport === 'META_CAPI_V26') return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.meta!.accessToken}` };
    const cfg = this.options.google!; let timer: ReturnType<typeof setTimeout> | undefined;
    let token: string;
    try { token = await Promise.race([cfg.accessToken(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('GOOGLE_TOKEN_DEADLINE')), this.timeout); })]); } finally { if (timer) clearTimeout(timer); }
    if (!token || /[\r\n]/.test(token) || token.length > 16384) throw new Error('GOOGLE_CONVERSION_TOKEN_INVALID');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(transport === 'GOOGLE_ADJUSTMENT_V25' && cfg.developerToken ? { 'developer-token': cfg.developerToken } : {}), ...(transport === 'GOOGLE_ADJUSTMENT_V25' && cfg.loginCustomerId ? { 'login-customer-id': cfg.loginCustomerId } : {}) };
  }
  async send(prepared: PreparedConversion): Promise<DeliveryOutcome> {
    try {
      const result = await conversionJson(this.fetcher, prepared.url, { method: 'POST', headers: await this.headers(prepared.transport), body: JSON.stringify(prepared.body) }, this.timeout);
      if (!result.ok) return [400, 401, 403, 404, 422].includes(result.status) && object(result.data?.error) ? rejected(`PROVIDER_HTTP_${result.status}`) : unknown(`PROVIDER_HTTP_${result.status}`);
      if (!object(result.data) || result.data.error) return unknown('PROVIDER_ACK_CONFLICT');
      if (prepared.transport === 'GOOGLE_DATA_MANAGER_V1') return safeReceipt(result.data?.requestId) ? { status: 'PROCESSING', receipt: result.data.requestId, code: 'GOOGLE_PROCESSING', evidence: { warningCount: Array.isArray(result.data.fieldWarnings) ? result.data.fieldWarnings.length : 0 } } : unknown('GOOGLE_REQUEST_RECEIPT_INVALID');
      if (prepared.transport === 'META_CAPI_V26') return result.data?.events_received === 1 && safeReceipt(result.data?.fbtrace_id) ? { status: 'ACCEPTED', receipt: result.data.fbtrace_id, evidence: { eventsReceived: 1, warningCount: Array.isArray(result.data.messages) ? result.data.messages.length : 0 } } : unknown('META_EVENT_ACK_INVALID');
      const expected = (prepared.body.conversionAdjustments as any[])[0], results = result.data?.results;
      if (result.data?.partialFailureError?.code) {
        const details = result.data.partialFailureError.details;
        const errors = Array.isArray(details) ? details.flatMap((d: any) => Array.isArray(d.errors) ? d.errors : []) : [];
        if (errors.length && errors.every((e: any) => e.location?.fieldPathElements?.some((p: any) => p.fieldName === 'conversion_adjustments' && p.index === 0))) return rejected('GOOGLE_ADJUSTMENT_REJECTED');
        return unknown('GOOGLE_PARTIAL_FAILURE_UNMAPPED');
      }
      const receipt = result.requestId;
      return Array.isArray(results) && results.length === 1 && results[0]?.conversionAction === expected.conversionAction && results[0]?.orderId === expected.orderId && results[0]?.adjustmentType === expected.adjustmentType && results[0]?.adjustmentDateTime === expected.adjustmentDateTime && safeReceipt(receipt)
        ? { status: 'ACCEPTED', receipt } : unknown('GOOGLE_ADJUSTMENT_ACK_INVALID');
    } catch { return unknown(); }
  }
  async observe(receipt: string, destination: PreparedConversion['destination']): Promise<DeliveryOutcome> {
    if (!safeReceipt(receipt) || !this.options.google || this.options.google.customerId !== destination.accountId || this.options.google.conversionActionId !== destination.actionId) return unknown('GOOGLE_DIAGNOSTIC_BINDING_MISMATCH');
    try {
      const response = await conversionJson(this.fetcher, `https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=${encodeURIComponent(receipt)}`, { method: 'GET', headers: await this.headers('GOOGLE_DATA_MANAGER_V1') }, this.timeout);
      const rows = response.data?.requestStatusPerDestination;
      if (!response.ok || !Array.isArray(rows) || rows.length !== 1) return unknown('GOOGLE_DIAGNOSTIC_UNAVAILABLE');
      const r = rows[0], d = r?.destination;
      if (d?.operatingAccount?.accountType !== 'GOOGLE_ADS' || d.operatingAccount.accountId !== destination.accountId || d.productDestinationId !== destination.actionId || (destination.loginAccountId && d.loginAccount?.accountId !== destination.loginAccountId)) return unknown('GOOGLE_DIAGNOSTIC_BINDING_MISMATCH');
      const evidence = { requestStatus: typeof r.requestStatus === 'string' ? r.requestStatus.slice(0, 40) : 'UNKNOWN', recordCount: r.eventsIngestionStatus?.recordCount === '1' ? '1' : null,
        errors: Array.isArray(r.errorInfo?.errorCounts) ? r.errorInfo.errorCounts.slice(0, 20).map((e: any) => ({ reason: /^[A-Z_]{1,100}$/.test(e.reason) ? e.reason : 'UNKNOWN', count: /^\d{1,6}$/.test(e.recordCount) ? e.recordCount : null })) : [],
        warningCount: Array.isArray(r.warningInfo?.warningCounts) ? r.warningInfo.warningCounts.length : 0 };
      if (r.requestStatus === 'PROCESSING') return { status: 'PROCESSING', receipt, code: 'GOOGLE_PROCESSING', evidence };
      if (r.eventsIngestionStatus?.recordCount !== '1') return unknown('GOOGLE_DIAGNOSTIC_COUNT_INVALID');
      if (r.requestStatus === 'SUCCESS' && !evidence.errors.length && (!r.errorInfo || Array.isArray(r.errorInfo.errorCounts) && !r.errorInfo.errorCounts.length)) return { status: 'ACCEPTED', receipt, evidence };
      if (r.requestStatus === 'FAILED') return { status: 'REJECTED', receipt, code: 'GOOGLE_EVENT_PROCESSING_FAILED', evidence };
      return { status: 'UNKNOWN', receipt, code: 'GOOGLE_DIAGNOSTIC_AMBIGUOUS', evidence };
    } catch { return unknown('GOOGLE_DIAGNOSTIC_UNAVAILABLE'); }
  }
}
