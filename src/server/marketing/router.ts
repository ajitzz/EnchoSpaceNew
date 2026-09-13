import {Router,type RequestHandler} from 'express';
import type pg from 'pg';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {MarketingError,type Actor} from '../../lib/marketing/domain.js';
import {MarketingWorkflowService,readListing} from '../../lib/marketing/workflow.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {inTransaction,event,lockWorkflow} from '../../lib/marketing/database.js';
import {enqueue} from '../../lib/marketing/jobs.js';
import {optimizationAdvice} from '../../lib/marketing/protection.js';
import {MarketingTargetingService} from '../../lib/marketing/targeting.js';
import {consumeMarketingRequestBudget} from '../../lib/marketing/requestLimits.js';
import {GoogleAdsError} from '../../lib/providers/google/googleErrors.js';
import {MetaAdsError} from '../../lib/providers/meta/MetaAdsClient.js';
import {workspaceQuerySchema} from '../../lib/marketing/workspaceQuery.js';
import type {MarketingSettlementService} from '../../lib/marketing/settlementService.js';
import type {ConversionConsumer} from '../../lib/marketing/conversions/consumer.js';
import {settlementDocumentSchema,settlementProposalSchema,settlementReviewSchema,settlementCommitSchema,settlementListQuerySchema,settlementDocumentQuerySchema} from '../../lib/marketing/settlementSchemas.js';
import {CampaignDraftGuidance,guidanceRequestSchema} from '../../lib/marketing/guidance.js';
import {googleInvoiceImportSchema} from '../../lib/marketing/googleInvoiceImport.js';
import {CreativeWorkflowService} from '../../lib/marketing/creativeWorkflow.js';
import {creativeListSchema,creativeRequestSchema,creativeConfirmSchema,creativeReviewSchema} from '../../lib/marketing/creativeContract.js';
export function marketingErrorHandler(error:any,_req:any,res:any,_next:any){
 const correlationId=randomUUID();const known=error instanceof MarketingError||error instanceof GoogleAdsError||error instanceof MetaAdsError||error?.name==='MarketingFinanceError';
 const code=error instanceof z.ZodError?'INVALID_INPUT':known?error.code:error?.code==='42P01'?'MARKETING_MIGRATION_REQUIRED':'MARKETING_REQUEST_FAILED';
 const status=error instanceof z.ZodError?422:known?error.status||error.statusCode||409:error?.code==='42P01'?503:500;
 console.error(JSON.stringify({event:'HARVO_REQUEST_FAILED',correlationId,code}));
 res.status(status).json({error:error instanceof z.ZodError?'Check the highlighted campaign fields and try again.':known?error.message:status===503?'The campaign upgrade requires its database migrations before this workspace can open.':'Campaign request failed. Use the correlation ID for support.',code,correlationId,...error instanceof z.ZodError?{fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}:{}});
}
export function createMarketingRouter(pool:pg.Pool,service:MarketingWorkflowService,finance:WorkflowFinance,authenticate:RequestHandler,targeting?:MarketingTargetingService,extensions:{settlement?:MarketingSettlementService;conversions?:ConversionConsumer;guidance?:CampaignDraftGuidance;creative?:CreativeWorkflowService}={}){
 const router=Router();router.use(authenticate);router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 router.use(async(req:any,res,next)=>{try{
  const id=Number(req.user?.id);if(!Number.isSafeInteger(id)||id<=0)throw new MarketingError('AUTH_REQUIRED','Valid sign-in required',401);
  const user=(await pool.query('SELECT id,role FROM users WHERE id=$1',[id])).rows[0];if(!user)throw new MarketingError('AUTH_REQUIRED','This account no longer exists',401);
  res.locals.actor={id:user.id,role:user.role==='admin'?'admin':'host'} satisfies Actor;res.setHeader('Cache-Control','no-store');next();
 }catch(e){next(e);}});
 const actor=(res:any)=>res.locals.actor as Actor;
 const id=(req:any)=>z.coerce.number().int().positive().parse(req.params.id);
 const revision=(req:any)=>z.number().int().positive().parse(req.body.revision);
 const key=(req:any)=>z.string().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/).parse(req.get('Idempotency-Key'));
 const admin:RequestHandler=(_req,res,next)=>actor(res).role==='admin'?next():next(new MarketingError('ADMIN_REQUIRED','Administrator access required',403));
 const settlement=()=>{if(!extensions.settlement)throw new MarketingError('SETTLEMENT_NOT_CONFIGURED','Accounting close is not configured.',503);return extensions.settlement;};
 const creative=()=>{if(!extensions.creative)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Reviewed image preparation is not configured in this environment.',503);return extensions.creative;};
 const uuid=(value:unknown)=>z.string().uuid().parse(value);
 router.get('/admin/readiness',admin,async(_req,res)=>res.json({observedAt:new Date().toISOString(),settlement:extensions.settlement?.capabilities()??{configured:false},conversions:extensions.conversions?.readiness()??{enabled:false,blockers:['CONVERSION_SERVICE_NOT_CONNECTED']}}));
 router.get('/admin/settlements/documents',admin,async(req,res)=>res.json(await settlement().listDocuments(actor(res),settlementDocumentQuerySchema.parse(req.query))));
 router.post('/admin/settlements/documents',admin,async(req,res)=>{const requestKey=key(req);res.status(201).json(await settlement().uploadDocument(actor(res),settlementDocumentSchema.parse(req.body),requestKey));});
 router.post('/admin/settlements/import/google',admin,async(req,res)=>{const requestKey=key(req);res.status(201).json(await settlement().importGoogleInvoices(actor(res),googleInvoiceImportSchema.parse(req.body),requestKey));});
 router.get('/admin/creatives',admin,async(req,res)=>res.json(await creative().list(actor(res),creativeListSchema.parse(req.query))));
 router.post('/admin/creatives/:id/review',admin,async(req,res)=>{const requestKey=key(req);void requestKey;res.json(await creative().review(actor(res),String(req.params.id),creativeReviewSchema.parse(req.body)));});
 router.get('/admin/settlements/documents/:documentId',admin,async(req,res)=>{
  const document=await settlement().getDocument(actor(res),uuid(req.params.documentId));
  res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="billing-${uuid(req.params.documentId)}.${document.contentType==='application/pdf'?'pdf':document.contentType==='text/csv'?'csv':'json'}"`);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.send(document.content);
 });
 router.get('/admin/settlements',admin,async(req,res)=>res.json(await settlement().list(actor(res),settlementListQuerySchema.parse(req.query))));
 router.post('/admin/settlements',admin,async(req,res)=>{const requestKey=key(req);res.status(201).json(await settlement().propose(actor(res),settlementProposalSchema.parse(req.body),requestKey));});
 router.get('/admin/settlements/:settlementId',admin,async(req,res)=>res.json(await settlement().get(actor(res),uuid(req.params.settlementId))));
 router.post('/admin/settlements/:settlementId/review',admin,async(req,res)=>res.json(await settlement().review(actor(res),uuid(req.params.settlementId),settlementReviewSchema.parse(req.body))));
 router.post('/admin/settlements/:settlementId/commit',admin,async(req,res)=>{const requestKey=key(req);res.json(await settlement().settle(actor(res),uuid(req.params.settlementId),settlementCommitSchema.parse(req.body),requestKey));});
 router.post('/admin/settlements/:settlementId/withdraw',admin,async(req,res)=>{const body=z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(20).max(3000)}).strict().parse(req.body);res.json(await settlement().withdraw(actor(res),uuid(req.params.settlementId),body.fingerprint,body.reason));});
 router.get('/campaigns/:id/settlement',async(req,res)=>res.json(await settlement().hostSummary(actor(res),id(req))));
 router.post('/campaign-guidance',async(req,res)=>{
  const body=guidanceRequestSchema.parse(req.body);
  const listing=await inTransaction(pool,actor(res),c=>readListing(c,body.listingId,actor(res)));
  if(listing.hostId!==actor(res).id||listing.publicationStatus!=='published')throw new MarketingError('LISTING_NOT_AVAILABLE','Choose a published property that belongs to this account.',404);
  if(!extensions.guidance)throw new MarketingError('GUIDANCE_NOT_CONFIGURED','AI drafting is unavailable in this environment.',503);
  await consumeMarketingRequestBudget(pool,actor(res),'CAMPAIGN_GUIDANCE');
  res.json(await extensions.guidance.suggest(listing,body.provider,actor(res)));
 });
 router.get('/creatives',async(req,res)=>res.json(await creative().list(actor(res),creativeListSchema.parse(req.query))));
 router.post('/creatives',async(req,res)=>{const requestKey=key(req);res.status(201).json(await creative().request(actor(res),creativeRequestSchema.parse(req.body),requestKey));});
 router.get('/creatives/:id/image',async(req,res)=>{const view=z.enum(['SOURCE','DERIVATIVE']).default('DERIVATIVE').parse(req.query.view);const image=await creative().image(actor(res),String(req.params.id),view);res.setHeader('Content-Type',image.contentType);res.setHeader('Content-Length',String(image.bytes.length));res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(image.bytes);});
 router.post('/creatives/:id/confirm',async(req,res)=>{const requestKey=key(req);void requestKey;res.json(await creative().confirm(actor(res),String(req.params.id),creativeConfirmSchema.parse(req.body)));});
 const targetingService=()=>{if(!targeting)throw new MarketingError('TARGETING_NOT_CONFIGURED','Targeting lookup is unavailable in this environment.',503);return targeting;};
 router.use('/targeting',async(_req,res,next)=>{try{await consumeMarketingRequestBudget(pool,actor(res),'TARGETING');next();}catch(error){next(error);}});
 router.get('/targeting/google/locations',async(req,res)=>{const input=z.object({q:z.string().trim().min(2).max(80),country:z.string().regex(/^[A-Z]{2}$/).optional()}).strict().parse(req.query);res.json({locations:await targetingService().locations(input.q,input.country)});});
 router.get('/targeting/google/languages',async(_req,res)=>res.json({languages:await targetingService().languages()}));
 router.post('/targeting/google/resolve',async(req,res)=>{const input=z.object({locations:z.array(z.string()).max(20),languages:z.array(z.string()).max(10)}).strict().parse(req.body);res.json(await targetingService().resolve(input.locations,input.languages));});
 router.get('/workspace',async(req,res)=>{const query=workspaceQuerySchema.parse(req.query);await finance.refreshPreference();res.json(await service.workspace(actor(res),query));});
 router.get('/admin/workspace',admin,async(req,res)=>{const query=workspaceQuerySchema.parse(req.query);await finance.refreshPreference();res.json(await service.workspace(actor(res),query));});
 router.post('/campaigns',async(req,res)=>{key(req);if(targeting)await consumeMarketingRequestBudget(pool,actor(res),'TARGETING');res.status(201).json(await service.project(await service.create(actor(res),req.body,key(req))));});
 router.get('/campaigns/:id',async(req,res)=>res.json(await service.project(await service.get(id(req),actor(res)))));
 router.patch('/campaigns/:id',async(req,res)=>{key(req);if(targeting)await consumeMarketingRequestBudget(pool,actor(res),'TARGETING');const {revision:r,...draft}=req.body;res.json(await service.project(await service.update(id(req),actor(res),z.number().int().positive().parse(r),draft)));});
 router.post('/campaigns/:id/evaluate',async(req,res)=>res.json(await service.project(await service.evaluate(id(req),actor(res),revision(req)))));
 router.post('/campaigns/:id/submit',async(req,res)=>res.json(await service.project(await service.submit(id(req),actor(res),revision(req)))));
 router.post('/campaigns/:id/quote',async(req,res)=>res.json(await service.project(await service.quote(id(req),actor(res),revision(req),key(req)))));
 router.post('/campaigns/:id/fund',async(req,res)=>res.json(await service.fund(id(req),actor(res),revision(req),key(req))));
 router.post('/campaigns/:id/refund',async(req,res)=>{
  const input=z.object({revision:z.number().int().positive(),amountMinor:z.string().regex(/^[1-9]\d{0,14}$/),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
  const row=await service.get(id(req),actor(res));if(row.revision!==input.revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign before requesting a refund');
  res.status(202).json(await finance.requestRefund(row,actor(res),input.amountMinor,key(req),input.reason));
 });
 router.post('/campaigns/:id/cancel',async(req,res)=>{
  const input=z.object({revision:z.number().int().positive(),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
  const row=await service.get(id(req),actor(res));if(row.revision!==input.revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign before cancelling');
  res.json(await service.project(await finance.cancelBeforeProvider(row,actor(res),key(req),input.reason)));
 });
 const review=z.object({revision:z.number().int().positive(),decision:z.enum(['APPROVE','REJECT']),note:z.string().min(10).max(2000),policyConfirmed:z.boolean(),mediaConfirmed:z.boolean()}).strict();
 router.post('/campaigns/:id/review',admin,async(req,res)=>res.json(await service.project(await service.review(id(req),actor(res),review.parse(req.body)))));
 for(const action of ['publish','activate','pause'] as const)router.post(`/campaigns/:id/${action}`,async(req,res)=>res.status(202).json(await service.project(await service.schedule(id(req),actor(res),revision(req),action.toUpperCase() as 'PUBLISH'|'ACTIVATE'|'PAUSE',key(req)))));
 router.post('/admin/policy',admin,async(req,res)=>{const input=z.object({markupPercent:z.number().min(3).max(5),expectedVersion:z.number().int().nonnegative(),reason:z.string().min(10).max(1000)}).strict().parse(req.body);res.json(await finance.setMarkup(actor(res).id,input));});
 router.get('/campaigns/:id/events',async(req,res)=>{const row=await service.get(id(req),actor(res));const events=await inTransaction(pool,actor(res),async c=>(await c.query('SELECT id,revision,event_type,evidence,created_at FROM marketing_workflow_events WHERE campaign_id=$1 ORDER BY id DESC LIMIT 100',[row.campaign_id])).rows);res.json({events});});
 router.get('/campaigns/:id/advice',async(req,res)=>{const row=await service.get(id(req),actor(res));res.json(optimizationAdvice({impressions:row.telemetry?.impressions??null,clicks:row.telemetry?.clicks??null,capturedBookings:row.telemetry?.bookings??null,spendMinor:row.telemetry?.spendMinor??null,fulfilledContributionMinor:null}));});
 router.post('/campaigns/:id/refresh',async(req,res)=>{const row=await service.get(id(req),actor(res));requireNoPublicKeyLeak(req.body);await inTransaction(pool,actor(res),async c=>{await enqueue(c,{campaignId:row.campaign_id,revision:row.revision,kind:'TELEMETRY',key:`refresh:${row.campaign_id}:${Math.floor(Date.now()/300000)}`});});res.status(202).json({status:'QUEUED'});});
 router.get('/admin/operations',admin,async(_req,res)=>{
  const result=await inTransaction(pool,actor(res),async c=>{
   const jobs=(await c.query("SELECT id,campaign_id,revision,kind,state,attempts,last_error,updated_at FROM marketing_jobs WHERE state IN ('DEAD','RECONCILIATION_REQUIRED','RUNNING') ORDER BY updated_at DESC LIMIT 100")).rows;
   const queues=(await c.query("SELECT kind,state,count(*)::int AS count,min(created_at) AS oldest_created_at,min(run_after) AS earliest_run_after,count(*) FILTER(WHERE state='RUNNING' AND lease_until<now())::int AS expired_leases FROM marketing_jobs WHERE state<>'SUCCEEDED' GROUP BY kind,state ORDER BY kind,state")).rows;
   return {jobs,queues};
  });res.json({...result,observedAt:new Date().toISOString()});
 });
 router.use(marketingErrorHandler);return router;
}
function requireNoPublicKeyLeak(body:unknown){z.object({}).strict().parse(body||{});}
