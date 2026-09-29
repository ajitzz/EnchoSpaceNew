import type { StudioCampaign } from './types';
import { money, observedTime } from './api';

export type MediaMeterReportState =
  | 'AVAILABLE'
  | 'REPORTED_ZERO'
  | 'OVERRUN'
  | 'STALE'
  | 'ERROR'
  | 'NO_REPORT'
  | 'NOT_STARTED'
  | 'MISMATCH'
  | 'UNCONFIGURED'
  | 'UNAVAILABLE'
  | 'HISTORICAL_UNVERIFIED';

export interface NormalizedMediaMeterEvidence {
  status: MediaMeterReportState;
  isAvailable: boolean;
  isStale: boolean;
  isOverrun: boolean;
  isReportedZero: boolean;
  currency: string;
  plannedMediaMinor: string | null;
  reportedSpendMinor: string | null;
  capturedHostChargeMinor: string | null;
  refundableMinor: string | null;
  utilizationPercent: number | null;
  rawPercent: number | null;
  basisPoints: bigint | null;
  headline: string;
  statusLabel: string;
  subtext: string;
  ariaLabel: string;
  ariaValueText: string;
  observedAt: string | null;
  lastSuccessfulObservedAt: string | null;
  dataAsOf: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  accountTimeZone: string | null;
  mismatchReason?: string;
  desiredStatus?: string | null;
  observedStatus?: string | null;
}

export interface NormalizeMediaEvidenceOptions {
  now?: number;
  freshnessWindowMs?: number;
}

export function normalizeMediaMeterEvidence(
  campaign: StudioCampaign,
  options?: NormalizeMediaEvidenceOptions
): NormalizedMediaMeterEvidence {
  const now = options?.now ?? Date.now();
  const freshnessWindowMs = options?.freshnessWindowMs ?? 20 * 60 * 1000;
  const budget = campaign.mediaBudgetMinor;
  const m = campaign.metrics;
  const quoteCurrency = campaign.quote?.currency;
  const currency = m?.currency || quoteCurrency || 'INR';

  const capturedHostChargeMinor = campaign.funding?.capturedMinor || null;
  const refundableMinor = campaign.funding?.refundableMinor || null;
  const desiredStatus = campaign.delivery?.configuredStatus || null;
  const observedStatus = campaign.delivery?.observedStatus || null;

  if (typeof budget !== 'string' || !/^[1-9]\d*$/.test(budget)) {
    return {
      status: 'UNCONFIGURED',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: null,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Budget not configured',
      subtext: 'Budget usage will appear when a compatible report is available.',
      ariaLabel: 'Media budget not configured',
      ariaValueText: 'Media budget is not configured for this campaign.',
      observedAt: null,
      lastSuccessfulObservedAt: null,
      dataAsOf: null,
      dateStart: null,
      dateEnd: null,
      accountTimeZone: null,
      desiredStatus,
      observedStatus,
    };
  }

  if (!m || !m.report) {
    return {
      status: 'NO_REPORT',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Waiting for report',
      subtext: 'Waiting for the first network report. Budget usage will appear when a compatible report is available.',
      ariaLabel: 'Waiting for the first network report',
      ariaValueText: `Media plan: ${money(budget, currency)}. Waiting for first network report.`,
      observedAt: null,
      lastSuccessfulObservedAt: null,
      dataAsOf: null,
      dateStart: null,
      dateEnd: null,
      accountTimeZone: null,
      desiredStatus,
      observedStatus,
    };
  }

  const reportStatus = m.report.status;
  if (reportStatus === 'NO_REPORT' && !(typeof m.spendMinor === 'string' && /^\d+$/.test(m.spendMinor))) {
    return {
      status: 'NO_REPORT',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Waiting for first network report',
      subtext: 'Waiting for the first network report. Budget usage will appear when a compatible report is available.',
      ariaLabel: 'Waiting for the first network report',
      ariaValueText: `Media plan: ${money(budget, currency)}. Waiting for first network report.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  if (reportStatus === 'NOT_STARTED') {
    return {
      status: 'NOT_STARTED',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Campaign reporting has not started',
      subtext: 'Campaign reporting has not started.',
      ariaLabel: 'Campaign reporting has not started',
      ariaValueText: `Media plan: ${money(budget, currency)}. Reporting has not started.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }


function isValidIsoDate(d: string): boolean {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parts = d.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, day));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === day;
}

interface EvidenceCompatibilityResult {
  mismatchReason?: string;
  isUnboundIdentity?: boolean;
}

