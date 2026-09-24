import type {RequestHandler} from 'express';
import {MetricsRegistry} from '../../lib/observability/metricsRegistry.js';

export type RetiredMarketingSurface = 'CAMPAIGN_MUTATION' | 'MARKETING_AUTOMATION' | 'CLIENT_TELEMETRY' | 'FINANCIAL_MUTATION';

/** Match Express's default case-insensitive, optional-trailing-slash routing. */
export function retiredMarketingSurface(method: string, path: string): RetiredMarketingSurface | null {
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  if (/^\/api\/(?:marketing\/v2|webhooks\/marketing\/v2)(?:\/|$)/.test(normalized)) return null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && (
    /^\/api\/(?:admin\/)?marketing\/campaigns(?:\/|$)/.test(normalized)
    || /^\/api\/(?:admin\/)?campaigns\//.test(normalized)
  )) return 'CAMPAIGN_MUTATION';
  if (/^\/api\/payments\/geo-route\/(?:detect|initiate)$/.test(normalized)
    || /^\/api\/admin\/payments\/escrow\/release$/.test(normalized)) return 'FINANCIAL_MUTATION';
  if (/^\/api\/telemetry\/pixel-event$/.test(normalized)) return 'CLIENT_TELEMETRY';
  if (/^\/api\/marketing\/(?:wallet\/refuel|simulate-webhook|pre-flight-check|copilot|grade-targeting|ai-generate-copy|social\/publish|track(?:\/|$)|pixel$|leads\/webhook$)/.test(normalized)
    || /^\/api\/admin\/marketing\/(?:replay|rollback|dlq\/resolve|kill-switch)/.test(normalized)
    || /^\/api\/host\/social-posts\/[^/]+\/boost$/.test(normalized)
    || /^\/api\/marketing\/leads\/[^/]+\/convert-booking$/.test(normalized)) return 'MARKETING_AUTOMATION';
  return null;
}

/** Legacy operations cannot bypass review, captured funding or provider authorization. */
export const legacyMarketingBoundary: RequestHandler = (req, res, next) => {
  const surface = retiredMarketingSurface(req.method, req.path);
  if (!surface) return next();
  // Fixed-cardinality families reveal remaining callers without retaining URL
  // parameters, lead IDs, referrers, cookies or arbitrary request payloads.
  MetricsRegistry.recordDeprecatedSurface(surface);
  res.status(410).json({
    error: 'This legacy paid-marketing operation has been retired. Open the campaign studio to use revision-bound review, verified funding and provider controls.',
    code: 'HARVO_V2_REQUIRED',
  });
};
