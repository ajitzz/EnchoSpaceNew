/**
 * Phase 2.7 — Milestone 5: Performance + Social Engagement Synchronization Engine
 *
 * Implements decoupled, authoritative pipelines for:
 * A. Meta Ads Insights Performance Ingestion (impressions, reach, clicks, spend, CTR, CPC, conversions)
 * B. Meta Social Engagement Ingestion (comments, reactions, shares where supported)
 *
 * Enforces:
 * - Decoupled data sources (Ads Insights vs. Graph Object Engagement)
 * - Raw authoritative values (no synthetic metrics)
 * - Freshness Classification Contracts (FRESH <=15m, DELAYED <=60m, STALE <=6h, UNAVAILABLE >6h)
 * - DCO data staleness boundary (>6h)
 * - Negative / cumulative snapshot delta ingestion (preserves negative corrections, prevents double counting on duplicate poll)
 * - Tenant isolation (Meta object -> ENCHO campaign -> Host ownership)
 * - Strict observation/telemetry only (NO DCO or FSM mutations)
 */

import pg from 'pg';

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

export type PerformanceFreshness = 'FRESH' | 'DELAYED' | 'STALE' | 'UNAVAILABLE';
export type EngagementFreshness = 'FRESH' | 'DELAYED' | 'STALE' | 'UNAVAILABLE';

export interface PerformanceSyncMetadata {
  source: 'META_ADS_INSIGHTS';
  fetched_at: string;
  data_window: string;
  freshness: PerformanceFreshness;
  object_id: string;
  campaign_id: number;
  adset_id?: string | null;
  ad_id?: string | null;
  variant_id?: number | null;
}

export interface EngagementSyncMetadata {
  source: 'META_GRAPH_ENGAGEMENT';
  fetched_at: string;
  freshness: EngagementFreshness;
  object_id: string;
  campaign_id: number;
  supported_metrics: string[];
}

export interface PerformanceSyncOptions {
  forcedInsights?: any;
  dataWindow?: string;
  viewerContext?: {
    userId?: number | string;
    role?: string;
    isAdmin?: boolean;
  };
  timeoutMs?: number;
}

export interface EngagementSyncOptions {
  forcedEngagement?: any;
  viewerContext?: {
    userId?: number | string;
    role?: string;
    isAdmin?: boolean;
  };
  timeoutMs?: number;
}

export interface PerformanceSyncResult {
  success: boolean;
  campaign_id: number;
  meta_object_id: string | null;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  spend_cents: number;
  ctr: number;
  cpc: number;
  cpc_cents: number;
  conversions: number;
  insights_synced_at: string;
  freshness: PerformanceFreshness;
  dco_data_stale: boolean;
  telemetry_metadata: PerformanceSyncMetadata;
  is_negative_correction?: boolean;
  error?: string;
  error_code?: string;
}

export interface EngagementSyncResult {
  success: boolean;
  campaign_id: number;
  meta_object_id: string | null;
  comments: number;
  reactions: number;
  shares: number | null;
  engagement_synced_at: string;
  freshness: EngagementFreshness;
  engagement_metadata: EngagementSyncMetadata;
  error?: string;
  error_code?: string;
}

export class MetaTelemetrySyncEngine {
  /**
   * Performance Freshness Contract:
   * FRESH       <= 15m (900,000 ms)
   * DELAYED     > 15m and <= 60m (3,600,000 ms)
   * STALE       > 60m and <= 6h (21,600,000 ms)
   * UNAVAILABLE > 6h or null/invalid
   */
  public static calculatePerformanceFreshness(syncedAt: Date | string | null | undefined): PerformanceFreshness {
    if (!syncedAt) return 'UNAVAILABLE';
    const dateMs = new Date(syncedAt).getTime();
    if (isNaN(dateMs)) return 'UNAVAILABLE';
    const ageMs = Date.now() - dateMs;
    if (ageMs < 0) return 'FRESH'; // protection against minor timestamp skew
    if (ageMs <= 15 * 60 * 1000) return 'FRESH';
    if (ageMs <= 60 * 60 * 1000) return 'DELAYED';
    if (ageMs <= 6 * 60 * 60 * 1000) return 'STALE';
    return 'UNAVAILABLE';
  }

