import { describe, expect, it } from 'vitest';
import type { ProviderPublishRequest } from '../../lib/providers/types.js';
import { buildGoogleSearchPlan } from '../../lib/providers/google/GoogleSearchPlan.js';

const customerId = '1234567890';
const origin = 'https://encho.space';

function request(): ProviderPublishRequest {
  return {
    campaignId: 41, hostId: 71, listingId: 91, title: 'Verified villa campaign', objective: 'BOOKINGS',
    budget: { currency: 'INR', minor_units: 100_000 },
    targetAudience: { locations: ['Bengaluru'] },
    creativeAssets: {
      headline: 'Visit the listed villa', description: 'View the actual rooms and select available stay dates.',
      mediaUrl: 'https://media.encho.space/approved-room.jpg', mediaType: 'IMAGE',
      landingPageUrl: 'https://encho.space/stay/verified-villa',
    },
    idempotencyKey: 'campaign-41-approved-revision-1', correlationId: 'correlation-1',
    metadata: {
      approvalRevision: 1, mediaRevision: 2,
      googleSearch: {
        version: 1, headlines: ['Visit the listed villa', 'Explore the rooms', 'Check available dates'],
        descriptions: ['View the actual rooms and select available stay dates.', 'Review property details before booking.'],
        keywords: [{ text: 'villas in wayanad', matchType: 'EXACT' }, { text: 'wayanad stay', matchType: 'PHRASE' }],
        geoTargetConstants: ['geoTargetConstants/1007768'], languageConstants: ['languageConstants/1000'],
        geoMode: 'PRESENCE', dailyBudgetMinor: 10_000, bidding: 'MAXIMIZE_CONVERSIONS',
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      },
    },
  };
}

function build(input = request()) { return buildGoogleSearchPlan(input, customerId, origin); }
function config(input: ProviderPublishRequest): Record<string, any> { return input.metadata!.googleSearch; }

