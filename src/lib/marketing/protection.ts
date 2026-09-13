import type pg from 'pg';
import {MarketingError,type CampaignDraft} from './domain.js';
/** Guest stay dates are separate from the advertising flight; missing inventory is never availability. */
export async function assertMarketableInventory(c:pg.PoolClient,listingId:number,draft:CampaignDraft){
 if(!draft.stayStartDate||!draft.stayEndDate)throw new MarketingError('STAY_DATES_REQUIRED','Define the guest stay dates before activating advertising');
 const nights=(Date.parse(draft.stayEndDate)-Date.parse(draft.stayStartDate))/86400000;
 if(!Number.isInteger(nights)||nights<1||nights>90)throw new MarketingError('STAY_DATES_INVALID','Guest stay window must be 1–90 nights');
 const r=await c.query(`SELECT i.room_type_id,count(*)::int AS days,min(i.total_units-i.held_units-i.booked_units-i.blocked_units)::int AS available FROM inventory_days i JOIN room_types rt ON rt.id=i.room_type_id AND rt.listing_id=i.listing_id WHERE i.listing_id=$1 AND i.calendar_date >= $2::date AND i.calendar_date < $3::date AND rt.currency=$4 GROUP BY i.room_type_id`,[listingId,draft.stayStartDate,draft.stayEndDate,(await c.query('SELECT currency FROM listings WHERE id=$1',[listingId])).rows[0]?.currency]);
 if(!r.rows.some(v=>v.days===nights&&v.available>0))throw new MarketingError('INVENTORY_UNAVAILABLE','No room type has verified availability for the advertised guest stay dates');
}
export function assessBudgetProtection(input:{provider:'META'|'GOOGLE';authorizedMinor:string;spentMinor:string|null;dailyBudgetMinor:string;observedAt:string|null;now?:number}){
 const now=input.now??Date.now();const reasons:string[]=[];
 if(input.spentMinor===null||!input.observedAt||!Number.isFinite(Date.parse(input.observedAt))||now-Date.parse(input.observedAt)>20*60*1000)reasons.push('SPEND_OBSERVATION_STALE');
 const reserve=input.provider==='GOOGLE'?BigInt(input.dailyBudgetMinor)*2n:BigInt(input.dailyBudgetMinor);
 if(input.spentMinor!==null&&BigInt(input.spentMinor)+reserve>=BigInt(input.authorizedMinor))reasons.push('BUDGET_SAFETY_THRESHOLD');
 return {pause:reasons.length>0,reasons,headroomMinor:reserve.toString(),note:'Provider reports and pause commands have latency. Encho bears spend beyond host authorization; this threshold is not an exact remote spending cap.'};
}
export function optimizationAdvice(input:{impressions:number|null;clicks:number|null;capturedBookings:number|null;spendMinor:string|null;fulfilledContributionMinor:string|null}){
 const recommendations:string[]=[];
 if(input.capturedBookings===null)recommendations.push('Connect verified captured-booking measurement before evaluating conversion performance.');
 if(input.fulfilledContributionMinor===null)recommendations.push('Reconcile fulfilled booking contribution before increasing spend.');
 if(input.clicks!==null&&input.clicks>0&&input.capturedBookings===0)recommendations.push('Review stay availability, total price, mobile checkout and offer relevance before increasing the learning budget.');
 if(input.impressions!==null&&input.impressions===0)recommendations.push('Inspect provider eligibility, review status, dates and targeting before changing bids.');
 recommendations.push('Keep optimization within the approved allocation. Creative differences need adequate evidence; a 24-hour click leader is not proof of booking lift.');
 return {automation:'PAUSE_ONLY',recommendations,objective:'INCREMENTAL_FULFILLED_HOST_CONTRIBUTION',guaranteedBookingLift:false};
}
