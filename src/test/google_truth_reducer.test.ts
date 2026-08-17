/**
 * Phase 3.8: Google Ads Delivery Truth Reducer Test Suite
 *
 * Certified Scenarios:
 * 1. ENABLED + ELIGIBLE -> LIVE
 * 2. PAUSED -> PAUSED
 * 3. PENDING (Under Review) -> REVIEWING
 * 4. NOT_ELIGIBLE + POLICY_DISAPPROVED -> DISAPPROVED
 * 5. MISCONFIGURED / BUDGET_TOO_LOW -> NOT_DELIVERING
 * 6. Partial Asset Disapproval -> LIVE (with diagnostics)
 * 7. Network Timeout / 5xx -> UNKNOWN
 */

import { describe, it, expect } from 'vitest';
import { GoogleDeliveryReducer } from '../lib/providers/google/googleDeliveryReducer.js';

describe('PHASE 3.8: GOOGLE ADS DELIVERY TRUTH REDUCER TEST SUITE', () => {
  it('1. Reduces ENABLED + ELIGIBLE to LIVE', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'ENABLED',
      primary_status: 'ELIGIBLE'
    });
    expect(res.normalizedState).toBe('LIVE');
    expect(res.isLive).toBe(true);
    expect(res.isServingImpressions).toBe(true);
  });

  it('2. Reduces PAUSED to PAUSED', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'PAUSED',
      primary_status: 'PAUSED',
      primary_status_reasons: ['CAMPAIGN_PAUSED']
    });
    expect(res.normalizedState).toBe('PAUSED');
    expect(res.isLive).toBe(false);
  });

  it('3. Reduces PENDING to REVIEWING', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'ENABLED',
      primary_status: 'PENDING',
      primary_status_reasons: ['POLICY_SUMMARY_REVIEW']
    });
    expect(res.normalizedState).toBe('REVIEWING');
    expect(res.isLive).toBe(false);
  });

  it('4. Reduces NOT_ELIGIBLE + POLICY_DISAPPROVED to DISAPPROVED', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'ENABLED',
      primary_status: 'NOT_ELIGIBLE',
      primary_status_reasons: ['POLICY_DISAPPROVED'],
      asset_policy_summaries: [
        { asset_id: '1', approval_status: 'DISAPPROVED', policy_topic_entries: [{ topic: 'TRADEMARK', type: 'PROHIBITED' }] }
      ]
    });
    expect(res.normalizedState).toBe('DISAPPROVED');
    expect(res.disapprovalReasons?.length).toBeGreaterThan(0);
  });

  it('5. Reduces MISCONFIGURED to NOT_DELIVERING', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'ENABLED',
      primary_status: 'MISCONFIGURED',
      primary_status_reasons: ['BUDGET_TOO_LOW']
    });
    expect(res.normalizedState).toBe('NOT_DELIVERING');
  });

  it('6. Partial Asset Disapproval with 2+ approved headlines remains LIVE', () => {
    const res = GoogleDeliveryReducer.reduce({
      status: 'ENABLED',
      primary_status: 'ELIGIBLE',
      asset_policy_summaries: [
        { asset_id: '1', approval_status: 'APPROVED' },
        { asset_id: '2', approval_status: 'APPROVED' },
        { asset_id: '3', approval_status: 'DISAPPROVED', policy_topic_entries: [{ topic: 'CAPITALIZATION', type: 'EDITORIAL' }] }
      ]
    });
    expect(res.normalizedState).toBe('LIVE');
    expect(res.reasonCode).toBe('LIVE_WITH_PARTIAL_ASSET_DISAPPROVAL');
    expect(res.disapprovalReasons?.length).toBe(1);
  });

  it('7. Network Timeout or HTTP 5xx returns UNKNOWN and requires reconciliation', () => {
    const res = GoogleDeliveryReducer.reduce({
      is_network_timeout: true,
      http_status: 503
    });
    expect(res.normalizedState).toBe('UNKNOWN');
    expect(res.reconciliationRequired).toBe(true);
  });
});
