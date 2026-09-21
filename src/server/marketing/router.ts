import type {CorridorInferenceWorker} from '../../lib/marketing/adtech/inference.js';
import type {CampaignOutcomes} from '../../lib/marketing/portfolio/outcomes.js';
import {AdtechStrategyRegistry} from '../../lib/marketing/adtech/registry.js';
import {createAdtechAdminRouter} from './adtechRoutes.js';
import type {SpatialStories} from '../../lib/marketing/portfolio/spatialStories.js';
import type {DestinationPools} from '../../lib/marketing/portfolio/pools.js';
import type {MarketingPreflight} from '../../lib/marketing/portfolio/preflight.js';
import type {SearchPortfolioConflictAnalyzer} from '../../lib/marketing/portfolio/shadow.js';
import type {KeywordResearchService} from '../../lib/marketing/portfolio/keywordResearch.js';
import type {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
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
import {inspectCampaignRecovery} from '../../lib/marketing/recovery.js';
import {pauseRecoverySchema,type MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';
export function marketingErrorHandler(error:any,_req:any,res:any,_next:any){
 const correlationId=randomUUID();const known=error instanceof MarketingError||error instanceof GoogleAdsError||error instanceof MetaAdsError||error?.name==='MarketingFinanceError';
 const code=error instanceof z.ZodError?'INVALID_INPUT':known?error.code:error?.code==='42P01'?'MARKETING_MIGRATION_REQUIRED':'MARKETING_REQUEST_FAILED';
 const status=error instanceof z.ZodError?422:known?error.status||error.statusCode||409:error?.code==='42P01'?503:500;
 console.error(JSON.stringify({event:'HARVO_REQUEST_FAILED',correlationId,code}));
 res.status(status).json({error:error instanceof z.ZodError?'Check the highlighted campaign fields and try again.':known?error.message:status===503?'The campaign upgrade requires its database migrations before this workspace can open.':'Campaign request failed. Use the correlation ID for support.',code,correlationId,...error instanceof z.ZodError?{fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}:{}});
}
export function createMarketingRouter(pool:pg.Pool,service:MarketingWorkflowService,finance:WorkflowFinance,authenticate:RequestHandler,targeting?:MarketingTargetingService,extensions:{corridorInference?:CorridorInferenceWorker;outcomes?:CampaignOutcomes;stories?:SpatialStories;pools?:DestinationPools;preflight?:MarketingPreflight;settlement?:MarketingSettlementService;conversions?:ConversionConsumer;guidance?:CampaignDraftGuidance;creative?:CreativeWorkflowService;pauseRecovery?:MarketingPauseRecovery;facts?:CanonicalMarketingFacts;keywordResearch?:KeywordResearchService;portfolio?:SearchPortfolioConflictAnalyzer}={}){
 const router=Router();router.use(authenticate);router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 router.use(async(req:any,res,next)=>{try{
  const id=Number(req.user?.id);if(!Number.isSafeInteger(id)||id<=0)throw new MarketingError('AUTH_REQUIRED','Valid sign-in required',401);
  const user=(await pool.query('SELECT id,role FROM users WHERE id=$1',[id])).rows[0];if(!user)throw new MarketingError('AUTH_REQUIRED','This account no longer exists',401);
  res.locals.actor={id:user.id,role:user.role==='admin'?'admin':'host'} satisfies Actor;res.setHeader('Cache-Control','no-store');next();
 }catch(e){next(e);}});
 const actor=(res:any)=>res.locals.actor as Actor;
 // Audience comes only from the persisted user lookup, never request claims.
 const project=(row:any,res:any)=>service.project(row,undefined,actor(res).role==='admin'?'admin':'host');
 const id=(req:any)=>z.coerce.number().int().positive().parse(req.params.id);
 const revision=(req:any)=>z.number().int().positive().parse(req.body.revision);
 const key=(req:any)=>z.string().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/).parse(req.get('Idempotency-Key'));
 const admin:RequestHandler=(_req,res,next)=>actor(res).role==='admin'?next():next(new MarketingError('ADMIN_REQUIRED','Administrator access required',403));
 router.get('/listings/:id/targeting-defaults',async(req,res)=>{if(!service.options.strategies?.required)throw new MarketingError('STRATEGY_NOT_CONFIGURED','Adaptive audience defaults are not enabled.',503);const id=z.coerce.number().int().positive().safe().parse(req.params.id);const provider=z.enum(['META','GOOGLE']).parse(req.query.provider);res.json(await service.options.strategies.defaults(res.locals.actor,id,provider));});
 router.post('/listings/:id/corridor-research',async(req,res)=>{if(!extensions.corridorInference)throw new MarketingError('INFERENCE_NOT_CONFIGURED','Destination research is unavailable.',503);const body=z.object({provider:z.enum(['META','GOOGLE'])}).strict().parse(req.body);res.status(202).json(await extensions.corridorInference.request(actor(res),id(req),body.provider));});
 router.get('/listings/:id/corridor-research',async(req,res)=>{if(!extensions.corridorInference)throw new MarketingError('INFERENCE_NOT_CONFIGURED','Destination research is unavailable.',503);res.json(await extensions.corridorInference.status(actor(res),id(req),z.enum(['META','GOOGLE']).parse(req.query.provider)));});
 router.use('/admin/adtech',createAdtechAdminRouter(new AdtechStrategyRegistry(pool),extensions.corridorInference));
 const settlement=()=>{if(!extensions.settlement)throw new MarketingError('SETTLEMENT_NOT_CONFIGURED','Accounting close is not configured.',503);return extensions.settlement;};
 const creative=()=>{if(!extensions.creative)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Reviewed image preparation is not configured in this environment.',503);return extensions.creative;};
 const uuid=(value:unknown)=>z.string().uuid().parse(value);
 const facts=()=>{if(!extensions.facts)throw new MarketingError('FACTS_NOT_CONFIGURED','Property marketing evidence is unavailable.',503);return extensions.facts;};
 const pools=()=>{if(!extensions.pools)throw new MarketingError('POOL_NOT_CONFIGURED','Destination campaigns are unavailable.',503);return extensions.pools;};
 const stories=()=>{if(!extensions.stories)throw new MarketingError('STORY_NOT_CONFIGURED','Reviewed spatial stories are unavailable.',503);return extensions.stories;};
 router.get('/listings/:id/spatial-stories',async(req,res)=>res.json(await stories().list(actor(res),id(req))));
 router.post('/spatial-stories',async(req,res)=>{await consumeMarketingRequestBudget(pool,actor(res),'FACT_SNAPSHOT');res.status(201).json(await stories().capture(actor(res),req.body,key(req)));});
 router.post('/admin/spatial-stories/:storyId/review',admin,async(req,res)=>res.json(await stories().review(actor(res),uuid(req.params.storyId),req.body,key(req))));
 router.get('/destination-pools',async(_req,res)=>res.json(await pools().list(actor(res))));
 router.post('/admin/destination-pools',admin,async(req,res)=>res.status(201).json(await pools().create(actor(res),req.body,key(req))));
 router.post('/admin/destination-pools/:poolId/state',admin,async(req,res)=>res.json(await pools().setState(actor(res),uuid(req.params.poolId),req.body,key(req))));
 router.post('/admin/destination-pools/:poolId/invitations',admin,async(req,res)=>res.status(201).json(await pools().invite(actor(res),uuid(req.params.poolId),req.body,key(req))));
 router.post('/pool-memberships/:memberId/consent',async(req,res)=>res.json(await pools().consent(actor(res),uuid(req.params.memberId),req.body,key(req))));
 router.post('/admin/pool-memberships/:memberId/review',admin,async(req,res)=>res.json(await pools().review(actor(res),uuid(req.params.memberId),req.body,key(req))));
 router.post('/pool-memberships/:memberId/activate',async(req,res)=>{pools().assertExecutionAvailable();return res.json(await pools().activateMember(actor(res),uuid(req.params.memberId),key(req),(c,row)=>finance.reserveLocked(c,row,'pool-reservation')));});
 router.post('/pool-memberships/:memberId/resume',async(req,res)=>res.json(await pools().resumeMember(actor(res),uuid(req.params.memberId),key(req))));
 router.post('/pool-memberships/:memberId/withdraw',async(req,res)=>res.json(await pools().withdrawMember(actor(res),uuid(req.params.memberId),key(req))));
 router.post('/pool-memberships/:memberId/pause',async(req,res)=>res.json(await pools().pauseMember(actor(res),uuid(req.params.memberId),key(req))));
 router.get('/listings/:id/marketing-facts',async(req,res)=>res.json(await facts().preview(actor(res),id(req))));
 router.post('/marketing-fact-snapshots',async(req,res)=>{
  const requestKey=key(req);
  await consumeMarketingRequestBudget(pool,actor(res),'FACT_SNAPSHOT');
  res.status(201).json(await facts().capture(actor(res),req.body,requestKey));
 });
 router.post('/preflight/economics',async(req,res)=>{
  if(!extensions.preflight)throw new MarketingError('PREFLIGHT_UNAVAILABLE','Campaign planning is unavailable.',503);
  await consumeMarketingRequestBudget(pool,actor(res),'FACT_SNAPSHOT');
  res.json(await extensions.preflight.economics(actor(res),req.body));
 });
 router.get('/campaigns/:id/preflight',async(req,res)=>{
  if(!extensions.preflight)throw new MarketingError('PREFLIGHT_UNAVAILABLE','Campaign planning is unavailable.',503);
  res.json(await extensions.preflight.portfolio(actor(res),id(req),z.coerce.number().int().positive().parse(req.query.revision)));
 });
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
 router.post('/admin/campaigns/:id/portfolio-shadow',admin,async(req,res)=>{
  if(!extensions.portfolio)throw new MarketingError('PORTFOLIO_NOT_CONFIGURED','The shadow observer requires a configured Google serving customer.',503);
  const body=z.object({revision:z.number().int().positive().safe()}).strict().parse(req.body);
  res.json(await extensions.portfolio.assess(actor(res),id(req),body.revision));
 });
 router.post('/admin/portfolio-assessments/:assessmentId/reviews',admin,async(req,res)=>{
  if(!extensions.portfolio)throw new MarketingError('PORTFOLIO_NOT_CONFIGURED','The shadow observer is unavailable.',503);
  res.status(201).json(await extensions.portfolio.review(actor(res),String(req.params.assessmentId),req.body,key(req)));
 });
 router.post('/targeting/google/keyword-ideas',async(req,res)=>{
  if(!extensions.keywordResearch)throw new MarketingError('RESEARCH_NOT_CONFIGURED','Historical keyword research is unavailable in this environment.',503);
  const result=await extensions.keywordResearch.research(actor(res),req.body);
  res.status(result.status==='PENDING'?202:result.status==='RATE_LIMITED'?429:200).json(result);
 });
 router.get('/targeting/google/locations',async(req,res)=>{const input=z.object({q:z.string().trim().min(2).max(80),country:z.string().regex(/^[A-Z]{2}$/).optional()}).strict().parse(req.query);res.json({locations:await targetingService().locations(input.q,input.country)});});
 router.get('/targeting/google/languages',async(_req,res)=>res.json({languages:await targetingService().languages()}));
 router.post('/targeting/google/resolve',async(req,res)=>{const input=z.object({locations:z.array(z.string()).max(20),languages:z.array(z.string()).max(10)}).strict().parse(req.body);res.json(await targetingService().resolve(input.locations,input.languages));});
 router.get('/workspace',async(req,res)=>{const query=workspaceQuerySchema.parse(req.query);await finance.refreshPreference();const workspace=await service.workspace(actor(res),query);res.json(extensions.outcomes?await extensions.outcomes.decorate(actor(res),workspace):workspace);});
 router.get('/admin/workspace',admin,async(req,res)=>{const query=workspaceQuerySchema.parse(req.query);await finance.refreshPreference();const workspace=await service.workspace(actor(res),query);res.json(extensions.outcomes?await extensions.outcomes.decorate(actor(res),workspace):workspace);});
 router.post('/campaigns',async(req,res)=>{key(req);if(targeting)await consumeMarketingRequestBudget(pool,actor(res),'TARGETING');res.status(201).json(await project(await service.create(actor(res),req.body,key(req)),res));});
 router.get('/campaigns/:id',async(req,res)=>res.json(await project(await service.get(id(req),actor(res)),res)));
 router.patch('/campaigns/:id',async(req,res)=>{key(req);if(targeting)await consumeMarketingRequestBudget(pool,actor(res),'TARGETING');const {revision:r,...draft}=req.body;res.json(await project(await service.update(id(req),actor(res),z.number().int().positive().parse(r),draft),res));});
 router.post('/campaigns/:id/evaluate',async(req,res)=>res.json(await project(await service.evaluate(id(req),actor(res),revision(req)),res)));
 router.post('/campaigns/:id/submit',async(req,res)=>res.json(await project(await service.submit(id(req),actor(res),revision(req)),res)));
 router.post('/campaigns/:id/quote',async(req,res)=>res.json(await project(await service.quote(id(req),actor(res),revision(req),key(req)),res)));
 router.post('/campaigns/:id/fund',async(req,res)=>res.json(await service.fund(id(req),actor(res),revision(req),key(req))));
 router.post('/campaigns/:id/refund',async(req,res)=>{
  const input=z.object({revision:z.number().int().positive(),amountMinor:z.string().regex(/^[1-9]\d{0,14}$/),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
  const row=await service.get(id(req),actor(res));if(row.revision!==input.revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign before requesting a refund');
  res.status(202).json(await finance.requestRefund(row,actor(res),input.amountMinor,key(req),input.reason));
 });
 router.post('/campaigns/:id/cancel',async(req,res)=>{
  const input=z.object({revision:z.number().int().positive(),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
  const row=await service.get(id(req),actor(res));if(row.revision!==input.revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign before cancelling');
  res.json(await project(await finance.cancelBeforeProvider(row,actor(res),key(req),input.reason),res));
 });
 const review=z.object({revision:z.number().int().positive(),decision:z.enum(['APPROVE','REJECT']),note:z.string().min(10).max(2000),policyConfirmed:z.boolean(),mediaConfirmed:z.boolean()}).strict();
 router.post('/campaigns/:id/review',admin,async(req,res)=>res.json(await project(await service.review(id(req),actor(res),review.parse(req.body)),res)));
 for(const action of ['publish','activate','pause'] as const)router.post(`/campaigns/:id/${action}`,async(req,res)=>res.status(202).json(await project(await service.schedule(id(req),actor(res),revision(req),action.toUpperCase() as 'PUBLISH'|'ACTIVATE'|'PAUSE',key(req)),res)));
 router.post('/admin/policy',admin,async(req,res)=>{const input=z.object({markupPercent:z.number().min(3).max(5),expectedVersion:z.number().int().nonnegative(),reason:z.string().min(10).max(1000)}).strict().parse(req.body);res.json(await finance.setMarkup(actor(res).id,input));});
 router.get('/campaigns/:id/events',async(req,res)=>{const row=await service.get(id(req),actor(res));const events=await inTransaction(pool,actor(res),async c=>(await c.query('SELECT id,revision,event_type,evidence,created_at FROM marketing_workflow_events WHERE campaign_id=$1 ORDER BY id DESC LIMIT 100',[row.campaign_id])).rows);res.json({events:actor(res).role==='admin'?events:events.map(({id,revision,event_type,created_at,evidence})=>({id,revision,event_type,created_at,evidence:event_type==='CAMPAIGN_REFUND_REQUESTED'&&typeof evidence?.reason==='string'?{reason:evidence.reason.slice(0,1000)}:null}))});});
 router.get('/campaigns/:id/advice',async(req,res)=>{const row=await service.get(id(req),actor(res));res.json(optimizationAdvice({impressions:row.telemetry?.impressions??null,clicks:row.telemetry?.clicks??null,capturedBookings:row.telemetry?.bookings??null,spendMinor:row.telemetry?.spendMinor??null,fulfilledContributionMinor:null}));});
 router.post('/campaigns/:id/refresh',async(req,res)=>{const input=z.object({revision:z.number().int().positive().optional()}).strict().parse(req.body||{});res.status(202).json(await service.requestObservation(id(req),actor(res),input.revision));});
 router.get('/admin/operations',admin,async(_req,res)=>{
  const result=await inTransaction(pool,actor(res),async c=>{
   const jobs=(await c.query("SELECT id,campaign_id,revision,kind,state,attempts,last_error,updated_at FROM marketing_jobs WHERE state IN ('DEAD','RECONCILIATION_REQUIRED','RUNNING') ORDER BY updated_at DESC LIMIT 100")).rows;
   const queues=(await c.query("SELECT kind,state,count(*)::int AS count,min(created_at) AS oldest_created_at,min(run_after) AS earliest_run_after,count(*) FILTER(WHERE state='RUNNING' AND lease_until<now())::int AS expired_leases FROM marketing_jobs WHERE state<>'SUCCEEDED' GROUP BY kind,state ORDER BY kind,state")).rows;
   return {jobs,queues};
  });res.json({...result,observedAt:new Date().toISOString()});
 });
 router.get('/admin/campaigns/:id/recovery',admin,async(req,res)=>{const query=z.object({revision:z.coerce.number().int().positive()}).strict().parse(req.query);res.json(await inspectCampaignRecovery(pool,actor(res),id(req),query.revision));});
 router.post('/admin/campaigns/:id/recovery/adopt-pause',admin,async(req,res)=>{
  if(!extensions.pauseRecovery)throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','Recorded-pause recovery is not configured.',503);
  res.json(await extensions.pauseRecovery.adopt(actor(res),id(req),pauseRecoverySchema.parse(req.body),key(req)));
 });
 router.use(marketingErrorHandler);return router;
}
function requireNoPublicKeyLeak(body:unknown){z.object({}).strict().parse(body||{});}
