import {createHash} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {isRestrictedWorkforceRuntime} from '../../lib/iam/runtimeBoundary.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {PermissionNotGrantedError} from '../../lib/iam/authorizationPort.js';
import {principalContextSchema,type PrincipalContext} from '../../shared/iam/principalContext.js';
import {isSafeAdminImageUrl} from '../../lib/mediaUrlSafety.js';
import {validatePropertyPublication} from '../listings/publicationValidation.js';
import {offerDraftInputSchema,offerTransitionInputSchema,offerRevisionViewSchema,
  eligiblePublicOfferSchema,publicOfferStateSchema,type OfferDraftInput,type OfferRevisionView,
  type EligiblePublicOffer,type PublicOfferState} from '../../shared/offers/acceptedOfferContracts.js';

export type OfferAuthorityErrorCode='INPUT_INVALID'|'HOST_REQUIRED'|'STAFF_REQUIRED'|'OFFER_NOT_FOUND'|
  'OFFER_FORBIDDEN'|'OFFER_STATE_CONFLICT'|'OFFER_VERSION_CONFLICT'|'OFFER_STALE_REVIEW'|
  'OFFER_PROPERTY_INELIGIBLE'|'OFFER_ROOM_INVALID'|'OFFER_MEDIA_INVALID'|'ROOM_UNAVAILABLE'|
  'LEGACY_DATA_UNRECONCILED'|'OFFER_AUTHORITY_UNAVAILABLE';
export class OfferAuthorityError extends Error{
  readonly status:number;
  constructor(readonly code:OfferAuthorityErrorCode,cause?:unknown){
    super(code,{cause});this.name='OfferAuthorityError';
    this.status=code==='OFFER_AUTHORITY_UNAVAILABLE'?503:code==='HOST_REQUIRED'||code==='STAFF_REQUIRED'||code==='OFFER_FORBIDDEN'?403:
      code==='OFFER_NOT_FOUND'?404:code==='INPUT_INVALID'?400:
      code==='OFFER_STATE_CONFLICT'||code==='OFFER_VERSION_CONFLICT'||code==='OFFER_STALE_REVIEW'?409:422;
  }
}

const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=z.number().int().positive().max(2147483647);
const uuid=z.string().uuid();
const dateText=(value:unknown)=>typeof value==='string'?value:value instanceof Date?value.toISOString().slice(0,10):'';
const instant=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
const number=(value:unknown)=>Number(value);
const indiaDate=(asOf:Date)=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(asOf);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const nextDate=(day:string)=>new Date(Date.parse(`${day}T00:00:00.000Z`)+86400000).toISOString().slice(0,10);
const maxDate=(a:string,b:string)=>a>b?a:b;

type Source={facts:Record<string,unknown>;sourceHash:string;mediaFacts:Array<Record<string,unknown>>;mediaHash:string};
async function lockSource(client:pg.PoolClient,listingId:number,roomTypeId:number,
  start:string,end:string,offerId:string|null=null){
  await client.query('SELECT public.sellable_offer_lock_evidence($1,$2,$3::date,$4::date,$5::uuid)',
    [listingId,roomTypeId,start,end,offerId]);
}
async function readSource(client:pg.PoolClient,listingId:number,roomTypeId:number):Promise<Source>{
  const row=(await client.query<{facts:Record<string,unknown>|null;source_hash:string|null;media_hash:string|null}>(`
    WITH snapshot AS (SELECT public.sellable_offer_source_snapshot($1,$2) AS facts)
    SELECT facts,encode(sha256(convert_to(facts::text,'UTF8')),'hex') AS source_hash,
      encode(sha256(convert_to((facts->'media')::text,'UTF8')),'hex') AS media_hash FROM snapshot`,
    [listingId,roomTypeId])).rows[0];
  if(!row?.facts||!row.source_hash||!row.media_hash)throw new OfferAuthorityError('OFFER_ROOM_INVALID');
  const mediaFacts=Array.isArray(row.facts.media)?row.facts.media as Array<Record<string,unknown>>:[];
  return {facts:row.facts,sourceHash:row.source_hash,mediaFacts,mediaHash:row.media_hash};
}
function verifySource(source:Source,listingId:number,roomTypeId:number,hostAccountId:number,
  maxGuests:number,minNights:number){
  const f=source.facts;
  if(f.listingId!==listingId||f.roomTypeId!==roomTypeId||f.hostAccountId!==hostAccountId||
     f.publicationStatus!=='published'||typeof f.slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug))
    throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
  if(f.listingCurrency!=='INR'||f.roomCurrency!=='INR'||typeof f.roomName!=='string'||!f.roomName.trim()||
    !Number.isSafeInteger(f.maxGuests)||!Number.isSafeInteger(f.minNights)||
    !Number.isSafeInteger(f.inventoryCount)||number(f.inventoryCount)<1||maxGuests>number(f.maxGuests)||
    minNights<number(f.minNights))throw new OfferAuthorityError('OFFER_ROOM_INVALID');
  if(source.mediaFacts.length<3||source.mediaFacts.filter(m=>m.sleepingArea===true).length<1||
    source.mediaFacts.some(m=>m.roomTypeId!==roomTypeId||m.status!=='approved'||!isSafeAdminImageUrl(m.url)))
    throw new OfferAuthorityError('OFFER_MEDIA_INVALID');
}

