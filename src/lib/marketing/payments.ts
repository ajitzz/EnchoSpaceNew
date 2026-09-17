import Stripe from 'stripe';
import Razorpay from 'razorpay';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import {MarketingError,fingerprint,publicOrigin} from './domain.js';
import {inTransaction,lockWorkflow} from './database.js';
import {enqueue} from './jobs.js';
import type {VerifiedCapture} from './financeService.js';

export interface PaymentOptions{origin:string;stripeKey?:string;stripeWebhookSecret?:string;stripeAccountId?:string;razorpayKey?:string;razorpaySecret?:string;razorpayWebhookSecret?:string;razorpayAccountId?:string;}
const envelopeProtocol='HARVO_PAYMENT_ENVELOPE_V1';
function assertMinorAmount(value:unknown):asserts value is string {
 if(typeof value!=='string'||!/^[1-9]\d{0,15}$/.test(value)||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))throw new MarketingError('PAYMENT_AMOUNT_INVALID','Checkout amount must be a positive supported integer in minor units',422);
}
function checkoutDestination(value:unknown,gateway:'STRIPE'|'RAZORPAY'):string {
 let destination:URL;try{if(typeof value!=='string')throw new Error();destination=new URL(value);}catch{throw new MarketingError('PAYMENT_RESPONSE_INVALID','Checkout returned an invalid destination');}
 if(destination.protocol!=='https:'||destination.username||destination.password||destination.port||!(gateway==='STRIPE'?destination.hostname==='checkout.stripe.com':['rzp.io','rzp.co','razorpay.com','pages.razorpay.com'].includes(destination.hostname)))throw new MarketingError('PAYMENT_RESPONSE_INVALID','Checkout returned an unexpected destination');
 return destination.href;
}
function minimalPaymentEnvelope(provider:'STRIPE'|'RAZORPAY',payload:any){
 const at=provider==='STRIPE'?payload.created:payload.created_at;
 if(!Number.isSafeInteger(at)||at<=0||!Number.isFinite(new Date(at*1000).getTime()))throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Payment event time is invalid',422);
 if(provider==='STRIPE'){
  const id=payload.data?.object?.id;
  if(typeof id!=='string'||!/^pi_[a-zA-Z0-9]{3,200}$/.test(id))throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Payment event object is invalid',422);
  return {id:payload.id,type:payload.type,created:at,...typeof payload.account==='string'?{account:payload.account}:{},data:{object:{id}}};
 }
 const linkId=payload.payload?.payment_link?.entity?.id,paymentId=payload.payload?.payment?.entity?.id;
 if(typeof payload.account_id!=='string'||typeof linkId!=='string'||typeof paymentId!=='string'||!/^plink_[a-zA-Z0-9]{3,200}$/.test(linkId)||!/^pay_[a-zA-Z0-9]{3,200}$/.test(paymentId))throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Payment event objects are invalid',422);
 return {event:payload.event,account_id:payload.account_id,created_at:at,payload:{payment_link:{entity:{id:linkId}},payment:{entity:{id:paymentId}}}};
}
export class CampaignPaymentGateway{
 private stripe:Stripe|null;private razorpay:Razorpay|null;
 constructor(private pool:pg.Pool,private options:PaymentOptions){this.stripe=options.stripeKey?new Stripe(options.stripeKey,{maxNetworkRetries:0,timeout:15000}):null;this.razorpay=options.razorpayKey&&options.razorpaySecret?new Razorpay({key_id:options.razorpayKey,key_secret:options.razorpaySecret}):null;}
 configured(currency:string){return currency==='INR'?!!(this.razorpay&&this.options.razorpayAccountId&&this.options.razorpayWebhookSecret):currency==='USD'&&!!(this.stripe&&this.options.stripeAccountId&&this.options.stripeWebhookSecret);}
 async checkout(row:any,quote:{id:string;totalMinor:string;currency:string}){
  assertMinorAmount(quote.totalMinor);
  const origin=publicOrigin(this.options.origin);if(!this.configured(quote.currency))throw new MarketingError('PAYMENT_GATEWAY_REQUIRED','The payment provider for this campaign currency is not configured',503);
  const gateway=quote.currency==='INR'?'RAZORPAY':'STRIPE';const actor={id:row.host_id,role:'host' as const};
  const claim=await inTransaction(this.pool,actor,async c=>{
   const current=await lockWorkflow(c,row.campaign_id,actor);
   if(current.state!=='APPROVED'||current.revision!==row.revision||current.quote_id!==quote.id)throw new MarketingError('PAYMENT_CAMPAIGN_CHANGED','The campaign is no longer approved for this funding request');
   const result=await c.query(`INSERT INTO marketing_checkout_attempts(campaign_id,host_id,quote_id,gateway,state,amount_minor,currency) VALUES($1,$2,$3,$4,'REQUESTED',$5,$6) ON CONFLICT(quote_id) DO NOTHING RETURNING *`,[row.campaign_id,row.host_id,quote.id,gateway,quote.totalMinor,quote.currency]);
   const saved=result.rows[0]||(await c.query('SELECT * FROM marketing_checkout_attempts WHERE quote_id=$1',[quote.id])).rows[0];
   if(!saved||saved.campaign_id!==row.campaign_id||saved.host_id!==row.host_id||saved.amount_minor!==quote.totalMinor||saved.currency!==quote.currency)throw new MarketingError('PAYMENT_IDENTITY_CONFLICT','Checkout identity does not match this quote');return {row:saved,isNew:result.rows.length>0};
  });
  if(!claim.isNew){if(claim.row.state==='CREATED'&&typeof claim.row.external_id==='string'&&claim.row.external_id)return {url:checkoutDestination(claim.row.payment_url,gateway),status:'AWAITING_CAPTURE'};throw new MarketingError('PAYMENT_RECONCILIATION_REQUIRED','The existing checkout attempt needs reconciliation before another can be created');}
  try{
   let id:string,url:string;
   if(gateway==='STRIPE'){
    const account=await this.stripe!.accounts.retrieve(null);if(account.id!==this.options.stripeAccountId)throw new MarketingError('PAYMENT_ACCOUNT_MISMATCH','Stripe account does not match the configured recipient');
    const session=await this.stripe!.checkout.sessions.create({mode:'payment',client_reference_id:quote.id,metadata:{harvo_quote_id:quote.id},payment_intent_data:{metadata:{harvo_quote_id:quote.id}},payment_method_types:['card'],payment_method_options:{card:{request_three_d_secure:'any'}},line_items:[{price_data:{currency:quote.currency.toLowerCase(),unit_amount:Number(quote.totalMinor),product_data:{name:`Encho campaign funding · ${row.draft.title}`}},quantity:1}],success_url:`${origin}/host?marketing=payment-pending`,cancel_url:`${origin}/host?marketing=payment-cancelled`},{idempotencyKey:`harvo-checkout-${quote.id}`});
    if(typeof session.id!=='string'||!/^cs_[a-zA-Z0-9_]{3,200}$/.test(session.id)||!session.url||session.amount_total!==Number(quote.totalMinor)||session.currency!==quote.currency.toLowerCase()||session.client_reference_id!==quote.id)throw new MarketingError('PAYMENT_RESPONSE_INVALID','Checkout response did not confirm the requested identity and amount');id=session.id;url=session.url;
   }else{
    // Notifications are off; only the authenticated host receives the checkout URL.
    const link=await this.razorpay!.paymentLink.create({amount:Number(quote.totalMinor),currency:'INR',accept_partial:false,customer:{name:'Encho Host',email:'host@encho.co.in'},reference_id:quote.id,description:`Encho campaign ${row.campaign_id}`,notify:{sms:false,email:false},reminder_enable:false,notes:{harvo_quote_id:quote.id},callback_url:`${origin}/host?marketing=payment-pending`,callback_method:'get'});
    if(typeof link.id!=='string'||!/^plink_[a-zA-Z0-9]{3,200}$/.test(link.id)||!link.short_url||Number(link.amount)!==Number(quote.totalMinor)||link.currency!=='INR'||link.reference_id!==quote.id)throw new MarketingError('PAYMENT_RESPONSE_INVALID','Checkout response did not confirm the requested identity and amount');id=link.id;url=link.short_url;
   }
   url=checkoutDestination(url,gateway);
   await inTransaction(this.pool,actor,async c=>{await c.query("UPDATE marketing_checkout_attempts SET state='CREATED',external_id=$2,payment_url=$3,updated_at=now() WHERE id=$1",[claim.row.id,id,url]);});
   return {url,status:'AWAITING_CAPTURE'};
  }catch(e){await inTransaction(this.pool,actor,async c=>{await c.query("UPDATE marketing_checkout_attempts SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE id=$1 AND state='REQUESTED'",[claim.row.id]);});throw e;}
 }
 /** Signature verification precedes one durable insert. No payment fulfillment or provider GET on HTTP acknowledgement. */
 async ingest(provider:'STRIPE'|'RAZORPAY',raw:Buffer,signature:string,eventHeader?:string){
  if(raw.length>1024*1024)throw new MarketingError('WEBHOOK_TOO_LARGE','Webhook exceeds supported size',413);
  let payload:any,eventId:string;
  if(provider==='STRIPE'){
   if(!this.stripe||!this.options.stripeWebhookSecret)throw new MarketingError('WEBHOOK_NOT_CONFIGURED','Webhook not configured',503);
   try{payload=this.stripe.webhooks.constructEvent(raw,signature,this.options.stripeWebhookSecret);}catch{throw new MarketingError('WEBHOOK_SIGNATURE_INVALID','Invalid webhook signature',401);}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Webhook payload must be an object',422);
   if(payload.type!=='payment_intent.succeeded')return {accepted:true,ignored:true};if(typeof payload.id!=='string'||!/^evt_[a-zA-Z0-9]{3,200}$/.test(payload.id))throw new MarketingError('WEBHOOK_EVENT_ID_REQUIRED','Provider event identity is invalid',422);eventId=payload.id;
  }else{
   if(!this.options.razorpayWebhookSecret)throw new MarketingError('WEBHOOK_NOT_CONFIGURED','Webhook not configured',503);
   const expected=createHmac('sha256',this.options.razorpayWebhookSecret).update(raw).digest();if(!/^[a-f0-9]{64}$/i.test(signature)||!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new MarketingError('WEBHOOK_SIGNATURE_INVALID','Invalid webhook signature',401);
   try{payload=JSON.parse(raw.toString());}catch{throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Webhook payload is not valid JSON',422);}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Webhook payload must be an object',422);if(payload.event!=='payment_link.paid')return {accepted:true,ignored:true};
   if(!eventHeader||!/^[a-zA-Z0-9_-]{8,200}$/.test(eventHeader))throw new MarketingError('WEBHOOK_EVENT_ID_REQUIRED','Provider event identity is required',422);eventId=eventHeader;
  }
  // Keep the authenticated object identities needed for readback, not payment secrets,
  // billing details, card data or arbitrary metadata. The original hash preserves audit binding.
  const envelope=minimalPaymentEnvelope(provider,payload);
  const evidence={protocol:envelopeProtocol,provider,eventId,payload:envelope,payloadHash:fingerprint(payload),envelopeHash:fingerprint(envelope)};
  await enqueue(this.pool,{kind:'PAYMENT',key:`payment:${provider}:${eventId}`,payload:evidence});return {accepted:true};
 }
 async verifyCapture(job:unknown):Promise<VerifiedCapture>{
  const v=job as any;
  const validHash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  if(!v||!['STRIPE','RAZORPAY'].includes(v.provider)||!validHash(v.payloadHash)||
   (v.protocol===envelopeProtocol?(!validHash(v.envelopeHash)||v.envelopeHash!==fingerprint(v.payload)):(v.protocol!==undefined||v.payloadHash!==fingerprint(v.payload))))throw new MarketingError('PAYMENT_EVIDENCE_INVALID','Payment evidence is invalid');
  let quoteId:string,paymentId:string,orderId:string,amount:number,currency:string,capturedAt:string,accountId:string;
  if(v.provider==='STRIPE'){
   const event=v.payload;const data=event.data?.object;
   if(!this.stripe||event.type!=='payment_intent.succeeded'||event.id!==v.eventId||event.account&&event.account!==this.options.stripeAccountId)throw new MarketingError('PAYMENT_EVIDENCE_INVALID','Payment account or event does not match');
   const account=await this.stripe.accounts.retrieve(null);if(account.id!==this.options.stripeAccountId)throw new MarketingError('PAYMENT_ACCOUNT_MISMATCH','Payment recipient does not match');
   if(!/^pi_[a-zA-Z0-9]{3,200}$/.test(data?.id))throw new MarketingError('PAYMENT_EVIDENCE_INVALID','Payment identity is invalid');
   const payment=await this.stripe.paymentIntents.retrieve(data.id);if(payment.id!==data.id)throw new MarketingError('PAYMENT_ORDER_MISMATCH','Fetched payment identity does not match');
   if(payment.status!=='succeeded'||payment.amount_received!==payment.amount||!payment.metadata.harvo_quote_id)throw new MarketingError('PAYMENT_NOT_CAPTURED','Payment has not been captured in full');
   quoteId=payment.metadata.harvo_quote_id;paymentId=payment.id;amount=payment.amount_received;currency=payment.currency.toUpperCase();capturedAt=new Date(event.created*1000).toISOString();accountId=account.id;
   const saved=await this.checkoutByQuote(quoteId);if(saved.gateway!=='STRIPE'||!saved.external_id||BigInt(saved.amount_minor)!==BigInt(amount)||saved.currency!==currency)throw new MarketingError('PAYMENT_ORDER_MISMATCH','Payment does not match a created checkout');
   const session=await this.stripe.checkout.sessions.retrieve(saved.external_id);if(session.id!==saved.external_id||session.payment_status!=='paid'||session.payment_intent!==payment.id||session.client_reference_id!==quoteId||session.amount_total!==amount||session.currency?.toUpperCase()!==currency)throw new MarketingError('PAYMENT_ORDER_MISMATCH','Checkout payment does not match');orderId=session.id;
  }else{
   const entity=v.payload.payload?.payment_link?.entity;const paymentEntity=v.payload.payload?.payment?.entity;
   if(!this.razorpay||v.payload.account_id!==this.options.razorpayAccountId||!entity?.id||!paymentEntity?.id)throw new MarketingError('PAYMENT_ACCOUNT_MISMATCH','Razorpay payment recipient or object does not match');
   const link=await this.razorpay.paymentLink.fetch(entity.id);const payment=await this.razorpay.payments.fetch(paymentEntity.id);
   quoteId=String(link.reference_id);const saved=await this.checkoutByQuote(quoteId);
   if(saved.gateway!=='RAZORPAY'||link.id!==entity.id||payment.id!==paymentEntity.id||saved.external_id!==link.id||BigInt(saved.amount_minor)!==BigInt(payment.amount)||saved.currency!==payment.currency||link.status!=='paid'||payment.status!=='captured'||Number(link.amount_paid)!==Number(link.amount)||Number(payment.amount)!==Number(link.amount)||payment.currency!==link.currency||!(Array.isArray(link.payments)&&link.payments.some((p:any)=>p.payment_id===payment.id||p.id===payment.id)))throw new MarketingError('PAYMENT_ORDER_MISMATCH','Captured payment does not match the full payment link');
   paymentId=payment.id;orderId=link.id;amount=Number(payment.amount);currency=payment.currency;capturedAt=new Date(v.payload.created_at*1000).toISOString();accountId=this.options.razorpayAccountId!;
  }
  if(!Number.isSafeInteger(amount)||amount<=0||!['INR','USD'].includes(currency))throw new MarketingError('PAYMENT_AMOUNT_INVALID','Unsupported captured payment amount');
  return {provider:v.provider,accountId,eventId:v.eventId,paymentId,orderId,quoteId,currency:currency as 'INR'|'USD',amountMinor:String(amount),payloadHash:v.payloadHash,capturedAt};
 }
 private async checkoutByQuote(id:string){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new MarketingError('PAYMENT_QUOTE_INVALID','Payment quote identity is invalid');
  // Worker service role only: request clients cannot call this method or choose its event.
  const r=await this.pool.query('SELECT * FROM marketing_checkout_attempts WHERE quote_id=$1',[id]);if(!r.rows[0])throw new MarketingError('PAYMENT_ORDER_MISMATCH','No matching checkout exists');return r.rows[0];
 }
}
