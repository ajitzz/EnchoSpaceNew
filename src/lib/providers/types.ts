/**
 * Provider-Neutral Domain Types
 * ENCHO Advertising Operating System
 *
 * Core rule: No provider-specific units (e.g. micros, cents, paise) in domain interfaces.
 * All monetary amounts are represented as MoneyAmount { currency, minor_units }.
 */

export type ProviderId = 'META' | 'GOOGLE' | 'TIKTOK' | 'MOCK';

export type ProviderEntityType = 
  | 'CAMPAIGN' 
  | 'AD_SET' 
  | 'AD_GROUP' 
  | 'AD' 
  | 'CREATIVE' 
  | 'ASSET' 
  | 'ASSET_SET';

export interface MoneyAmount {
  currency: string;
  minor_units: number; // Stored in base currency subunits (e.g. cents, paise)
}

export type NormalizedDeliveryState =
  | 'LIVE'
  | 'PAUSED'
  | 'REVIEWING'
  | 'DISAPPROVED'
  | 'NOT_DELIVERING'
  | 'UNKNOWN'
  | 'RECONCILIATION_REQUIRED';

export interface ProviderCapabilitySet {
  supportsCreativeMutation: boolean;
  supportsVariantPause: boolean;
  supportsBudgetMutation: boolean;
  supportsHierarchyRollback: boolean;
  supportsRealtimeWebhook: boolean;
  supportsTelemetryInsights: boolean;
  supportsAssetLevelTargeting: boolean;
}

export interface ProviderEntity {
  id?: number;
  campaign_id: number;
  provider: ProviderId;
  entity_type: ProviderEntityType;
  external_id: string;
  parent_entity_id?: string | null;
  account_id: string;
  configured_status: string;
  effective_status: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderHierarchy {
  campaignId: number;
  provider: ProviderId;
  externalCampaignId: string;
  externalContainerId?: string; // adset_id or ad_group_id
  externalAdId?: string;
  externalCreativeId?: string;
  entities: ProviderEntity[];
  rawMetadata?: Record<string, any>;
}

export interface ProviderPublishRequest {
  campaignId: number;
  hostId: number;
  listingId: number;
  title: string;
  objective: string;
  budget: MoneyAmount;
  startTime?: string;
  endTime?: string;
  targetAudience: {
    locations: string[];
    interests?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
  };
  creativeAssets: {
    headline: string;
    description?: string;
    primaryText?: string;
    mediaUrl: string;
    mediaType?: 'IMAGE' | 'VIDEO';
    callToAction?: string;
    landingPageUrl: string;
  };
  idempotencyKey: string;
  correlationId: string;
  metadata?: Record<string, any>;
}

export interface ProviderPublishResult {
  success: boolean;
  provider: ProviderId;
  externalCampaignId?: string;
  externalContainerId?: string; // adset_id / ad_group_id
  externalAdId?: string;
  externalCreativeId?: string;
  hierarchy: ProviderHierarchy;
  isDuplicate?: boolean;
  error?: ProviderError;
  rawResponse?: Record<string, any>;
}

export interface ProviderControlRequest {
  campaignId: number;
  externalCampaignId: string;
  action: 'PAUSE' | 'RESUME';
  reason?: string;
  actorType: 'host' | 'admin' | 'circuit_breaker' | 'system';
  actorId?: string | number;
  idempotencyKey: string;
  correlationId: string;
}

export interface ProviderControlResult {
  success: boolean;
  provider: ProviderId;
  externalCampaignId: string;
  previousStatus: string;
  newStatus: string;
  normalizedDeliveryState: NormalizedDeliveryState;
  modifiedAt: string;
  error?: ProviderError;
}

export interface ProviderBudgetUpdateRequest {
  campaignId: number;
  externalCampaignId: string;
  externalContainerId?: string;
  newBudget: MoneyAmount;
  authorizedLimit: MoneyAmount;
  idempotencyKey: string;
  correlationId: string;
}

export interface NormalizedDeliveryTruth {
  provider: ProviderId;
  externalCampaignId: string;
  normalizedState: NormalizedDeliveryState;
  rawStatus: string;
  rawEffectiveStatus: string;
  isLive: boolean;
  isServingImpressions: boolean;
  disapprovalReasons?: string[];
  lastObservedAt: string;
  reconciliationRequired: boolean;
}

export interface NormalizedTelemetrySnapshot {
  provider: ProviderId;
  externalCampaignId: string;
  dateStart: string;
  dateEnd: string;
  impressions: number;
  clicks: number;
  spend: MoneyAmount;
  reach?: number;
  frequency?: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  providerMetadata?: Record<string, any>;
  observedAt: string;
  dataFreshness: 'FRESH' | 'DELAYED' | 'STALE' | 'UNAVAILABLE';
}

export interface ProviderReconciliationReport {
  campaignId: number;
  provider: ProviderId;
  isConsistent: boolean;
  remoteStatus: string;
  localStatus: string;
  normalizedState: NormalizedDeliveryState;
  skewDetected: boolean;
  skewDetails?: string;
  autoCorrected: boolean;
  auditTimestamp: string;
}

export interface ProviderError {
  code: string;
  message: string;
  provider: ProviderId;
  statusCode?: number;
  isRetryable: boolean;
  errorClass: 'AUTHENTICATION' | 'RATE_LIMIT' | 'TIMEOUT' | 'POLICY' | 'VALIDATION' | 'INTERNAL' | 'UNKNOWN';
  details?: Record<string, any>;
}
