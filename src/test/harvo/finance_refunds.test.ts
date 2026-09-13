import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowPgFixture, workflowPolicy } from './workflowPgFixture.js';
import { testQuoteInput } from './financeFixtures.js';
import { MarketingFinanceService } from '../../lib/marketing/financeService.js';
import { CampaignRefundGateway, createRazorpayRefundClient, type StripeRefundClient, type RazorpayRefundClient } from '../../lib/marketing/refunds.js';

describe('HARVO original-payment refund adapter with real PostgreSQL and isolated provider clients', () => {
  let fixture: Awaited<ReturnType<typeof createWorkflowPgFixture>>, host: MarketingFinanceService;
  let latest: any;
  const stripeCreate=vi.fn(),stripeRead=vi.fn(),stripeAccount=vi.fn(),stripePayment=vi.fn();
  const razorpayCreate=vi.fn(),razorpayRead=vi.fn(),razorpayPayment=vi.fn();
  const stripe:StripeRefundClient={accounts:{retrieve:stripeAccount},paymentIntents:{retrieve:stripePayment},refunds:{create:stripeCreate,retrieve:stripeRead}};
  const razorpay:RazorpayRefundClient={payments:{fetch:razorpayPayment,refund:razorpayCreate},refunds:{fetch:razorpayRead}};
  const gateway=()=>new CampaignRefundGateway(fixture.pool,{actorContext:{id:90,role:'system'},stripe,stripeAccountId:'acct_TestRecipient',razorpay,razorpayAccountId:'acc_TestRecipient'});
  beforeAll(async()=>{fixture=await createWorkflowPgFixture();});
  afterAll(async()=>{await fixture?.close();});
  beforeEach(async()=>{
    await fixture.reset();await fixture.pool.query("INSERT INTO host_marketing_campaigns(id,host_id,listing_id) VALUES(1,10,20)");
    host=new MarketingFinanceService(fixture.pool,{actorContext:{id:10,role:'host'}});latest=undefined;
    stripeAccount.mockReset().mockResolvedValue({id:'acct_TestRecipient'});
    stripePayment.mockReset().mockResolvedValue({id:'pi_TestPayment',amount_received:105000,currency:'usd',status:'succeeded'});
    razorpayPayment.mockReset().mockResolvedValue({id:'pay_TestPayment',amount:105000,currency:'INR',status:'captured'});
    stripeCreate.mockReset().mockImplementation(async input=>(latest={id:'re_TestRefund',payment_intent:input.payment_intent,amount:input.amount,currency:'usd',metadata:input.metadata,status:'succeeded'}));
    razorpayCreate.mockReset().mockImplementation(async(payment,input)=>(latest={id:'rfnd_TestRefund',payment_id:payment,amount:input.amount,currency:'INR',receipt:input.receipt,status:'processed'}));
    stripeRead.mockReset().mockImplementation(async()=>structuredClone(latest));razorpayRead.mockReset().mockImplementation(async()=>structuredClone(latest));
  });
  async function obligation(provider:'STRIPE'|'RAZORPAY'='RAZORPAY'){
    const policy={...workflowPolicy,currency:provider==='STRIPE'?'USD' as const:'INR' as const};
    await new MarketingFinanceService(fixture.pool,{actorContext:{id:90,role:'admin'}}).persistPolicy(policy,90);
    const quote=await host.quote(testQuoteInput(),policy);
    const event={provider,accountId:provider==='STRIPE'?'acct_TestRecipient':'acc_TestRecipient',eventId:'capture-Test',paymentId:provider==='STRIPE'?'pi_TestPayment':'pay_TestPayment',orderId:'order_TestPayment',quoteId:quote.id,currency:policy.currency,amountMinor:'105000',payloadHash:'a'.repeat(64),capturedAt:new Date(Date.now()-1000).toISOString()};
    const capture=await new MarketingFinanceService(fixture.pool,{actorContext:{id:90,role:'system'},fundingEnabled:true,verifyCapture:async()=>event}).recordVerifiedCapture({});
    return host.requestRefund({captureId:capture.captureId,hostId:10,amountMinor:'50000',idempotencyKey:'refund-request'});
  }
  const money=async()=>(await fixture.pool.query('SELECT available_minor,refund_pending_minor FROM marketing_finance_accounts WHERE host_id=10')).rows[0];
  it.each(['STRIPE','RAZORPAY'] as const)('refunds held %s funds only to the original captured payment and settles after readback',async provider=>{
    const refund=await obligation(provider);const result=await gateway().dispatch(refund.refundRequestId);
    expect(result.status).toBe('SUCCEEDED');expect(await money()).toEqual({available_minor:'55000',refund_pending_minor:'0'});
    expect((await fixture.pool.query('SELECT status FROM marketing_finance_refunds')).rows).toEqual([{status:'SUCCEEDED'}]);
    if(provider==='STRIPE'){
      expect(stripeCreate).toHaveBeenCalledWith({payment_intent:'pi_TestPayment',amount:50000,metadata:{harvo_refund_id:refund.refundRequestId}},{idempotencyKey:`harvo-refund-${refund.refundRequestId}`});expect(stripeRead).toHaveBeenCalledOnce();
    }else{expect(razorpayCreate).toHaveBeenCalledWith('pay_TestPayment',{amount:50000,speed:'normal',receipt:refund.refundRequestId,notes:{harvo_refund_id:refund.refundRequestId}});expect(razorpayRead).toHaveBeenCalledOnce();}
    expect((await gateway().dispatch(refund.refundRequestId)).status).toBe('SUCCEEDED');expect(provider==='STRIPE'?stripeCreate:razorpayCreate).toHaveBeenCalledOnce();
  });
  it('uses one irreversible provider POST across concurrent dispatches',async()=>{
    const refund=await obligation();const replies=await Promise.all(Array.from({length:10},()=>gateway().dispatch(refund.refundRequestId)));
    expect(replies.some(r=>r.status==='SUCCEEDED')).toBe(true);expect(razorpayCreate).toHaveBeenCalledOnce();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_refund_operations')).rows).toHaveLength(1);
    expect(await money()).toEqual({available_minor:'55000',refund_pending_minor:'0'});
  });
  it('leaves pending provider refunds held and uses GET-only reconciliation before final success',async()=>{
    const refund=await obligation();razorpayRead.mockImplementationOnce(async()=>({...latest,status:'pending'}));
    expect((await gateway().dispatch(refund.refundRequestId)).status).toBe('PENDING');
    expect(await money()).toEqual({available_minor:'55000',refund_pending_minor:'50000'});
    expect((await gateway().reconcile(refund.refundRequestId)).status).toBe('SUCCEEDED');expect(razorpayCreate).toHaveBeenCalledOnce();
  });
  it('returns held money to available balance only after a confirmed failed refund',async()=>{
    const refund=await obligation('STRIPE');stripeRead.mockImplementationOnce(async()=>({...latest,status:'failed'}));
    expect((await gateway().dispatch(refund.refundRequestId)).status).toBe('FAILED');
    expect(await money()).toEqual({available_minor:'105000',refund_pending_minor:'0'});
  });
  it('quarantines a lost Razorpay write without releasing funds or retrying the POST',async()=>{
    const refund=await obligation();razorpayCreate.mockRejectedValueOnce(new Error('isolated connection lost after send'));
    await expect(gateway().dispatch(refund.refundRequestId)).rejects.toThrow(/connection lost/);
    expect(await money()).toEqual({available_minor:'55000',refund_pending_minor:'50000'});
    expect((await gateway().dispatch(refund.refundRequestId)).status).toBe('RECONCILIATION_REQUIRED');expect(razorpayCreate).toHaveBeenCalledOnce();
  });
  it('preserves a known external ID after failed GET and safely reconciles without resending',async()=>{
    const refund=await obligation();razorpayRead.mockRejectedValueOnce(new Error('isolated GET timeout'));
    await expect(gateway().dispatch(refund.refundRequestId)).rejects.toThrow(/GET timeout/);
    expect((await fixture.pool.query('SELECT external_refund_id,state FROM marketing_finance_refund_operations')).rows).toEqual([{external_refund_id:'rfnd_TestRefund',state:'RECONCILIATION_REQUIRED'}]);
    expect((await gateway().dispatch(refund.refundRequestId)).status).toBe('SUCCEEDED');expect(razorpayCreate).toHaveBeenCalledOnce();
  });
  it.each([{amount:49999},{currency:'USD'},{payment_id:'pay_OtherHost'},{receipt:'unrelated-refund'},{id:''},{status:'accepted'}])('rejects mismatched provider refund evidence %j without settling host money',async change=>{
    const refund=await obligation();razorpayRead.mockImplementationOnce(async()=>({...latest,...change}));
    await expect(gateway().dispatch(refund.refundRequestId)).rejects.toThrow();expect(await money()).toEqual({available_minor:'55000',refund_pending_minor:'50000'});
    expect((await fixture.pool.query('SELECT status FROM marketing_finance_refunds')).rows).toEqual([{status:'REQUESTED'}]);
  });
  it('requires the original merchant and current server job authorization before claiming a refund write',async()=>{
    const refund=await obligation('STRIPE');stripeAccount.mockResolvedValueOnce({id:'acct_OtherMerchant'});
    await expect(gateway().dispatch(refund.refundRequestId)).rejects.toMatchObject({code:'REFUND_ACCOUNT_MISMATCH'});expect(stripeCreate).not.toHaveBeenCalled();
    await expect(gateway().dispatch(refund.refundRequestId,async()=>{throw new Error('stale worker fence');})).rejects.toThrow(/stale worker fence/);expect(stripeCreate).not.toHaveBeenCalled();
    expect((await fixture.pool.query('SELECT * FROM marketing_finance_refund_operations')).rows).toHaveLength(0);
    expect(()=>new CampaignRefundGateway(fixture.pool,{actorContext:{id:10,role:'host'},stripe})).toThrow(/trusted server actor/);
  });
});

