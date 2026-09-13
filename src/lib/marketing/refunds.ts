import Stripe from 'stripe';
import type pg from 'pg';
import { MarketingFinanceService, type VerifiedRefund } from './financeService.js';
import { fingerprint } from './financeQuote.js';
import { inTransaction } from './database.js';
import { MarketingError, type Actor } from './domain.js';

export interface StripeRefundClient {
  accounts: { retrieve(): Promise<any> };
  paymentIntents: { retrieve(id: string): Promise<any> };
  refunds: { create(input: { payment_intent: string; amount: number; metadata: Record<string,string> }, options: { idempotencyKey: string }): Promise<any>; retrieve(id: string): Promise<any> };
}
export interface RazorpayRefundClient {
  payments: { fetch(id: string): Promise<any>; refund(id: string, input: { amount: number; speed: 'normal'; receipt: string; notes: Record<string,string> }): Promise<any> };
  refunds: { fetch(id: string): Promise<any> };
}
export interface CampaignRefundOptions {
  actorContext: Actor;
  stripeKey?: string; stripeAccountId?: string;
  razorpayKey?: string; razorpaySecret?: string; razorpayAccountId?: string;
  stripe?: StripeRefundClient; razorpay?: RazorpayRefundClient;
}
export interface RefundGatewayResult {
  refundRequestId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'RECONCILIATION_REQUIRED';
  externalRefundId?: string;
}
type RefundRow = { id: string; host_id: number; status: string; amount_minor: string; currency: string;
  capture_id: string; provider: 'STRIPE'|'RAZORPAY'; account_id: string; payment_id: string; captured_minor: string };