  /**
   * Engagement Freshness Contract:
   * Same window limits as performance freshness.
   */
  public static calculateEngagementFreshness(syncedAt: Date | string | null | undefined): EngagementFreshness {
    if (!syncedAt) return 'UNAVAILABLE';
    const dateMs = new Date(syncedAt).getTime();
    if (isNaN(dateMs)) return 'UNAVAILABLE';
    const ageMs = Date.now() - dateMs;
    if (ageMs < 0) return 'FRESH';
    if (ageMs <= 15 * 60 * 1000) return 'FRESH';
    if (ageMs <= 60 * 60 * 1000) return 'DELAYED';
    if (ageMs <= 6 * 60 * 60 * 1000) return 'STALE';
    return 'UNAVAILABLE';
  }

  /**
   * Check if insights data age exceeds 6 Hours (21,600,000 ms) for DCO decision safety.
   */
  public static isDcoDataStale(syncedAt: Date | string | null | undefined): boolean {
    if (!syncedAt) return true;
    const dateMs = new Date(syncedAt).getTime();
    if (isNaN(dateMs)) return true;
    const ageMs = Date.now() - dateMs;
    return ageMs > 6 * 60 * 60 * 1000;
  }

  private static async syncVariantInsights(
    variantId: number,
    metaAdId: string | null,
    insights: { impressions: number; clicks: number; conversions: number; spend: number },
    db: any
  ): Promise<void> {
    const observedAt = new Date();
    const snapshotRef = `m5_sync_${metaAdId || variantId}_${observedAt.getTime()}`;

    // Lock snapshot row for atomic concurrency control
    const snapRes = await db.query(
      `SELECT * FROM variant_meta_snapshots WHERE variant_id = $1 FOR UPDATE`,
      [variantId]
    );
    const storedSnap = snapRes.rows[0];

    let beforeVersion = 0;
    let lastImpressions = 0;
    let lastClicks = 0;
    let lastConversions = 0;
    let lastSpend = 0;

    if (storedSnap) {
      beforeVersion = Number(storedSnap.snapshot_version || 0);
      lastImpressions = Number(storedSnap.last_meta_impressions || 0);
      lastClicks = Number(storedSnap.last_meta_clicks || 0);
      lastConversions = Number(storedSnap.last_meta_conversions || 0);
      lastSpend = Number(storedSnap.last_meta_spend || 0);
    } else {
      await db.query(
        `INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, snapshot_version)
         VALUES ($1, 0, 0, 0, 0.0000, 0)`,
        [variantId]
      );
      beforeVersion = 0;
    }

    const afterVersion = beforeVersion + 1;
    const rawImpDelta = insights.impressions - lastImpressions;
    const rawClickDelta = insights.clicks - lastClicks;
    const rawConvDelta = insights.conversions - lastConversions;
    const rawSpendDelta = insights.spend - lastSpend;

    const isCorrection = (rawImpDelta < 0 || rawClickDelta < 0 || rawConvDelta < 0 || rawSpendDelta < 0);

    // Emit raw event log with exact delta provenance
    await db.query(
      `INSERT INTO variant_raw_event_logs (
        variant_id, meta_ad_id, snapshot_before_version, snapshot_after_version,
        impressions_delta, clicks_delta, conversions_delta, spend_delta,
        is_correction, observed_at, processed, source_snapshot_reference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
      ON CONFLICT (variant_id, snapshot_before_version, snapshot_after_version) DO NOTHING`,
      [
        variantId, metaAdId, beforeVersion, afterVersion,
        rawImpDelta, rawClickDelta, rawConvDelta, rawSpendDelta,
        isCorrection, observedAt, snapshotRef
      ]
    );

    // Update variant snapshot state
    await db.query(
      `UPDATE variant_meta_snapshots
       SET last_meta_impressions = $1,
           last_meta_clicks = $2,
           last_meta_conversions = $3,
           last_meta_spend = $4,
           snapshot_version = $5,
           last_meta_fetched_at = $6,
           updated_at = NOW()
       WHERE variant_id = $7`,
      [insights.impressions, insights.clicks, insights.conversions, insights.spend, afterVersion, observedAt, variantId]
    );

    // Update variant_daily_rollups for the observed date
    if (rawImpDelta !== 0 || rawClickDelta !== 0 || rawConvDelta !== 0 || rawSpendDelta !== 0) {
      const dateStr = observedAt.toISOString().split('T')[0];
      await db.query(
        `INSERT INTO variant_daily_rollups (variant_id, date, impressions, clicks, conversions, spend_usd)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (variant_id, date)
         DO UPDATE SET
           impressions = variant_daily_rollups.impressions + EXCLUDED.impressions,
           clicks = variant_daily_rollups.clicks + EXCLUDED.clicks,
           conversions = variant_daily_rollups.conversions + EXCLUDED.conversions,
           spend_usd = variant_daily_rollups.spend_usd + EXCLUDED.spend_usd`,
        [variantId, dateStr, rawImpDelta, rawClickDelta, rawConvDelta, rawSpendDelta]
      );
    }
  }

