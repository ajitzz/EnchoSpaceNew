import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GoogleAdsClient } from '../../lib/providers/google/GoogleAdsClient.js';
import { MarketingTargetingService } from '../../lib/marketing/targeting.js';
import { consumeMarketingRequestBudget } from '../../lib/marketing/requestLimits.js';
import { inTransaction } from '../../lib/marketing/database.js';
import { createWorkflowPgFixture, workflowDraft } from './workflowPgFixture.js';
import { draftSchema } from '../../lib/marketing/domain.js';

const geo = { resourceName: 'geoTargetConstants/1007740', name: 'Bengaluru', canonicalName: 'Bengaluru,Karnataka,India', countryCode: 'IN', targetType: 'City', status: 'ENABLED' };
const language = { resourceName: 'languageConstants/1000', name: 'English', code: 'en', targetable: true };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function setup(response?: unknown) {
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('oauth2.googleapis.com')) return json({ access_token: 'fixture-only-token', expires_in: 3600 });
    if (String(url).endsWith('geoTargetConstants:suggest')) return json(response ?? { geoTargetConstantSuggestions: [{ geoTargetConstant: geo }] });
    return json([{ results: [{ languageConstant: language }] }]);
  });
  const client = new GoogleAdsClient({ clientId: 'fixture-client', clientSecret: 'fixture-secret', refreshToken: 'fixture-refresh', mccCustomerId: '1234567890', customerId: '9876543210', developerToken: '' }, { fetch: transport });
  return { transport, client, service: new MarketingTargetingService(client, ['IN']) };
}
describe('Provider-origin targeting metadata', () => {
  it('uses the authenticated global v25 suggest endpoint and only returned enabled geo identities', async () => {
    const { client, transport } = setup();
    expect(await client.suggestGeoTargets({ names: ['Bengaluru'], countryCode: 'IN' })).toEqual([{ ...geo, status: undefined }].map(({ status, ...v }) => v));
    const [url, options] = transport.mock.calls[1];
    expect(url).toBe('https://googleads.googleapis.com/v25/geoTargetConstants:suggest');
    expect(JSON.parse(options!.body as string)).toEqual({ locale: 'en', countryCode: 'IN', locationNames: { names: ['Bengaluru'] } });
    expect(options!.headers).toMatchObject({ Authorization: 'Bearer fixture-only-token', 'login-customer-id': '1234567890' });
    expect(options!.redirect).toBe('error');
  });
  it('never uses a local location identifier or silently accepts removed targets', async () => {
    const { service } = setup({ geoTargetConstantSuggestions: [{ geoTargetConstant: { ...geo, status: 'REMOVAL_PLANNED' } }] });
    expect(await service.locations('Bengaluru')).toEqual([]);
    await expect(service.resolve([geo.resourceName], [])).rejects.toMatchObject({ code: 'TARGETING_CHANGED' });
  });
  it.each([
    { geoTargetConstantSuggestions: 'invalid' },
    { geoTargetConstantSuggestions: [{ geoTargetConstant: { ...geo, resourceName: 'local-123' } }] },
    { geoTargetConstantSuggestions: [{ geoTargetConstant: { ...geo, canonicalName: undefined } }] },
    { geoTargetConstantSuggestions: [{ geoTargetConstant: geo }, { geoTargetConstant: { ...geo, name: 'Conflicting city' } }] },
  ])('rejects unverified or contradictory provider metadata %#', async response => {
    await expect(setup(response).service.locations('Bengaluru')).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
  });
  it('rejects response outside the requested country or resource list', async () => {
    const { client } = setup();
    await expect(client.suggestGeoTargets({ names: ['Bengaluru'], countryCode: 'US' })).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
    await expect(client.suggestGeoTargets({ resourceNames: ['geoTargetConstants/2000'] })).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
  });
  it('validates query shape before network calls and allows apostrophes as JSON data', async () => {
    const { client, transport } = setup();
    for (const input of [{ names: [] }, { names: ['a'] }, { names: ['x\nname'] }, { names: ['valid'], resourceNames: [geo.resourceName] }, { resourceNames: ['geoTargetConstants/1;DROP'] }]) await expect(client.suggestGeoTargets(input)).rejects.toMatchObject({ code: 'GOOGLE_INVALID_ARGUMENT' });
    expect(transport).not.toHaveBeenCalled();
    await client.suggestGeoTargets({ names: ["St. John's"] });
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).locationNames.names).toEqual(["St. John's"]);
  });
  it('coalesces duplicate reads and gives callers independent cached values', async () => {
    const { service, transport } = setup();
    const [one, two] = await Promise.all([service.locations('Bengaluru'), service.locations('Bengaluru')]);
    one[0].canonicalName = 'Caller tampering';
    expect(two[0].canonicalName).toBe(geo.canonicalName);
    expect((await service.locations('Bengaluru'))[0].canonicalName).toBe(geo.canonicalName);
    expect(transport.mock.calls.filter(([url]) => String(url).endsWith(':suggest'))).toHaveLength(1);
  });
  it('accepts only targetable provider languages and resolves each selected identity', async () => {
    const { service, transport } = setup();
    expect(await service.resolve([geo.resourceName], [language.resourceName])).toMatchObject({ locations: [{ canonicalName: geo.canonicalName }], languages: [{ name: 'English' }] });
    const request = transport.mock.calls.find(([url]) => String(url).endsWith('googleAds:searchStream'));
    expect(JSON.parse(request![1]!.body as string).query).toContain('language_constant.targetable = TRUE');
    await expect(service.resolve([geo.resourceName], ['languageConstants/9999'])).rejects.toMatchObject({ code: 'TARGETING_CHANGED' });
    await expect(service.resolve([geo.resourceName, geo.resourceName], [])).rejects.toMatchObject({ code: 'TARGETING_INPUT_INVALID' });
  });
  it('rejects forged human labels while preserving explicitly selected provider identities', async () => {
    const { service } = setup();
    const search = { headlines: ['Stay at Garden Villa', 'Explore Our Villa', 'Choose Your Stay'], descriptions: ['Explore the garden villa and choose your stay dates.', 'See the actual villa and review available dates.'], keywords: [{ text: 'garden villa stay', matchType: 'EXACT' }], geoTargetConstants: [geo.resourceName], languageConstants: [language.resourceName] };
    const draft = draftSchema.parse(workflowDraft({ provider: 'GOOGLE', locations: [geo.canonicalName], googleSearch: search }));
    await service.validateDraft(draft);
    await expect(service.validateDraft({ ...draft, locations: ['London,England,United Kingdom'] })).rejects.toMatchObject({ code: 'TARGETING_LABEL_MISMATCH' });
    await expect(service.validateDraft(draftSchema.parse(workflowDraft({ locations: ['US'] })))).rejects.toMatchObject({ code: 'META_COUNTRY_NOT_ENABLED' });
  });
});