type InventoryRow={date:string;listing_id:number;total_units:number;held_units:number;booked_units:number;blocked_units:number};
type BlockRow={room_type_id:number|null;room_tier_key:string|null;mapping_status:string|null;start_date:string;end_date:string};
function firstAvailableStart(rows:InventoryRow[],blocks:BlockRow[],listingId:number,roomTypeId:number,
  start:string,end:string,minNights:number):{date:string|null;legacy:boolean}{
  const unresolved=blocks.some(b=>b.room_type_id===null||b.room_tier_key==='all'||b.mapping_status!=='mapped');
  if(unresolved)return {date:null,legacy:true};
  const byDate=new Map(rows.map(row=>[row.date,row]));
  let cursor=start;
  let streak=0;
  let streakStart:string|null=null;
  for(let count=0;cursor<end&&count<10000;count++,cursor=nextDate(cursor)){
    const row=byDate.get(cursor);
    const blocked=blocks.some(b=>b.room_type_id===roomTypeId&&b.start_date<=cursor&&b.end_date>=cursor);
    const available=row&&row.listing_id===listingId&&row.total_units>=0&&row.held_units>=0&&row.booked_units>=0&&
      row.blocked_units>=0&&row.held_units+row.booked_units+row.blocked_units<=row.total_units&&
      row.total_units-row.held_units-row.booked_units-row.blocked_units>=1&&!blocked;
    if(available){if(streak===0)streakStart=cursor;streak++;if(streak>=minNights)return {date:streakStart,legacy:false};}
    else{streak=0;streakStart=null;}
  }
  return {date:null,legacy:false};
}
async function readInventory(client:pg.PoolClient,listingId:number,roomTypeId:number,start:string,end:string,
  minNights:number,asOf:Date){
  const lower=maxDate(start,indiaDate(asOf));
  const [nights,blocks]=await Promise.all([
    client.query<InventoryRow>(`SELECT calendar_date::text AS date,listing_id,total_units,held_units,booked_units,blocked_units
      FROM inventory_days WHERE room_type_id=$1 AND calendar_date >= $2::date AND calendar_date < $3::date
      ORDER BY calendar_date LIMIT 10000`,[roomTypeId,start,end]),
    client.query<BlockRow>(`SELECT room_type_id,room_tier_key,mapping_status,start_date::text,end_date::text
      FROM room_calendar_blocks WHERE listing_id=$1 AND start_date < $3::date AND end_date >= $2::date
        AND (room_type_id IS NULL OR room_type_id=$4) ORDER BY start_date,id`,[listingId,start,end,roomTypeId]),
  ]);
  const fingerprint=sha({nights:nights.rows,blocks:blocks.rows});
  return {...(lower>=end?{date:null,legacy:false}:
    firstAvailableStart(nights.rows,blocks.rows,listingId,roomTypeId,lower,end,minNights)),fingerprint};
}

const viewQuery=`SELECT o.id AS offer_id,o.listing_id,o.room_type_id,o.host_account_id,o.version,
  r.revision,r.amount_minor::text,r.currency,r.price_basis,r.stay_start::text,r.stay_end::text,
  r.effective_from,r.effective_until,r.max_guests,r.min_nights,r.source_hash,r.media_hash,r.created_at,
  (SELECT occurred_at FROM sellable_offer_events e WHERE e.offer_id=o.id AND e.revision=r.revision
    AND e.event_type='SUBMITTED') AS submitted_at,
  (SELECT occurred_at FROM sellable_offer_events e WHERE e.offer_id=o.id AND e.revision=r.revision
    AND e.event_type='ACCEPTED') AS accepted_at,
  (SELECT occurred_at FROM sellable_offer_events e WHERE e.offer_id=o.id AND e.revision=r.revision
    AND e.event_type='RETIRED') AS retired_at,
  (SELECT event_type FROM sellable_offer_events e WHERE e.offer_id=o.id AND e.revision=r.revision
    ORDER BY e.offer_version DESC,e.occurred_at DESC LIMIT 1) AS latest_event
  FROM sellable_offers o JOIN sellable_offer_revisions r ON r.offer_id=o.id`;
