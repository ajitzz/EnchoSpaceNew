import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type pg from 'pg';
import {inTransaction,lockWorkflow} from '../database.js';
import {fingerprint,MarketingError,type Actor} from '../domain.js';
import {authorizeSpending} from '../financeService.js';
import {assertMarketableInventory} from '../protection.js';
import type {CanonicalMarketingFacts} from './facts.js';

export const poolPolicy={version:1,authority:'HARVO-033',currency:'INR',minimumContributionMinor:'100000',maximumDailyPoolSpendMinor:'1000000',allocation:'CONTRIBUTION_WEIGHTED_COLLECTION_EXPOSURE',providerImpressionGuarantee:false,transferable:false} as const;
const uuid=z.string().uuid(),keySchema=z.string().regex(/^[a-zA-Z0-9:_-]{8,160}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const date=z.string().date(),instant=z.string().datetime({offset:true});
export const createPoolSchema=z.object({destination:z.enum(['wayanad','coorg','goa']),title:z.string().trim().min(3).max(100),startsAt:instant,endsAt:instant,stayStart:date,stayEnd:date}).strict().refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt)&&Date.parse(v.endsAt)-Date.parse(v.startsAt)<=90*86400000&&v.stayEnd>v.stayStart&&Date.parse(v.stayEnd)-Date.parse(v.stayStart)<=90*86400000,'Use bounded flight and guest stay dates');
export const consentPoolSchema=z.object({version:z.number().int().positive(),campaignId:z.number().int().positive().safe(),campaignRevision:z.number().int().positive(),policyVersion:z.literal(1),disclosureAccepted:z.literal(true)}).strict();
export const reviewPoolSchema=z.object({version:z.number().int().positive(),factHash:hash,verifiedVilla:z.literal(true),verifiedDestination:z.literal(true),reason:z.string().trim().min(20).max(2000)}).strict();
const failure=(code:string,message:string,status=409):never=>{throw new MarketingError(code,message,status);};

