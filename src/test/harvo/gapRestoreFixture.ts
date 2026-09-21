import type pg from 'pg';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {MarketingFinanceService,authorizeSpending,type VerifiedCapture} from '../../lib/marketing/financeService.js';
import {MarketingSettlementService,type SettlementOptions} from '../../lib/marketing/settlementService.js';
import type {SettlementDocumentInput,SettlementProposalInput} from '../../lib/marketing/settlementSchemas.js';
import {createConversionConsumer} from '../../lib/marketing/conversions/consumer.js';
import type {VerifiedCanonicalBooking} from '../../lib/marketing/measurement.js';
import type {VerifiedConversionAttribution} from '../../lib/marketing/conversions/contracts.js';
import {consumeMarketingRequestBudget} from '../../lib/marketing/requestLimits.js';
import {testPolicy,testQuoteInput} from './financeFixtures.js';
import {workflowDraft} from './workflowPgFixture.js';
import {MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';
import {enqueue} from '../../lib/marketing/jobs.js';
import {fingerprint} from '../../lib/marketing/domain.js';

export const restoreHost={id:10,role:'host' as const},restoreAdmin={id:90,role:'admin' as const},restoreReviewer={id:91,role:'admin' as const};
export const restorePolicy='isolated-restore-accounting-procedure';
export const restoreWorkflow=(pool:pg.Pool)=>new MarketingWorkflowService(pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:{} as WorkflowFinancePort,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:['Isolated restore fixture only']});
export const restoreSettlementOptions: SettlementOptions={operatorIds:[90,91],policyReference:restorePolicy,providerAccounts:{META:'987654321',GOOGLE:'1234567890'},additionalDocumentOrigins:{ACCOUNTANT:['https://accounting.restore.example']},verifyStopped:async binding=>({...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'a'.repeat(64)})};

