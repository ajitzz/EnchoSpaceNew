/**
 * ENCHO STRICT PROVIDER SCHEMAS & DRIFT DETECTION ENGINE
 * Validates Meta, Google Ads, Stripe, and Razorpay response contracts to prevent internal truth corruption
 */

import { z } from 'zod';
import { StructuredLogger } from '../observability/structuredLogger.js';
import { AlertService } from '../observability/alertService.js';
import { MetricsRegistry } from '../observability/metricsRegistry.js';

// =========================================================================
// 1. META MARKETING & GRAPH API RESPONSE SCHEMAS
// =========================================================================

export const MetaCampaignResponseSchema = z.object({
  id: z.string().min(1, 'Meta Campaign ID is required'),
  name: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']).optional(),
  objective: z.string().optional()
}).passthrough(); // Allow additive non-breaking fields

export const MetaAdSetResponseSchema = z.object({
  id: z.string().min(1, 'Meta AdSet ID is required'),
  name: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']).optional(),
  campaign_id: z.string().optional(),
  daily_budget: z.union([z.string(), z.number()]).optional()
}).passthrough();

export const MetaCreativeResponseSchema = z.object({
  id: z.string().min(1, 'Meta Creative ID is required'),
  name: z.string().optional()
}).passthrough();

export const MetaAdResponseSchema = z.object({
  id: z.string().min(1, 'Meta Ad ID is required'),
  name: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']).optional(),
  effective_status: z.string().optional(),
  adset_id: z.string().optional(),
  campaign_id: z.string().optional()
}).passthrough();

export const MetaInstagramMediaSchema = z.object({
  id: z.string().min(1, 'Instagram Media ID is required'),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  timestamp: z.string().optional()
}).passthrough();

export const MetaErrorPayloadSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.number(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
    error_user_title: z.string().optional(),
    error_user_msg: z.string().optional()
  }).passthrough()
}).passthrough();

// =========================================================================
// 2. GOOGLE ADS API RESPONSE SCHEMAS
// =========================================================================

export const GoogleAdsCampaignResponseSchema = z.object({
  resourceName: z.string().min(1, 'Google Campaign resourceName required'),
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED', 'UNKNOWN', 'UNSPECIFIED']).optional()
}).passthrough();

export const GoogleAdsAdGroupResponseSchema = z.object({
  resourceName: z.string().min(1, 'Google AdGroup resourceName required'),
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED', 'UNKNOWN', 'UNSPECIFIED']).optional()
}).passthrough();

export const GoogleAdsMutateResultSchema = z.object({
  results: z.array(z.object({
    resourceName: z.string().min(1)
  }).passthrough()).min(1)
}).passthrough();

// =========================================================================
// 3. PAYMENT GATEWAY WEBHOOK SCHEMAS
// =========================================================================

export const StripeWebhookPayloadSchema = z.object({
  id: z.string().min(1, 'Stripe event ID required'),
  type: z.string().min(1, 'Stripe event type required'),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      amount: z.number().optional(),
      currency: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional()
    }).passthrough()
  }).passthrough()
}).passthrough();

export const RazorpayWebhookPayloadSchema = z.object({
  event: z.string().min(1, 'Razorpay event required'),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount: z.number().optional(),
        currency: z.string().optional(),
        status: z.string().optional(),
        order_id: z.string().optional().nullable()
      }).passthrough()
    }).optional()
  }).passthrough()
}).passthrough();

// =========================================================================
// 4. PROVIDER DRIFT DETECTOR & SCHEMA VALIDATION RUNTIME
// =========================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  driftDetected: boolean;
  driftDetails?: string[];
}

export class ProviderDriftDetector {
  /**
   * Validates a provider payload against the expected Zod schema and detects structural drift
   */
  public static validate<T>(
    provider: 'META' | 'GOOGLE' | 'STRIPE' | 'RAZORPAY',
    operation: string,
    schema: z.ZodType<T>,
    rawPayload: any,
    correlationId?: string
  ): ValidationResult<T> {
    if (!rawPayload || typeof rawPayload !== 'object') {
      StructuredLogger.error(`[PROVIDER SCHEMA VIOLATION] Null or non-object payload received for ${provider}:${operation}`, {
        provider,
        operation,
        correlationId,
        outcome: 'FAILED',
        errorCode: 'INVALID_PAYLOAD_TYPE'
      });
      return {
        success: false,
        errors: ['Payload is null or not an object'],
        driftDetected: true,
        driftDetails: ['Received non-object payload']
      };
    }

    const parseResult = schema.safeParse(rawPayload);

    if (!parseResult.success) {
      const issues = (parseResult.error as any).issues || (parseResult.error as any).errors || [];
      const errorMessages = issues.map((e: any) => `${(e.path || []).join('.')}: ${e.message}`);
      
      StructuredLogger.error(`[PROVIDER SCHEMA DRIFT / VIOLATION] Schema validation failed for ${provider}:${operation}`, {
        provider,
        operation,
        correlationId,
        outcome: 'FAILED',
        errorCode: 'SCHEMA_VALIDATION_FAILED',
        validationErrors: errorMessages,
        rawKeys: Object.keys(rawPayload)
      });

      AlertService.emitAlert(
        'PROVIDER_SCHEMA_DRIFT',
        'HIGH',
        `Provider Schema Drift Detected: ${provider} ${operation}`,
        `Payload from ${provider} failed schema contract validation: ${errorMessages.join('; ')}`,
        'Inspect provider API versioning and response payload structure.',
        { provider, operation, correlationId, errors: errorMessages }
      );

      MetricsRegistry.recordReconciliation(true, false);

      return {
        success: false,
        errors: errorMessages,
        driftDetected: true,
        driftDetails: errorMessages
      };
    }

    return {
      success: true,
      data: parseResult.data,
      driftDetected: false
    };
  }
}
