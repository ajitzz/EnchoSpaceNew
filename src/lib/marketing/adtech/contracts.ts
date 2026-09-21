import {createHash} from 'node:crypto';
import {MarketingError, fingerprint} from '../domain.js';
import {profileSchema, priceEvidenceSchema, type AdtechProfile, type CanonicalMarketingPriceEvidence, type StrategyGeographyEvidence} from '../../../shared/adtech/contracts.js';
export * from '../../../shared/adtech/contracts.js';

/** Exact conversion of canonical NUMERIC text. Floats and exponents are not accepted. */
export function rupeesToPaise(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value)) throw new MarketingError('STRATEGY_UNCLASSIFIED', 'A valid canonical nightly price is required.', 422);
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
}

export function validateTierIntervals(input: readonly unknown[]): AdtechProfile[] {
  const profiles = input.map(p => profileSchema.parse(p)).sort((a, b) => BigInt(a.minPriceMinor) < BigInt(b.minPriceMinor) ? -1 : 1);
  if (profiles.length !== 3 || profiles.map(p => p.tier).join(',') !== 'BUDGET,COMFORT,PREMIUM' || profiles.some((p, i) => i < profiles.length - 1 && p.maxPriceMinor !== profiles[i + 1].minPriceMinor) || profiles[2].maxPriceMinor !== null)
    throw new MarketingError('STRATEGY_INTERVALS_INVALID', 'A release requires three contiguous, non-overlapping tiers and an open final interval.', 422);
  return profiles;
}

/** Boundaries are supplied by the published database release, never a frontend constant. */
export function resolvePriceTier(evidence: unknown, profiles: readonly unknown[]) {
  const parsed = priceEvidenceSchema.safeParse(evidence);
  if (!parsed.success) throw new MarketingError('STRATEGY_UNCLASSIFIED', 'Confirm the currency, nightly charge basis and canonical price before preparing advertising.', 422);
  const price = parsed.data;
  const profile = validateTierIntervals(profiles).find(p => BigInt(price.amountMinor) >= BigInt(p.minPriceMinor) && (p.maxPriceMinor === null || BigInt(price.amountMinor) < BigInt(p.maxPriceMinor)));
  if (!profile) throw new MarketingError('STRATEGY_UNCLASSIFIED', 'This nightly price is outside the published advertising tiers. Contact Encho to review the price basis.', 422);
  return {profile, price};
}

export function canonicalPriceEvidence(row: {id: number; price: unknown; currency: string; rental_mode: string}, observedAt = new Date().toISOString()): CanonicalMarketingPriceEvidence {
  if (row.currency !== 'INR' || row.rental_mode !== 'entire_place') throw new MarketingError('STRATEGY_UNCLASSIFIED', 'Advertising requires an unambiguous entire-stay nightly rate; room pricing needs a selected room product.', 422);
  return priceEvidenceSchema.parse({version: 1, listingId: Number(row.id), currency: row.currency, amountMinor: rupeesToPaise(row.price), basis: 'ENTIRE_STAY_BASE_NIGHT', roomTypeId: null, sourceHash: fingerprint({id: Number(row.id), price: String(row.price), currency: row.currency, basis: row.rental_mode}), observedAt});
}

export const ADTECH_COMPILER_HASH = createHash('sha256').update('ADTECH_V1:meta-v26.0:google-v25:mandatory-district:revision-bound:2026-09-22').digest('hex');
export function validateGeography(entries: readonly StrategyGeographyEvidence[], provider: 'META'|'GOOGLE') {
  if (entries.some(e => e.provider !== provider)) throw new MarketingError('TARGETING_PROVIDER_MISMATCH', 'Targeting evidence belongs to a different provider.', 422);
  if (!entries.some(e => e.kind === 'PROVIDER_REGION_EXCLUSION')) throw new MarketingError('EXCLUSION_UNRESOLVED', 'Resolve and verify the destination district exclusion before publication.', 422);
  if (!entries.some(e => e.kind !== 'PROVIDER_REGION_EXCLUSION')) throw new MarketingError('FEEDERS_UNRESOLVED', 'At least one verified feeder location is required.', 422);
  const keys = entries.map(e => e.kind === 'COORDINATE_RADIUS' ? `${e.kind}:${e.latitude}:${e.longitude}` : `${e.kind}:${e.providerKey}`);
  if (new Set(keys).size !== keys.length) throw new MarketingError('DUPLICATE_GEOGRAPHY', 'Remove duplicate feeder or district entries.', 422);
}
