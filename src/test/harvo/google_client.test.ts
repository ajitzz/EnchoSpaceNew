import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAdsClient, GOOGLE_ADS_API_VERSION, normalizeGoogleCustomerId, type GoogleAdsCredentials, type GoogleMutateOperation } from '../../lib/providers/google/GoogleAdsClient.js';

const customer = '9876543210';
const manager = '1234567890';
const credentials: GoogleAdsCredentials = {
  clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh',
  mccCustomerId: '123-456-7890', customerId: '987-654-3210', developerToken: ''
};
const campaignName = `customers/${customer}/campaigns/456`;
const campaign: GoogleMutateOperation = { campaignOperation: { create: { name: 'Paused test', status: 'PAUSED' } } };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...headers }
});
const mutationSuccess = () => json({ mutateOperationResponses: [{ campaignResult: { resourceName: campaignName } }] }, 200, { 'request-id': 'safe-id_123' });

function setup(response: () => Response | Promise<Response> = mutationSuccess, overrides: Partial<GoogleAdsCredentials> = {}, timeoutMs = 15000, conversionUploadsEnabled = false) {
  const transport = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') return json({ access_token: 'test-access', expires_in: 3600 });
    return response();
  });
  return { client: new GoogleAdsClient({ ...credentials, ...overrides }, { fetch: transport as typeof fetch, timeoutMs, conversionUploadsEnabled }), transport };
}
afterEach(() => vi.restoreAllMocks());

