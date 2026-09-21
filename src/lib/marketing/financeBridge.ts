import type pg from 'pg';
import {MarketingFinanceService,authorizeSpending,assertCampaignNeverSubmitted} from './financeService.js';
import {type CampaignQuote,minor,identifier} from './financeQuote.js';
import {type MarketingRuntimeConfig,calculateCampaignCosts} from './config.js';
import {MarketingError,requireRevision,fingerprint,type Actor} from './domain.js';
import {inTransaction,lockWorkflow,event} from './database.js';
import {enqueue} from './jobs.js';
import type {WorkflowFinancePort} from './workflow.js';
import type {CampaignPaymentGateway} from './payments.js';
export class WorkflowFinance implements WorkflowFinancePort{
 private markupBps:number;private preferenceVersion=0;
 constructor(private pool:pg.Pool,private config:MarketingRuntimeConfig,private gateway:CampaignPaymentGateway,private quoteProduct?: (c:pg.PoolClient,row:any)=>Promise<import("./financeQuote.js").CampaignQuoteInput["product"]>){this.markupBps=config.markupBps;}
 private service(hostId:number){return new MarketingFinanceService(this.pool,{actorContext:{id:hostId,role:'host'},validateQuote:this.quoteProduct?async(c,input)=>{const row=(await c.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1',[input.campaignId])).rows[0];if(!row||fingerprint(await this.quoteProduct!(c,row)??null)!==fingerprint(input.product??null))throw new MarketingError('POOL_QUOTE_CHANGED','The destination contribution contract changed before quoting.');}:undefined});}
 async refreshPreference(){if(!this.config.policyAdminId)return;const r=await inTransaction(this.pool,{id:this.config.policyAdminId,role:'system'},c=>c.query('SELECT version,markup_bps FROM marketing_commercial_preferences ORDER BY version DESC LIMIT 1'));if(r.rows[0]){this.markupBps=r.rows[0].markup_bps;this.preferenceVersion=Number(r.rows[0].version);}}
 policy(){return {currency:this.config.currency,markupPercent:this.markupBps/100,configured:!!this.config.financialPolicy,version:this.preferenceVersion,costItems:this.config.costRules.map(r=>({label:r.label,amountMinor:r.fixedMinor}))};}
 async quote(row:any,_key:string){
  if(!this.config.financialPolicy)throw new MarketingError('COST_POLICY_REQUIRED','Register the actual campaign cost and tax policy before quoting',503);
  if(row.listing_snapshot.currency!==this.config.currency)throw new MarketingError('CURRENCY_POLICY_MISMATCH','No configured cost policy matches this property currency');
  const service=this.service(row.host_id);
  const old=await inTransaction(this.pool,{id:row.host_id,role:'host'},async c=>(await c.query('SELECT id,snapshot FROM marketing_finance_quotes WHERE campaign_id=$1 AND revision=$2 ORDER BY created_at DESC LIMIT 1',[row.campaign_id,String(row.revision)])).rows[0]);
  if(old)return {id:old.id,snapshot:old.snapshot};
  await this.refreshPreference();const costs=calculateCampaignCosts(this.config,row.provider,row.draft.mediaBudgetMinor,this.markupBps);
  const product=this.quoteProduct?await inTransaction(this.pool,{id:row.host_id,role:'host'},c=>this.quoteProduct!(c,row)):undefined;
  const quote=await service.quote({...product?{product}:{},campaignId:row.campaign_id,hostId:row.host_id,listingId:row.listing_id,campaignRevision:String(row.revision),...costs,markupBps:this.markupBps,idempotencyKey:`campaign-quote:${row.campaign_id}:${row.revision}`,expiresAt:new Date(new Date(row.updated_at).getTime()+24*3600000).toISOString()},this.config.financialPolicy);
  return {id:quote.id,snapshot:quote};
 }
 async snapshot(row:any){return (await this.snapshots([row],{id:row.host_id,role:'host'})).get(row.campaign_id)!;}
 /** One bounded financial read for the workspace; identifiers and tenant scope are bound parameters. */
 async snapshots(rows:any[],actor:Actor):Promise<Map<number,any>>{
  if(!Number.isSafeInteger(actor.id)||actor.id<=0||!['host','admin','system'].includes(actor.role)||rows.length>100||new Set(rows.map(r=>r.campaign_id)).size!==rows.length||rows.some(r=>!Number.isSafeInteger(r.campaign_id)||!Number.isSafeInteger(r.host_id)||r.campaign_id<=0||r.host_id<=0||(actor.role==='host'&&r.host_id!==actor.id)))throw new MarketingError('FINANCE_SCOPE_INVALID','Financial projection must use authenticated, distinct campaign ownership',403);
  const output=new Map<number,any>(rows.map(row=>[row.campaign_id,{quote:null,funding:{status:'UNFUNDED',capturedMinor:null,reservedMinor:null,refundableMinor:'0',pendingRefundMinor:'0',refundedMinor:'0',released:false}}]));
  const quoted=rows.filter(row=>row.quote_id);if(!quoted.length)return output;
  const records=await inTransaction(this.pool,actor,c=>this.readFinancialRecords(c,quoted));
  for(const record of records)output.set(record.campaign_id,this.projectFinancialRecord(record));
  return output;
 }
 private async readFinancialRecords(c:pg.PoolClient,quoted:any[]){
  return (await c.query(`
   WITH requested AS(SELECT * FROM unnest($1::int[],$2::int[],$3::uuid[]) AS v(campaign_id,host_id,quote_id)),
   selected_quotes AS(SELECT q.* FROM marketing_finance_quotes q JOIN requested x ON x.quote_id=q.id AND x.campaign_id=q.campaign_id AND x.host_id=q.host_id),
   captured AS(SELECT p.quote_id,sum(p.amount_minor)::text AS captured_minor,
      sum(p.amount_minor) FILTER(WHERE p.captured_at<=q.expires_at)::text AS accepted_captured_minor,
      max(p.amount_minor-COALESCE((SELECT sum(f.amount_minor) FROM marketing_finance_refunds f WHERE f.capture_id=p.id AND f.status IN ('REQUESTED','SUCCEEDED')),0))::text AS max_capture_remaining_minor
      FROM marketing_finance_captures p JOIN selected_quotes q ON q.id=p.quote_id GROUP BY p.quote_id),
   refunded AS(SELECT p.quote_id,
      COALESCE(sum(f.amount_minor) FILTER(WHERE f.status='REQUESTED'),0)::text AS pending_refund_minor,
      COALESCE(sum(f.amount_minor) FILTER(WHERE f.status='SUCCEEDED'),0)::text AS refunded_minor
      FROM marketing_finance_refunds f JOIN marketing_finance_captures p ON p.id=f.capture_id JOIN selected_quotes q ON q.id=p.quote_id GROUP BY p.quote_id)
   SELECT q.campaign_id,q.snapshot,q.expires_at,r.id AS reservation_id,r.remaining_minor,r.status AS reservation_status,r.total_minor AS reserved_total_minor,r.settlement_snapshot,
      r.risk_release_at,a.risk_release_at AS account_release_at,a.available_minor,a.frozen,
      p.captured_minor,p.accepted_captured_minor,p.max_capture_remaining_minor,f.pending_refund_minor,f.refunded_minor
      FROM selected_quotes q LEFT JOIN marketing_finance_reservations r ON r.quote_id=q.id
      LEFT JOIN marketing_finance_accounts a ON a.host_id=q.host_id AND a.currency=q.currency
      LEFT JOIN captured p ON p.quote_id=q.id LEFT JOIN refunded f ON f.quote_id=q.id`,
   [quoted.map(r=>r.campaign_id),quoted.map(r=>r.host_id),quoted.map(r=>r.quote_id)])).rows;
 }
 private projectFinancialRecord(q:any){
  const s=q.snapshot as CampaignQuote,total=BigInt(s.totalMinor);
  const captured=BigInt(q.captured_minor||'0'),pending=BigInt(q.pending_refund_minor||'0'),refunded=BigInt(q.refunded_minor||'0');
  const accepted=BigInt(q.accepted_captured_minor||'0')-pending-refunded;
  const closed=!!q.reservation_status&&q.reservation_status!=='RESERVED';
  const settledCharge=closed?BigInt(q.reserved_total_minor||'0')-BigInt(q.settlement_snapshot?.returnedMinor||'0'):0n;
  const refundable=q.reservation_status==='RESERVED'?0n:[captured-pending-refunded-settledCharge,BigInt(q.available_minor||'0'),BigInt(q.max_capture_remaining_minor||'0')].reduce((a,b)=>a<b?a:b);
  const reserved=q.reservation_status==='RESERVED'&&BigInt(q.remaining_minor||'0')>=total;
  const available=accepted>=total&&BigInt(q.available_minor||'0')>=total;
  const riskTime=new Date(q.risk_release_at||q.account_release_at||'').getTime();
  const riskReleased=Number.isFinite(riskTime)&&riskTime<=Date.now();
  const released=!q.frozen&&!closed&&(reserved||available)&&riskReleased;
  const status=q.frozen?'REVIEW_REQUIRED':closed?q.reservation_status:reserved?(riskReleased?'RESERVED':'RISK_HOLD'):
    pending>0n?'REFUND_PENDING':refunded>0n&&accepted<total?(captured<=refunded?'REFUNDED':'PARTIALLY_REFUNDED'):
    captured===0n?'AWAITING_CAPTURE':!available?'INSUFFICIENT_AVAILABLE_FUNDS':!riskReleased?'RISK_HOLD':'CAPTURED';
  return {quote:{costMinor:s.costMinor,markupPercent:s.markupBps/100,profitMinor:s.profitMinor,totalMinor:s.totalMinor,currency:s.currency,
    status:new Date(q.expires_at).getTime()<=Date.now()&&!reserved&&accepted<total?'EXPIRED':'LOCKED',
    lines:[...s.costs.map(l=>({label:this.config.costRules.find(r=>r.code===l.code)?.label||l.code.replaceAll('_',' '),amountMinor:l.amountMinor})),{label:'Profit on campaign costs',amountMinor:s.profitMinor},{label:'Statutory remittance tax',amountMinor:s.remittanceTaxMinor}]},
   funding:{status,capturedMinor:q.captured_minor??null,reservedMinor:q.remaining_minor??null,refundableMinor:(refundable>0n?refundable:0n).toString(),pendingRefundMinor:pending.toString(),refundedMinor:refunded.toString(),released}};
 }
 async requestRefund(row:any,actor:Actor,amountMinor:string,key:string,reason?:string){
  const amount=minor(amountMinor,'refund amount',true);identifier(key,'refund request key');
  const normalizedReason=reason===undefined?null:reason.trim();
  if(normalizedReason!==null&&(normalizedReason.length<10||normalizedReason.length>2000))throw new MarketingError('REFUND_REASON_REQUIRED','Record a refund reason of 10–2000 characters',422);
  return inTransaction(this.pool,actor,async c=>{
    const current=await lockWorkflow(c,row.campaign_id,actor);requireRevision(current,row.revision);
    if(!current.quote_id||current.quote_id!==row.quote_id)throw new MarketingError('REFUND_QUOTE_REQUIRED','Refund requires the unchanged campaign funding quote');
    const idempotencyKey=`campaign-refund:${current.campaign_id}:${key}`;
    const prior=(await c.query(`SELECT f.*,p.quote_id FROM marketing_finance_refunds f JOIN marketing_finance_captures p ON p.id=f.capture_id WHERE f.idempotency_key=$1`,[idempotencyKey])).rows[0];
    let result:{refundRequestId:string;status:string;idempotent:boolean};
    if(prior){
      if(prior.quote_id!==current.quote_id||prior.host_id!==current.host_id||BigInt(prior.amount_minor)!==amount)throw new MarketingError('IDEMPOTENCY_CONFLICT','Refund request key is already bound to different funding or amount');
      const audit=(await c.query("SELECT evidence FROM marketing_workflow_events WHERE campaign_id=$1 AND event_type='CAMPAIGN_REFUND_REQUESTED' AND evidence->>'refundRequestId'=$2 ORDER BY id LIMIT 1",[current.campaign_id,prior.id])).rows[0];
      if((audit?.evidence.reason??null)!==normalizedReason)throw new MarketingError('IDEMPOTENCY_CONFLICT','Refund request key is already bound to a different recorded reason');
      result={refundRequestId:prior.id,status:prior.status,idempotent:true};
    }else{
      const financial=(await this.readFinancialRecords(c,[current]))[0];
      if(!financial||amount>BigInt(this.projectFinancialRecord(financial).funding.refundableMinor))throw new MarketingError('REFUND_FUNDS_UNAVAILABLE','Only verified unused and unreserved original-payment funds are available to refund');
      const capture=(await c.query(`SELECT p.id FROM marketing_finance_captures p WHERE p.quote_id=$1 AND p.host_id=$2 AND
        p.amount_minor-COALESCE((SELECT sum(f.amount_minor) FROM marketing_finance_refunds f WHERE f.capture_id=p.id AND f.status IN ('REQUESTED','SUCCEEDED')),0)>=$3
        ORDER BY p.created_at,p.id LIMIT 1`,[current.quote_id,current.host_id,amount.toString()])).rows[0];
      if(!capture)throw new MarketingError('REFUND_FUNDS_UNAVAILABLE','No original captured payment covers this refund request');
      result=await this.service(current.host_id).requestRefundInTransaction(c,{captureId:capture.id,hostId:current.host_id,amountMinor:amount.toString(),idempotencyKey});
    }
    if(result.status==='REQUESTED')await enqueue(c,{campaignId:current.campaign_id,revision:current.revision,kind:'REFUND',key:`refund:${result.refundRequestId}`,payload:{refundRequestId:result.refundRequestId}});
    if(!result.idempotent)await event(c,current,actor,'CAMPAIGN_REFUND_REQUESTED',{refundRequestId:result.refundRequestId,amountMinor:amount.toString(),reason:normalizedReason});
    return result;
  });
 }
 async cancelBeforeProvider(row:any,actor:Actor,key:string,reason:string){
  identifier(key,'cancellation request key');
  const normalizedReason=typeof reason==='string'?reason.trim():'';
  if(normalizedReason.length<10||normalizedReason.length>2000)throw new MarketingError('CANCELLATION_REASON_REQUIRED','Record a cancellation reason of 10–2000 characters',422);
  return inTransaction(this.pool,actor,async c=>{
    const current=await lockWorkflow(c,row.campaign_id,actor);requireRevision(current,row.revision);
    const prior=(await c.query("SELECT evidence FROM marketing_workflow_events WHERE campaign_id=$1 AND event_type='CAMPAIGN_CANCELLED_BEFORE_PROVIDER' ORDER BY id LIMIT 1",[current.campaign_id])).rows[0];
    if(prior){
      if(current.state!=='CANCELLED'||prior.evidence.key!==key||prior.evidence.reason!==normalizedReason||prior.evidence.revision!==current.revision)throw new MarketingError('IDEMPOTENCY_CONFLICT','Cancellation is already bound to another request or reason');
      return current;
    }
    if(current.state==='CANCELLED')throw new MarketingError('CANCELLATION_REVIEW_REQUIRED','This cancellation has no matching immutable evidence');
    await assertCampaignNeverSubmitted(c,{campaignId:current.campaign_id,hostId:current.host_id,revision:current.revision});
    let returnedMinor='0';
    if(current.reservation_id){
      const released=await this.service(current.host_id).releaseBeforeProviderInTransaction(c,{campaignId:current.campaign_id,hostId:current.host_id,revision:current.revision,reservationId:current.reservation_id,idempotencyKey:`cancel:${current.campaign_id}:${key}`,reason:normalizedReason});
      returnedMinor=released.returnedMinor;
    }else if((await c.query('SELECT id FROM marketing_finance_reservations WHERE campaign_id=$1 LIMIT 1',[current.campaign_id])).rows.length){
      throw new MarketingError('CANCELLATION_REVIEW_REQUIRED','Unlinked financial reservation requires review before cancellation');
    }
    // Fencing invalidates any worker that read the old queued revision before these locks.
    await c.query("UPDATE marketing_jobs SET state='DEAD',fence=fence+1,lease_until=NULL,last_error='CAMPAIGN_CANCELLED_BEFORE_PROVIDER',updated_at=now() WHERE campaign_id=$1 AND kind='PUBLISH' AND state<>'SUCCEEDED'",[current.campaign_id]);
    const cancelled=(await c.query("UPDATE marketing_campaign_workflows SET state='CANCELLED',pending_job_id=NULL,last_error=NULL,updated_at=now() WHERE campaign_id=$1 RETURNING *",[current.campaign_id])).rows[0];
    await event(c,current,actor,'CAMPAIGN_CANCELLED_BEFORE_PROVIDER',{key,reason:normalizedReason,revision:current.revision,reservationId:current.reservation_id,returnedMinor,basis:'NO_PROVIDER_SUBMISSION'});
    return cancelled;
  });
 }
 async reserve(row:any,_key:string){if(!row.quote_id)throw new MarketingError('QUOTE_REQUIRED','A captured funding quote is required');const result=await this.service(row.host_id).reserve({quoteId:row.quote_id,hostId:row.host_id,idempotencyKey:`reservation:${row.campaign_id}:${row.revision}`});return {id:result.reservationId};}
 async reserveLocked(c:pg.PoolClient,row:any,_key:string){if(!row.quote_id)throw new MarketingError('QUOTE_REQUIRED','A captured quote is required');const result=await this.service(row.host_id).reserveInTransaction(c,{quoteId:row.quote_id,hostId:row.host_id,idempotencyKey:`reservation:${row.campaign_id}:${row.revision}`});return {id:result.reservationId};}
 async authorize(c:pg.PoolClient,row:any,operation:'CREATE_HIERARCHY'|'RESUME'|'UPDATE_BUDGET',amountMinor?:number){
  if(!row.reservation_id)throw new MarketingError('RESERVATION_REQUIRED','Reserve captured campaign funds before publication');
  const reservation=(await c.query('SELECT * FROM marketing_finance_reservations WHERE id=$1 AND campaign_id=$2 AND host_id=$3',[row.reservation_id,row.campaign_id,row.host_id])).rows[0];
  const account=(await c.query('SELECT frozen FROM marketing_finance_accounts WHERE host_id=$1 AND currency=$2',[row.host_id,reservation?.currency])).rows[0];
  if(!reservation||reservation.status!=='RESERVED'||reservation.revision!==String(row.revision)||account?.frozen)throw new MarketingError('FUNDING_REVIEW_REQUIRED','Funding reservation is invalid or requires review');
  if(operation!=='CREATE_HIERARCHY'&&new Date(reservation.risk_release_at).getTime()>Date.now())throw new MarketingError('RISK_HOLD','Captured funds are still in the 24-hour risk hold');
  if(amountMinor!==undefined&&BigInt(amountMinor)>BigInt(row.draft.mediaBudgetMinor))throw new MarketingError('BUDGET_EXCEEDS_AUTHORIZATION','Requested budget exceeds the immutable campaign allocation');
  // Creation is PAUSED. Spend authorization is issued only when activating, after risk release.
  if(operation!=='CREATE_HIERARCHY'){
   const accountId=row.provider==='GOOGLE'?process.env.GOOGLE_ADS_CUSTOMER_ID?.replaceAll('-',''):process.env.META_AD_ACCOUNT_ID?.replace(/^act_/,'');
   if(!accountId)throw new MarketingError('PROVIDER_ACCOUNT_REQUIRED','A configured provider account is required');
   await authorizeSpending(c,{reservationId:row.reservation_id,campaignId:row.campaign_id,hostId:row.host_id,revision:String(row.revision),provider:row.provider,accountId,amountMinor:row.draft.mediaBudgetMinor,idempotencyKey:`spend:${row.campaign_id}:${row.revision}:${row.provider}`});
  }
 }
 async fund(row:any,_key:string){const quote=await inTransaction(this.pool,{id:row.host_id,role:'host'},async c=>{const current=await lockWorkflow(c,row.campaign_id,{id:row.host_id,role:'host'});requireRevision(current,row.revision);if(this.quoteProduct)await this.quoteProduct(c,current);return (await c.query('SELECT id,snapshot,expires_at FROM marketing_finance_quotes WHERE id=$1 AND host_id=$2',[row.quote_id,row.host_id])).rows[0];});if(!quote)throw new MarketingError('QUOTE_REQUIRED','A current funding quote is required');if(new Date(quote.expires_at).getTime()<=Date.now())throw new MarketingError('QUOTE_EXPIRED','This funding quote expired. A new approved campaign quote is required.');return this.gateway.checkout(row,{...quote.snapshot,id:quote.id});}
 async setMarkup(actorId:number,input:{markupPercent:number;expectedVersion:number;reason:string}){
  if(!Number.isFinite(input.markupPercent)||input.markupPercent<3||input.markupPercent>5||Math.round(input.markupPercent*100)!==input.markupPercent*100||!Number.isInteger(input.expectedVersion)||!input.reason||input.reason.trim().length<10)throw new MarketingError('POLICY_INPUT_INVALID','Choose 3–5% profit markup and record why the prospective policy changes',422);
  await inTransaction(this.pool,{id:actorId,role:'admin'},async c=>{await c.query('SELECT pg_advisory_xact_lock(7824,0)');const current=(await c.query('SELECT version FROM marketing_commercial_preferences ORDER BY version DESC LIMIT 1')).rows[0];if(Number(current?.version||0)!==input.expectedVersion)throw new MarketingError('POLICY_VERSION_CONFLICT','Markup policy changed. Reload before editing.');await c.query('INSERT INTO marketing_commercial_preferences(markup_bps,actor_id,reason) VALUES($1,$2,$3)',[Math.round(input.markupPercent*100),actorId,input.reason.trim()]);});await this.refreshPreference();return this.policy();
 }
}
