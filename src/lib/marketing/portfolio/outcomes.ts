import type pg from 'pg';
import {inTransaction} from '../database.js';
import {MarketingError,type Actor} from '../domain.js';

/** Own-campaign rollups only. Provider totals never stand in for first-party conversions. */
export class CampaignOutcomes {
 constructor(private pool:pg.Pool,private operator:Actor|undefined,private measurementConfigured:boolean,private canonicalBookingsConfigured:boolean){}
 async decorate<T extends {campaigns:Array<{id:string|number}>}>(actor:Actor,workspace:T){
  if(!this.operator)return {...workspace,campaigns:workspace.campaigns.map(c=>({...c,firstPartyOutcomes:undefined,destinationMembership:undefined}))};
  return inTransaction(this.pool,this.operator,async c=>{
   const principals=(await c.query('SELECT id,role FROM users WHERE id=ANY($1::int[])',[[actor.id,this.operator!.id]])).rows;
   if(!principals.some(u=>u.id===this.operator!.id&&u.role==='admin')||!principals.some(u=>u.id===actor.id&&(actor.role!=='admin'||u.role==='admin'))||actor.role==='system')throw new MarketingError('OUTCOMES_ACCESS_DENIED','Current account authority is required.',403);
   // Conversation RLS does not inherit marketing's operator bypass. Only a
   // participant receives unread evidence; staff need a separate assigned case.
   await c.query("SELECT set_config('app.current_user_id',$1,true)",[String(actor.id)]);
   const ids=workspace.campaigns.map(v=>Number(v.id));if(ids.length>30||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new MarketingError('OUTCOMES_SCOPE_INVALID','Use a bounded campaign page.');
   const rows=(await c.query(`SELECT w.campaign_id,
    (SELECT count(*)::text FROM marketing_attribution_touchpoints t JOIN marketing_attribution_links l ON l.nonce=t.link_nonce WHERE l.campaign_id=w.campaign_id AND l.host_id=w.host_id) AS visits,
    (SELECT count(*)::text FROM marketing_inquiry_attributions a WHERE a.campaign_id=w.campaign_id AND a.host_id=w.host_id) AS inquiries,
    (SELECT coalesce(sum(t.unread_count_host),0)::text FROM marketing_inquiry_attributions a JOIN threads t ON t.id=a.thread_id WHERE a.campaign_id=w.campaign_id AND a.host_id=w.host_id AND t.host_id=w.host_id) AS unread,
    (SELECT max(a.occurred_at) FROM marketing_inquiry_attributions a WHERE a.campaign_id=w.campaign_id AND a.host_id=w.host_id) AS last_inquiry,
    (SELECT count(*)::text FROM marketing_booking_measurements b WHERE b.campaign_id=w.campaign_id AND b.host_id=w.host_id AND b.state IN ('CAPTURED','FULFILLED')) AS bookings,
    (SELECT jsonb_build_object('id',m.id,'poolId',m.pool_id,'state',m.state) FROM marketing_pool_memberships m WHERE m.campaign_id=w.campaign_id AND m.host_id=w.host_id AND m.state<>'WITHDRAWN') AS membership
    FROM marketing_campaign_workflows w WHERE w.campaign_id=ANY($1::int[]) AND ($2 OR w.host_id=$3)`,[ids,actor.role==='admin',actor.id])).rows;
   if(rows.length!==ids.length)throw new MarketingError('CAMPAIGN_NOT_FOUND','Campaign not found.',404);
   const observedAt=new Date().toISOString();
   return {...workspace,campaigns:workspace.campaigns.map(campaign=>{const row=rows.find(r=>r.campaign_id===Number(campaign.id));return {...campaign,destinationMembership:row.membership??null,firstPartyOutcomes:{source:'ENCHO_CONSENTED_EVENTS',scope:'CAMPAIGN_ALL_REVISIONS',completeness:'RECORDED_EVENTS_ONLY',observedAt,propertyVisits:this.measurementConfigured?row.visits:null,inquiries:this.measurementConfigured?row.inquiries:null,unreadMessages:this.measurementConfigured&&actor.role==='host'?row.unread:null,lastInquiryAt:row.last_inquiry?.toISOString()??null,bookings:this.canonicalBookingsConfigured?row.bookings:null}};})};
  });
 }
}