/** Test authority only. No fixture document or configured-status response is real billing acceptance. */
export async function prepareRestoreSettlement(pool:pg.Pool){
 await pool.query("INSERT INTO users(id,role) VALUES(91,'admin')");await new MarketingFinanceService(pool,{actorContext:restoreAdmin}).persistPolicy(testPolicy,90);
 const row=await restoreWorkflow(pool).create(restoreHost,workflowDraft({startDate:'2026-08-01',endDate:'2026-08-03'}),'restore-financial-campaign');
 const finance=new MarketingFinanceService(pool,{actorContext:restoreHost});const costs=[{code:'META_MEDIA',amountMinor:'90000'},{code:'GOOGLE_MEDIA',amountMinor:'0'},{code:'PROCESSING',amountMinor:'9000'},{code:'COST_TAX',amountMinor:'1000'}];
 const quote=await finance.quote(testQuoteInput({campaignId:row.campaign_id,campaignRevision:'1',costs,idempotencyKey:'restore-quote'}),testPolicy);
 const capture:VerifiedCapture={provider:'RAZORPAY',accountId:'restore-fixture-merchant',eventId:'restore-capture-event',paymentId:'restore-payment',orderId:'restore-payment-order',quoteId:quote.id,currency:'INR',amountMinor:quote.totalMinor,payloadHash:'b'.repeat(64),capturedAt:new Date(Date.now()-25*3600000).toISOString()};
 await new MarketingFinanceService(pool,{actorContext:restoreAdmin,fundingEnabled:true,verifyCapture:async()=>capture}).recordVerifiedCapture({fixture:true});
 const reservation=await finance.reserve({quoteId:quote.id,hostId:10,idempotencyKey:'restore-reserve'});
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.marketing_admin','true',true)");await authorizeSpending(c,{reservationId:reservation.reservationId,campaignId:row.campaign_id,hostId:10,revision:'1',provider:'META',accountId:'987654321',amountMinor:'90000',idempotencyKey:'restore-authorize'});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 const externalId='81001';await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status,metadata) VALUES($1,'META','CAMPAIGN',$2,'987654321','PAUSED','PAUSED','{}')",[row.campaign_id,externalId]);
 await pool.query("UPDATE marketing_campaign_workflows SET state='PAUSED',quote_id=$2,reservation_id=$3,provider_truth=$4 WHERE campaign_id=$1",[row.campaign_id,quote.id,reservation.reservationId,JSON.stringify({externalCampaignId:externalId,configuredStatus:'PAUSED'})]);
 const settlement=new MarketingSettlementService(pool,restoreSettlementOptions);
 const doc=(reference:string,extra:Partial<SettlementDocumentInput>={})=>settlement.uploadDocument(restoreAdmin,{kind:'PROVIDER_INVOICE',issuer:'META',accountId:'987654321',externalDocumentId:reference,currency:'INR',totalMinor:'80000',periodStart:'2026-08-01',periodEnd:'2026-08-03',issuedAt:'2026-08-05T00:00:00.000Z',sourceUrl:'https://business.facebook.com/billing',description:'Artificial restore fixture only; this is not an actual issued provider document.',contentType:'application/json',contentBase64:Buffer.from(JSON.stringify({scope:'ISOLATED_RESTORE_FIXTURE',reference})).toString('base64'),...extra},reference);
 const invoice=await doc('restore-invoice'),detail=await doc('restore-campaign-detail',{kind:'CAMPAIGN_BILLING_DETAIL',provider:'META',campaignExternalId:externalId});
 const closure=await doc('restore-closure',{kind:'BILLING_CLOSURE',issuer:'ACCOUNTANT',provider:'META',campaignExternalId:externalId,totalMinor:'0',sourceUrl:'https://accounting.restore.example/close',policyReference:restorePolicy});
 const fee=await doc('restore-fee',{kind:'COST_INVOICE',issuer:'RAZORPAY',accountId:'restore-fixture-merchant',sourceUrl:'https://dashboard.razorpay.com/billing',totalMinor:'9000'}),tax=await doc('restore-tax',{kind:'TAX_STATEMENT',issuer:'ACCOUNTANT',accountId:'restore-tax-record',sourceUrl:'https://accounting.restore.example/tax',totalMinor:'1000'});
 const note='Document allocation in the isolated restore fixture; no production financial statement.';
 const input:SettlementProposalInput={campaignId:row.campaign_id,revision:1,reservationId:reservation.reservationId,allocations:[{code:'META_MEDIA',amountMinor:'80000',invoiceDocumentId:invoice.id,note},{code:'GOOGLE_MEDIA',amountMinor:'0',note},{code:'PROCESSING',amountMinor:'9000',invoiceDocumentId:fee.id,note},{code:'COST_TAX',amountMinor:'1000',invoiceDocumentId:tax.id,note}],remittanceTaxMinor:'0',closures:[{provider:'META',accountId:'987654321',externalCampaignId:externalId,invoiceDocumentIds:[invoice.id],detailDocumentId:detail.id,closureDocumentId:closure.id}],policyReference:restorePolicy,note};
 const proposal=await settlement.propose(restoreAdmin,input,'restore-proposal');await settlement.review(restoreReviewer,proposal.id,{fingerprint:proposal.fingerprint,decision:'APPROVE',note,independentVerificationReference:'Separate fixture operator verification; not a production approval.',checkedDocuments:proposal.snapshot.documents.map(d=>({id:d.id,sha256:d.sha256}))});
 const result=await settlement.settle(restoreAdmin,proposal.id,{fingerprint:proposal.fingerprint},'restore-settle');
 await consumeMarketingRequestBudget(pool,restoreHost,'CAMPAIGN_GUIDANCE');
 return {campaignId:row.campaign_id,quote,capture,reservation,proposal,result,document:invoice,input};
}

