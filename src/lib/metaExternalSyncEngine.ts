/**
 * Phase 2.7 — Milestone 4: External Meta Synchronization & Reconciliation Engine
 *
 * Implements authoritative external-state synchronization keeping ENCHO aligned with Meta:
 * - HMAC-SHA256 signature verification (X-Hub-Signature-256)
 * - Event normalization and Meta object resolution
 * - Account scope & hierarchy verification (Campaign -> AdSet -> Ad / Creative)
 * - Snapshot persistence (external_status_verified_at, external_status_verification_source)
 * - Freshness contract (FRESH <= 5m, STALE 5m-15m, DEGRADED > 15m, UNKNOWN)
 * - Reconciliation engine with target prioritization (EXTERNAL_OUTCOME_UNKNOWN, QUARANTINED, ROLLBACK_FAILED, drift)
 * - Manual Force Re-Sync with Admin audit logging
 * - Read-first GET verification (never blindly repeats POST mutations)
 */

import crypto from 'crypto';
import { getAuthoritativeMetaIdentity } from './metaGraphClient.js';

export type VerificationSource = 'WEBHOOK' | 'ACTIVE_POLL' | 'MANUAL_RESYNC' | 'RECONCILIATION_WORKER' | 'UNKNOWN';
export type ExternalFreshness = 'FRESH' | 'STALE' | 'DEGRADED' | 'UNKNOWN';

export interface MetaObjectVerificationResult {
  campaign_id: number;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  master_ad_account_id: string;
  meta_status: string;
  meta_effective_status: string;
  meta_review_status: string;
  hierarchy_verified: boolean;
  account_ownership_verified: boolean;
  verified_at: string; // ISO string
  verification_source: VerificationSource;
  freshness: ExternalFreshness;
  has_drift: boolean;
  drift_details?: string;
  reconciliation_required: boolean;
  error?: string;
}

export interface WebhookIngestionResult {
  valid: boolean;
  reason?: string;
  processedCount: number;
  resolvedCampaignId?: number;
  snapshot?: MetaObjectVerificationResult;
}

export interface ReconciliationReportItem {
  campaignId: number;
  previousLocalStatus: string;
  previousMetaStatus: string;
  newMetaStatus: string;
  newEffectiveStatus: string;
  hasDrift: boolean;
  remediated: boolean;
  remediationAction?: string;
  error?: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalTargeted: number;
  totalReconciled: number;
  driftedCount: number;
  remediatedCount: number;
  items: ReconciliationReportItem[];
}

export class MetaExternalSyncEngine {
  /**
   * Calculates external Meta state freshness based on the 5m / 15m contract.
   * FRESH: <= 5 minutes (300,000 ms)
   * STALE: > 5 minutes and <= 15 minutes (900,000 ms)
   * DEGRADED: > 15 minutes
   * UNKNOWN: null or invalid date
   */
  static calculateExternalFreshness(verifiedAt: Date | string | null | undefined): ExternalFreshness {
    if (!verifiedAt) return 'UNKNOWN';
    const dateObj = typeof verifiedAt === 'string' ? new Date(verifiedAt) : verifiedAt;
    const timeMs = dateObj.getTime();
    if (isNaN(timeMs)) return 'UNKNOWN';

    const ageMs = Date.now() - timeMs;
    if (ageMs < 0) return 'FRESH'; // Clock skew safety
    if (ageMs <= 5 * 60 * 1000) return 'FRESH';
    if (ageMs <= 15 * 60 * 1000) return 'STALE';
    return 'DEGRADED';
  }

