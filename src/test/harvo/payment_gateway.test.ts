import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowPgFixture, workflowConfig, workflowDraft } from './workflowPgFixture.js';
import { testPolicy, testQuoteInput } from './financeFixtures.js';
import { MarketingWorkflowService } from '../../lib/marketing/workflow.js';
import { WorkflowFinance } from '../../lib/marketing/financeBridge.js';
import { CampaignAiReviewer } from '../../lib/marketing/ai.js';
import { MarketingFinanceService } from '../../lib/marketing/financeService.js';
import { fingerprint } from '../../lib/marketing/domain.js';
import { CampaignPaymentGateway, type PaymentOptions } from '../../lib/marketing/payments.js';

const sdk = vi.hoisted(() => ({
  stripeAccount: vi.fn(), stripeCreate: vi.fn(), stripeSession: vi.fn(), stripePayment: vi.fn(),
  razorCreate: vi.fn(), razorLink: vi.fn(), razorPayment: vi.fn(),
}));
// Keep Stripe's actual cryptographic webhook parser; replace every network-capable SDK method.
vi.mock('stripe', async importOriginal => {
  const { default: Stripe } = await importOriginal<typeof import('stripe')>();
  return { default: class IsolatedStripe {
    webhooks = new Stripe('sk_test_isolated_not_a_credential').webhooks;
    accounts = { retrieve: sdk.stripeAccount };
    checkout = { sessions: { create: sdk.stripeCreate, retrieve: sdk.stripeSession } };
    paymentIntents = { retrieve: sdk.stripePayment };
  } };
});
vi.mock('razorpay', () => ({ default: class IsolatedRazorpay {
  paymentLink = { create: sdk.razorCreate, fetch: sdk.razorLink };
  payments = { fetch: sdk.razorPayment };
} }));

const options: PaymentOptions = { origin: 'https://encho.example', stripeKey: 'sk_test_isolated_not_a_credential', stripeAccountId: 'acct_isolated', stripeWebhookSecret: 'whsec_isolated_fixture',
  razorpayKey: 'rzp_test_isolated', razorpaySecret: 'isolated-key-secret', razorpayAccountId: 'acc_isolated', razorpayWebhookSecret: 'isolated-webhook-secret' };
const stamp = () => Math.floor(Date.now() / 1000);
const stripeEvent = () => ({ id: 'evt_isolatedcontract', type: 'payment_intent.succeeded', created: stamp(), account: 'acct_isolated', data: { object: { id: 'pi_isolated' } } });
const razorEvent = () => ({ event: 'payment_link.paid', account_id: 'acc_isolated', created_at: stamp(), payload: { payment_link: { entity: { id: 'plink_isolated' } }, payment: { entity: { id: 'pay_isolated' } } } });
const signature = (provider: 'STRIPE' | 'RAZORPAY', raw: Buffer, time = stamp()) => provider === 'STRIPE'
  ? `t=${time},v1=${createHmac('sha256', options.stripeWebhookSecret!).update(`${time}.`).update(raw).digest('hex')}`
  : createHmac('sha256', options.razorpayWebhookSecret!).update(raw).digest('hex');