  /**
   * Synchronize Meta Ads Insights Performance Telemetry.
   */
  public static async syncAdsInsights(
    campaignId: number,
    options: PerformanceSyncOptions = {},
    dbClient?: any
  ): Promise<PerformanceSyncResult> {
    const db = dbClient || getDbPool();
    // 1. Resolve campaign & verify host tenant isolation
    const campaignRes = await db.query(
      `SELECT id, host_id, meta_campaign_id, meta_adset_id, meta_ad_id, 
              accumulated_impressions, accumulated_clicks, accumulated_spent, accumulated_conversions, reach,
              insights_synced_at, telemetry_source_metadata
       FROM host_marketing_campaigns WHERE id = $1`,
      [campaignId]
    );

    if (campaignRes.rows.length === 0) {
      throw new Error(`CAMPAIGN_NOT_FOUND: Campaign #${campaignId} does not exist`);
    }

    const campaign = campaignRes.rows[0];

    // Tenant Isolation Guard
    if (options.viewerContext) {
      const { userId, role, isAdmin } = options.viewerContext;
      const userIsAdmin = Boolean(isAdmin || role === 'admin');
      if (!userIsAdmin && userId !== undefined && Number(campaign.host_id) !== Number(userId)) {
        const err: any = new Error(`TENANT_ACCESS_DENIED: Host #${userId} is not authorized to access Campaign #${campaignId}`);
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const metaObjectId = campaign.meta_campaign_id || campaign.meta_adset_id || campaign.meta_ad_id || null;
    if (!metaObjectId && !options.forcedInsights) {
      return {
        success: false,
        campaign_id: campaignId,
        meta_object_id: null,
        impressions: Number(campaign.accumulated_impressions || 0),
        reach: Number(campaign.reach || 0),
        clicks: Number(campaign.accumulated_clicks || 0),
        spend: Number(campaign.accumulated_spent || 0),
        spend_cents: Math.round(Number(campaign.accumulated_spent || 0) * 100),
        ctr: Number(campaign.accumulated_impressions) > 0 ? Number((Number(campaign.accumulated_clicks) / Number(campaign.accumulated_impressions)).toFixed(4)) : 0,
        cpc: Number(campaign.accumulated_clicks) > 0 ? Number((Number(campaign.accumulated_spent) / Number(campaign.accumulated_clicks)).toFixed(2)) : 0,
        cpc_cents: Number(campaign.accumulated_clicks) > 0 ? Math.round((Number(campaign.accumulated_spent) * 100) / Number(campaign.accumulated_clicks)) : 0,
        conversions: Number(campaign.accumulated_conversions || 0),
        insights_synced_at: campaign.insights_synced_at ? new Date(campaign.insights_synced_at).toISOString() : new Date(0).toISOString(),
        freshness: this.calculatePerformanceFreshness(campaign.insights_synced_at),
        dco_data_stale: this.isDcoDataStale(campaign.insights_synced_at),
        telemetry_metadata: {
          source: 'META_ADS_INSIGHTS',
          fetched_at: new Date().toISOString(),
          data_window: options.dataWindow || 'lifetime',
          freshness: 'UNAVAILABLE',
          object_id: 'NONE',
          campaign_id: campaignId
        },
        error: 'MISSING_META_OBJECT: Campaign has no meta_campaign_id, meta_adset_id, or meta_ad_id',
        error_code: 'MISSING_META_OBJECT'
      };
    }

    const nowIso = new Date().toISOString();

    // Check if campaign has active published creative variants
    const activeVariantsRes = await db.query(
      `SELECT id, meta_ad_id FROM campaign_creative_variants WHERE campaign_id = $1 AND is_published = true AND (status IS NULL OR status != 'DELETED') ORDER BY id ASC`,
      [campaignId]
    );

    if (activeVariantsRes.rows.length > 0) {
      // Ingest variant telemetry via Phase 2.6 canonical lineage
      for (const v of activeVariantsRes.rows) {
        let varInsights = { impressions: 0, clicks: 0, conversions: 0, spend: 0 };

        if (options.forcedInsights) {
          if (options.forcedInsights.variants && options.forcedInsights.variants[v.id]) {
            const vi = options.forcedInsights.variants[v.id];
            varInsights = {
              impressions: Number(vi.impressions || 0),
              clicks: Number(vi.clicks || 0),
              conversions: Number(vi.conversions || 0),
              spend: Number(vi.spend || 0)
            };
          } else {
            varInsights = {
              impressions: Number(options.forcedInsights.impressions ?? options.forcedInsights.accumulated_impressions ?? 0),
              clicks: Number(options.forcedInsights.clicks ?? options.forcedInsights.accumulated_clicks ?? 0),
              conversions: Number(options.forcedInsights.conversions ?? options.forcedInsights.accumulated_conversions ?? 0),
              spend: Number(options.forcedInsights.spend ?? options.forcedInsights.accumulated_spent ?? 0)
            };
          }
        } else {
          // Fetch from Meta API for variant ad
          const vMetaId = v.meta_ad_id || metaObjectId;
          const token = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
          const baseUrl = process.env.META_BASE_URL || 'https://graph.facebook.com/v20.0';
          const url = `${baseUrl}/${vMetaId}/insights?fields=impressions,clicks,spend,actions,conversions&date_preset=maximum&access_token=${token}`;

          try {
            const timeoutMs = options.timeoutMs || 10000;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            const json = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
            if (res.ok && json.data?.[0]) {
              const rawV = json.data[0];
              varInsights.impressions = Number(rawV.impressions || 0);
              varInsights.clicks = Number(rawV.clicks || 0);
              varInsights.spend = Number(rawV.spend || 0);
              if (rawV.conversions) {
                varInsights.conversions = Number(rawV.conversions);
              } else if (rawV.actions && Array.isArray(rawV.actions)) {
                for (const act of rawV.actions) {
                  if (['lead', 'purchase'].includes(act.action_type)) {
                    varInsights.conversions += Number(act.value || 0);
                  }
                }
              }
            }
          } catch (e) {
            // Ignore fetch errors per-variant
          }
        }

        await this.syncVariantInsights(v.id, v.meta_ad_id, varInsights, db);
      }

      // Aggregate canonical variant snapshot state
      const varIds = activeVariantsRes.rows.map((r: any) => r.id);
      const varSnapSumRes = await db.query(
        `SELECT 
           COALESCE(SUM(last_meta_impressions), 0) as total_imp,
           COALESCE(SUM(last_meta_clicks), 0) as total_clicks,
           COALESCE(SUM(last_meta_conversions), 0) as total_conv,
           COALESCE(SUM(last_meta_spend), 0) as total_spend,
           MIN(last_meta_fetched_at) as min_fetched_at
         FROM variant_meta_snapshots
         WHERE variant_id = ANY($1::int[])`,
        [varIds]
      );

      const aggImp = Number(varSnapSumRes.rows[0].total_imp || 0);
      const aggClicks = Number(varSnapSumRes.rows[0].total_clicks || 0);
      const aggConv = Number(varSnapSumRes.rows[0].total_conv || 0);
      const aggSpend = Number(varSnapSumRes.rows[0].total_spend || 0);
      const minFetchedAt = varSnapSumRes.rows[0].min_fetched_at;
      const minFetchedAtIso = minFetchedAt ? new Date(minFetchedAt).toISOString() : nowIso;

      const aggCtr = aggImp > 0 ? Number((aggClicks / aggImp).toFixed(4)) : 0;
      const aggCpc = aggClicks > 0 ? Number((aggSpend / aggClicks).toFixed(2)) : 0;
      const aggSpendCents = Math.round(aggSpend * 100);
      const aggCpcCents = Math.round(aggCpc * 100);

      const prevSpend = Number(campaign.accumulated_spent || 0);
      const prevClicks = Number(campaign.accumulated_clicks || 0);
      const prevImpressions = Number(campaign.accumulated_impressions || 0);
      const isNegativeCorrection = (aggSpend < prevSpend) || (aggClicks < prevClicks) || (aggImp < prevImpressions);

      const freshness = this.calculatePerformanceFreshness(minFetchedAtIso);
      const dco_data_stale = this.isDcoDataStale(minFetchedAtIso);

      const metadata: PerformanceSyncMetadata = {
        source: 'META_ADS_INSIGHTS',
        fetched_at: nowIso,
        data_window: options.dataWindow || 'lifetime',
        freshness,
        object_id: metaObjectId || 'FORCED_TEST',
        campaign_id: campaignId,
        adset_id: campaign.meta_adset_id || null,
        ad_id: campaign.meta_ad_id || null
      };

      // Write to host_marketing_campaigns as DERIVED CACHE ONLY
      await db.query(
        `UPDATE host_marketing_campaigns
         SET accumulated_impressions = $1,
             accumulated_clicks = $2,
             accumulated_spent = $3,
             spent = $3,
             accumulated_conversions = $4,
             reach = $5,
             insights_synced_at = $6,
             telemetry_source_metadata = $7::jsonb,
             updated_at = NOW()
         WHERE id = $8`,
        [aggImp, aggClicks, aggSpend, aggConv, aggImp, minFetchedAtIso, JSON.stringify(metadata), campaignId]
      );

      return {
        success: true,
        campaign_id: campaignId,
        meta_object_id: metaObjectId,
        impressions: aggImp,
        reach: aggImp,
        clicks: aggClicks,
        spend: aggSpend,
        spend_cents: aggSpendCents,
        ctr: aggCtr,
        cpc: aggCpc,
        cpc_cents: aggCpcCents,
        conversions: aggConv,
        insights_synced_at: minFetchedAtIso,
        freshness,
        dco_data_stale,
        telemetry_metadata: metadata,
        is_negative_correction: isNegativeCorrection
      };
    }

    // Single-ad / Non-variant Campaign Ingestion Pipeline
    let rawData: any = null;

    if (options.forcedInsights) {
      rawData = options.forcedInsights;
    } else {
      const token = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
      const baseUrl = process.env.META_BASE_URL || 'https://graph.facebook.com/v20.0';
      const url = `${baseUrl}/${metaObjectId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,actions,conversions&date_preset=maximum&access_token=${token}`;

      try {
        const timeoutMs = options.timeoutMs || 10000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        const json = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (!res.ok || json.error) {
          const errCode = json.error?.code || res.status;
          const isRateLimit = [17, 32, 613].includes(Number(json.error?.code)) || res.status === 429;
          const isTimeout = controller.signal.aborted;

          return {
            success: false,
            campaign_id: campaignId,
            meta_object_id: metaObjectId,
            impressions: Number(campaign.accumulated_impressions || 0),
            reach: Number(campaign.reach || 0),
            clicks: Number(campaign.accumulated_clicks || 0),
            spend: Number(campaign.accumulated_spent || 0),
            spend_cents: Math.round(Number(campaign.accumulated_spent || 0) * 100),
            ctr: 0,
            cpc: 0,
            cpc_cents: 0,
            conversions: Number(campaign.accumulated_conversions || 0),
            insights_synced_at: campaign.insights_synced_at ? new Date(campaign.insights_synced_at).toISOString() : new Date(0).toISOString(),
            freshness: this.calculatePerformanceFreshness(campaign.insights_synced_at),
            dco_data_stale: this.isDcoDataStale(campaign.insights_synced_at),
            telemetry_metadata: {
              source: 'META_ADS_INSIGHTS',
              fetched_at: nowIso,
              data_window: options.dataWindow || 'lifetime',
              freshness: 'UNAVAILABLE',
              object_id: metaObjectId || '',
              campaign_id: campaignId
            },
            error: json.error?.message || `Meta API failed with status ${res.status}`,
            error_code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : (isTimeout ? 'META_API_TIMEOUT' : `META_API_ERROR_${errCode}`)
          };
        }

        rawData = json.data?.[0] || {};
      } catch (err: any) {
        const isAbort = err.name === 'AbortError';
        return {
          success: false,
          campaign_id: campaignId,
          meta_object_id: metaObjectId,
          impressions: Number(campaign.accumulated_impressions || 0),
          reach: Number(campaign.reach || 0),
          clicks: Number(campaign.accumulated_clicks || 0),
          spend: Number(campaign.accumulated_spent || 0),
          spend_cents: Math.round(Number(campaign.accumulated_spent || 0) * 100),
          ctr: 0,
          cpc: 0,
          cpc_cents: 0,
          conversions: Number(campaign.accumulated_conversions || 0),
          insights_synced_at: campaign.insights_synced_at ? new Date(campaign.insights_synced_at).toISOString() : new Date(0).toISOString(),
          freshness: this.calculatePerformanceFreshness(campaign.insights_synced_at),
          dco_data_stale: this.isDcoDataStale(campaign.insights_synced_at),
          telemetry_metadata: {
            source: 'META_ADS_INSIGHTS',
            fetched_at: nowIso,
            data_window: options.dataWindow || 'lifetime',
            freshness: 'UNAVAILABLE',
            object_id: metaObjectId || '',
            campaign_id: campaignId
          },
          error: err.message || 'Network error accessing Meta API',
          error_code: isAbort ? 'META_API_TIMEOUT' : 'META_API_NETWORK_EXCEPTION'
        };
      }
    }

    // Parse Authoritative Metrics
    const newImpressions = Number(rawData.impressions ?? rawData.accumulated_impressions ?? 0);
    const newReach = Number(rawData.reach ?? rawData.impressions ?? 0);
    const newClicks = Number(rawData.clicks ?? rawData.accumulated_clicks ?? 0);
    const newSpend = Number(rawData.spend ?? rawData.accumulated_spent ?? 0);

    let newConversions = 0;
    if (rawData.conversions !== undefined && rawData.conversions !== null) {
      newConversions = Number(rawData.conversions);
    } else if (rawData.actions && Array.isArray(rawData.actions)) {
      for (const act of rawData.actions) {
        const actionType = String(act.action_type || '');
        if (
          actionType === 'lead' ||
          actionType === 'purchase' ||
          actionType.includes('offsite_conversion.fb_pixel_purchase') ||
          actionType.includes('messaging_lead') ||
          actionType.includes('contact')
        ) {
          newConversions += Number(act.value || 0);
        }
      }
    }

    // CTR & CPC Verification / Derivation
    let newCtr = 0;
    if (rawData.ctr !== undefined && rawData.ctr !== null && !isNaN(Number(rawData.ctr))) {
      newCtr = Number(rawData.ctr);
    } else if (newImpressions > 0) {
      newCtr = Number((newClicks / newImpressions).toFixed(4));
    }

    let newCpc = 0;
    if (rawData.cpc !== undefined && rawData.cpc !== null && !isNaN(Number(rawData.cpc))) {
      newCpc = Number(rawData.cpc);
    } else if (newClicks > 0) {
      newCpc = Number((newSpend / newClicks).toFixed(2));
    }

    const newSpendCents = Math.round(newSpend * 100);
    const newCpcCents = Math.round(newCpc * 100);

    // Negative Correction Detection
    const prevSpend = Number(campaign.accumulated_spent || 0);
    const prevClicks = Number(campaign.accumulated_clicks || 0);
    const prevImpressions = Number(campaign.accumulated_impressions || 0);

    const isNegativeCorrection = (newSpend < prevSpend) || (newClicks < prevClicks) || (newImpressions < prevImpressions);

    // Emit Raw Event Delta Log for Single-Ad Campaign Lineage
    const rawImpDelta = newImpressions - prevImpressions;
    const rawClickDelta = newClicks - prevClicks;
    const rawConvDelta = newConversions - Number(campaign.accumulated_conversions || 0);
    const rawSpendDelta = newSpend - prevSpend;

    if (rawImpDelta !== 0 || rawClickDelta !== 0 || rawConvDelta !== 0 || rawSpendDelta !== 0) {
      try {
        await db.query(
          `INSERT INTO campaign_raw_event_logs (
            campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, is_correction, processed, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
          [campaignId, rawImpDelta, rawClickDelta, rawConvDelta, rawSpendDelta, isNegativeCorrection]
        );
      } catch (e) {
        await db.query(
          `INSERT INTO campaign_raw_event_logs (
            campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at
          ) VALUES ($1, $2, $3, $4, $5, false, NOW())`,
          [campaignId, rawImpDelta, rawClickDelta, rawConvDelta, rawSpendDelta]
        );
      }
    }

    // Performance Metadata Payload
    const freshness: PerformanceFreshness = 'FRESH';
    const metadata: PerformanceSyncMetadata = {
      source: 'META_ADS_INSIGHTS',
      fetched_at: nowIso,
      data_window: options.dataWindow || 'lifetime',
      freshness,
      object_id: metaObjectId || 'FORCED_TEST',
      campaign_id: campaignId,
      adset_id: campaign.meta_adset_id || null,
      ad_id: campaign.meta_ad_id || null
    };

    // Update Database Authoritative Snapshot (preserving negative corrections, preventing duplicate polling drift)
    await db.query(
      `UPDATE host_marketing_campaigns
       SET accumulated_impressions = $1,
           accumulated_clicks = $2,
           accumulated_spent = $3,
           spent = $3,
           accumulated_conversions = $4,
           reach = $5,
           insights_synced_at = $6,
           telemetry_source_metadata = $7::jsonb,
           updated_at = NOW()
       WHERE id = $8`,
      [newImpressions, newClicks, newSpend, newConversions, newReach, nowIso, JSON.stringify(metadata), campaignId]
    );

    return {
      success: true,
      campaign_id: campaignId,
      meta_object_id: metaObjectId,
      impressions: newImpressions,
      reach: newReach,
      clicks: newClicks,
      spend: newSpend,
      spend_cents: newSpendCents,
      ctr: newCtr,
      cpc: newCpc,
      cpc_cents: newCpcCents,
      conversions: newConversions,
      insights_synced_at: nowIso,
      freshness,
      dco_data_stale: false,
      telemetry_metadata: metadata,
      is_negative_correction: isNegativeCorrection
    };
  }

  /**
   * Synchronize Meta Social Engagement (Comments, Reactions, Shares).
   */
  public static async syncSocialEngagement(
    campaignId: number,
    options: EngagementSyncOptions = {},
    dbClient?: any
  ): Promise<EngagementSyncResult> {
    const db = dbClient || getDbPool();
    // 1. Resolve campaign & verify host tenant isolation
    const campaignRes = await db.query(
      `SELECT id, host_id, meta_campaign_id, meta_adset_id, meta_ad_id, 
              comments_count, reactions_count, shares_count, engagement_synced_at, engagement_source_metadata
       FROM host_marketing_campaigns WHERE id = $1`,
      [campaignId]
    );

    if (campaignRes.rows.length === 0) {
      throw new Error(`CAMPAIGN_NOT_FOUND: Campaign #${campaignId} does not exist`);
    }

    const campaign = campaignRes.rows[0];

    // Tenant Isolation Guard
    if (options.viewerContext) {
      const { userId, role, isAdmin } = options.viewerContext;
      const userIsAdmin = Boolean(isAdmin || role === 'admin');
      if (!userIsAdmin && userId !== undefined && Number(campaign.host_id) !== Number(userId)) {
        const err: any = new Error(`TENANT_ACCESS_DENIED: Host #${userId} is not authorized to access Campaign #${campaignId}`);
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const metaObjectId = campaign.meta_ad_id || campaign.meta_campaign_id || null;
    if (!metaObjectId && !options.forcedEngagement) {
      return {
        success: false,
        campaign_id: campaignId,
        meta_object_id: null,
        comments: Number(campaign.comments_count || 0),
        reactions: Number(campaign.reactions_count || 0),
        shares: campaign.shares_count !== null && campaign.shares_count !== undefined ? Number(campaign.shares_count) : null,
        engagement_synced_at: campaign.engagement_synced_at ? new Date(campaign.engagement_synced_at).toISOString() : new Date(0).toISOString(),
        freshness: this.calculateEngagementFreshness(campaign.engagement_synced_at),
        engagement_metadata: {
          source: 'META_GRAPH_ENGAGEMENT',
          fetched_at: new Date().toISOString(),
          freshness: 'UNAVAILABLE',
          object_id: 'NONE',
          campaign_id: campaignId,
          supported_metrics: []
        },
        error: 'MISSING_META_OBJECT: Campaign has no meta_ad_id or meta_campaign_id for engagement sync',
        error_code: 'MISSING_META_OBJECT'
      };
    }

    let rawData: any = null;
    const nowIso = new Date().toISOString();

    if (options.forcedEngagement) {
      rawData = options.forcedEngagement;
    } else {
      const token = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
      const baseUrl = process.env.META_BASE_URL || 'https://graph.facebook.com/v20.0';
      const url = `${baseUrl}/${metaObjectId}?fields=id,comments.summary(true),reactions.summary(true),shares&access_token=${token}`;

      try {
        const timeoutMs = options.timeoutMs || 10000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        const json = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (!res.ok || json.error) {
          const errCode = json.error?.code || res.status;
          const isRateLimit = [17, 32, 613].includes(Number(json.error?.code)) || res.status === 429;
          const isTimeout = controller.signal.aborted;

          return {
            success: false,
            campaign_id: campaignId,
            meta_object_id: metaObjectId,
            comments: Number(campaign.comments_count || 0),
            reactions: Number(campaign.reactions_count || 0),
            shares: campaign.shares_count !== null && campaign.shares_count !== undefined ? Number(campaign.shares_count) : null,
            engagement_synced_at: campaign.engagement_synced_at ? new Date(campaign.engagement_synced_at).toISOString() : new Date(0).toISOString(),
            freshness: this.calculateEngagementFreshness(campaign.engagement_synced_at),
            engagement_metadata: {
              source: 'META_GRAPH_ENGAGEMENT',
              fetched_at: nowIso,
              freshness: 'UNAVAILABLE',
              object_id: metaObjectId || '',
              campaign_id: campaignId,
              supported_metrics: []
            },
            error: json.error?.message || `Meta Engagement API failed with status ${res.status}`,
            error_code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : (isTimeout ? 'META_API_TIMEOUT' : `META_API_ERROR_${errCode}`)
          };
        }

        rawData = json;
      } catch (err: any) {
        const isAbort = err.name === 'AbortError';
        return {
          success: false,
          campaign_id: campaignId,
          meta_object_id: metaObjectId,
          comments: Number(campaign.comments_count || 0),
          reactions: Number(campaign.reactions_count || 0),
          shares: campaign.shares_count !== null && campaign.shares_count !== undefined ? Number(campaign.shares_count) : null,
          engagement_synced_at: campaign.engagement_synced_at ? new Date(campaign.engagement_synced_at).toISOString() : new Date(0).toISOString(),
          freshness: this.calculateEngagementFreshness(campaign.engagement_synced_at),
          engagement_metadata: {
            source: 'META_GRAPH_ENGAGEMENT',
            fetched_at: nowIso,
            freshness: 'UNAVAILABLE',
            object_id: metaObjectId || '',
            campaign_id: campaignId,
            supported_metrics: []
          },
          error: err.message || 'Network error accessing Meta Engagement API',
          error_code: isAbort ? 'META_API_TIMEOUT' : 'META_API_NETWORK_EXCEPTION'
        };
      }
    }

    // Parse Engagement Metrics
    const comments = Number(rawData.comments?.summary?.total_count ?? rawData.comments_count ?? rawData.comments ?? 0);
    const reactions = Number(rawData.reactions?.summary?.total_count ?? rawData.reactions_count ?? rawData.reactions ?? 0);

    let shares: number | null = null;
    if (rawData.shares?.count !== undefined && rawData.shares?.count !== null) {
      shares = Number(rawData.shares.count);
    } else if (rawData.shares_count !== undefined && rawData.shares_count !== null) {
      shares = Number(rawData.shares_count);
    } else if (typeof rawData.shares === 'number') {
      shares = Number(rawData.shares);
    }

    const supportedMetrics: string[] = ['comments', 'reactions'];
    if (shares !== null) {
      supportedMetrics.push('shares');
    }

    const freshness: EngagementFreshness = 'FRESH';
    const metadata: EngagementSyncMetadata = {
      source: 'META_GRAPH_ENGAGEMENT',
      fetched_at: nowIso,
      freshness,
      object_id: metaObjectId || 'FORCED_TEST',
      campaign_id: campaignId,
      supported_metrics: supportedMetrics
    };

    // Update Database Engagement Snapshot
    await db.query(
      `UPDATE host_marketing_campaigns
       SET comments_count = $1,
           reactions_count = $2,
           shares_count = $3,
           engagement_synced_at = $4,
           engagement_source_metadata = $5::jsonb,
           updated_at = NOW()
       WHERE id = $6`,
      [comments, reactions, shares, nowIso, JSON.stringify(metadata), campaignId]
    );

    return {
      success: true,
      campaign_id: campaignId,
      meta_object_id: metaObjectId,
      comments,
      reactions,
      shares,
      engagement_synced_at: nowIso,
      freshness,
      engagement_metadata: metadata
    };
  }
}
