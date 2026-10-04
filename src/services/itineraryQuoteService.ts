import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {getHoldTtlSeconds,getStayDatesRange} from './inventoryHoldService.js';
import {setStaysPrincipal,withStaysPrincipal} from '../server/stays/runtime.js';

const requestSchema=z.object({
  offerId:z.string().uuid(),revision:z.number().int().positive(),
  checkIn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount:z.number().int().positive().max(100),requestId:z.string().uuid(),
}).strict();
type QuoteRequest=z.infer<typeof requestSchema>;
export type ItineraryQuote={
  id:string;offerId:string;revision:number;listingId:number;roomTypeId:number;
  checkIn:string;checkOut:string;nights:number;guestCount:number;
  acceptedNightlyMinor:string;roomSubtotalMinor:string;currency:'INR';
  payableTotalMinor:null;createdAt:string;expiresAt:string;
};
export type QuoteCode='INPUT_INVALID'|'OFFER_UNAVAILABLE'|'OFFER_STALE'|'ROOM_UNAVAILABLE'|
  'INVENTORY_CONFLICT'|'ITINERARY_OUT_OF_SCOPE'|'OCCUPANCY_EXCEEDED'|
  'LEGACY_DATA_UNRECONCILED'|'QUOTE_CONFLICT'|'QUOTE_NOT_FOUND'|'QUOTE_FORBIDDEN'|
  'QUOTE_EXPIRED'|'AUTHORITY_UNAVAILABLE'|'OUTCOME_UNKNOWN';
export class ItineraryQuoteError extends Error{
  constructor(readonly code:QuoteCode,readonly status:number,cause?:unknown){
    super(code,{cause});this.name='ItineraryQuoteError';
  }
}
const reject=(code:QuoteCode,status:number):never=>{throw new ItineraryQuoteError(code,status);};
const date=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const instant=(value:unknown)=>new Date(String(value)).toISOString();
const fingerprint=(input:QuoteRequest)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const indiaToday=()=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=(kind:string)=>parts.find(part=>part.type===kind)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const project=(row:Record<string,unknown>):ItineraryQuote=>({
  id:String(row.id),offerId:String(row.offer_id),revision:Number(row.offer_revision),
  listingId:Number(row.listing_id),roomTypeId:Number(row.room_type_id),
  checkIn:date(row.check_in_text),checkOut:date(row.check_out_text),nights:Number(row.nights),
  guestCount:Number(row.guest_count),acceptedNightlyMinor:String(row.accepted_nightly_paise),
  roomSubtotalMinor:String(row.base_price_paise),currency:'INR',payableTotalMinor:null,
  createdAt:instant(row.created_at),expiresAt:instant(row.expires_at),
});

/** One accepted-offer room subtotal, never a payable booking total. The quote
 * does not reserve inventory; acquireHold must check all nights again. */