describe('HARVO M1 Google Search payload contract', () => {
  it('builds an explicit campaign total budget without transmitting a daily limit', () => {
    const req=request();req.startTime='2026-10-01';req.endTime='2026-10-03';config(req).budgetMode='CAMPAIGN_TOTAL';delete config(req).dailyBudgetMinor;
    const plan=build(req);const budget=(plan.operations[0] as any).campaignBudgetOperation.create;
    expect(budget).toMatchObject({period:'CUSTOM_PERIOD',totalAmountMicros:'1000000000',explicitlyShared:false});
    expect(budget).not.toHaveProperty('amountMicros');expect(plan).toMatchObject({budgetMode:'CAMPAIGN_TOTAL',budgetMinor:100000});
  });
  it.each([['2026-10-01','2026-10-01'],['2026-10-01','2026-10-02'],['2026-10-01','2026-12-30']])('rejects total campaign flight %s to %s outside 3–90 days', (start,end) => {
    const req=request();req.startTime=start;req.endTime=end;config(req).budgetMode='CAMPAIGN_TOTAL';expect(()=>build(req)).toThrow('3–90');
  });
  it('requires total-budget dates and rejects unknown budget modes', () => {
    const req=request();config(req).budgetMode='CAMPAIGN_TOTAL';expect(()=>build(req)).toThrow('explicit start and end');
    config(req).budgetMode='FOREVER';expect(()=>build(req)).toThrow('DAILY or CAMPAIGN_TOTAL');
  });
  it('binds budget type into the approval fingerprint and permits the 90-day bound', () => {
    const req=request();req.startTime='2026-10-01';req.endTime='2026-12-29';const daily=build(req);config(req).budgetMode='CAMPAIGN_TOTAL';const total=build(req);
    expect(total.fingerprint).not.toBe(daily.fingerprint);expect(total.budgetMode).toBe('CAMPAIGN_TOTAL');
  });
  it('builds the linked v25 hierarchy with all spending entities paused and explicit narrow networks', () => {
    const plan = build();
    const operations = plan.operations as Array<Record<string, any>>;
    expect(operations).toHaveLength(8);
    expect(operations[0]).toEqual({ campaignBudgetOperation: { create: {
      resourceName: `customers/${customerId}/campaignBudgets/-1`, name: 'Encho 41 — Verified villa campaign budget',
      deliveryMethod: 'STANDARD', amountMicros: '100000000', explicitlyShared: false,
    } } });
    expect(operations[1].campaignOperation.create).toMatchObject({
      resourceName: `customers/${customerId}/campaigns/-2`, advertisingChannelType: 'SEARCH', status: 'PAUSED',
      campaignBudget: `customers/${customerId}/campaignBudgets/-1`, maximizeConversions: {},
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    });
    expect(operations[2].adGroupOperation.create).toMatchObject({
      resourceName: `customers/${customerId}/adGroups/-3`, campaign: `customers/${customerId}/campaigns/-2`,
      type: 'SEARCH_STANDARD', status: 'PAUSED',
    });
    expect(operations[3].adGroupAdOperation.create).toEqual({
      adGroup: `customers/${customerId}/adGroups/-3`, status: 'PAUSED', ad: {
        finalUrls: ['https://encho.space/stay/verified-villa'], responsiveSearchAd: {
          headlines: config(request()).headlines.map((text: string) => ({ text })),
          descriptions: config(request()).descriptions.map((text: string) => ({ text })),
        },
      },
    });
    expect(operations[4].campaignCriterionOperation.create).toEqual({ campaign: `customers/${customerId}/campaigns/-2`, location: { geoTargetConstant: 'geoTargetConstants/1007768' } });
    expect(operations[5].campaignCriterionOperation.create).toEqual({ campaign: `customers/${customerId}/campaigns/-2`, language: { languageConstant: 'languageConstants/1000' } });
    expect(operations.slice(6).map(op => op.adGroupCriterionOperation.create)).toEqual([
      { adGroup: `customers/${customerId}/adGroups/-3`, status: 'PAUSED', keyword: { text: 'villas in wayanad', matchType: 'EXACT' } },
      { adGroup: `customers/${customerId}/adGroups/-3`, status: 'PAUSED', keyword: { text: 'wayanad stay', matchType: 'PHRASE' } },
    ]);
    expect(plan.expectedResourceTypes).toEqual(['campaignBudgets', 'campaigns', 'adGroups', 'adGroupAds', 'campaignCriteria', 'campaignCriteria', 'adGroupCriteria', 'adGroupCriteria']);
    expect(plan.dailyBudgetMinor).toBe(10_000);
    expect(JSON.stringify(operations)).not.toContain('approved-room.jpg');
    expect(JSON.stringify(operations)).not.toContain('ENABLED');
    expect(JSON.stringify(operations)).not.toContain('APPROVED');
    expect(operations[1].campaignOperation.create).not.toHaveProperty('targetCpaMicros');
    expect(operations[1].campaignOperation.create).not.toHaveProperty('startDateTime');
  });

  it.each(['INR', 'USD'])('uses exact two-decimal conversion for %s daily budget without reusing total authorization', currency => {
    const input = request(); input.budget.currency = currency; config(input).dailyBudgetMinor = 12345;
    const plan = build(input);
    expect((plan.operations[0] as any).campaignBudgetOperation.create.amountMicros).toBe('123450000');
    expect(input.budget.minor_units).toBe(100000);
  });

  it('uses explicit presence-or-interest and paired customer-local full-day schedule', () => {
    const input = request(); config(input).geoMode = 'PRESENCE_OR_INTEREST'; input.startTime = '2028-02-29'; input.endTime = '2028-03-02';
    const campaign = (build(input).operations[1] as any).campaignOperation.create;
    expect(campaign.geoTargetTypeSetting.positiveGeoTargetType).toBe('PRESENCE_OR_INTEREST');
    expect(campaign.startDateTime).toBe('2028-02-29 00:00:00');
    expect(campaign.endDateTime).toBe('2028-03-02 23:59:59');
    expect(campaign).not.toHaveProperty('startDate');
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 100001, 1_000_000_000_000_000])('rejects invalid or excessive daily budget %s', daily => {
    const input = request(); config(input).dailyBudgetMinor = daily;
    if (daily === 1_000_000_000_000_000) input.budget.minor_units = daily;
    expect(() => build(input)).toThrow(/dailyBudgetMinor/);
  });

  it.each([0, -1, 0.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid overall authorization %s', value => {
    const input = request(); input.budget.minor_units = value;
    expect(() => build(input)).toThrow(/budget.minor_units/);
  });

  it.each(['EUR', 'JPY', 'inr', '', undefined])('rejects unsupported currency %s', currency => {
    const input = request(); input.budget.currency = currency as any;
    expect(() => build(input)).toThrow(/budget.currency/);
  });

  it.each(['campaignId', 'hostId', 'listingId'] as const)('requires a real positive integer %s', field => {
    const input = request(); input[field] = -1;
    expect(() => build(input)).toThrow(field);
  });

  it.each(['idempotencyKey', 'correlationId'] as const)('requires bounded nonempty %s', field => {
    const input = request(); input[field] = ' '.repeat(256);
    expect(() => build(input)).toThrow(field);
  });

  it.each(['', '123', '123-456-7890', 'customers/1234567890', '1234567890/../campaigns'])('rejects invalid serving account %s', id => {
    expect(() => buildGoogleSearchPlan(request(), id, origin)).toThrow(/customerId/);
  });

  it.each([
    'https://another.space/stay/verified-villa', 'http://encho.space/stay/verified-villa',
    'https://encho.space/listings/91', 'https://encho.space/stay/verified-villa#booking',
    'https://user:password@encho.space/stay/verified-villa', 'https://encho.space/stay/verified-villa?next=https://other.space',
    'https://encho.space/a/../stay/verified-villa', 'https://encho.space/stay/%76erified-villa',
    'https://encho.space/stay/verified-villa/', 'https://encho.space:8443/stay/verified-villa',
    'https://encho.space/stay/verified-villa/other', 'https://encho.space.evil.com/stay/verified-villa',
  ])('rejects noncanonical or untrusted property destination %s', url => {
    const input = request(); input.creativeAssets.landingPageUrl = url;
    expect(() => build(input)).toThrow(/creativeAssets.landingPageUrl/);
  });

  it.each(['https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://service.internal', 'https://private.local', 'http://encho.space', 'https://encho.space/path', 'https://encho.space?key=1'])('rejects unsafe trusted-origin configuration %s', allowed => {
    expect(() => buildGoogleSearchPlan(request(), customerId, allowed)).toThrow(/allowedLandingOrigin/);
  });

  it.each([
    ['version', 2], ['headlines', ['too few']], ['headlines', ['a'.repeat(31), 'Second headline', 'Third headline']],
    ['headlines', ['Visit the listed villa', 'Repeated', 'Repeated']], ['descriptions', ['one']],
    ['descriptions', ['a'.repeat(91), 'second']], ['keywords', []], ['keywords', [{ text: 'villa', matchType: 'BROAD' }]],
    ['keywords', [{ text: 'villa', matchType: 'EXACT', ignoredSetting: true }]],
    ['geoTargetConstants', []], ['geoTargetConstants', ['Bengaluru']], ['languageConstants', ['en']],
    ['geoMode', undefined], ['bidding', undefined], ['bidding', 'MAXIMIZE_CLICKS'],
    ['containsEuPoliticalAdvertising', undefined], ['containsEuPoliticalAdvertising', 'CONTAINS_EU_POLITICAL_ADVERTISING'],
  ])('requires explicit valid Search setting %s', (field, value) => {
    const input = request(); config(input)[field as string] = value;
    expect(() => build(input)).toThrow();
  });

  it('rejects silently ignored settings and inconsistent approved text', () => {
    const unsupported = request(); config(unsupported).enablePmax = true;
    expect(() => build(unsupported)).toThrow(/unsupported settings/);
    const headline = request(); headline.creativeAssets.headline = 'Different approved headline';
    expect(() => build(headline)).toThrow(/approved creative headline/);
    const description = request(); description.creativeAssets.description = 'Different approved description';
    expect(() => build(description)).toThrow(/approved creative description/);
    const primaryText = request(); primaryText.creativeAssets.primaryText = 'Different approved primary text';
    expect(() => build(primaryText)).toThrow(/approved primary text/);
    const objective = request(); objective.objective = 'OUTCOME_LEADS';
    expect(() => build(objective)).toThrow(/BOOKINGS/);
    const title = request(); title.title = 'a'.repeat(91);
    expect(() => build(title)).toThrow(/title/);
  });

  it('rejects unsupported audience restrictions rather than silently broadening them', () => {
    const interests = request(); interests.targetAudience.interests = ['luxury travel'];
    expect(() => build(interests)).toThrow(/targetAudience.interests/);
    const ages = request(); ages.targetAudience.ageMin = 25;
    expect(() => build(ages)).toThrow(/age restrictions/);
    const genders = request(); genders.targetAudience.genders = [1];
    expect(() => build(genders)).toThrow(/targetAudience.genders/);
    const empty = request(); empty.targetAudience.locations = [];
    expect(() => build(empty)).toThrow(/targetAudience.locations/);
  });

  it.each([
    ['2027-02-29', '2027-03-01'], ['2026-04-31', '2026-05-01'], ['2026-10-03', '2026-10-02'],
    ['2026-10-01T00:00:00Z', '2026-10-03'], ['2026-10-01', undefined], [undefined, '2026-10-03'],
  ])('rejects incomplete, invalid or timestamp schedules (%s, %s)', (start, end) => {
    const input = request(); input.startTime = start; input.endTime = end;
    expect(() => build(input)).toThrow();
  });

  it('fingerprints semantic owner, property, account, budget, media, revision and actual operations', () => {
    const baseline = build().fingerprint;
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    const changes: Array<(input: ProviderPublishRequest) => void> = [
      input => { input.hostId++; }, input => { input.listingId++; }, input => { input.budget.minor_units++; },
      input => { input.creativeAssets.mediaUrl = 'https://media.encho.space/new-room.jpg'; },
      input => { input.metadata!.mediaRevision = 3; }, input => { config(input).dailyBudgetMinor++; },
      input => { config(input).geoMode = 'PRESENCE_OR_INTEREST'; },
    ];
    for (const change of changes) { const input = request(); change(input); expect(build(input).fingerprint).not.toBe(baseline); }
    expect(buildGoogleSearchPlan(request(), '2345678901', origin).fingerprint).not.toBe(baseline);
  });

  it('keeps fingerprint stable across transport keys and object-key insertion order', () => {
    const input = request(); input.idempotencyKey = 'retry-key'; input.correlationId = 'retry-trace';
    input.metadata = Object.fromEntries(Object.entries(input.metadata!).reverse());
    input.metadata!.googleSearch = Object.fromEntries(Object.entries(config(input)).reverse());
    expect(build(input).fingerprint).toBe(build().fingerprint);
  });

  it('rejects cyclic/non-JSON metadata and never mutates the approved request', () => {
    const input = request(); const before = JSON.stringify(input); build(input);
    expect(JSON.stringify(input)).toBe(before);
    input.metadata!.cycle = input;
    expect(() => build(input)).toThrow(/circular/);
    const invalidNumber = request(); invalidNumber.metadata!.score = NaN;
    expect(() => build(invalidNumber)).toThrow(/finite JSON/);
  });
});
