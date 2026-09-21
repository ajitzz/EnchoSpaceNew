import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {inTransaction} from '../database.js';
import {MarketingError,fingerprint,type Actor,type CampaignCreativeEvidence} from '../domain.js';
import {readListing} from '../workflow.js';
import {factCaptureSchema,productSchema,type CanonicalMarketingFact,type CanonicalMarketingFactProjection} from './contracts.js';

type AssetResolver=(c:pg.PoolClient,actor:Actor,input:{listingId:number;sourceAssetId:string;derivativeId:string;manifestHash:string})=>Promise<CampaignCreativeEvidence>;
const keyPattern=/^[a-zA-Z0-9:_-]{8,160}$/;
const plain=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max&&value.trim()?value.trim():null;

/** Published owner-supplied statements are grounded evidence, not independently certified claims. */
export class CanonicalMarketingFacts {
 constructor(private readonly pool:pg.Pool,private readonly resolveAsset?:AssetResolver){}
 private async authorize(c:pg.PoolClient,actor:Actor){
  const current=(await c.query('SELECT role FROM users WHERE id=$1 FOR SHARE',[actor.id])).rows[0];
  if(!current||actor.role==='system'||actor.role==='admin'&&current.role!=='admin')throw new MarketingError('FACT_ACCESS_DENIED','Current account access is required.',403);
 }
 async read(c:pg.PoolClient,actor:Actor,listingId:number):Promise<CanonicalMarketingFactProjection>{
  await this.authorize(c,actor);
  // A single statement snapshots all canonical facts. Row locks protect the listing while capturing.
  const row=(await c.query(`SELECT l.id,l.user_id,l.title,l.description,l.city,l.slug,l.publication_status,l.amenities,
   (SELECT coalesce(jsonb_agg(r ORDER BY r.id),'[]'::jsonb) FROM (SELECT id,name,description,amenities FROM room_types WHERE listing_id=l.id ORDER BY id LIMIT 101) r) AS rooms
   FROM listings l WHERE l.id=$1 AND ($2 OR l.user_id=$3) FOR SHARE OF l`,[listingId,actor.role==='admin',actor.id])).rows[0];
  if(!row||row.publication_status!=='published'||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(row.slug||''))throw new MarketingError('LISTING_NOT_AVAILABLE','Choose an owned, published property with its canonical address.',404);
  if(row.rooms.length>100)throw new MarketingError('FACT_LIMIT_EXCEEDED','This property requires a bounded editorial fact selection.');
  const facts:CanonicalMarketingFact[]=[];
  const add=(source:CanonicalMarketingFact['source'],sourceId:number,field:string,value:unknown,max=10000)=>{
   if(typeof value==='string'&&value.length>max)throw new MarketingError('FACT_LIMIT_EXCEEDED','This fact exceeds the supported editorial limit.');
   const text=plain(value,max);if(!text)return;
   const evidence={source,sourceId,field,value:text,authority:'HOST_SUPPLIED_PUBLISHED' as const};facts.push({id:fingerprint(evidence),...evidence});
  };
  const amenities=(source:CanonicalMarketingFact['source'],sourceId:number,value:unknown)=>{
   if(!Array.isArray(value))return;
   if(value.length>100)throw new MarketingError('FACT_LIMIT_EXCEEDED','This property requires a bounded amenity selection.');
   for(const item of [...new Set(value.filter(v=>typeof v==='string'))].sort())add(source,sourceId,'amenity',item,200);
  };
  for(const field of ['title','description','city'])add('PUBLISHED_LISTING',row.id,field,row[field]);
  amenities('PUBLISHED_LISTING',row.id,row.amenities);
  for(const room of row.rooms){add('CANONICAL_ROOM',room.id,'name',room.name,255);add('CANONICAL_ROOM',room.id,'description',room.description);amenities('CANONICAL_ROOM',room.id,room.amenities);}
  if(facts.length>300||Buffer.byteLength(JSON.stringify(facts))>131072)throw new MarketingError('FACT_LIMIT_EXCEEDED','Select a smaller bounded set of editorial facts.');
  const listing=await readListing(c,listingId,actor);
  const evidence={version:1 as const,listingId,hostId:row.user_id,canonicalPath:`/stay/${row.slug}`,listingHash:fingerprint(listing),facts};
  return {...evidence,factHash:fingerprint(evidence)};
 }
 async preview(actor:Actor,listingId:number){
  if(!Number.isSafeInteger(listingId)||listingId<1)throw new MarketingError('INVALID_INPUT','A valid listing is required.',422);
  return inTransaction(this.pool,actor,c=>this.read(c,actor,listingId));
 }
 async capture(actor:Actor,input:unknown,key:string){
  const body=factCaptureSchema.parse(input);
  if(!keyPattern.test(key))throw new MarketingError('INVALID_INPUT','A stable request identity is required.',422);
  const requestHash=fingerprint(body);
  return inTransaction(this.pool,actor,c=>this.captureLocked(c,actor,body,key,requestHash));
 }
 private async captureLocked(c:pg.PoolClient,actor:Actor,body:ReturnType<typeof factCaptureSchema.parse>,key:string,requestHash:string){
   await this.authorize(c,actor);
   const projection=await this.read(c,actor,body.listingId);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`marketing-facts:${projection.hostId}:${key}`]);
   const old=(await c.query('SELECT * FROM marketing_fact_snapshots WHERE host_id=$1 AND request_key=$2',[projection.hostId,key])).rows[0];
   if(old){if(old.request_fingerprint!==requestHash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This snapshot request already has different evidence.');return {...old,idempotent:true};}
   if(projection.factHash!==body.expectedHash)throw new MarketingError('FACTS_CHANGED','Property facts changed. Review the current property evidence.');
   if(body.assets.length&&!this.resolveAsset)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Reviewed asset evidence is unavailable.',503);
   const assets:CampaignCreativeEvidence[]=[];
   for(const selection of body.assets)assets.push(await this.resolveAsset!(c,actor,{listingId:body.listingId,...selection}));
   const id=randomUUID(),manifestHash=fingerprint({projection,assets});
   const saved=(await c.query(`INSERT INTO marketing_fact_snapshots(id,host_id,listing_id,request_key,request_fingerprint,fact_hash,manifest_hash,projection,assets)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,projection.hostId,body.listingId,key,requestHash,projection.factHash,manifestHash,JSON.stringify(projection),JSON.stringify(assets)])).rows[0];
   return {...saved,idempotent:false};
 }
 async bindDedicated(c:pg.PoolClient,actor:Actor,listing:import('../domain.js').ListingEvidence){
  const projection=await this.read(c,actor,listing.id);
  const {campaignCreative,spatialStory: _spatialStory,...canonical}=listing;
  if(projection.listingHash!==fingerprint(canonical))throw new MarketingError('FACTS_CHANGED','Property evidence changed while saving this revision.');
  const body={listingId:listing.id,expectedHash:projection.factHash,assets:campaignCreative?[{sourceAssetId:campaignCreative.sourceAssetId,derivativeId:campaignCreative.derivativeId,manifestHash:campaignCreative.manifestHash}]:[]};
  const snapshot=await this.captureLocked(c,actor,body,randomUUID(),fingerprint(body));
  return {version:1 as const,kind:'DEDICATED_STAY' as const,listingId:listing.id,canonicalPath:projection.canonicalPath,factSnapshotId:snapshot.id as string,factHash:snapshot.fact_hash as string};
 }
 async verify(c:pg.PoolClient,actor:Actor,id:string){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new MarketingError('INVALID_INPUT','A valid snapshot identity is required.',422);
  const record=(await c.query('SELECT * FROM marketing_fact_snapshots WHERE id=$1 AND ($2 OR host_id=$3)',[id,actor.role==='admin',actor.id])).rows[0];
  if(!record)throw new MarketingError('FACTS_NOT_FOUND','Property evidence was not found.',404);
  const current=await this.read(c,actor,record.listing_id);
  if(current.factHash!==record.fact_hash||fingerprint({projection:record.projection,assets:record.assets})!==record.manifest_hash)throw new MarketingError('FACTS_CHANGED','Property evidence no longer matches this snapshot.');
  for(const asset of record.assets){
   if(!this.resolveAsset)throw new MarketingError('CREATIVE_NOT_CONFIGURED','Reviewed asset evidence is unavailable.',503);
   const currentAsset=await this.resolveAsset(c,actor,{listingId:record.listing_id,sourceAssetId:asset.sourceAssetId,derivativeId:asset.derivativeId,manifestHash:asset.manifestHash});
   if(fingerprint(currentAsset)!==fingerprint(asset))throw new MarketingError('CREATIVE_EVIDENCE_CHANGED','Reviewed creative changed.');
  }
  return record;
 }
 async verifyProduct(c:pg.PoolClient,actor:Actor,input:unknown){
  const product=productSchema.parse(input);
  if(product.kind!=='DEDICATED_STAY')throw new MarketingError('PRODUCT_NOT_ENABLED','Pooled campaigns require their separate accepted contribution contract.');
  // Workers inspect either the bound host or the persisted operator; HTTP never accepts a system role.
  const current=actor.role==='system'?(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0]:null;
  const effective=actor.role==='system'?{id:actor.id,role:current?.role==='admin'?'admin' as const:'host' as const}:actor;
  const record=await this.verify(c,effective,product.factSnapshotId);
  if(record.fact_hash!==product.factHash||record.listing_id!==product.listingId||record.projection.canonicalPath!==product.canonicalPath)throw new MarketingError('PRODUCT_EVIDENCE_MISMATCH','The product identity no longer matches its canonical evidence.');
  return record;
 }
}
