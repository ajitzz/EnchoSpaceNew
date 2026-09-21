import {z} from 'zod';

export const tierCodeSchema = z.enum(['BUDGET', 'COMFORT', 'PREMIUM']);
export type AdtechTierCode = z.infer<typeof tierCodeSchema>;
export const minorSchema = z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(v => BigInt(v) <= 9223372036854775807n, 'Amount exceeds storage precision');
export const positiveMinorSchema = minorSchema.refine(v => BigInt(v) > 0n, 'Amount must be positive');
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const rangeSchema = z.object({min: positiveMinorSchema, max: positiveMinorSchema}).strict()
  .refine(v => BigInt(v.min) <= BigInt(v.max), 'Minimum must not exceed maximum');
export const metaPlacementSchema = z.enum(['FB_FEED', 'FB_STORIES', 'FB_REELS', 'IG_FEED', 'IG_STORIES', 'IG_REELS']);
export const profileSchema = z.object({
  contractVersion: z.literal(1), tier: tierCodeSchema, currency: z.literal('INR'),
  minPriceMinor: positiveMinorSchema, maxPriceMinor: positiveMinorSchema.nullable(),
  budget: z.object({total: rangeSchema, daily: rangeSchema, cacHypothesis: rangeSchema}).strict(),
  meta: z.object({
    apiVersion: z.literal('v26.0'), objective: z.enum(['OUTCOME_SALES', 'OUTCOME_LEADS']),
    conversionEvent: z.enum(['PURCHASE', 'LEAD']), optimizationGoal: z.literal('OFFSITE_CONVERSIONS'),
    attribution: z.enum(['1d_click', '1d_click_1d_view', '7d_click_1d_view']),
    placementMode: z.enum(['MANUAL', 'ADVANTAGE_PLUS']), placements: z.array(metaPlacementSchema).min(1).max(6),
    ageMin: z.number().int().min(18).max(65), ageMax: z.number().int().min(18).max(65),
    genders: z.array(z.union([z.literal(1), z.literal(2)])).max(2),
    bidStrategy: z.enum(['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP']), bidCapMinor: positiveMinorSchema.nullable(),
    specialAdCategories: z.array(z.literal('HOUSING')).max(1),
  }).strict(),
  google: z.object({
    apiVersion: z.literal('v25'), bidding: z.literal('MAXIMIZE_CONVERSIONS'), targetCpaMinor: positiveMinorSchema.nullable(),
    geoMode: z.enum(['PRESENCE', 'PRESENCE_OR_INTEREST']), matchTypes: z.array(z.enum(['EXACT', 'PHRASE'])).min(1).max(2),
    negativeKeywords: z.array(z.object({text: z.string().trim().min(1).max(80), matchType: z.enum(['EXACT', 'PHRASE'])}).strict()).max(200),
  }).strict(),
  ai: z.object({minimumScore: z.number().min(0).max(10)}).strict(),
  hostOverrides: z.object({enabled: z.boolean(), maxFeeders: z.number().int().min(1).max(20), minRadiusKm: z.number().positive().max(1000), maxRadiusKm: z.number().positive().max(1000)}).strict(),
}).strict().superRefine((v, c) => {
  if (v.maxPriceMinor !== null && BigInt(v.maxPriceMinor) <= BigInt(v.minPriceMinor)) c.addIssue({code:'custom',path:['maxPriceMinor'],message:'Price interval must be nonempty'});
  if (v.meta.ageMin > v.meta.ageMax) c.addIssue({code:'custom',path:['meta','ageMax'],message:'Age range is inverted'});
  if (new Set(v.meta.placements).size !== v.meta.placements.length || new Set(v.meta.genders).size !== v.meta.genders.length || new Set(v.google.matchTypes).size !== v.google.matchTypes.length) c.addIssue({code:'custom',message:'Repeated options are not allowed'});
  if ((v.meta.bidStrategy === 'LOWEST_COST_WITH_BID_CAP') !== (v.meta.bidCapMinor !== null)) c.addIssue({code:'custom',path:['meta','bidCapMinor'],message:'Bid cap must match bid strategy'});
  if ((v.meta.objective === 'OUTCOME_SALES') !== (v.meta.conversionEvent === 'PURCHASE')) c.addIssue({code:'custom',path:['meta','conversionEvent'],message:'Objective and conversion event must agree'});
  if (v.hostOverrides.minRadiusKm > v.hostOverrides.maxRadiusKm) c.addIssue({code:'custom',path:['hostOverrides'],message:'Radius range is inverted'});
});
export type AdtechProfile = z.infer<typeof profileSchema>;

