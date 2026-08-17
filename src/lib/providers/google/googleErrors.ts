/**
 * Google Ads Provider Error Definitions
 * ENCHO Advertising Operating System
 */

import { ProviderError } from '../types.js';

export type GoogleErrorCode =
  | 'GOOGLE_AUTH_EXPIRED'
  | 'GOOGLE_RATE_LIMIT'
  | 'GOOGLE_TIMEOUT'
  | 'GOOGLE_HTTP_5XX'
  | 'GOOGLE_INVALID_ARGUMENT'
  | 'GOOGLE_POLICY_DISAPPROVAL'
  | 'GOOGLE_MISSING_CUSTOMER'
  | 'GOOGLE_MISSING_CAMPAIGN'
  | 'GOOGLE_MISSING_AD_GROUP'
  | 'GOOGLE_MISSING_AD'
  | 'GOOGLE_PARTIAL_CREATION'
  | 'GOOGLE_BUDGET_MISMATCH'
  | 'GOOGLE_OWNERSHIP_MISMATCH'
  | 'GOOGLE_UNKNOWN_OUTCOME'
  | 'GOOGLE_TELEMETRY_UNAVAILABLE'
  | 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION'
  | 'GOOGLE_INTERNAL_ERROR';

export class GoogleAdsError extends Error {
  public readonly code: GoogleErrorCode;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly errorClass: ProviderError['errorClass'];
  public readonly details?: Record<string, any>;

  constructor(
    code: GoogleErrorCode,
    message: string,
    options: {
      statusCode?: number;
      isRetryable?: boolean;
      errorClass?: ProviderError['errorClass'];
      details?: Record<string, any>;
    } = {}
  ) {
    super(message);
    this.name = 'GoogleAdsError';
    this.code = code;
    this.statusCode = options.statusCode || 500;
    this.isRetryable = options.isRetryable ?? false;
    this.errorClass = options.errorClass || 'INTERNAL';
    this.details = options.details;
  }

  public toProviderError(): ProviderError {
    return {
      code: this.code,
      message: this.message,
      provider: 'GOOGLE',
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      errorClass: this.errorClass,
      details: this.details
    };
  }
}
