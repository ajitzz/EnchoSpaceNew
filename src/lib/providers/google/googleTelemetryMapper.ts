/**
 * Google Ads Telemetry & Budget Mapper
 * ENCHO Advertising Operating System
 *
 * Implements pure budget conversion to Google Micros and telemetry normalization
 * with zero NaN, Infinity, or division by zero.
 */

import { MoneyAmount, NormalizedTelemetrySnapshot } from '../types.js';
import { GoogleAdsError } from './googleErrors.js';

export interface GoogleRawMetrics {
  impressions?: number | string;
  clicks?: number | string;
  cost_micros?: number | string;
  conversions?: number | string;
  conversions_value?: number | string;
  search_impression_share?: number | string;
  quality_score?: number | string;
  absolute_top_impression_percentage?: number | string;
  interaction_rate?: number | string;
  bidding_strategy_type?: string;
}

export class GoogleTelemetryMapper {
  /**
   * Pure Budget Converter: MoneyAmount (minor units / cents) -> Google Micros ($1.00 = 1,000,000 micros)
   * Invariant: 1 Cent (minor unit) = 10,000 Google Micros
   */
  public static toGoogleMicros(money: MoneyAmount): number {
    if (!money || typeof money !== 'object') {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', 'Invalid MoneyAmount object provided.');
    }

    if (!money.currency || typeof money.currency !== 'string' || money.currency.trim().length !== 3) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `Invalid ISO currency code: ${money.currency}`);
    }

    const minorUnits = money.minor_units;

    if (typeof minorUnits !== 'number' || !Number.isFinite(minorUnits)) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `minor_units must be a finite number, received: ${minorUnits}`);
    }

    if (!Number.isInteger(minorUnits)) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `Fractional minor_units prohibited. Received: ${minorUnits}`);
    }

    if (minorUnits < 0) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `Negative budget amount prohibited: ${minorUnits}`);
    }

    // Overflow check: Google Ads max daily budget limit (approx $1M / 100M minor units)
    const MAX_ALLOWED_MINOR_UNITS = 100_000_000; // $1,000,000.00
    if (minorUnits > MAX_ALLOWED_MINOR_UNITS) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `Budget exceeds maximum supported ceiling: ${minorUnits}`);
    }

    // 1 minor unit = 10,000 micros (e.g. 100 cents = $1.00 = 1,000,000 micros)
    const micros = minorUnits * 10_000;

    if (!Number.isSafeInteger(micros)) {
      throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `Integer overflow encountered in Google Micros conversion.`);
    }

    return micros;
  }

  /**
   * Converts Google Micros back to MoneyAmount
   */
  public static fromGoogleMicros(micros: number | string, currency: string = 'USD'): MoneyAmount {
    const rawMicros = typeof micros === 'string' ? Number(micros) : micros;
    if (typeof rawMicros !== 'number' || !Number.isFinite(rawMicros) || rawMicros < 0) {
      return { currency, minor_units: 0 };
    }
    const minorUnits = Math.floor(rawMicros / 10_000);
    return {
      currency,
      minor_units: minorUnits
    };
  }

  /**
   * Normalizes raw Google Metrics into canonical NormalizedTelemetrySnapshot
   */
  public static normalizeSnapshot(
    externalCampaignId: string,
    raw: GoogleRawMetrics,
    window: { startDate: string; endDate: string },
    currency: string = 'USD'
  ): NormalizedTelemetrySnapshot {
    const impressions = Math.max(0, Number(raw.impressions || 0));
    const clicks = Math.max(0, Number(raw.clicks || 0));
    const costMicros = Math.max(0, Number(raw.cost_micros || 0));
    const conversions = Math.max(0, Number(raw.conversions || 0));

    const spend = this.fromGoogleMicros(costMicros, currency);
    const spendDecimal = spend.minor_units / 100;

    // Guard against NaN / Division by zero
    const ctr = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0.0;
    const cpc = clicks > 0 ? Number((spendDecimal / clicks).toFixed(4)) : 0.0;
    const cpm = impressions > 0 ? Number(((spendDecimal / impressions) * 1000).toFixed(4)) : 0.0;

    return {
      provider: 'GOOGLE',
      externalCampaignId,
      dateStart: window.startDate,
      dateEnd: window.endDate,
      impressions,
      clicks,
      spend,
      conversions,
      ctr,
      cpc,
      cpm,
      providerMetadata: {
        search_impression_share: raw.search_impression_share ? Number(raw.search_impression_share) : undefined,
        quality_score: raw.quality_score ? Number(raw.quality_score) : undefined,
        absolute_top_impression_percentage: raw.absolute_top_impression_percentage ? Number(raw.absolute_top_impression_percentage) : undefined,
        interaction_rate: raw.interaction_rate ? Number(raw.interaction_rate) : undefined,
        bidding_strategy_type: raw.bidding_strategy_type || 'MAXIMIZE_CONVERSIONS',
        raw_cost_micros: costMicros
      },
      observedAt: new Date().toISOString(),
      dataFreshness: 'FRESH'
    };
  }
}
