import { hasAsciiControl } from '../intentionalText.js';
import { createHash } from 'node:crypto';

export class MarketingFinanceError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'MarketingFinanceError'; }
}
export type FinanceCurrency = 'INR' | 'USD';
export interface CostPolicyV1 {
  id: string; version: number; currency: FinanceCurrency;
  costCodes: Array<{ code: string; kind: 'MEDIA' | 'SERVICE' | 'NONRECOVERABLE_TAX'; provider?: 'META' | 'GOOGLE' }>;
  accountingApprovalReference: string; taxApprovalReference: string; costScopeReference: string;
  rounding: 'HALF_UP'; varianceHandling: 'PLATFORM_ABSORBS_OVERRUN';
  markupMinBps: number; markupMaxBps: number;
}
export interface FinanceCost { code: string; amountMinor: string }
export interface CampaignQuoteInput {
  campaignId: number; hostId: number; listingId: number; campaignRevision: string;
  costs: FinanceCost[]; remittanceTaxMinor: string; markupBps: number;
  idempotencyKey: string; expiresAt: string;
}
export interface CampaignQuote extends CampaignQuoteInput {
  protocol: 'HARVO_MARKETING_COST_PLUS_V1'; currency: FinanceCurrency; policyId: string; policyVersion: number;
  policyFingerprint: string; costMinor: string; profitMinor: string; totalMinor: string;
  mediaMinor: Record<'META' | 'GOOGLE', string>; quotedAt: string; fingerprint: string;
}

