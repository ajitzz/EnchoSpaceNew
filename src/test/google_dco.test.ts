/**
 * Phase 3.8: Google Ads DCO Strategy Test Suite
 *
 * Current containment scenarios: no local winner may claim an applied Google
 * mutation before the authorized provider optimization implementation exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { googleDcoStrategy } from '../lib/providers/google/googleDcoStrategy.js';
import { DcoEvaluationOutput } from '../lib/dcoEngine.js';

describe('PHASE 3.8: GOOGLE ADS DCO STRATEGY TEST SUITE', () => {
  it('1. Reports unavailable optimization without mutating local or provider assets', async () => {
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

    const db = { query: vi.fn() };
    const res = await googleDcoStrategy.applyWinnerDecision(1, decision, db);
    expect(res.provider).toBe('GOOGLE');
    expect(res.success).toBe(false);
    expect(res.mutatedEntityIds).toEqual([]);
    expect(res.actionsTaken).toEqual(['GOOGLE_DCO_NOT_IMPLEMENTED']);
    expect(db.query).not.toHaveBeenCalled();
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
