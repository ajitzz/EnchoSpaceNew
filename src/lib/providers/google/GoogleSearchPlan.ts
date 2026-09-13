import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { ProviderPublishRequest } from '../types.js';
import type { GoogleMutateOperation } from './GoogleAdsClient.js';
import { GoogleAdsError } from './googleErrors.js';

/**
 * M1 builds one explicitly configured, paused Search hierarchy. It does not
 * authorize spend, establish policy compliance, verify property facts, or upload
 * images/video. Existing media and revision metadata are bound to the fingerprint
 * so an approval cannot be reused after those inputs change.
 *
 * Provider contracts checked 2026-09-13:
 * https://developers.google.com/google-ads/api/rest/examples#grouped_operations
 * https://developers.google.com/google-ads/api/docs/responsive-search-ads/create-responsive-search-ads
 * https://support.google.com/google-ads/answer/7684791
 * https://developers.google.com/google-ads/api/docs/targeting/location-targeting
 * https://developers.google.com/google-ads/api/docs/api-policy/eu-par
 * https://raw.githubusercontent.com/googleapis/googleapis/master/google/ads/googleads/v25/resources/campaign.proto
 *
 * Temporary negative resource IDs are legal request-local references. The caller
 * must persist only IDs returned by Google and execute with partialFailure=false.
 */
export interface GoogleSearchConfig {
  version: 1;
  headlines: string[];
  descriptions: string[];
  keywords: Array<{ text: string; matchType: 'EXACT' | 'PHRASE' }>;
  geoTargetConstants: string[];
  languageConstants: string[];
  geoMode: 'PRESENCE' | 'PRESENCE_OR_INTEREST';
  budgetMode?: 'DAILY' | 'CAMPAIGN_TOTAL';
  dailyBudgetMinor?: number;
  bidding: 'MAXIMIZE_CONVERSIONS';
  containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';
}

export interface GoogleSearchPlan {
  operations: GoogleMutateOperation[];
  fingerprint: string;
  expectedResourceTypes: string[];
  dailyBudgetMinor?: number;
  budgetMode: 'DAILY' | 'CAMPAIGN_TOTAL';
  budgetMinor: number;
  customerId: string;
}

function invalid(field: string, expectation: string): never {
  throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', `${field}: ${expectation}`, {
    statusCode: 400, errorClass: 'VALIDATION', isRetryable: false,
  });
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    invalid(field, 'must be a plain object');
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(field, 'must be a positive safe integer');
  }
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value ||
      value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    invalid(field, `must be intentional text of 1–${max} characters without surrounding whitespace or control characters`);
  }
  return value;
}

function textArray(value: unknown, field: string, min: number, max: number, textMax: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    invalid(field, `must contain ${min}–${max} entries`);
  }
  const result = value.map(item => text(item, field, textMax));
  if (new Set(result).size !== result.length) invalid(field, 'must contain distinct entries');
  return result;
}

function publicHttpsUrl(value: unknown, field: string): URL {
  const raw = text(value, field, 2048);
  let url: URL;
  try { url = new URL(raw); } catch { invalid(field, 'must be an absolute HTTPS URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port ||
      !raw.startsWith('https://') || isIP(host.replace(/^\[|\]$/g, '')) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host)) {
    invalid(field, 'must use a public HTTPS domain without credentials, fragments or custom ports');
  }
  return url;
}

function calendarDate(value: unknown, field: string): string {
  const date = text(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid(field, 'must be a calendar date in YYYY-MM-DD format');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < '2000-01-01') {
    invalid(field, 'must be a valid calendar date from year 2000 onward');
  }
  return date;
}

