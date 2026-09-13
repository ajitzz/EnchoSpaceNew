import type pg from 'pg';
import { MarketingError, type Actor } from '../domain.js';
import { MarketingMeasurementService, type CanonicalBookingVerifier, type ConversionUpload, type ConversionUploadResult } from '../measurement.js';
import { CanonicalConversionProviders } from './providers.js';
import { ConversionDeliveryStore, measurementResult } from './store.js';
import { safeCode, validateAttribution, type ConversionAttributionResolver, type ConversionTransportOptions } from './contracts.js';

export interface ConversionConsumerOptions extends ConversionTransportOptions {
  actorContext?: Actor;
  verifyBooking?: CanonicalBookingVerifier;
  resolveAttribution?: ConversionAttributionResolver;
}
export function createConversionConsumer(pool: pg.Pool, options: ConversionConsumerOptions = {}) {
  const providers = new CanonicalConversionProviders(options);
  const store = options.actorContext ? new ConversionDeliveryStore(pool, options.actorContext) : undefined;
  const readiness = () => {
    const blockers = [];
    if (!options.actorContext) blockers.push('CONVERSION_SERVICE_ACTOR_REQUIRED');
    if (!options.verifyBooking) blockers.push('CANONICAL_CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED');
    if (!options.resolveAttribution) blockers.push('CANONICAL_ATTRIBUTION_CONSENT_AUTHORITY_REQUIRED');
    if (!options.google && !options.meta) blockers.push('CONVERSION_PROVIDER_CONFIGURATION_REQUIRED');
    return { enabled: !blockers.length, blockers, canonicalSource: options.verifyBooking ? 'EXPLICIT_VERIFIER_PORT' : 'NOT_CONNECTED',
      google: options.google ? 'DATA_MANAGER_V1_WITH_ADS_V25_ADJUSTMENTS' : 'NOT_CONFIGURED', meta: options.meta ? 'CAPI_V26_PURCHASE_ONLY' : 'NOT_CONFIGURED',
      limits: ['Provider acknowledgement is not attribution or incremental lift.', 'Meta Purchase corrections require separate provider remediation.', 'Consent revocation is not remote deletion.'] };
  };
  const uploader = async (items: readonly ConversionUpload[]): Promise<readonly ConversionUploadResult[]> => {
    if (!store || !options.resolveAttribution) throw new MarketingError('CONVERSION_AUTHORITY_REQUIRED', 'Canonical conversion and consent authority must be connected', 503);
    // The measurement batch is bounded to 25. Independent single-event requests avoid
    // ambiguous aggregate acknowledgements and finish within its absolute deadline.
    return Promise.all(items.map(async item => {
      try {
        const attribution = validateAttribution(item, await options.resolveAttribution!(item), options.now?.() ?? new Date());
        const prepared = providers.prepare(item, attribution);
        const claim = await store.claim(item, prepared);
        if (claim.claimed === false) return measurementResult(item.id, claim.outcome);
        const outcome = await providers.send(prepared);
        await store.record(item.id, outcome);
        return measurementResult(item.id, outcome);
      } catch (e) {
        // Once a claim exists, only durable provider evidence may resolve it. A
        // persistence failure must never turn a possible external write into rejection.
        if (e instanceof MarketingError && ['ATTRIBUTION_EVIDENCE_INVALID','ATTRIBUTION_BINDING_MISMATCH','CONVERSION_CONSENT_REQUIRED','GOOGLE_CONVERSION_CONFIG_REQUIRED','META_CONVERSION_CONFIG_REQUIRED','CONVERSION_DESTINATION_MISMATCH','GOOGLE_CLICK_EVIDENCE_REQUIRED','META_MATCH_EVIDENCE_REQUIRED','CONVERSION_SOURCE_INVALID','CONVERSION_AMOUNT_INVALID','CONVERSION_TIME_INVALID','META_CONVERSION_TOO_OLD','GOOGLE_WBRAID_ADJUSTMENT_UNSUPPORTED','META_CORRECTION_REQUIRES_REMEDIATION','CONVERSION_CORRECTION_SOURCE_REQUIRED','CONVERSION_CORRECTION_TIME_CONFLICT'].includes(e.code)) return { id: item.id, status: 'REJECTED', code: e.code };
        return { id: item.id, status: 'UNKNOWN', code: safeCode(e instanceof MarketingError ? e.code : undefined, 'PROVIDER_UNKNOWN_OUTCOME') };
      }
    }));
  };
  const measurement = new MarketingMeasurementService(pool, { actorContext: options.actorContext, verifyBooking: options.verifyBooking, uploader: options.resolveAttribution && store ? uploader : undefined, now: options.now, uploadTimeoutMs: 30000 });
  return {
    measurement, readiness,
    async ingest(reference: string) { return measurement.ingest(reference); },
    async runOnce(limit = 10) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new MarketingError('INVALID_ARGUMENT', 'Conversion consumer batch must be 1–25', 400);
      const state = readiness();
      if (!state.enabled || !store) return { blocked: true, blockers: state.blockers, reconciled: 0, observed: 0, dispatch: null };
      const candidates = await store.observationCandidates(limit);
      // Independent read-only diagnostics share a bounded batch deadline instead
      // of multiplying provider timeouts and starving the worker's control jobs.
      const observations = await Promise.allSettled(candidates.map(async row => {
        const outcome = await providers.observe(row.provider_receipt, row.destination);
        await store.record(row.outbox_id, outcome, true);
      }));
      if (observations.some(result => result.status === 'rejected')) throw new MarketingError('CONVERSION_DIAGNOSTICS_PERSISTENCE_FAILED', 'Conversion observations could not all be recorded', 503);
      const observed = observations.length;
      const reconciled = await store.synchronize(limit);
      const dispatch = await measurement.dispatch(limit);
      return { blocked: false, blockers: [], reconciled, observed, dispatch };
    },
  };
}
export type ConversionConsumer = ReturnType<typeof createConversionConsumer>;
