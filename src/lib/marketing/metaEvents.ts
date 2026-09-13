import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import {MarketingError} from './domain.js';
import {enqueue} from './jobs.js';
export class MetaMarketingEvents{
 constructor(private pool:pg.Pool,private appSecret?:string,private verifyToken?:string){}
 challenge(mode:unknown,token:unknown,challenge:unknown){
  if(!this.verifyToken||mode!=='subscribe'||typeof token!=='string'||typeof challenge!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(challenge))throw new MarketingError('WEBHOOK_VERIFICATION_FAILED','Webhook verification failed',403);
  const a=Buffer.from(this.verifyToken),b=Buffer.from(token);if(a.length!==b.length||!timingSafeEqual(a,b))throw new MarketingError('WEBHOOK_VERIFICATION_FAILED','Webhook verification failed',403);return challenge;
 }
 async ingest(raw:Buffer,signature:string){
  if(!this.appSecret)throw new MarketingError('WEBHOOK_NOT_CONFIGURED','Meta webhook secret is not configured',503);
  if(raw.length>1024*1024)throw new MarketingError('WEBHOOK_TOO_LARGE','Webhook payload is too large',413);
  const expected=createHmac('sha256',this.appSecret).update(raw).digest();
  if(!/^sha256=[a-f0-9]{64}$/i.test(signature)||!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))throw new MarketingError('WEBHOOK_SIGNATURE_INVALID','Invalid Meta webhook signature',401);
  let payload:any;try{payload=JSON.parse(raw.toString());}catch{throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Webhook payload is not valid JSON',422);}
  if(!payload||!['page','ad_account'].includes(payload.object)||!Array.isArray(payload.entry)||payload.entry.length>100)throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Unexpected Meta event envelope',422);
  const identifier=(id:unknown)=>typeof id==='string'&&/^[1-9]\d{0,29}$/.test(id)?id:null;
  const entry=payload.entry.map((item:any)=>{
   if(!item||!identifier(item.id)||!Array.isArray(item.changes)||item.changes.length>100)throw new MarketingError('WEBHOOK_PAYLOAD_INVALID','Unexpected Meta change envelope',422);
   return {id:item.id,changes:item.changes.map((change:any)=>({value:Object.fromEntries(['ad_id','adset_id','campaign_id'].flatMap(key=>identifier(change?.value?.[key])?[[key,change.value[key]]]:[]))}))};
  });
  // Persist only identifiers needed for authoritative readback, never lead contact/body data.
  const payloadHash=createHash('sha256').update(raw).digest('hex');
  await enqueue(this.pool,{kind:'META_EVENT',key:`meta-event:${payloadHash}`,payload:{object:payload.object,entry,payloadHash}});return {accepted:true};
 }
}
