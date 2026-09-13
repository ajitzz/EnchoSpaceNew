import { z } from 'zod';
import { MarketingError } from '../domain.js';
import type { ConversionUpload } from '../measurement.js';

const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const decimalId = z.string().regex(/^[1-9][0-9]{0,29}$/);
const instant = z.string().datetime({ offset: true });
const consentValue = z.enum(['GRANTED', 'DENIED', 'REVOKED', 'UNKNOWN']);
export const attributionSchema = z.object({
  authority: z.literal('CANONICAL_ATTRIBUTION'), evidenceId: reference, consentRecordId: reference,
  bookingId: reference, orderId: reference, campaignId: z.number().int().positive().safe(),
  hostId: z.number().int().positive().safe(), listingId: z.number().int().positive().safe(),
  provider: z.enum(['GOOGLE', 'META']), externalCampaignId: z.string().min(1).max(200),
  consent: z.object({ measurement: consentValue, adUserData: consentValue, adPersonalization: consentValue, recordedAt: instant }).strict(),
  google: z.object({ customerId: z.string().regex(/^\d{10}$/), conversionActionId: decimalId,
    gclid: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),
    gbraid: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),
    wbraid: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),
  }).strict().optional(),
  meta: z.object({ pixelId: decimalId, eventSourceUrl: z.string().url().max(2048),
    fbc: z.string().regex(/^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]{1,512}$/).optional(),
    fbp: z.string().regex(/^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]{1,512}$/).optional(),
    externalIdSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    userAgent: z.string().min(1).max(1024).refine(v => !/[\r\n]/.test(v)),
  }).strict().optional(),
}).strict();
export type VerifiedConversionAttribution = z.infer<typeof attributionSchema>;
/** Reads accepted first-party attribution and current consent. No default or browser-asserted resolver. */
export type ConversionAttributionResolver = (item: ConversionUpload) => Promise<VerifiedConversionAttribution>;
export interface GoogleConversionConfig {
  customerId: string; servingCustomerId: string; conversionActionId: string; loginCustomerId?: string;
  accessToken: () => Promise<string>; developerToken?: string;
}
export interface MetaConversionConfig { pixelId: string; accessToken: string; allowedOrigins: readonly string[]; }
export type ConversionTransportOptions = { google?: GoogleConversionConfig; meta?: MetaConversionConfig; fetch?: typeof fetch; timeoutMs?: number; now?: () => Date };
export type PreparedConversion = {
  transport: 'GOOGLE_DATA_MANAGER_V1' | 'GOOGLE_ADJUSTMENT_V25' | 'META_CAPI_V26';
  destination: { accountId: string; actionId: string; loginAccountId?: string };
  url: string; body: Record<string, unknown>;
};
export type DeliveryOutcome = { status: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN' | 'PROCESSING'; receipt?: string; code?: string; evidence?: Record<string, unknown> };
export const safeReceipt = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,180}$/.test(v);
export const safeCode = (v: unknown, fallback: string): string => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(v) ? v : fallback;
export function validateAttribution(item: ConversionUpload, raw: unknown, now: Date): VerifiedConversionAttribution {
  const parsed = attributionSchema.safeParse(raw);
  if (!parsed.success) throw new MarketingError('ATTRIBUTION_EVIDENCE_INVALID', 'Accepted attribution evidence is invalid');
  const v = parsed.data;
  for (const key of ['bookingId', 'orderId', 'campaignId', 'hostId', 'listingId', 'provider', 'externalCampaignId'] as const)
    if (v[key] !== item[key]) throw new MarketingError('ATTRIBUTION_BINDING_MISMATCH', 'Attribution identity does not match the canonical conversion');
  if (v.evidenceId !== item.attributionEvidenceId || v.consentRecordId !== item.consentRecordId)
    throw new MarketingError('ATTRIBUTION_BINDING_MISMATCH', 'Attribution or consent reference changed');
  if (v.consent.measurement !== 'GRANTED' || v.consent.adUserData !== 'GRANTED' || Date.parse(v.consent.recordedAt) > now.getTime())
    throw new MarketingError('CONVERSION_CONSENT_REQUIRED', 'Current advertising measurement and user-data consent are required');
  if (v.provider === 'GOOGLE' ? !v.google || !!v.meta : !v.meta || !!v.google)
    throw new MarketingError('ATTRIBUTION_EVIDENCE_INVALID', 'Attribution must identify exactly the intended provider');
  return v;
}
