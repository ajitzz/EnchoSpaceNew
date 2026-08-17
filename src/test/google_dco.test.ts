/**
 * Phase 3.8: Google Ads DCO Strategy Test Suite
 *
 * Certified Scenarios:
 * 1. Rotates losing RSA headline assets on winner identified
 * 2. Pins winning asset in provider entities
 * 3. Handles inconclusive decisions with zero mutation
 */

import { describe, it, expect } from 'vitest';
import { googleDcoStrategy } from '../lib/providers/google/googleDcoStrategy.js';
import { DcoEvaluationOutput } from '../lib/dcoEngine.js';

describe('PHASE 3.8: GOOGLE ADS DCO STRATEGY TEST SUITE', () => {
  it('1. Rotates losing assets and pins winning asset on WINNER_IDENTIFIED', async () => {
    const decision: DcoEvaluationOutput = {
      result: 'WINNER_IDENTIFIED',
      decision_metric: 'CONVERSIONS',
      winner_variant_id: 101,
      loser_variant_ids: [102, 103],
      winner_metric_value: 15,
      loser_metric_value: 4,
      relative_advantage: 0.35,
      confidence: 0.98,
      z_score: 2.33,
      reason: 'Variant #101 conversions exceed #102 by 35%',
      sample_sizes: {},
      evaluated_at: new Date()
    };

    const res = await googleDcoStrategy.applyWinnerDecision(1, decision);
    expect(res.provider).toBe('GOOGLE');
    expect(res.success).toBe(true);
    expect(res.mutatedEntityIds).toContain('google_asset_variant_101');
    expect(res.mutatedEntityIds).toContain('google_asset_variant_102');
    expect(res.actionsTaken).toContain('PINNED_HIGH_PERFORMING_ASSET_101');
  });

  it('2. Inconclusive decision results in zero mutations', async () => {
    const decision: DcoEvaluationOutput = {
      result: 'INCONCLUSIVE',
      decision_metric: 'NONE',
      winner_variant_id: null,
      loser_variant_ids: [],
      winner_metric_value: null,
      loser_metric_value: null,
      relative_advantage: null,
      confidence: null,
      z_score: null,
      reason: 'No statistical difference',
      sample_sizes: {},
      evaluated_at: new Date()
    };

    const res = await googleDcoStrategy.applyWinnerDecision(1, decision);
    expect(res.mutatedEntityIds.length).toBe(0);
    expect(res.actionsTaken).toContain('NO_MUTATION_REQUIRED_INCONCLUSIVE');
  });
});