function toView(row:Record<string,unknown>):OfferRevisionView{
  const state=String(row.latest_event);
  return offerRevisionViewSchema.parse({offerId:row.offer_id,listingId:number(row.listing_id),roomTypeId:number(row.room_type_id),
    hostAccountId:number(row.host_account_id),revision:number(row.revision),
    status:state==='DRAFT_CREATED'?'DRAFT':state,
    amountMinor:row.amount_minor,currency:row.currency,priceBasis:row.price_basis,
    stayStart:dateText(row.stay_start),stayEnd:dateText(row.stay_end),
    effectiveFrom:instant(row.effective_from),effectiveUntil:instant(row.effective_until),
    maxGuests:number(row.max_guests),minNights:number(row.min_nights),sourceHash:row.source_hash,
    mediaHash:row.media_hash,createdAt:instant(row.created_at),submittedAt:row.submitted_at?instant(row.submitted_at):null,
    acceptedAt:row.accepted_at?instant(row.accepted_at):null,retiredAt:row.retired_at?instant(row.retired_at):null,
    version:number(row.version)});
}
async function oneView(client:pg.PoolClient,offerId:string,revision:number){
  const row=(await client.query(`${viewQuery} WHERE o.id=$1 AND r.revision=$2`,[offerId,revision])).rows[0];
  if(!row)throw new OfferAuthorityError('OFFER_NOT_FOUND');
  return toView(row);
}

export class AcceptedOfferService{
  constructor(private readonly pool:pg.Pool,private readonly staffAuthorization:PostgresWorkforceAuthorization,
    private readonly workforceEnvironment:'LOCAL'|'STAGING'|'PRODUCTION'='LOCAL',
    private readonly staffReadPool?:pg.Pool){}

