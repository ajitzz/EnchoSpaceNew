import pg from 'pg';
import {
  FailureIntelligenceService,
  FailureIntelligenceContract,
  FailureInputs
} from './failureIntelligenceService.js';
import {
  MetaTelemetrySyncEngine,
  type PerformanceFreshness,
  type EngagementFreshness
} from './metaTelemetrySyncEngine.js';

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
   * Alias for getCampaignTruth for canonical truth projection queries.
   */
  static async getCanonicalTruth(
    campaignId: number | string,
    viewerContext: ViewerContext,
    dbClient?: any
  ): Promise<any> {
    return this.getCampaignTruth(campaignId, viewerContext, dbClient);
  }

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
      dailyMetricsRes,
      contractRes
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
      client.query(`SELECT * FROM campaign_daily_metrics WHERE campaign_id = $1 ORDER BY metric_date DESC LIMIT 30`, [numericCampaignId]).catch(() => ({ rows: [] })),
      client.query(`SELECT * FROM campaign_financial_contracts WHERE campaign_id = $1`, [numericCampaignId]).catch(() => ({ rows: [] }))
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
    const financialContract = contractRes.rows[0] || null;

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
      const normalizedEscrow = String(campaign.escrow_status).toUpperCase();
      if (['UNFUNDED', 'PAYMENT_PENDING', 'HOLDING', 'ESCROW_RELEASE_AUTHORIZED', 'RELEASED', 'REFUNDED_TO_WALLET', 'DISPUTED'].includes(normalizedEscrow)) {
        escrow_status = normalizedEscrow as any;
      } else if (normalizedEscrow === 'PAID') {
        escrow_status = 'RELEASED';
      }
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
    if (meta_effective_status === 'EXTERNAL_VERIFICATION_BLOCKED' || meta_status === 'EXTERNAL_VERIFICATION_BLOCKED' || root_error_classification === 'AUTH_EXPIRED') {
      derived_operational_state = 'EXTERNAL_VERIFICATION_BLOCKED';
    } else if (governance_status === 'ADMIN_APPROVED' && publish_status === 'SUCCESS' && (meta_status === 'ACTIVE' || meta_effective_status === 'ACTIVE' || meta_effective_status === 'LIVE') && external_freshness !== 'UNKNOWN') {
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
    } else if (meta_status === 'UNKNOWN' || meta_effective_status === 'UNKNOWN' || external_freshness === 'UNKNOWN') {
      derived_operational_state = 'EXTERNAL_STATE_UNKNOWN';
    } else {
      derived_operational_state = `${governance_status}_${publish_status}`;
    }

    // 10. Actions & Guidance
    let host_next_action = failure_intelligence.host_guidance;
    let plain_english_failure: string | null = failure_intelligence.root_cause;

    if (meta_effective_status === 'EXTERNAL_VERIFICATION_BLOCKED' || meta_status === 'EXTERNAL_VERIFICATION_BLOCKED') {
      host_next_action = 'Your campaign is securely preserved. External Meta verification is currently awaiting developer reactivation.';
      plain_english_failure = 'Meta API access is deactivated or unreachable. Awaiting developer reactivation.';
    } else if (publish_status === 'SUCCESS' && (meta_effective_status === 'LIVE' || meta_effective_status === 'ACTIVE') && external_freshness !== 'UNKNOWN') {
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
    if (meta_effective_status === 'EXTERNAL_VERIFICATION_BLOCKED' || meta_status === 'EXTERNAL_VERIFICATION_BLOCKED') {
      admin_next_action = 'Meta developer portal access deactivated (OAuth code 200). Complete developer registration on developer.facebook.com to resume live sync.';
    } else if (governance_status === 'PENDING_ADMIN_REVIEW' && publish_status === 'IDLE') {
      admin_next_action = 'Review creative copy, image resolution, and targeting specs before sign-off.';
    } else if (publish_status === 'SUCCESS') {
      admin_next_action = 'Monitor performance telemetry and DCO variant metrics.';
    }

    const hasFinancialBlockedEvent = events.some((e: any) => e.event_type === 'FINANCIAL_ACTIVATION_BLOCKED');
    const isContractOverConfigured = financialContract ? (Number(financialContract.meta_configured_max_spend || 0) > Number(financialContract.meta_authorized_spend)) : false;
    const is_financial_blocked = isContractOverConfigured || hasFinancialBlockedEvent;

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
      admin_diagnostics: {
        fbtrace_id: parsedErrorDetails?.fbtrace_id || null,
        raw_error: parsedErrorDetails
      },
      financial_safety: {
        is_money_safe: true,
        total_charged_cents: financialContract ? Number(financialContract.gross_host_charge) : Math.round((campaign.budget || 0) * 100),
        total_paid_cents: financialContract ? Number(financialContract.gross_host_charge) : Math.round((campaign.budget || 0) * 100),
        ad_spend_allocated_cents: financialContract ? Number(financialContract.meta_authorized_spend) : Math.round((campaign.budget || 0) * 85),
        encho_fee_cents: financialContract ? Number(financialContract.encho_fee_amount) : Math.round((campaign.budget || 0) * 15),
        meta_authorized_spend_cents: financialContract ? Number(financialContract.meta_authorized_spend) : Math.round((campaign.budget || 0) * 85),
        meta_configured_max_cents: financialContract ? Number(financialContract.meta_configured_max_spend || 0) : Math.round((campaign.budget || 0) * 100),
        meta_actual_spend_cents: financialContract ? Number(financialContract.meta_actual_spend || 0) : Math.round((campaign.spent || 0) * 100),
        meta_remaining_authorization_cents: financialContract ? Number(financialContract.meta_remaining_authorization || 0) : Math.max(0, Math.round((campaign.budget || 0) * 85) - Math.round((campaign.spent || 0) * 100)),
        variance_cents: financialContract ? (Number(financialContract.meta_configured_max_spend || 0) - Number(financialContract.meta_authorized_spend)) : 0,
        is_financial_blocked,
        financial_block_reason: is_financial_blocked
          ? "The Meta budget exceeds the campaign's authorized advertising spend."
          : null,
        recommended_action: is_financial_blocked
          ? "Financial configuration must be corrected before activation."
          : null,
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
    const opStatusInfo = this.getOperationalStatus(truth);
    const friendly_delivery_state = opStatusInfo.display_label;
    const actionsInfo = this.getAllowedHostActions(truth);
    const timeline = this.buildHostLifecycleTimeline(truth);

    // Host Financial Projection
    const total_paid_cents = truth.financial_safety?.total_charged_cents || 0;
    const ad_spend_allocation_cents = truth.financial_safety?.ad_spend_allocated_cents || Math.round(total_paid_cents * 0.85);
    const encho_fee_cents = truth.financial_safety?.encho_fee_cents || Math.round(total_paid_cents * 0.15);
    const meta_authorized_spend_cents = ad_spend_allocation_cents;
    const actual_spend_cents = truth.performance_state?.spend_cents || 0;
    const remaining_authorized_spend_cents = Math.max(0, meta_authorized_spend_cents - actual_spend_cents);
    const escrow_status = truth.financial_safety?.escrow_status || 'HOLDING';

    let escrow_state_display = 'Protected in Escrow';
    if (escrow_status === 'RELEASED' || (truth.publish_status === 'SUCCESS' && truth.meta_external_state?.meta_status === 'ACTIVE')) {
      escrow_state_display = 'Active - Delivering';
    } else if (escrow_status === 'REFUNDED_TO_WALLET') {
      escrow_state_display = 'Refunded to Wallet';
    } else if (escrow_status === 'UNFUNDED') {
      escrow_state_display = 'Unfunded';
    }

    // Zero-data fabrication checks for host telemetry
    const has_performance_data = Boolean(
      truth.performance_state?.insights_synced_at || 
      (truth.performance_state?.impressions !== undefined && truth.performance_state?.impressions > 0)
    );

    const has_engagement_data = Boolean(
      truth.engagement_state?.engagement_synced_at ||
      (truth.engagement_state?.comments !== undefined && truth.engagement_state?.comments > 0) ||
      (truth.engagement_state?.reactions !== undefined && truth.engagement_state?.reactions > 0) ||
      (truth.engagement_state?.shares !== null && truth.engagement_state?.shares !== undefined && truth.engagement_state?.shares > 0)
    );

    const host_performance_state = {
      has_performance_data,
      impressions: has_performance_data ? truth.performance_state.impressions : null,
      reach: has_performance_data ? (truth.performance_state.reach || truth.performance_state.impressions) : null,
      clicks: has_performance_data ? truth.performance_state.clicks : null,
      ctr: has_performance_data ? truth.performance_state.ctr : null,
      cpc: has_performance_data ? truth.performance_state.cpc : null,
      spend: has_performance_data ? truth.performance_state.spend : null,
      spend_cents: has_performance_data ? truth.performance_state.spend_cents : null,
      conversions: has_performance_data ? truth.performance_state.conversions : null,
      performance_freshness: has_performance_data ? truth.performance_state.performance_freshness : 'UNAVAILABLE',
      dco_data_stale: has_performance_data ? truth.performance_state.dco_data_stale : null,
      performance_last_updated: truth.performance_state.insights_synced_at || null,
      performance_source: truth.performance_state.telemetry_metadata?.source || 'Meta Graph API v20.0',
      message: has_performance_data ? null : 'No performance data yet. Live metrics will appear once Meta begins delivering your ad.'
    };

    const host_engagement_state = {
      has_engagement_data,
      comments: has_engagement_data ? truth.engagement_state.comments : null,
      reactions: has_engagement_data ? truth.engagement_state.reactions : null,
      shares: has_engagement_data ? truth.engagement_state.shares : null,
      engagement_freshness: has_engagement_data ? truth.engagement_state.engagement_freshness : 'UNAVAILABLE',
      engagement_last_updated: truth.engagement_state.engagement_synced_at || null,
      engagement_source: truth.engagement_state.engagement_metadata?.source || 'Meta Graph API v20.0 - Page Post Social Signals',
      message: has_engagement_data ? null : 'No social engagement data yet.'
    };

    // Host-safe DCO Variant Cards
    const host_variants = (truth.dco_state?.variants || []).map((v: any) => ({
      id: v.id,
      media_url: v.media_url,
      has_meta_ad: Boolean(v.meta_ad_id),
      delivery_status: v.meta_ad_id ? (truth.publish_status === 'SUCCESS' ? (v.status === 'PRUNED' ? 'PAUSED' : 'ACTIVE') : 'PENDING') : 'PENDING',
      reach: has_performance_data ? (v.reach ?? null) : null,
      impressions: has_performance_data ? (v.impressions ?? null) : null,
      clicks: has_performance_data ? (v.clicks ?? null) : null,
      spend: has_performance_data ? (v.spend ?? null) : null,
      ctr: has_performance_data ? (v.ctr ?? null) : null,
      cpc: has_performance_data ? (v.cpc ?? null) : null,
      conversions: has_performance_data ? (v.conversions ?? null) : null,
      freshness: has_performance_data ? 'FRESH' : 'UNAVAILABLE',
      dco_status: v.status || 'TESTING',
      dco_status_label: CampaignControlCenterService.getDcoStatusTranslation(v.status || 'TESTING')
    }));

    // Server-verified Meta Link
    const meta_campaign_id = truth.meta_external_state?.meta_campaign_id || null;
    const meta_link = meta_campaign_id 
      ? `https://www.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${meta_campaign_id}`
      : null;

    return {
      campaign_id: truth.campaign_id,
      title: truth.title,
      projection_type: 'HOST',
      access_role: 'HOST',
      operational_status: opStatusInfo.operational_status,
      operational_status_info: opStatusInfo,
      friendly_delivery_state,
      is_host_action_required: Boolean(truth.error_owner === 'HOST_ERROR' || truth.root_error_classification === 'POLICY_DISAPPROVED'),
      host_next_action: truth.host_next_action,
      plain_english_failure: truth.plain_english_failure,
      performance_state: host_performance_state,
      engagement_state: host_engagement_state,
      financial_safety: {
        is_money_safe: true,
        total_paid: Number((total_paid_cents / 100).toFixed(2)),
        total_paid_cents,
        ad_spend_allocation: Number((ad_spend_allocation_cents / 100).toFixed(2)),
        ad_spend_allocation_cents,
        encho_fee: Number((encho_fee_cents / 100).toFixed(2)),
        encho_fee_cents,
        meta_authorized_spend: Number((meta_authorized_spend_cents / 100).toFixed(2)),
        meta_authorized_spend_cents,
        actual_spend: Number((actual_spend_cents / 100).toFixed(2)),
        actual_spend_cents,
        remaining_authorized_spend: Number((remaining_authorized_spend_cents / 100).toFixed(2)),
        remaining_authorized_spend_cents,
        escrow_status,
        escrow_state_display,
        currency: truth.currency || 'USD',
        is_financial_blocked: truth.financial_safety?.is_financial_blocked || false,
        friendly_financial_guidance: truth.financial_safety?.is_financial_blocked
          ? "Campaign activation is temporarily blocked because a financial authorization mismatch was detected. Your funds remain protected."
          : null
      },
      freshness: {
        external_freshness: truth.meta_external_state.external_freshness,
        external_status_verified_at: truth.meta_external_state.external_status_verified_at,
        performance_freshness: host_performance_state.performance_freshness,
        insights_synced_at: truth.performance_state.insights_synced_at,
        engagement_freshness: host_engagement_state.engagement_freshness,
        engagement_synced_at: truth.engagement_state.engagement_synced_at,
        dco_data_stale: truth.performance_state.dco_data_stale
      },
      dco_state: {
        dco_status: truth.dco_state.dco_status,
        dco_status_label: CampaignControlCenterService.getDcoStatusTranslation(truth.dco_state.dco_status),
        variant_count: truth.dco_state.variant_count,
        winner_variant_id: truth.dco_state.winner_variant_id,
        variants: host_variants
      },
      timeline,
      allowed_actions: actionsInfo.allowed_actions,
      action_previews: actionsInfo.action_previews,
      meta_link,
      failure_intelligence: FailureIntelligenceService.projectFailureIntelligenceForViewer(truth.failure_intelligence, viewerContext)
      // REDACTED FOR HOST:
      // - correlation_id (omitted)
      // - raw_traces_count / traces (omitted)
      // - root_error_code / subcode (omitted)
      // - root_error_message / type (omitted)
      // - object_hierarchy raw IDs (omitted)
      // - admin_next_action (omitted)
      // - internal database diagnostics / stack traces (omitted)
    };
  }

  private static getFriendlyDeliveryState(truth: any): string {
    const op = this.getOperationalStatus(truth);
    return op.display_label;
  }

  public static getDcoStatusTranslation(status: string): string {
    switch (status?.toUpperCase()) {
      case 'TESTING':
        return 'ENCHO is comparing your approved creatives.';
      case 'WINNER_SELECTED':
        return 'A better-performing creative has been identified.';
      case 'WINNER_OPTIMIZED':
        return 'The lower-performing creative has been paused.';
      case 'PRUNED':
        return 'This creative is no longer being delivered.';
      default:
        return 'Creative variant active.';
    }
  }

  public static getOperationalStatus(truth: any): { 
    operational_status: string; 
    operational_reason: string | null; 
    operational_owner: string | null; 
    recommended_action: string | null; 
    financial_safety_state: string; 
    last_verified_at: string | null;
    display_label: string;
    display_description: string;
    badge_color: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'purple';
  } {
    let opStatus = 'UNKNOWN';
    const gov = truth.governance_status;
    const pub = truth.publish_status;
    const meta = truth.meta_external_state?.meta_effective_status || truth.meta_external_state?.meta_status;
    const review = truth.meta_external_state?.meta_review_status;

    // Rule A: APPROVED MUST NEVER mean LIVE
    if (meta === 'EXTERNAL_VERIFICATION_BLOCKED' || truth.meta_external_state?.meta_effective_status === 'EXTERNAL_VERIFICATION_BLOCKED' || truth.meta_external_state?.meta_status === 'EXTERNAL_VERIFICATION_BLOCKED') {
      opStatus = 'EXTERNAL_VERIFICATION_BLOCKED';
    } else if (pub === 'EXTERNAL_OUTCOME_UNKNOWN' || truth.meta_external_state?.reconciliation_required || truth.reconciliation_state === 'RECONCILIATION_REQUIRED') {
      opStatus = 'RECONCILIATION_REQUIRED';
    } else if (pub === 'UNKNOWN' || meta === 'UNKNOWN' || truth.meta_external_state?.external_freshness === 'UNKNOWN') {
      opStatus = 'UNKNOWN';
    } else if (pub === 'FAILED' || pub === 'FAILED_PUBLISH' || pub === 'ROLLBACK_FAILED' || pub === 'QUARANTINED') {
      opStatus = 'FAILED';
    } else if (pub === 'QUEUED_FOR_DISPATCH' || pub === 'DISPATCHING' || pub === 'PRECHECK_RUNNING') {
      opStatus = 'DISPATCHING';
    } else if (gov === 'DRAFT' || gov === 'PENDING_ADMIN_REVIEW' || pub === 'IDLE') {
      opStatus = 'NOT_DISPATCHED';
    } else if (pub === 'SUCCESS' || pub === 'LIVE') {
      if ((meta === 'LIVE' || meta === 'ACTIVE') && truth.meta_external_state?.external_freshness !== 'UNKNOWN' && meta !== 'EXTERNAL_VERIFICATION_BLOCKED') {
        opStatus = 'LIVE';
      } else if (meta === 'CAMPAIGN_OFF' || meta === 'PAUSED') {
        opStatus = 'PAUSED';
      } else if (meta === 'ADSET_OFF') {
        opStatus = 'ADSET_OFF';
      } else if (meta === 'NOT_DELIVERING') {
        opStatus = 'NOT_DELIVERING';
      } else if (meta === 'PENDING_META_REVIEW' || review === 'PENDING_REVIEW') {
        opStatus = 'PENDING_REVIEW';
      } else if (meta === 'DISAPPROVED' || review === 'DISAPPROVED' || truth.root_error_classification === 'POLICY_DISAPPROVED') {
        opStatus = 'DISAPPROVED';
      } else if (meta === 'CREATED_NOT_SERVING' || meta === 'CAMPAIGN_GROUP_ACTIVE' || meta === 'ADSET_PAUSED' || meta === 'ARCHIVED') {
        opStatus = 'CREATED_NOT_SERVING';
      } else {
        opStatus = 'OBJECTS_CREATED';
      }
    }

    let owner = truth.error_owner || null;
    let reason = truth.plain_english_failure || truth.root_error_message || null;
    let action = truth.admin_next_action || truth.host_next_action || null;

    if (opStatus === 'EXTERNAL_VERIFICATION_BLOCKED') {
      owner = 'META_INFRASTRUCTURE';
      reason = 'Meta developer portal access deactivated (OAuth code 200). Awaiting developer reactivation.';
      action = 'Complete developer registration on developer.facebook.com to resume live sync.';
    } else if (opStatus === 'RECONCILIATION_REQUIRED') {
      owner = 'SYSTEM';
      reason = 'Awaiting Meta synchronization confirmation.';
      action = 'System will auto-heal via background reconciliation worker.';
    }

    const displayInfo = this.getOperationalStatusDisplay(opStatus, gov);

    return {
      operational_status: opStatus,
      operational_reason: reason,
      operational_owner: owner,
      recommended_action: action,
      financial_safety_state: truth.financial_safety?.escrow_status || 'HOLDING',
      last_verified_at: truth.meta_external_state?.external_status_verified_at || null,
      display_label: displayInfo.label,
      display_description: displayInfo.description,
      badge_color: displayInfo.badge_color
    };
  }

  public static getOperationalStatusDisplay(status: string, governance_status?: string): {
    label: string;
    description: string;
    badge_color: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'purple';
  } {
    switch (status) {
      case 'EXTERNAL_VERIFICATION_BLOCKED':
        return {
          label: 'External Verification Blocked',
          description: 'Meta API access is currently deactivated or unreachable. Awaiting developer reactivation.',
          badge_color: 'amber'
        };

      case 'NOT_DISPATCHED':
        if (governance_status === 'ADMIN_APPROVED') {
          return {
            label: 'Approved - Waiting for Delivery',
            description: 'Approved by ENCHO. Waiting for Meta delivery dispatch.',
            badge_color: 'blue'
          };
        }
        if (governance_status === 'PENDING_ADMIN_REVIEW') {
          return {
            label: 'Under Review',
            description: 'Your campaign is currently being reviewed by ENCHO administrators.',
            badge_color: 'amber'
          };
        }
        return {
          label: 'Not Yet Dispatched',
          description: 'Your campaign has been created and is waiting to be submitted.',
          badge_color: 'slate'
        };

      case 'DISPATCHING':
        return {
          label: 'Transmitting to Meta',
          description: 'Your campaign is being transmitted to Meta.',
          badge_color: 'blue'
        };

      case 'OBJECTS_CREATED':
        return {
          label: 'Created on Meta (Not Serving)',
          description: 'Your campaign was successfully created on Meta, but it is not currently serving.',
          badge_color: 'amber'
        };

      case 'CREATED_NOT_SERVING':
        return {
          label: 'Delivery Turned Off',
          description: 'Your campaign exists on Meta, but delivery is currently turned off.',
          badge_color: 'amber'
        };

      case 'PENDING_REVIEW':
        return {
          label: 'Meta Review in Progress',
          description: 'Meta is reviewing your advertisement.',
          badge_color: 'purple'
        };

      case 'LIVE':
        return {
          label: 'Live on Meta',
          description: 'Your campaign is currently running on Meta.',
          badge_color: 'emerald'
        };

      case 'PAUSED':
        return {
          label: 'Campaign Paused',
          description: 'Campaign is currently paused on Meta.',
          badge_color: 'slate'
        };

      case 'ADSET_OFF':
        return {
          label: 'Ad Set Paused',
          description: 'Your campaign is approved, but the Meta Ad Set is not currently delivering.',
          badge_color: 'slate'
        };

      case 'NOT_DELIVERING':
        return {
          label: 'Not Delivering',
          description: 'Your campaign is active, but none of the ads are currently delivering.',
          badge_color: 'amber'
        };

      case 'DISAPPROVED':
        return {
          label: 'Ad Disapproved',
          description: 'Meta has not approved your advertisement.',
          badge_color: 'rose'
        };

      case 'FAILED':
        return {
          label: 'Delivery Failed',
          description: 'Your campaign could not be published.',
          badge_color: 'rose'
        };

      case 'RECONCILIATION_REQUIRED':
        return {
          label: 'Verifying State',
          description: 'ENCHO is verifying the current Meta state.',
          badge_color: 'amber'
        };

      case 'UNKNOWN':
      default:
        return {
          label: 'State Unconfirmed',
          description: 'We could not yet confirm the current Meta state.',
          badge_color: 'slate'
        };
    }
  }

  public static buildHostLifecycleTimeline(truth: any): Array<{
    key: string;
    label: string;
    status: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'FAILED';
    description?: string;
    timestamp?: string | null;
  }> {
    const gov = truth.governance_status;
    const pub = truth.publish_status;
    const meta = truth.meta_external_state?.meta_effective_status || truth.meta_external_state?.meta_status;
    const verified = truth.meta_external_state?.external_status_verified_at;

    type StepStatus = 'COMPLETED' | 'CURRENT' | 'PENDING' | 'FAILED';
    const steps: Array<{
      key: string;
      label: string;
      status: StepStatus;
      description?: string;
      timestamp?: string | null;
    }> = [
      {
        key: 'CREATED',
        label: 'Campaign Created',
        status: 'COMPLETED',
        description: 'Campaign configuration initiated.'
      },
      {
        key: 'SUBMITTED',
        label: 'Submitted for Review',
        status: gov === 'DRAFT' ? 'CURRENT' : 'COMPLETED',
        description: gov === 'DRAFT' ? 'Waiting for host submission.' : 'Submitted for quality check.'
      },
      {
        key: 'ADMIN_APPROVED',
        label: 'ENCHO Approved',
        status: gov === 'ADMIN_APPROVED' ? 'COMPLETED' : (gov === 'ADMIN_REJECTED' || gov === 'POLICY_VIOLATED' ? 'FAILED' : 'PENDING'),
        description: gov === 'ADMIN_APPROVED' ? 'Passed quality and brand safety standards.' : (gov === 'PENDING_ADMIN_REVIEW' ? 'Analyst review in progress.' : 'Pending review.')
      },
      {
        key: 'PUBLISHING',
        label: 'Transmitting to Meta',
        status: pub === 'SUCCESS' ? 'COMPLETED' : (pub === 'DISPATCHING' || pub === 'QUEUED_FOR_DISPATCH' ? 'CURRENT' : (pub === 'FAILED_PUBLISH' || pub === 'FAILED' ? 'FAILED' : 'PENDING')),
        description: pub === 'SUCCESS' ? 'Payload successfully accepted by Meta Graph API.' : (pub === 'DISPATCHING' ? 'Active API transmission.' : 'Awaiting dispatch.')
      },
      {
        key: 'META_CREATED',
        label: 'Created on Meta',
        status: truth.meta_external_state?.meta_campaign_id || pub === 'SUCCESS' ? 'COMPLETED' : (pub === 'DISPATCHING' ? 'CURRENT' : 'PENDING'),
        description: truth.meta_external_state?.meta_campaign_id ? 'Campaign structure provisioned in ad account.' : 'Pending object creation.'
      },
      {
        key: 'META_VERIFIED',
        label: 'Meta Verification',
        status: (meta === 'EXTERNAL_VERIFICATION_BLOCKED')
          ? 'FAILED'
          : (verified && truth.meta_external_state?.external_freshness !== 'DEGRADED' && truth.meta_external_state?.external_freshness !== 'UNKNOWN' ? 'COMPLETED' : (pub === 'SUCCESS' ? 'CURRENT' : 'PENDING')),
        timestamp: verified,
        description: (meta === 'EXTERNAL_VERIFICATION_BLOCKED')
          ? 'Meta API access is deactivated or unreachable. Awaiting developer reactivation.'
          : (verified ? 'Active status confirmed with Meta API.' : 'Awaiting verification.')
      },
      {
        key: 'LIVE',
        label: 'Delivering on Facebook & Instagram',
        status: (meta === 'ACTIVE' || meta === 'LIVE') && pub === 'SUCCESS' && truth.meta_external_state?.external_freshness !== 'UNKNOWN' && meta !== 'EXTERNAL_VERIFICATION_BLOCKED' ? 'COMPLETED' : (meta === 'PAUSED' || meta === 'ADSET_OFF' || meta === 'CAMPAIGN_OFF' ? 'CURRENT' : 'PENDING'),
        description: (meta === 'ACTIVE' || meta === 'LIVE') && meta !== 'EXTERNAL_VERIFICATION_BLOCKED' ? 'Serving impressions to targeted audiences.' : (meta === 'EXTERNAL_VERIFICATION_BLOCKED' ? 'Delivery unverified — Meta API access deactivated.' : (meta === 'PAUSED' || meta === 'ADSET_OFF' ? 'Ad delivery currently paused.' : 'Pending live serving.'))
      }
    ];

    if (pub === 'FAILED' || pub === 'FAILED_PUBLISH' || truth.operational_status === 'DISAPPROVED' || truth.operational_status === 'FAILED') {
      steps.push({
        key: 'PROBLEM_DETECTED',
        label: 'Problem Detected',
        status: 'FAILED',
        description: truth.plain_english_failure || 'Campaign could not be delivered to Meta.'
      });
      steps.push({
        key: 'RESOLUTION',
        label: 'Action Required',
        status: 'CURRENT',
        description: truth.host_next_action || 'Review failure guidance below.'
      });
    }

    return steps;
  }

  public static getAllowedHostActions(truth: any): {
    allowed_actions: string[];
    action_previews: Record<string, {
      action: string;
      current_state: string;
      what_will_happen: string;
      what_will_not_happen: string;
      why_allowed: string;
      expected_result: string;
      failure_or_unknown_outcome: string;
    }>;
  } {
    const op = truth.operational_status || this.getOperationalStatus(truth).operational_status;
    const allowed_actions: string[] = [];
    const action_previews: Record<string, any> = {};

    if (op === 'LIVE') {
      allowed_actions.push('PAUSE');
      action_previews['PAUSE'] = {
        action: 'Pause Campaign',
        current_state: 'Campaign is currently LIVE and serving ads on Facebook & Instagram.',
        what_will_happen: 'A pause command will be sent to Meta Ads API. Ad delivery will halt immediately.',
        what_will_not_happen: 'Your campaign will NOT be deleted, and unspent budget remains safe in escrow.',
        why_allowed: 'Hosts have full control to pause active campaigns at any time.',
        expected_result: 'Delivery stops within seconds and status transitions to PAUSED.',
        failure_or_unknown_outcome: 'If Meta API is unreachable, status enters RECONCILIATION_REQUIRED and auto-verifies.'
      };
    } else if (op === 'PAUSED') {
      allowed_actions.push('RESUME');
      action_previews['RESUME'] = {
        action: 'Resume Campaign',
        current_state: 'Campaign is currently PAUSED.',
        what_will_happen: 'An activation command will be sent to Meta Ads API to resume ad delivery.',
        what_will_not_happen: 'Your account will NOT be recharged. Only existing remaining authorized budget will be consumed.',
        why_allowed: 'Hosts can resume paused campaigns whenever remaining budget exists.',
        expected_result: 'Ad delivery restarts on Facebook & Instagram, and status transitions back to LIVE.',
        failure_or_unknown_outcome: 'If Meta API fails, status remains PAUSED with clear guidance.'
      };
    }

    if (op === 'RECONCILIATION_REQUIRED' || truth.meta_external_state?.external_freshness === 'STALE' || truth.meta_external_state?.external_freshness === 'DEGRADED' || op === 'CREATED_NOT_SERVING' || op === 'OBJECTS_CREATED') {
      allowed_actions.push('RESYNC');
      action_previews['RESYNC'] = {
        action: 'Re-sync with Meta',
        current_state: 'External status requires verification against Meta.',
        what_will_happen: 'An active poll will query Meta Graph API to reconcile the exact delivery status and telemetry.',
        what_will_not_happen: 'No creative, targeting, or budget changes will be made.',
        why_allowed: 'Hosts can refresh the latest external status and telemetry on demand.',
        expected_result: 'Telemetry and delivery state are refreshed directly from Meta within seconds.',
        failure_or_unknown_outcome: 'If Meta API is temporarily unreachable, existing cached state is safely preserved.'
      };
    }

    if (op === 'DISAPPROVED' || op === 'FAILED' || truth.error_owner === 'HOST_ERROR' || truth.governance_status === 'ADMIN_REJECTED') {
      allowed_actions.push('FIX_CAMPAIGN');
      action_previews['FIX_CAMPAIGN'] = {
        action: 'Fix Campaign Details',
        current_state: 'Campaign requires media or copy adjustment to meet platform standards.',
        what_will_happen: 'Opens campaign wizard with specific feedback highlighted for instant correction.',
        what_will_not_happen: 'No ads will be served until updated assets are reviewed and cleared.',
        why_allowed: 'Hosts can update flagged fields to comply with advertising policies.',
        expected_result: 'Updated campaign is checked via AI pre-flight and prepared for resubmission.',
        failure_or_unknown_outcome: 'If adjustments still fail policy checks, specific guidance will be highlighted.'
      };

      allowed_actions.push('RESUBMIT');
      action_previews['RESUBMIT'] = {
        action: 'Resubmit for Review',
        current_state: 'Campaign has been updated and is ready for re-evaluation.',
        what_will_happen: 'Submits revised creative and targeting to ENCHO review queue.',
        what_will_not_happen: 'Your payment will NOT be recharged; your existing funded budget applies.',
        why_allowed: 'Hosts can resubmit after correcting flagged media or text.',
        expected_result: 'Campaign moves to PENDING_ADMIN_REVIEW for expedited sign-off.',
        failure_or_unknown_outcome: 'If review fails again, detailed feedback is provided.'
      };
    }

    if (['DRAFT', 'PENDING_ADMIN_REVIEW', 'NOT_DISPATCHED', 'PAUSED'].includes(op) || truth.governance_status === 'DRAFT' || truth.governance_status === 'PENDING_ADMIN_REVIEW') {
      allowed_actions.push('CANCEL');
      action_previews['CANCEL'] = {
        action: 'Cancel Campaign',
        current_state: 'Campaign is currently not serving.',
        what_will_happen: 'Cancels campaign and refunds all unused escrowed budget back to your Host Wallet.',
        what_will_not_happen: 'Already-delivered impressions and fees cannot be refunded.',
        why_allowed: 'Hosts retain full control to cancel campaigns before or during paused states.',
        expected_result: 'Campaign is archived and remaining funds are immediately credited to your wallet.',
        failure_or_unknown_outcome: 'If cancellation fails, escrow remains protected and support is alerted.'
      };
    }

    return { allowed_actions, action_previews };
  }


}
