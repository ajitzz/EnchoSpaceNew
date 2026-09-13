import type pg from 'pg';
import {GoogleAdsClient} from '../providers/google/GoogleAdsClient.js';
import {GoogleAdsProvider} from '../providers/google/GoogleAdsProvider.js';
import {MetaAdsClient} from '../providers/meta/MetaAdsClient.js';
import {MetaAdProvider} from '../providers/meta/MetaAdProvider.js';
import type {AdProvider} from '../providers/AdProvider.js';
import type {ProviderPublishRequest} from '../providers/types.js';
import type {ProviderAuthorizationGuard,ProviderMediaVerifier} from '../providers/ProviderOperationStore.js';
import {MarketingFinanceService} from './financeService.js';
import {MarketingWorkflowService} from './workflow.js';
import {MarketingJobQueue,type MarketingJob,enqueue} from './jobs.js';
import {MarketingError,publicOrigin} from './domain.js';
import {inTransaction,lockWorkflow,event,actorPool} from './database.js';
import {type MarketingRuntimeConfig} from './config.js';
import {CampaignPaymentGateway} from './payments.js';
import type {CampaignRefundGateway} from './refunds.js';
import {assertMarketableInventory,assessBudgetProtection} from './protection.js';

export class MarketingEngine{
 readonly queue:MarketingJobQueue;private running=false;
 constructor(private pool:pg.Pool,private workflow:MarketingWorkflowService,private config:MarketingRuntimeConfig,private payments:CampaignPaymentGateway,private providerFactory?:(row:any,authorize:ProviderAuthorizationGuard)=>AdProvider,private refunds?:CampaignRefundGateway){this.queue=new MarketingJobQueue(pool);}
 private request(row:any,job:MarketingJob):ProviderPublishRequest{
  const draft=row.draft;if(row.provider==='META'&&draft.locations.some((country:string)=>!this.config.meta.countries.includes(country)))throw new MarketingError('TARGETING_NOT_ENABLED','Selected Meta countries are not enabled by the operator policy');const source=row.listing_snapshot.media.find((m:any)=>m.id===draft.mediaIds[0]);if(!source)throw new MarketingError('ASSET_MISSING','Approved campaign asset is missing');const creative=row.listing_snapshot.campaignCreative;const asset=creative?{...source,url:creative.url}:source;if(draft.creativeDerivativeId&&(!creative||creative.derivativeId!==draft.creativeDerivativeId||creative.manifestHash!==draft.creativeManifestHash))throw new MarketingError('CREATIVE_EVIDENCE_MISMATCH','The queued image variant does not match the reviewed campaign revision.');
  if(row.provider==='GOOGLE'&&!draft.googleSearch)throw new MarketingError('SEARCH_CONFIGURATION_REQUIRED','Explicit Search keywords, locations, language and responsive text are required');
  return {campaignId:row.campaign_id,hostId:row.host_id,listingId:row.listing_id,title:draft.title,objective:'BOOKINGS',budget:{currency:row.listing_snapshot.currency,minor_units:Number(draft.mediaBudgetMinor)},startTime:row.provider==='GOOGLE'?draft.startDate:`${draft.startDate}T00:00:00Z`,endTime:row.provider==='GOOGLE'?draft.endDate:`${draft.endDate}T23:59:59Z`,targetAudience:{locations:draft.locations},creativeAssets:{headline:draft.headline,description:draft.description,primaryText:draft.description,mediaUrl:asset.url,mediaType:asset.type,callToAction:'BOOK_NOW',landingPageUrl:`${publicOrigin(this.config.origin)}/stay/${row.listing_snapshot.slug}`},idempotencyKey:job.dedupe_key,correlationId:job.id,metadata:{providerProtocol:'HARVO_V2',revision:row.revision,listingHash:row.listing_hash,...row.provider==='GOOGLE'?{googleSearch:{...draft.googleSearch,version:1,budgetMode:'CAMPAIGN_TOTAL',dailyBudgetMinor:Number(draft.dailyBudgetMinor),bidding:'MAXIMIZE_CONVERSIONS',containsEuPoliticalAdvertising:'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'}}:{metaWebsite:{version:1,...this.config.meta,countries:draft.locations,...(asset.type==='VIDEO'?{thumbnailUrl:row.listing_snapshot.media.find((m:any)=>m.type==='IMAGE'&&draft.mediaIds.includes(m.id))?.url}:{})}}}};
 }
 private provider(row:any,job:MarketingJob){
  const guard:ProviderAuthorizationGuard=async(context,c)=>{
   const current=await lockWorkflow(c,row.campaign_id,{id:row.host_id,role:'system'});await this.queue.assertFence(c,job);
   if(current.revision!==job.revision||context.campaignId!==current.campaign_id||context.provider!==current.provider||context.idempotencyKey!==job.dedupe_key)throw new MarketingError('PROVIDER_REQUEST_CONFLICT','Provider request is not bound to this queued revision');
   const expected=context.operation==='CREATE_HIERARCHY'?'PUBLISH_QUEUED':context.operation==='PAUSE'?'PAUSE_QUEUED':context.operation==='RESUME'?'ACTIVATION_QUEUED':null;
   if(!expected||current.state!==expected||current.pending_job_id!==job.id)throw new MarketingError('STATE_CONFLICT','Provider operation is not authorized by the workflow state');
   if(context.operation!=='PAUSE'){
    if(context.operation==='CREATE_HIERARCHY'&&!this.config.publishingEnabled)throw new MarketingError('PUBLISH_NOT_CONFIGURED','Provider publishing is disabled');
    if(!this.config.providerClearance[current.provider as 'GOOGLE'|'META'])throw new MarketingError('PROVIDER_CLEARANCE_REQUIRED','Provider account and advertiser classification clearance is required');
    if(current.content_approval.status!=='APPROVED'||current.content_approval.revision!==current.revision)throw new MarketingError('CONTENT_APPROVAL_REQUIRED','Current revision approval is required');
    await this.workflow.assertCurrentListing(c,current,{id:row.host_id,role:'system'});
    await this.workflow.options.finance.authorize(c,current,context.operation,context.budgetMinor);
    if(context.operation==='RESUME'){
     if(this.workflow.options.activationBlockers?.(current.provider).length)throw new MarketingError('CONVERSION_AUTHORITY_REQUIRED','Accepted canonical booking and consent conversion authority is required for this provider.');
     if(!this.config.activationEnabled||!this.config.checkoutAcceptanceReference)throw new MarketingError('ACTIVATION_NOT_CLEARED','Live advertising and verified booking checkout must be cleared');
     await assertMarketableInventory(c,row.listing_id,current.draft);
     if(Date.parse(current.draft.endDate+'T23:59:59Z')<=Date.now())throw new MarketingError('CAMPAIGN_ENDED','Advertising flight has ended');
     // Search total-budget campaigns require at least three inclusive calendar days.
     if(current.provider==='GOOGLE'&&(Date.parse(current.draft.endDate)-Date.parse(current.draft.startDate))/86400000<2)throw new MarketingError('GOOGLE_FLIGHT_TOO_SHORT','Google total-budget campaigns require at least three inclusive calendar days');
    }
   }
   return {authorizationId:context.operation==='PAUSE'?job.id:current.reservation_id};
  };
  const verifyCampaignMedia:ProviderMediaVerifier=async(context,identity,c)=>{
   const current=await lockWorkflow(c,context.campaignId,{id:row.host_id,role:'system'});
   if(context.operation!=='CREATE_HIERARCHY'||context.provider!=='META'||!current.draft.creativeDerivativeId||current.host_id!==identity.hostId||current.listing_id!==identity.listingId)throw new MarketingError('CREATIVE_EVIDENCE_MISMATCH','An exact reviewed campaign image variant is required.');
   await this.workflow.assertCurrentListing(c,current,{id:row.host_id,role:'system'});
   const creative=current.listing_snapshot.campaignCreative;
   if(!creative||creative.url!==identity.mediaUrl)throw new MarketingError('CREATIVE_EVIDENCE_MISMATCH','The provider image differs from the reviewed campaign variant.');
   return {mediaUrl:creative.url};
  };
  return this.providerFactory?.(row,guard)||(row.provider==='GOOGLE'?new GoogleAdsProvider(new GoogleAdsClient(),{publicOrigin:this.config.origin,authorize:guard}):new MetaAdProvider(new MetaAdsClient(),{publicOrigin:this.config.origin,authorize:guard,verifyCampaignMedia}));
 }
 async runOnce(){if(this.running)return false;this.running=true;let job:MarketingJob|null=null;let timer:ReturnType<typeof setInterval>|undefined;
  try{job=await this.queue.claim();if(!job)return false;const active=job;timer=setInterval(()=>{void this.queue.heartbeat(active).catch(()=>{ /* final transaction independently rejects the stale fence */ });},30000);
   await this.process(job);await this.queue.complete(job);return true;
  }catch(error){if(job){const code=(error as any)?.code||'JOB_FAILED';
   if(code==='META_ASSET_PROCESSING'&&job.kind==='PUBLISH'){await this.pool.query("UPDATE marketing_jobs SET state='RETRY',run_after=now()+interval '60 seconds',lease_until=NULL,last_error=$3 WHERE id=$1 AND fence=$2 AND state='RUNNING'",[job.id,job.fence,code]);return false;}
   await this.queue.fail(job,code,!!(error as any)?.unknownOutcome||code==='REFUND_RECONCILIATION_REQUIRED');if(job.campaign_id){const actor={id:this.config.policyAdminId!,role:'system' as const};await inTransaction(this.pool,actor,async c=>{const row=await lockWorkflow(c,job!.campaign_id!,actor);
      const currentJob=(await c.query('SELECT fence FROM marketing_jobs WHERE id=$1',[job!.id])).rows[0];if(String(currentJob?.fence)!==String(job!.fence)||row.revision!==job!.revision)return;
      if(['TELEMETRY','PROTECTION'].includes(job!.kind)&&['LIVE','PROVIDER_REVIEW'].includes(row.state)&&row.provider_truth?.externalCampaignId){const pauseId=await enqueue(c,{campaignId:row.campaign_id,revision:row.revision,kind:'PAUSE',key:`stale-report:${job!.id}`,payload:{reason:'PROVIDER_OBSERVATION_UNAVAILABLE'}});await c.query("UPDATE marketing_campaign_workflows SET state='PAUSE_QUEUED',pending_job_id=$2,last_error='PROVIDER_OBSERVATION_UNAVAILABLE',updated_at=now() WHERE campaign_id=$1",[row.campaign_id,pauseId]);}
      const queued=['PUBLISH','ACTIVATE','PAUSE'].includes(job!.kind)&&row.pending_job_id===job!.id&&['PUBLISH_QUEUED','ACTIVATION_QUEUED','PAUSE_QUEUED'].includes(row.state);if(queued)await c.query("UPDATE marketing_campaign_workflows SET state='RECONCILIATION_REQUIRED',last_error=$2,updated_at=now() WHERE campaign_id=$1",[row.campaign_id,code]);await event(c,row,actor,'WORKER_OPERATION_FAILED',{jobId:job!.id,code});});}console.error(JSON.stringify({event:'HARVO_JOB_FAILED',jobId:job.id,kind:job.kind,code}));}return false;
  }finally{if(timer)clearInterval(timer);this.running=false;}
 }
 private async process(job:MarketingJob){
  if(!this.config.policyAdminId)throw new MarketingError('SERVICE_ACTOR_REQUIRED','A configured audited service actor is required');
  const system={id:this.config.policyAdminId,role:'system' as const};
  if(job.kind==='REFUND'){
   if(!this.refunds)throw new MarketingError('REFUND_NOT_CONFIGURED','Original-payment refund processing is not configured',503);
   const result=await this.refunds.dispatch(String(job.payload.refundRequestId||''),c=>this.queue.assertFence(c,job));
   if(result.status==='RECONCILIATION_REQUIRED')throw new MarketingError('REFUND_RECONCILIATION_REQUIRED','Refund outcome needs provider reconciliation');
   if(result.status==='PENDING')throw new MarketingError('REFUND_PENDING','Provider refund is pending; only its existing identity may be read again');
   return;
  }
  if(job.kind==='META_EVENT'){
   const ids=new Set<string>();const allowedEntries=new Set([process.env.META_AD_ACCOUNT_ID?.replace(/^act_/,''),process.env.META_PAGE_ID].filter(Boolean));
   for(const entry of (job.payload.entry as any[]||[])){if(!allowedEntries.has(String(entry.id)))continue;for(const change of entry.changes||[]){for(const field of ['ad_id','adset_id','campaign_id']){const id=String(change.value?.[field]||'');if(/^[1-9]\d{0,29}$/.test(id))ids.add(id);}}}
   if(ids.size)await inTransaction(this.pool,system,async c=>{await this.queue.assertFence(c,job);const rows=(await c.query("SELECT DISTINCT w.campaign_id,w.revision FROM marketing_campaign_workflows w JOIN provider_entities e ON e.campaign_id=w.campaign_id WHERE w.provider='META' AND e.provider='META' AND e.external_id=ANY($1::text[])",[[...ids]])).rows;for(const row of rows)await enqueue(c,{campaignId:row.campaign_id,revision:row.revision,kind:'TELEMETRY',key:`meta-refresh:${job.id}:${row.campaign_id}`});});
   return;
  }
  if(job.kind==='PAYMENT'){
   const captured=await this.payments.verifyCapture(job.payload);
   const finance=new MarketingFinanceService(this.pool,{actorContext:system,fundingEnabled:true,verifyCapture:async()=>captured});
   const result=await finance.recordVerifiedCapture(job.payload);
   await inTransaction(this.pool,system,async c=>{await this.queue.assertFence(c,job);const row=(await c.query('SELECT * FROM marketing_campaign_workflows WHERE quote_id=$1 FOR UPDATE',[captured.quoteId])).rows[0];if(row){if((result as any).requiresReview)await c.query("UPDATE marketing_campaign_workflows SET last_error='CAPTURE_REQUIRES_REVIEW',updated_at=now() WHERE campaign_id=$1",[row.campaign_id]);await event(c,row,system,'PAYMENT_CAPTURE_VERIFIED',{captureId:result.captureId,requiresReview:!!(result as any).requiresReview});}});return;
  }
  if(!job.campaign_id)throw new MarketingError('CAMPAIGN_REQUIRED','Job must be bound to a campaign');
  const row=await this.workflow.get(job.campaign_id,system);if(row.revision!==job.revision)throw new MarketingError('REVISION_CONFLICT','Queued revision is obsolete');
  const scoped=actorPool(this.pool,{id:row.host_id,role:'system'});const provider=this.provider(row,job);
  if(job.kind==='PUBLISH'){
   if(row.draft.creativeDerivativeId){
    if(!this.workflow.options.verifyCreativeForPublishing)throw new MarketingError('CREATIVE_NOT_CONFIGURED','The reviewed creative delivery verifier is unavailable.',503);
    await this.workflow.options.verifyCreativeForPublishing(row,system);
   }
   // Compatibility ceiling for the M1 Google store; this is not a revenue or capture snapshot.
   await inTransaction(this.pool,system,async c=>{const current=await lockWorkflow(c,row.campaign_id,system);await this.queue.assertFence(c,job);await this.workflow.options.finance.authorize(c,current,'CREATE_HIERARCHY');await c.query(`INSERT INTO campaign_financial_contracts(campaign_id,gross_host_charge,encho_fee_amount,meta_authorized_spend,meta_remaining_authorization,currency) VALUES($1,$2,0,$2,$2,$3) ON CONFLICT(campaign_id) DO NOTHING`,[row.campaign_id,row.draft.mediaBudgetMinor,row.listing_snapshot.currency]);});
   const result=await provider.createCampaignHierarchy(this.request(row,job),scoped);
   if(!result.success)throw new MarketingError(result.error?.code||'PROVIDER_PUBLISH_FAILED',result.error?.message||'Provider creation could not be verified');
   await this.record(job,row,'PROVIDER_PAUSED',{configuredStatus:'PAUSED',observedStatus:'PAUSED',observedAt:new Date().toISOString(),externalCampaignId:result.externalCampaignId,deliveryConfirmed:false},'PROVIDER_PAUSED_CREATION_VERIFIED');return;
  }
  if(job.kind==='ACTIVATE'||job.kind==='PAUSE'){
   if(!row.provider_truth?.externalCampaignId)throw new MarketingError('PROVIDER_ID_MISSING','No verified provider campaign identity exists');
   const request={campaignId:row.campaign_id,externalCampaignId:row.provider_truth.externalCampaignId,action:job.kind==='PAUSE'?'PAUSE' as const:'RESUME' as const,reason:'HARVO revision-bound workflow',actorType:'system' as const,actorId:row.host_id,idempotencyKey:job.dedupe_key,correlationId:job.id};
   const result=await (job.kind==='PAUSE'?provider.pauseCampaign(request,scoped):provider.resumeCampaign(request,scoped));if(!result.success)throw new MarketingError(result.error?.code||'PROVIDER_CONTROL_FAILED',result.error?.message||'Provider control was not verified');
   await this.record(job,row,job.kind==='PAUSE'?'PAUSED':'PROVIDER_REVIEW',{configuredStatus:result.newStatus,observedStatus:result.normalizedDeliveryState,observedAt:result.modifiedAt,externalCampaignId:result.externalCampaignId,deliveryConfirmed:false},'PROVIDER_CONTROL_OBSERVED');return;
  }
  if(job.kind==='TELEMETRY'||job.kind==='PROTECTION'){
   if(!row.provider_truth?.externalCampaignId)return;
   // Local inventory/price authority must not wait behind a slow provider report.
   if(await this.protectBeforeObservation(job,system))return;
   const externalId=row.provider_truth.externalCampaignId;
   const truth=await provider.fetchAuthoritativeDeliveryTruth(externalId,scoped);
   const snapshot=await provider.fetchTelemetrySnapshot(externalId,{startDate:row.draft.startDate,endDate:new Date().toISOString().slice(0,10)},scoped);
   if(snapshot.spend.currency!==row.listing_snapshot.currency)throw new MarketingError('TELEMETRY_CURRENCY_MISMATCH','Provider report currency differs from the campaign');
   const protection=assessBudgetProtection({provider:row.provider,authorizedMinor:row.draft.mediaBudgetMinor,spentMinor:String(snapshot.spend.minor_units),dailyBudgetMinor:row.draft.dailyBudgetMinor,observedAt:snapshot.observedAt});
   await inTransaction(this.pool,system,async c=>{const current=await lockWorkflow(c,row.campaign_id,system);await this.queue.assertFence(c,job);if(current.revision!==job.revision)throw new MarketingError('REVISION_CONFLICT','Telemetry revision changed');
    let reasons=protection.reasons;try{await this.workflow.assertCurrentListing(c,current,system);await assertMarketableInventory(c,current.listing_id,current.draft);}catch(e){reasons=[...reasons,(e as any).code||'PROPERTY_REVIEW_REQUIRED'];}
    const configured=row.provider_truth.configuredStatus;
    const observed={configuredStatus:configured,observedStatus:truth.normalizedState,observedAt:truth.lastObservedAt,externalCampaignId:externalId,deliveryConfirmed:truth.isLive&&truth.isServingImpressions};
    const telemetry={impressions:snapshot.impressions,clicks:snapshot.clicks,ctr:snapshot.impressions>0?snapshot.ctr:null,spendMinor:String(snapshot.spend.minor_units),leads:null,bookings:null,providerAttributedConversions:snapshot.providerMetadata?.conversionDataAvailable===false?null:snapshot.conversions,observedAt:snapshot.observedAt,dataAsOf:snapshot.providerMetadata?.dataAsOf??null,source:row.provider,freshness:snapshot.dataFreshness,dateStart:snapshot.dateStart,dateEnd:snapshot.dateEnd};
    await c.query('UPDATE marketing_campaign_workflows SET provider_truth=$2,telemetry=$3,last_error=NULL,updated_at=now() WHERE campaign_id=$1',[row.campaign_id,JSON.stringify(observed),JSON.stringify(telemetry)]);
    await this.queueProtection(c,current,job,system,reasons,snapshot.observedAt);
    await event(c,current,system,'TELEMETRY_OBSERVED',{source:row.provider,dateStart:snapshot.dateStart,dateEnd:snapshot.dateEnd,observedAt:snapshot.observedAt});
   });return;
  }
 throw new MarketingError('JOB_KIND_UNSUPPORTED','This job has no enabled processing adapter');
 }
 private async queueProtection(c:pg.PoolClient,row:any,job:MarketingJob,actor:{id:number;role:'system'},reasons:string[],observation:string|null){
  if(!reasons.length||!['LIVE','PROVIDER_REVIEW','ACTIVATION_QUEUED'].includes(row.state))return false;
  const pauseId=await enqueue(c,{campaignId:row.campaign_id,revision:row.revision,kind:'PAUSE',key:`protection:${job.id}`,payload:{reasons}});
  await c.query("UPDATE marketing_campaign_workflows SET state='PAUSE_QUEUED',pending_job_id=$3,last_error=$2,updated_at=now() WHERE campaign_id=$1",[row.campaign_id,reasons.join(', '),pauseId]);
  await event(c,row,actor,'PROTECTION_PAUSE_QUEUED',{reasons,observation});return true;
 }
 private async protectBeforeObservation(job:MarketingJob,actor:{id:number;role:'system'}){
  return inTransaction(this.pool,actor,async c=>{
   const row=await lockWorkflow(c,job.campaign_id!,actor);await this.queue.assertFence(c,job);
   if(row.revision!==job.revision)throw new MarketingError('REVISION_CONFLICT','Observation revision changed before local protection');
   if(row.state==='PAUSE_QUEUED')return true;
   const reasons:string[]=[];
   try{await this.workflow.assertCurrentListing(c,row,actor);await assertMarketableInventory(c,row.listing_id,row.draft);}
   catch(error){if(!(error instanceof MarketingError))throw error;reasons.push(error.code);}
   return this.queueProtection(c,row,job,actor,reasons,null);
  });
 }
 private async record(job:MarketingJob,row:any,state:string,truth:unknown,eventType:string){await inTransaction(this.pool,{id:row.host_id,role:'system'},async c=>{const current=await lockWorkflow(c,row.campaign_id,{id:row.host_id,role:'system'});await this.queue.assertFence(c,job);if(current.revision!==job.revision||current.pending_job_id!==job.id)throw new MarketingError('REVISION_CONFLICT','Campaign operation authority changed');await c.query('UPDATE marketing_campaign_workflows SET state=$2,pending_job_id=NULL,provider_truth=$3,last_error=NULL,updated_at=now() WHERE campaign_id=$1',[row.campaign_id,state,JSON.stringify(truth)]);await event(c,current,{id:row.host_id,role:'system'},eventType,{jobId:job.id,truth});});}
 async scheduleRefunds(){if(!this.config.policyAdminId)return;await inTransaction(this.pool,{id:this.config.policyAdminId,role:'system'},async c=>{
  const rows=(await c.query(`SELECT r.id FROM marketing_finance_refunds r LEFT JOIN marketing_finance_refund_operations o ON o.refund_id=r.id WHERE r.status='REQUESTED' AND (o.refund_id IS NULL OR o.external_refund_id IS NOT NULL) ORDER BY r.updated_at LIMIT 100`)).rows;
  for(const row of rows)await enqueue(c,{kind:'REFUND',key:`refund-observe:${row.id}:${Math.floor(Date.now()/300000)}`,payload:{refundRequestId:row.id}});
 });}
 async scheduleObservations(){await this.scheduleRefunds();if(!this.config.policyAdminId)return;await this.workflow.recoverExpiredEvaluations({id:this.config.policyAdminId,role:'system'});await inTransaction(this.pool,{id:this.config.policyAdminId,role:'system'},async c=>{
  const window=Math.floor(Date.now()/300000),windowStart=new Date(window*300000).toISOString();
  // Durable scheduling history advances even when observations fail. Active read work
  // remains owned by its existing job instead of accumulating a second retry stream.
  const rows=(await c.query(`SELECT w.campaign_id,w.revision FROM marketing_campaign_workflows w LEFT JOIN (
   SELECT campaign_id,revision,max(created_at) AS scheduled_at,bool_or(state IN ('PENDING','RUNNING','RETRY')) AS active
   FROM marketing_jobs WHERE kind='TELEMETRY' GROUP BY campaign_id,revision
  ) h ON h.campaign_id=w.campaign_id AND h.revision=w.revision
  WHERE w.state IN ('PROVIDER_PAUSED','PROVIDER_REVIEW','LIVE','PAUSED','RECONCILIATION_REQUIRED') AND w.provider_truth IS NOT NULL
   AND NOT COALESCE(h.active,false) AND (h.scheduled_at IS NULL OR h.scheduled_at<$1::timestamptz)
  ORDER BY h.scheduled_at ASC NULLS FIRST,w.campaign_id LIMIT 100`,[windowStart])).rows;
  for(const row of rows)await enqueue(c,{campaignId:row.campaign_id,revision:row.revision,kind:'TELEMETRY',key:`observe:${row.campaign_id}:${window}`});
 });}
}