  private async hostTransaction<T>(rawPrincipal:unknown,work:(client:pg.PoolClient,principal:PrincipalContext)=>Promise<T>):Promise<T>{
    const parsed=principalContextSchema.safeParse(rawPrincipal);
    if(!parsed.success||parsed.data.actorKind!=='ACCOUNT')throw new OfferAuthorityError('HOST_REQUIRED');
    const client=await this.pool.connect().catch(error=>{throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);});
    let committing=false,discard=false;
    try{
      if(!await isRestrictedWorkforceRuntime(client))throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE');
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','false',true)",[String(parsed.data.accountId)]);
      const actor=(await client.query('SELECT id,is_active FROM users WHERE id=$1',[parsed.data.accountId])).rows[0];
      if(!actor||actor.is_active!==true)throw new OfferAuthorityError('HOST_REQUIRED');
      const value=await work(client,parsed.data);
      committing=true;await client.query('COMMIT');return value;
    }catch(error){
      try{await client.query('ROLLBACK');}catch{discard=true;}
      if(committing){discard=true;throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);}
      if(error instanceof OfferAuthorityError)throw error;
      throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);
    }finally{client.release(discard);}
  }

  async createDraft(rawPrincipal:unknown,rawInput:unknown):Promise<OfferRevisionView>{
    const parsed=offerDraftInputSchema.safeParse(rawInput);
    if(!parsed.success)throw new OfferAuthorityError('INPUT_INVALID');
    const input:OfferDraftInput=parsed.data;
    return this.hostTransaction(rawPrincipal,async(client,principal)=>{
      const listing=(await client.query('SELECT id,user_id,publication_status FROM listings WHERE id=$1 FOR UPDATE',[input.listingId])).rows[0];
      if(!listing||number(listing.user_id)!==principal.accountId)throw new OfferAuthorityError('OFFER_FORBIDDEN');
      if(listing.publication_status!=='published')throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
      if(!(await client.query('SELECT id FROM room_types WHERE id=$1 AND listing_id=$2',
        [input.roomTypeId,input.listingId])).rowCount)throw new OfferAuthorityError('OFFER_ROOM_INVALID');
      await lockSource(client,input.listingId,input.roomTypeId,input.stayStart,input.stayEnd,input.offerId??null);
      const source=await readSource(client,input.listingId,input.roomTypeId);
      verifySource(source,input.listingId,input.roomTypeId,principal.accountId,input.maxGuests,input.minNights);
      if(!(await validatePropertyPublication(input.listingId,client)).valid)
        throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
      const available=await readInventory(client,input.listingId,input.roomTypeId,input.stayStart,input.stayEnd,input.minNights,new Date());
      if(available.legacy)throw new OfferAuthorityError('LEGACY_DATA_UNRECONCILED');
      if(!available.date)throw new OfferAuthorityError('ROOM_UNAVAILABLE');
      let offerId=input.offerId;
      let version=1;
      let revision=1;
      if(offerId){
        const offer=(await client.query('SELECT * FROM sellable_offers WHERE id=$1 FOR UPDATE',[offerId])).rows[0];
        if(!offer||number(offer.listing_id)!==input.listingId||number(offer.room_type_id)!==input.roomTypeId||
          number(offer.host_account_id)!==principal.accountId)throw new OfferAuthorityError('OFFER_FORBIDDEN');
        if(number(offer.version)!==input.expectedVersion)throw new OfferAuthorityError('OFFER_VERSION_CONFLICT');
        revision=number(offer.latest_revision)+1;version=number(offer.version)+1;
      }else{
        const created=(await client.query('INSERT INTO sellable_offers(listing_id,room_type_id,host_account_id) VALUES($1,$2,$3) RETURNING id',
          [input.listingId,input.roomTypeId,principal.accountId])).rows[0];
        offerId=String(created.id);
      }
      await client.query(`INSERT INTO sellable_offer_revisions(offer_id,revision,amount_minor,currency,price_basis,
        stay_start,stay_end,effective_from,effective_until,max_guests,min_nights,source_facts,source_hash,
        media_facts,media_hash,created_by) VALUES($1,$2,$3,'INR','PER_ROOM_NIGHT',$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14)`,
        [offerId,revision,input.amountMinor,input.stayStart,input.stayEnd,input.effectiveFrom,input.effectiveUntil,
          input.maxGuests,input.minNights,JSON.stringify(source.facts),source.sourceHash,
          JSON.stringify(source.mediaFacts),source.mediaHash,principal.accountId]);
      await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,offer_version,source_hash,evidence)
        VALUES($1,$2,'DRAFT_CREATED',$3,$4,$5,$6::jsonb)`,
        [offerId,revision,principal.accountId,version,source.sourceHash,JSON.stringify({operationId:principal.operationId})]);
      await client.query('UPDATE sellable_offers SET latest_revision=$2,version=$3 WHERE id=$1',[offerId,revision,version]);
      return oneView(client,offerId,revision);
    });
  }

  async submit(rawPrincipal:unknown,rawInput:unknown):Promise<OfferRevisionView>{
    const parsed=offerTransitionInputSchema.safeParse(rawInput);
    if(!parsed.success)throw new OfferAuthorityError('INPUT_INVALID');
    const input=parsed.data;
    return this.hostTransaction(rawPrincipal,async(client,principal)=>{
      const preliminary=(await client.query('SELECT listing_id FROM sellable_offers WHERE id=$1',[input.offerId])).rows[0];
      if(!preliminary)throw new OfferAuthorityError('OFFER_NOT_FOUND');
      const listing=(await client.query('SELECT id,user_id,publication_status FROM listings WHERE id=$1 FOR UPDATE',[preliminary.listing_id])).rows[0];
      if(!listing||number(listing.user_id)!==principal.accountId)throw new OfferAuthorityError('OFFER_FORBIDDEN');
      const offer=(await client.query('SELECT * FROM sellable_offers WHERE id=$1 FOR UPDATE',[input.offerId])).rows[0];
      if(!offer||number(offer.host_account_id)!==principal.accountId||number(offer.listing_id)!==number(listing.id))
        throw new OfferAuthorityError('OFFER_FORBIDDEN');
      const view=await oneView(client,input.offerId,input.revision);
      if(number(offer.version)===input.expectedVersion+1&&view.status==='SUBMITTED')return view;
      if(number(offer.version)!==input.expectedVersion||number(offer.latest_revision)!==input.revision)
        throw new OfferAuthorityError('OFFER_VERSION_CONFLICT');
      if(view.status!=='DRAFT')throw new OfferAuthorityError('OFFER_STATE_CONFLICT');
      if(listing.publication_status!=='published')throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
      await lockSource(client,number(listing.id),number(offer.room_type_id),view.stayStart,view.stayEnd,input.offerId);
      const source=await readSource(client,number(listing.id),number(offer.room_type_id));
      if(source.sourceHash!==view.sourceHash||source.mediaHash!==view.mediaHash)
        throw new OfferAuthorityError('OFFER_STALE_REVIEW');
      verifySource(source,number(listing.id),number(offer.room_type_id),principal.accountId,view.maxGuests,view.minNights);
      if(!(await validatePropertyPublication(number(listing.id),client)).valid)
        throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
      const available=await readInventory(client,number(listing.id),number(offer.room_type_id),
        view.stayStart,view.stayEnd,view.minNights,new Date());
      if(available.legacy)throw new OfferAuthorityError('LEGACY_DATA_UNRECONCILED');
      if(!available.date)throw new OfferAuthorityError('ROOM_UNAVAILABLE');
      await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,offer_version,source_hash,evidence)
        VALUES($1,$2,'SUBMITTED',$3,$4,$5,$6::jsonb)`,
        [input.offerId,input.revision,principal.accountId,input.expectedVersion+1,source.sourceHash,
          JSON.stringify({operationId:principal.operationId,inventoryHash:available.fingerprint})]);
      await client.query('UPDATE sellable_offers SET version=version+1 WHERE id=$1',[input.offerId]);
      return oneView(client,input.offerId,input.revision);
    });
  }

  async readForHost(rawPrincipal:unknown,rawOfferId:unknown):Promise<OfferRevisionView[]>{
    const offerId=uuid.safeParse(rawOfferId);if(!offerId.success)throw new OfferAuthorityError('INPUT_INVALID');
    return this.hostTransaction(rawPrincipal,async(client,principal)=>{
      const rows=(await client.query(`${viewQuery} WHERE o.id=$1 AND o.host_account_id=$2 ORDER BY r.revision DESC`,
        [offerId.data,principal.accountId])).rows;
      if(!rows.length)throw new OfferAuthorityError('OFFER_NOT_FOUND');
      return rows.map(toView);
    });
  }

  async listForHost(rawPrincipal:unknown,rawListingId:unknown):Promise<OfferRevisionView[]>{
    const listingId=id.safeParse(rawListingId);if(!listingId.success)throw new OfferAuthorityError('INPUT_INVALID');
    return this.hostTransaction(rawPrincipal,async(client,principal)=>{
      const listing=(await client.query('SELECT user_id FROM listings WHERE id=$1',[listingId.data])).rows[0];
      if(!listing||number(listing.user_id)!==principal.accountId)throw new OfferAuthorityError('OFFER_FORBIDDEN');
      const rows=(await client.query(`${viewQuery} WHERE o.listing_id=$1 AND o.host_account_id=$2
        ORDER BY o.room_type_id,o.id,r.revision DESC LIMIT 500`,[listingId.data,principal.accountId])).rows;
      return rows.map(toView);
    });
  }

  private async staffTransition(rawPrincipal:unknown,rawInput:unknown,eventType:'ACCEPTED'|'RETIRED'){
    const principal=principalContextSchema.safeParse(rawPrincipal),parsed=offerTransitionInputSchema.safeParse(rawInput);
    if(!principal.success||principal.data.actorKind!=='STAFF'||!principal.data.organizationId||!principal.data.membershipId)
      throw new OfferAuthorityError('STAFF_REQUIRED');
    if(!parsed.success)throw new OfferAuthorityError('INPUT_INVALID');
    const input=parsed.data;
    const commandHash=sha({kind:eventType,offerId:input.offerId,revision:input.revision,expectedVersion:input.expectedVersion});
    try{
      return await this.staffAuthorization.runAuthorized({principal:principal.data,
        tenant:{kind:'INTERNAL_ORGANIZATION',organizationId:principal.data.organizationId},permission:'offer.accept',
        resource:{target:{type:'OFFER',id:input.offerId},revision:String(input.revision)},
        conditions:{environment:this.workforceEnvironment,commandHash,requestedAt:new Date().toISOString()},evidence:{}},async client=>{
        const preliminary=(await client.query('SELECT listing_id FROM sellable_offers WHERE id=$1',[input.offerId])).rows[0];
        if(!preliminary)throw new OfferAuthorityError('OFFER_NOT_FOUND');
        const listing=(await client.query('SELECT id,user_id,publication_status FROM listings WHERE id=$1 FOR UPDATE',[preliminary.listing_id])).rows[0];
        const offer=(await client.query('SELECT * FROM sellable_offers WHERE id=$1 FOR UPDATE',[input.offerId])).rows[0];
        if(!offer||!listing||number(offer.listing_id)!==number(listing.id)||number(offer.host_account_id)!==number(listing.user_id))
          throw new OfferAuthorityError('OFFER_ROOM_INVALID');
        if(number(offer.host_account_id)===principal.data.accountId)throw new OfferAuthorityError('OFFER_FORBIDDEN');
        const view=await oneView(client,input.offerId,input.revision);
        if(number(offer.version)===input.expectedVersion+1&&
          (eventType==='ACCEPTED'?view.status==='ACCEPTED'&&number(offer.current_accepted_revision)===input.revision:
            view.status==='RETIRED'&&offer.current_accepted_revision===null))return view;
        if(number(offer.version)!==input.expectedVersion)throw new OfferAuthorityError('OFFER_VERSION_CONFLICT');
        if(eventType==='ACCEPTED'){
          if(number(offer.latest_revision)!==input.revision||view.status!=='SUBMITTED')
            throw new OfferAuthorityError('OFFER_STATE_CONFLICT');
          if(listing.publication_status!=='published')throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
          await lockSource(client,number(listing.id),number(offer.room_type_id),view.stayStart,view.stayEnd,input.offerId);
          const source=await readSource(client,number(listing.id),number(offer.room_type_id));
          if(source.sourceHash!==view.sourceHash||source.mediaHash!==view.mediaHash)
            throw new OfferAuthorityError('OFFER_STALE_REVIEW');
          verifySource(source,number(listing.id),number(offer.room_type_id),number(offer.host_account_id),view.maxGuests,view.minNights);
          if(!(await validatePropertyPublication(number(listing.id),client)).valid)
            throw new OfferAuthorityError('OFFER_PROPERTY_INELIGIBLE');
          if(Date.parse(view.effectiveUntil)<=Date.now())throw new OfferAuthorityError('OFFER_STALE_REVIEW');
          const available=await readInventory(client,number(listing.id),number(offer.room_type_id),
            view.stayStart,view.stayEnd,view.minNights,new Date());
          if(available.legacy)throw new OfferAuthorityError('LEGACY_DATA_UNRECONCILED');
          if(!available.date)throw new OfferAuthorityError('ROOM_UNAVAILABLE');
          const submitted=(await client.query<{evidence:{inventoryHash?:string}}>(`SELECT evidence FROM sellable_offer_events
            WHERE offer_id=$1 AND revision=$2 AND event_type='SUBMITTED'`,[input.offerId,input.revision])).rows[0];
          if(!submitted||submitted.evidence.inventoryHash!==available.fingerprint)
            throw new OfferAuthorityError('OFFER_STALE_REVIEW');
          const conflict=await client.query(`SELECT 1 FROM sellable_offers other
            JOIN sellable_offer_revisions prior ON prior.offer_id=other.id
              AND prior.revision=other.current_accepted_revision
            WHERE other.room_type_id=$1 AND other.id<>$2
              AND daterange(prior.stay_start,prior.stay_end,'[)') && daterange($3::date,$4::date,'[)')
              AND tstzrange(prior.effective_from,prior.effective_until,'[)') &&
                tstzrange($5::timestamptz,$6::timestamptz,'[)') LIMIT 1`,
            [offer.room_type_id,input.offerId,view.stayStart,view.stayEnd,view.effectiveFrom,view.effectiveUntil]);
          if(conflict.rowCount)throw new OfferAuthorityError('OFFER_STATE_CONFLICT');
          await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
            actor_membership_id,offer_version,source_hash,evidence) VALUES($1,$2,'ACCEPTED',$3,$4,$5,$6,$7::jsonb)`,
            [input.offerId,input.revision,principal.data.accountId,principal.data.membershipId,
              input.expectedVersion+1,source.sourceHash,JSON.stringify({commandHash,submittedRevision:input.revision})]);
          if(offer.current_accepted_revision!==null){
            const priorRevision=await oneView(client,input.offerId,number(offer.current_accepted_revision));
            await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
              actor_membership_id,offer_version,source_hash,evidence) VALUES($1,$2,'SUPERSEDED',$3,$4,$5,$6,$7::jsonb)`,
              [input.offerId,number(offer.current_accepted_revision),principal.data.accountId,principal.data.membershipId,
                input.expectedVersion+1,priorRevision.sourceHash,JSON.stringify({successorRevision:input.revision,commandHash})]);
          }
          await client.query("UPDATE sellable_offers SET current_accepted_revision=$2,public_disposition='ACCEPTED',version=version+1 WHERE id=$1",
            [input.offerId,input.revision]);
        }else{
          if(number(offer.current_accepted_revision)!==input.revision||view.status!=='ACCEPTED')
            throw new OfferAuthorityError('OFFER_STATE_CONFLICT');
          await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
            actor_membership_id,offer_version,source_hash,evidence) VALUES($1,$2,'RETIRED',$3,$4,$5,$6,$7::jsonb)`,
            [input.offerId,input.revision,principal.data.accountId,principal.data.membershipId,
              input.expectedVersion+1,view.sourceHash,JSON.stringify({commandHash})]);
          await client.query("UPDATE sellable_offers SET current_accepted_revision=NULL,public_disposition='RETIRED',version=version+1 WHERE id=$1",[input.offerId]);
        }
        return oneView(client,input.offerId,input.revision);
      });
    }catch(error){
      if(error instanceof OfferAuthorityError||error instanceof PermissionNotGrantedError)throw error;
      if(error instanceof Error&&error.message.includes('SELLABLE_OFFER_ROOM_SCOPE_CONFLICT'))
        throw new OfferAuthorityError('OFFER_STATE_CONFLICT',error);
      throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);
    }
  }

  accept(rawPrincipal:unknown,rawInput:unknown){return this.staffTransition(rawPrincipal,rawInput,'ACCEPTED');}
  retire(rawPrincipal:unknown,rawInput:unknown){return this.staffTransition(rawPrincipal,rawInput,'RETIRED');}

  private async listForStaff(rawPrincipal:unknown,rawListingId:unknown,
    kind:'SUBMITTED'|'ACCEPTED'):Promise<OfferRevisionView[]>{
    const principal=principalContextSchema.safeParse(rawPrincipal),listingId=id.safeParse(rawListingId);
    if(!principal.success||principal.data.actorKind!=='STAFF'||!principal.data.organizationId||!principal.data.membershipId)
      throw new OfferAuthorityError('STAFF_REQUIRED');
    if(!listingId.success)throw new OfferAuthorityError('INPUT_INVALID');
    if(!this.staffReadPool)throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE');
    const client=await this.staffReadPool.connect().catch(error=>{throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);});
    try{
      if(!await isRestrictedWorkforceRuntime(client))throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),
        set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),
        set_config('app.workforce_environment',$5,true),set_config('app.bypass_rls','false',true)`,
        [String(principal.data.accountId),principal.data.organizationId,principal.data.membershipId,principal.data.sessionId,
          this.workforceEnvironment]);
      if(!(await client.query<{valid:boolean}>('SELECT internal_iam_lock_authority() AS valid')).rows[0]?.valid)
        throw new OfferAuthorityError('STAFF_REQUIRED');
      const scope=kind==='SUBMITTED'?`o.latest_revision=r.revision
          AND EXISTS(SELECT 1 FROM sellable_offer_events submitted WHERE submitted.offer_id=o.id
            AND submitted.revision=r.revision AND submitted.event_type='SUBMITTED')
          AND NOT EXISTS(SELECT 1 FROM sellable_offer_events later WHERE later.offer_id=o.id AND later.revision=r.revision
            AND later.event_type IN ('ACCEPTED','RETIRED','SUPERSEDED'))`:
        `o.current_accepted_revision=r.revision`;
      const rows=(await client.query(`${viewQuery} WHERE o.listing_id=$1 AND ${scope}
        AND (internal_iam_has_permission(internal_iam_current_organization_id(),'offer.read','OFFER',o.id::text,NULL,$2,NULL)
          OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',o.id::text,NULL,$2,NULL))
        ORDER BY o.room_type_id,o.id LIMIT 200`,[listingId.data,this.workforceEnvironment])).rows;
      await client.query('COMMIT');return rows.map(toView);
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);
      if(error instanceof OfferAuthorityError)throw error;
      throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);
    }finally{client.release();}
  }
  listSubmittedForStaff(rawPrincipal:unknown,listingId:unknown){return this.listForStaff(rawPrincipal,listingId,'SUBMITTED');}
  listCurrentAcceptedForStaff(rawPrincipal:unknown,listingId:unknown){return this.listForStaff(rawPrincipal,listingId,'ACCEPTED');}
}