function canonicalJson(value: unknown, seen = new Set<object>(), depth = 0): string {
  if (depth > 32) invalid('request', 'JSON nesting exceeds the supported limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || !value) invalid('request', 'must contain only finite JSON values');
  if (seen.has(value)) invalid('request', 'must not contain circular data');
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map(item => canonicalJson(item, seen, depth + 1)).join(',')}]`;
  } else {
    const obj = record(value, 'request');
    result = `{${Object.keys(obj).filter(key => obj[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(obj[key], seen, depth + 1)}`).join(',')}}`;
  }
  seen.delete(value);
  return result;
}

export function buildGoogleSearchPlan(
  request: ProviderPublishRequest,
  customerId: string,
  allowedLandingOrigin: string,
): GoogleSearchPlan {
  record(request, 'request');
  for (const field of ['campaignId', 'hostId', 'listingId'] as const) positiveInteger(request[field], field);
  text(request.idempotencyKey, 'idempotencyKey', 255);
  text(request.correlationId, 'correlationId', 255);
  // Leave room for the stable campaign prefix within provider name limits.
  const title = text(request.title, 'title', 90);
  if (request.objective !== 'BOOKINGS') invalid('objective', 'M1 supports only an explicit BOOKINGS objective');
  if (typeof customerId !== 'string' || !/^\d{10}$/.test(customerId)) {
    invalid('customerId', 'must be the explicit serving customer ID with ten digits and no separators');
  }
  record(request.budget, 'budget');
  const totalBudget = positiveInteger(request.budget.minor_units, 'budget.minor_units');
  if (!['INR', 'USD'].includes(request.budget.currency)) invalid('budget.currency', 'M1 supports INR and USD only');
  const audience = record(request.targetAudience, 'targetAudience');
  textArray(audience.locations, 'targetAudience.locations', 1, 100, 120);
  // Location names are approved display context; resolved Google constants below
  // are the targeting authority. Do not silently discard unsupported restrictions.
  for (const field of ['interests', 'genders'] as const) {
    if (audience[field] !== undefined && (!Array.isArray(audience[field]) || audience[field].length !== 0)) {
      invalid(`targetAudience.${field}`, 'is unsupported for Search M1');
    }
  }
  if (audience.ageMin !== undefined || audience.ageMax !== undefined) invalid('targetAudience', 'age restrictions are unsupported for Search M1');
  record(request.creativeAssets, 'creativeAssets');
  const headline = text(request.creativeAssets.headline, 'creativeAssets.headline', 30);
  const origin = publicHttpsUrl(allowedLandingOrigin, 'allowedLandingOrigin');
  if (origin.pathname !== '/' || origin.search) invalid('allowedLandingOrigin', 'must contain only the trusted website origin');
  const landing = publicHttpsUrl(request.creativeAssets.landingPageUrl, 'creativeAssets.landingPageUrl');
  if (landing.origin !== origin.origin || landing.search ||
      !/^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(landing.pathname) ||
      request.creativeAssets.landingPageUrl !== landing.href) {
    invalid('creativeAssets.landingPageUrl', 'must be an exact canonical /stay/<slug> URL on the trusted origin without query parameters');
  }
  // Search M1 is text-only; a supplied media URL is retained, never fetched or attached.
  if (request.creativeAssets.mediaUrl !== '') publicHttpsUrl(request.creativeAssets.mediaUrl, 'creativeAssets.mediaUrl');
  const metadata = record(request.metadata, 'metadata');
  const config = record(metadata.googleSearch, 'metadata.googleSearch');
  const permittedKeys = ['version', 'headlines', 'descriptions', 'keywords', 'geoTargetConstants',
    'languageConstants', 'geoMode', 'dailyBudgetMinor', 'budgetMode', 'bidding', 'containsEuPoliticalAdvertising'];
  if (Object.keys(config).some(key => !permittedKeys.includes(key))) invalid('metadata.googleSearch', 'contains unsupported settings');
  if (config.version !== 1) invalid('metadata.googleSearch.version', 'must be 1');
  const headlines = textArray(config.headlines, 'googleSearch.headlines', 3, 15, 30);
  const descriptions = textArray(config.descriptions, 'googleSearch.descriptions', 2, 4, 90);
  if (!headlines.includes(headline)) invalid('googleSearch.headlines', 'must include the approved creative headline');
  if (request.creativeAssets.description !== undefined &&
      !descriptions.includes(text(request.creativeAssets.description, 'creativeAssets.description', 90))) {
    invalid('googleSearch.descriptions', 'must include the approved creative description');
  }
  if (request.creativeAssets.primaryText !== undefined &&
      !descriptions.includes(text(request.creativeAssets.primaryText, 'creativeAssets.primaryText', 90))) {
    invalid('googleSearch.descriptions', 'must include the approved primary text');
  }
  const budgetMode = config.budgetMode ?? 'DAILY';
  if (budgetMode !== 'DAILY' && budgetMode !== 'CAMPAIGN_TOTAL') invalid('googleSearch.budgetMode', 'must be DAILY or CAMPAIGN_TOTAL');
  const dailyBudgetMinor = budgetMode === 'DAILY' || config.dailyBudgetMinor !== undefined ? positiveInteger(config.dailyBudgetMinor, 'googleSearch.dailyBudgetMinor') : undefined;
  if (dailyBudgetMinor !== undefined && dailyBudgetMinor > totalBudget) invalid('googleSearch.dailyBudgetMinor', 'must not exceed total campaign authorization');
  const budgetMinor = budgetMode === 'CAMPAIGN_TOTAL' ? totalBudget : dailyBudgetMinor!;
  const budgetMicros = BigInt(budgetMinor) * 10_000n;
  if (budgetMicros > 9_223_372_036_854_775_807n) invalid(budgetMode==='DAILY'?'googleSearch.dailyBudgetMinor':'budget.minor_units', 'exceeds Google signed 64-bit micros');
  if (config.bidding !== 'MAXIMIZE_CONVERSIONS') invalid('googleSearch.bidding', 'requires explicit MAXIMIZE_CONVERSIONS');
  if (config.containsEuPoliticalAdvertising !== 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING') {
    invalid('googleSearch.containsEuPoliticalAdvertising', 'requires an explicit non-EU-political-advertising declaration');
  }
  if (config.geoMode !== 'PRESENCE' && config.geoMode !== 'PRESENCE_OR_INTEREST') invalid('googleSearch.geoMode', 'requires an explicit supported presence mode');
  const locations = textArray(config.geoTargetConstants, 'googleSearch.geoTargetConstants', 1, 100, 64);
  const languages = textArray(config.languageConstants, 'googleSearch.languageConstants', 1, 50, 64);
  if (locations.some(value => !/^geoTargetConstants\/[1-9]\d*$/.test(value))) invalid('googleSearch.geoTargetConstants', 'must contain resolved geoTargetConstants resource names');
  if (languages.some(value => !/^languageConstants\/[1-9]\d*$/.test(value))) invalid('googleSearch.languageConstants', 'must contain resolved languageConstants resource names');
  if (!Array.isArray(config.keywords) || config.keywords.length < 1 || config.keywords.length > 200) invalid('googleSearch.keywords', 'must contain 1–200 explicit keywords');
  const keywords = config.keywords.map(value => {
    const keyword = record(value, 'googleSearch.keywords');
    if (Object.keys(keyword).some(key => !['text', 'matchType'].includes(key))) invalid('googleSearch.keywords', 'contains unsupported keyword settings');
    const keywordText = text(keyword.text, 'googleSearch.keywords.text', 80);
    if (keywordText.split(/\s+/).length > 10) invalid('googleSearch.keywords.text', 'must not exceed ten words');
    if (keyword.matchType !== 'EXACT' && keyword.matchType !== 'PHRASE') invalid('googleSearch.keywords.matchType', 'must be EXACT or PHRASE');
    return { text: keywordText, matchType: keyword.matchType };
  });
  if (new Set(keywords.map(keyword => `${keyword.matchType}:${keyword.text.toLowerCase()}`)).size !== keywords.length) {
    invalid('googleSearch.keywords', 'must not contain duplicate text/match-type pairs');
  }
  const hasStart = request.startTime !== undefined;
  const hasEnd = request.endTime !== undefined;
  if (hasStart !== hasEnd) invalid('campaign dates', 'startTime and endTime must be supplied together');
  if (budgetMode === 'CAMPAIGN_TOTAL' && !hasStart) invalid('campaign dates', 'campaign total budgets require explicit start and end dates');
  let dates: Record<string, string> = {};
  if (hasStart) {
    const start = calendarDate(request.startTime, 'startTime');
    const end = calendarDate(request.endTime, 'endTime');
    if (end < start) invalid('endTime', 'must be on or after startTime');
    const calendarDays = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (budgetMode === 'CAMPAIGN_TOTAL' && (calendarDays < 3 || calendarDays > 90)) invalid('campaign dates', 'Search campaign total budgets require 3–90 calendar days, inclusive');
    // Google interprets these full-day bounds in the serving customer's timezone.
    dates = { startDateTime: `${start} 00:00:00`, endDateTime: `${end} 23:59:59` };
  }
  const budgetResource = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResource = `customers/${customerId}/campaigns/-2`;
  const adGroupResource = `customers/${customerId}/adGroups/-3`;
  const operations: GoogleMutateOperation[] = [
    { campaignBudgetOperation: { create: {
      resourceName: budgetResource, name: `Encho ${request.campaignId} — ${title} budget`,
      deliveryMethod: 'STANDARD', explicitlyShared: false,
      ...(budgetMode === 'CAMPAIGN_TOTAL' ? { period: 'CUSTOM_PERIOD', totalAmountMicros: budgetMicros.toString() } : { amountMicros: budgetMicros.toString() }),
    } } },
    { campaignOperation: { create: {
      resourceName: campaignResource, name: `Encho ${request.campaignId} — ${title}`,
      advertisingChannelType: 'SEARCH', status: 'PAUSED', campaignBudget: budgetResource,
      maximizeConversions: {}, containsEuPoliticalAdvertising: config.containsEuPoliticalAdvertising,
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: config.geoMode }, ...dates,
    } } },
    { adGroupOperation: { create: {
      resourceName: adGroupResource, campaign: campaignResource,
      name: `Encho ${request.campaignId} — ${title}`, status: 'PAUSED', type: 'SEARCH_STANDARD',
    } } },
    { adGroupAdOperation: { create: {
      adGroup: adGroupResource, status: 'PAUSED', ad: {
        responsiveSearchAd: { headlines: headlines.map(value => ({ text: value })), descriptions: descriptions.map(value => ({ text: value })) },
        finalUrls: [landing.href],
      },
    } } },
    ...locations.map(location => ({ campaignCriterionOperation: { create: { campaign: campaignResource, location: { geoTargetConstant: location } } } })),
    ...languages.map(language => ({ campaignCriterionOperation: { create: { campaign: campaignResource, language: { languageConstant: language } } } })),
    ...keywords.map(keyword => ({ adGroupCriterionOperation: { create: { adGroup: adGroupResource, status: 'PAUSED', keyword } } })),
  ];
  const { idempotencyKey: _idempotencyKey, correlationId: _correlationId, ...semanticRequest } = request;
  const fingerprintInput = canonicalJson({ version: 1, customerId, allowedLandingOrigin: origin.origin, request: semanticRequest, operations });
  if (Buffer.byteLength(fingerprintInput, 'utf8') > 1_000_000) invalid('request', 'exceeds the supported semantic payload size');
  return {
    operations, fingerprint: createHash('sha256').update(fingerprintInput).digest('hex'), customerId, dailyBudgetMinor, budgetMode, budgetMinor,
    expectedResourceTypes: ['campaignBudgets', 'campaigns', 'adGroups', 'adGroupAds',
      ...locations.map(() => 'campaignCriteria'), ...languages.map(() => 'campaignCriteria'), ...keywords.map(() => 'adGroupCriteria')],
  };
}