export async function createItineraryQuote(pool:pg.Pool,rawInput:unknown,holderPrincipal:string):Promise<ItineraryQuote>{
  const parsed=requestSchema.safeParse(rawInput);
  if(!parsed.success)throw new ItineraryQuoteError('INPUT_INVALID',400);
  if(!holderPrincipal)throw new ItineraryQuoteError('INPUT_INVALID',400);
  const input=parsed.data;
  const range=getStayDatesRange(input.checkIn,input.checkOut);
  const digest=fingerprint(input);
  const client=await pool.connect().catch(error=>{throw new ItineraryQuoteError('AUTHORITY_UNAVAILABLE',503,error);});
  let committing=false;
  try{
    await client.query('BEGIN');
    await setStaysPrincipal(client,holderPrincipal);
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`itinerary-quote:${holderPrincipal}:${input.requestId}`]);
    const existing=(await client.query(`SELECT *,check_in_date::text AS check_in_text,
      check_out_date::text AS check_out_text FROM stays_quotes WHERE quote_kind='ACCEPTED_OFFER'
      AND holder_principal=$1 AND request_id=$2`,[holderPrincipal,input.requestId])).rows[0];
    if(existing){
      if(existing.request_fingerprint!==digest)reject('QUOTE_CONFLICT',409);
      await client.query('COMMIT');return project(existing);
    }
    // An exact replay retains its original outcome even if the date rolled
    // forward after creation; only a new quote must meet today's scope.
    if(!range.valid||input.checkIn<indiaToday())reject('ITINERARY_OUT_OF_SCOPE',422);
    const room=(await client.query('SELECT stays_current_offer_room($1::uuid,$2::int) AS id',
      [input.offerId,input.revision])).rows[0]?.id;
    if(!room)reject('OFFER_UNAVAILABLE',409);
    await client.query('SELECT stays_expire_holds_for_itinerary($1,$2::date,$3::date)',
      [room,input.checkIn,input.checkOut]);
    const row=(await client.query(`SELECT * FROM stays_current_accepted_offer($1::uuid,$2::int)`,
      [input.offerId,input.revision])).rows[0];
    if(!row)reject('OFFER_UNAVAILABLE',409);
    if(row.currency!=='INR'||row.price_basis!=='PER_ROOM_NIGHT')reject('OFFER_STALE',409);
    if(input.checkIn<date(row.stay_start)||input.checkOut>date(row.stay_end)||
      range.dates.length<Number(row.min_nights))reject('ITINERARY_OUT_OF_SCOPE',422);
    if(input.guestCount>Number(row.max_guests))reject('OCCUPANCY_EXCEEDED',422);
    const blocks=await client.query(`SELECT id,room_type_id,room_tier_key,mapping_status FROM room_calendar_blocks
      WHERE listing_id=$1 AND start_date<$3::date AND end_date>=$2::date
      AND (room_type_id IS NULL OR room_type_id=$4)`,
      [row.listing_id,input.checkIn,input.checkOut,row.room_type_id]);
    for(const block of blocks.rows){
      if(block.room_type_id===null||block.room_tier_key==='all'||block.mapping_status!=='mapped')
        reject('LEGACY_DATA_UNRECONCILED',409);
      reject('INVENTORY_CONFLICT',409);
    }
    const days=await client.query(`SELECT calendar_date::text AS day,listing_id,total_units,held_units,
      booked_units,blocked_units FROM inventory_days WHERE room_type_id=$1
      AND calendar_date >= $2::date AND calendar_date < $3::date ORDER BY calendar_date`,
      [row.room_type_id,input.checkIn,input.checkOut]);
    if(days.rows.length!==range.dates.length||days.rows.some((day,index)=>
      day.day!==range.dates[index]||Number(day.listing_id)!==Number(row.listing_id)||
      Number(day.total_units)-Number(day.held_units)-Number(day.booked_units)-Number(day.blocked_units)<1))
      reject('INVENTORY_CONFLICT',409);
    const amount=BigInt(row.amount_minor),subtotal=amount*BigInt(range.dates.length);
    if(amount<=0n||subtotal>9223372036854775807n)reject('OFFER_STALE',409);
    const expiry=new Date(Math.min(Date.now()+getHoldTtlSeconds()*1000,Date.parse(String(row.effective_until))));
    if(expiry.getTime()<=Date.now())reject('OFFER_STALE',409);
    const inserted=(await client.query(`INSERT INTO stays_quotes(id,listing_id,room_type_id,
      check_in_date,check_out_date,nights,base_price_paise,tax_paise,total_paise,currency,
      guest_count,expires_at,quote_kind,offer_id,offer_revision,holder_principal,request_id,
      request_fingerprint,accepted_nightly_paise,price_basis,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL,'INR',$8,$9,'ACCEPTED_OFFER',$10,$11,$12,$13,$14,$15,
        'PER_ROOM_NIGHT',$16) RETURNING *,check_in_date::text AS check_in_text,
        check_out_date::text AS check_out_text`,
      [randomUUID(),row.listing_id,row.room_type_id,input.checkIn,input.checkOut,range.dates.length,
        subtotal.toString(),input.guestCount,expiry,input.offerId,input.revision,holderPrincipal,
        input.requestId,digest,amount.toString(),row.source_hash])).rows[0];
    committing=true;await client.query('COMMIT');return project(inserted);
  }catch(error){
    try{await client.query('ROLLBACK');}catch{/* Preserve the original transaction error. */}
    if(committing)throw new ItineraryQuoteError('OUTCOME_UNKNOWN',503,error);
    if(error instanceof ItineraryQuoteError)throw error;
    throw new ItineraryQuoteError('AUTHORITY_UNAVAILABLE',503,error);
  }finally{client.release();}
}

/** A route pre-read derives intent only. acquireHold revalidates this quote
 * under its inventory transaction before any capacity mutation. */
export async function getQuoteForHold(pool:pg.Pool,rawId:unknown,holderPrincipal:string,
  allowExpiredReplay=false):Promise<ItineraryQuote>{
  const id=z.string().uuid().safeParse(rawId);
  if(!id.success)reject('INPUT_INVALID',400);
  try{
    const row=await withStaysPrincipal(pool,holderPrincipal,async client=>
      (await client.query(`SELECT *,check_in_date::text AS check_in_text,
        check_out_date::text AS check_out_text FROM stays_quotes WHERE id=$1
        AND quote_kind='ACCEPTED_OFFER'`,[id.data])).rows[0]);
    if(!row)reject('QUOTE_NOT_FOUND',404);
    // The hold route may read an expired quote only to derive a prior request's
    // identity. acquireHold first replays an existing hold and rejects any new
    // acquisition after expiry inside its inventory transaction.
    if(!allowExpiredReplay&&new Date(row.expires_at).getTime()<=Date.now())reject('QUOTE_EXPIRED',409);
    return project(row);
  }catch(error){
    if(error instanceof ItineraryQuoteError)throw error;
    throw new ItineraryQuoteError('AUTHORITY_UNAVAILABLE',503,error);
  }
}
