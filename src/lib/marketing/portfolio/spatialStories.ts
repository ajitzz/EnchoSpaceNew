import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from '../database.js';
import {fingerprint,MarketingError,type Actor,type CampaignCreativeEvidence} from '../domain.js';
import type {CanonicalMarketingFacts} from './facts.js';
import {spatialStoryCopy,storyCaptureSchema,storyReviewSchema,type StoryEvidence,type StoryImage,type SpatialStory} from '../../../shared/marketingStory.js';
import {parseSpatialCreative,type SpatialCreative} from '../../providers/spatialCreative.js';
import type {ProviderPublishRequest} from '../../providers/types.js';

type ImageSelection={sourceAssetId:string;derivativeId:string;manifestHash:string};
export interface StoryAssets {
  resolveForCampaign(c:pg.PoolClient,actor:Actor,input:ImageSelection & {listingId:number}):Promise<CampaignCreativeEvidence>;
  verifyForPublishing(actor:Actor,input:ImageSelection & {listingId:number}):Promise<CampaignCreativeEvidence>;
  image(actor:Actor,id:string,view:'DERIVATIVE'):Promise<{bytes:Buffer;contentType:string;sha256:string}>;
}
const requestKey=z.string().regex(/^[a-zA-Z0-9:_-]{8,160}$/);
const fail=(code:string,message:string,status=409):never=>{throw new MarketingError(code,message,status);};

/** Compiles literal canonical labels; no generated amenity, price or spatial claims. */
export class SpatialStories {
  constructor(private pool:pg.Pool,private facts:CanonicalMarketingFacts,private assets:StoryAssets|undefined,private operator?:Actor){}

  private async actor(c:pg.PoolClient,actor:Actor,admin=false):Promise<Actor> {
    const row=(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0];
    if(!row||(actor.role==='admin'||admin)&&row.role!=='admin')return fail('STORY_ACCESS_DENIED','Current editorial authority is required.',403);
    return {id:actor.id,role:row.role==='admin'?'admin':'host'};
  }

  private async image(c:pg.PoolClient,actor:Actor,listingId:number,selection:ImageSelection,format:'SQUARE'|'LANDSCAPE'):Promise<StoryImage> {
    if(!this.assets)return fail('CREATIVE_NOT_CONFIGURED','Reviewed image delivery is required.',503);
    const evidence=await this.assets.resolveForCampaign(c,actor,{listingId,sourceAssetId:selection.sourceAssetId,derivativeId:selection.derivativeId,manifestHash:selection.manifestHash});
    const record=(await c.query('SELECT format,manifest FROM marketing_creative_derivatives WHERE id=$1',[selection.derivativeId])).rows[0];
    const output=record?.manifest?.output;
    const dimensions=format==='SQUARE'?[1080,1080]:[1200,628];
    if(record?.format!==format||output?.width!==dimensions[0]||output?.height!==dimensions[1]||!Number.isSafeInteger(output?.byteLength)||output.byteLength<1||output.byteLength>150000)
      return fail('STORY_IMAGE_FORMAT',`Use a reviewed ${format.toLowerCase()} image up to 150 KB for the bounded provider request.`);
    return {...evidence,width:output.width,height:output.height,byteLength:output.byteLength};
  }

