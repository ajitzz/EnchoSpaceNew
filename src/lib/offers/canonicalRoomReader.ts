import type pg from 'pg';
import {z} from 'zod';
import {principalContextSchema} from '../../shared/iam/principalContext.js';
import {availabilityReasonSchema,roomInventoryNightSchema,roomOfferRequestSchema,type RoomOfferObservation,type RoomOfferRequest} from '../../shared/offers/contracts.js';
import {canonicalRoomPriceMinor,createRoomOfferObservation,createRoomOfferVersion,OfferEvidenceError} from './evidence.js';

const sourceSchema=z.object({
  listing_id:z.number().int().positive(),host_id:z.number().int().positive(),room_id:z.number().int().positive(),
  slug:z.string(),room_name:z.string(),base_price:z.string(),currency:z.string(),
  max_occupancy:z.number().int().positive(),inventory_count:z.number().int().positive(),min_stay_nights:z.number().int().positive(),
  nights:z.array(z.object({listing_id:z.number().int(),date:z.string(),total_units:z.number().int(),held_units:z.number().int(),booked_units:z.number().int(),blocked_units:z.number().int()}).strict()).max(91),
  legacy_unresolved:z.boolean(),legacy_blocked:z.boolean(),observed_at:z.date(),
}).strict();
type Source=z.infer<typeof sourceSchema>;

function observation(source:Source,request:RoomOfferRequest):RoomOfferObservation{
  if(source.currency!=='INR')throw new OfferEvidenceError('PRICE_AUTHORITY_INVALID');
  const offer=createRoomOfferVersion({contractVersion:1,kind:'ROOM_BASE_NIGHT_FACTS',authority:'HOST_STORED_ROOM_CONFIGURATION',
    listingId:source.listing_id,hostAccountId:source.host_id,roomTypeId:source.room_id,canonicalPath:`/stay/${source.slug}`,
    roomName:source.room_name,price:{currency:'INR',amountMinor:canonicalRoomPriceMinor(source.base_price),basis:'ROOM_TYPE_BASE_NIGHT',source:'room_types.base_price',occupancyPriceBasis:'UNSPECIFIED'},
    maximumOccupancy:source.max_occupancy,inventoryCount:source.inventory_count,minimumStayNights:source.min_stay_nights});
  const reasons=new Set<z.infer<typeof availabilityReasonSchema>>();
  const expectedDates=Array.from({length:(Date.parse(request.checkOut)-Date.parse(request.checkIn))/86400000},(_,index)=>new Date(Date.parse(request.checkIn)+index*86400000).toISOString().slice(0,10));
  const nights:z.infer<typeof roomInventoryNightSchema>[]=[];
  for(const night of source.nights){
    const checked=roomInventoryNightSchema.safeParse({date:night.date,totalUnits:night.total_units,heldUnits:night.held_units,bookedUnits:night.booked_units,blockedUnits:night.blocked_units,availableUnits:night.total_units-night.held_units-night.booked_units-night.blocked_units});
    if(!checked.success||night.listing_id!==source.listing_id||night.total_units>source.inventory_count){reasons.add('INVENTORY_INCONSISTENT');continue;}
    nights.push(checked.data);
  }
  if(nights.length!==expectedDates.length||nights.some((night,index)=>night.date!==expectedDates[index]))reasons.add('INVENTORY_DAY_MISSING');
  if(source.legacy_unresolved)reasons.add('LEGACY_BLOCK_UNRESOLVED');
  if(source.legacy_blocked)reasons.add('CALENDAR_BLOCKED');
  if(expectedDates.length<source.min_stay_nights)reasons.add('MINIMUM_STAY_NOT_MET');
  if(request.guestCount>source.max_occupancy*request.units)reasons.add('OCCUPANCY_EXCEEDED');
  const missing=reasons.has('INVENTORY_DAY_MISSING')||reasons.has('INVENTORY_INCONSISTENT')||reasons.has('LEGACY_BLOCK_UNRESOLVED');
  // A legacy block has no canonical quantity contract. Keep its blocking
  // evidence without inventing an available-unit count from the daily ledger.
  const minimumAvailableUnits=missing||source.legacy_blocked?null:Math.min(...nights.map(night=>night.availableUnits));
  if(minimumAvailableUnits!==null&&minimumAvailableUnits<request.units)reasons.add('INSUFFICIENT_UNITS');
  return createRoomOfferObservation({contractVersion:1,kind:'ROOM_OFFER_PREFLIGHT_OBSERVATION',offer,request,observedAt:source.observed_at.toISOString(),
    availability:{source:'inventory_days',state:missing?'AUTHORITY_MISSING':reasons.size?'OBSERVED_UNAVAILABLE':'OBSERVED_AVAILABLE',reasons:[...reasons].sort(),nights,minimumAvailableUnits,allocationHeld:false},
    execution:{bookingAllowed:false,campaignPublicationAllowed:false,publicPriceClaimAllowed:false,reason:'ACCEPTED_OFFER_RATE_AND_CONDITIONS_AUTHORITY_REQUIRED'}});
}

