import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {generateListingSlug} from '../stayProjection.js';
import {Actor,CampaignDraft,ListingEvidence,CampaignCreativeEvidence,MarketingError,assertListing,draftSchema,editableStates,fingerprint,requireAdmin,requireRevision} from './domain.js';
import {inTransaction,lockWorkflow,event} from './database.js';
import {enqueue} from './jobs.js';
import type {AiEvaluation,CampaignAiReviewer} from './ai.js';
import {workspaceQuerySchema,containsPattern,type WorkspaceQuery} from './workspaceQuery.js';

export interface WorkflowFinancePort {
 quote(row:any,key:string):Promise<{id:string;snapshot:unknown}>;
 snapshot(row:any):Promise<any>;
 snapshots?(rows:any[],actor:Actor):Promise<Map<number,any>>;
 reserve(row:any,key:string):Promise<{id:string}>;
 reserveLocked(c:pg.PoolClient,row:any,key:string):Promise<{id:string}>;
 authorize(c:pg.PoolClient,row:any,operation:'CREATE_HIERARCHY'|'RESUME'|'UPDATE_BUDGET',amountMinor?:number):Promise<void>;
 fund(row:any,key:string):Promise<{url?:string;status:string;blockers?:string[]}>;
 policy():{currency:string;markupPercent:number;configured:boolean;version?:number;costItems?:{label:string;amountMinor:string}[]};
}
export interface WorkflowOptions{ai:CampaignAiReviewer;finance:WorkflowFinancePort;publishingEnabled:boolean;activationEnabled:boolean;fundingEnabled:boolean;configurationReasons:string[];evaluationTimeoutMs?:number;validateTargeting?:(draft:CampaignDraft)=>Promise<void>;metaCountries?:readonly string[];activationBlockers?:(provider:'GOOGLE'|'META')=>string[];resolveCreative?:(c:pg.PoolClient,actor:Actor,draft:CampaignDraft,listing:ListingEvidence)=>Promise<CampaignCreativeEvidence>;verifyCreativeForPublishing?:(row:any,actor:Actor)=>Promise<void>;}
export async function readListing(c:pg.PoolClient,id:number,actor:Actor):Promise<ListingEvidence>{
 const r=await c.query(`SELECT id,user_id,title,description,slug,city,publication_status,currency,price FROM listings WHERE id=$1 AND ($2 OR user_id=$3) FOR SHARE`,[id,actor.role==='admin'||actor.role==='system',actor.id]);
 if(!r.rows[0])throw new MarketingError('LISTING_NOT_AVAILABLE','Property not found',404);const l=r.rows[0];
 const media=await c.query(`SELECT id,url,category,moderation_status FROM media_assets WHERE entity_type='listing' AND entity_id=$1 ORDER BY is_hero DESC,order_index,id LIMIT 100`,[id]);
 return {id:Number(l.id),hostId:Number(l.user_id),title:l.title,description:l.description||'',slug:l.slug||generateListingSlug(l.title,l.id),city:l.city||'',publicationStatus:l.publication_status,currency:l.currency,price:String(l.price),media:media.rows.map(m=>({id:String(m.id),url:m.url,type:m.category==='video'||/\.(mp4|mov|webm)(\?|$)/i.test(m.url)?'VIDEO':'IMAGE',approved:m.moderation_status==='approved'}))};
}
export class MarketingWorkflowService{
 private readonly evaluationTimeoutMs:number;
 constructor(public readonly pool:pg.Pool,public readonly options:WorkflowOptions){
  this.evaluationTimeoutMs=options.evaluationTimeoutMs??45000;
  if(!Number.isInteger(this.evaluationTimeoutMs)||this.evaluationTimeoutMs<1||this.evaluationTimeoutMs>60000)throw new MarketingError('EVALUATION_TIMEOUT_INVALID','Evaluation timeout must be between 1 and 60000 milliseconds',500);
 }
 private async creativeSnapshot(c:pg.PoolClient,draft:CampaignDraft,listing:ListingEvidence,actor:Actor):Promise<ListingEvidence>{
  if(!draft.creativeDerivativeId)return listing;
  const source=listing.media.find(m=>m.id===draft.mediaIds[0]);
  if(draft.provider!=='META'||!source?.approved||source.type!=='IMAGE')throw new MarketingError('CREATIVE_SOURCE_INVALID','A reviewed image variant must use the first approved still image of this Meta campaign.');
  if(!this.options.resolveCreative)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Reviewed image variants are unavailable in this environment.',503);
  const creative=await this.options.resolveCreative(c,actor,draft,listing);
  if(creative.derivativeId!==draft.creativeDerivativeId||creative.manifestHash!==draft.creativeManifestHash||creative.sourceAssetId!==source.id||creative.originalSourceUrl!==source.url||!/^https:\/\//.test(creative.url)||! /^[a-f0-9]{64}$/.test(creative.outputHash))throw new MarketingError('CREATIVE_EVIDENCE_MISMATCH','The reviewed image variant does not match this campaign source.');
  return {...listing,campaignCreative:creative};
 }
 private aiListing(row:any):ListingEvidence{
  const listing=row.listing_snapshot as ListingEvidence,creative=listing.campaignCreative;
  return creative?{...listing,media:listing.media.map(asset=>asset.id===creative.sourceAssetId?{...asset,url:creative.url}:asset)}:listing;
 }
 private reviewFallback(row:any,note:string):AiEvaluation{return {status:'REQUIRES_REVIEW',score:null,notes:[note],revision:row.revision,evidenceHash:fingerprint({draft:row.draft,listing:row.listing_snapshot}),mediaReviewed:[],model:null,evaluatedAt:new Date().toISOString()};}
 /** Expired read-only AI work can recover safely; provider writes never use this lease recovery. */
 async recoverExpiredEvaluations(actor:Actor,campaignId?:number):Promise<number>{
  return inTransaction(this.pool,actor,async c=>{
   const rows=(await c.query(`SELECT * FROM marketing_campaign_workflows WHERE state='EVALUATING' AND ($1 OR host_id=$2) AND ($3::int IS NULL OR campaign_id=$3) AND COALESCE((ai->'evaluation'->>'expiresAt')::timestamptz,updated_at+interval '75 seconds')<=clock_timestamp() ORDER BY updated_at,campaign_id LIMIT 100 FOR UPDATE SKIP LOCKED`,[actor.role==='admin'||actor.role==='system',actor.id,campaignId??null])).rows;
   for(const row of rows){
    const result=this.reviewFallback(row,'The AI review was interrupted or its lease expired. No automatic pass was issued; retry evaluation or complete documented human review.');
    await c.query(`UPDATE marketing_campaign_workflows SET state='PENDING_ADMIN',ai=$2,content_approval='{"status":"PENDING","revision":null}',updated_at=now() WHERE campaign_id=$1`,[row.campaign_id,JSON.stringify(result)]);
    await event(c,row,actor,'AI_REVIEW_RECOVERED',{evaluationId:row.ai.evaluation?.id??null,reason:'LEASE_EXPIRED',result});
   }
   return rows.length;
  });
 }
 async get(id:number,actor:Actor){await this.recoverExpiredEvaluations(actor,id);return inTransaction(this.pool,actor,async c=>{const r=await c.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1 AND ($2 OR host_id=$3)',[id,actor.role==='admin'||actor.role==='system',actor.id]);if(!r.rows[0])throw new MarketingError('CAMPAIGN_NOT_FOUND','Campaign not found',404);return r.rows[0];});}
 async create(actor:Actor,input:unknown,requestKey:string=randomUUID()){
  const draft=draftSchema.parse(input);
  if(this.options.validateTargeting){
   const existing=await inTransaction(this.pool,actor,async c=>{
    const replay=(await c.query('SELECT * FROM marketing_create_requests WHERE host_id=$1 AND request_key=$2',[actor.id,requestKey])).rows[0];
    if(replay){if(replay.fingerprint!==fingerprint(draft))throw new MarketingError('IDEMPOTENCY_CONFLICT','Draft creation key is already bound to different content');return (await c.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1 AND host_id=$2',[replay.campaign_id,actor.id])).rows[0];}
    const listing=await readListing(c,draft.listingId,actor);assertListing(draft,listing,actor.id);return null;
   });
   if(existing)return existing;
   await this.options.validateTargeting(draft);
  }
  return inTransaction(this.pool,actor,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(7825,$1)',[actor.id]);
   const replay=(await c.query('SELECT * FROM marketing_create_requests WHERE host_id=$1 AND request_key=$2',[actor.id,requestKey])).rows[0];
   if(replay){if(replay.fingerprint!==fingerprint(draft))throw new MarketingError('IDEMPOTENCY_CONFLICT','Draft creation key is already bound to different content');return (await c.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1',[replay.campaign_id])).rows[0];}
   const listing=await readListing(c,draft.listingId,actor);assertListing(draft,listing,actor.id);const snapshot=await this.creativeSnapshot(c,draft,listing,actor);
   const parent=await c.query(`INSERT INTO host_marketing_campaigns(host_id,listing_id,title,description,platforms,budget,status) VALUES($1,$2,$3,$4,$5,$6,'HARVO_V2') RETURNING id`,[actor.id,draft.listingId,draft.title,draft.description,JSON.stringify([draft.provider.toLowerCase()]),Number(draft.mediaBudgetMinor)/100]);
   const id=parent.rows[0].id;
   const row=(await c.query(`INSERT INTO marketing_campaign_workflows(campaign_id,host_id,listing_id,revision,provider,state,draft,listing_snapshot,listing_hash) VALUES($1,$2,$3,1,$4,'DRAFT',$5,$6,$7) RETURNING *`,[id,actor.id,draft.listingId,draft.provider,JSON.stringify(draft),JSON.stringify(snapshot),fingerprint(listing)])).rows[0];
   await c.query('INSERT INTO marketing_create_requests(host_id,request_key,fingerprint,campaign_id) VALUES($1,$2,$3,$4)',[actor.id,requestKey,fingerprint(draft),id]);
   await this.saveRevision(c,row);await event(c,row,actor,'DRAFT_CREATED',{listingHash:row.listing_hash});return row;
  });
 }
 private async saveRevision(c:pg.PoolClient,row:any){await c.query(`INSERT INTO marketing_campaign_revisions(campaign_id,revision,host_id,draft,listing_snapshot,listing_hash) VALUES($1,$2,$3,$4,$5,$6)`,[row.campaign_id,row.revision,row.host_id,row.draft,row.listing_snapshot,row.listing_hash]);}
 async update(id:number,actor:Actor,revision:number,input:unknown){
  const draft=draftSchema.parse(input);
  if(this.options.validateTargeting){const current=await this.get(id,actor);requireRevision(current,revision);if(!editableStates.has(current.state)||current.quote_id)throw new MarketingError('CAMPAIGN_LOCKED','Quoted or dispatched campaigns are immutable.');if(draft.listingId!==current.listing_id||draft.provider!==current.provider)throw new MarketingError('IDENTITY_IMMUTABLE','Property and provider cannot change on an existing campaign');await this.options.validateTargeting(draft);}
  return inTransaction(this.pool,actor,async c=>{const row=await lockWorkflow(c,id,actor);requireRevision(row,revision);
   if(!editableStates.has(row.state)||row.quote_id)throw new MarketingError('CAMPAIGN_LOCKED','Quoted or dispatched campaigns are immutable. Create a new campaign revision before funding.');
   if(draft.listingId!==row.listing_id||draft.provider!==row.provider)throw new MarketingError('IDENTITY_IMMUTABLE','Property and provider cannot change on an existing campaign');
   const listing=await readListing(c,row.listing_id,actor);assertListing(draft,listing,row.host_id);const snapshot=await this.creativeSnapshot(c,draft,listing,actor);
   const updated=(await c.query(`UPDATE marketing_campaign_workflows SET revision=revision+1,state='DRAFT',draft=$2,listing_snapshot=$3,listing_hash=$4,ai='{"status":"NOT_EVALUATED","score":null,"notes":[]}',content_approval='{"status":"PENDING","revision":null}',updated_at=now() WHERE campaign_id=$1 RETURNING *`,[id,JSON.stringify(draft),JSON.stringify(snapshot),fingerprint(listing)])).rows[0];
   await this.saveRevision(c,updated);await event(c,updated,actor,'DRAFT_REVISED',{previousRevision:row.revision});return updated;
  });
 }
 async evaluate(id:number,actor:Actor,revision:number){
  await this.recoverExpiredEvaluations(actor,id);
  const evaluationId=randomUUID();
  const row=await inTransaction(this.pool,actor,async c=>{const row=await lockWorkflow(c,id,actor);requireRevision(row,revision);
   if(!editableStates.has(row.state)||row.quote_id)throw new MarketingError('CAMPAIGN_LOCKED','This revision is locked');
   // Cross-process host rate limit. The lock and attempt insertion share one transaction.
   await c.query('SELECT pg_advisory_xact_lock(7824,$1)',[row.host_id]);
   const count=await c.query("SELECT count(*)::int AS n FROM marketing_ai_attempts WHERE host_id=$1 AND created_at>now()-interval '1 hour'",[row.host_id]);
   if(count.rows[0].n>=5)throw new MarketingError('AI_RATE_LIMIT','Five campaign evaluations per hour are available. Review the existing recommendations before trying again.',429);
   await this.assertCurrentListing(c,row,actor);
   await c.query('INSERT INTO marketing_ai_attempts(host_id,campaign_id,revision) VALUES($1,$2,$3)',[row.host_id,id,revision]);
   await c.query(`UPDATE marketing_campaign_workflows SET state='EVALUATING',ai=$2::jsonb || jsonb_build_object('evaluation',jsonb_build_object('id',$3::text,'expiresAt',clock_timestamp()+($4::int*interval '1 millisecond'))),updated_at=now() WHERE campaign_id=$1`,[id,JSON.stringify({status:'EVALUATING',score:null,notes:[],revision}),evaluationId,this.evaluationTimeoutMs+15000]);
   await event(c,row,actor,'AI_REVIEW_STARTED',{evaluationId,timeoutMs:this.evaluationTimeoutMs});return row;
  });
  let timer:ReturnType<typeof setTimeout>|undefined;
  let result:AiEvaluation;
  try{result=await Promise.race([this.options.ai.evaluate(row.draft,this.aiListing(row),row.revision),new Promise<AiEvaluation>(resolve=>{timer=setTimeout(()=>resolve(this.reviewFallback(row,'AI review exceeded its time limit. No automatic pass was issued; retry evaluation or complete documented human review.')),this.evaluationTimeoutMs);})]);}
  catch{result=this.reviewFallback(row,'AI review could not complete. No automatic pass was issued; retry evaluation or complete documented human review.');}
  finally{if(timer)clearTimeout(timer);}
  return inTransaction(this.pool,actor,async c=>{const current=await lockWorkflow(c,id,actor);requireRevision(current,revision);if(current.state!=='EVALUATING'||current.ai.evaluation?.id!==evaluationId)throw new MarketingError('EVALUATION_SUPERSEDED','This evaluation was superseded');
   const state=result.status==='REJECTED'?'AI_REJECTED':'PENDING_ADMIN';
   const updated=(await c.query(`UPDATE marketing_campaign_workflows SET state=$2,ai=$3,content_approval='{"status":"PENDING","revision":null}',updated_at=now() WHERE campaign_id=$1 RETURNING *`,[id,state,JSON.stringify(result)])).rows[0];await event(c,updated,actor,'AI_REVIEW_COMPLETED',result);return updated;});
 }
 async submit(id:number,actor:Actor,revision:number){return inTransaction(this.pool,actor,async c=>{const row=await lockWorkflow(c,id,actor);requireRevision(row,revision);if(!row.draft.rightsConfirmed||!['PASSED','REQUIRES_REVIEW'].includes(row.ai.status)||row.ai.revision!==revision||row.state!=='PENDING_ADMIN')throw new MarketingError('REVIEW_REQUIRED','Complete media rights and campaign evaluation before submitting');await event(c,row,actor,'HOST_SUBMITTED',{revision});return row;});}
 async review(id:number,actor:Actor,input:{revision:number;decision:'APPROVE'|'REJECT';note:string;policyConfirmed?:boolean;mediaConfirmed?:boolean}){
  requireAdmin(actor);if(input.note.trim().length<10||input.note.length>2000)throw new MarketingError('REVIEW_NOTE_REQUIRED','Record a meaningful review note (10–2000 characters)',422);
  return inTransaction(this.pool,actor,async c=>{const row=await lockWorkflow(c,id,actor);requireRevision(row,input.revision);
   if(row.state!=='PENDING_ADMIN')throw new MarketingError('NOT_IN_REVIEW','This campaign is not awaiting review');
   if(input.decision==='APPROVE'){
    if(!input.policyConfirmed||!input.mediaConfirmed||!row.draft.rightsConfirmed)throw new MarketingError('REVIEW_EVIDENCE_REQUIRED','Confirm media rights, actual assets and provider policy review');
    if(!['PASSED','REQUIRES_REVIEW'].includes(row.ai.status)||row.ai.revision!==row.revision)throw new MarketingError('AI_REVIEW_REQUIRED','A current evaluation is required before admin approval');
    await this.assertCurrentListing(c,row,actor);
   }
   const approval={status:input.decision==='APPROVE'?'APPROVED':'REJECTED',revision:row.revision,note:input.note.trim(),adminId:actor.id,policyConfirmed:!!input.policyConfirmed,mediaConfirmed:!!input.mediaConfirmed,reviewedAt:new Date().toISOString(),aiFallback:row.ai.status==='REQUIRES_REVIEW'};
   const updated=(await c.query('UPDATE marketing_campaign_workflows SET state=$2,content_approval=$3,updated_at=now() WHERE campaign_id=$1 RETURNING *',[id,input.decision==='APPROVE'?'APPROVED':'ADMIN_REJECTED',JSON.stringify(approval)])).rows[0];await event(c,updated,actor,'ADMIN_CONTENT_REVIEW',approval);return updated;
  });
 }
 async assertCurrentListing(c:pg.PoolClient,row:any,actor:Actor){const listing=await readListing(c,row.listing_id,actor);assertListing(row.draft,listing,row.host_id);if(fingerprint(listing)!==row.listing_hash)throw new MarketingError('LISTING_CHANGED','Property price, details or media changed. Review a new campaign before publication.');const current=await this.creativeSnapshot(c,row.draft,listing,actor);if(fingerprint(current.campaignCreative??null)!==fingerprint(row.listing_snapshot.campaignCreative??null))throw new MarketingError('CREATIVE_EVIDENCE_CHANGED','Image-variant approval changed. Review a new campaign revision.');}
 async quote(id:number,actor:Actor,revision:number,key:string){
  const row=await this.get(id,actor);requireRevision(row,revision);if(row.state!=='APPROVED')throw new MarketingError('CONTENT_APPROVAL_REQUIRED','Approve the exact campaign content before finalizing its funding quote');
  const result=await this.options.finance.quote(row,key);
  return inTransaction(this.pool,actor,async c=>{const current=await lockWorkflow(c,id,actor);requireRevision(current,revision);if(current.state!=='APPROVED')throw new MarketingError('STATE_CONFLICT','Campaign review state changed');if(current.quote_id&&current.quote_id!==result.id)throw new MarketingError('QUOTE_EXISTS','This revision already has an immutable quote');await c.query('UPDATE marketing_campaign_workflows SET quote_id=$2,updated_at=now() WHERE campaign_id=$1',[id,result.id]);await event(c,current,actor,'QUOTE_SNAPSHOTTED',{quoteId:result.id});return {...current,quote_id:result.id};});
 }
 async fund(id:number,actor:Actor,revision:number,key:string){if(!this.options.fundingEnabled)throw new MarketingError('FUNDING_NOT_CONFIGURED','Campaign checkout requires configured payment and cost policies',503);const row=await this.get(id,actor);requireRevision(row,revision);if(!row.quote_id||row.state!=='APPROVED')throw new MarketingError('QUOTE_REQUIRED','An approved immutable quote is required');return this.options.finance.fund(row,key);}
 async schedule(id:number,actor:Actor,revision:number,action:'PUBLISH'|'ACTIVATE'|'PAUSE',key:string){
  if(action!=='PAUSE')requireAdmin(actor);
  if(action==='PUBLISH'&&!this.options.publishingEnabled)throw new MarketingError('PUBLISH_NOT_CONFIGURED','Provider publication is not configured and cleared for this environment',503);
  if(action==='ACTIVATE'&&!this.options.activationEnabled)throw new MarketingError('ACTIVATION_NOT_CONFIGURED','Live spending is not enabled for this environment',503);
  let row=await this.get(id,actor);requireRevision(row,revision);
  if(action==='ACTIVATE'&&this.options.activationBlockers?.(row.provider).length)throw new MarketingError('CONVERSION_AUTHORITY_REQUIRED','Accepted booking capture, current consent and this channel’s conversion destination are required before spending.',503);
  return inTransaction(this.pool,actor,async c=>{row=await lockWorkflow(c,id,actor);requireRevision(row,revision);
   const operationKey=action==='PUBLISH'?`PUBLISH:${id}:${revision}`:`${action}:${id}:${revision}:${key}`;
   const previous=(await c.query('SELECT state FROM marketing_jobs WHERE dedupe_key=$1',[operationKey])).rows[0];
   if(previous?.state==='SUCCEEDED')return row;
   if(previous&&['DEAD','RECONCILIATION_REQUIRED'].includes(previous.state))throw new MarketingError('OPERATION_RECONCILIATION_REQUIRED','The previous operation needs verified reconciliation before another attempt');
   const expected=action==='PUBLISH'?['APPROVED','PUBLISH_QUEUED']:action==='ACTIVATE'?['PROVIDER_PAUSED','PAUSED','ACTIVATION_QUEUED']:['PROVIDER_REVIEW','LIVE','PAUSED','PROVIDER_PAUSED','PAUSE_QUEUED','RECONCILIATION_REQUIRED'];
   if(!expected.includes(row.state))throw new MarketingError('STATE_CONFLICT','This action is not available in the current campaign state');
   if(action!=='PAUSE'){
    if(row.content_approval.status!=='APPROVED'||row.content_approval.revision!==row.revision)throw new MarketingError('CONTENT_APPROVAL_REQUIRED','Exact-revision content approval is required');
    await this.assertCurrentListing(c,row,actor);
    if(action==='PUBLISH'&&!row.reservation_id){const reservation=await this.options.finance.reserveLocked(c,row,`reserve:${id}:${revision}`);row.reservation_id=reservation.id;await c.query('UPDATE marketing_campaign_workflows SET reservation_id=$2 WHERE campaign_id=$1',[id,reservation.id]);}
    await this.options.finance.authorize(c,row,action==='PUBLISH'?'CREATE_HIERARCHY':'RESUME');
   }
   const jobId=await enqueue(c,{campaignId:id,revision,kind:action,key:operationKey,payload:{actorId:actor.id,actorRole:actor.role}});
   const state=action==='PUBLISH'?'PUBLISH_QUEUED':action==='ACTIVATE'?'ACTIVATION_QUEUED':'PAUSE_QUEUED';await c.query('UPDATE marketing_campaign_workflows SET state=$2,pending_job_id=$3,updated_at=now() WHERE campaign_id=$1',[id,state,jobId]);await event(c,row,actor,'OPERATION_QUEUED',{action,jobId});return {...row,state};
  });
 }
 async project(row:any,financial?:any){
  const finance=financial??await this.options.finance.snapshot(row);const truth=row.provider_truth;const telemetry=row.telemetry;
  const activationBlockers=this.options.activationBlockers?.(row.provider)??[];const blockers=[...this.options.configurationReasons,...activationBlockers];if(row.ai.status!=='PASSED')blockers.push(row.ai.status==='REQUIRES_REVIEW'?'AI could not certify this revision; documented human review is required.':'Campaign AI review has not passed.');
  if(row.content_approval.status!=='APPROVED')blockers.push('Administrator content approval is pending.');if(!finance.funding?.released)blockers.push('Captured funding and risk-release evidence are required before spending.');if(row.last_error)blockers.push(row.last_error);
  return {id:row.campaign_id,revision:row.revision,listingId:row.listing_id,listingTitle:row.listing_snapshot.title,title:row.draft.title,provider:row.provider,status:row.state,...row.draft,creativePreview:row.listing_snapshot.campaignCreative??null,ai:row.ai,quote:finance.quote||null,funding:finance.funding||{status:'UNFUNDED',capturedMinor:null,reservedMinor:null,released:false},contentApproval:row.content_approval,delivery:{configuredStatus:truth?.configuredStatus??null,observedStatus:truth?.observedStatus??null,observedAt:truth?.observedAt??null,externalCampaignId:truth?.externalCampaignId??null},metrics:telemetry?{impressions:telemetry.impressions,clicks:telemetry.clicks,ctr:telemetry.ctr,leads:telemetry.leads??null,bookings:telemetry.bookings??null,spendMinor:telemetry.spendMinor,observedAt:telemetry.observedAt,source:telemetry.source}:null,blockers,activationBlockers};
 }
 async workspace(actor:Actor,input:WorkspaceQuery={}){
  const query=workspaceQuerySchema.parse(input);
  await this.recoverExpiredEvaluations(actor);
  const data=await inTransaction(this.pool,actor,async c=>{
   const all=(await c.query(`SELECT * FROM marketing_campaign_workflows WHERE ($1 OR host_id=$2) AND ($3::bigint IS NULL OR campaign_id<$3) AND ($4='' OR draft->>'title' ILIKE $5 ESCAPE E'\\\\' OR listing_snapshot->>'title' ILIKE $5 ESCAPE E'\\\\' OR campaign_id::text=$4) AND ($6='all' OR $6='review' AND state='PENDING_ADMIN' OR $6='exceptions' AND (last_error IS NOT NULL OR state IN ('FAILED','RECONCILIATION_REQUIRED','AI_REJECTED','ADMIN_REJECTED'))) ORDER BY campaign_id DESC LIMIT 31`,[actor.role==='admin',actor.id,query.before??null,query.search,containsPattern(query.search),query.filter])).rows;
   const rows=all.slice(0,30);
   const propertyRows=(await c.query(`SELECT page.*,'PICKER' AS view_role FROM (SELECT id,user_id,title,slug,city,publication_status FROM listings WHERE ($1 OR user_id=$2) AND publication_status='published' AND ($3::bigint IS NULL OR id<$3) AND ($4='' OR title ILIKE $5 ESCAPE E'\\\\' OR city ILIKE $5 ESCAPE E'\\\\') ORDER BY id DESC LIMIT 51) page UNION ALL SELECT id,user_id,title,slug,city,publication_status,'CAMPAIGN' AS view_role FROM listings WHERE ($1 OR user_id=$2) AND id=ANY($6::int[]) ORDER BY view_role,id DESC`,[actor.role==='admin',actor.id,query.listingBefore??null,query.listingSearch,containsPattern(query.listingSearch),[...new Set(rows.map(r=>r.listing_id))]])).rows;
   const listingRows=propertyRows.filter(l=>l.view_role==='PICKER');
   const ls=listingRows.slice(0,50);
   // Campaign previews remain available when their property is outside the picker page.
   const related=propertyRows.filter(l=>l.view_role==='CAMPAIGN');
   const assets=(await c.query(`SELECT a.* FROM unnest($1::int[]) requested(id) CROSS JOIN LATERAL (SELECT id,entity_id,url,category,moderation_status FROM media_assets WHERE entity_type='listing' AND entity_id=requested.id AND moderation_status='approved' ORDER BY is_hero DESC,order_index,id LIMIT 100) a`,[[...new Set([...ls,...related].map(l=>l.id))]])).rows;
   const listingView=(l:any)=>({id:l.id,title:l.title,slug:l.slug||generateListingSlug(l.title,l.id),city:l.city,publicationStatus:l.publication_status,media:assets.filter(m=>m.entity_id===l.id).map(m=>({id:String(m.id),url:m.url,type:m.category==='video'||/\.(mp4|mov|webm)(\?|$)/i.test(m.url)?'VIDEO':'IMAGE',approved:true}))});
   return {rows,listings:ls.map(listingView),campaignListings:related.map(listingView),nextCursor:all.length>30?Number(rows.at(-1).campaign_id):null,listingNextCursor:listingRows.length>50?Number(ls.at(-1).id):null};
  });
  const finances=await this.options.finance.snapshots?.(data.rows,actor);
  return {listings:data.listings,campaignListings:data.campaignListings,campaigns:await Promise.all(data.rows.map(r=>this.project(r,finances?.get(r.campaign_id)))),policy:this.options.finance.policy(),capabilities:{funding:this.options.fundingEnabled,publish:this.options.publishingEnabled,activate:this.options.activationEnabled,reason:this.options.configurationReasons.join(' '),metaCountries:[...(this.options.metaCountries??[])]},page:{limit:30,mayHaveMore:data.nextCursor!==null,nextCursor:data.nextCursor,order:'CREATED_NEWEST'},listingPage:{limit:50,mayHaveMore:data.listingNextCursor!==null,nextCursor:data.listingNextCursor}};
 }
}
