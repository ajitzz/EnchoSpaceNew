import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { GooglePublishingStore, GOOGLE_PAUSED_PUBLISH_PROTOCOL } from '../../lib/providers/google/GooglePublishingStore.js';
import type { ProviderPublishRequest, ProviderPublishResult } from '../../lib/providers/types.js';
import { createLocalPostgresFixture } from './postgres.js';

const customerId = '1234567890';
const fingerprint = createHash('sha256').update('fixture request').digest('hex');
const request = (overrides: Partial<ProviderPublishRequest> = {}): ProviderPublishRequest => ({
  campaignId: 1, hostId: 10, listingId: 20, title: 'Test property campaign', objective: 'SEARCH',
  budget: { currency: 'INR', minor_units: 10000 }, targetAudience: { locations: ['geoTargetConstants/2356'] },
  creativeAssets: { headline: 'Fixture property', mediaUrl: 'https://example.test/photo.jpg', landingPageUrl: 'https://example.test/stay/fixture' },
  idempotencyKey: 'request-1', correlationId: 'correlation-1', ...overrides,
});
const result = (): ProviderPublishResult => {
  const campaign = `customers/${customerId}/campaigns/101`;
  const group = `customers/${customerId}/adGroups/201`;
  const ad = `customers/${customerId}/adGroupAds/201~301`;
  return {
    success: true, provider: 'GOOGLE', externalCampaignId: campaign, externalContainerId: group, externalAdId: ad,
    hierarchy: { campaignId: 1, provider: 'GOOGLE', externalCampaignId: campaign, externalContainerId: group,
      externalAdId: ad, entities: [
        { campaign_id: 1, provider: 'GOOGLE', entity_type: 'CAMPAIGN', external_id: campaign, account_id: customerId, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
        { campaign_id: 1, provider: 'GOOGLE', entity_type: 'AD_GROUP', external_id: group, parent_entity_id: campaign, account_id: customerId, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
        { campaign_id: 1, provider: 'GOOGLE', entity_type: 'AD', external_id: ad, parent_entity_id: group, account_id: customerId, configured_status: 'PAUSED', effective_status: 'PAUSED' },
      ] },
  };
};

describe('HARVO Google paused publishing store — real isolated PostgreSQL', () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let store: GooglePublishingStore;
  beforeAll(async () => {
    ({ pool, close } = await createLocalPostgresFixture());
    store = new GooglePublishingStore(pool);
  });
  afterAll(async () => { await close?.(); });
  beforeEach(async () => {
    await pool.query('TRUNCATE provider_entities, provider_publishing_transactions, campaign_financial_contracts, host_marketing_campaigns, listings RESTART IDENTITY CASCADE');
    await pool.query("INSERT INTO listings VALUES (20,10,'Fixture Property','fixture','published'), (21,11,'Fixture Two','fixture-two','published')");
    await pool.query('INSERT INTO host_marketing_campaigns VALUES (1,10,20), (2,11,21)');
    await pool.query(`INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_remaining_authorization, currency)
      VALUES (1,10500,500,10000,10000,'INR'), (2,10500,500,10000,10000,'INR')`);
  });
  const claim = async () => {
    const claimed = await store.claim(request(), customerId, fingerprint, { operations: ['fixture'] });
    if (claimed.kind !== 'CLAIMED') throw new Error('Expected new claim');
    return claimed.transactionId;
  };

  it('persists uncertain REQUESTED intent before transport and never marks funding paid', async () => {
    await claim();
    const rows = (await pool.query('SELECT * FROM provider_publishing_transactions')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ publish_status: 'REQUESTED', is_unknown_outcome: true,
      external_campaign_id: null, payload: { protocol: GOOGLE_PAUSED_PUBLISH_PROTOCOL, customerId, fingerprint } });
    expect((await pool.query('SELECT * FROM provider_entities')).rows).toHaveLength(0);
    expect((await pool.query('SELECT meta_remaining_authorization FROM campaign_financial_contracts WHERE campaign_id=1')).rows[0].meta_remaining_authorization).toBe('10000');
  });

  it('serializes twenty simultaneous claims for the same campaign across different keys', async () => {
    const calls = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      store.claim(request({ idempotencyKey: `key-${i}` }), customerId, fingerprint, {})));
    expect(calls.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(calls.filter(r => r.status === 'rejected')).toHaveLength(19);
    expect((await pool.query('SELECT count(*) FROM provider_publishing_transactions')).rows[0].count).toBe('1');
  });

  it('serializes same-key concurrent claims and blocks an abandoned claim after reconnect', async () => {
    const calls = await Promise.allSettled(Array.from({ length: 10 }, () => store.claim(request(), customerId, fingerprint, {})));
    expect(calls.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const freshStore = new GooglePublishingStore(pool);
    await expect(freshStore.claim(request(), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    await pool.query("UPDATE provider_publishing_transactions SET lease_expires_at=NOW()-INTERVAL '1 day'");
    await expect(freshStore.claim(request({ idempotencyKey: 'new-key' }), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('rejects another host or another listing without recording a request', async () => {
    for (const overrides of [{ hostId: 11 }, { listingId: 21 }, { campaignId: 99 }]) {
      await expect(store.claim(request(overrides), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_OWNERSHIP_MISMATCH' });
    }
    expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
  });

  it.each(['foreign-slug', 'draft', 'changed-owner', 'missing'])(
    'rejects %s property destinations before claiming publication', async variation => {
      const req = request();
      if (variation === 'foreign-slug') req.creativeAssets.landingPageUrl = 'https://example.test/stay/fixture-two';
      if (variation === 'draft') await pool.query("UPDATE listings SET publication_status='draft' WHERE id=20");
      if (variation === 'changed-owner') await pool.query('UPDATE listings SET user_id=11 WHERE id=20');
      if (variation === 'missing') await pool.query('DELETE FROM listings WHERE id=20');
      await expect(store.claim(req, customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_OWNERSHIP_MISMATCH' });
      expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
    });

  it('uses the canonical existing slug generator only when the published listing lacks a slug', async () => {
    await pool.query('UPDATE listings SET slug=NULL WHERE id=20');
    const req = request();
    req.creativeAssets.landingPageUrl = 'https://example.test/stay/fixture-property-20';
    expect((await store.claim(req, customerId, fingerprint, {})).kind).toBe('CLAIMED');
  });

  it.each(['http://example.test/stay/fixture', 'https://user:password@example.test/stay/fixture',
    'https://example.test/stay/fixture?listing=21', 'https://example.test/stay/fixture#other', 'not a URL'])(
    'rejects unsafe destination %s', async landingPageUrl => {
      const req = request();
      req.creativeAssets.landingPageUrl = landingPageUrl;
      await expect(store.claim(req, customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_INVALID_ARGUMENT' });
      expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
    });

  it.each(['missing', 'currency', 'zero', 'remaining', 'authorized'])(
    'fails closed for %s financial authorization', async variation => {
      if (variation === 'missing') await pool.query('DELETE FROM campaign_financial_contracts WHERE campaign_id=1');
      if (variation === 'currency') await pool.query("UPDATE campaign_financial_contracts SET currency='USD' WHERE campaign_id=1");
      if (variation === 'zero') await pool.query('UPDATE campaign_financial_contracts SET meta_remaining_authorization=0 WHERE campaign_id=1');
      if (variation === 'remaining') await pool.query('UPDATE campaign_financial_contracts SET meta_remaining_authorization=9999 WHERE campaign_id=1');
      if (variation === 'authorized') await pool.query('UPDATE campaign_financial_contracts SET meta_authorized_spend=9999, gross_host_charge=10499 WHERE campaign_id=1');
      await expect(store.claim(request(), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION' });
      expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
    });

  it.each([0, -1, 1.2, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid minor-unit budget %s', async amount => {
    await expect(store.claim(request({ budget: { currency: 'INR', minor_units: amount } }), customerId, fingerprint, {}))
      .rejects.toMatchObject({ code: 'GOOGLE_INVALID_ARGUMENT' });
  });

  it('rejects a reused global key across campaigns including a concurrent race', async () => {
    const second = request({ campaignId: 2, hostId: 11, listingId: 21 });
    second.creativeAssets.landingPageUrl = 'https://example.test/stay/fixture-two';
    const calls = await Promise.allSettled([
      store.claim(request(), customerId, fingerprint, {}), store.claim(second, customerId, fingerprint, {}),
    ]);
    expect(calls.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(calls.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(1);
  });

  it('atomically persists only provider-returned paused IDs then safely replays the same request', async () => {
    await store.complete(await claim(), result());
    const entities = (await pool.query('SELECT * FROM provider_entities ORDER BY id')).rows;
    expect(entities).toHaveLength(3);
    expect(entities.every(e => e.configured_status === 'PAUSED')).toBe(true);
    expect(entities.map(e => e.external_id)).toEqual(result().hierarchy.entities.map(e => e.external_id));
    const repeated = await store.claim(request(), customerId, fingerprint, {});
    expect(repeated.kind).toBe('DUPLICATE');
    if (repeated.kind === 'DUPLICATE') expect(repeated.result.isDuplicate).toBe(true);
    expect((await pool.query('SELECT publish_status, is_unknown_outcome FROM provider_publishing_transactions')).rows[0])
      .toEqual({ publish_status: 'COMMITTED', is_unknown_outcome: false });
  });

  it('blocks altered fingerprints, customers and fresh keys after successful creation', async () => {
    await store.complete(await claim(), result());
    for (const [req, customer, hash] of [
      [request(), customerId, 'a'.repeat(64)], [request(), '2234567890', fingerprint],
      [request({ idempotencyKey: 'another-key' }), customerId, fingerprint],
    ] as const) {
      await expect(store.claim(req, customer, hash, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    }
  });

  it.each(['active', 'synthetic', 'foreign', 'missing', 'parent', 'duplicate'])(
    'rejects %s hierarchy evidence before commit', async variant => {
      const id = await claim();
      const res = result();
      if (variant === 'active') res.hierarchy.entities[0].configured_status = 'ENABLED';
      if (variant === 'synthetic') res.hierarchy.entities[0].external_id = `customers/${customerId}/campaigns/local_1`;
      if (variant === 'foreign') res.hierarchy.entities[0].account_id = '2234567890';
      if (variant === 'missing') res.hierarchy.entities.pop();
      if (variant === 'parent') res.hierarchy.entities[2].parent_entity_id = 'wrong-parent';
      if (variant === 'duplicate') res.hierarchy.entities.push(res.hierarchy.entities[0]);
      await expect(store.complete(id, res)).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
      expect((await pool.query('SELECT * FROM provider_entities')).rows).toHaveLength(0);
      expect((await pool.query('SELECT publish_status FROM provider_publishing_transactions')).rows[0].publish_status).toBe('REQUESTED');
    });

  it('rolls back preceding entity inserts on an external-ID ownership collision', async () => {
    const id = await claim();
    await pool.query(`INSERT INTO provider_entities (campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status)
      VALUES (2,'GOOGLE','AD_GROUP',$1,$2,'PAUSED','UNKNOWN')`, [result().externalContainerId, customerId]);
    await expect(store.complete(id, result())).rejects.toMatchObject({ code: '23505' });
    const entities = (await pool.query('SELECT campaign_id FROM provider_entities')).rows;
    expect(entities).toEqual([{ campaign_id: 2 }]);
    expect((await pool.query('SELECT publish_status FROM provider_publishing_transactions')).rows[0].publish_status).toBe('REQUESTED');
  });

  it('quarantines an ambiguous outcome and retains response evidence without allowing retry', async () => {
    const id = await claim();
    await store.quarantine(id, { code: 'GOOGLE_UNKNOWN_OUTCOME', message: 'Response was lost.' }, { campaignId: '101', access_token: 'fixture-secret' });
    const row = (await pool.query('SELECT * FROM provider_publishing_transactions')).rows[0];
    expect(row).toMatchObject({ publish_status: 'RECONCILIATION_REQUIRED', is_unknown_outcome: true, response: { campaignId: '101' } });
    expect(JSON.stringify(row)).not.toContain('fixture-secret');
    await expect(store.claim(request(), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    await expect(store.complete(id, result())).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    await expect(store.reject(id, { code: 'LATE_ERROR', message: 'Cannot clear unknown evidence.' }))
      .rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('records definitive failure without silently permitting a new creation attempt', async () => {
    const id = await claim();
    await store.reject(id, { code: 'GOOGLE_INVALID_ARGUMENT', message: 'Provider rejected payload.' });
    expect((await pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows[0])
      .toEqual({ publish_status: 'FAILED', is_unknown_outcome: false });
    await expect(store.claim(request({ idempotencyKey: 'new-key' }), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('never overwrites a committed transaction with a late failure or duplicate completion', async () => {
    const id = await claim();
    await store.complete(id, result());
    await expect(store.quarantine(id, { code: 'LATE_FAILURE', message: 'Late worker.' })).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    await expect(store.complete(id, result())).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    expect((await pool.query('SELECT count(*) FROM provider_entities')).rows[0].count).toBe('3');
  });

  it('refuses legacy synthetic COMMITTED records that lack the paused protocol', async () => {
    await pool.query(`INSERT INTO provider_publishing_transactions
      (campaign_id,provider,operation_type,idempotency_key,publish_status,payload,response)
      VALUES (1,'GOOGLE','CREATE_HIERARCHY','request-1','COMMITTED','{}',$1)`, [JSON.stringify(result())]);
    await expect(store.claim(request(), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('blocks new creation when legacy Google entities exist without a publishing transaction', async () => {
    await pool.query(`INSERT INTO provider_entities
      (campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status)
      VALUES (1,'GOOGLE','CAMPAIGN',$1,$2,'PAUSED','UNKNOWN')`, [result().externalCampaignId, customerId]);
    await expect(store.claim(request(), customerId, fingerprint, {})).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
    expect((await pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
    expect((await pool.query('SELECT external_id FROM provider_entities')).rows).toEqual([{ external_id: result().externalCampaignId }]);
  });
});
