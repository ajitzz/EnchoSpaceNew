import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetaDeliveryReducer, DeliveryExplanation, MetaObjectStatus } from '../lib/metaDeliveryReducer';
import { MetaControlPlaneService } from '../lib/metaControlPlaneService';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('Phase 2.8 — Meta Delivery Reducer & State Authority Engine', () => {
  it('P2.8-T1: LIVE state requires Campaign=ACTIVE, AdSet=ACTIVE, at least one Ad=ACTIVE, and Approved review', () => {
    const campaign: MetaObjectStatus = { id: 'camp_101', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const adset: MetaObjectStatus = { id: 'adset_101', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_101', status: 'ACTIVE', effective_status: 'ACTIVE', review_status: 'APPROVED' },
      { id: 'ad_102', status: 'PAUSED', effective_status: 'PAUSED', review_status: 'APPROVED' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads,
      external_verification: { verified_at: new Date().toISOString() }
    });

    expect(result.delivery_state).toBe('LIVE');
    expect(result.is_live).toBe(true);
    expect(result.badge_color).toBe('emerald');
    expect(result.exact_reason).toContain('fully active and serving impressions');
  });

  it('P2.8-T2: CAMPAIGN_OFF when Campaign effective_status is PAUSED even if local status was ACTIVE', () => {
    const campaign: MetaObjectStatus = { id: 'camp_102', status: 'PAUSED', effective_status: 'PAUSED' };
    const adset: MetaObjectStatus = { id: 'adset_102', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_103', status: 'ACTIVE', effective_status: 'ACTIVE', review_status: 'APPROVED' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads
    });

    expect(result.delivery_state).toBe('CAMPAIGN_OFF');
    expect(result.is_live).toBe(false);
    expect(result.owner).toBe('HOST');
    expect(result.display_label).toBe('Campaign Paused');
  });

  it('P2.8-T3: ADSET_OFF when Campaign is ACTIVE but AdSet is PAUSED', () => {
    const campaign: MetaObjectStatus = { id: 'camp_103', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const adset: MetaObjectStatus = { id: 'adset_103', status: 'PAUSED', effective_status: 'PAUSED' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_104', status: 'ACTIVE', effective_status: 'ACTIVE', review_status: 'APPROVED' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads
    });

    expect(result.delivery_state).toBe('ADSET_OFF');
    expect(result.is_live).toBe(false);
    expect(result.owner).toBe('ADMIN');
    expect(result.display_label).toBe('Ad Set Paused');
  });

  it('P2.8-T4: AD_OFF when all individual Ads are PAUSED while Campaign and AdSet are ACTIVE', () => {
    const campaign: MetaObjectStatus = { id: 'camp_104', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const adset: MetaObjectStatus = { id: 'adset_104', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_105', status: 'PAUSED', effective_status: 'PAUSED', review_status: 'APPROVED' },
      { id: 'ad_106', status: 'PAUSED', effective_status: 'PAUSED', review_status: 'APPROVED' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads
    });

    expect(result.delivery_state).toBe('AD_OFF');
    expect(result.is_live).toBe(false);
    expect(result.owner).toBe('HOST');
    expect(result.display_label).toBe('Ads Turned Off');
  });

  it('P2.8-T5: DISAPPROVED when any Ad or Creative is rejected by Meta Policy', () => {
    const campaign: MetaObjectStatus = { id: 'camp_105', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const adset: MetaObjectStatus = { id: 'adset_105', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_107', status: 'DISAPPROVED', effective_status: 'DISAPPROVED', review_status: 'DISAPPROVED' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads
    });

    expect(result.delivery_state).toBe('DISAPPROVED');
    expect(result.is_live).toBe(false);
    expect(result.badge_color).toBe('rose');
    expect(result.exact_reason).toContain('rejected by Meta advertising policy');
  });

  it('P2.8-T6: PENDING_REVIEW when Ad or Campaign is undergoing Meta automated review', () => {
    const campaign: MetaObjectStatus = { id: 'camp_106', status: 'ACTIVE', effective_status: 'PENDING_REVIEW' };
    const adset: MetaObjectStatus = { id: 'adset_106', status: 'ACTIVE', effective_status: 'ACTIVE' };
    const ads: MetaObjectStatus[] = [
      { id: 'ad_108', status: 'ACTIVE', effective_status: 'IN_PROCESS', review_status: 'PENDING_REVIEW' }
    ];

    const result = MetaDeliveryReducer.reduceDeliveryState({
      campaign,
      adset,
      ads
    });

    expect(result.delivery_state).toBe('PENDING_REVIEW');
    expect(result.is_live).toBe(false);
    expect(result.badge_color).toBe('purple');
  });

  it('P2.8-T7: UNKNOWN when external verification is blocked by developer authentication or missing ID', () => {
    const resultBlocked = MetaDeliveryReducer.reduceDeliveryState({
      campaign: { id: 'camp_107' },
      external_verification: { is_blocked: true, error: 'User is not registered as a Facebook Developer.' }
    });

    expect(resultBlocked.delivery_state).toBe('UNKNOWN');
    expect(resultBlocked.is_live).toBe(false);
    expect(resultBlocked.badge_color).toBe('amber');

    const resultMissing = MetaDeliveryReducer.reduceDeliveryState({
      campaign: null,
      external_verification: { is_missing: true }
    });

    expect(resultMissing.delivery_state).toBe('UNKNOWN');
    expect(resultMissing.exact_reason).toContain('Campaign object does not exist on Meta Graph API');
  });
});
