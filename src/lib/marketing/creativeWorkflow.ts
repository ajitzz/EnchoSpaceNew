import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { inTransaction } from './database.js';
import { readListing } from './workflow.js';
import { fingerprint, MarketingError, type Actor, type CampaignCreativeEvidence, type ListingEvidence } from './domain.js';
import { creativeConfirmSchema, creativeListSchema, creativeRequestSchema, creativeReviewSchema, creativeSelectionSchema, type CreativePage, type CreativeRecord } from './creativeContract.js';
import { creativeImageManifestSchema, validatePreparedCreativeImage, type CampaignImagePreparer, type PreparedCreativeImage } from './creativeImages.js';
import type { ImmutableCreativeStorage } from './creativeStorage.js';
import type { CreativeCdnVerifier } from './creativeCdn.js';

export interface CreativeWorkflowOptions {
 serviceActor: Actor;
 preparer: Pick<CampaignImagePreparer, 'prepareReview'>;
 storage: Pick<ImmutableCreativeStorage, 'put'>;
 verifyCdn: CreativeCdnVerifier;
}
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const idSchema = z.string().uuid();
const keySchema = z.string().min(8).max(180).regex(/^[A-Za-z0-9_.:-]+$/);
const publicColumns = 'id,ordinal,host_id,listing_id,source_asset_id,listing_snapshot,format,state,manifest,manifest_hash,storage_evidence,cdn_verified_at,host_confirmation,admin_review,error_code,created_at,updated_at';
const iso = (d: unknown) => d ? new Date(String(d)).toISOString() : null;
function project(r: any): CreativeRecord {
 const m = r.manifest;
 return { id:r.id,cursor:String(r.ordinal),listingId:r.listing_id,hostId:r.host_id,listingTitle:r.listing_snapshot.title,sourceAssetId:r.source_asset_id,format:r.format,state:r.state,manifestHash:r.manifest_hash,
  source:m?{hash:m.normalizedInput.sha256,byteLength:m.normalizedInput.byteLength,width:m.normalizedInput.width,height:m.normalizedInput.height}:null,
  output:m?{hash:m.output.sha256,byteLength:m.output.byteLength,width:m.output.width,height:m.output.height}:null,
  url:r.state==='APPROVED'?r.storage_evidence?.url??null:null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,cdnVerifiedAt:iso(r.cdn_verified_at),hostConfirmedAt:r.host_confirmation?.at??null,adminReviewedAt:r.admin_review?.at??null,reviewNote:r.admin_review?.note??null,errorCode:r.error_code };
}
export class CreativeWorkflowService {
 constructor(readonly pool:pg.Pool,readonly options:CreativeWorkflowOptions) {
  if(options.serviceActor.role!=='system'||!Number.isSafeInteger(options.serviceActor.id)||options.serviceActor.id<1||!options.preparer?.prepareReview||!options.storage?.put||!options.verifyCdn)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Image preparation, immutable storage, CDN verification and an audited worker identity are required',503);
 }
 private tx<T>(work:(c:pg.PoolClient)=>Promise<T>){return inTransaction(this.pool,this.options.serviceActor,work);}
 private async audit(c:pg.PoolClient,r:any,actor:Actor,type:string,evidence:unknown){await c.query('INSERT INTO marketing_creative_events(derivative_id,host_id,actor_id,actor_role,event_type,evidence) VALUES($1,$2,$3,$4,$5,$6)',[r.id,r.host_id,actor.id,actor.role,type,JSON.stringify(evidence)]);}
 private async actorExists(c:pg.PoolClient,actor:Actor,admin=false){
  if(!Number.isSafeInteger(actor.id)||actor.id<1||actor.role==='system'||admin&&actor.role!=='admin')throw new MarketingError('CREATIVE_ACCESS_DENIED','This account cannot perform that image review action',403);
  const u=await c.query('SELECT role FROM users WHERE id=$1 FOR SHARE',[actor.id]);
  if(!u.rows[0]||admin&&u.rows[0].role!=='admin')throw new MarketingError('CREATIVE_ACCESS_DENIED','Current account access could not be verified',403);
 }
 private async source(c:pg.PoolClient,listingId:number,sourceId:string,actor:Actor){
  const listing=await readListing(c,listingId,actor);
  if(listing.publicationStatus!=='published'||actor.role==='host'&&listing.hostId!==actor.id)throw new MarketingError('CREATIVE_SOURCE_CHANGED','This property is no longer available for this image request');
  const locked=await c.query("SELECT id,url,category,moderation_status FROM media_assets WHERE id::text=$1 AND entity_type='listing' AND entity_id=$2 FOR SHARE",[sourceId,listingId]);
  const asset=listing.media.find(m=>m.id===sourceId),row=locked.rows[0];
  if(!asset?.approved||asset.type!=='IMAGE'||!row||row.url!==asset.url||row.moderation_status!=='approved')throw new MarketingError('CREATIVE_SOURCE_CHANGED','The original approved image is no longer available');
  return listing;
 }
 private assertRow(r:any,listing:ListingEvidence){
  if(r.host_id!==listing.hostId||r.listing_hash!==fingerprint(listing))throw new MarketingError('CREATIVE_SOURCE_CHANGED','The property or source image changed. Prepare and review a new image.');
 }
 private async ownedRow(c:pg.PoolClient,actor:Actor,id:string,lock=false){
  idSchema.parse(id);
  const selected=await c.query('SELECT * FROM marketing_creative_derivatives WHERE id=$1 AND ($2 OR host_id=$3)',[id,actor.role==='admin'||actor.role==='system',actor.id]);
  if(!selected.rows[0])throw new MarketingError('CREATIVE_NOT_FOUND','Prepared image not found',404);
  const listing=await this.source(c,selected.rows[0].listing_id,selected.rows[0].source_asset_id,actor);
  const r=lock?(await c.query('SELECT * FROM marketing_creative_derivatives WHERE id=$1 FOR UPDATE',[id])).rows[0]:selected.rows[0];
  this.assertRow(r,listing); return r;
 }
 async request(actor:Actor,input:unknown,key:string):Promise<CreativePage>{
  const request=creativeRequestSchema.parse(input);keySchema.parse(key);const requestHash=fingerprint(request);
  return this.tx(async c=>{
   await this.actorExists(c,actor); await c.query('SELECT pg_advisory_xact_lock(7415,$1)',[actor.id]);
   const listing=await this.source(c,request.listingId,request.sourceAssetId,actor);
   if(listing.hostId!==actor.id)throw new MarketingError('CREATIVE_ACCESS_DENIED','Prepare an image from your own property',403);
   const prior=await c.query(`SELECT ${publicColumns},request_fingerprint FROM marketing_creative_derivatives WHERE host_id=$1 AND request_key=$2 ORDER BY ordinal`,[actor.id,key]);
   if(prior.rows.length){if(prior.rows.some(r=>r.request_fingerprint!==requestHash))throw new MarketingError('CREATIVE_REQUEST_CONFLICT','This request key belongs to another image preparation');return{items:prior.rows.map(project),nextCursor:null};}
   const recent=await c.query("SELECT count(DISTINCT request_key)::int AS n FROM marketing_creative_derivatives WHERE host_id=$1 AND created_at>now()-interval '1 hour'",[actor.id]);
   if(recent.rows[0].n>=5)throw new MarketingError('CREATIVE_RATE_LIMIT','Five image preparation requests are allowed per hour',429);
   const items:CreativeRecord[]=[];
   for(const format of request.formats){const result=await c.query(`INSERT INTO marketing_creative_derivatives(id,host_id,listing_id,source_asset_id,request_key,request_fingerprint,listing_snapshot,listing_hash,format,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED') RETURNING ${publicColumns}`,[randomUUID(),actor.id,listing.id,request.sourceAssetId,key,requestHash,JSON.stringify(listing),fingerprint(listing),format]);const r=result.rows[0];await this.audit(c,r,actor,'PREPARATION_REQUESTED',{rightsConfirmed:true,format,requestFingerprint:requestHash});items.push(project(r));}
   return{items,nextCursor:null};
  });
 }
 async list(actor:Actor,input:unknown={}):Promise<CreativePage>{
  const q=creativeListSchema.parse(input);
  return inTransaction(this.pool,actor,async c=>{await this.actorExists(c,actor,actor.role==='admin');const rows=await c.query(`SELECT ${publicColumns} FROM marketing_creative_derivatives WHERE ($1 OR host_id=$2) AND ($3::int IS NULL OR listing_id=$3) AND ($4::bigint IS NULL OR ordinal<$4) AND ($5::text IS NULL OR state=$5) ORDER BY ordinal DESC LIMIT $6`,[actor.role==='admin',actor.id,q.listingId??null,q.before??null,q.state??null,q.limit+1]);return{items:rows.rows.slice(0,q.limit).map(project),nextCursor:rows.rows.length>q.limit?String(rows.rows[q.limit-1].ordinal):null};});
 }
 async image(actor:Actor,id:string,view:'SOURCE'|'DERIVATIVE'){
  if(view!=='SOURCE'&&view!=='DERIVATIVE')throw new MarketingError('CREATIVE_IMAGE_VIEW_INVALID','Choose source or prepared image',422);
  return inTransaction(this.pool,actor,async c=>{await this.actorExists(c,actor,actor.role==='admin');const r=await this.ownedRow(c,actor,id);this.bytes(r);const bytes:Buffer=view==='SOURCE'?r.source_bytes:r.output_bytes;return{bytes:Buffer.from(bytes),contentType:'image/jpeg' as const,sha256:hash(bytes)};});
 }
 private bytes(r:any):PreparedCreativeImage{
  const manifest=creativeImageManifestSchema.parse(r.manifest);
  if(!Buffer.isBuffer(r.source_bytes)||!Buffer.isBuffer(r.output_bytes)||fingerprint(manifest)!==r.manifest_hash||hash(r.source_bytes)!==manifest.normalizedInput.sha256||r.source_bytes.length!==manifest.normalizedInput.byteLength||hash(r.output_bytes)!==manifest.output.sha256||r.output_bytes.length!==manifest.output.byteLength||manifest.listingEvidenceHash!==r.listing_hash||manifest.hostId!==r.host_id||manifest.listingId!==r.listing_id||manifest.sourceAssetId!==r.source_asset_id||manifest.transform.format!==r.format)throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH','Saved source, output and image evidence do not match');
  return{bytes:r.output_bytes,manifest,manifestHash:r.manifest_hash};
 }
 async confirm(actor:Actor,id:string,input:unknown){
  const v=creativeConfirmSchema.parse(input);
  return this.tx(async c=>{await this.actorExists(c,actor);const r=await this.ownedRow(c,actor,id,true);if(actor.id!==r.host_id)throw new MarketingError('CREATIVE_ACCESS_DENIED','Only the property owner can confirm this image',403);this.bytes(r);
   if(r.manifest_hash!==v.manifestHash)throw new MarketingError('CREATIVE_REVISION_CONFLICT','Review the exact current image evidence');
   if(r.host_confirmation)return project(r);
   if(r.state!=='HOST_REVIEW')throw new MarketingError('CREATIVE_STATE_CONFLICT','This image is not ready for host review');
   const evidence={...v,actorId:actor.id,at:new Date().toISOString()};const updated=await c.query(`UPDATE marketing_creative_derivatives SET state='ADMIN_REVIEW',host_confirmation=$2,updated_at=now() WHERE id=$1 RETURNING ${publicColumns}`,[id,JSON.stringify(evidence)]);await this.audit(c,r,actor,'HOST_CONFIRMED',evidence);return project(updated.rows[0]);
  });
 }
 async review(actor:Actor,id:string,input:unknown){
  const v=creativeReviewSchema.parse(input);
  return this.tx(async c=>{await this.actorExists(c,actor,true);const r=await this.ownedRow(c,actor,id,true);this.bytes(r);
   if(r.host_id===actor.id)throw new MarketingError('CREATIVE_SELF_REVIEW_DENIED','Another administrator must review images owned by this account',403);
   if(r.manifest_hash!==v.manifestHash)throw new MarketingError('CREATIVE_REVISION_CONFLICT','Review the exact current image evidence');
   if(r.admin_review){if(fingerprint({...r.admin_review,actorId:undefined,at:undefined})!==fingerprint({...v,actorId:undefined,at:undefined}))throw new MarketingError('CREATIVE_REVIEW_CONFLICT','This image already has an immutable review');return project(r);}
   if(r.state!=='ADMIN_REVIEW')throw new MarketingError('CREATIVE_STATE_CONFLICT','Host confirmation is required before admin review');
   const evidence={...v,actorId:actor.id,at:new Date().toISOString()};const updated=await c.query(`UPDATE marketing_creative_derivatives SET state=$2,admin_review=$3,updated_at=now() WHERE id=$1 RETURNING ${publicColumns}`,[id,v.decision==='APPROVE'?'APPROVED':'REJECTED',JSON.stringify(evidence)]);await this.audit(c,r,actor,'ADMIN_'+v.decision,evidence);return project(updated.rows[0]);
  });
 }
 async resolveForCampaign(c:pg.PoolClient,actor:Actor,input:unknown):Promise<CampaignCreativeEvidence>{
  const v=creativeSelectionSchema.parse(input);const r=await this.ownedRow(c,actor,v.derivativeId);const prepared=this.bytes(r);
  if(r.state!=='APPROVED'||r.listing_id!==v.listingId||r.source_asset_id!==v.sourceAssetId||r.manifest_hash!==v.manifestHash||!r.host_confirmation?.rightsConfirmed||!r.host_confirmation?.appearanceConfirmed||r.host_confirmation.manifestHash!==r.manifest_hash||r.admin_review?.decision!=='APPROVE'||!r.admin_review?.appearanceConfirmed||r.admin_review.manifestHash!==r.manifest_hash||!r.cdn_verified_at||r.storage_evidence?.manifestHash!==r.manifest_hash)throw new MarketingError('CREATIVE_NOT_APPROVED','Select the exact source image variant approved by the host and administrator');
  return{derivativeId:r.id,sourceAssetId:r.source_asset_id,manifestHash:r.manifest_hash,url:r.storage_evidence.url,originalSourceUrl:prepared.manifest.sourceUrl,outputHash:prepared.manifest.output.sha256};
 }
 async verifyForPublishing(actor:Actor,input:unknown):Promise<CampaignCreativeEvidence>{
  const v=creativeSelectionSchema.parse(input);
  const before=await inTransaction(this.pool,actor,async c=>{const result=await this.resolveForCampaign(c,actor,v);const r=(await c.query('SELECT manifest FROM marketing_creative_derivatives WHERE id=$1',[v.derivativeId])).rows[0];return{result,byteLength:r.manifest.output.byteLength};});
  await this.options.verifyCdn({url:before.result.url,sha256:before.result.outputHash,byteLength:before.byteLength});
  return inTransaction(this.pool,actor,async c=>{const after=await this.resolveForCampaign(c,actor,v);if(fingerprint(after)!==fingerprint(before.result))throw new MarketingError('CREATIVE_REVISION_CONFLICT','Image authority changed during CDN verification');return after;});
 }
 /** Exactly one format per tick. Unknown storage can replay only its immutable saved bytes. */
 async runOnce():Promise<{processed:boolean;id?:string;state?:string}>{
  const claim=await this.tx(async c=>{
   const r=(await c.query("SELECT * FROM marketing_creative_derivatives WHERE (state='QUEUED' AND next_run_at<=now() OR state='PROCESSING' AND lease_until<now()) ORDER BY ordinal FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!r)return null;
   if(r.attempts>=3){await c.query("UPDATE marketing_creative_derivatives SET state='BLOCKED',lease_until=NULL,error_code='CREATIVE_ATTEMPTS_EXHAUSTED',updated_at=now() WHERE id=$1",[r.id]);await this.audit(c,r,this.options.serviceActor,'PREPARATION_BLOCKED',{code:'CREATIVE_ATTEMPTS_EXHAUSTED'});return{...r,exhausted:true};}
   return(await c.query("UPDATE marketing_creative_derivatives SET state='PROCESSING',attempts=attempts+1,fence=fence+1,lease_until=now()+interval '120 seconds',updated_at=now() WHERE id=$1 RETURNING *",[r.id])).rows[0];
  });
  if(!claim)return{processed:false};if(claim.exhausted)return{processed:true,id:claim.id,state:'BLOCKED'};
  try{
   let saved=claim;
   if(!claim.manifest){
    const listing=await this.tx(async c=>{const l=await this.source(c,claim.listing_id,claim.source_asset_id,this.options.serviceActor);this.assertRow(claim,l);return l;});
    const prepared=await this.options.preparer.prepareReview(listing,claim.source_asset_id,{id:claim.host_id,role:'host'},true,[claim.format]);
    if(prepared.images.length!==1)throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH','One exact image format must be prepared per claim');
    const output=prepared.images[0];await validatePreparedCreativeImage(output);
    saved={...claim,source_bytes:prepared.sourceBytes,output_bytes:output.bytes,manifest:output.manifest,manifest_hash:output.manifestHash};this.bytes(saved);
    saved=await this.tx(async c=>{const l=await this.source(c,claim.listing_id,claim.source_asset_id,this.options.serviceActor);this.assertRow(claim,l);const result=await c.query("UPDATE marketing_creative_derivatives SET source_bytes=$3,output_bytes=$4,manifest=$5,manifest_hash=$6,updated_at=now() WHERE id=$1 AND fence=$2 AND state='PROCESSING' AND lease_until>now() AND manifest IS NULL RETURNING *",[claim.id,claim.fence,prepared.sourceBytes,output.bytes,JSON.stringify(output.manifest),output.manifestHash]);if(!result.rows[0])throw new MarketingError('CREATIVE_CLAIM_LOST','Another worker owns this image preparation');await this.audit(c,claim,this.options.serviceActor,'EXACT_BYTES_SAVED',{manifestHash:output.manifestHash,sourceHash:output.manifest.normalizedInput.sha256,outputHash:output.manifest.output.sha256});return result.rows[0];});
   }
   const output=this.bytes(saved);const stored=await this.options.storage.put(output);
   if(stored.manifestHash!==saved.manifest_hash||fingerprint(stored.manifest)!==saved.manifest_hash||stored.status!=='STORED')throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH','Storage returned different image evidence');
   await this.options.verifyCdn({url:stored.url,sha256:output.manifest.output.sha256,byteLength:output.bytes.length});
   await this.tx(async c=>{const l=await this.source(c,claim.listing_id,claim.source_asset_id,this.options.serviceActor);this.assertRow(claim,l);const result=await c.query("UPDATE marketing_creative_derivatives SET state='HOST_REVIEW',storage_evidence=$3,cdn_verified_at=now(),lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=$1 AND fence=$2 AND state='PROCESSING' AND lease_until>now() RETURNING id",[claim.id,claim.fence,JSON.stringify(stored)]);if(!result.rows[0])throw new MarketingError('CREATIVE_CLAIM_LOST','Another worker owns this image preparation');await this.audit(c,claim,this.options.serviceActor,'CDN_BYTES_VERIFIED',{manifestHash:saved.manifest_hash,outputHash:output.manifest.output.sha256});});
   return{processed:true,id:claim.id,state:'HOST_REVIEW'};
  }catch(error){
   const code=error instanceof MarketingError&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'CREATIVE_PREPARATION_FAILED';
   if(code==='CREATIVE_CLAIM_LOST')return{processed:true,id:claim.id,state:'CLAIM_LOST'};
   const terminal=claim.attempts>=3||['CREATIVE_SOURCE_CHANGED','CREATIVE_PROVENANCE_MISMATCH','MEDIA_NOT_APPROVED','IMAGE_PREPARATION_ONLY','CREATIVE_IMAGE_INVALID'].includes(code);
   await this.tx(async c=>{const result=await c.query("UPDATE marketing_creative_derivatives SET state=$3,error_code=$4,lease_until=NULL,next_run_at=now()+interval '60 seconds',updated_at=now() WHERE id=$1 AND fence=$2 AND state='PROCESSING' RETURNING id",[claim.id,claim.fence,terminal?'BLOCKED':'QUEUED',code]);if(result.rowCount)await this.audit(c,claim,this.options.serviceActor,'PREPARATION_'+(terminal?'BLOCKED':'RETRY_SCHEDULED'),{code,attempt:claim.attempts});});
   return{processed:true,id:claim.id,state:terminal?'BLOCKED':'QUEUED'};
  }
 }
}
