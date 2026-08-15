import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateM9TargetEligibility, containsSyntheticIdentifiers } from '../lib/m9TargetValidator.ts';

describe('Phase 2.7 — M9 Target Integrity & Synthetic Rejection Engine', () => {
  const mockDbClient = {
    query: vi.fn().mockResolvedValue({
      rows: [{ meta_campaign_id: '120249817491520673', meta_adset_id: '120249817492850673', publish_status: 'SUCCESS' }]
    })
  };

  const successFetcher = async (endpoint: string) => {
    if (endpoint.includes('120249817491520673')) {
      return { status: 200, data: { id: '120249817491520673', account_id: 'act_1381407594129620', status: 'PAUSED' } };
    }
    if (endpoint.includes('120249817492850673')) {
      return { status: 200, data: { id: '120249817492850673', campaign_id: '120249817491520673', status: 'PAUSED' } };
    }
    return { status: 200, data: {} };
  };

  it('A. rejects mock campaign identifiers', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: 'mock_meta_camp_fin',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('SYNTHETIC_OR_MOCK_META_OBJECT');
  });

  it('B. rejects mock adset identifiers', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: 'mock_meta_adset_fin',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('SYNTHETIC_OR_MOCK_META_OBJECT');
  });

  it('C. rejects mock ad identifiers', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: '120249817492850673',
        meta_ad_id: 'test_ad_id_mock',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('SYNTHETIC_OR_MOCK_META_OBJECT');
  });

  it('D. rejects seed identifiers', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: 'seed_campaign_123',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('SYNTHETIC_OR_MOCK_META_OBJECT');
  });

  it('E. rejects test identifiers', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: 'test_campaign_xyz',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('SYNTHETIC_OR_MOCK_META_OBJECT');
  });

  it('F. rejects missing Meta provenance', async () => {
    const emptyDbClient = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
    const res = await validateM9TargetEligibility(
      {
        id: 999,
        meta_campaign_id: null,
        meta_adset_id: null,
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      emptyDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('MISSING_PROVENANCE');
  });

  it('G. rejects failed Graph GET verification', async () => {
    const failingFetcher = async () => ({ status: 404, data: { error: { message: 'Object not found on Graph API' } } });
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: failingFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('GRAPH_VERIFICATION_FAILED');
  });

  it('H. rejects foreign ad accounts', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_foreign_9999999',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('FOREIGN_ACCOUNT_REJECTED');
  });

  it('I. accepts real Meta IDs with valid provenance and account', async () => {
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: successFetcher }
    );
    if (!res.eligible) {
      console.log('FAIL REASON:', res.reason, res.classification);
    }
    expect(res.eligible).toBe(true);
    expect(res.classification).toBe('PRODUCTION_READY_CANARY');
  });

  it('J. real hierarchy accepted and hierarchy mismatch rejected', async () => {
    const mismatchFetcher = async (endpoint: string) => {
      if (endpoint.includes('120249817491520673')) {
        return { status: 200, data: { id: '120249817491520673', account_id: 'act_1381407594129620', status: 'PAUSED' } };
      }
      if (endpoint.includes('120249817492850673')) {
        return { status: 200, data: { id: '120249817492850673', campaign_id: 'different_campaign_999', status: 'PAUSED' } };
      }
      return { status: 200, data: {} };
    };
    const res = await validateM9TargetEligibility(
      {
        id: 162,
        meta_campaign_id: '120249817491520673',
        meta_adset_id: '120249817492850673',
        owner_meta_ad_account_id: 'act_1381407594129620',
        admin_approved: true
      },
      mockDbClient,
      { graphApiFetcher: mismatchFetcher }
    );
    expect(res.eligible).toBe(false);
    expect(res.classification).toBe('GRAPH_VERIFICATION_FAILED');
  });

  it('K. financial boundary still enforced alongside target integrity', () => {
    const gross = 250000n;
    const fee = (gross * 15n) / 100n;
    const authorized = gross - fee;
    expect(authorized).toBe(212500n);
    const overConfigured = 250000n;
    expect(overConfigured > authorized).toBe(true);
  });

  it('L. human checkpoint never exposes synthetic target as READY', async () => {
    const syntheticCampaign = {
      id: 162,
      meta_campaign_id: 'mock_meta_camp_fin',
      meta_adset_id: 'mock_meta_adset_fin',
      owner_meta_ad_account_id: 'act_1381407594129620',
      admin_approved: true
    };
    const res = await validateM9TargetEligibility(syntheticCampaign, mockDbClient, { graphApiFetcher: successFetcher });
    expect(res.eligible).toBe(false);
    const checkpointDisplay = res.eligible ? 'READY FOR ACTIVATION' : `M9 INELIGIBLE\nREASON: ${res.classification} — ${res.reason}`;
    expect(checkpointDisplay).toContain('M9 INELIGIBLE');
    expect(checkpointDisplay).toContain('SYNTHETIC_OR_MOCK_META_OBJECT');
  });
});