describe('Shared PostgreSQL lookup/guidance budgets', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>;
  beforeAll(async () => { fixture = await createWorkflowPgFixture(); await fixture.pool.query(readFileSync(new URL('../../migrations/014_harvo_marketing_request_limits.sql', import.meta.url), 'utf8')); });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());
  it('admits exactly five concurrent guidance requests per host and keeps other hosts independent', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => consumeMarketingRequestBudget(fixture.pool, { id: 10, role: 'host' }, 'CAMPAIGN_GUIDANCE')));
    expect(outcomes.filter(v => v.status === 'fulfilled')).toHaveLength(5);
    expect(outcomes.filter(v => v.status === 'rejected').every(v => v.status === 'rejected' && v.reason.code === 'MARKETING_REQUEST_LIMIT')).toBe(true);
    await consumeMarketingRequestBudget(fixture.pool, { id: 11, role: 'host' }, 'CAMPAIGN_GUIDANCE');
    expect((await fixture.pool.query("SELECT host_id,attempts FROM marketing_request_limits ORDER BY host_id")).rows).toEqual([{ host_id: 10, attempts: 5 }, { host_id: 11, attempts: 1 }]);
  });
  it('enforces ownership under a real non-superuser role', async () => {
    await consumeMarketingRequestBudget(fixture.pool, { id: 10, role: 'host' }, 'TARGETING');
    await fixture.pool.query('CREATE ROLE harvo_target_reader; GRANT SELECT ON marketing_request_limits TO harvo_target_reader');
    const rows = await inTransaction(fixture.pool, { id: 11, role: 'host' }, async client => { await client.query('SET LOCAL ROLE harvo_target_reader'); return (await client.query('SELECT * FROM marketing_request_limits')).rows; });
    expect(rows).toEqual([]);
  });
});