/** A single PostgreSQL statement observes each eligible offer, canonical source,
 * approved-row fingerprint and inventory at one MVCC point. Price is the
 * accepted per-room-night amount only; no quote, tax or booking total is made. */
export async function readPublicOfferAuthority(pool:Pick<pg.Pool,'query'>,rawListingIds:unknown,asOf:Date):
  Promise<{eligibleOffers:EligiblePublicOffer[];states:PublicOfferState[]}>{
  const ids=z.array(id).max(200).safeParse(rawListingIds);
  if(!ids.success||!(asOf instanceof Date)||!Number.isFinite(asOf.valueOf()))
    throw new OfferAuthorityError('INPUT_INVALID');
  if(!ids.data.length)return {eligibleOffers:[],states:[]};
  const listingIds=[...new Set(ids.data)];
  try{
    if(!await isRestrictedWorkforceRuntime(pool as pg.PoolClient))
      throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE');
    const privileges=(await pool.query<{safe:boolean}>(`SELECT
      has_function_privilege('public.sellable_offer_public_rows(integer,integer)','EXECUTE')
      AND has_function_privilege('public.sellable_offer_public_state(integer,integer)','EXECUTE')
      AND NOT has_function_privilege('public.sellable_offer_source_snapshot(integer,integer)','EXECUTE')
      AND NOT has_function_privilege('public.sellable_offer_lock_evidence(integer,integer,date,date,uuid)','EXECUTE')
      AND NOT has_function_privilege('public.sellable_offer_revision_state(uuid,integer)','EXECUTE')
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('public.sellable_offers'),('public.sellable_offer_revisions'),
        ('public.sellable_offer_events'),('public.sellable_offer_draft_receipts')) AS t(relation_name)
        WHERE has_table_privilege(t.relation_name,'SELECT')
          OR has_table_privilege(t.relation_name,'INSERT')
          OR has_table_privilege(t.relation_name,'UPDATE')
          OR has_table_privilege(t.relation_name,'DELETE')) AS safe`)).rows[0];
    if(privileges?.safe!==true)throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE');
    const rows=(await pool.query(`SELECT l.id AS listing_id,r.id AS room_type_id,
      o.offer_id,public.sellable_offer_public_state(l.id,r.id) AS public_state,
      o.revision,o.amount_minor::text,o.currency,o.price_basis,o.stay_start::text,o.stay_end::text,
      o.effective_from,o.effective_until,o.max_guests,o.min_nights,o.media_urls,
      EXISTS(SELECT 1 FROM room_types rr WHERE rr.listing_id=l.id) AND NOT EXISTS(
        SELECT 1 FROM room_types rr WHERE rr.listing_id=l.id AND (
          rr.base_price IS NULL OR rr.base_price<=0 OR
          (SELECT count(*) FROM media_assets mm WHERE mm.entity_type='listing' AND mm.entity_id=l.id
            AND mm.room_type_id=rr.id AND mm.moderation_status='approved')<3 OR
          (SELECT count(*) FROM media_assets mm WHERE mm.entity_type='listing' AND mm.entity_id=l.id
            AND mm.room_type_id=rr.id AND mm.moderation_status='approved' AND mm.is_sleeping_area=true)<1))
        AS property_eligible,
      coalesce(nights.value,'[]'::jsonb) AS nights,coalesce(blocks.value,'[]'::jsonb) AS blocks,
      statement_timestamp() AS observed_at
      FROM listings l JOIN room_types r ON r.listing_id=l.id
      LEFT JOIN LATERAL public.sellable_offer_public_rows(l.id,r.id) o ON true
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('date',n.date,'listing_id',n.listing_id,
        'total_units',n.total_units,'held_units',n.held_units,'booked_units',n.booked_units,
        'blocked_units',n.blocked_units) ORDER BY n.date) AS value FROM (
          SELECT i.calendar_date::text AS date,i.listing_id,i.total_units,i.held_units,i.booked_units,i.blocked_units
          FROM inventory_days i WHERE i.room_type_id=r.id AND o.revision IS NOT NULL
            AND i.calendar_date>=greatest(o.stay_start,$2::date) AND i.calendar_date<o.stay_end
          ORDER BY i.calendar_date LIMIT 10000) n) nights ON true
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('room_type_id',b.room_type_id,
        'room_tier_key',b.room_tier_key,'mapping_status',b.mapping_status,
        'start_date',b.start_date::text,'end_date',b.end_date::text) ORDER BY b.start_date,b.id) AS value
        FROM room_calendar_blocks b WHERE b.listing_id=l.id AND o.revision IS NOT NULL
          AND b.start_date<o.stay_end AND b.end_date>=greatest(o.stay_start,$2::date)
          AND (b.room_type_id IS NULL OR b.room_type_id=r.id)) blocks ON true
      WHERE l.id=ANY($1::int[]) AND l.publication_status='published'
      ORDER BY l.id,r.id,o.offer_id`,[listingIds,indiaDate(asOf)])).rows;
    const eligibleOffers:EligiblePublicOffer[]=[],states:PublicOfferState[]=[];
    for(const row of rows){
      const listingId=number(row.listing_id),roomTypeId=number(row.room_type_id);
      const offerId=typeof row.offer_id==='string'?row.offer_id:null;
      const observedAt=instant(row.observed_at);
      let state:PublicOfferState['state']=publicOfferStateSchema.shape.state.parse(row.public_state);
      if(offerId&&row.revision!==null){
        const stayStart=dateText(row.stay_start),stayEnd=dateText(row.stay_end);
        const effectiveFrom=instant(row.effective_from),effectiveUntil=instant(row.effective_until);
        if(asOf.valueOf()<Date.parse(effectiveFrom))state='OFFER_NOT_YET_EFFECTIVE';
        else if(asOf.valueOf()>=Date.parse(effectiveUntil)||stayEnd<=indiaDate(asOf))state='OFFER_EXPIRED';
        else if(row.property_eligible!==true||!Array.isArray(row.media_urls)||
          row.media_urls.some((url:unknown)=>!isSafeAdminImageUrl(url)))
          state='OFFER_STALE_REVIEW';
        else{
          const available=firstAvailableStart(Array.isArray(row.nights)?row.nights:[],Array.isArray(row.blocks)?row.blocks:[],
            listingId,roomTypeId,maxDate(stayStart,indiaDate(asOf)),stayEnd,number(row.min_nights));
          if(available.legacy)state='LEGACY_DATA_UNRECONCILED';
          else if(!available.date)state='ROOM_UNAVAILABLE';
          else if(row.public_state!=='VERIFIED_OFFER_AVAILABLE'||row.amount_minor===null)state='OFFER_STALE_REVIEW';
          else{
            state='VERIFIED_OFFER_AVAILABLE';
            eligibleOffers.push(eligiblePublicOfferSchema.parse({listingId,roomTypeId,offerId,revision:number(row.revision),
              amountMinor:row.amount_minor,currency:row.currency,priceBasis:row.price_basis,
              stayStart,stayEnd,effectiveFrom,effectiveUntil,maxGuests:number(row.max_guests),
              minNights:number(row.min_nights),availableStartDate:available.date,observedAt}));
          }
        }
      }
      states.push(publicOfferStateSchema.parse({listingId,roomTypeId,offerId,state,observedAt}));
    }
    eligibleOffers.sort((a,b)=>a.listingId-b.listingId||
      (BigInt(a.amountMinor)<BigInt(b.amountMinor)?-1:BigInt(a.amountMinor)>BigInt(b.amountMinor)?1:0)||
      a.roomTypeId-b.roomTypeId||a.offerId.localeCompare(b.offerId)||a.revision-b.revision);
    return {eligibleOffers,states};
  }catch(error){
    if(error instanceof OfferAuthorityError&&error.code==='INPUT_INVALID')throw error;
    throw new OfferAuthorityError('OFFER_AUTHORITY_UNAVAILABLE',error);
  }
}
export async function readEligiblePublicOffers(pool:Pick<pg.Pool,'query'>,listingIds:number[],asOf:Date):Promise<EligiblePublicOffer[]>{
  return (await readPublicOfferAuthority(pool,listingIds,asOf)).eligibleOffers;
}