export async function prepareRestoreConversion(pool:pg.Pool,fetcher:typeof fetch){
 const row=await restoreWorkflow(pool).create(restoreHost,workflowDraft({title:'Isolated conversion restore campaign'}),'restore-conversion-campaign');const externalId='customers/1234567890/campaigns/91001';
 await pool.query("UPDATE marketing_campaign_workflows SET provider='GOOGLE' WHERE campaign_id=$1",[row.campaign_id]);await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status) VALUES($1,'GOOGLE','CAMPAIGN',$2,'1234567890','PAUSED','UNKNOWN')",[row.campaign_id,externalId]);
 const now=new Date(),eventAt=new Date(now.getTime()-60000).toISOString(),captureAt=new Date(now.getTime()-120000).toISOString(),consentAt=new Date(now.getTime()-180000).toISOString();
 const booking:VerifiedCanonicalBooking={authority:'CANONICAL_CHECKOUT',acceptanceReference:'fixture-only-no-production-acceptance',eventId:'restore-booking-event',bookingId:'restore-booking',orderId:'restore-booking-order',sequence:1,state:'CAPTURED',occurredAt:eventAt,hostId:10,listingId:20,campaignId:row.campaign_id,currency:'INR',capturedMinor:'200000',refundedMinor:'0',captureEvidenceId:'restore-booking-capture-fixture',capturedAt:captureAt,attribution:{provider:'GOOGLE',externalCampaignId:externalId,evidenceId:'restore-attribution'},consent:{recordId:'restore-consent',purpose:'ADS_MEASUREMENT',status:'GRANTED',recordedAt:consentAt}};
 const attribution:VerifiedConversionAttribution={authority:'CANONICAL_ATTRIBUTION',evidenceId:'restore-attribution',consentRecordId:'restore-consent',bookingId:booking.bookingId,orderId:booking.orderId,campaignId:row.campaign_id,hostId:10,listingId:20,provider:'GOOGLE',externalCampaignId:externalId,consent:{measurement:'GRANTED',adUserData:'GRANTED',adPersonalization:'DENIED',recordedAt:consentAt},google:{customerId:'1234567890',conversionActionId:'5001',gclid:'RESTORE_PRIVATE_FIXTURE_CLICK'}};
 const make=(target:pg.Pool,transport:typeof fetch)=>createConversionConsumer(target,{actorContext:{id:90,role:'system'},verifyBooking:async()=>booking,resolveAttribution:async()=>attribution,now:()=>now,fetch:transport,google:{customerId:'1234567890',servingCustomerId:'1234567890',conversionActionId:'5001',accessToken:async()=>'restore-fixture-token'}});
 const consumer=make(pool,fetcher);await consumer.ingest('fixture-booking-reference');await consumer.runOnce();
 return {campaignId:row.campaign_id,booking,make};
}

/** A committed fixture pause, adopted through the real service before backup. */
export async function prepareRestorePause(pool: pg.Pool) {
 const row = await restoreWorkflow(pool).create(restoreHost, workflowDraft({title:'Isolated pause recovery restore campaign'}), 'restore-pause-campaign');
 const campaignId = row.campaign_id;
 const key = 'restore-committed-pause';
 const jobId = await enqueue(pool, {campaignId, revision:1, kind:'PAUSE', key});
 await pool.query("UPDATE marketing_jobs SET state='RECONCILIATION_REQUIRED',last_error='LOCAL_COMPLETION_LOST' WHERE id=$1", [jobId]);
 await pool.query("UPDATE marketing_campaign_workflows SET state='RECONCILIATION_REQUIRED',pending_job_id=$2,last_error='LOCAL_COMPLETION_LOST',provider_truth=$3 WHERE campaign_id=$1", [campaignId, jobId, JSON.stringify({externalCampaignId:'82001', configuredStatus:'ACTIVE'})]);
 await pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id) VALUES($1,'META','CAMPAIGN','82001','987654321')", [campaignId]);
 await pool.query(`INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,correlation_id,publish_status,is_unknown_outcome,payload,response,external_campaign_id)
  VALUES($1,'META','PAUSE',$2,$3,'COMMITTED',FALSE,$4,$5,'82001')`, [campaignId, key, jobId, JSON.stringify({protocol:'HARVO_PROVIDER_OPERATION_V2'}), JSON.stringify({success:true, provider:'META', externalCampaignId:'82001', newStatus:'PAUSED', normalizedDeliveryState:'PAUSED'})]);
 const input = {revision:1, reason:'Isolated restore fixture verifying preservation of committed pause adoption.'};
 const requestKey = 'restore-pause-adoption';
 const recovery = new MarketingPauseRecovery(pool, async binding => ({...binding, configuredStatus:'PAUSED', observedAt:new Date().toISOString(), evidenceHash:fingerprint({scope:'ISOLATED_RESTORE_FIXTURE', binding})}));
 const result = await recovery.adopt(restoreAdmin, campaignId, input, requestKey);
 return {campaignId, input, requestKey, result};
}
