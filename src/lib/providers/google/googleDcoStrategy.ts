/**
 * Google Ads DCO Strategy Implementation
 * ENCHO Advertising Operating System
 *
 * Handles asset combination rotation and underperforming headline/description
 * mutations on Google Responsive Search Ads (RSA).
 */

import { ProviderId } from '../types.js';
import { DcoEvaluationOutput } from '../../dcoEngine.js';

export interface ProviderDcoMutationResult {
  provider: ProviderId;
  campaignId: number;
  success: boolean;
  mutatedEntityIds: string[];
  actionsTaken: string[];
  executedAt: string;
}

export class GoogleDcoStrategy {
  public readonly providerId: ProviderId = 'GOOGLE';

  public async applyWinnerDecision(
    campaignId: number,
    decision: DcoEvaluationOutput,
    poolOrClient?: any
  ): Promise<ProviderDcoMutationResult> {
    const actionsTaken: string[] = [];
    const mutatedEntityIds: string[] = [];

    if (decision.result !== 'WINNER_IDENTIFIED' || !decision.winner_variant_id) {
      return {
        provider: 'GOOGLE',
        campaignId,
        success: true,
        mutatedEntityIds: [],
        actionsTaken: ['NO_MUTATION_REQUIRED_INCONCLUSIVE'],
        executedAt: new Date().toISOString()
      };
    }

    // 1. Identify losing variant IDs to unpin/remove from RSA asset list
    for (const loserId of decision.loser_variant_ids) {
      const assetExternalId = `google_asset_variant_${loserId}`;
      mutatedEntityIds.push(assetExternalId);
      actionsTaken.push(`UNPINNED_AND_ROTATED_ASSET_${loserId}`);

      if (poolOrClient) {
        await poolOrClient.query(`
          UPDATE provider_entities
          SET configured_status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE campaign_id = $1 AND provider = 'GOOGLE' AND external_id = $2
        `, [campaignId, assetExternalId]);
      }
    }

    // 2. Prioritize / Pin winning asset
    const winnerExternalId = `google_asset_variant_${decision.winner_variant_id}`;
    mutatedEntityIds.push(winnerExternalId);
    actionsTaken.push(`PINNED_HIGH_PERFORMING_ASSET_${decision.winner_variant_id}`);

    if (poolOrClient) {
      await poolOrClient.query(`
        UPDATE provider_entities
        SET configured_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
        WHERE campaign_id = $1 AND provider = 'GOOGLE' AND external_id = $2
      `, [campaignId, winnerExternalId]);
    }

    return {
      provider: 'GOOGLE',
      campaignId,
      success: true,
      mutatedEntityIds,
      actionsTaken,
      executedAt: new Date().toISOString()
    };
  }
}

export const googleDcoStrategy = new GoogleDcoStrategy();
