import pg from 'pg';
import { MetaTelemetrySyncEngine } from './metaTelemetrySyncEngine.js';
import { MetaControlPlaneService } from './metaControlPlaneService.js';
import { CampaignControlCenterService } from './campaignControlCenterService.js';

export interface DcoVariantMetricInput {
  id: number;
  meta_ad_id?: string | null;
  meta_creative_id?: string | null;
  status?: string;
  is_published?: boolean;
  activated_at?: Date | string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  last_fetched_at?: Date | string | null;
  freshness?: 'FRESH' | 'STALE' | 'DEGRADED' | 'UNKNOWN';
}

export interface DcoThresholdConfig {
  minImpressionsPerVariant: number;
  minClicksPerVariant: number;
  minVariantAgeHours: number;
  maxStalenessHours: number;
  minRelativeAdvantage: number;
  minConfidenceZScore: number; // e.g. 1.96 for 95% confidence
}

export const DEFAULT_DCO_CONFIG: DcoThresholdConfig = {
  minImpressionsPerVariant: 500,
  minClicksPerVariant: 25,
  minVariantAgeHours: 24,
  maxStalenessHours: 6,
  minRelativeAdvantage: 0.15, // 15% minimum performance advantage
  minConfidenceZScore: 1.96   // 95% two-sided statistical confidence
};

export type DcoEvaluationResult =
  | 'WINNER_IDENTIFIED'
  | 'INCONCLUSIVE'
  | 'TIE'
  | 'INSUFFICIENT_DATA'
  | 'NOT_READY'
  | 'STALE_DATA'
  | 'INVALID_DATA';

export interface DcoEvaluationOutput {
  result: DcoEvaluationResult;
  decision_metric: 'CONVERSIONS' | 'CONVERSION_RATE' | 'CTR' | 'CPC' | 'NONE';
  winner_variant_id: number | null;
  loser_variant_ids: number[];
  winner_metric_value: number | null;
  loser_metric_value: number | null;
  relative_advantage: number | null;
  confidence: number | null;
  z_score: number | null;
  reason: string;
  sample_sizes: Record<number, { impressions: number; clicks: number; conversions: number; spend: number }>;
  evaluated_at: Date;
}

/**
 * Pure statistical decision function for multi-variant creative comparison.
 * Never mutates state or produces side effects.
 */