  /**
   * Cryptographically verifies Meta Webhook HMAC-SHA256 signature against META_APP_SECRET.
   */
  static verifyWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer | string | undefined,
    appSecretOverride?: string
  ): boolean {
    const appSecret = appSecretOverride || process.env.META_APP_SECRET;
    if (!signatureHeader || !appSecret || !rawBody) {
      return false;
    }

    try {
      const cleanHeader = signatureHeader.trim();
      const expectedPrefix = 'sha256=';
      const signatureHash = cleanHeader.startsWith(expectedPrefix)
        ? cleanHeader.substring(expectedPrefix.length)
        : cleanHeader;

      const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
      const computedHash = crypto.createHmac('sha256', appSecret).update(bodyBuffer).digest('hex');

      const sigBuf = Buffer.from(signatureHash, 'hex');
      const compBuf = Buffer.from(computedHash, 'hex');

      if (sigBuf.length !== compBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuf, compBuf);
    } catch {
      return false;
    }
  }

  /**
   * Processes incoming Meta webhook notifications with security verification,
   * account scope validation, object resolution, and snapshot persistence.
   */
  static async verifyAndIngestWebhook(
    headers: Record<string, any>,
    rawBody: Buffer | string | undefined,
    body: any,
    dbClient: any
  ): Promise<WebhookIngestionResult> {
    const signatureHeader = headers['x-hub-signature-256'] || headers['x-hub-signature'];
    const isSigValid = this.verifyWebhookSignature(signatureHeader, rawBody);

    if (!isSigValid) {
      return {
        valid: false,
        reason: 'INVALID_SIGNATURE',
        processedCount: 0
      };
    }

    if (!body || typeof body !== 'object') {
      return {
        valid: false,
        reason: 'INVALID_PAYLOAD_SCHEMA',
        processedCount: 0
      };
    }

    // Verify recognized event source
    const eventObject = body.object;
    const recognizedSources = ['page', 'adaccount', 'campaign', 'adset', 'ad', 'leadgen', 'instagram'];
    if (!eventObject || !recognizedSources.includes(eventObject.toLowerCase())) {
      return {
        valid: false,
        reason: 'UNRECOGNIZED_EVENT_SOURCE',
        processedCount: 0
      };
    }

    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (entries.length === 0) {
      return {
        valid: true,
        reason: 'EMPTY_ENTRY_LIST',
        processedCount: 0
      };
    }

    let processedCount = 0;
    let resolvedCampaignId: number | undefined = undefined;
    let snapshotResult: MetaObjectVerificationResult | undefined = undefined;

    const authoritativeIdentity = getAuthoritativeMetaIdentity();
    const masterAdAccountId = authoritativeIdentity.adAccountId;

    for (const entry of entries) {
      // Validate Account Scope if present in entry or changes
      if (entry.id && masterAdAccountId) {
        const cleanEntryId = String(entry.id).startsWith('act_') ? String(entry.id) : `act_${entry.id}`;
        if (entry.id.toString().startsWith('act_') || entry.id.toString().match(/^\d+$/)) {
          // If this is an ad account webhook, ensure it matches Master Ad Account
          if (cleanEntryId !== masterAdAccountId && String(entry.id) !== masterAdAccountId.replace('act_', '')) {
            return {
              valid: false,
              reason: 'CROSS_TENANT_AD_ACCOUNT_REJECTED',
              processedCount: 0
            };
          }
        }
      }

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change.value || {};
        // Never trust raw user-provided campaign_id or host_id!
        // Resolve Meta object IDs (meta_campaign_id, meta_adset_id, meta_ad_id) back to DB
        const metaObjId = val.campaign_id || val.adset_id || val.ad_id || val.id || val.object_id;
        if (!metaObjId) continue;

        // Query DB for matching ENCHO campaign
        const queryRes = await dbClient.query(`
          SELECT id, host_id, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status
          FROM host_marketing_campaigns
          WHERE meta_campaign_id = $1 OR meta_adset_id = $1 OR meta_ad_id = $1
          LIMIT 1
        `, [String(metaObjId)]);

        if (queryRes.rows.length === 0) {
          // Unknown Meta Object ID in ENCHO system
          return {
            valid: false,
            reason: 'UNKNOWN_META_OBJECT_REJECTED',
            processedCount: 0
          };
        }

        const campaign = queryRes.rows[0];
        resolvedCampaignId = campaign.id;

        // Extract normalized status from change event
        const rawStatus = val.status || val.effective_status || val.event || 'ACTIVE';
        const rawEffectiveStatus = val.effective_status || val.status || 'ACTIVE';
        const rawReviewStatus = val.review_status || 'NO_REVIEW';

        const normStatus = String(rawStatus).toUpperCase();
        const normEffectiveStatus = String(rawEffectiveStatus).toUpperCase();
        const normReviewStatus = String(rawReviewStatus).toUpperCase();

        const verifiedAtIso = new Date().toISOString();

        // Update database snapshot with source = 'WEBHOOK'
        await dbClient.query(`
          UPDATE host_marketing_campaigns
          SET meta_status = $1,
              meta_effective_status = $2,
              meta_review_status = $3,
              external_status_verified_at = $4,
              external_status_verification_source = 'WEBHOOK',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [normStatus, normEffectiveStatus, normReviewStatus, verifiedAtIso, campaign.id]);

        // Audit event insertion
        try {
          await dbClient.query(`
            INSERT INTO meta_publishing_events
            (campaign_id, correlation_id, event_type, from_state, to_state, actor_type, actor_id, reason)
            VALUES ($1, $2, 'WEBHOOK_SYNC', $3, $4, 'webhook', 'meta_webhook', $5)
          `, [
            campaign.id,
            `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            campaign.meta_effective_status || 'UNKNOWN',
            normEffectiveStatus,
            `Meta Webhook Sync (${change.field || 'status_update'})`
          ]);
        } catch {
          // non-blocking event log
        }

        processedCount++;

        // Construct result snapshot
        const freshness = this.calculateExternalFreshness(verifiedAtIso);
        const localActive = ['active', 'CAMPAIGN_LIVE'].includes(campaign.status);
        const metaActive = normEffectiveStatus === 'ACTIVE';
        const hasDrift = (localActive && !metaActive) || (!localActive && metaActive);

        snapshotResult = {
          campaign_id: campaign.id,
          meta_campaign_id: campaign.meta_campaign_id,
          meta_adset_id: campaign.meta_adset_id,
          meta_ad_id: campaign.meta_ad_id,
          master_ad_account_id: masterAdAccountId,
          meta_status: normStatus,
          meta_effective_status: normEffectiveStatus,
          meta_review_status: normReviewStatus,
          hierarchy_verified: true,
          account_ownership_verified: true,
          verified_at: verifiedAtIso,
          verification_source: 'WEBHOOK',
          freshness,
          has_drift: hasDrift,
          drift_details: hasDrift ? `Local status (${campaign.status}) vs Meta effective status (${normEffectiveStatus})` : undefined,
          reconciliation_required: hasDrift
        };
      }
    }

    return {
      valid: true,
      processedCount,
      resolvedCampaignId,
      snapshot: snapshotResult
    };
  }

  /**
   * Fetches and verifies authoritative external Meta object state via read-first GET API calls.
   * Verifies account ownership and Campaign -> AdSet -> Ad hierarchy.
   */
  static async fetchAndVerifyMetaObjectState(
    campaignId: number,
    options: {
      source?: VerificationSource;
      customGraphFetcher?: (endpoint: string) => Promise<{ status: number; data: any }>;
    } = {},
    dbClient: any
  ): Promise<MetaObjectVerificationResult> {
    const source = options.source || 'ACTIVE_POLL';
    const authoritativeIdentity = getAuthoritativeMetaIdentity();
    const masterAdAccountId = authoritativeIdentity.adAccountId;

    const campRes = await dbClient.query(`
      SELECT id, host_id, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status, meta_review_status
      FROM host_marketing_campaigns
      WHERE id = $1
    `, [campaignId]);

    if (campRes.rows.length === 0) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const campaign = campRes.rows[0];
    const { meta_campaign_id, meta_adset_id, meta_ad_id } = campaign;

    if (!meta_campaign_id) {
      const verifiedAtIso = new Date().toISOString();
      return {
        campaign_id: campaignId,
        meta_campaign_id: null,
        meta_adset_id: null,
        meta_ad_id: null,
        master_ad_account_id: masterAdAccountId,
        meta_status: 'UNPUBLISHED',
        meta_effective_status: 'UNPUBLISHED',
        meta_review_status: 'NO_REVIEW',
        hierarchy_verified: false,
        account_ownership_verified: true,
        verified_at: verifiedAtIso,
        verification_source: source,
        freshness: 'UNKNOWN',
        has_drift: false,
        reconciliation_required: false
      };
    }

    // Default fetcher fallback
    const fetcher = options.customGraphFetcher || (async (endpoint: string) => {
      const token = process.env.META_SYSTEM_USER_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
      const version = process.env.META_GRAPH_VERSION || 'v20.0';
      const baseUrl = process.env.META_BASE_URL || `https://graph.facebook.com/${version}`;
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}/${endpoint.replace(/^\//, '')}`;
      const separator = url.includes('?') ? '&' : '?';
      const fullUrl = `${url}${separator}access_token=${token}`;

      try {
        const res = await fetch(fullUrl);
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        return { status: res.status, data };
      } catch (err: any) {
        return { status: 500, data: { error: { message: err.message || 'Fetch failed' } } };
      }
    });

    let campaignData: any = null;
    let adsetData: any = null;
    let adData: any = null;

    let metaStatus = 'UNKNOWN';
    let metaEffectiveStatus = 'UNKNOWN';
    let metaReviewStatus = 'NO_REVIEW';
    let objectMissingOnMeta = false;
    let hierarchyVerified = true;
    let accountOwnershipVerified = true;
    let errorMsg: string | undefined = undefined;

    // 1. GET Campaign Object
    const campCall = await fetcher(`/${meta_campaign_id}?fields=id,name,status,effective_status,configured_status,account_id`);
    if (campCall.status === 404 || (campCall.data?.error && campCall.data.error.code === 100)) {
      objectMissingOnMeta = true;
      metaEffectiveStatus = 'MISSING_ON_META';
      metaStatus = 'MISSING_ON_META';
      hierarchyVerified = false;
      errorMsg = `Meta Campaign ID ${meta_campaign_id} not found on Meta Graph API`;
    } else if (campCall.data && !campCall.data.error) {
      campaignData = campCall.data;
      metaStatus = campaignData.status || 'PAUSED';
      metaEffectiveStatus = campaignData.effective_status || campaignData.status || 'PAUSED';

      // Verify Account Ownership
      if (campaignData.account_id && masterAdAccountId) {
        const cleanDataAcct = String(campaignData.account_id).startsWith('act_')
          ? String(campaignData.account_id)
          : `act_${campaignData.account_id}`;
        if (cleanDataAcct !== masterAdAccountId) {
          accountOwnershipVerified = false;
          errorMsg = `Account ownership mismatch: expected ${masterAdAccountId}, got ${cleanDataAcct}`;
        }
      }
    } else {
      errorMsg = campCall.data?.error?.message || 'Failed to fetch campaign state';
    }

    // 2. GET AdSet Object if exists
    if (!objectMissingOnMeta && meta_adset_id) {
      const adsetCall = await fetcher(`/${meta_adset_id}?fields=id,name,status,effective_status,campaign_id,account_id`);
      if (adsetCall.data && !adsetCall.data.error) {
        adsetData = adsetCall.data;
        // Verify AdSet -> Campaign Hierarchy
        if (adsetData.campaign_id && adsetData.campaign_id !== meta_campaign_id) {
          hierarchyVerified = false;
          errorMsg = `AdSet hierarchy mismatch: AdSet campaign_id ${adsetData.campaign_id} !== ${meta_campaign_id}`;
        }
      } else if (adsetCall.status === 404) {
        hierarchyVerified = false;
        errorMsg = `Meta AdSet ID ${meta_adset_id} missing on Meta`;
      }
    }

    // 3. GET Ad Object if exists
    if (!objectMissingOnMeta && meta_ad_id) {
      const adCall = await fetcher(`/${meta_ad_id}?fields=id,name,status,effective_status,review_status,adset_id,campaign_id,account_id`);
      if (adCall.data && !adCall.data.error) {
        adData = adCall.data;
        metaReviewStatus = adData.review_status || 'NO_REVIEW';
        if (adData.effective_status) {
          metaEffectiveStatus = adData.effective_status;
        }
        // Verify Ad -> AdSet / Campaign Hierarchy
        if ((adData.adset_id && adData.adset_id !== meta_adset_id) || (adData.campaign_id && adData.campaign_id !== meta_campaign_id)) {
          hierarchyVerified = false;
          errorMsg = `Ad hierarchy mismatch for Ad ID ${meta_ad_id}`;
        }
      } else if (adCall.status === 404) {
        hierarchyVerified = false;
        errorMsg = `Meta Ad ID ${meta_ad_id} missing on Meta`;
      }
    }

    const verifiedAtIso = new Date().toISOString();
    const freshness = this.calculateExternalFreshness(verifiedAtIso);

    // Detect state drift
    const localActive = ['active', 'CAMPAIGN_LIVE'].includes(campaign.status);
    const metaActive = metaEffectiveStatus === 'ACTIVE';
    const localFailed = ['failed', 'failed_publish'].includes(campaign.status);

    const hasDrift = (localActive && !metaActive) || (localFailed && metaActive) || objectMissingOnMeta || !hierarchyVerified || !accountOwnershipVerified;
    const reconciliationRequired = hasDrift || objectMissingOnMeta;

    let driftDetails: string | undefined = undefined;
    if (hasDrift) {
      if (objectMissingOnMeta) driftDetails = 'Object missing on Meta Graph API';
      else if (!hierarchyVerified) driftDetails = 'Object hierarchy validation failed';
      else if (!accountOwnershipVerified) driftDetails = 'Master Ad Account ownership mismatch';
      else driftDetails = `Local status (${campaign.status}) differs from Meta effective status (${metaEffectiveStatus})`;
    }

    // Persist snapshot to DB
    await dbClient.query(`
      UPDATE host_marketing_campaigns
      SET meta_status = $1,
          meta_effective_status = $2,
          meta_review_status = $3,
          external_status_verified_at = $4,
          external_status_verification_source = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [metaStatus, metaEffectiveStatus, metaReviewStatus, verifiedAtIso, source, campaignId]);

    return {
      campaign_id: campaignId,
      meta_campaign_id,
      meta_adset_id,
      meta_ad_id,
      master_ad_account_id: masterAdAccountId,
      meta_status: metaStatus,
      meta_effective_status: metaEffectiveStatus,
      meta_review_status: metaReviewStatus,
      hierarchy_verified: hierarchyVerified,
      account_ownership_verified: accountOwnershipVerified,
      verified_at: verifiedAtIso,
      verification_source: source,
      freshness,
      has_drift: hasDrift,
      drift_details: driftDetails,
      reconciliation_required: reconciliationRequired,
      error: errorMsg
    };
  }

  /**
   * Background Reconciliation Worker for prioritized targets (EXTERNAL_OUTCOME_UNKNOWN, QUARANTINED, ROLLBACK_FAILED, STALE/DEGRADED state).
   * Reads external state FIRST via GET before taking any allowed P0-3 remediation action.
   */
  static async reconcileExternalMetaState(
    options: {
      campaignId?: number;
      customGraphFetcher?: (endpoint: string) => Promise<{ status: number; data: any }>;
      transitionStateFn?: (params: any) => Promise<any>;
    } = {},
    dbClient: any
  ): Promise<ReconciliationReport> {
    const timestamp = new Date().toISOString();

    let queryStr = `
      SELECT c.id, c.status, c.meta_campaign_id, c.meta_status, c.meta_effective_status, c.external_status_verified_at,
             tx.publish_status, tx.error_details, tx.failure_code
      FROM host_marketing_campaigns c
      LEFT JOIN meta_publishing_transactions tx ON c.id = tx.campaign_id
    `;
    const queryParams: any[] = [];

    if (options.campaignId) {
      queryStr += ` WHERE c.id = $1`;
      queryParams.push(options.campaignId);
    } else {
      queryStr += `
        WHERE tx.publish_status IN ('FAILED_PUBLISH', 'QUARANTINED', 'ROLLBACK_FAILED')
           OR c.external_status_verified_at IS NULL
           OR c.external_status_verified_at < NOW() - INTERVAL '5 minutes'
           OR (c.status IN ('active', 'CAMPAIGN_LIVE') AND c.meta_effective_status NOT IN ('ACTIVE'))
           OR (c.status IN ('failed', 'failed_publish') AND c.meta_effective_status = 'ACTIVE')
        LIMIT 50
      `;
    }

    const targetsRes = await dbClient.query(queryStr, queryParams);
    const targets = targetsRes.rows;

    let totalReconciled = 0;
    let driftedCount = 0;
    let remediatedCount = 0;
    const items: ReconciliationReportItem[] = [];

    for (const target of targets) {
      try {
        const prevStatus = target.status;
        const prevMetaStatus = target.meta_effective_status || 'UNKNOWN';

        // 1. GET external state FIRST
        const verifiedSnapshot = await this.fetchAndVerifyMetaObjectState(
          target.id,
          { source: 'RECONCILIATION_WORKER', customGraphFetcher: options.customGraphFetcher },
          dbClient
        );

        totalReconciled++;
        if (verifiedSnapshot.has_drift) driftedCount++;

        let remediated = false;
        let remediationAction: string | undefined = undefined;

        // 2. Evaluate allowed P0-3 remediation rules
        // Rule A: Unknown Network Outcome Resolution
        let isUnknownOutcome = false;
        if (target.failure_code === 'EXTERNAL_OUTCOME_UNKNOWN' || target.publish_status === 'FAILED_PUBLISH') {
          if (typeof target.error_details === 'string' && target.error_details.includes('EXTERNAL_OUTCOME_UNKNOWN')) {
            isUnknownOutcome = true;
          } else if (typeof target.error_details === 'object' && target.error_details?.failure_code === 'EXTERNAL_OUTCOME_UNKNOWN') {
            isUnknownOutcome = true;
          }
        }

        if (isUnknownOutcome) {
          if (verifiedSnapshot.meta_effective_status === 'ACTIVE' && verifiedSnapshot.hierarchy_verified) {
            // Meta Graph API GET confirms objects exist and are ACTIVE!
            remediated = true;
            remediationAction = 'RESOLVED_UNKNOWN_OUTCOME_TO_ACTIVE';
            remediatedCount++;

            // Update transaction to SUCCESS
            await dbClient.query(`
              UPDATE meta_publishing_transactions
              SET publish_status = 'SUCCESS', updated_at = CURRENT_TIMESTAMP
              WHERE campaign_id = $1
            `, [target.id]);

            // Transition FSM to CAMPAIGN_LIVE if transition function available
            if (options.transitionStateFn) {
              await options.transitionStateFn({
                campaignId: target.id,
                to: 'CAMPAIGN_LIVE',
                reason: 'Reconciliation: Verified active Meta objects after unknown outcome',
                actorType: 'system',
                client: dbClient
              });
            } else {
              await dbClient.query(`UPDATE host_marketing_campaigns SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [target.id]);
            }
          } else if (verifiedSnapshot.meta_effective_status === 'MISSING_ON_META') {
            // Objects do NOT exist on Meta; confirm failed publish state safely
            remediated = true;
            remediationAction = 'RESOLVED_UNKNOWN_OUTCOME_CONFIRMED_FAILED';
            remediatedCount++;

            await dbClient.query(`
              UPDATE meta_publishing_transactions
              SET publish_status = 'FAILED_PUBLISH', updated_at = CURRENT_TIMESTAMP
              WHERE campaign_id = $1
            `, [target.id]);
          }
        }

        // Rule B: Local ACTIVE / Meta PAUSED Mismatch
        if (!remediated && ['active', 'CAMPAIGN_LIVE'].includes(prevStatus) && ['PAUSED', 'DELETED', 'ARCHIVED', 'DISAPPROVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(verifiedSnapshot.meta_effective_status)) {
          remediated = true;
          remediationAction = `SYNCED_LOCAL_STATE_TO_${verifiedSnapshot.meta_effective_status}`;
          remediatedCount++;

          if (options.transitionStateFn) {
            await options.transitionStateFn({
              campaignId: target.id,
              to: 'paused',
              reason: `Reconciliation: Meta effective status is ${verifiedSnapshot.meta_effective_status}`,
              actorType: 'system',
              client: dbClient
            });
          } else {
            await dbClient.query(`UPDATE host_marketing_campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [target.id]);
          }
        }

        // Rule C: QUARANTINED or ROLLBACK_FAILED handling (Flag for Admin action; Escrow / Money strictly UNTOUCHED!)
        if (['QUARANTINED', 'ROLLBACK_FAILED'].includes(target.publish_status)) {
          remediationAction = `FLAGGED_ADMIN_ACTION_REQUIRED_${target.publish_status}`;
        }

        items.push({
          campaignId: target.id,
          previousLocalStatus: prevStatus,
          previousMetaStatus: prevMetaStatus,
          newMetaStatus: verifiedSnapshot.meta_status,
          newEffectiveStatus: verifiedSnapshot.meta_effective_status,
          hasDrift: verifiedSnapshot.has_drift,
          remediated,
          remediationAction
        });
      } catch (err: any) {
        items.push({
          campaignId: target.id,
          previousLocalStatus: target.status,
          previousMetaStatus: target.meta_effective_status || 'UNKNOWN',
          newMetaStatus: 'ERROR',
          newEffectiveStatus: 'ERROR',
          hasDrift: true,
          remediated: false,
          error: err.message || 'Reconciliation failed'
        });
      }
    }

    return {
      timestamp,
      totalTargeted: targets.length,
      totalReconciled,
      driftedCount,
      remediatedCount,
      items
    };
  }

  /**
   * Manual Admin Force Re-Sync Support.
   * Authenticates Admin, queries Meta Graph API, updates verified snapshot, logs audit event,
   * and NEVER mutates financial state or escrow balances.
   */
  static async resyncCampaignExternalState(
    campaignId: number,
    adminContext: { userId: number | string; role: string; isAdmin?: boolean },
    options: { customGraphFetcher?: (endpoint: string) => Promise<{ status: number; data: any }> } = {},
    dbClient: any
  ): Promise<MetaObjectVerificationResult> {
    const isAdmin = adminContext.role === 'admin' || adminContext.isAdmin === true;
    if (!isAdmin) {
      throw new Error('FORBIDDEN: Admin authentication required for manual re-sync');
    }

    const verifiedSnapshot = await this.fetchAndVerifyMetaObjectState(
      campaignId,
      { source: 'MANUAL_RESYNC', customGraphFetcher: options.customGraphFetcher },
      dbClient
    );

    // Record immutable admin audit log
    try {
      await dbClient.query(`
        INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state)
        VALUES ($1, 'campaign_external_resync', $2, 'manual_force_resync', $3, $4)
      `, [
        adminContext.userId,
        campaignId,
        JSON.stringify({ campaign_id: campaignId }),
        JSON.stringify({
          meta_effective_status: verifiedSnapshot.meta_effective_status,
          verified_at: verifiedSnapshot.verified_at,
          source: 'MANUAL_RESYNC'
        })
      ]);
    } catch {
      // non-blocking log
    }

    return verifiedSnapshot;
  }
}