/** Separate product authority. Rotation never writes the wallet or calls an advertising provider. */
export class DestinationPools {
 constructor(private pool:pg.Pool,private serviceActor:Actor|undefined,private facts:CanonicalMarketingFacts,private providerAccounts:Partial<Record<'GOOGLE'|'META',string>>={}){}
 private async tx<T>(actor:Actor|undefined,work:(c:pg.PoolClient)=>Promise<T>,adminOnly=false){
  if(!this.serviceActor)return failure('POOL_NOT_CONFIGURED','An audited pool service operator is required.',503);
  return inTransaction(this.pool,this.serviceActor,async c=>{
   if((await c.query('SELECT role FROM users WHERE id=$1',[this.serviceActor!.id])).rows[0]?.role!=='admin')return failure('SERVICE_ACTOR_REQUIRED','The pool operator is not an administrator.',503);
   if(actor){const user=(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0];if(!user||actor.role==='system'||actor.role==='admin'&&user.role!=='admin'||adminOnly&&user.role!=='admin')return failure('POOL_ACCESS_DENIED','Current account authority is required.',403);}
   return work(c);
  });
 }
 private async replay(c:pg.PoolClient,actor:Actor,key:string,input:unknown){
  keySchema.parse(key);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pool-request:${actor.id}:${key}`]);
  const prior=(await c.query('SELECT evidence,request_hash FROM marketing_pool_events WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
  if(prior&&prior.request_hash!==fingerprint(input))return failure('IDEMPOTENCY_CONFLICT','This pool request identity is already bound to different input.');return prior?.evidence;
 }
 private async audit(c:pg.PoolClient,actor:Actor,key:string,input:unknown,poolId:string,member:any,kind:string,evidence:unknown){await c.query('INSERT INTO marketing_pool_events(id,pool_id,membership_id,host_id,actor_id,request_key,request_hash,kind,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),poolId,member?.id??null,member?.host_id??null,actor.id,key,fingerprint(input),kind,JSON.stringify(evidence)]);}
 private async parent(c:pg.PoolClient,id:string){uuid.parse(id);const p=(await c.query('SELECT * FROM marketing_destination_pools WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!p)return failure('POOL_NOT_FOUND','Destination flight was not found.',404);return p;}
 private async member(c:pg.PoolClient,id:string,actor?:Actor){uuid.parse(id);const m=(await c.query('SELECT * FROM marketing_pool_memberships WHERE id=$1',[id])).rows[0];if(!m||actor&&actor.role!=='admin'&&m.host_id!==actor.id)return failure('MEMBERSHIP_NOT_FOUND','Destination membership was not found.',404);const p=await this.parent(c,m.pool_id);return {p,m:(await c.query('SELECT * FROM marketing_pool_memberships WHERE id=$1 FOR UPDATE',[id])).rows[0]};}
 async create(actor:Actor,input:unknown,key:string){const body=createPoolSchema.parse(input);return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,body);if(old)return old;const id=randomUUID();await c.query('INSERT INTO marketing_destination_pools(id,destination,title,policy_version,policy,starts_at,ends_at,stay_start,stay_end,created_by) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9)',[id,body.destination,body.title,JSON.stringify(poolPolicy),body.startsAt,body.endsAt,body.stayStart,body.stayEnd,actor.id]);const result={id,state:'DRAFT',version:1};await this.audit(c,actor,key,body,id,null,'POOL_CREATED',result);return result;},true);}
 async setState(actor:Actor,id:string,input:unknown,key:string){const body=z.object({version:z.number().int().positive(),state:z.enum(['OPEN','ACTIVE','PAUSED','CLOSED']),reason:z.string().trim().min(10).max(2000)}).strict().parse(input);return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,{id,...body});if(old)return old;const p=await this.parent(c,id);if(p.version!==body.version)return failure('REVISION_CONFLICT','Reload the destination flight before changing it.');const allowed:Record<string,string[]>={DRAFT:['OPEN','CLOSED'],OPEN:['ACTIVE','CLOSED'],ACTIVE:['PAUSED','CLOSED'],PAUSED:['ACTIVE','CLOSED'],CLOSED:[]};if(!allowed[p.state]?.includes(body.state))return failure('POOL_STATE_CONFLICT','This destination transition is not available.');if(body.state==='ACTIVE'&&new Date(p.ends_at).getTime()<=Date.now())return failure('POOL_FLIGHT_ENDED','This destination flight has ended.');await c.query('UPDATE marketing_destination_pools SET state=$2,version=version+1 WHERE id=$1',[id,body.state]);const result={id,state:body.state,version:p.version+1};await this.audit(c,actor,key,{id,...body},id,null,'POOL_STATE_CHANGED',{...result,reason:body.reason});return result;},true);}
 async invite(actor:Actor,id:string,input:unknown,key:string){const body=z.object({listingId:z.number().int().positive().safe()}).strict().parse(input);return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,{id,...body});if(old)return old;const p=await this.parent(c,id);if(!['DRAFT','OPEN'].includes(p.state))return failure('POOL_ENROLLMENT_CLOSED','This flight is not accepting invitations.');if(Number((await c.query('SELECT count(*)::int AS n FROM marketing_pool_memberships WHERE pool_id=$1',[id])).rows[0].n)>=50)return failure('POOL_LIMIT_EXCEEDED','A destination flight supports at most 50 reviewed properties.');const facts=await this.facts.read(c,actor,body.listingId);const memberId=randomUUID();const inserted=(await c.query(`INSERT INTO marketing_pool_memberships(id,pool_id,host_id,listing_id) VALUES($1,$2,$3,$4) ON CONFLICT(pool_id,listing_id) DO NOTHING RETURNING *`,[memberId,id,facts.hostId,body.listingId])).rows[0];if(!inserted)return failure('MEMBERSHIP_EXISTS','This property already has a flight invitation.');const result={id:memberId,state:'INVITED',version:1};await this.audit(c,actor,key,{id,...body},id,inserted,'MEMBER_INVITED',result);return result;},true);}
 async consent(actor:Actor,id:string,input:unknown,key:string){const body=consentPoolSchema.parse(input);return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,{id,...body});if(old)return old;
  // All campaign/finance paths lock campaign first, then pool, then member.
  const row=await lockWorkflow(c,body.campaignId,actor);const {p,m}=await this.member(c,id,actor);
  if(m.host_id!==actor.id||m.state!=='INVITED'||m.version!==body.version||p.state!=='OPEN')return failure('POOL_CONSENT_CONFLICT','Only the invited owner can accept the current open flight.');
  if(row.host_id!==actor.id||row.listing_id!==m.listing_id||row.revision!==body.campaignRevision||row.quote_id||row.reservation_id||row.state!=='APPROVED'||row.content_approval?.revision!==row.revision||row.content_approval?.status!=='APPROVED')return failure('POOL_FUNDING_PLAN_REQUIRED','Choose your approved, unfunded property campaign as a new destination contribution plan.');
  if(row.listing_snapshot.currency!=='INR'||BigInt(row.draft.mediaBudgetMinor)<100000n||BigInt(row.draft.dailyBudgetMinor)>1000000n||row.draft.startDate!==new Date(p.starts_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})||row.draft.endDate!==new Date(p.ends_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))return failure('POOL_PLAN_MISMATCH','The INR contribution must be at least ₹1,000, within the daily cap, and use this destination flight’s dates.');
  if((await c.query('SELECT id FROM provider_publishing_transactions WHERE campaign_id=$1 LIMIT 1',[row.campaign_id])).rows.length||(await c.query('SELECT id FROM marketing_finance_quotes WHERE campaign_id=$1 LIMIT 1',[row.campaign_id])).rows.length)return failure('POOL_FUNDING_PLAN_REQUIRED','A previously quoted or submitted campaign cannot be repurposed.');
  const consentHash=fingerprint({poolId:p.id,policy:p.policy,hostId:m.host_id,listingId:m.listing_id,campaignId:row.campaign_id,revision:row.revision,contributionMinor:row.draft.mediaBudgetMinor});
  await c.query("UPDATE marketing_pool_memberships SET state='CONSENTED',campaign_id=$2,campaign_revision=$3,contribution_minor=$4,consent_hash=$5,version=version+1 WHERE id=$1",[id,row.campaign_id,row.revision,row.draft.mediaBudgetMinor,consentHash]);const result={id,state:'CONSENTED',version:m.version+1,consentHash};await this.audit(c,actor,key,{id,...body},p.id,m,'MEMBER_CONSENTED',result);return result;
 });}
 async review(actor:Actor,id:string,input:unknown,key:string){const body=reviewPoolSchema.parse(input);return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,{id,...body});if(old)return old;const {p,m}=await this.member(c,id);if(m.version!==body.version||m.state!=='CONSENTED'||p.state!=='OPEN')return failure('POOL_REVIEW_CONFLICT','Review the current consented property while enrollment is open.');const projection=await this.facts.read(c,actor,m.listing_id);if(projection.hostId!==m.host_id||projection.factHash!==body.factHash)return failure('FACTS_CHANGED','Review the current published property evidence.');await this.inventory(c,p,m.listing_id);await c.query("UPDATE marketing_pool_memberships SET state='ELIGIBLE',fact_hash=$2,version=version+1 WHERE id=$1",[id,body.factHash]);const result={id,state:'ELIGIBLE',version:m.version+1};await this.audit(c,actor,key,{id,...body},p.id,m,'MEMBER_VERIFIED',{...result,reason:body.reason,factHash:body.factHash,verifiedVilla:true,verifiedDestination:true});return result;},true);}
 private async inventory(c:pg.PoolClient,p:any,listingId:number){await assertMarketableInventory(c,listingId,{stayStartDate:typeof p.stay_start==='string'?p.stay_start.slice(0,10):p.stay_start.toISOString().slice(0,10),stayEndDate:typeof p.stay_end==='string'?p.stay_end.slice(0,10):p.stay_end.toISOString().slice(0,10)} as any);}
 async quoteProduct(c:pg.PoolClient,row:any){const m=(await c.query("SELECT m.*,p.policy FROM marketing_pool_memberships m JOIN marketing_destination_pools p ON p.id=m.pool_id WHERE m.campaign_id=$1 AND m.state<>'WITHDRAWN'",[row.campaign_id])).rows[0];if(!m)return undefined;if(m.campaign_revision!==row.revision||!['CONSENTED','ELIGIBLE'].includes(m.state)||m.host_id!==row.host_id)return failure('POOL_PLAN_CHANGED','Destination contribution consent changed.');return {kind:'DESTINATION_POOL' as const,poolId:m.pool_id,membershipId:m.id,policyVersion:1,consentHash:m.consent_hash,contributionMinor:String(m.contribution_minor)};}
 /** A collection allocator is not a provider publisher. No environment switch can clear this gate. */
 assertExecutionAvailable():never{return failure('POOL_EXECUTION_UNAVAILABLE','Paid destination flights are not open: provider publication and spend settlement must be verified first.',503);}
 async executionQuoteProduct(c:pg.PoolClient,row:any){const product=await this.quoteProduct(c,row);if(product)this.assertExecutionAvailable();return product;}
 async guardCampaign(c:pg.PoolClient,row:any){if((await c.query("SELECT id FROM marketing_pool_memberships WHERE campaign_id=$1 AND state<>'WITHDRAWN'",[row.campaign_id])).rows.length)return failure('POOL_SEPARATE_PRODUCT','This is a destination contribution plan. It cannot be edited or published as a dedicated property ad.');}
 async activateMember(actor:Actor,id:string,key:string,reserve:(c:pg.PoolClient,row:any)=>Promise<{id:string}>){return this.tx(actor,async c=>{
  const old=await this.replay(c,actor,key,{id,action:'ACTIVATE_MEMBER'});if(old)return old;const initial=(await c.query('SELECT campaign_id FROM marketing_pool_memberships WHERE id=$1 AND host_id=$2',[uuid.parse(id),actor.id])).rows[0];if(!initial)return failure('MEMBERSHIP_NOT_FOUND','Membership was not found.',404);const row=await lockWorkflow(c,initial.campaign_id,actor);const {p,m}=await this.member(c,id,actor);
  if(m.state!=='ELIGIBLE'||!['OPEN','ACTIVE'].includes(p.state)||row.revision!==m.campaign_revision||row.state!=='APPROVED'||!row.quote_id)return failure('POOL_ACTIVATION_CONFLICT','An eligible, approved contribution with its accepted funding quote is required.');
  const quote=(await c.query('SELECT * FROM marketing_finance_quotes WHERE id=$1 AND host_id=$2',[row.quote_id,m.host_id])).rows[0],expected=await this.quoteProduct(c,row);
  if(!quote||fingerprint(quote.snapshot.product)!==fingerprint(expected))return failure('POOL_QUOTE_MISMATCH','Funding must explicitly bind this pool, membership and consent.');
  const reservation=await reserve(c,row);await c.query('UPDATE marketing_campaign_workflows SET reservation_id=$2 WHERE campaign_id=$1',[row.campaign_id,reservation.id]);await this.inventory(c,p,m.listing_id);
  await c.query("UPDATE marketing_pool_memberships SET state='ACTIVE',quote_id=$2,reservation_id=$3,version=version+1 WHERE id=$1",[id,row.quote_id,reservation.id]);const result={id,state:'ACTIVE',version:m.version+1};await this.audit(c,actor,key,{id,action:'ACTIVATE_MEMBER'},p.id,m,'MEMBER_ACTIVATED',result);return result;
 });}
 async pauseMember(actor:Actor,id:string,key:string){return this.tx(actor,async c=>{const old=await this.replay(c,actor,key,{id,action:'PAUSE_MEMBER'});if(old)return old;const {p,m}=await this.member(c,id,actor);if(!['ACTIVE','ELIGIBLE'].includes(m.state))return failure('POOL_STATE_CONFLICT','This membership is not allocating exposure.');await c.query("UPDATE marketing_pool_memberships SET state='PAUSED',rotation_credit=0,version=version+1 WHERE id=$1",[id]);const result={id,state:'PAUSED',version:m.version+1,fundsTransferred:false};await this.audit(c,actor,key,{id,action:'PAUSE_MEMBER'},p.id,m,'MEMBER_PAUSED',result);return result;});}
 async resumeMember(actor:Actor,id:string,key:string){return this.tx(actor,async c=>{
  const old=await this.replay(c,actor,key,{id,action:'RESUME_MEMBER'});if(old)return old;
  const {p,m}=await this.member(c,id,actor);
  if(m.state!=='PAUSED'||!['OPEN','ACTIVE'].includes(p.state)||new Date(p.ends_at).getTime()<=Date.now())return failure('POOL_STATE_CONFLICT','Only a paused member in an open current flight can resume.');
  const facts=await this.facts.read(c,actor,m.listing_id);if(facts.factHash!==m.fact_hash||facts.hostId!==m.host_id)return failure('FACTS_CHANGED','The approved property facts changed. A new eligibility review is required.');
  await this.inventory(c,p,m.listing_id);
  if(m.reservation_id){const funding=(await c.query("SELECT r.status,r.risk_release_at,a.frozen FROM marketing_finance_reservations r JOIN marketing_finance_accounts a ON a.host_id=r.host_id AND a.currency=r.currency WHERE r.id=$1 AND r.host_id=$2",[m.reservation_id,m.host_id])).rows[0];if(!funding||funding.status!=='RESERVED'||funding.frozen||new Date(funding.risk_release_at).getTime()>Date.now())return failure('POOL_FUNDS_UNAVAILABLE','Current reserved and risk-released funding is required.');}
  const state=m.reservation_id?'ACTIVE':'ELIGIBLE';await c.query('UPDATE marketing_pool_memberships SET state=$2,rotation_credit=0,version=version+1 WHERE id=$1',[id,state]);
  const result={id,state,version:m.version+1};await this.audit(c,actor,key,{id,action:'RESUME_MEMBER'},p.id,m,'MEMBER_RESUMED',result);return result;
 });}
 /** Withdraw only before a financial obligation exists. Funded closure requires settlement evidence. */
 async withdrawMember(actor:Actor,id:string,key:string){return this.tx(actor,async c=>{
  const old=await this.replay(c,actor,key,{id,action:'WITHDRAW_MEMBER'});if(old)return old;
  const initial=(await c.query('SELECT campaign_id FROM marketing_pool_memberships WHERE id=$1',[uuid.parse(id)])).rows[0];
  if(initial?.campaign_id)await lockWorkflow(c,initial.campaign_id,actor);
  const {p,m}=await this.member(c,id,actor);
  if(m.reservation_id||m.campaign_id&&(await c.query('SELECT id FROM marketing_finance_quotes WHERE campaign_id=$1 LIMIT 1',[m.campaign_id])).rows.length)return failure('POOL_SETTLEMENT_REQUIRED','An accepted quote or financial obligation requires documented closure. Pause allocation while it is reviewed.');
  if(!['INVITED','CONSENTED','ELIGIBLE','PAUSED'].includes(m.state))return failure('POOL_STATE_CONFLICT','This membership cannot be withdrawn.');
  await c.query("UPDATE marketing_pool_memberships SET state='WITHDRAWN',rotation_credit=0,version=version+1 WHERE id=$1",[id]);
  const result={id,state:'WITHDRAWN',version:m.version+1};await this.audit(c,actor,key,{id,action:'WITHDRAW_MEMBER'},p.id,m,'MEMBER_WITHDRAWN',result);return result;
 });}
 async list(actor:Actor){return this.tx(actor,async c=>{
  const pools=(await c.query(`SELECT p.* FROM marketing_destination_pools p WHERE $1 OR EXISTS(SELECT 1 FROM marketing_pool_memberships m WHERE m.pool_id=p.id AND m.host_id=$2) ORDER BY p.created_at DESC,p.id LIMIT 30`,[actor.role==='admin',actor.id])).rows;
  const members=(await c.query(`SELECT m.*,l.title AS listing_title,l.slug,(SELECT count(*)::int FROM marketing_pool_exposures e WHERE e.membership_id=m.id) AS served_exposures FROM marketing_pool_memberships m JOIN listings l ON l.id=m.listing_id WHERE m.pool_id=ANY($1::uuid[]) AND ($2 OR m.host_id=$3) ORDER BY m.created_at,m.id LIMIT 301`,[pools.map(p=>p.id),actor.role==='admin',actor.id])).rows;if(members.length>300)return failure('POOL_LIMIT_EXCEEDED','Narrow the destination workspace.');
  return {policy:poolPolicy,capabilities:{funding:false,activation:false,reason:'Destination flights are in preparation. Paid enrollment is not open.'},pools:pools.map(p=>({id:p.id,destination:p.destination,title:p.title,state:p.state,version:p.version,startsAt:p.starts_at,endsAt:p.ends_at,stayStart:p.stay_start,stayEnd:p.stay_end,members:members.filter(m=>m.pool_id===p.id).map(m=>({id:m.id,listingId:m.listing_id,listingTitle:m.listing_title,state:m.state,version:m.version,campaignId:m.campaign_id,contributionMinor:m.contribution_minor,factHash:m.fact_hash,servedExposures:m.served_exposures,hasReservation:!!m.reservation_id}))}))};
 });}
 /** Durable pre-dispatch claim. An uncertain provider response must retain this claim. */
 async claimSpend(actor:Actor,id:string,input:unknown,key:string){
  const body=z.object({amountMinor:z.string().regex(/^[1-9]\d{0,6}$/).refine(v=>BigInt(v)<=1000000n),provider:z.enum(['GOOGLE','META'])}).strict().parse(input);
  return this.tx(actor,async c=>{
   const old=await this.replay(c,actor,key,{id,...body});if(old)return old;
   const initial=(await c.query('SELECT campaign_id FROM marketing_pool_memberships WHERE id=$1',[uuid.parse(id)])).rows[0];if(!initial?.campaign_id)return failure('MEMBERSHIP_NOT_FOUND','Membership was not found.',404);
   const row=await lockWorkflow(c,initial.campaign_id,actor),{p,m}=await this.member(c,id);
   const account=this.providerAccounts[body.provider];if(!account)return failure('PROVIDER_ACCOUNT_REQUIRED','A configured destination provider account is required.',503);
   if(row.provider!==body.provider||m.state!=='ACTIVE'||p.state!=='ACTIVE'||new Date(p.starts_at).getTime()>Date.now()||new Date(p.ends_at).getTime()<=Date.now())return failure('POOL_NOT_ACTIVE','Only an active eligible flight can authorize destination spend.');
   await this.inventory(c,p,m.listing_id);
   const facts=await this.facts.read(c,actor,m.listing_id);if(facts.factHash!==m.fact_hash)return failure('FACTS_CHANGED','The approved property facts have changed.');
   const day=(await c.query("SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day")).rows[0].day;
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pool-spend:${p.destination}:${day}`]);
   const daily=BigInt((await c.query('SELECT coalesce(sum(s.amount_minor),0)::text AS total FROM marketing_pool_spend_claims s JOIN marketing_destination_pools p ON p.id=s.pool_id WHERE p.destination=$1 AND s.spend_day=$2::date',[p.destination,day])).rows[0].total);
   const used=BigInt((await c.query('SELECT coalesce(sum(amount_minor),0)::text AS total FROM marketing_pool_spend_claims WHERE membership_id=$1',[id])).rows[0].total);
   if(daily+BigInt(body.amountMinor)>1000000n)return failure('POOL_DAILY_CAP','This destination has reached its ₹10,000 daily authorization cap.');
   if(used+BigInt(body.amountMinor)>BigInt(m.contribution_minor))return failure('MEMBER_CONTRIBUTION_CAP','This member’s contribution cannot fund more spending.');
   const authorization=await authorizeSpending(c,{reservationId:m.reservation_id,campaignId:row.campaign_id,hostId:m.host_id,revision:String(m.campaign_revision),provider:body.provider,accountId:account,amountMinor:String(m.contribution_minor),idempotencyKey:`pool-authorization:${m.id}`});
   const claimId=randomUUID();await c.query('INSERT INTO marketing_pool_spend_claims(id,pool_id,membership_id,host_id,reservation_id,provider,account_id,operation_key,spend_day,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[claimId,p.id,m.id,m.host_id,m.reservation_id,body.provider,account,`pool-claim:${actor.id}:${key}`,day,body.amountMinor]);
   const result={id:claimId,authorizationId:authorization.authorizationId,day,amountMinor:body.amountMinor,state:'AUTHORIZED_NOT_OBSERVED',fundsTransferred:false};await this.audit(c,actor,key,{id,...body},p.id,m,'SPEND_CLAIMED',result);return result;
  },true);
 }
 /** Bounded monitoring independent of guest traffic; eligibility never moves money. */
 async sweepEligibility(){return this.tx(undefined,async c=>{
  // Match collection's pool-before-member lock order; skip pools owned by another sweep/request.
  const parents=(await c.query("SELECT * FROM marketing_destination_pools WHERE state IN ('OPEN','ACTIVE','PAUSED') ORDER BY eligibility_checked_at,id LIMIT 2 FOR UPDATE SKIP LOCKED")).rows;
  let paused=0,expired=0;
  for(const p of parents){
   const ended=new Date(p.ends_at).getTime()<=Date.now();
   const members=(await c.query("SELECT * FROM marketing_pool_memberships WHERE pool_id=$1 AND state IN ('INVITED','CONSENTED','ELIGIBLE','ACTIVE','PAUSED') ORDER BY eligibility_checked_at,id LIMIT 25 FOR UPDATE",[p.id])).rows;
   for(const m of members){
    await c.query('UPDATE marketing_pool_memberships SET eligibility_checked_at=now() WHERE id=$1',[m.id]);
    let reason:string|null=ended?'FLIGHT_ENDED':null;
    if(!ended&&m.state==='ACTIVE')try{await this.inventory(c,p,m.listing_id);const f=await this.facts.read(c,{id:this.serviceActor!.id,role:'admin'},m.listing_id);if(f.hostId!==m.host_id||f.factHash!==m.fact_hash)reason='FACTS_CHANGED';}catch(error){if(!(error instanceof MarketingError)||!['INVENTORY_UNAVAILABLE','LISTING_NOT_AVAILABLE'].includes(error.code))throw error;reason=error.code;}
    if(!reason)continue;const state=ended?'EXPIRED':'PAUSED';
    await c.query('UPDATE marketing_pool_memberships SET state=$2,rotation_credit=0,version=version+1 WHERE id=$1',[m.id,state]);
    await this.audit(c,this.serviceActor!,`eligibility:${m.id}:${m.version}`,{reason},p.id,m,'MEMBER_ELIGIBILITY_ENDED',{reason,state,fundsTransferred:false,financialClosure:m.reservation_id?'SETTLEMENT_REQUIRED':'NO_RESERVATION'});
    if(ended)expired++;else paused++;
   }
   await c.query('UPDATE marketing_destination_pools SET eligibility_checked_at=now() WHERE id=$1',[p.id]);
   if(ended&&(await c.query("SELECT id FROM marketing_pool_memberships WHERE pool_id=$1 AND state NOT IN ('EXPIRED','WITHDRAWN','INELIGIBLE') LIMIT 1",[p.id])).rowCount===0){await c.query("UPDATE marketing_destination_pools SET state='CLOSED',version=version+1 WHERE id=$1",[p.id]);await this.audit(c,this.serviceActor!,`expire-pool:${p.id}:${p.version}`,{reason:'FLIGHT_ENDED'},p.id,null,'POOL_FLIGHT_ENDED',{state:'CLOSED',financialClosure:'REQUIRES_SEPARATE_EVIDENCE'});}
  }
  return {paused,expired};
 });}
 async collection(destination:string){z.enum(['wayanad','coorg','goa']).parse(destination);return this.tx(undefined,async c=>{
  const found=(await c.query("SELECT id FROM marketing_destination_pools WHERE destination=$1 AND state='ACTIVE' AND starts_at<=now() AND ends_at>now()",[destination])).rows[0];if(!found)return {destination,title:`Stays in ${destination[0].toUpperCase()+destination.slice(1)}`,items:[],allocation:'No active curated flight'};
  const p=await this.parent(c,found.id);if(p.state!=='ACTIVE'||new Date(p.ends_at).getTime()<=Date.now())return {destination,title:p.title,items:[],allocation:'This flight is not active'};
  const rows=(await c.query(`SELECT m.*,l.title,l.slug,l.city,(SELECT url FROM media_assets WHERE entity_type='listing' AND entity_id=l.id AND moderation_status='approved' AND category='image' ORDER BY is_hero DESC,order_index,id LIMIT 1) AS image FROM marketing_pool_memberships m JOIN listings l ON l.id=m.listing_id JOIN marketing_finance_reservations r ON r.id=m.reservation_id JOIN marketing_finance_accounts a ON a.host_id=m.host_id AND a.currency='INR' WHERE m.pool_id=$1 AND m.state='ACTIVE' AND l.user_id=m.host_id AND l.publication_status='published' AND r.status='RESERVED' AND r.risk_release_at<=now() AND NOT a.frozen ORDER BY m.id LIMIT 51 FOR UPDATE OF m`,[p.id])).rows;
  if(rows.length>50)return failure('POOL_LIMIT_EXCEEDED','This flight exceeds its bounded allocation size.');const eligible:any[]=[];
  for(const m of rows){try{await this.inventory(c,p,m.listing_id);const f=await this.facts.read(c,{id:this.serviceActor!.id,role:'admin'},m.listing_id);if(f.factHash!==m.fact_hash)throw new MarketingError('FACTS_CHANGED','Published facts changed.');eligible.push(m);}catch(error){if(!(error instanceof MarketingError)||!['INVENTORY_UNAVAILABLE','FACTS_CHANGED','LISTING_NOT_AVAILABLE'].includes(error.code))throw error;await c.query("UPDATE marketing_pool_memberships SET state='PAUSED',rotation_credit=0,version=version+1 WHERE id=$1",[m.id]);await this.audit(c,this.serviceActor!,`auto-pause:${m.id}:${m.version}`,{reason:error.code},p.id,m,'MEMBER_AUTO_PAUSED',{reason:error.code,fundsTransferred:false});}}
  if(!eligible.length)return {destination,title:p.title,items:[],allocation:'No eligible inventory for this flight'};
  const total=eligible.reduce((sum,m)=>sum+BigInt(m.contribution_minor),0n);let selected=eligible[0];for(const m of eligible){m.nextCredit=BigInt(m.rotation_credit)+BigInt(m.contribution_minor);if(m.nextCredit>(selected.nextCredit??-1n))selected=m;}
  for(const m of eligible)await c.query('UPDATE marketing_pool_memberships SET rotation_credit=$2 WHERE id=$1',[m.id,(m.nextCredit-(m===selected?total:0n)).toString()]);
  await c.query('INSERT INTO marketing_pool_exposures(id,pool_id,membership_id,host_id,policy_version,selection_hash) VALUES($1,$2,$3,$4,1,$5)',[randomUUID(),p.id,selected.id,selected.host_id,fingerprint(eligible.map(m=>({id:m.id,weight:String(m.contribution_minor),credit:m.nextCredit.toString()})))]);
  return {destination,title:p.title,allocation:'Sponsored collection · featured placement rotates in proportion to contributions among eligible stays. This is collection placement, not guaranteed ad-network impressions.',items:[selected,...eligible.filter(m=>m!==selected)].map((m,i)=>({title:m.title,path:`/stay/${m.slug}`,city:m.city,image:m.image,featured:i===0}))};
 });}
}