  async capture(actor:Actor,input:unknown,key:string) {
    const body=storyCaptureSchema.parse(input);requestKey.parse(key);
    return inTransaction(this.pool,actor,async c=>{
      actor=await this.actor(c,actor);
      const facts=await this.facts.read(c,actor,body.listingId);
      if(facts.hostId!==actor.id)return fail('STORY_OWNER_REQUIRED','The property owner must select and attest their spatial story.',403);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`spatial-story:${actor.id}:${key}`]);
      const previous=(await c.query('SELECT * FROM marketing_spatial_stories WHERE host_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
      if(previous){if(previous.request_hash!==fingerprint(body))return fail('IDEMPOTENCY_CONFLICT','This story request already has different evidence.');return this.project(previous);}
      if(body.factHash!==facts.factHash)return fail('FACTS_CHANGED','Review the current published property facts.');
      const cards:SpatialStory['cards']=[];
      for(const card of body.cards) {
        const fact=facts.facts.find(f=>f.id===card.factId);
        if(!fact||!['name','amenity','title'].includes(fact.field)||fact.value.length>25||Array.from(fact.value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))
          return fail('STORY_FACT_REQUIRED','Choose an exact published room name, amenity or title of at most 25 characters.');
        cards.push({section:card.section,factId:fact.id,title:fact.value,image:await this.image(c,actor,body.listingId,card.image,'SQUARE')});
      }
      if(new Set(cards.map(card=>card.title.toLocaleLowerCase('en-IN'))).size!==4)return fail('STORY_DUPLICATE_TITLE','Each card needs a distinct canonical label.');
      const manifest:SpatialStory={version:1,listingId:body.listingId,hostId:facts.hostId,canonicalPath:facts.canonicalPath,factHash:facts.factHash,cards,landscapeImage:await this.image(c,actor,body.listingId,body.landscapeImage,'LANDSCAPE')};
      const saved=(await c.query('INSERT INTO marketing_spatial_stories(id,listing_id,host_id,request_key,request_hash,manifest_hash,manifest) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),body.listingId,actor.id,key,fingerprint(body),fingerprint(manifest),JSON.stringify(manifest)])).rows[0];
      return this.project(saved);
    });
  }

  private project(row:any):StoryEvidence {return {id:row.id,manifestHash:row.manifest_hash,manifest:row.manifest};}

  async resolve(c:pg.PoolClient,actor:Actor,listingId:number,id:string,manifestHash:string,requireApproval=true):Promise<StoryEvidence> {
    z.string().uuid().parse(id);actor=await this.actor(c,actor);
    const row=(await c.query(`SELECT s.*,(SELECT decision FROM marketing_spatial_story_reviews WHERE story_id=s.id ORDER BY sequence DESC LIMIT 1) AS decision FROM marketing_spatial_stories s WHERE id=$1 AND listing_id=$2 AND ($3 OR host_id=$4)`,[id,listingId,actor.role==='admin',actor.id])).rows[0];
    if(!row)return fail('STORY_NOT_FOUND','This property story was not found.',404);
    if(row.manifest_hash!==manifestHash||fingerprint(row.manifest)!==manifestHash)return fail('STORY_EVIDENCE_CHANGED','This story does not match its immutable manifest.');
    if(requireApproval&&row.decision!=='APPROVE')return fail('STORY_NOT_APPROVED','The current spatial story requires independent editorial approval.');
    const facts=await this.facts.read(c,actor,listingId),story=row.manifest as SpatialStory;
    if(facts.factHash!==story.factHash||facts.hostId!==story.hostId||facts.canonicalPath!==story.canonicalPath)return fail('FACTS_CHANGED','The published property has changed since this story was reviewed.');
    for(const card of story.cards) {
      if(!facts.facts.some(f=>f.id===card.factId&&f.value===card.title))return fail('STORY_FACT_REQUIRED','The story label no longer matches its property evidence.');
      if(fingerprint(await this.image(c,actor,listingId,card.image,'SQUARE'))!==fingerprint(card.image))return fail('STORY_IMAGE_CHANGED','A story image changed.');
    }
    if(fingerprint(await this.image(c,actor,listingId,story.landscapeImage,'LANDSCAPE'))!==fingerprint(story.landscapeImage))return fail('STORY_IMAGE_CHANGED','The landscape image changed.');
    return this.project(row);
  }

  async review(actor:Actor,id:string,input:unknown,key:string) {
    const body=storyReviewSchema.parse(input);requestKey.parse(key);z.string().uuid().parse(id);
    return inTransaction(this.pool,actor,async c=>{
      actor=await this.actor(c,actor,true);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`story-review:${actor.id}:${key}`]);
      const previous=(await c.query('SELECT * FROM marketing_spatial_story_reviews WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
      const requestHash=fingerprint({id,...body});
      if(previous){if(previous.request_hash!==requestHash)return fail('IDEMPOTENCY_CONFLICT','This review identity has different evidence.');return {id:previous.id,decision:previous.decision};}
      const row=(await c.query('SELECT * FROM marketing_spatial_stories WHERE id=$1',[id])).rows[0];
      if(!row)return fail('STORY_NOT_FOUND','The story was not found.',404);
      if(row.host_id===actor.id)return fail('INDEPENDENT_REVIEW_REQUIRED','Another administrator must independently review this property story.',403);
      if(row.manifest_hash!==body.manifestHash)return fail('STORY_EVIDENCE_CHANGED','Review the exact saved story.');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`story-review-order:${id}`]);
      if(body.decision==='APPROVE')await this.resolve(c,actor,row.listing_id,id,body.manifestHash,false);
      const reviewId=randomUUID();
      await c.query('INSERT INTO marketing_spatial_story_reviews(id,story_id,host_id,actor_id,request_key,request_hash,manifest_hash,decision,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[reviewId,id,row.host_id,actor.id,key,requestHash,body.manifestHash,body.decision,body.reason]);
      return {id:reviewId,decision:body.decision};
    });
  }

  async list(actor:Actor,listingId:number) {
    return inTransaction(this.pool,actor,async c=>{
      actor=await this.actor(c,actor);await this.facts.read(c,actor,listingId);
      return (await c.query(`SELECT s.*,(SELECT decision FROM marketing_spatial_story_reviews WHERE story_id=s.id ORDER BY sequence DESC LIMIT 1) AS decision FROM marketing_spatial_stories s WHERE listing_id=$1 AND ($2 OR host_id=$3) ORDER BY created_at DESC,id DESC LIMIT 20`,[listingId,actor.role==='admin',actor.id])).rows.map(row=>({...this.project(row),decision:row.decision??'PENDING'}));
    });
  }

  async verifyDelivery(actor:Actor,evidence:StoryEvidence) {
    const story=await inTransaction(this.pool,actor,c=>this.resolve(c,actor,evidence.manifest.listingId,evidence.id,evidence.manifestHash));
    for(const image of [...story.manifest.cards.map(c=>c.image),story.manifest.landscapeImage])await this.assets!.verifyForPublishing(actor,{listingId:story.manifest.listingId,sourceAssetId:image.sourceAssetId,derivativeId:image.derivativeId,manifestHash:image.manifestHash});
    return inTransaction(this.pool,actor,c=>this.resolve(c,actor,evidence.manifest.listingId,evidence.id,evidence.manifestHash));
  }

  async compile(actor:Actor,evidence:StoryEvidence,provider:'GOOGLE'|'META',link:(card:string)=>Promise<string>):Promise<SpatialCreative> {
    const approved=await this.verifyDelivery(actor,evidence),story=approved.manifest;
    const cards:SpatialCreative['cards']=[];
    for(const [index,card] of story.cards.entries())cards.push({section:card.section,title:card.title,imageUrl:card.image.url,imageHash:card.image.outputHash,landingUrl:`${await link(`${provider==='GOOGLE'?'sitelink':'card'}-${index+1}`)}#${card.section}`});
    const images:SpatialCreative['images']=[];
    if(provider==='GOOGLE')for(const image of [story.cards[0].image,story.landscapeImage]){
      const actual=await this.assets!.image(actor,image.derivativeId,'DERIVATIVE');
      if(actual.sha256!==image.outputHash||actual.bytes.length!==image.byteLength)return fail('STORY_IMAGE_CHANGED','The selected provider image bytes changed.');
      images.push({width:image.width,height:image.height,sha256:actual.sha256,data:actual.bytes.toString('base64')});
    }
    return {version:1,id:evidence.id,manifestHash:evidence.manifestHash,cards,images};
  }

  async verifyPayload(c:pg.PoolClient,actor:Actor,request:ProviderPublishRequest,evidence:StoryEvidence,verifyLink:(url:string)=>Promise<void>) {
    const approved=await this.resolve(c,actor,request.listingId,evidence.id,evidence.manifestHash);
    const copy=spatialStoryCopy(request.metadata?.googleSearch?'GOOGLE':'META');
    if(request.creativeAssets.headline!==copy.headline||request.creativeAssets.description!==copy.description||request.creativeAssets.primaryText!==undefined&&request.creativeAssets.primaryText!==copy.description||request.metadata?.googleSearch&&(fingerprint(request.metadata.googleSearch.headlines)!==fingerprint(copy.googleSearch!.headlines)||fingerprint(request.metadata.googleSearch.descriptions)!==fingerprint(copy.googleSearch!.descriptions)))return fail('STORY_EVIDENCE_CHANGED','Provider framing differs from the reviewed neutral copy.');
    const wire=parseSpatialCreative(request.metadata?.spatialCreative,request.creativeAssets.landingPageUrl,request.metadata?.googleSearch?'GOOGLE':'META');
    if(wire.id!==approved.id||wire.manifestHash!==approved.manifestHash||approved.manifest.hostId!==request.hostId)return fail('STORY_EVIDENCE_CHANGED','Provider creative is not bound to this property revision.');
    for(const [index,card] of wire.cards.entries()){
      const expected=approved.manifest.cards[index];
      if(card.title!==expected.title||card.section!==expected.section||card.imageUrl!==expected.image.url||card.imageHash!==expected.image.outputHash)return fail('STORY_EVIDENCE_CHANGED','A provider card differs from the reviewed story.');
      await verifyLink(card.landingUrl);
    }
    if(wire.images.length&&wire.images.some((image,index)=>image.sha256!==[approved.manifest.cards[0].image,approved.manifest.landscapeImage][index].outputHash))return fail('STORY_IMAGE_CHANGED','Provider image data differs from the immutable reviewed bytes.');
  }

  async publicStory(slug:string) {
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).parse(slug);
    if(!this.operator)return null;
    return inTransaction(this.pool,this.operator,async c=>{
      const actor=await this.actor(c,this.operator!,true);
      const row=(await c.query(`SELECT s.* FROM marketing_spatial_stories s JOIN listings l ON l.id=s.listing_id WHERE l.slug=$1 AND l.publication_status='published' AND (SELECT decision FROM marketing_spatial_story_reviews WHERE story_id=s.id ORDER BY sequence DESC LIMIT 1)='APPROVE' ORDER BY s.created_at DESC,s.id DESC LIMIT 1`,[slug])).rows[0];
      if(!row)return null;
      try {
        const story=await this.resolve(c,actor,row.listing_id,row.id,row.manifest_hash);
        return {cards:story.manifest.cards.map(card=>({section:card.section,title:card.title,image:card.image.url}))};
      } catch(error) {
        if(error instanceof MarketingError&&['FACTS_CHANGED','STORY_NOT_APPROVED','STORY_IMAGE_CHANGED','STORY_FACT_REQUIRED','CREATIVE_NOT_APPROVED','CREATIVE_SOURCE_CHANGED'].includes(error.code))return null;
        throw error;
      }
    });
  }
}