describe('narrow Razorpay refund HTTP transport',()=>{
  it('keeps the real idempotency header, exact minor amount and bounded fixed-origin HTTP request',async()=>{
    const transport=vi.fn(async()=>new Response(JSON.stringify({id:'rfnd_TestRefund'}),{status:200}));
    const client=createRazorpayRefundClient('isolated-key','isolated-secret',transport as unknown as typeof fetch);
    const input={amount:50000,speed:'normal' as const,receipt:'11111111-1111-4111-8111-111111111111',notes:{harvo_refund_id:'11111111-1111-4111-8111-111111111111'}};
    await client.payments.refund('pay_TestPayment',input);
    expect(transport).toHaveBeenCalledWith('https://api.razorpay.com/v1/payments/pay_TestPayment/refund',expect.objectContaining({method:'POST',redirect:'error',signal:expect.any(AbortSignal),body:JSON.stringify(input),headers:expect.objectContaining({'X-Refund-Idempotency':input.receipt})}));
    expect(transport).toHaveBeenCalledOnce();
  });
  it('rejects unsafe resource identifiers and never retries failed HTTP writes',async()=>{
    const transport=vi.fn(async()=>new Response('{}',{status:503}));const client=createRazorpayRefundClient('isolated-key','isolated-secret',transport as unknown as typeof fetch);
    expect(()=>client.payments.fetch('../accounts')).toThrow(/Invalid/);expect(transport).not.toHaveBeenCalled();
    await expect(client.payments.refund('pay_TestPayment',{amount:50000,speed:'normal',receipt:'11111111-1111-4111-8111-111111111111',notes:{}})).rejects.toMatchObject({code:'REFUND_PROVIDER_REQUEST_FAILED'});expect(transport).toHaveBeenCalledOnce();
  });
});
