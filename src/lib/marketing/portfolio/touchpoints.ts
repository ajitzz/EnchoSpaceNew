import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {MarketingAttributionLinks} from './attribution.js';
import {inTransaction} from '../database.js';
import {fingerprint,MarketingError,type Actor} from '../domain.js';
import {attributionTokenPattern} from '../../../shared/marketingAttribution.js';

export const touchpointSchema=z.object({eventId:z.string().uuid(),token:z.string().regex(attributionTokenPattern),path:z.string().regex(/^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
 disclosureVersion:z.literal('encho-measurement-v1'),measurement:z.literal(true),adUserData:z.boolean(),personalization:z.boolean(),
 parameters:z.object({gclid:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),gbraid:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),wbraid:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional(),fbclid:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional()}).strict(),
}).strict();
export class MarketingTouchpoints {
 constructor(private pool:pg.Pool,private actor:Actor,private links:MarketingAttributionLinks){}
 private async authorize(c:pg.PoolClient){if(!['admin','system'].includes(this.actor.role)||(await c.query('SELECT role FROM users WHERE id=$1',[this.actor.id])).rows[0]?.role!=='admin')throw new MarketingError('SERVICE_ACTOR_REQUIRED','Campaign measurement is unavailable.',503);}
 visitorSession(visitor?:string){if(visitor){try{this.links.visitorSubject(visitor);return visitor;}catch{/* Expired or invalid browser identity starts a new consent session. */}}return this.links.createVisitor();}
 async record(input:unknown,visitor:string|undefined,userAgent:string){
  const body=touchpointSchema.parse(input);
  if(body.personalization&&!body.adUserData)throw new MarketingError('CONSENT_INVALID','Personalized advertising also requires advertising data permission.',422);
  let cookie=visitor;
  if(cookie){try{this.links.visitorSubject(cookie);}catch{cookie=undefined;}}
  cookie??=this.links.createVisitor();const subject=this.links.visitorSubject(cookie);
  const hash=fingerprint(body);
  const receipt=await inTransaction(this.pool,this.actor,async c=>{
   await this.authorize(c);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`consent:${subject}`]);
   await this.links.verifyLocked(c,body.token,body.path);
   const old=(await c.query('SELECT event_id,subject_hash,request_hash,consent_id FROM marketing_attribution_touchpoints WHERE event_id=$1',[body.eventId])).rows[0];
   if(old){if(old.subject_hash!==subject||old.request_hash!==hash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This visit identity already records a different request.');return {eventId:old.event_id,consentId:old.consent_id,duplicate:true};}
   const consentId=randomUUID();
   await c.query(`INSERT INTO marketing_measurement_consents(id,subject_hash,request_id,measurement,ad_user_data,personalization,disclosure_version) VALUES($1,$2,$3,true,$4,$5,$6)`,[consentId,subject,body.eventId,body.adUserData,body.personalization,body.disclosureVersion]);
   // Browser click parameters are observed input, not cryptographic provider evidence.
   const parameters=body.adUserData?{...body.parameters,userAgent:userAgent.replace(/[\r\n]/g,'').slice(0,1024),authority:'BROWSER_OBSERVED'}:{};
   await c.query(`INSERT INTO marketing_attribution_touchpoints(event_id,subject_hash,link_nonce,consent_id,request_hash) VALUES($1,$2,$3,$4,$5)`,[body.eventId,subject,body.token.split('.')[2],consentId,hash]);
   if(body.adUserData)await c.query("INSERT INTO marketing_measurement_payloads(event_id,subject_hash,observed_parameters,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[body.eventId,subject,JSON.stringify(parameters)]);
   return {eventId:body.eventId,consentId,duplicate:false};
  });
  return {cookie,receipt};
 }
 async revoke(visitor:string|undefined,requestId:string){
  z.string().uuid().parse(requestId);if(!visitor)return;
  let subject:string;try{subject=this.links.visitorSubject(visitor);}catch{return;}
  await inTransaction(this.pool,this.actor,async c=>{
   await this.authorize(c);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`consent:${subject}`]);
   const old=(await c.query('SELECT measurement FROM marketing_measurement_consents WHERE subject_hash=$1 AND request_id=$2',[subject,requestId])).rows[0];
   if(old){if(old.measurement)throw new MarketingError('IDEMPOTENCY_CONFLICT','This request identity is already bound to consent.');return;}
   await c.query(`INSERT INTO marketing_measurement_consents(id,subject_hash,request_id,measurement,ad_user_data,personalization,disclosure_version) VALUES($1,$2,$3,false,false,false,'encho-measurement-v1')`,[randomUUID(),subject,requestId]);
   await c.query('DELETE FROM marketing_measurement_payloads WHERE subject_hash=$1',[subject]);
  });
 }
 /** Bounded erasure; immutable consent receipts remain available for audit. */
 async purgeExpired(){return purgeExpiredMeasurementPayloads(this.pool,this.actor);}
 /** Server checkout integration port; caller must separately prove booking/session binding. */
 async current(visitor:string,eventId:string){return this.withCurrent(visitor,eventId,async(_c,row)=>row);}
 async withCurrent<T>(visitor:string,eventId:string,work:(c:pg.PoolClient,row:any)=>Promise<T>){
  z.string().uuid().parse(eventId);const subject=this.links.visitorSubject(visitor);
  return inTransaction(this.pool,this.actor,async c=>{
   await this.authorize(c);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`consent:${subject}`]);
   const row=(await c.query(`SELECT t.event_id,t.link_nonce,t.consent_id,t.occurred_at,coalesce(payload.observed_parameters,'{}'::jsonb) AS observed_parameters,l.campaign_id,l.revision,l.host_id,l.listing_id,l.provider,l.asset_card,l.canonical_path,
     consent.id AS current_consent_id,consent.measurement,consent.ad_user_data,consent.personalization,consent.recorded_at
     FROM marketing_attribution_touchpoints t JOIN marketing_attribution_links l ON l.nonce=t.link_nonce
     LEFT JOIN marketing_measurement_payloads payload ON payload.event_id=t.event_id AND payload.expires_at>now()
     JOIN LATERAL(SELECT * FROM marketing_measurement_consents WHERE subject_hash=t.subject_hash ORDER BY sequence DESC LIMIT 1) consent ON true
     WHERE t.event_id=$1 AND t.subject_hash=$2`,[eventId,subject])).rows[0];
   if(!row||!row.measurement||Date.now()-new Date(row.occurred_at).getTime()>30*86400000)throw new MarketingError('CONVERSION_CONSENT_REQUIRED','Current measurement consent and its bound visit are required.');
   return work(c,row);
  });
 }
}

/** Retention continues even while attribution signing is disabled. */
export async function purgeExpiredMeasurementPayloads(pool:pg.Pool,actor:Actor){return inTransaction(pool,actor,async c=>{
 if(!['system','admin'].includes(actor.role)||(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0]?.role!=='admin')throw new MarketingError('SERVICE_ACTOR_REQUIRED','Retention requires the configured operator.',503);
 if(!(await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended('marketing-measurement-retention',0)) AS acquired")).rows[0].acquired)return 0;
 return (await c.query("DELETE FROM marketing_measurement_payloads WHERE event_id IN (SELECT event_id FROM marketing_measurement_payloads WHERE expires_at<=now() ORDER BY expires_at,event_id LIMIT 500)")).rowCount??0;
});}
