import pg from 'pg';
import {
  FailureIntelligenceService,
  FailureIntelligenceContract,
  FailureInputs
} from './failureIntelligenceService';
import {
  MetaTelemetrySyncEngine,
  type PerformanceFreshness,
  type EngagementFreshness
} from './metaTelemetrySyncEngine';

export interface ViewerContext {
  userId: number | string;
  role: 'host' | 'admin' | string;
  isAdmin?: boolean;
  tenantId?: number | string;
}

export type { PerformanceFreshness, EngagementFreshness };
export type ExternalFreshness = 'FRESH' | 'STALE' | 'DEGRADED' | 'UNKNOWN';

let globalPool: pg.Pool | null = null;
function getDbPool(): pg.Pool {
  if (!globalPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    globalPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return globalPool;
}

export class CampaignControlCenterService {
  /**
   * Primary canonical truth projection engine for Host and Admin command centers.
   */
  static async getCampaignTruth(
    campaignId: number | string,
    viewerContext: ViewerContext,
    dbClient?: any
  ): Promise<any> {
    const client = dbClient || getDbPool();
    const numericCampaignId = Number(campaignId);

    // 1. Fetch Primary Campaign Record
    const campRes = await client.query(
      `SELECT * FROM host_marketing_campaigns WHERE id = $1`,
      [numericCampaignId]
    );

    if (campRes.rows.length === 0) {
      const err: any = new Error(`Campaign ${campaignId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const campaign = campRes.rows[0];

    // Tenant Isolation Check
    const isAdminViewer = Boolean(viewerContext.isAdmin || viewerContext.role === 'admin');
    if (!isAdminViewer) {
      const hostIdStr = String(campaign.host_id);
      const viewerIdStr = String(viewerContext.userId);
      const tenantIdStr = viewerContext.tenantId ? String(viewerContext.tenantId) : null;

      if (hostIdStr !== viewerIdStr && hostIdStr !== tenantIdStr) {
        const err: any = new Error(`Unauthorized access to campaign ${campaignId}`);
        err.statusCode = 403;
        throw err;
      }
    }

    // 2. Fetch Authoritative Subsidiary Records
    const [
      txRes,
      eventsRes,
      tracesRes,
      auditRes,
      walletRes,
      variantsRes,
      variantSnapshotsRes,
      dcoEvalRes,
      dcoActionsRes,
      dailyMetricsRes
    ] = await Promise.all([
      client.query(`SELECT * FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM meta_publishing_events WHERE campaign_id = $1 ORDER BY id ASC`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM meta_api_traces WHERE campaign_id = $1 ORDER BY id DESC LIMIT 10`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM admin_audit_logs WHERE (details->>'campaign_id' = $1 OR details->>'campaignId' = $1 OR target = $1) ORDER BY id DESC LIMIT 10`, [String(numericCampaignId)]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM wallet_transactions WHERE campaign_id = $1 ORDER BY id DESC`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 ORDER BY id ASC`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id IN (SELECT id FROM campaign_creative_variants WHERE campaign_id = $1) ORDER BY last_meta_fetched_at DESC`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM dco_evaluation_transactions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM dco_external_actions WHERE campaign_id = $1 ORDER BY id DESC`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM campaign_daily_metrics WHERE campaign_id = $1 ORDER BY metric_date DESC LIMIT 30`, [numericCampaignId]).catch(() => ({ rows: [] }))
    ]);

    const tx = txRes.rows[0] || null;
    const events = eventsRes.rows || [];
    const traces = tracesRes.rows || [];
    const auditLogs = auditRes.rows || [];
    const walletTxs = walletRes.rows || [];
    const variants = variantsRes.rows || [];
    const variantSnapshots = variantSnapshotsRes.rows || [];
    const dcoEval = dcoEvalRes.rows[0] || null;
    const dcoActions = dcoActionsRes.rows || [];
    const dailyMetrics = dailyMetricsRes.rows || [];

    // 3. Compute 3 Core State Axes

    // AXIS 1: Governance State
    // Rule A: APPROVED MUST NEVER imply LIVE.
    let governance_status: 'DRAFT' | 'PENDING_ADMIN_REVIEW' | 'ADMIN_APPROVED' | 'ADMIN_REJECTED' | 'POLICY_VIOLATED' = 'DRAFT';
    const rawStatus = (campaign.status || 'draft').toLowerCase();

    if (rawStatus === 'draft') {
      governance_status = 'DRAFT';
    } else if (['pending_approval', 'pending', 'pending_webhook', 'escrow'].includes(rawStatus)) {
      governance_status = 'PENDING_ADMIN_REVIEW';
    } else if (rawStatus === 'rejected') {
      governance_status = 'ADMIN_REJECTED';
    } else if (rawStatus === 'policy_violated') {
      governance_status = 'POLICY_VIOLATED';
    } else if (campaign.admin_approved || ['approved', 'asset_prep', 'meta_api_push', 'campaign_live', 'active', 'paused', 'failed_publish', 'failed', 'cancelled', 'killed'].includes(rawStatus)) {
      governance_status = 'ADMIN_APPROVED';
    }

    // AXIS 2: Financial State
    // Rule H: Financial state must never be inferred from publishing success alone. Use authoritative financial records.
    let escrow_status: 'UNFUNDED' | 'PAYMENT_PENDING' | 'HOLDING' | 'ESCROW_RELEASE_AUTHORIZED' | 'RELEASED' | 'REFUNDED_TO_WALLET' | 'DISPUTED' = 'UNFUNDED';
    if (campaign.escrow_status) {
      escrow_status = campaign.escrow_status;
    } else {
      const refundTx = walletTxs.find((w: any) => w.transaction_type === 'CAMPAIGN_REFUND' || w.type === 'REFUND');
      const holdTx = walletTxs.find((w: any) => w.transaction_type === 'ESCROW_HOLD' || w.type === 'ESCROW_HOLD');

      if (refundTx) {
        escrow_status = 'REFUNDED_TO_WALLET';
      } else if (holdTx) {
        escrow_status = 'HOLDING';
      } else if (campaign.budget && campaign.budget > 0) {
        escrow_status = 'HOLDING';
      }
    }

    // AXIS 3: Publishing State
    // Rules D, E, F: EXTERNAL_OUTCOME_UNKNOWN remains UNKNOWN, ROLLBACK_FAILED remains ROLLBACK_FAILED, ROLLBACK_SUCCESS only when verified.
    let publish_status: 'IDLE' | 'QUEUED_FOR_DISPATCH' | 'DISPATCHING' | 'SUCCESS' | 'FAILED_PUBLISH' | 'ROLLBACK_PENDING' | 'ROLLBACK_SUCCESS' | 'ROLLBACK_FAILED' | 'QUARANTINED' | 'EXTERNAL_OUTCOME_UNKNOWN' = 'IDLE';

    if (tx?.publish_status) {
      publish_status = tx.publish_status;
    } else if (rawStatus === 'failed_publish' || rawStatus === 'failed') {
      publish_status = 'FAILED_PUBLISH';
    } else if (rawStatus === 'campaign_live' || rawStatus === 'active') {
      publish_status = 'SUCCESS';
    } else if (rawStatus === 'meta_api_push' || rawStatus === 'asset_prep') {
      publish_status = 'DISPATCHING';
    } else if (rawStatus === 'approved') {
      publish_status = 'IDLE';
    }

    // 4. Meta External State
    const meta_status = campaign.meta_status || tx?.meta_status || (publish_status === 'SUCCESS' ? 'ACTIVE' : 'UNPUBLISHED');
    const meta_effective_status = campaign.meta_effective_status || tx?.meta_effective_status || (publish_status === 'SUCCESS' ? 'ACTIVE' : 'UNPUBLISHED');
    const meta_review_status = campaign.meta_review_status || (['pending_review', 'pending'].includes(rawStatus) ? 'PENDING_REVIEW' : 'NO_REVIEW');

    const external_status_verified_at = campaign.external_status_verified_at || tx?.last_verified_at || tx?.updated_at || null;
    const external_status_verification_source = campaign.external_status_verification_source || tx?.verification_source || (external_status_verified_at ? 'ACTIVE_POLL' : 'UNKNOWN');

    // Calculate External Freshness & State Drift
    let external_freshness: ExternalFreshness = 'UNKNOWN';
    if (external_status_verified_at) {
      const extVerifiedTime = new Date(external_status_verified_at).getTime();
      if (!isNaN(extVerifiedTime)) {
        const ageMs = Date.now() - extVerifiedTime;
        if (ageMs <= 5 * 60 * 1000) {
          external_freshness = 'FRESH';
        } else if (ageMs <= 15 * 60 * 1000) {
          external_freshness = 'STALE';
        } else {
          external_freshness = 'DEGRADED';
        }
      }
    }

    const localActive = ['active', 'CAMPAIGN_LIVE'].includes(rawStatus) || publish_status === 'SUCCESS';
    const metaActive = meta_effective_status === 'ACTIVE';
    const localFailed = ['failed', 'failed_publish'].includes(rawStatus) || publish_status === 'FAILED_PUBLISH';

    const has_drift = (localActive && !metaActive && meta_effective_status !== 'UNPUBLISHED') || 
                      (localFailed && metaActive) ||
                      ['MISSING_ON_META', 'DISAPPROVED'].includes(meta_effective_status);

    const drift_details = has_drift ? `Local status (${rawStatus}/${publish_status}) differs from Meta effective status (${meta_effective_status})` : undefined;

    const external_reconciliation_required = has_drift || 
      ['EXTERNAL_OUTCOME_UNKNOWN', 'QUARANTINED', 'ROLLBACK_FAILED'].includes(publish_status) ||
      external_freshness === 'STALE' ||
      external_freshness === 'DEGRADED';

    // 5. Performance Telemetry & Freshness
    let impressions = 0;
    let clicks = 0;
    let spend_cents = 0;
    let conversions = 0;
    let latestInsightsTime: string | null = null;

    if (variantSnapshots.length > 0) {
      // IF active variants exist: campaign performance = aggregate canonical variant telemetry SOLELY
      variantSnapshots.forEach((snap: any) => {
        if (snap.last_meta_impressions) impressions += Number(snap.last_meta_impressions);
        if (snap.last_meta_clicks) clicks += Number(snap.last_meta_clicks);
        if (snap.last_meta_spend) spend_cents += Math.round(Number(snap.last_meta_spend) * 100);
        if (snap.last_meta_conversions) conversions += Number(snap.last_meta_conversions);
      });

      // Campaign telemetry freshness = minimum freshness of all required active variant telemetry
      let minFetchedAtMs: number | null = null;
      let allVariantsFetched = true;
      for (const snap of variantSnapshots) {
        if (!snap.last_meta_fetched_at) {
          allVariantsFetched = false;
          break;
        }
        const timeMs = new Date(snap.last_meta_fetched_at).getTime();
        if (isNaN(timeMs)) {
          allVariantsFetched = false;
          break;
        }
        if (minFetchedAtMs === null || timeMs < minFetchedAtMs) {
          minFetchedAtMs = timeMs;
        }
      }
      latestInsightsTime = (allVariantsFetched && minFetchedAtMs !== null) 
        ? new Date(minFetchedAtMs).toISOString() 
        : null;
    } else {
      // ELSE: use existing certified campaign-level analytics lineage (derived cache)
      impressions = Number(campaign.accumulated_impressions ?? campaign.impressions ?? 0);
      clicks = Number(campaign.accumulated_clicks ?? campaign.clicks ?? 0);
      spend_cents = Number(campaign.spend_cents || Math.round((campaign.accumulated_spent ?? campaign.spent ?? 0) * 100));
      conversions = Number(campaign.accumulated_conversions ?? campaign.conversions ?? 0);
      latestInsightsTime = campaign.insights_synced_at ? new Date(campaign.insights_synced_at).toISOString() : null;
    }

    const reach = Number(campaign.reach || 0);
    const performance_freshness: PerformanceFreshness = MetaTelemetrySyncEngine.calculatePerformanceFreshness(latestInsightsTime);
    const dco_data_stale: boolean = MetaTelemetrySyncEngine.isDcoDataStale(latestInsightsTime);

    const latestEngagementTime: string | null = campaign.engagement_synced_at ? new Date(campaign.engagement_synced_at).toISOString() : null;
    const engagement_freshness: EngagementFreshness = MetaTelemetrySyncEngine.calculateEngagementFreshness(latestEngagementTime);

    const ctr = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
    const cpc_cents = clicks > 0 ? Math.round(spend_cents / clicks) : 0;
    const spend = Number((spend_cents / 100).toFixed(2));
    const cpc = Number((cpc_cents / 100).toFixed(2));

    // Social Engagement Metrics (Decoupled from Ads Insights)
    const comments_count = Number(campaign.comments_count || 0);
    const reactions_count = Number(campaign.reactions_count || 0);
    const shares_count = campaign.shares_count !== null && campaign.shares_count !== undefined ? Number(campaign.shares_count) : null;

    const perfDataAge = latestInsightsTime ? Math.floor((Date.now() - new Date(latestInsightsTime).getTime()) / 1000) : null;
    const engDataAge = latestEngagementTime ? Math.floor((Date.now() - new Date(latestEngagementTime).getTime()) / 1000) : null;

    let telemetry_metadata = campaign.telemetry_source_metadata || null;
    if (typeof telemetry_metadata === 'string') {
      try { telemetry_metadata = JSON.parse(telemetry_metadata); } catch { /* ignore */ }
    }

    let engagement_metadata = campaign.engagement_source_metadata || null;
    if (typeof engagement_metadata === 'string') {
      try { engagement_metadata = JSON.parse(engagement_metadata); } catch { /* ignore */ }
    }

    // 6. Pipeline Stages & Error Classification
    const current_pipeline_stage = tx?.current_pipeline_step || (publish_status === 'SUCCESS' ? 'COMPLETED' : 'NONE');
    const last_successful_stage = tx?.last_successful_step || (publish_status === 'SUCCESS' ? 'AD' : 'NONE');
    const failure_stage = tx?.failure_stage || (publish_status === 'FAILED_PUBLISH' ? (tx?.current_pipeline_step || 'CREATIVE') : null);

    // Handle tx error details parsing
    let parsedErrorDetails: any = tx?.error_details;
    if (typeof parsedErrorDetails === 'string') {
      try { parsedErrorDetails = JSON.parse(parsedErrorDetails); } catch { /* ignore invalid json */ }
    }

    const rawErrorCode = tx?.root_error_code || tx?.failure_code || parsedErrorDetails?.code || parsedErrorDetails?.error_code || campaign.last_error_code || null;
    const rawErrorSubcode = tx?.root_error_subcode || parsedErrorDetails?.subcode || parsedErrorDetails?.error_subcode || campaign.last_error_subcode || null;
    const root_error_code = rawErrorCode !== null && rawErrorCode !== undefined ? (isNaN(Number(rawErrorCode)) ? String(rawErrorCode) : Number(rawErrorCode)) : null;
    const root_error_subcode = rawErrorSubcode !== null && rawErrorSubcode !== undefined ? (isNaN(Number(rawErrorSubcode)) ? String(rawErrorSubcode) : Number(rawErrorSubcode)) : null;
    
    let root_error_message = tx?.root_error_message || campaign.last_error_message || null;
    if (!root_error_message && parsedErrorDetails) {
      if (typeof parsedErrorDetails === 'string') {
        root_error_message = parsedErrorDetails;
      } else if (typeof parsedErrorDetails === 'object') {
        root_error_message = parsedErrorDetails.message || parsedErrorDetails.error_user_msg || parsedErrorDetails.error_msg || JSON.stringify(parsedErrorDetails);
      }
    }
    const root_error_type = tx?.root_error_type || tx?.failure_category || null;

    // Correlation Identifier
    const correlation_id = tx?.correlation_id || campaign.correlation_id || `enc_tx_${campaign.id}_${Date.now()}`;

    // Reconciliation & Rollback State
    let reconciliation_state = tx?.reconciliation_status || 'NONE';
    if (['ROLLBACK_FAILED', 'QUARANTINED', 'EXTERNAL_OUTCOME_UNKNOWN'].includes(publish_status)) {
      reconciliation_state = 'RECONCILIATION_REQUIRED';
    }

    const rollback_state = tx?.rollback_status || (publish_status.startsWith('ROLLBACK_') ? publish_status : 'NONE');

    // Run Pure Failure Intelligence Classifier
    const failure_intelligence: FailureIntelligenceContract = FailureIntelligenceService.classifyFailure({
      http_status: tx?.http_status || parsedErrorDetails?.http_status || parsedErrorDetails?.status || null,
      meta_error_code: root_error_code,
      meta_error_subcode: root_error_subcode,
      meta_error_type: root_error_type,
      response_headers: tx?.response_headers || parsedErrorDetails?.headers || null,
      network_exception_type: tx?.network_exception_type || parsedErrorDetails?.exception_type || null,
      publishing_stage: failure_stage,
      current_publish_status: publish_status,
      rollback_status: rollback_state,
      external_outcome: publish_status === 'EXTERNAL_OUTCOME_UNKNOWN' ? 'EXTERNAL_OUTCOME_UNKNOWN' : (tx?.external_outcome || null),
      financial_state: escrow_status,
      raw_message: root_error_message,
      correlation_id
    });

    const root_error_classification = failure_intelligence.error_class;
    const error_owner = failure_intelligence.owner;
    const retry_eligible = failure_intelligence.retryable;
    const retry_reason = failure_intelligence.retry_reason;

    // 7. Object Hierarchy
    const meta_campaign_id = campaign.meta_campaign_id || tx?.meta_campaign_id || null;
    const meta_adset_id = campaign.meta_adset_id || tx?.meta_adset_id || null;
    const meta_creative_ids = variants.map((v: any) => v.meta_creative_id).filter(Boolean);
    const meta_ad_ids = variants.map((v: any) => v.meta_ad_id).filter(Boolean);

    // 8. DCO State
    const dco_status = campaign.dco_status || (dcoEval ? dcoEval.status : 'IDLE');
    const evaluation_epoch = dcoEval?.evaluation_epoch || null;
    const winner_variant_id = dcoEval?.winner_variant_id || null;

    // 9. Derived Operational State
    let derived_operational_state = 'DRAFT';
    if (governance_status === 'ADMIN_APPROVED' && publish_status === 'SUCCESS' && meta_status === 'ACTIVE') {
      derived_operational_state = 'HEALTHY_LIVE';
    } else if (publish_status === 'SUCCESS' && meta_review_status === 'PENDING_REVIEW') {
      derived_operational_state = 'META_REVIEW_DELAYED';
    } else if (publish_status === 'FAILED_PUBLISH' && retry_eligible) {
      derived_operational_state = 'DISPATCH_FAILED_RETRYABLE';
    } else if (root_error_classification === 'POLICY_DISAPPROVED') {
      derived_operational_state = 'POLICY_REJECTED_HOST_ACTION';
    } else if (publish_status === 'EXTERNAL_OUTCOME_UNKNOWN') {
      derived_operational_state = 'EXTERNAL_OUTCOME_UNKNOWN';
    } else if (reconciliation_state === 'RECONCILIATION_REQUIRED') {
      derived_operational_state = 'RECONCILIATION_REQUIRED';
    } else if (root_error_classification === 'AUTH_EXPIRED') {
      derived_operational_state = 'AUTH_CIRCUIT_BROKEN';
    } else {
      derived_operational_state = `${governance_status}_${publish_status}`;
    }

    // 10. Actions & Guidance
    let host_next_action = failure_intelligence.host_guidance;
    let plain_english_failure: string | null = failure_intelligence.root_cause;

    if (publish_status === 'SUCCESS') {
      host_next_action = 'Your campaign is live on Meta! Monitor reach, clicks, and incoming leads below.';
      plain_english_failure = null;
    } else if (governance_status === 'PENDING_ADMIN_REVIEW' && publish_status === 'IDLE') {
      host_next_action = 'Your campaign is currently being reviewed by an Encho administrator.';
      plain_english_failure = null;
    } else if (governance_status === 'DRAFT') {
      host_next_action = 'Complete your campaign creative and targeting details to submit for review.';
      plain_english_failure = null;
    }

    let admin_next_action = failure_intelligence.admin_guidance;
    if (governance_status === 'PENDING_ADMIN_REVIEW' && publish_status === 'IDLE') {
      admin_next_action = 'Review creative copy, image resolution, and targeting specs before sign-off.';
    } else if (publish_status === 'SUCCESS') {
      admin_next_action = 'Monitor performance telemetry and DCO variant metrics.';
    }

    // Assemble Canonical Raw Truth
    const canonicalTruth = {
      campaign_id: numericCampaignId,
      title: campaign.title || 'Untitled Campaign',
      governance_status,
      escrow_status,
      publish_status,
      meta_external_state: {
        meta_status,
        meta_effective_status,
        meta_review_status,
        external_status_verified_at,
        external_status_verification_source,
        external_freshness,
        has_drift,
        drift_details,
        reconciliation_required: external_reconciliation_required,
        meta_campaign_id,
        meta_adset_id,
        meta_ad_id: meta_ad_ids[0] || null
      },
      performance_state: {
        impressions,
        reach,
        clicks,
        spend_cents,
        spend,
        ctr,
        cpc_cents,
        cpc,
        conversions,
        insights_synced_at: latestInsightsTime,
        performance_freshness,
        dco_data_stale,
        last_synced_at: latestInsightsTime,
        data_age_seconds: perfDataAge,
        telemetry_metadata
      },
      engagement_state: {
        comments: comments_count,
        reactions: reactions_count,
        shares: shares_count,
        engagement_synced_at: latestEngagementTime,
        engagement_freshness,
        last_synced_at: latestEngagementTime,
        data_age_seconds: engDataAge,
        engagement_metadata
      },
      dco_state: {
        dco_status,
        evaluation_epoch,
        winner_variant_id,
        variant_count: variants.length,
        variants: variants.map((v: any) => ({
          id: v.id,
          media_url: v.media_url,
          status: v.status || 'TESTING',
          is_published: Boolean(v.is_published),
          meta_creative_id: v.meta_creative_id || null,
          meta_ad_id: v.meta_ad_id || null,
          activated_at: v.variant_activated_at || null
        }))
      },
      derived_operational_state,
      current_pipeline_stage,
      last_successful_stage,
      failure_stage,
      root_error_classification,
      root_error_code,
      root_error_subcode,
      root_error_message,
      root_error_type,
      error_owner,
      retry_eligible,
      retry_reason,
      reconciliation_state,
      rollback_state,
      failure_intelligence,
      object_hierarchy: {
        campaign_id: meta_campaign_id,
        adset_id: meta_adset_id,
        creative_ids: meta_creative_ids,
        ad_ids: meta_ad_ids
      },
      host_next_action,
      admin_next_action,
      plain_english_failure,
      financial_safety: {
        is_money_safe: true,
        total_charged_cents: Math.round((campaign.budget || 0) * 100),
        ad_spend_allocated_cents: Math.round((campaign.budget || 0) * 85),
        encho_fee_cents: Math.round((campaign.budget || 0) * 15),
        escrow_status,
        risk_level: failure_intelligence.financial_risk
      },
      incident_timeline: events.map((e: any) => ({
        id: e.id,
        timestamp: e.created_at || e.timestamp_utc,
        event_type: e.event_type || 'STATE_TRANSITION',
        from_state: e.from_state,
        to_state: e.to_state,
        actor_type: e.actor_type || 'system',
        reason: e.reason || null,
        correlation_id: e.correlation_id || null
      })),
      correlation_id,
      raw_traces_count: traces.length
    };

    // Apply Projection / Redaction for Viewer
    return this.projectForViewer(canonicalTruth, viewerContext);
  }

  /**
   * Role-based projection / redaction logic.
   * Rule I: Host and Admin consume the SAME canonical truth computation. Only projection/redaction differs.
   */
  private static projectForViewer(truth: any, viewerContext: ViewerContext): any {
    const isAdmin = Boolean(viewerContext.isAdmin || viewerContext.role === 'admin');

    if (isAdmin) {
      // ADMIN PROJECTION: Complete diagnostic visibility
      return {
        ...truth,
        projection_type: 'ADMIN',
        access_role: 'ADMIN'
      };
    }

    // HOST PROJECTION: Friendly delivery state, performance, guidance, redacted tokens & logs
    const friendly_delivery_state = this.getFriendlyDeliveryState(truth);

    return {
      campaign_id: truth.campaign_id,
      title: truth.title,
      projection_type: 'HOST',
      access_role: 'HOST',
      friendly_delivery_state,
      is_host_action_required: Boolean(truth.error_owner === 'HOST_ERROR' || truth.root_error_classification === 'POLICY_DISAPPROVED'),
      host_next_action: truth.host_next_action,
      plain_english_failure: truth.plain_english_failure,
      performance_state: truth.performance_state,
      engagement_state: truth.engagement_state,
      financial_safety: {
        is_money_safe: truth.financial_safety.is_money_safe,
        escrow_status: truth.financial_safety.escrow_status,
        total_charged_cents: truth.financial_safety.total_charged_cents,
        ad_spend_allocated_cents: truth.financial_safety.ad_spend_allocated_cents,
        encho_fee_cents: truth.financial_safety.encho_fee_cents
      },
      freshness: {
        external_freshness: truth.meta_external_state.external_freshness,
        external_status_verified_at: truth.meta_external_state.external_status_verified_at,
        performance_freshness: truth.performance_state.performance_freshness,
        insights_synced_at: truth.performance_state.insights_synced_at,
        engagement_freshness: truth.engagement_state.engagement_freshness,
        engagement_synced_at: truth.engagement_state.engagement_synced_at,
        dco_data_stale: truth.performance_state.dco_data_stale
      },
      dco_state: {
        dco_status: truth.dco_state.dco_status,
        variant_count: truth.dco_state.variant_count,
        winner_variant_id: truth.dco_state.winner_variant_id
      },
      failure_intelligence: FailureIntelligenceService.projectFailureIntelligenceForViewer(truth.failure_intelligence, viewerContext)
      // REDACTED FOR HOST:
      // - correlation_id
      // - raw_traces_count / traces
      // - root_error_code / subcode
      // - object_hierarchy IDs
      // - admin_next_action
      // - access tokens / sensitive internal logs
    };
  }

  private static getFriendlyDeliveryState(truth: any): string {
    if (truth.publish_status === 'SUCCESS' && truth.meta_external_state.meta_status === 'ACTIVE') {
      return 'Live on Meta';
    }
    if (truth.publish_status === 'SUCCESS' && truth.meta_external_state.meta_status === 'PAUSED') {
      return 'Paused on Meta';
    }
    if (truth.publish_status === 'FAILED_PUBLISH') {
      if (truth.error_owner === 'HOST_ERROR' || truth.root_error_classification === 'DETERMINISTIC_ASSET_ERROR') {
        return 'Action Required: Media Adjustment Needed';
      }
      if (truth.root_error_classification === 'POLICY_DISAPPROVED') {
        return 'Action Required: Policy Re-check Needed';
      }
      if (truth.retry_eligible) {
        return 'Retrying Delivery Setup';
      }
      return 'Delivery Setup Issue';
    }
    if (truth.publish_status === 'DISPATCHING' || truth.publish_status === 'QUEUED_FOR_DISPATCH') {
      return 'Publishing to Meta';
    }
    if (truth.governance_status === 'PENDING_ADMIN_REVIEW') {
      return 'Under Review by Admin';
    }
    if (truth.governance_status === 'DRAFT') {
      return 'Draft Saved';
    }
    return 'Processing';
  }
}