describe('HARVO gateway security with real PostgreSQL and no payment network', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>, gateway: CampaignPaymentGateway;
  let quoteId = '';
  beforeAll(async () => { fixture = await createWorkflowPgFixture(); });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.reset();
    Object.values(sdk).forEach(mock => mock.mockReset());
    sdk.stripeAccount.mockResolvedValue({ id: 'acct_isolated' });
    sdk.stripeCreate.mockImplementation(async input => ({ id: 'cs_test_isolated', url: 'https://checkout.stripe.com/isolated', amount_total: input.line_items[0].price_data.unit_amount, currency: input.line_items[0].price_data.currency, client_reference_id: input.client_reference_id }));
    sdk.razorCreate.mockImplementation(async input => ({ id: 'plink_isolated', short_url: 'https://rzp.io/isolated', amount: input.amount, currency: input.currency, reference_id: input.reference_id }));
    sdk.stripePayment.mockImplementation(async id => ({ id, status: 'succeeded', amount: 105000, amount_received: 105000, currency: 'usd', metadata: { harvo_quote_id: quoteId } }));
    sdk.stripeSession.mockImplementation(async id => ({ id, payment_status: 'paid', payment_intent: 'pi_isolated', client_reference_id: quoteId, currency: 'usd', amount_total: 105000 }));
    sdk.razorLink.mockImplementation(async id => ({ id, status: 'paid', reference_id: quoteId, amount: 105000, amount_paid: 105000, currency: 'INR', payments: [{ payment_id: 'pay_isolated' }] }));
    sdk.razorPayment.mockImplementation(async id => ({ id, status: 'captured', amount: 105000, currency: 'INR' }));
    gateway = new CampaignPaymentGateway(fixture.pool, options);
  });
  async function campaignQuote(currency: 'INR' | 'USD' = 'INR') {
    await fixture.pool.query('UPDATE listings SET currency=$1 WHERE id=20', [currency]);
    const policy = { ...testPolicy, id: `isolated-gateway-${currency}`, currency };
    const finance = new MarketingFinanceService(fixture.pool, { actorContext: { id: 90, role: 'admin' } });
    await finance.persistPolicy(policy, 90);
    const service = new MarketingWorkflowService(fixture.pool, { ai: new CampaignAiReviewer({ mediaOrigins: new Set() }), finance: new WorkflowFinance(fixture.pool, workflowConfig, gateway), fundingEnabled: true, publishingEnabled: false, activationEnabled: false, configurationReasons: [] });
    const row = await service.create({ id: 10, role: 'host' }, workflowDraft({ locations: ['IN'] }));
    const quote = await new MarketingFinanceService(fixture.pool, { actorContext: { id: 10, role: 'host' } }).quote(testQuoteInput({ campaignId: row.campaign_id, campaignRevision: String(row.revision) }), policy);
    quoteId = quote.id;
    // Approved revision is an explicit test fixture; review authorization is covered by router_contract.test.ts.
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET quote_id=$2,state='APPROVED' WHERE campaign_id=$1", [row.campaign_id, quote.id]);
    return { row: { ...row, quote_id: quote.id, state: 'APPROVED' }, quote };
  }
  async function prepared(provider: 'STRIPE' | 'RAZORPAY') {
    const data = await campaignQuote(provider === 'STRIPE' ? 'USD' : 'INR');
    await gateway.checkout(data.row, data.quote);
    return { ...data, evidence: evidence(provider) };
  }
  function evidence(provider: 'STRIPE' | 'RAZORPAY', payload: any = provider === 'STRIPE' ? stripeEvent() : razorEvent()) {
    return { provider, eventId: provider === 'STRIPE' ? payload.id : 'event_isolated_razor', payload, payloadHash: fingerprint(payload) };
  }

  it('creates Razorpay checkout without fabricated customer information', async () => {
    const { row, quote } = await campaignQuote();
    await gateway.checkout(row, quote);
    const request = sdk.razorCreate.mock.calls[0][0];
    expect(request).not.toHaveProperty('customer');
    expect(request).toMatchObject({ amount: Number(quote.totalMinor), reference_id: quote.id,
      currency: 'INR', accept_partial: false, notify: { sms: false, email: false } });
    await gateway.checkout(row, quote);
    expect(sdk.razorCreate).toHaveBeenCalledTimes(1);
  });

  it('rechecks cancellation under the campaign lock before claiming a fresh checkout',async()=>{
    const data=await campaignQuote();
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='CANCELLED' WHERE campaign_id=$1",[data.row.campaign_id]);
    await expect(gateway.checkout(data.row,data.quote)).rejects.toMatchObject({code:'PAYMENT_CAMPAIGN_CHANGED'});
    expect(sdk.razorCreate).not.toHaveBeenCalled();expect(sdk.stripeCreate).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT count(*)::int n FROM marketing_checkout_attempts')).rows[0].n).toBe(0);
  });

  it('does not reoffer a saved checkout after campaign cancellation',async()=>{
    const data=await campaignQuote();await gateway.checkout(data.row,data.quote);
    await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='CANCELLED' WHERE campaign_id=$1",[data.row.campaign_id]);
    await expect(gateway.checkout(data.row,data.quote)).rejects.toMatchObject({code:'PAYMENT_CAMPAIGN_CHANGED'});
    expect(sdk.razorCreate).toHaveBeenCalledTimes(1);
    expect((await fixture.pool.query('SELECT state FROM marketing_checkout_attempts')).rows[0].state).toBe('CREATED');
  });

  it.each(['INR', 'USD'] as const)('refuses unconfigured %s checkout before recording or calling a provider', async currency => {
    const data = await campaignQuote(currency);
    const missing = new CampaignPaymentGateway(fixture.pool, { origin: options.origin });
    await expect(missing.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_REQUIRED' });
    expect(sdk.stripeCreate).not.toHaveBeenCalled(); expect(sdk.razorCreate).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_checkout_attempts')).rows).toHaveLength(0);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('creates one %s checkout under concurrency and leaves capture authority empty', async provider => {
    const data = await campaignQuote(provider === 'STRIPE' ? 'USD' : 'INR');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => gateway.checkout(data.row, data.quote)));
    expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const calls = provider === 'STRIPE' ? sdk.stripeCreate : sdk.razorCreate;
    expect(calls).toHaveBeenCalledOnce();
    const saved = (await fixture.pool.query('SELECT * FROM marketing_checkout_attempts')).rows;
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ state: 'CREATED', amount_minor: '105000', currency: data.quote.currency });
    await expect(gateway.checkout(data.row, data.quote)).resolves.toMatchObject({ status: 'AWAITING_CAPTURE', url: saved[0].payment_url });
    expect(calls).toHaveBeenCalledOnce();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_journals')).rows).toHaveLength(0);
    if (provider === 'STRIPE') expect(calls.mock.calls[0][0]).toMatchObject({ payment_method_options: { card: { request_three_d_secure: 'any' } } });
    else expect(calls.mock.calls[0][0]).toMatchObject({ accept_partial: false, notify: { sms: false, email: false }, reminder_enable: false });
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('quarantines a lost %s checkout response and never retries creation automatically', async provider => {
    const data = await campaignQuote(provider === 'STRIPE' ? 'USD' : 'INR');
    const calls = provider === 'STRIPE' ? sdk.stripeCreate : sdk.razorCreate;
    calls.mockRejectedValueOnce(new Error('Response lost after possible provider creation'));
    await expect(gateway.checkout(data.row, data.quote)).rejects.toThrow('Response lost');
    await expect(gateway.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    expect(calls).toHaveBeenCalledOnce();
    expect((await fixture.pool.query('SELECT state FROM marketing_checkout_attempts')).rows).toEqual([{ state: 'RECONCILIATION_REQUIRED' }]);
  });
  it('rejects changed checkout owner and amount for a quote without another provider call', async () => {
    const data = await campaignQuote(); await gateway.checkout(data.row, data.quote);
    await expect(gateway.checkout({ ...data.row, host_id: 11 }, data.quote)).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND', status: 404 });
    await expect(gateway.checkout(data.row, { ...data.quote, totalMinor: '104999' })).rejects.toMatchObject({ code: 'PAYMENT_IDENTITY_CONFLICT' });
    expect(sdk.razorCreate).toHaveBeenCalledOnce();
  });
  it('rejects a Stripe recipient mismatch before creating a checkout', async () => {
    const data = await campaignQuote('USD'); sdk.stripeAccount.mockResolvedValue({ id: 'acct_other' });
    await expect(gateway.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_ACCOUNT_MISMATCH' });
    expect(sdk.stripeCreate).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', '9007199254740993'])('rejects unsupported checkout total %s before a provider request', async totalMinor => {
    const data = await campaignQuote('USD');
    await expect(gateway.checkout(data.row, { ...data.quote, totalMinor })).rejects.toThrow();
    expect(sdk.stripeCreate).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_checkout_attempts')).rows).toHaveLength(0);
  });
  it.each(['https://attacker.example/checkout', 'https://user:pass@checkout.stripe.com/isolated', 'https://checkout.stripe.com:444/isolated'])('refuses unexpected checkout destination %s', async url => {
    const data = await campaignQuote('USD'); sdk.stripeCreate.mockResolvedValue({ id: 'cs_test_isolated', url, amount_total: 105000, currency: 'usd', client_reference_id: quoteId });
    await expect(gateway.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_RESPONSE_INVALID' });
    expect((await fixture.pool.query('SELECT state,payment_url FROM marketing_checkout_attempts')).rows).toEqual([{ state: 'RECONCILIATION_REQUIRED', payment_url: null }]);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects a %s creation response bound to another quote', async provider => {
    const data = await campaignQuote(provider === 'STRIPE' ? 'USD' : 'INR');
    if (provider === 'STRIPE') sdk.stripeCreate.mockResolvedValue({ id: 'cs_test_isolated', url: 'https://checkout.stripe.com/isolated', amount_total: 105000, currency: 'usd', client_reference_id: 'another-quote' });
    else sdk.razorCreate.mockResolvedValue({ id: 'plink_isolated', short_url: 'https://rzp.io/isolated', amount: 105000, currency: 'INR', reference_id: 'another-quote' });
    await expect(gateway.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_RESPONSE_INVALID' });
    expect((await fixture.pool.query('SELECT state,external_id FROM marketing_checkout_attempts')).rows).toEqual([{ state: 'RECONCILIATION_REQUIRED', external_id: null }]);
  });
  it('refuses a corrupted persisted checkout link without creating a replacement', async () => {
    const data = await prepared('STRIPE');
    await fixture.pool.query("UPDATE marketing_checkout_attempts SET payment_url='https://attacker.example' WHERE quote_id=$1", [data.quote.id]);
    await expect(gateway.checkout(data.row, data.quote)).rejects.toMatchObject({ code: 'PAYMENT_RESPONSE_INVALID' });
    expect(sdk.stripeCreate).toHaveBeenCalledOnce();
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('verifies %s signatures before a durable job, without payment API lookup or ledger credit', async provider => {
    const payload = provider === 'STRIPE' ? stripeEvent() : razorEvent(); const raw = Buffer.from(JSON.stringify(payload));
    await expect(gateway.ingest(provider, raw, signature(provider, raw), 'event_isolated_razor')).resolves.toEqual({ accepted: true });
    const jobs = (await fixture.pool.query('SELECT kind,state,payload FROM marketing_jobs')).rows;
    expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ kind: 'PAYMENT', state: 'PENDING', payload: { provider, payloadHash: fingerprint(payload) } });
    expect(sdk.stripePayment).not.toHaveBeenCalled(); expect(sdk.razorPayment).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('stores a minimal authenticated %s envelope without payment secrets or contact data', async provider => {
    const data = await prepared(provider);
    const payload: any = provider === 'STRIPE' ? stripeEvent() : razorEvent();
    const entity = provider === 'STRIPE' ? payload.data.object : payload.payload.payment.entity;
    Object.assign(entity, { client_secret: 'fixture-client-secret-should-not-persist', email: 'private-fixture@example.test', contact: 'fixture-private-phone', card: { last4: '4321' }, metadata: { privateNote: 'fixture-private-metadata' } });
    const raw = Buffer.from(JSON.stringify(payload));
    await gateway.ingest(provider, raw, signature(provider, raw), 'event_isolated_razor');
    const stored = (await fixture.pool.query('SELECT payload FROM marketing_jobs')).rows[0].payload;
    expect(stored).toMatchObject({ protocol: 'HARVO_PAYMENT_ENVELOPE_V1', payloadHash: fingerprint(payload), envelopeHash: fingerprint(stored.payload) });
    for (const privateValue of ['fixture-client-secret', 'private-fixture@example.test', 'fixture-private-phone', 'fixture-private-metadata']) expect(JSON.stringify(stored)).not.toContain(privateValue);
    expect(JSON.stringify(stored.payload)).not.toContain('"card":');
    await expect(gateway.verifyCapture(stored)).resolves.toMatchObject({ quoteId: data.quote.id, amountMinor: '105000', payloadHash: fingerprint(payload) });
    const corrupted = structuredClone(stored); if (provider === 'STRIPE') corrupted.payload.data.object.id = 'pi_tampered'; else corrupted.payload.payload.payment.entity.id = 'pay_tampered';
    await expect(gateway.verifyCapture(corrupted)).rejects.toMatchObject({ code: 'PAYMENT_EVIDENCE_INVALID' });
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects bad %s signatures and oversized ingress with no queue write', async provider => {
    const raw = Buffer.from(JSON.stringify(provider === 'STRIPE' ? stripeEvent() : razorEvent()));
    await expect(gateway.ingest(provider, raw, 'invalid', 'event_isolated_razor')).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    await expect(gateway.ingest(provider, Buffer.alloc(1024 * 1024 + 1), '', 'event_isolated_razor')).rejects.toMatchObject({ code: 'WEBHOOK_TOO_LARGE' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });
  it('rejects an expired Stripe signature with no durable job', async () => {
    const raw = Buffer.from(JSON.stringify(stripeEvent()));
    await expect(gateway.ingest('STRIPE', raw, signature('STRIPE', raw, stamp() - 600))).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('deduplicates %s webhook retries and rejects same-event changed payloads', async provider => {
    const payload = provider === 'STRIPE' ? stripeEvent() : razorEvent(), raw = Buffer.from(JSON.stringify(payload));
    const send = (body: Buffer) => gateway.ingest(provider, body, signature(provider, body), 'event_isolated_razor');
    await Promise.all(Array.from({ length: 5 }, () => send(raw)));
    const changed = Buffer.from(JSON.stringify({ ...payload, changedEvidence: true }));
    await expect(send(changed)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(1);
  });
  it('ignores unrelated signed events and requires provider event IDs', async () => {
    const raw = Buffer.from(JSON.stringify({ event: 'payment.authorized' }));
    await expect(gateway.ingest('RAZORPAY', raw, signature('RAZORPAY', raw))).resolves.toEqual({ accepted: true, ignored: true });
    const missing = Buffer.from(JSON.stringify(razorEvent()));
    await expect(gateway.ingest('RAZORPAY', missing, signature('RAZORPAY', missing))).rejects.toMatchObject({ code: 'WEBHOOK_EVENT_ID_REQUIRED' });
    const stripeMissing = Buffer.from(JSON.stringify({ ...stripeEvent(), id: undefined }));
    await expect(gateway.ingest('STRIPE', stripeMissing, signature('STRIPE', stripeMissing))).rejects.toMatchObject({ code: 'WEBHOOK_EVENT_ID_REQUIRED' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });
  it('returns a typed refusal for signed malformed Razorpay JSON', async () => {
    const raw = Buffer.from('{broken');
    await expect(gateway.ingest('RAZORPAY', raw, signature('RAZORPAY', raw), 'event_isolated_razor')).rejects.toMatchObject({ name: 'MarketingError' });
    expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rows).toHaveLength(0);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('binds a verified %s capture to the saved checkout while leaving ledger mutation to finance', async provider => {
    const data = await prepared(provider);
    await expect(gateway.verifyCapture(data.evidence)).resolves.toMatchObject({ provider, quoteId: data.quote.id, currency: data.quote.currency, amountMinor: '105000', paymentId: provider === 'STRIPE' ? 'pi_isolated' : 'pay_isolated', orderId: provider === 'STRIPE' ? 'cs_test_isolated' : 'plink_isolated' });
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_captures')).rows).toHaveLength(0);
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects corrupted %s payload hashes before external reads', async provider => {
    const v = evidence(provider); v.payloadHash = '0'.repeat(64);
    await expect(gateway.verifyCapture(v)).rejects.toMatchObject({ code: 'PAYMENT_EVIDENCE_INVALID' });
    expect(sdk.stripeAccount).not.toHaveBeenCalled(); expect(sdk.razorLink).not.toHaveBeenCalled();
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects wrong %s recipient evidence before fetching payment', async provider => {
    const v = evidence(provider, provider === 'STRIPE' ? { ...stripeEvent(), account: 'acct_other' } : { ...razorEvent(), account_id: 'acc_other' });
    await expect(gateway.verifyCapture(v)).rejects.toThrow();
    expect(sdk.stripePayment).not.toHaveBeenCalled(); expect(sdk.razorPayment).not.toHaveBeenCalled();
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects a fully captured %s payment with amount different from the immutable checkout', async provider => {
    const data = await prepared(provider);
    if (provider === 'STRIPE') {
      sdk.stripePayment.mockResolvedValue({ id: 'pi_isolated', status: 'succeeded', amount: 104999, amount_received: 104999, currency: 'usd', metadata: { harvo_quote_id: quoteId } });
      sdk.stripeSession.mockResolvedValue({ id: 'cs_test_isolated', payment_status: 'paid', payment_intent: 'pi_isolated', client_reference_id: quoteId, currency: 'usd', amount_total: 104999 });
    } else {
      sdk.razorLink.mockResolvedValue({ id: 'plink_isolated', status: 'paid', reference_id: quoteId, amount: 104999, amount_paid: 104999, currency: 'INR', payments: [{ payment_id: 'pay_isolated' }] });
      sdk.razorPayment.mockResolvedValue({ id: 'pay_isolated', status: 'captured', amount: 104999, currency: 'INR' });
    }
    await expect(gateway.verifyCapture(data.evidence)).rejects.toThrow();
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects fetched %s object IDs that differ from the requested signed object', async provider => {
    const data = await prepared(provider);
    if (provider === 'STRIPE') {
      sdk.stripePayment.mockResolvedValue({ id: 'pi_other', status: 'succeeded', amount: 105000, amount_received: 105000, currency: 'usd', metadata: { harvo_quote_id: quoteId } });
      sdk.stripeSession.mockResolvedValue({ id: 'cs_test_isolated', payment_status: 'paid', payment_intent: 'pi_other', client_reference_id: quoteId, currency: 'usd', amount_total: 105000 });
    } else {
      sdk.razorPayment.mockResolvedValue({ id: 'pay_other', status: 'captured', amount: 105000, currency: 'INR' });
      sdk.razorLink.mockResolvedValue({ id: 'plink_isolated', status: 'paid', reference_id: quoteId, amount: 105000, amount_paid: 105000, currency: 'INR', payments: [{ payment_id: 'pay_other' }] });
    }
    await expect(gateway.verifyCapture(data.evidence)).rejects.toThrow();
  });
  it.each(['STRIPE', 'RAZORPAY'] as const)('rejects %s currency different from the immutable checkout', async provider => {
    const data = await prepared(provider);
    if (provider === 'STRIPE') {
      sdk.stripePayment.mockResolvedValue({ id: 'pi_isolated', status: 'succeeded', amount: 105000, amount_received: 105000, currency: 'inr', metadata: { harvo_quote_id: quoteId } });
      sdk.stripeSession.mockResolvedValue({ id: 'cs_test_isolated', payment_status: 'paid', payment_intent: 'pi_isolated', client_reference_id: quoteId, currency: 'inr', amount_total: 105000 });
    } else {
      sdk.razorPayment.mockResolvedValue({ id: 'pay_isolated', status: 'captured', amount: 105000, currency: 'USD' });
      sdk.razorLink.mockResolvedValue({ id: 'plink_isolated', status: 'paid', reference_id: quoteId, amount: 105000, amount_paid: 105000, currency: 'USD', payments: [{ payment_id: 'pay_isolated' }] });
    }
    await expect(gateway.verifyCapture(data.evidence)).rejects.toThrow();
  });
  it('rejects a Stripe session response that changes the saved checkout ID or quote association', async () => {
    const data = await prepared('STRIPE');
    sdk.stripeSession.mockResolvedValue({ id: 'cs_other', payment_status: 'paid', payment_intent: 'pi_isolated', client_reference_id: quoteId, currency: 'usd', amount_total: 105000 });
    await expect(gateway.verifyCapture(data.evidence)).rejects.toThrow();
    sdk.stripeSession.mockResolvedValue({ id: 'cs_test_isolated', payment_status: 'paid', payment_intent: 'pi_isolated', client_reference_id: '00000000-0000-0000-0000-000000000000', currency: 'usd', amount_total: 105000 });
    await expect(gateway.verifyCapture(data.evidence)).rejects.toThrow();
  });
});