function checkEvidenceCompatibility(
  campaign: StudioCampaign,
  m: NonNullable<StudioCampaign['metrics']>,
  quoteCurrency?: string | null,
  currentTimestamp = now
): EvidenceCompatibilityResult {
  const metaSources = ['META', 'META_INSIGHTS', 'META_MARKETING_API'];
  const googleSources = ['GOOGLE', 'GOOGLE_ADS_API', 'GOOGLE_SEARCH'];

  if (!m.currency) {
    return { mismatchReason: 'Report currency is missing.' };
  }
  if (quoteCurrency && m.currency !== quoteCurrency) {
    return { mismatchReason: `Report currency (${m.currency}) does not match quote currency (${quoteCurrency}).` };
  }
  if (!m.source) {
    return { mismatchReason: 'Report provider source is missing.' };
  }
  if (campaign.provider === 'META' && !metaSources.includes(m.source)) {
    return { mismatchReason: `Report source (${m.source}) does not match Meta provider.` };
  }
  if (campaign.provider === 'GOOGLE' && !googleSources.includes(m.source)) {
    return { mismatchReason: `Report source (${m.source}) does not match Google provider.` };
  }

  // Server-owned identity conflicts (MISMATCH)
  if (m.campaignId != null && m.campaignId !== campaign.id) {
    return { mismatchReason: `Report campaign ID (${m.campaignId}) does not match campaign (${campaign.id}).` };
  }
  if (m.revision != null && m.revision !== campaign.revision) {
    return { mismatchReason: `Report revision (${m.revision}) does not match campaign revision (${campaign.revision}).` };
  }
  if (m.budgetBasisMinor != null && m.budgetBasisMinor !== campaign.mediaBudgetMinor) {
    return { mismatchReason: 'Report budget basis does not match planned media budget.' };
  }

  // Spend integer format check (if spendMinor is present)
  if (m.spendMinor != null && (typeof m.spendMinor !== 'string' || !/^\d+$/.test(m.spendMinor))) {
    return { mismatchReason: 'Reported spend amount is not in a valid integer format.' };
  }
  if (m.report?.status === 'AVAILABLE' && m.spendMinor == null) {
    return { mismatchReason: 'Available report has no provider-reported spend amount.' };
  }
  // Legacy rows without server-owned revision/budget identity may be shown only
  // as unverified history. Never calculate utilization from them.
  if (m.campaignId == null || m.revision == null || m.budgetBasisMinor == null) {
    return { isUnboundIdentity: true };
  }

  // Observation window validation based on provider request and account timezone semantics
  if (!m.dateStart) {
    return { mismatchReason: 'Report flight start date is missing.' };
  }
  if (!m.dateEnd) {
    return { mismatchReason: 'Report flight end date is missing.' };
  }
  if (!isValidIsoDate(m.dateStart)) {
    return { mismatchReason: `Report flight start date (${m.dateStart}) is not a valid calendar date.` };
  }
  if (!isValidIsoDate(m.dateEnd)) {
    return { mismatchReason: `Report flight end date (${m.dateEnd}) is not a valid calendar date.` };
  }
  if (m.dateStart > m.dateEnd) {
    return { mismatchReason: `Report flight start date (${m.dateStart}) cannot be after end date (${m.dateEnd}).` };
  }
  if (campaign.startDate) {
    if (!isValidIsoDate(campaign.startDate)) {
      return { mismatchReason: `Campaign scheduled start date (${campaign.startDate}) is not a valid calendar date.` };
    }
    if (m.dateStart !== campaign.startDate) {
      return { mismatchReason: `Report flight start (${m.dateStart}) does not match campaign start date (${campaign.startDate}).` };
    }
  }

  // If campaign.endDate is defined, report observation cannot exceed scheduled flight end
  if (campaign.endDate) {
    if (!isValidIsoDate(campaign.endDate)) {
      return { mismatchReason: `Campaign scheduled end date (${campaign.endDate}) is not a valid calendar date.` };
    }
    if (m.dateEnd > campaign.endDate) {
      return { mismatchReason: `Report flight end (${m.dateEnd}) exceeds scheduled campaign end date (${campaign.endDate}).` };
    }
  }

  // Account timezone semantics: resolve current calendar date in the ad account's local timezone
  if (!m.accountTimeZone) {
    return { mismatchReason: 'Report account time zone is missing.' };
  }
  let currentAccountDate: string;
  try {
    currentAccountDate = new Intl.DateTimeFormat('en-CA', { timeZone: m.accountTimeZone }).format(new Date(currentTimestamp));
  } catch {
    return { mismatchReason: `Report account time zone '${m.accountTimeZone}' is invalid.` };
  }

  // A provider report window cannot specify a date in the future of the account's timezone calendar.
  // Note: provider dataAsOf freshness remains separate from the requested/returned report window bound (dateEnd).
  if (m.dateEnd > currentAccountDate) {
    return {
      mismatchReason: `Report flight end (${m.dateEnd}) cannot be in the future (current date in ${m.accountTimeZone} is ${currentAccountDate}).`,
    };
  }

  return {};
}

  const hasPriorSpend = typeof m.spendMinor === 'string' && /^\d+$/.test(m.spendMinor);

  if (reportStatus === 'ACCOUNT_TIMEZONE_UNAVAILABLE' && !hasPriorSpend) {
    return {
      status: 'UNAVAILABLE',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Account time zone unavailable',
      subtext: 'Ad account timezone could not be determined. Awaiting provider account verification.',
      ariaLabel: 'Ad account timezone unavailable',
      ariaValueText: `Media plan: ${money(budget, currency)}. Ad account timezone unavailable.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: null,
      dateStart: null,
      dateEnd: null,
      accountTimeZone: null,
      desiredStatus,
      observedStatus,
    };
  }

  // Check evidence compatibility BEFORE processing ERROR or AVAILABLE spend
  const { mismatchReason, isUnboundIdentity } = checkEvidenceCompatibility(campaign, m, quoteCurrency, now);

  if (mismatchReason) {
    return {
      status: 'MISMATCH',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Incompatible report evidence',
      subtext: 'Budget usage will appear when a compatible report is available.',
      ariaLabel: 'Incompatible report evidence',
      ariaValueText: `Budget usage unavailable: ${mismatchReason}`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      mismatchReason,
      desiredStatus,
      observedStatus,
    };
  }

  if (isUnboundIdentity) {
    return {
      status: 'HISTORICAL_UNVERIFIED',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency: m.currency || currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: hasPriorSpend ? m.spendMinor! : null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget (Unbound telemetry)',
      statusLabel: 'Historical telemetry · unbound report identity',
      subtext: 'This report does not carry server-verified campaign or revision identity. Reported spend is preserved as historical evidence, but utilization percentage is unavailable.',
      ariaLabel: 'Historical unverified media budget evidence',
      ariaValueText: `Historical telemetry: ${hasPriorSpend ? money(m.spendMinor!, m.currency || currency) : 'No spend'} reported against ${money(budget, m.currency || currency)} media plan (unbound identity; utilization unverified).`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: m.observedAt || null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  if (reportStatus === 'ERROR' || reportStatus === 'NO_REPORT') {
    if (hasPriorSpend) {
      const noNewReport = reportStatus === 'NO_REPORT';
      const spent = BigInt(m.spendMinor!);
      const planned = BigInt(budget);
      const basisPoints = (spent * 10000n) / planned;
      const rawPercent = Number(basisPoints) / 100;
      const utilizationPercent = Number(basisPoints > 10000n ? 10000n : basisPoints) / 100;
      const isOverrun = spent > planned;
      const isReportedZero = spent === 0n;
      const observedAt = m.observedAt || null;
      return {
        status: 'STALE',
        isAvailable: false,
        isStale: true,
        isOverrun,
        isReportedZero,
        currency: m.currency || currency,
        plannedMediaMinor: budget,
        reportedSpendMinor: m.spendMinor!,
        capturedHostChargeMinor,
        refundableMinor,
        utilizationPercent,
        rawPercent,
        basisPoints,
        headline: noNewReport ? 'Media budget (Older report · no new network report)' : 'Media budget (Older report · refresh error)',
        statusLabel: noNewReport ? 'No new network report · older report retained' : 'Report refresh error · older report retained',
        subtext: `${noNewReport ? 'The network returned no new report' : 'Latest report refresh resulted in an error'}. Retaining older reported spend from ${observedTime(observedAt)} (${money(m.spendMinor!, m.currency || currency)} reported).`,
        ariaLabel: noNewReport ? 'Reported media budget (older report retained; no new network report)' : 'Reported media budget (older report retained after error)',
        ariaValueText: `${noNewReport ? 'No new network report' : 'Refresh error'}: retaining older report of ${money(m.spendMinor!, m.currency || currency)} against ${money(budget, m.currency || currency)} planned media`,
        observedAt,
        lastSuccessfulObservedAt: observedAt,
        dataAsOf: m.dataAsOf || null,
        dateStart: m.dateStart || null,
        dateEnd: m.dateEnd || null,
        accountTimeZone: m.accountTimeZone || null,
        desiredStatus,
        observedStatus,
      };
    }

    return {
      status: 'ERROR',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Report refresh needs attention',
      subtext: 'Report refresh needs attention. Retrying or awaiting provider response.',
      ariaLabel: 'Report refresh needs attention',
      ariaValueText: `Media plan: ${money(budget, currency)}. Latest report refresh resulted in an error.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  if (reportStatus === 'ACCOUNT_TIMEZONE_UNAVAILABLE') {
    if (hasPriorSpend) {
      const spent = BigInt(m.spendMinor!);
      const planned = BigInt(budget);
      const basisPoints = (spent * 10000n) / planned;
      const rawPercent = Number(basisPoints) / 100;
      const utilizationPercent = Number(basisPoints > 10000n ? 10000n : basisPoints) / 100;
      const isOverrun = spent > planned;
      const observedAt = m.observedAt || null;
      return {
        status: 'STALE',
        isAvailable: false,
        isStale: true,
        isOverrun,
        isReportedZero: false,
        currency: m.currency || currency,
        plannedMediaMinor: budget,
        reportedSpendMinor: m.spendMinor!,
        capturedHostChargeMinor,
        refundableMinor,
        utilizationPercent,
        rawPercent,
        basisPoints,
        headline: 'Media budget (Older report · timezone unavailable)',
        statusLabel: 'Account time zone unavailable · older report retained',
        subtext: `Ad account timezone could not be determined. Retaining older reported spend from ${observedTime(observedAt)} (${money(m.spendMinor!, m.currency || currency)} reported).`,
        ariaLabel: 'Reported media budget (older report retained after timezone lookup failure)',
        ariaValueText: `Timezone lookup failure: retaining older report of ${money(m.spendMinor!, m.currency || currency)} against ${money(budget, m.currency || currency)} planned media`,
        observedAt,
        lastSuccessfulObservedAt: observedAt,
        dataAsOf: null,
        dateStart: m.dateStart || null,
        dateEnd: m.dateEnd || null,
        accountTimeZone: m.accountTimeZone || null,
        desiredStatus,
        observedStatus,
      };
    }

    return {
      status: 'UNAVAILABLE',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Account time zone unavailable',
      subtext: 'Ad account timezone could not be determined. Awaiting provider account verification.',
      ariaLabel: 'Ad account timezone unavailable',
      ariaValueText: `Media plan: ${money(budget, currency)}. Ad account timezone unavailable.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: null,
      dateStart: null,
      dateEnd: null,
      accountTimeZone: null,
      desiredStatus,
      observedStatus,
    };
  }

  if (reportStatus !== 'AVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      isAvailable: false,
      isStale: false,
      isOverrun: false,
      isReportedZero: false,
      currency,
      plannedMediaMinor: budget,
      reportedSpendMinor: null,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: null,
      rawPercent: null,
      basisPoints: null,
      headline: 'Media budget',
      statusLabel: 'Report status unavailable',
      subtext: `Network report status '${reportStatus}' is not recognized.`,
      ariaLabel: 'Network report status unavailable',
      ariaValueText: `Media plan: ${money(budget, currency)}. Network report status is unrecognized.`,
      observedAt: m.observedAt || null,
      lastSuccessfulObservedAt: null,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  const observedAt = m.observedAt || null;
  const parsedObserved = observedAt ? Date.parse(observedAt) : NaN;
  const isFutureDated = Number.isFinite(parsedObserved) && parsedObserved > now + 60_000;
  const isPastFreshness = !Number.isFinite(parsedObserved) || now - parsedObserved > freshnessWindowMs;
  const isStale = isFutureDated || isPastFreshness;

  const spent = BigInt(m.spendMinor!);
  const planned = BigInt(budget);
  const basisPoints = (spent * 10000n) / planned;
  const rawPercent = Number(basisPoints) / 100;
  const utilizationPercent = Number(basisPoints > 10000n ? 10000n : basisPoints) / 100;
  const isOverrun = spent > planned;
  const isReportedZero = spent === 0n;

  const currencyNote = m.dataAsOf
    ? `data current through ${observedTime(m.dataAsOf)}`
    : 'network data currency unknown (provider reports delayed data)';
  const retrievalNote = `latest report retrieved at ${observedTime(observedAt)}`;
  const flightWindowStr = m.dateStart && m.dateEnd
    ? `${m.dateStart} → ${m.dateEnd}`
    : (campaign.startDate && campaign.endDate ? `${campaign.startDate} → ${campaign.endDate}` : 'flight window');

  if (isStale) {
    return {
      status: 'STALE',
      isAvailable: false,
      isStale: true,
      isOverrun,
      isReportedZero,
      currency: m.currency!,
      plannedMediaMinor: budget,
      reportedSpendMinor: m.spendMinor!,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent,
      rawPercent,
      basisPoints,
      headline: 'Media budget (Older report)',
      statusLabel: 'Older report · refresh pending',
      subtext: `Older report · refresh pending (Last successful report: ${observedTime(observedAt)}; ${currencyNote})`,
      ariaLabel: 'Reported media budget consumed',
      ariaValueText: `Older report: ${money(m.spendMinor!, m.currency!)} reported against ${money(budget, m.currency!)} planned media as of ${observedTime(observedAt)} (refresh pending)`,
      observedAt,
      lastSuccessfulObservedAt: observedAt,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  if (isOverrun) {
    return {
      status: 'OVERRUN',
      isAvailable: true,
      isStale: false,
      isOverrun: true,
      isReportedZero: false,
      currency: m.currency!,
      plannedMediaMinor: budget,
      reportedSpendMinor: m.spendMinor!,
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent,
      rawPercent,
      basisPoints,
      headline: 'Reported media usage',
      statusLabel: 'Spend exceeds media plan',
      subtext: `Reported spend exceeds the media plan (${money(m.spendMinor!, m.currency!)} reported / ${money(budget, m.currency!)} plan). ${retrievalNote}; ${currencyNote}. Encho operations must reconcile the overage.`,
      ariaLabel: 'Reported media budget consumed',
      ariaValueText: `${money(m.spendMinor!, m.currency!)} reported against ${money(budget, m.currency!)} planned media`,
      observedAt,
      lastSuccessfulObservedAt: observedAt,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  if (isReportedZero) {
    const zeroSubtext = `Provider reported ${money('0', m.currency!)} for ${flightWindowStr}, retrieved ${observedTime(observedAt)}; network reports can be delayed and later corrections remain possible.`;
    return {
      status: 'REPORTED_ZERO',
      isAvailable: true,
      isStale: false,
      isOverrun: false,
      isReportedZero: true,
      currency: m.currency!,
      plannedMediaMinor: budget,
      reportedSpendMinor: '0',
      capturedHostChargeMinor,
      refundableMinor,
      utilizationPercent: 0,
      rawPercent: 0,
      basisPoints: 0n,
      headline: 'Reported media usage',
      statusLabel: `Reported ${money('0', m.currency!)} (delayed)`,
      subtext: zeroSubtext,
      ariaLabel: 'Reported media budget consumed',
      ariaValueText: `${money('0', m.currency!)} reported against ${money(budget, m.currency!)} planned media`,
      observedAt,
      lastSuccessfulObservedAt: observedAt,
      dataAsOf: m.dataAsOf || null,
      dateStart: m.dateStart || null,
      dateEnd: m.dateEnd || null,
      accountTimeZone: m.accountTimeZone || null,
      desiredStatus,
      observedStatus,
    };
  }

  return {
    status: 'AVAILABLE',
    isAvailable: true,
    isStale: false,
    isOverrun: false,
    isReportedZero: false,
    currency: m.currency!,
    plannedMediaMinor: budget,
    reportedSpendMinor: m.spendMinor!,
    capturedHostChargeMinor,
    refundableMinor,
    utilizationPercent,
    rawPercent,
    basisPoints,
    headline: 'Reported media usage',
    statusLabel: `${utilizationPercent.toFixed(1)}% reported usage`,
    subtext: `${money(m.spendMinor!, m.currency!)} reported / ${money(budget, m.currency!)} media plan. ${retrievalNote}; ${currencyNote}`,
    ariaLabel: 'Reported media budget consumed',
    ariaValueText: `${money(m.spendMinor!, m.currency!)} reported against ${money(budget, m.currency!)} planned media. ${retrievalNote}`,
    observedAt,
    lastSuccessfulObservedAt: observedAt,
    dataAsOf: m.dataAsOf || null,
    dateStart: m.dateStart || null,
    dateEnd: m.dateEnd || null,
    accountTimeZone: m.accountTimeZone || null,
    desiredStatus,
    observedStatus,
  };
}