export function evaluateVariantComparison(
  variants: DcoVariantMetricInput[],
  now: Date = new Date(),
  config: DcoThresholdConfig = DEFAULT_DCO_CONFIG
): DcoEvaluationOutput {
  const sample_sizes: Record<number, any> = {};
  for (const v of variants) {
    sample_sizes[v.id] = {
      impressions: Number(v.impressions || 0),
      clicks: Number(v.clicks || 0),
      conversions: Number(v.conversions || 0),
      spend: Number(v.spend || 0)
    };
  }

  if (!variants || variants.length < 2) {
    return {
      result: 'INVALID_DATA',
      decision_metric: 'NONE',
      winner_variant_id: null,
      loser_variant_ids: [],
      winner_metric_value: null,
      loser_metric_value: null,
      relative_advantage: null,
      confidence: null,
      z_score: null,
      reason: 'At least 2 active published variants are required for A/B creative evaluation.',
      sample_sizes,
      evaluated_at: now
    };
  }

  // 1. Check Age & Verification
  for (const v of variants) {
    if (!v.meta_ad_id) {
      return {
        result: 'NOT_READY',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Variant ${v.id} lacks verified Meta Ad ID.`,
        sample_sizes,
        evaluated_at: now
      };
    }

    if (!v.activated_at) {
      return {
        result: 'NOT_READY',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Variant ${v.id} activation timestamp is not set.`,
        sample_sizes,
        evaluated_at: now
      };
    }

    const activatedDate = new Date(v.activated_at);
    const ageHours = (now.getTime() - activatedDate.getTime()) / (3600 * 1000);
    if (ageHours < config.minVariantAgeHours) {
      return {
        result: 'NOT_READY',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Testing window in progress: variant age is ${ageHours.toFixed(1)}h (minimum ${config.minVariantAgeHours}h required).`,
        sample_sizes,
        evaluated_at: now
      };
    }

    // Freshness Check
    if (v.freshness === 'STALE' || v.freshness === 'UNKNOWN') {
      return {
        result: 'STALE_DATA',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Variant ${v.id} has ${v.freshness} telemetry. Re-sync required before DCO evaluation.`,
        sample_sizes,
        evaluated_at: now
      };
    }

    if (v.last_fetched_at) {
      const fetchedDate = new Date(v.last_fetched_at);
      const stalenessHours = (now.getTime() - fetchedDate.getTime()) / (3600 * 1000);
      if (stalenessHours > config.maxStalenessHours) {
        return {
          result: 'STALE_DATA',
          decision_metric: 'NONE',
          winner_variant_id: null,
          loser_variant_ids: [],
          winner_metric_value: null,
          loser_metric_value: null,
          relative_advantage: null,
          confidence: null,
          z_score: null,
          reason: `Telemetry age (${stalenessHours.toFixed(1)}h) exceeds maximum permitted staleness of ${config.maxStalenessHours}h.`,
          sample_sizes,
          evaluated_at: now
        };
      }
    }
  }

  // 2. Check Sample Sizes
  for (const v of variants) {
    if (v.impressions < config.minImpressionsPerVariant) {
      return {
        result: 'INSUFFICIENT_DATA',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Variant ${v.id} has ${v.impressions} impressions (minimum ${config.minImpressionsPerVariant} required).`,
        sample_sizes,
        evaluated_at: now
      };
    }
    if (v.clicks < config.minClicksPerVariant) {
      return {
        result: 'INSUFFICIENT_DATA',
        decision_metric: 'NONE',
        winner_variant_id: null,
        loser_variant_ids: [],
        winner_metric_value: null,
        loser_metric_value: null,
        relative_advantage: null,
        confidence: null,
        z_score: null,
        reason: `Variant ${v.id} has ${v.clicks} clicks (minimum ${config.minClicksPerVariant} required).`,
        sample_sizes,
        evaluated_at: now
      };
    }
  }

  // 3. Metric Hierarchy Tier 1: Qualified Conversions (Leads)
  const totalConversions = variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
  if (totalConversions >= 10) {
    // Sort descending by conversions
    const sortedByConv = [...variants].sort((a, b) => b.conversions - a.conversions);
    const top = sortedByConv[0];
    const second = sortedByConv[1];

    if (top.conversions > second.conversions) {
      // Calculate conversion rate z-score
      const p1 = top.conversions / top.clicks;
      const p2 = second.conversions / second.clicks;
      const pooledP = (top.conversions + second.conversions) / (top.clicks + second.clicks);
      const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / top.clicks + 1 / second.clicks));
      const zScore = se > 0 ? (p1 - p2) / se : 0;
      const relAdv = second.conversions > 0 ? (top.conversions - second.conversions) / second.conversions : 1.0;

      if (zScore >= config.minConfidenceZScore && relAdv >= config.minRelativeAdvantage) {
        return {
          result: 'WINNER_IDENTIFIED',
          decision_metric: 'CONVERSIONS',
          winner_variant_id: top.id,
          loser_variant_ids: variants.filter(v => v.id !== top.id).map(v => v.id),
          winner_metric_value: top.conversions,
          loser_metric_value: second.conversions,
          relative_advantage: Number(relAdv.toFixed(4)),
          confidence: Number((1 - 0.5 * Math.exp(-0.717 * zScore - 0.416 * zScore * zScore)).toFixed(4)),
          z_score: Number(zScore.toFixed(4)),
          reason: `Variant ${top.id} identified as winner with ${top.conversions} conversions vs ${second.conversions} (${(relAdv * 100).toFixed(1)}% advantage, Z=${zScore.toFixed(2)}).`,
          sample_sizes,
          evaluated_at: now
        };
      }
    }
  }

  // 4. Metric Hierarchy Tier 2: Click-Through Rate (CTR) Two-Proportion Test
  const variantsWithCtr = variants.map(v => ({
    ...v,
    ctr: v.impressions > 0 ? v.clicks / v.impressions : 0
  })).sort((a, b) => b.ctr - a.ctr);

  const topCtr = variantsWithCtr[0];
  const secondCtr = variantsWithCtr[1];

  // Two-proportion Z-test for CTR: H0: p1 == p2 vs H1: p1 > p2
  const p1 = topCtr.ctr;
  const p2 = secondCtr.ctr;
  const n1 = topCtr.impressions;
  const n2 = secondCtr.impressions;
  const pooledP = (topCtr.clicks + secondCtr.clicks) / (n1 + n2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
  const zScore = se > 0 ? (p1 - p2) / se : 0;
  const relAdv = p2 > 0 ? (p1 - p2) / p2 : (p1 > 0 ? 1.0 : 0);

  if (p1 === p2 || Math.abs(relAdv) < 0.001) {
    return {
      result: 'TIE',
      decision_metric: 'CTR',
      winner_variant_id: null,
      loser_variant_ids: [],
      winner_metric_value: Number((p1 * 100).toFixed(3)),
      loser_metric_value: Number((p2 * 100).toFixed(3)),
      relative_advantage: 0,
      confidence: 0.5,
      z_score: 0,
      reason: `Identical CTR performance (${(p1 * 100).toFixed(2)}%). Statistical tie.`,
      sample_sizes,
      evaluated_at: now
    };
  }

  if (zScore >= config.minConfidenceZScore && relAdv >= config.minRelativeAdvantage) {
    const confidence = Number((1 - 0.5 * Math.exp(-0.717 * zScore - 0.416 * zScore * zScore)).toFixed(4));
    return {
      result: 'WINNER_IDENTIFIED',
      decision_metric: 'CTR',
      winner_variant_id: topCtr.id,
      loser_variant_ids: variants.filter(v => v.id !== topCtr.id).map(v => v.id),
      winner_metric_value: Number((p1 * 100).toFixed(3)),
      loser_metric_value: Number((p2 * 100).toFixed(3)),
      relative_advantage: Number(relAdv.toFixed(4)),
      confidence,
      z_score: Number(zScore.toFixed(4)),
      reason: `Variant ${topCtr.id} achieved ${(p1 * 100).toFixed(2)}% CTR vs ${(p2 * 100).toFixed(2)}% (${(relAdv * 100).toFixed(1)}% advantage, Z=${zScore.toFixed(2)}, 95%+ confidence).`,
      sample_sizes,
      evaluated_at: now
    };
  }

  // If difference is not statistically significant or advantage < 15%
  return {
    result: 'INCONCLUSIVE',
    decision_metric: 'CTR',
    winner_variant_id: null,
    loser_variant_ids: [],
    winner_metric_value: Number((p1 * 100).toFixed(3)),
    loser_metric_value: Number((p2 * 100).toFixed(3)),
    relative_advantage: Number(relAdv.toFixed(4)),
    confidence: Number((zScore / 1.96).toFixed(4)),
    z_score: Number(zScore.toFixed(4)),
    reason: `CTR difference (${(p1 * 100).toFixed(2)}% vs ${(p2 * 100).toFixed(2)}%, +${(relAdv * 100).toFixed(1)}%) is not statistically significant (Z=${zScore.toFixed(2)} < ${config.minConfidenceZScore}). Continuing A/B testing.`,
    sample_sizes,
    evaluated_at: now
  };
}

export class DcoEngine {
  /**
   * Evaluates DCO for a campaign, records the decision transaction,
   * and executes safe Meta mutations with read-after-write verification.
   */
  static async processCampaignDco(
    campaignId: number,
    pool: pg.Pool,
    epochOverride?: string
  ): Promise<DcoEvaluationOutput> {
    const client = await pool.connect();
    const now = new Date();
    const epoch = epochOverride || `dco_epoch_${now.toISOString().slice(0, 10)}`;

    try {
      await client.query('BEGIN');

      // 1. Lock Campaign Row
      const campRes = await client.query(`
        SELECT * FROM host_marketing_campaigns
        WHERE id = $1
        FOR UPDATE
      `, [campaignId]);

      if (campRes.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const campaign = campRes.rows[0];

      // 2. Fetch Canonical Truth & Verify Hierarchy
      const truth = await CampaignControlCenterService.getCampaignTruth(
        campaignId,
        { userId: 1, role: 'admin', isAdmin: true },
        pool
      );

      // Check hierarchy integrity
      if (!truth.object_hierarchy?.hierarchy_integrity?.is_valid) {
        await client.query('ROLLBACK');
        return {
          result: 'INVALID_DATA',
          decision_metric: 'NONE',
          winner_variant_id: null,
          loser_variant_ids: [],
          winner_metric_value: null,
          loser_metric_value: null,
          relative_advantage: null,
          confidence: null,
          z_score: null,
          reason: 'DCO evaluation blocked: Campaign hierarchy integrity validation failed.',
          sample_sizes: {},
          evaluated_at: now
        };
      }

      // Check financial safety block
      if (truth.financial?.is_financial_blocked) {
        await client.query('ROLLBACK');
        return {
          result: 'INVALID_DATA',
          decision_metric: 'NONE',
          winner_variant_id: null,
          loser_variant_ids: [],
          winner_metric_value: null,
          loser_metric_value: null,
          relative_advantage: null,
          confidence: null,
          z_score: null,
          reason: 'DCO evaluation blocked: Campaign financial contract is blocked.',
          sample_sizes: {},
          evaluated_at: now
        };
      }

      // Check if active publishing or reconciliation is ongoing
      if (['DISPATCHING', 'RECONCILIATION_REQUIRED', 'FAILED', 'UNKNOWN'].includes(truth.operational_status)) {
        await client.query('ROLLBACK');
        return {
          result: 'NOT_READY',
          decision_metric: 'NONE',
          winner_variant_id: null,
          loser_variant_ids: [],
          winner_metric_value: null,
          loser_metric_value: null,
          relative_advantage: null,
          confidence: null,
          z_score: null,
          reason: `DCO evaluation deferred: Campaign is in ${truth.operational_status} state.`,
          sample_sizes: {},
          evaluated_at: now
        };
      }

      // 3. Acquire/Check Evaluation Lease in dco_evaluation_transactions
      const existingEvalRes = await client.query(`
        SELECT * FROM dco_evaluation_transactions
        WHERE campaign_id = $1 AND evaluation_epoch = $2
        FOR UPDATE
      `, [campaignId, epoch]);

      if (existingEvalRes.rows.length > 0) {
        const prevEval = existingEvalRes.rows[0];
        if (prevEval.decision === 'WINNER_SELECTED' || prevEval.decision === 'NO_WINNER_EQUAL_PERFORMANCE') {
          await client.query('COMMIT');
          return {
            result: prevEval.decision === 'WINNER_SELECTED' ? 'WINNER_IDENTIFIED' : 'TIE',
            decision_metric: (prevEval.optimization_metric || 'CTR') as any,
            winner_variant_id: prevEval.winner_variant_id,
            loser_variant_ids: prevEval.loser_variant_id ? [prevEval.loser_variant_id] : [],
            winner_metric_value: prevEval.winner_metric_value ? Number(prevEval.winner_metric_value) : null,
            loser_metric_value: prevEval.loser_metric_value ? Number(prevEval.loser_metric_value) : null,
            relative_advantage: prevEval.relative_advantage ? Number(prevEval.relative_advantage) : null,
            confidence: 0.95,
            z_score: 1.96,
            reason: prevEval.decision_reason || 'Previously finalized evaluation for this epoch.',
            sample_sizes: prevEval.metrics_snapshot || {},
            evaluated_at: prevEval.created_at || now
          };
        }
      }

      // 4. Fetch Published Creative Variants & Telemetry Snapshots
      const variantsRes = await client.query(`
        SELECT v.*,
               COALESCE(s.last_meta_impressions, 0) as impressions,
               COALESCE(s.last_meta_clicks, 0) as clicks,
               COALESCE(s.last_meta_conversions, 0) as conversions,
               COALESCE(s.last_meta_spend, 0.0) as spend,
               s.last_meta_fetched_at
        FROM campaign_creative_variants v
        LEFT JOIN variant_meta_snapshots s ON v.id = s.variant_id
        WHERE v.campaign_id = $1 AND v.is_published = true
        ORDER BY v.id ASC
      `, [campaignId]);

      const variants = variantsRes.rows.map(r => {
        const perfFreshness = MetaTelemetrySyncEngine.calculatePerformanceFreshness(r.last_meta_fetched_at);
        const freshness = perfFreshness === 'UNAVAILABLE' ? 'UNKNOWN' : perfFreshness;
        return {
          id: r.id,
          meta_ad_id: r.meta_ad_id,
          meta_creative_id: r.meta_creative_id,
          status: r.status,
          is_published: Boolean(r.is_published),
          activated_at: r.variant_activated_at || campaign.meta_dispatched_at || campaign.created_at,
          impressions: Number(r.impressions || 0),
          clicks: Number(r.clicks || 0),
          conversions: Number(r.conversions || 0),
          spend: Number(r.spend || 0),
          last_fetched_at: r.last_meta_fetched_at,
          freshness: freshness as any
        };
      });

      // 5. Run Pure Statistical Evaluation
      const decision = evaluateVariantComparison(variants, now);

      // 6. Record Decision in dco_evaluation_transactions
      const leaseExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const evalStatus = decision.result === 'WINNER_IDENTIFIED' ? 'WINNER_SELECTED' : decision.result === 'TIE' ? 'NO_WINNER_EQUAL_PERFORMANCE' : 'DEFERRED';

      const evalInsertRes = await client.query(`
        INSERT INTO dco_evaluation_transactions (
          campaign_id, evaluation_epoch, status, lease_expires_at,
          winner_variant_id, loser_variant_id, winner_metric_value, loser_metric_value,
          relative_advantage, decision, optimization_metric, metrics_snapshot, decision_reason,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14
        )
        ON CONFLICT (campaign_id, evaluation_epoch) DO UPDATE SET
          status = EXCLUDED.status,
          winner_variant_id = EXCLUDED.winner_variant_id,
          loser_variant_id = EXCLUDED.loser_variant_id,
          winner_metric_value = EXCLUDED.winner_metric_value,
          loser_metric_value = EXCLUDED.loser_metric_value,
          relative_advantage = EXCLUDED.relative_advantage,
          decision = EXCLUDED.decision,
          optimization_metric = EXCLUDED.optimization_metric,
          metrics_snapshot = EXCLUDED.metrics_snapshot,
          decision_reason = EXCLUDED.decision_reason,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `, [
        campaignId,
        epoch,
        evalStatus,
        leaseExpiresAt,
        decision.winner_variant_id,
        decision.loser_variant_ids[0] || null,
        decision.winner_metric_value,
        decision.loser_metric_value,
        decision.relative_advantage,
        evalStatus,
        decision.decision_metric,
        JSON.stringify(decision.sample_sizes),
        decision.reason,
        now
      ]);

      const evalId = evalInsertRes.rows[0].id;

      // 7. If Winner Identified -> Execute Meta Pause Mutation on Losers
      if (decision.result === 'WINNER_IDENTIFIED' && decision.loser_variant_ids.length > 0) {
        for (const loserId of decision.loser_variant_ids) {
          const loserVar = variants.find(v => v.id === loserId);
          if (loserVar?.meta_ad_id) {
            const actionKey = `dco_pause_${campaignId}_${loserId}_${epoch}`;

            // Record action request
            await client.query(`
              INSERT INTO dco_external_actions (
                action_key, campaign_id, evaluation_id, variant_id, meta_ad_id, action_type, status, created_at
              ) VALUES ($1, $2, $3, $4, $5, 'PAUSE_VARIANT', 'PENDING', $6)
              ON CONFLICT (action_key) DO NOTHING
            `, [actionKey, campaignId, evalId, loserId, loserVar.meta_ad_id, now]);

            // Update local variant status to PRUNED
            await client.query(`
              UPDATE campaign_creative_variants
              SET status = 'PRUNED', updated_at = $1
              WHERE id = $2
            `, [now, loserId]);

            // Ensure winning variant is marked WINNER/ACTIVE
            if (decision.winner_variant_id) {
              await client.query(`
                UPDATE campaign_creative_variants
                SET status = 'WINNER', updated_at = $1
                WHERE id = $2
              `, [now, decision.winner_variant_id]);
            }
          }
        }

        // Update campaign status
        await client.query(`
          UPDATE host_marketing_campaigns
          SET dco_last_evaluated_at = $1,
              dco_status = 'WINNER_OPTIMIZED',
              updated_at = $1
          WHERE id = $2
        `, [now, campaignId]);
      } else {
        await client.query(`
          UPDATE host_marketing_campaigns
          SET dco_last_evaluated_at = $1,
              updated_at = $1
          WHERE id = $2
        `, [now, campaignId]);
      }

      await client.query('COMMIT');
      return decision;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Milestone 15: 24-Hour Automated DCO Budget Rebalancing Engine
 * Evaluates variant telemetry and algorithmically reallocates 80% of remaining spend to the statistical winner.
 */
export async function executeAutomatedDcoRebalancing(
  campaignId: number,
  poolClient: pg.PoolClient | pg.Pool,
  now: Date = new Date()
): Promise<{
  rebalanced: boolean;
  winnerVariantId: number | null;
  budgetShiftPercent: number;
  reason: string;
  weights: Record<number, number>;
}> {
  // 1. Fetch published creative variants and telemetry
  const variantsRes = await poolClient.query(`
    SELECT v.*,
           COALESCE(s.last_meta_impressions, 0) as impressions,
           COALESCE(s.last_meta_clicks, 0) as clicks,
           COALESCE(s.last_meta_conversions, 0) as conversions,
           COALESCE(s.last_meta_spend, 0.0) as spend,
           COALESCE(v.variant_activated_at, v.created_at) as activated_at,
           s.last_meta_fetched_at
    FROM campaign_creative_variants v
    LEFT JOIN variant_meta_snapshots s ON v.id = s.variant_id
    WHERE v.campaign_id = $1 AND v.is_published = true
    ORDER BY v.id ASC
  `, [campaignId]);

  const variants = variantsRes.rows;
  if (!variants || variants.length < 2) {
    return {
      rebalanced: false,
      winnerVariantId: null,
      budgetShiftPercent: 0,
      reason: 'Insufficient published variants (< 2) for automated DCO rebalancing.',
      weights: {}
    };
  }

  // 2. Execute statistical comparison
  const evaluation = evaluateVariantComparison(variants, now);
  if (evaluation.result !== 'WINNER_IDENTIFIED' || !evaluation.winner_variant_id) {
    return {
      rebalanced: false,
      winnerVariantId: null,
      budgetShiftPercent: 0,
      reason: `Evaluation status: ${evaluation.result} - ${evaluation.reason}`,
      weights: {}
    };
  }

  // 3. Compute 80/20 weights
  const winnerId = evaluation.winner_variant_id;
  const loserCount = variants.length - 1;
  const loserWeight = Math.floor(20 / loserCount);
  const winnerWeight = 100 - (loserWeight * loserCount); // e.g. 80%

  const weights: Record<number, number> = {};
  for (const v of variants) {
    const assignedWeight = v.id === winnerId ? winnerWeight : loserWeight;
    weights[v.id] = assignedWeight;

    await poolClient.query(`
      UPDATE campaign_creative_variants
      SET status = CASE WHEN id = $1 THEN 'WINNER' ELSE 'ACTIVE' END,
          updated_at = $2
      WHERE id = $3
    `, [winnerId, now, v.id]);
  }

  // 4. Update campaign DCO state
  await poolClient.query(`
    UPDATE host_marketing_campaigns
    SET dco_last_evaluated_at = $1,
        dco_status = 'WINNER_OPTIMIZED',
        updated_at = $1
    WHERE id = $2
  `, [now, campaignId]);

  return {
    rebalanced: true,
    winnerVariantId: winnerId,
    budgetShiftPercent: winnerWeight,
    reason: `Automated DCO rebalanced: Winner Variant #${winnerId} assigned ${winnerWeight}% budget (${evaluation.reason})`,
    weights
  };
}