describe('Google v25 bounded transport', () => {
  it('has no implicit successful sandbox even in NODE_ENV=test', async () => {
    const { client, transport } = setup(mutationSuccess, { refreshToken: '' });
    await expect(client.validateMasterCredentials()).rejects.toMatchObject({ code: 'GOOGLE_CONFIGURATION_REQUIRED' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('normalizes configured IDs and never substitutes manager for serving customer', () => {
    expect(normalizeGoogleCustomerId('123-456-7890')).toBe(manager);
    expect(setup().client.getCustomerId()).toBe(customer);
    expect(() => setup(mutationSuccess, { customerId: '' }).client.getCustomerId()).toThrow();
    expect(() => setup(mutationSuccess, { customerId: manager }).client.getCustomerId()).toThrow();
    for (const value of ['1234', '1234567890/evil', '1-234567890', null, 1234567890]) {
      expect(() => normalizeGoogleCustomerId(value)).toThrow();
    }
  });

  it('uses v25 authenticated real request paths without requiring developer token', async () => {
    const { client, transport } = setup(() => json([{ results: [{ campaign: { id: '456', status: 'PAUSED' } }] }]));
    const query = 'SELECT campaign.id, campaign.status FROM campaign';
    expect(await client.searchStream('987-654-3210', query)).toEqual([{ campaign: { id: '456', status: 'PAUSED' } }]);
    expect(GOOGLE_ADS_API_VERSION).toBe('v25');
    expect(transport.mock.calls[1][0]).toBe(`https://googleads.googleapis.com/v25/customers/${customer}/googleAds:searchStream`);
    const request = transport.mock.calls[1][1]!;
    expect(request.headers).toEqual({ Authorization: 'Bearer test-access', 'login-customer-id': manager, 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body as string)).toEqual({ query });
    expect(request.redirect).toBe('error');
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends optional legacy developer token only when provided', async () => {
    const { client, transport } = setup(() => json([]), { developerToken: 'test-legacy-token' });
    await client.searchStream(customer, 'SELECT campaign.id FROM campaign');
    expect((transport.mock.calls[1][1]!.headers as Record<string, string>)['developer-token']).toBe('test-legacy-token');
  });

  it('coalesces concurrent OAuth refresh without repeating queries', async () => {
    const { client, transport } = setup(() => json([]));
    await Promise.all([client.searchStream(customer, 'SELECT campaign.id FROM campaign'), client.searchStream(customer, 'SELECT campaign.id FROM campaign')]);
    expect(transport.mock.calls.filter(([url]) => String(url).includes('oauth2'))).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('validates observed manager identity without asserting write permissions', async () => {
    const { client, transport } = setup(() => json([{ results: [{ customer: {
      resourceName: `customers/${manager}`, id: manager, manager: true, currencyCode: 'INR', descriptiveName: 'Test manager'
    } }] }]));
    const observed = await client.validateMasterCredentials();
    expect(observed).toMatchObject({ isValid: true, mccCustomerId: manager, permissions: ['REPORTING'], customer: { id: manager, manager: true } });
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).query).toContain('customer.manager');
  });

  it.each([
    { rows: [] }, { rows: [{ customer: { resourceName: `customers/${manager}`, id: manager, manager: false } }] },
    { rows: [{ customer: { resourceName: `customers/${customer}`, id: customer, manager: true } }] }
  ])('rejects absent or inconsistent manager identity %#', async ({ rows }) => {
    const { client } = setup(() => json([{ results: rows }]));
    await expect(client.validateMasterCredentials()).rejects.toMatchObject({ code: 'GOOGLE_OWNERSHIP_MISMATCH' });
  });

  it.each([{}, [{ results: {} }], [{ error: { message: 'untrusted' } }], [{ results: [null] }]])('rejects malformed read results %#', async data => {
    const { client } = setup(() => json(data));
    await expect(client.searchStream(customer, 'SELECT campaign.id FROM campaign')).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
  });

  it('accepts empty read results and combines actual result batches', async () => {
    const { client } = setup(() => json([{ fieldMask: 'campaign.id' }, { results: [{ campaign: { id: '1' } }] }, { results: [{ campaign: { id: '2' } }] }]));
    expect(await client.searchStream(customer, 'SELECT campaign.id FROM campaign')).toHaveLength(2);
  });

  it('submits atomic mutations and accepts only matching provider response names', async () => {
    const { client, transport } = setup();
    expect(await client.mutateOperations(customer, [campaign])).toEqual({ results: [{ resourceName: campaignName }], requestId: 'safe-id_123' });
    expect(transport.mock.calls[1][0]).toBe(`https://googleads.googleapis.com/v25/customers/${customer}/googleAds:mutate`);
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string)).toEqual({ mutateOperations: [campaign], partialFailure: false, validateOnly: false, responseContentType: 'RESOURCE_NAME_ONLY' });
  });

  it('preserves request-local temporary names while accepting only positive returned names', async () => {
    const { client, transport } = setup();
    const operation: GoogleMutateOperation = { campaignOperation: { create: { resourceName: `customers/${customer}/campaigns/-1`, name: 'Paused', status: 'PAUSED' } } };
    expect((await client.mutateOperations(customer, [operation])).results[0].resourceName).toBe(campaignName);
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).mutateOperations[0].campaignOperation.create.resourceName).toContain('/-1');
  });

  it.each([
    {}, { mutateOperationResponses: [] }, { mutateOperationResponses: [{ campaignResult: { resourceName: 'local-campaign' } }] },
    { mutateOperationResponses: [{ campaignResult: { resourceName: `customers/${customer}/campaigns/-1` } }] },
    { mutateOperationResponses: [{ campaignResult: { resourceName: `customers/${manager}/campaigns/1` } }] },
    { mutateOperationResponses: [{ adGroupResult: { resourceName: `customers/${customer}/adGroups/1` } }] },
    { mutateOperationResponses: [{ campaignResult: { resourceName: campaignName }, adGroupResult: { resourceName: 'extra' } }] },
    { error: { message: 'private' } }, { partialFailureError: { code: 3 } }
  ])('quarantines malformed mutation success without retries %#', async data => {
    const { client, transport } = setup(() => json(data));
    await expect(client.mutateOperations(customer, [campaign])).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME', isRetryable: false });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('validates without demanding fabricated results', async () => {
    const { client, transport } = setup(() => json({}));
    expect(await client.mutateOperations(customer, [campaign], { validateOnly: true })).toEqual({ results: [] });
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).validateOnly).toBe(true);
  });

  it('rejects results from validation-only calls', async () => {
    const { client } = setup();
    await expect(client.mutateOperations(customer, [campaign], { validateOnly: true })).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
  });

  it.each([400, 401, 403, 429])('classifies explicit HTTP %i mutation rejection as definite and does not retry', async status => {
    const { client, transport } = setup(() => json({ error: { message: 'SECRET TOKEN AND CUSTOMER EMAIL' } }, status));
    const error = await client.mutateOperations(customer, [campaign]).catch(value => value);
    expect(error.code).not.toBe('GOOGLE_UNKNOWN_OUTCOME');
    expect(error.isRetryable).toBe(false);
    expect(JSON.stringify(error)).not.toContain('SECRET');
    expect(error.message).not.toContain('SECRET');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([408, 500, 502, 503])('classifies HTTP %i mutation failure as ambiguous and never retries', async status => {
    const { client, transport } = setup(() => json({}, status));
    await expect(client.mutateOperations(customer, [campaign])).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME', isRetryable: false });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not echo private transport exception text', async () => {
    const { client, transport } = setup(() => { throw new Error('Bearer secret-token user@example.test'); });
    const error = await client.mutateOperations(customer, [campaign]).catch(value => value);
    expect(error.code).toBe('GOOGLE_UNKNOWN_OUTCOME');
    expect(JSON.stringify(error)).not.toContain('secret-token');
    expect(error.message).not.toContain('example.test');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('bounds stalled mutations even if an injected transport ignores abort', async () => {
    const { client, transport } = setup(() => new Promise<Response>(() => {}), {}, 5);
    await expect(client.mutateOperations(customer, [campaign])).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME', isRetryable: false });
    expect(transport.mock.calls[1][1]!.signal!.aborted).toBe(true);
  });

  it('bounds reads and classifies them as safely retryable', async () => {
    const { client } = setup(() => new Promise<Response>(() => {}), {}, 5);
    await expect(client.searchStream(customer, 'SELECT campaign.id FROM campaign')).rejects.toMatchObject({ code: 'GOOGLE_TIMEOUT', isRetryable: true });
  });

  it('rejects oversized responses and sanitizes malformed JSON', async () => {
    const { client } = setup(() => new Response('private invalid JSON', { status: 200, headers: { 'request-id': 'safe-request' } }));
    const error = await client.mutateOperations(customer, [campaign]).catch(value => value);
    expect(error).toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME', details: { requestId: 'safe-request' } });
    expect(error.message).not.toContain('private');
    const oversized = setup(() => new Response('{}', { status: 200, headers: { 'Content-Length': String(9 * 1024 * 1024) } }));
    await expect(oversized.client.searchStream(customer, 'SELECT campaign.id FROM campaign')).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
  });

  it('rejects invalid operations, cross-customer resources and masks before any HTTP', async () => {
    const { client, transport } = setup();
    const invalidOperations = [[], [{}], [{ customersOperation: { create: {} } }], [
      { campaignOperation: { update: { resourceName: campaignName, status: 'PAUSED' } } }
    ], [{ campaignOperation: { update: { resourceName: `customers/${manager}/campaigns/1` }, updateMask: 'status' } }], [
      { campaignOperation: { create: { name: 'x' }, remove: campaignName } }
    ]];
    for (const operations of invalidOperations) await expect(client.mutateOperations(customer, operations as any)).rejects.toMatchObject({ code: 'GOOGLE_INVALID_ARGUMENT' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('maps supported legacy updates/removes with an explicit mask', async () => {
    const { client, transport } = setup();
    await client.mutate(customer, [{ resourceName: campaignName, operation: 'UPDATE', payload: { status: 'PAUSED' }, updateMask: 'status' }]);
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).mutateOperations).toEqual([
      { campaignOperation: { update: { resourceName: campaignName, status: 'PAUSED' }, updateMask: 'status' } }
    ]);
    await client.mutate(customer, [{ resourceName: campaignName, operation: 'REMOVE', payload: {} }]);
    expect(JSON.parse(transport.mock.calls[2][1]!.body as string).mutateOperations).toEqual([{ campaignOperation: { remove: campaignName } }]);
  });

  it('rejects ambiguous legacy collection names', async () => {
    const { client, transport } = setup();
    await expect(client.mutate(customer, [{ resourceName: 'campaigns', operation: 'CREATE', payload: { name: 'x' } }])).rejects.toMatchObject({ code: 'GOOGLE_INVALID_ARGUMENT' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects a response that updates a different resource', async () => {
    const { client } = setup(() => json({ mutateOperationResponses: [{ campaignResult: { resourceName: `customers/${customer}/campaigns/999` } }] }));
    await expect(client.mutateOperations(customer, [{ campaignOperation: { update: { resourceName: campaignName, status: 'PAUSED' }, updateMask: 'status' } }])).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('returns complete conversion results and uses the correct v25 upload endpoint', async () => {
    const conversion = { conversionAction: `customers/${customer}/conversionActions/1`, conversionDateTime: '2026-09-13 01:00:00+05:30', gclid: 'test-click', orderId: 'test-booking' };
    const data = { results: [conversion], jobId: '789' };
    const { client, transport } = setup(() => json(data), {}, 15000, true);
    expect(await client.uploadClickConversions(customer, [conversion])).toEqual(data);
    expect(transport.mock.calls[1][0]).toBe(`https://googleads.googleapis.com/v25/customers/${customer}:uploadClickConversions`);
    expect(JSON.parse(transport.mock.calls[1][1]!.body as string).partialFailure).toBe(true);
  });

  it('rejects partial conversion failures so legacy callers cannot mark all uploaded', async () => {
    const { client } = setup(() => json({ partialFailureError: { code: 3, message: 'private lead email', details: ['private'] }, results: [{}] }), {}, 15000, true);
    const error = await client.uploadClickConversions(customer, [{ orderId: 'test' }]).catch(value => value);
    expect(error).toMatchObject({ code: 'GOOGLE_PARTIAL_FAILURE', isRetryable: false });
    expect(error.message).not.toContain('private');
    expect(JSON.stringify(error)).not.toContain('private');
  });

  it('does not accept empty conversion rows as uploaded', async () => {
    const { client } = setup(() => json({ results: [{}] }), {}, 15000, true);
    await expect(client.uploadClickConversions(customer, [{ orderId: 'test' }])).rejects.toMatchObject({ code: 'GOOGLE_UNKNOWN_OUTCOME' });
  });

  it('contains legacy conversion writes by default even with working OAuth credentials', async () => {
    const { client, transport } = setup();
    await expect(client.uploadClickConversions(customer, [{ orderId: 'test' }])).rejects.toMatchObject({ code: 'GOOGLE_MUTATION_FAILED', errorClass: 'POLICY' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects mutations targeting any account other than configured serving customer', async () => {
    const { client, transport } = setup(mutationSuccess, {}, 15000, true);
    await expect(client.mutateOperations('1112223333', [campaign])).rejects.toMatchObject({ code: 'GOOGLE_OWNERSHIP_MISMATCH' });
    await expect(client.uploadClickConversions('1112223333', [{}])).rejects.toMatchObject({ code: 'GOOGLE_OWNERSHIP_MISMATCH' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('fails malformed OAuth without sending a mutation or leaking the body', async () => {
    const transport = vi.fn(async () => json({ error: 'secret denied body' }, 401));
    const client = new GoogleAdsClient(credentials, { fetch: transport as typeof fetch });
    const error = await client.mutateOperations(customer, [campaign]).catch(value => value);
    expect(error).toMatchObject({ code: 'GOOGLE_AUTH_REJECTED', isRetryable: false });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('secret');
  });
});