export const MAX_FINANCE_MINOR = 9_223_372_036_854_775_807n;
export function financeError(code: string, message: string): never { throw new MarketingFinanceError(code, message); }
export function identifier(value: unknown, field: string, max = 255): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max || hasAsciiControl(value, true)) financeError('FINANCE_INVALID_INPUT', `${field} is required and must be bounded intentional text.`);
  return value;
}
export function minor(value: unknown, field: string, positive = false): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) financeError('FINANCE_INVALID_MONEY', `${field} must be a decimal integer string in minor units.`);
  const amount = BigInt(value);
  if (amount > MAX_FINANCE_MINOR || (positive && amount === 0n)) financeError('FINANCE_INVALID_MONEY', `${field} is outside the supported amount range.`);
  return amount;
}
export function positiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) financeError('FINANCE_INVALID_INPUT', `${field} must be a positive integer.`);
  return value;
}
export function dateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) financeError('FINANCE_INVALID_INPUT', `${field} must be an ISO UTC timestamp.`);
  const normalized = new Date(value).toISOString();
  if (normalized !== value && normalized !== value.replace('Z', '.000Z')) financeError('FINANCE_INVALID_INPUT', `${field} is not a valid calendar timestamp.`);
  return normalized;
}
export function stableJson(value: unknown): string {
  const seen = new Set<object>();
  const encode = (item: unknown, depth: number): string => {
    if (depth > 20) financeError('FINANCE_INVALID_INPUT', 'Financial evidence nesting is too deep.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isSafeInteger(item)) return JSON.stringify(item);
    if (!item || typeof item !== 'object' || seen.has(item)) financeError('FINANCE_INVALID_INPUT', 'Financial evidence must be finite acyclic JSON.');
    seen.add(item);
    let result: string;
    if (Array.isArray(item)) result = `[${item.map(entry => encode(entry, depth + 1)).join(',')}]`;
    else {
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) financeError('FINANCE_INVALID_INPUT', 'Financial evidence must use plain JSON objects.');
      const object = item as Record<string, unknown>;
      result = `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${encode(object[key], depth + 1)}`).join(',')}}`;
    }
    seen.delete(item); return result;
  };
  const encoded = encode(value, 0);
  if (Buffer.byteLength(encoded) > 256_000) financeError('FINANCE_INVALID_INPUT', 'Financial evidence exceeds the supported size.');
  return encoded;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex');

export function validateCostPolicy(policy: CostPolicyV1): void {
  identifier(policy?.id, 'policy.id', 80); positiveId(policy?.version, 'policy.version');
  if (!['INR', 'USD'].includes(policy?.currency)) financeError('FINANCE_INVALID_INPUT', 'Unsupported policy currency.');
  identifier(policy.accountingApprovalReference, 'accountingApprovalReference');
  identifier(policy.taxApprovalReference, 'taxApprovalReference'); identifier(policy.costScopeReference, 'costScopeReference');
  if (policy.rounding !== 'HALF_UP' || policy.varianceHandling !== 'PLATFORM_ABSORBS_OVERRUN') financeError('FINANCE_POLICY_REQUIRED', 'Explicit supported rounding and variance policy are required.');
  if (![policy.markupMinBps, policy.markupMaxBps].every(n => Number.isInteger(n) && n >= 0 && n <= 10000) || policy.markupMinBps > policy.markupMaxBps) financeError('FINANCE_INVALID_INPUT', 'Explicit markup bounds in basis points are required.');
  if (!Array.isArray(policy.costCodes) || !policy.costCodes.length || policy.costCodes.length > 50) financeError('FINANCE_POLICY_REQUIRED', 'An explicit bounded campaign cost taxonomy is required.');
  const codes = new Set<string>(); let mediaCount = 0;
  for (const line of policy.costCodes) {
    if (!line || !/^[A-Z][A-Z0-9_]{0,49}$/.test(line.code) || codes.has(line.code) || !['MEDIA', 'SERVICE', 'NONRECOVERABLE_TAX'].includes(line.kind)) financeError('FINANCE_INVALID_INPUT', 'Cost taxonomy has an invalid or duplicate code.');
    if (line.kind === 'MEDIA') { if (!['META', 'GOOGLE'].includes(line.provider!)) financeError('FINANCE_INVALID_INPUT', 'Media cost codes require an explicit provider.'); mediaCount++; }
    else if (line.provider !== undefined) financeError('FINANCE_INVALID_INPUT', 'Only media costs have provider allocations.');
    codes.add(line.code);
  }
  if (!mediaCount) financeError('FINANCE_INVALID_INPUT', 'A media allocation is required.');
  stableJson(policy);
}

export function calculateCosts(costs: FinanceCost[], policy: CostPolicyV1) {
  if (!Array.isArray(costs) || costs.length !== policy.costCodes.length) financeError('FINANCE_COST_SCOPE', 'Every approved cost code must appear exactly once, including explicit zero costs.');
  const seen = new Set<string>(); let cost = 0n;
  const media = { META: 0n, GOOGLE: 0n };
  for (const line of costs) {
    const rule = policy.costCodes.find(rule => rule.code === line?.code);
    if (!rule || seen.has(line.code)) financeError('FINANCE_COST_SCOPE', 'Unknown or duplicate campaign cost code.');
    const amount = minor(line.amountMinor, 'cost.amountMinor'); seen.add(line.code); cost += amount;
    if (rule.kind === 'MEDIA') media[rule.provider!] += amount;
  }
  if (cost > MAX_FINANCE_MINOR) financeError('FINANCE_INVALID_MONEY', 'Campaign cost total overflows.');
  return { cost, media };
}

/** No tax rate, tax recovery or processing-fee gross-up is inferred here. */
export function buildCampaignQuote(input: CampaignQuoteInput, policy: CostPolicyV1, quotedAt: string): CampaignQuote {
  validateCostPolicy(policy);
  for (const key of ['campaignId', 'hostId', 'listingId'] as const) positiveId(input?.[key], key);
  identifier(input.campaignRevision, 'campaignRevision'); identifier(input.idempotencyKey, 'idempotencyKey');
  const timestamp = dateTime(quotedAt, 'quotedAt'); const expiresAt = dateTime(input.expiresAt, 'expiresAt');
  if (expiresAt <= timestamp) financeError('FINANCE_QUOTE_EXPIRED', 'Quote expiry must be after creation.');
  if (!Number.isInteger(input.markupBps) || input.markupBps < policy.markupMinBps || input.markupBps > policy.markupMaxBps) financeError('FINANCE_MARKUP_POLICY', 'Markup is outside the explicit policy bounds.');
  const { cost, media } = calculateCosts(input.costs, policy);
  if (cost <= 0n || media.META + media.GOOGLE <= 0n) financeError('FINANCE_INVALID_MONEY', 'A positive campaign cost and media budget are required.');
  const tax = minor(input.remittanceTaxMinor, 'remittanceTaxMinor');
  const profit = (cost * BigInt(input.markupBps) + 5000n) / 10000n;
  const total = cost + profit + tax;
  if (total > MAX_FINANCE_MINOR) financeError('FINANCE_INVALID_MONEY', 'Campaign charge overflows.');
  const quote = { ...input, costs: [...input.costs].sort((a, b) => a.code.localeCompare(b.code)), expiresAt,
    protocol: 'HARVO_MARKETING_COST_PLUS_V1' as const, currency: policy.currency, policyId: policy.id, policyVersion: policy.version,
    policyFingerprint: fingerprint(policy), costMinor: cost.toString(), profitMinor: profit.toString(), totalMinor: total.toString(),
    mediaMinor: { META: media.META.toString(), GOOGLE: media.GOOGLE.toString() }, quotedAt: timestamp,
  };
  const { idempotencyKey: _key, quotedAt: _time, ...semantic } = quote;
  return { ...quote, fingerprint: fingerprint(semantic) };
}
