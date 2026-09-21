import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {attributionTokenPattern,hasOnlyAttributionQuery} from '../../../shared/marketingAttribution.js';
import {inTransaction} from '../database.js';
import {fingerprint,MarketingError,publicOrigin,type Actor} from '../domain.js';

const keysSchema=z.object({active:z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),keys:z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),z.string().regex(/^[A-Za-z0-9_-]{43}$/))}).strict();
type KeyRing=z.infer<typeof keysSchema>;
const invalid=()=>new MarketingError('ATTRIBUTION_INVALID','The campaign reference is invalid or expired.',422);
export class MarketingAttributionLinks {
 private readonly origin:string;private readonly ring:KeyRing;
 constructor(private pool:pg.Pool,private actor:Actor,origin:string,keys:unknown,private now=()=>new Date()){
  this.origin=publicOrigin(origin);this.ring=keysSchema.parse(keys);
  if(!this.ring.keys[this.ring.active]||Object.keys(this.ring.keys).length>5||Object.values(this.ring.keys).some(key=>Buffer.from(key,'base64url').toString('base64url')!==key))throw new Error('ATTRIBUTION_KEY_RING_INVALID');
 }
 private async authorize(c:pg.PoolClient){
  if(!['admin','system'].includes(this.actor.role)||(await c.query('SELECT role FROM users WHERE id=$1',[this.actor.id])).rows[0]?.role!=='admin')throw new MarketingError('SERVICE_ACTOR_REQUIRED','Attribution service identity is unavailable.',503);
 }
 private binding(row:any){return {campaignId:row.campaign_id,revision:row.revision,hostId:row.host_id,listingId:row.listing_id,provider:row.provider,assetCard:row.asset_card,canonicalPath:row.canonical_path,expiresAt:new Date(row.expires_at).toISOString()};}
 private token(row:any){
  const key=this.ring.keys[row.key_id];if(!key)throw new MarketingError('ATTRIBUTION_KEY_UNAVAILABLE','The retained campaign signing key is unavailable.',503);
  if(row.binding_hash!==fingerprint(this.binding(row)))throw invalid();
  const prefix=`v1.${row.key_id}.${row.nonce}`;
  return `${prefix}.${createHmac('sha256',Buffer.from(key,'base64url')).update(`${this.origin}\n${prefix}\n${row.binding_hash}`).digest('base64url')}`;
 }
 async issue(campaignId:number,revision:number,assetCard='primary'){
  z.object({campaignId:z.number().int().positive().safe(),revision:z.number().int().positive().safe(),assetCard:z.string().regex(/^(primary|card-[1-4]|sitelink-[1-4])$/)}).parse({campaignId,revision,assetCard});
  return inTransaction(this.pool,this.actor,async c=>{
   await this.authorize(c);
   const row=(await c.query(`SELECT w.*,l.slug,l.publication_status,l.user_id FROM marketing_campaign_workflows w JOIN listings l ON l.id=w.listing_id WHERE w.campaign_id=$1`,[campaignId])).rows[0];
   if(!row||row.revision!==revision||row.host_id!==row.user_id||row.publication_status!=='published'||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(row.slug))throw invalid();
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`attribution:${campaignId}:${revision}:${assetCard}`]);
   let record=(await c.query('SELECT * FROM marketing_attribution_links WHERE campaign_id=$1 AND revision=$2 AND asset_card=$3',[campaignId,revision,assetCard])).rows[0];
   if(!record){
    const expires=new Date(Date.parse(row.draft.flightSchedule?.endsAt??`${row.draft.endDate}T23:59:59Z`)+30*86400000);
    if(!Number.isFinite(expires.getTime())||expires<=this.now())throw invalid();
    const value={campaign_id:campaignId,revision,host_id:row.host_id,listing_id:row.listing_id,provider:row.provider,asset_card:assetCard,canonical_path:`/stay/${row.slug}`,expires_at:expires};
    record=(await c.query(`INSERT INTO marketing_attribution_links(nonce,key_id,campaign_id,revision,host_id,listing_id,provider,asset_card,canonical_path,binding_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[randomBytes(32).toString('base64url'),this.ring.active,campaignId,revision,row.host_id,row.listing_id,row.provider,assetCard,value.canonical_path,fingerprint(this.binding(value)),expires])).rows[0];
   }
   if(new Date(record.expires_at)<=this.now()||record.canonical_path!==`/stay/${row.slug}`)throw invalid();
   return `${this.origin}${record.canonical_path}?enc_ref=${this.token(record)}`;
  });
 }
 async verifyLocked(c:pg.PoolClient,token:string,path:string){
  if(!attributionTokenPattern.test(token))throw invalid();
  const [,key,nonce]=token.split('.');
  const row=(await c.query('SELECT * FROM marketing_attribution_links WHERE nonce=$1 AND key_id=$2',[nonce,key])).rows[0];
  if(!row||row.canonical_path!==path||new Date(row.expires_at)<=this.now())throw invalid();
  const expected=this.token(row);
  if(expected.length!==token.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(token)))throw invalid();
  return this.binding(row);
 }
 async verifyLanding(c:pg.PoolClient,input:{campaignId:number;revision:number;provider:string;hostId:number;listingId:number;url:string}){
  const url=new URL(input.url);
  if(url.origin!==this.origin||!hasOnlyAttributionQuery(url))throw invalid();
  const binding=await this.verifyLocked(c,url.searchParams.get('enc_ref')!,url.pathname);
  if(binding.campaignId!==input.campaignId||binding.revision!==input.revision||binding.provider!==input.provider||binding.hostId!==input.hostId||binding.listingId!==input.listingId)throw invalid();
  if(url.hash){
   const index=/^(?:card|sitelink)-([1-4])$/.exec(binding.assetCard);
   if(!index)throw invalid();
   const row=(await c.query('SELECT listing_snapshot FROM marketing_campaign_revisions WHERE campaign_id=$1 AND revision=$2',[binding.campaignId,binding.revision])).rows[0];
   const section=row?.listing_snapshot?.spatialStory?.manifest?.cards?.[Number(index[1])-1]?.section;
   if(!section||url.hash!==`#${section}`)throw invalid();
  }
  return binding;
 }
 createVisitor(){
  const prefix=`m1.${this.ring.active}.${randomBytes(32).toString('base64url')}.${Math.floor(this.now().getTime()/1000)+30*86400}`;
  return `${prefix}.${createHmac('sha256',Buffer.from(this.ring.keys[this.ring.active],'base64url')).update(`${this.origin}\nvisitor\n${prefix}`).digest('base64url')}`;
 }
 visitorSubject(token:string):string{
  if(!/^m1\.[A-Za-z0-9_-]{1,24}\.[A-Za-z0-9_-]{43}\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/.test(token))throw invalid();
  const [,kid,nonce,expiry,signature]=token.split('.'),key=this.ring.keys[kid];
  if(!key||Number(expiry)*1000<=this.now().getTime())throw invalid();
  const prefix=token.slice(0,token.lastIndexOf('.'));
  const expected=createHmac('sha256',Buffer.from(key,'base64url')).update(`${this.origin}\nvisitor\n${prefix}`).digest('base64url');
  if(!timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))throw invalid();
  return createHash('sha256').update(nonce).digest('hex');
 }
 /** Trusted consent adapter must bind a real touchpoint and current consent separately. */
 async inspect(token:string,path:string){return inTransaction(this.pool,this.actor,async c=>{await this.authorize(c);return this.verifyLocked(c,token,path);});}
}