/** Host-owned, read-only preflight evidence. No admin/system ownership bypass. */
export class CanonicalRoomOfferReader{
  constructor(private readonly pool:pg.Pool){}
  async forHost(rawPrincipal:unknown,rawRequest:unknown):Promise<RoomOfferObservation>{
    const principal=principalContextSchema.safeParse(rawPrincipal);const request=roomOfferRequestSchema.safeParse(rawRequest);
    if(!principal.success||!request.success)throw new OfferEvidenceError('INPUT_INVALID');
    if(principal.data.actorKind!=='ACCOUNT')throw new OfferEvidenceError('ACCOUNT_REQUIRED');
    const client=await this.pool.connect().catch((cause:unknown)=>{throw new OfferEvidenceError('CATALOG_UNAVAILABLE',cause);});
    let discard=false;
    try{
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true)`,[String(principal.data.accountId)]);
      // A single MVCC statement observes room, property and every capacity fact.
      // It cannot allocate inventory and does not read guest/contact/location data.
      const row=(await client.query<{[key:string]:unknown}>(`SELECT l.id AS listing_id,l.user_id AS host_id,l.slug,r.id AS room_id,r.name AS room_name,
        r.base_price::text,r.currency,r.max_occupancy,r.inventory_count,r.min_stay_nights,
        coalesce((SELECT jsonb_agg(n ORDER BY n.date) FROM (SELECT i.listing_id,i.calendar_date::text AS date,i.total_units,i.held_units,i.booked_units,i.blocked_units
          FROM inventory_days i WHERE i.room_type_id=r.id AND i.calendar_date >= $3::date AND i.calendar_date < $4::date ORDER BY i.calendar_date LIMIT 91) n),'[]'::jsonb) AS nights,
        EXISTS(SELECT 1 FROM room_calendar_blocks b WHERE b.listing_id=l.id AND b.start_date < $4::date AND b.end_date >= $3::date
          AND (b.room_type_id IS NULL OR b.room_type_id=r.id) AND (b.room_type_id IS NULL OR b.mapping_status IS DISTINCT FROM 'mapped' OR b.room_tier_key='all')) AS legacy_unresolved,
        EXISTS(SELECT 1 FROM room_calendar_blocks b WHERE b.listing_id=l.id AND b.start_date < $4::date AND b.end_date >= $3::date AND b.room_type_id=r.id AND b.mapping_status='mapped') AS legacy_blocked,
        statement_timestamp() AS observed_at
        FROM listings l JOIN room_types r ON r.listing_id=l.id JOIN users u ON u.id=l.user_id
        WHERE l.id=$1 AND r.id=$2 AND l.user_id=$5 AND l.publication_status='published'`,[request.data.listingId,request.data.roomTypeId,request.data.checkIn,request.data.checkOut,principal.data.accountId])).rows[0];
      if(!row)throw new OfferEvidenceError('OFFER_NOT_AVAILABLE');
      const parsed=sourceSchema.safeParse(row);if(!parsed.success)throw new OfferEvidenceError('ROOM_AUTHORITY_INVALID');
      const result=observation(parsed.data,request.data);await client.query('COMMIT');return result;
    }catch(error){
      try{await client.query('ROLLBACK');}catch{discard=true;}
      if(error instanceof OfferEvidenceError)throw error;
      throw new OfferEvidenceError('CATALOG_UNAVAILABLE',error);
    }finally{client.release(discard);}
  }
}
