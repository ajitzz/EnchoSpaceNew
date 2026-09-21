import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from '../database.js';
import {MarketingError,minorAmount,type Actor} from '../domain.js';
import {readListing} from '../workflow.js';

export const economicsInput=z.object({listingId:z.number().int().positive().safe(),mediaBudgetMinor:minorAmount,
 flightDays:z.number().int().min(2).max(90),nightsPerBooking:z.number().int().min(1).max(90),
 retainedMarginBps:z.number().int().min(0).max(10000),targetBookings:z.number().int().min(1).max(1000),
}).strict();
export function economicsScenario(price:string,input:z.infer<typeof economicsInput>){
 const match=/^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/.exec(price);
 if(!match)throw new MarketingError('PRICE_UNAVAILABLE','A canonical nightly rate is needed for this scenario.');
 const nightly=BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0'));
 const gross=nightly*BigInt(input.nightsPerBooking),contribution=gross*BigInt(input.retainedMarginBps)/10000n;
 const budget=BigInt(input.mediaBudgetMinor),target=BigInt(input.targetBookings),days=BigInt(input.flightDays);
 return {basis:'HOST_SCENARIO_NOT_FORECAST' as const,nightlyRateMinor:nightly.toString(),grossBookingRevenueMinor:gross.toString(),
  contributionBeforeAdvertisingMinor:contribution.toString(),breakEvenAcquisitionCostMinor:contribution.toString(),
  plannedAcquisitionCostMinor:((budget+target-1n)/target).toString(),measuredAcquisitionCostMinor:null,
  dailyScenarioRangeMinor:{low:(contribution*target/4n/days).toString(),high:(contribution*target/2n/days).toString()},
  assumptions:input,warning:contribution===0n?'NO_CONTRIBUTION':budget>contribution*target?'ABOVE_BREAK_EVEN':'SCENARIO_ONLY',
  explanation:'Retained margin is your assumption after stay costs, commission and taxes. The daily range allocates 25–50% of scenario contribution to media; it is not a delivery forecast. Advertising fees and actual quotes are separate.'};
}
export class MarketingPreflight {
 constructor(private pool:pg.Pool,private serviceActor?:Actor){}
 async economics(actor:Actor,input:unknown){
  const body=economicsInput.parse(input);
  return inTransaction(this.pool,actor,async c=>{
   const user=(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0];
   if(!user||actor.role==='system'||actor.role==='admin'&&user.role!=='admin')throw new MarketingError('AUTH_REQUIRED','Current account access required.',403);
   const listing=await readListing(c,body.listingId,actor);
   if(listing.publicationStatus!=='published')throw new MarketingError('LISTING_NOT_AVAILABLE','Choose a published property.',404);
   return {...economicsScenario(listing.price,body),currency:listing.currency,observedAt:new Date().toISOString()};
  });
 }
 async portfolio(actor:Actor,campaignId:number,revision:number){
  // First prove ownership with caller authority; never let a supplied service role grant access.
  await inTransaction(this.pool,actor,async c=>{
   const user=(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0];
   if(!user||actor.role==='system'||actor.role==='admin'&&user.role!=='admin')throw new MarketingError('AUTH_REQUIRED','Current account access required.',403);
   const row=(await c.query('SELECT revision FROM marketing_campaign_workflows WHERE campaign_id=$1 AND ($2 OR host_id=$3)',[campaignId,actor.role==='admin',actor.id])).rows[0];
   if(!row)throw new MarketingError('CAMPAIGN_NOT_FOUND','Campaign not found.',404);
   if(row.revision!==revision)throw new MarketingError('REVISION_CONFLICT','Reload the current revision.');
  });
  const unavailable={status:'UNASSESSED',blocking:false,observedAt:null,message:'Search overlap has not been assessed for this revision. Choose truthful property differentiators; shared queries do not establish auction harm.'};
  if(!this.serviceActor)return unavailable;
  return inTransaction(this.pool,this.serviceActor,async c=>{
   if((await c.query('SELECT role FROM users WHERE id=$1',[this.serviceActor!.id])).rows[0]?.role!=='admin')return unavailable;
   const receipt=(await c.query('SELECT evidence,created_at FROM marketing_search_conflict_assessments WHERE campaign_id=$1 AND revision=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[campaignId,revision])).rows[0];
   if(!receipt)return unavailable;
   const stale=Date.now()-new Date(receipt.created_at).getTime()>86400000;
   // No peer IDs, names, counts, keywords, budgets, geography or raw evidence leave this boundary.
   return {status:stale?'STALE':receipt.evidence.conflicts?.length?'POSSIBLE_OVERLAP':'LIMITED_ASSESSMENT',blocking:false,observedAt:receipt.created_at,
    message:stale?'The previous portfolio observation is older than one day. Ask Encho to refresh its assessment.':receipt.evidence.conflicts?.length?'Some selected search themes may overlap within Encho’s portfolio. Consider distinctive verified property features. This advisory does not change your budget or prevent publication.':'The bounded observation found no identical overlapping terms. Semantic variants and complete geographic overlap remain unmeasured.'};
  });
 }
}