/** Fixed provider origin, bounded transport and no automatic request retries. */
export function createRazorpayRefundClient(key:string,secret:string,transport:typeof fetch=fetch):RazorpayRefundClient{
  const request=async(method:'GET'|'POST',path:string,body?:Record<string,unknown>,idempotencyKey?:string)=>{
    const response=await transport(`https://api.razorpay.com/v1/${path}`,{method,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'X-Refund-Idempotency':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new MarketingError('REFUND_PROVIDER_REQUEST_FAILED','Razorpay did not confirm this refund request',503);
    const reader=response.body?.getReader();if(!reader)throw new MarketingError('REFUND_RESPONSE_INVALID','Razorpay response was empty');
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>512*1024){await reader.cancel();throw new MarketingError('REFUND_RESPONSE_INVALID','Razorpay response exceeded the supported size');}chunks.push(chunk.value);}}
    finally{reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const payment=(id:string)=>{if(!/^pay_[A-Za-z0-9]+$/.test(id))throw new MarketingError('REFUND_PAYMENT_MISMATCH','Invalid original payment identity');return id;};
  return {payments:{fetch:id=>request('GET',`payments/${payment(id)}`),refund:(id,input)=>request('POST',`payments/${payment(id)}/refund`,input,input.receipt)},
    refunds:{fetch:id=>{if(!/^rfnd_[A-Za-z0-9]+$/.test(id))throw new MarketingError('REFUND_RESPONSE_INVALID','Invalid refund identity');return request('GET',`refunds/${id}`);}}};
}

/**
 * Refund only an existing held obligation back to its verified original payment.
 * Provider docs: https://docs.stripe.com/api/refunds/create
 * https://razorpay.com/docs/api/refunds/create-normal/
 * https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/
 * The narrow Razorpay transport preserves X-Refund-Idempotency, which the installed
 * SDK drops. A durable no-resend claim still quarantines every unknown POST.
 */
export class CampaignRefundGateway {
  private stripe: StripeRefundClient|null;
  private razorpay: RazorpayRefundClient|null;
  constructor(private pool: pg.Pool, private options: CampaignRefundOptions) {
    const actor=options.actorContext;
    if(!actor||!Number.isSafeInteger(actor.id)||actor.id<=0||!['system','admin'].includes(actor.role))throw new MarketingError('REFUND_FORBIDDEN','Refund processing requires a trusted server actor',403);
    this.stripe=options.stripe||(options.stripeKey?new Stripe(options.stripeKey,{maxNetworkRetries:0,timeout:15000}) as unknown as StripeRefundClient:null);
    this.razorpay=options.razorpay||(options.razorpayKey&&options.razorpaySecret?createRazorpayRefundClient(options.razorpayKey,options.razorpaySecret):null);
  }
  private async tx<T>(fn:(c:pg.PoolClient)=>Promise<T>){return inTransaction(this.pool,this.options.actorContext,fn);}
  private async load(id:string):Promise<RefundRow>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw new MarketingError('REFUND_ID_INVALID','An existing refund request identity is required',422);
    const row=await this.tx(async c=>(await c.query(`SELECT r.id,r.host_id,r.status,r.amount_minor,r.currency,r.capture_id,
      p.provider,p.account_id,p.payment_id,p.amount_minor AS captured_minor
      FROM marketing_finance_refunds r JOIN marketing_finance_captures p ON p.id=r.capture_id AND p.host_id=r.host_id AND p.currency=r.currency WHERE r.id=$1`,[id])).rows[0]);
    if(!row||BigInt(row.amount_minor)<=0n||BigInt(row.amount_minor)>BigInt(row.captured_minor)||BigInt(row.amount_minor)>BigInt(Number.MAX_SAFE_INTEGER))throw new MarketingError('REFUND_OBLIGATION_INVALID','Refund must match a captured, held original-payment obligation');
    return row;
  }
  private semantic(row:RefundRow){return fingerprint({id:row.id,hostId:row.host_id,captureId:row.capture_id,provider:row.provider,accountId:row.account_id,paymentId:row.payment_id,currency:row.currency,amountMinor:row.amount_minor});}
  private async preflight(row:RefundRow,sending:boolean){
    const configured=row.provider==='STRIPE'?this.options.stripeAccountId:this.options.razorpayAccountId;
    if(!configured||configured!==row.account_id||!(row.provider==='STRIPE'?this.stripe:this.razorpay))throw new MarketingError('REFUND_ACCOUNT_MISMATCH','The original capture account must match the configured refund recipient');
    if(row.provider==='STRIPE'){
      if(!/^pi_[A-Za-z0-9]+$/.test(row.payment_id))throw new MarketingError('REFUND_PAYMENT_MISMATCH','Invalid original Stripe payment identity');
      const account=await this.stripe!.accounts.retrieve();
      if(account.id!==row.account_id)throw new MarketingError('REFUND_ACCOUNT_MISMATCH','Stripe credentials do not identify the original capture account');
      const payment=await this.stripe!.paymentIntents.retrieve(row.payment_id);
      if(!/^pi_[A-Za-z0-9]+$/.test(row.payment_id)||payment.id!==row.payment_id||payment.status!=='succeeded'||payment.currency?.toUpperCase()!==row.currency||!Number.isSafeInteger(payment.amount_received)||BigInt(payment.amount_received)!==BigInt(row.captured_minor))throw new MarketingError('REFUND_PAYMENT_MISMATCH','Stripe payment does not match the original verified capture');
    }else{
      if(!/^pay_[A-Za-z0-9]+$/.test(row.payment_id))throw new MarketingError('REFUND_PAYMENT_MISMATCH','Invalid original Razorpay payment identity');
      const payment=await this.razorpay!.payments.fetch(row.payment_id);
      if(!/^pay_[A-Za-z0-9]+$/.test(row.payment_id)||payment.id!==row.payment_id||!(sending?['captured']:['captured','refunded']).includes(payment.status)||payment.currency!==row.currency||!Number.isSafeInteger(Number(payment.amount))||BigInt(payment.amount)!==BigInt(row.captured_minor))throw new MarketingError('REFUND_PAYMENT_MISMATCH','Razorpay payment does not match the original verified capture');
    }
  }
  private externalId(row:RefundRow,value:unknown){
    if(typeof value!=='string'||!(row.provider==='STRIPE'?/^re_[A-Za-z0-9]+$/:/^rfnd_[A-Za-z0-9]+$/).test(value))throw new MarketingError('REFUND_RESPONSE_INVALID','The provider did not return a valid refund identity');
    return value;
  }
  private validate(row:RefundRow,refund:any,expectedId?:string){
    const id=this.externalId(row,refund?.id);
    const payment=row.provider==='STRIPE'?refund.payment_intent:refund.payment_id;
    const currency=row.provider==='STRIPE'?refund.currency?.toUpperCase():refund.currency;
    const reference=row.provider==='STRIPE'?refund.metadata?.harvo_refund_id:refund.receipt;
    const allowed=row.provider==='STRIPE'?['pending','requires_action','succeeded','failed','canceled']:['pending','processed','failed'];
    if((expectedId&&id!==expectedId)||payment!==row.payment_id||currency!==row.currency||!Number.isSafeInteger(Number(refund.amount))||BigInt(refund.amount)!==BigInt(row.amount_minor)||reference!==row.id||!allowed.includes(refund.status))throw new MarketingError('REFUND_RESPONSE_MISMATCH','Refund identity, original payment, reference, amount, currency or status differs from the held obligation');
    return {id,status:refund.status==='succeeded'||refund.status==='processed'?'SUCCEEDED' as const:refund.status==='failed'||refund.status==='canceled'?'FAILED' as const:'PENDING' as const};
  }
  private async markUnknown(id:string){await this.tx(async c=>{await c.query("UPDATE marketing_finance_refund_operations SET state='RECONCILIATION_REQUIRED',last_error='REFUND_OUTCOME_UNVERIFIED',updated_at=now() WHERE refund_id=$1 AND state NOT IN ('SUCCEEDED','FAILED')",[id]);});}

  async dispatch(refundRequestId:string,authorizeSend?:(c:pg.PoolClient)=>Promise<void>):Promise<RefundGatewayResult>{
    const row=await this.load(refundRequestId);
    if(row.status!=='REQUESTED')return {refundRequestId,status:row.status as 'SUCCEEDED'|'FAILED'};
    const existing=await this.tx(async c=>(await c.query('SELECT * FROM marketing_finance_refund_operations WHERE refund_id=$1',[row.id])).rows[0]);
    if(existing){
      if(existing.fingerprint!==this.semantic(row))throw new MarketingError('REFUND_IDENTITY_CONFLICT','Refund dispatch identity changed');
      return existing.external_refund_id?this.reconcile(row.id):{refundRequestId,status:'RECONCILIATION_REQUIRED'};
    }
    // Safe reads can retry before the immutable money obligation is claimed for sending.
    await this.preflight(row,true);
    const claimed=await this.tx(async c=>{
      const current=(await c.query('SELECT status FROM marketing_finance_refunds WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
      if(current?.status!=='REQUESTED')return false;
      if(authorizeSend)await authorizeSend(c);
      const result=await c.query("INSERT INTO marketing_finance_refund_operations(refund_id,host_id,provider,account_id,fingerprint,state) VALUES($1,$2,$3,$4,$5,'SENDING') ON CONFLICT(refund_id) DO NOTHING RETURNING refund_id",[row.id,row.host_id,row.provider,row.account_id,this.semantic(row)]);
      return result.rows.length===1;
    });
    if(!claimed)return {refundRequestId,status:'RECONCILIATION_REQUIRED'};
    try{
      const result=row.provider==='STRIPE'?
        await this.stripe!.refunds.create({payment_intent:row.payment_id,amount:Number(row.amount_minor),metadata:{harvo_refund_id:row.id}},{idempotencyKey:`harvo-refund-${row.id}`}):
        await this.razorpay!.payments.refund(row.payment_id,{amount:Number(row.amount_minor),speed:'normal',receipt:row.id,notes:{harvo_refund_id:row.id}});
      const identity=this.validate(row,result);
      await this.tx(async c=>{await c.query("UPDATE marketing_finance_refund_operations SET external_refund_id=$2,state='PENDING',last_error=NULL,updated_at=now() WHERE refund_id=$1 AND external_refund_id IS NULL",[row.id,identity.id]);});
      // A POST acknowledgement alone never settles a local refund. Verify a fresh GET.
      return await this.reconcile(row.id);
    }catch(error){await this.markUnknown(row.id);throw error;}
  }

  async reconcile(refundRequestId:string):Promise<RefundGatewayResult>{
    const row=await this.load(refundRequestId);
    if(row.status!=='REQUESTED')return {refundRequestId,status:row.status as 'SUCCEEDED'|'FAILED'};
    const operation=await this.tx(async c=>(await c.query('SELECT * FROM marketing_finance_refund_operations WHERE refund_id=$1',[row.id])).rows[0]);
    if(!operation||operation.fingerprint!==this.semantic(row)||!operation.external_refund_id)return {refundRequestId,status:'RECONCILIATION_REQUIRED'};
    try{
      await this.preflight(row,false);
      const id=this.externalId(row,operation.external_refund_id);
      const observation=row.provider==='STRIPE'?await this.stripe!.refunds.retrieve(id):await this.razorpay!.refunds.fetch(id);
      const verified=this.validate(row,observation,id);
      if(verified.status==='PENDING'){
        await this.tx(async c=>{await c.query("UPDATE marketing_finance_refund_operations SET state='PENDING',last_error=NULL,updated_at=now() WHERE refund_id=$1 AND state NOT IN ('SUCCEEDED','FAILED')",[row.id]);});
        return {refundRequestId,status:'PENDING',externalRefundId:id};
      }
      const evidence:VerifiedRefund={provider:row.provider,accountId:row.account_id,eventId:`api-refund:${id}:${verified.status}`,paymentId:row.payment_id,refundRequestId:row.id,externalRefundId:id,currency:row.currency as 'INR'|'USD',amountMinor:row.amount_minor,payloadHash:fingerprint({provider:row.provider,accountId:row.account_id,refundId:id,paymentId:row.payment_id,amountMinor:row.amount_minor,currency:row.currency,status:verified.status}),status:verified.status};
      await new MarketingFinanceService(this.pool,{actorContext:this.options.actorContext,verifyRefund:async()=>evidence}).recordVerifiedRefund({refundRequestId:row.id,providerObservationId:id});
      await this.tx(async c=>{await c.query('UPDATE marketing_finance_refund_operations SET state=$2,last_error=NULL,updated_at=now() WHERE refund_id=$1',[row.id,verified.status]);});
      return {refundRequestId,status:verified.status,externalRefundId:id};
    }catch(error){await this.markUnknown(row.id);throw error;}
  }
}