export const priceEvidenceSchema = z.object({
  version: z.literal(1), listingId: z.number().int().positive().safe(), currency: z.literal('INR'), amountMinor: positiveMinorSchema,
  basis: z.enum(['ENTIRE_STAY_BASE_NIGHT', 'ROOM_TYPE_BASE_NIGHT']), roomTypeId: z.number().int().positive().safe().nullable(),
  sourceHash: hashSchema, observedAt: z.iso.datetime(),
}).strict().refine(v => (v.basis === 'ROOM_TYPE_BASE_NIGHT') === (v.roomTypeId !== null), 'Price basis must identify its sellable unit');
export type CanonicalMarketingPriceEvidence = z.infer<typeof priceEvidenceSchema>;

const coordinate = {latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180)};
const geoBase = {
  provider: z.enum(['META', 'GOOGLE']), label: z.string().trim().min(1).max(160), country: z.literal('IN'),
  apiVersion: z.enum(['v26.0', 'v25']), verifiedAt: z.iso.datetime(), evidenceHash: hashSchema,
};
const radius = {radiusKm: z.number().finite().positive().max(1000)};
export const geographyEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({...geoBase, ...coordinate, ...radius, kind: z.literal('PROVIDER_CITY_RADIUS'), providerKey: z.string().min(1).max(120)}).strict(),
  z.object({...geoBase, ...coordinate, ...radius, kind: z.literal('COORDINATE_RADIUS')}).strict(),
  z.object({...geoBase, kind: z.literal('PROVIDER_REGION_EXCLUSION'), providerKey: z.string().min(1).max(120), administrativeLevel: z.literal('DISTRICT')}).strict(),
]).refine(v => v.apiVersion === (v.provider === 'META' ? 'v26.0' : 'v25'), 'Geography belongs to a different API version');
export type StrategyGeographyEvidence = z.infer<typeof geographyEvidenceSchema>;
export const strategySchema = z.object({
  version: z.literal(1), provider: z.enum(['META', 'GOOGLE']), releaseId: z.number().int().positive().safe(),
  profileVersionId: z.number().int().positive().safe(), corridorVersionId: z.number().int().positive().safe(),
  price: priceEvidenceSchema, profile: profileSchema, geography: z.array(geographyEvidenceSchema).min(2).max(40),
  compilerContract: z.literal('ADTECH_V1'), compilerContractHash: hashSchema,
  hostOverrides: z.array(z.object({evidenceHash: hashSchema, radiusKm: z.number().positive().max(1000)}).strict()).max(20),
  snapshotHash: hashSchema,
}).strict();
export type ResolvedCampaignStrategy = z.infer<typeof strategySchema>;
export const strategySelectionSchema = z.object({
  releaseId:z.number().int().positive().safe(),profileVersionId:z.number().int().positive().safe(),
  corridorVersionId:z.number().int().positive().safe(),priceHash:hashSchema,
  feederHashes:z.array(hashSchema).min(1).max(20).optional(),
  overrides:z.array(z.object({evidenceHash:hashSchema,radiusKm:z.number().positive().max(1000)}).strict()).max(20),
}).strict();
export type StrategySelection = z.infer<typeof strategySelectionSchema>;

export const reasonSchema = z.string().trim().min(10).max(2000);
export const saveProfileSchema = z.object({expectedVersion: z.number().int().min(0).safe(), profile: profileSchema, reason: reasonSchema}).strict();
export const publishReleaseSchema = z.object({expectedReleaseId: z.number().int().positive().safe().nullable(), versionIds: z.array(z.number().int().positive().safe()).length(3), reason: reasonSchema}).strict();
