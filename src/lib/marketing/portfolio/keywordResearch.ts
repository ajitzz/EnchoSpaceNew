import {consumeMarketingRequestBudget} from '../requestLimits.js';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {inTransaction} from '../database.js';
import {fingerprint,MarketingError,publicOrigin,type Actor} from '../domain.js';
import type {CanonicalMarketingFacts} from './facts.js';
import {keywordResearchSchema,type KeywordResearchEvidence,type KeywordResearchPort} from './keywordContract.js';
import {GoogleAdsError} from '../../providers/google/googleErrors.js';

type ResearchRow={id:string;state:string;fence:string;lease_until:Date|null;expires_at:Date;evidence:KeywordResearchEvidence|null;error_code:string|null};
const present=(row:ResearchRow,cached:boolean)=>({id:row.id,status:row.state==='RUNNING'?'PENDING':row.state,cached,evidence:row.evidence,code:row.error_code,expiresAt:row.expires_at.toISOString()});
export class KeywordResearchService {
 private readonly origin:string;
 constructor(private readonly pool:pg.Pool,private readonly facts:CanonicalMarketingFacts,private readonly port:KeywordResearchPort,
  origin:string,private readonly serviceActor:Actor,private readonly resolveTargeting:(geos:string[],language:string[])=>Promise<unknown>){
  this.origin=publicOrigin(origin);
  if(!/^\d{10}$/.test(port.customerId)||serviceActor.role!=='system'||!Number.isSafeInteger(serviceActor.id)||serviceActor.id<1)throw new Error('A configured serving customer and service identity are required.');
 }
 async research(actor:Actor,input:unknown){
  const body=keywordResearchSchema.parse(input),before=await this.facts.preview(actor,body.listingId);
  if(before.hostId!==actor.id)throw new MarketingError('LISTING_NOT_AVAILABLE','Choose your published property.',404);
  if(before.factHash!==body.factHash)throw new MarketingError('FACTS_CHANGED','Property facts changed. Reload the current evidence.');
  const request={canonicalUrl:this.origin+before.canonicalPath,keywords:[...body.keywords].sort(),geoTargetConstants:[...body.geoTargetConstants].sort(),languageConstant:body.languageConstant};
  // Even cached research validates provider geography; bound those lookups across replicas too.
  await consumeMarketingRequestBudget(this.pool,actor,'TARGETING');
  await this.resolveTargeting(request.geoTargetConstants,[request.languageConstant]);
  const requestHash=fingerprint({request,factHash:body.factHash,customer:this.port.customerId,apiVersion:'v25',network:'GOOGLE_SEARCH',includeAdultKeywords:false});
  const claimed=await inTransaction(this.pool,this.serviceActor,async c=>{
   const operator=(await c.query('SELECT role FROM users WHERE id=$1',[this.serviceActor.id])).rows[0];
   if(operator?.role!=='admin')throw new MarketingError('RESEARCH_NOT_CONFIGURED','The research service account requires operator configuration.',503);
   // The cache is not an audit ledger. Bound retention without deleting a live claim.
   await c.query(`DELETE FROM marketing_keyword_research WHERE id IN
    (SELECT id FROM marketing_keyword_research WHERE expires_at<clock_timestamp()-interval '7 days'
     AND (state<>'RUNNING' OR lease_until<clock_timestamp()) ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
   const current=await this.facts.read(c,actor,body.listingId);
   if(current.factHash!==body.factHash)throw new MarketingError('FACTS_CHANGED','Property evidence changed during targeting verification.');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`keyword-research:${actor.id}:${requestHash}`]);
   const old=(await c.query("SELECT *,expires_at>clock_timestamp() AS fresh,lease_until>clock_timestamp() AS held FROM marketing_keyword_research WHERE host_id=$1 AND customer_id=$2 AND request_hash=$3 FOR UPDATE",[actor.id,this.port.customerId,requestHash])).rows[0];
   if(old&&(old.state==='RUNNING'?old.held:old.fresh))return {cached:present(old,true)};
   const claimId=randomUUID();
   const slot=await c.query(`INSERT INTO marketing_keyword_customer_slots(customer_id,claim_id,lease_until,next_allowed_at)
    VALUES($1,$2,clock_timestamp()+interval '120 seconds',clock_timestamp())
    ON CONFLICT(customer_id) DO UPDATE SET claim_id=$2,lease_until=clock_timestamp()+interval '120 seconds'
    WHERE (marketing_keyword_customer_slots.claim_id IS NULL OR marketing_keyword_customer_slots.lease_until<=clock_timestamp())
     AND marketing_keyword_customer_slots.next_allowed_at<=clock_timestamp() RETURNING customer_id`,[this.port.customerId,claimId]);
   if(!slot.rowCount)return {limited:true};
   const saved=(await c.query(`INSERT INTO marketing_keyword_research(id,host_id,listing_id,customer_id,request_hash,state,fence,lease_until,expires_at)
    VALUES($1,$2,$3,$4,$5,'RUNNING',1,clock_timestamp()+interval '120 seconds',clock_timestamp()+interval '120 seconds')
    ON CONFLICT(host_id,customer_id,request_hash) DO UPDATE SET state='RUNNING',fence=marketing_keyword_research.fence+1,lease_until=EXCLUDED.lease_until,expires_at=EXCLUDED.expires_at,evidence=NULL,error_code=NULL,updated_at=clock_timestamp() RETURNING *`,[old?.id??randomUUID(),actor.id,body.listingId,this.port.customerId,requestHash])).rows[0] as ResearchRow;
   return {claimId,row:saved};
  });
  if(claimed.cached)return claimed.cached;
  if(claimed.limited)return {status:'RATE_LIMITED',evidence:null,cached:false,code:'RESEARCH_CUSTOMER_BUSY',retryAfterSeconds:2};
  const {row,claimId}=claimed;
  let evidence:KeywordResearchEvidence|null=null,code:string|null=null;
  try{await consumeMarketingRequestBudget(this.pool,actor,'KEYWORD_RESEARCH');evidence=await this.port.research(request);if(Buffer.byteLength(JSON.stringify(evidence))>262144)throw new MarketingError('RESEARCH_RESPONSE_LIMIT','Historical evidence exceeded its bounded response.');}
  catch(error){evidence=null;const candidate=error instanceof GoogleAdsError||error instanceof MarketingError?error.code:'';code=/^[A-Z_]{1,100}$/.test(candidate)?candidate:'RESEARCH_UNAVAILABLE';}
  return inTransaction(this.pool,this.serviceActor,async c=>{
   const operator=(await c.query('SELECT role FROM users WHERE id=$1 FOR SHARE',[this.serviceActor.id])).rows[0];
   if(operator?.role!=='admin')throw new MarketingError('RESEARCH_NOT_CONFIGURED','The research service account requires operator configuration.',503);
   // Persist only the current fence. An expired reader cannot overwrite new evidence or release a successor's slot.
   const saved=(await c.query(`UPDATE marketing_keyword_research SET state=$3,evidence=$4,error_code=$5,lease_until=NULL,
    expires_at=clock_timestamp()+CASE WHEN $5::text IS NULL THEN interval '24 hours' ELSE interval '30 seconds' END,updated_at=clock_timestamp()
    WHERE id=$1 AND fence=$2 AND state='RUNNING' AND lease_until>clock_timestamp() RETURNING *`,[row!.id,row!.fence,code?'UNAVAILABLE':evidence!.ideas.length?'AVAILABLE':'EMPTY',evidence?JSON.stringify(evidence):null,code])).rows[0];
   await c.query("UPDATE marketing_keyword_customer_slots SET claim_id=NULL,lease_until=NULL,next_allowed_at=clock_timestamp()+interval '1 second' WHERE customer_id=$1 AND claim_id=$2",[this.port.customerId,claimId]);
   if(!saved)throw new MarketingError('RESEARCH_CLAIM_EXPIRED','This research attempt expired. Request current evidence again.');
   return present(saved,false);
  });
 }
}
