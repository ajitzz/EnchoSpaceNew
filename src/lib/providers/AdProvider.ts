/**
 * AdProvider Interface
 * ENCHO Advertising Operating System
 *
 * All advertising networks (Meta, Google Ads, etc.) must implement this contract.
 * Provider adapters must encapsulate all network-specific SDKs, protocols, and micro-conversions.
 */

import {
  ProviderId,
  ProviderCapabilitySet,
  ProviderPublishRequest,
  ProviderPublishResult,
  ProviderControlRequest,
  ProviderControlResult,
  ProviderBudgetUpdateRequest,
  NormalizedDeliveryTruth,
  NormalizedTelemetrySnapshot,
  ProviderReconciliationReport
} from './types.js';

export interface AdProvider {
  readonly providerId: ProviderId;
  readonly apiVersion: string;
  readonly capabilities: ProviderCapabilitySet;

  /**
   * Validates provider credentials and master account connectivity.
   */
  validateCredentials(): Promise<{
    isValid: boolean;
    accountId: string;
    permissions: string[];
    details?: Record<string, any>;
  }>;

  /**
   * Health and latency ping.
   */
  checkHealth(): Promise<{
    status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
    latencyMs: number;
    lastCheckedAt: string;
  }>;

  /**
   * Creates or activates complete advertising object hierarchy in 2-Phase Commit.
   */
  createCampaignHierarchy(
    request: ProviderPublishRequest,
    poolOrClient?: any
  ): Promise<ProviderPublishResult>;

  /**
   * Validates that external IDs are owned by the authorized ENCHO Master Account.
   */
  validateHierarchyOwnership(
    campaignId: number,
    externalIds: {
      externalCampaignId?: string;
      externalContainerId?: string;
      externalAdId?: string;
    },
    poolOrClient?: any
  ): Promise<boolean>;

  /**
   * Transitions campaign state to PAUSED.
   */
  pauseCampaign(
    request: ProviderControlRequest,
    poolOrClient?: any
  ): Promise<ProviderControlResult>;

  /**
   * Transitions campaign state to LIVE / ACTIVE.
   */
  resumeCampaign(
    request: ProviderControlRequest,
    poolOrClient?: any
  ): Promise<ProviderControlResult>;

  /**
   * Safely updates campaign budget respecting authorized financial limits.
   */
  updateBudget(
    request: ProviderBudgetUpdateRequest,
    poolOrClient?: any
  ): Promise<ProviderControlResult>;

  /**
   * Queries authoritative ad delivery state from the provider network.
   */
  fetchAuthoritativeDeliveryTruth(
    externalCampaignId: string,
    poolOrClient?: any
  ): Promise<NormalizedDeliveryTruth>;

  /**
   * Reconciles remote object hierarchy with Encho local state.
   */
  reconcileHierarchy(
    campaignId: number,
    externalIds: {
      externalCampaignId?: string;
      externalContainerId?: string;
      externalAdId?: string;
    },
    poolOrClient?: any
  ): Promise<ProviderReconciliationReport>;

  /**
   * Ingests and normalizes raw telemetry snapshots.
   */
  fetchTelemetrySnapshot(
    externalCampaignId: string,
    dateWindow: { startDate: string; endDate: string },
    poolOrClient?: any
  ): Promise<NormalizedTelemetrySnapshot>;
}
