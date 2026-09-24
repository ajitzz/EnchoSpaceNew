import type {Request, RequestHandler} from 'express';
import {z} from 'zod';
import {currentExecutionContext} from '../../lib/observability/executionContext.js';
import {diagnosticIdSchema} from '../../shared/platform/apiError.js';

export const legacyListingAssistanceFeatureSchema = z.enum(['CURATE_RULES', 'NEARBY_RADAR', 'SENSORY_TAGS']);
export type LegacyListingAssistanceFeature = z.infer<typeof legacyListingAssistanceFeatureSchema>;

const retiredFeatures = {
  CURATE_RULES: {
    reason: 'RULE_MEANING_NOT_VERIFIED',
    message: 'Automatic rule rewriting is unavailable. Enter guidelines manually and preserve the original rules.',
  },
  NEARBY_RADAR: {
    reason: 'NEARBY_FACTS_NOT_VERIFIED',
    message: 'Verified nearby suggestions are unavailable. Add only places and distances you can verify.',
  },
  SENSORY_TAGS: {
    reason: 'AMENITY_CLAIMS_NOT_VERIFIED',
    message: 'Automatic feature suggestions are unavailable. Select only features verified for this property.',
  },
} as const;

export const listingAssistanceUnavailableSchema = z.object({
  code: z.literal('GROUNDED_LISTING_ASSISTANCE_UNAVAILABLE'),
  error: z.string().min(1).max(200),
  retryability: z.literal('DO_NOT_RETRY'),
  details: z.object({
    feature: legacyListingAssistanceFeatureSchema,
    reason: z.enum(['RULE_MEANING_NOT_VERIFIED', 'NEARBY_FACTS_NOT_VERIFIED', 'AMENITY_CLAIMS_NOT_VERIFIED']),
  }).strict(),
  correlationId: diagnosticIdSchema.optional(),
  operationId: diagnosticIdSchema.optional(),
}).strict();

const accountIdSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)]);
type PersistedAccountRequest = Request & {user?: {id?: unknown}};

/**
 * Mount immediately after authenticateToken on the three legacy listing-only
 * routes. This permanently terminates the request before their ungrounded
 * provider/fallback code, without inspecting, logging or echoing request data.
 * Existing saved listing data and marketing-v2 evaluation remain unchanged.
 */
export function createLegacyListingAssistanceBoundary(feature: LegacyListingAssistanceFeature): RequestHandler {
  const kind = legacyListingAssistanceFeatureSchema.parse(feature);
  const definition = retiredFeatures[kind];
  return (req, res): void => {
    res.setHeader('Cache-Control', 'no-store');
    if (!accountIdSchema.safeParse((req as PersistedAccountRequest).user?.id).success) {
      res.status(401).json({code: 'AUTHENTICATION_REQUIRED', error: 'Sign in to continue.'});
      return;
    }
    const context = currentExecutionContext();
    res.status(503).json(listingAssistanceUnavailableSchema.parse({
      code: 'GROUNDED_LISTING_ASSISTANCE_UNAVAILABLE',
      error: definition.message,
      retryability: 'DO_NOT_RETRY',
      details: {feature: kind, reason: definition.reason},
      ...(context ? {correlationId: context.correlationId, operationId: context.operationId} : {}),
    }));
  };
}
