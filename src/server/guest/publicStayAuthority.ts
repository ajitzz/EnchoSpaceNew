import type {Pool, PoolClient} from 'pg';
import {z} from 'zod';
import type {EligiblePublicOffer, PublicOfferState as OfferStateRow} from '../../shared/offers/acceptedOfferContracts.js';
import {readPublicOfferAuthority} from '../offers/acceptedOfferService.js';
import {ACCEPTED_PUBLIC_OFFER_EVIDENCE} from '../../lib/stayProjection.js';
import {acceptedOfferAmountMinor} from '../../shared/offers/publicPrice.js';

const optionalText=z.string().nullable();
const strings=z.preprocess(value=>{
  if(value===null)return [];
  if(typeof value!=='string')return value;
  try{return JSON.parse(value);}catch{return value;}
},z.array(z.string()));
const price=z.union([z.number(),z.string().regex(/^\d+(?:\.\d+)?$/)])
  .transform(Number).pipe(z.number().finite().nonnegative());
const room=z.object({id:z.number().int().positive(),listing_id:z.number().int().positive(),name:z.string().min(1),type:optionalText,icon:optionalText,tag:optionalText,
  currency:z.string().min(1),base_price:price,max_occupancy:z.number().int().positive(),features:strings,amenities:strings,
  description:optionalText,specs:optionalText}).strict();
const media=z.object({entity_id:z.number().int().positive(),room_type_id:z.number().int().positive().nullable(),url:z.string().min(1),tier:optionalText,category:optionalText,title:optionalText,
  description:optionalText,is_hero:z.boolean().nullable(),is_sleeping_area:z.boolean().nullable(),
  moderation_status:z.string().nullable()}).strict();
const listingId=z.union([z.string().regex(/^[1-9]\d*$/),z.number().int().positive()]).transform(Number);

export class PublicStayAuthorityError extends Error{
  readonly code='STAY_AUTHORITY_UNAVAILABLE';
  constructor(cause?:unknown){super('Verified stay information is temporarily unavailable.',{cause});this.name='PublicStayAuthorityError';}
}

type OfferAuthorityPool=Pick<Pool,'connect'>;
type QueryPort=Pick<Pool,'query'>;
type OfferAuthority={eligibleOffers:EligiblePublicOffer[];states:OfferStateRow[]};

const statePriority:Record<OfferStateRow['state'],number>={
  VERIFIED_OFFER_AVAILABLE:0,OFFER_STALE_REVIEW:1,LEGACY_DATA_UNRECONCILED:2,
  ROOM_UNAVAILABLE:3,OFFER_NOT_YET_EFFECTIVE:4,OFFER_EXPIRED:5,OFFER_RETIRED:6,NO_ACCEPTED_OFFER:7,
};
const selectedState=(rows:OfferStateRow[])=>rows.reduce<OfferStateRow['state']>((best,row)=>
  statePriority[row.state]<statePriority[best]?row.state:best,'NO_ACCEPTED_OFFER');
const publicOffer=(offer:EligiblePublicOffer)=>({
  offerId:offer.offerId,revision:offer.revision,roomTypeId:String(offer.roomTypeId),
  amountMinor:offer.amountMinor,currency:offer.currency,priceBasis:offer.priceBasis,
  stayStart:offer.stayStart,stayEnd:offer.stayEnd,effectiveFrom:offer.effectiveFrom,
  effectiveUntil:offer.effectiveUntil,maxGuests:offer.maxGuests,minNights:offer.minNights,
  availableStartDate:offer.availableStartDate,observedAt:offer.observedAt,
});
const compareOffers=(a:EligiblePublicOffer,b:EligiblePublicOffer)=>{
  const first=acceptedOfferAmountMinor(a.amountMinor),second=acceptedOfferAmountMinor(b.amountMinor);
  return first<second?-1:first>second?1:
    a.availableStartDate.localeCompare(b.availableStartDate)||
    a.roomTypeId-b.roomTypeId||a.offerId.localeCompare(b.offerId)||a.revision-b.revision;
};

/** Only a conclusively pre-049 database can use W0's null-price projection.
 * Missing W1 connection or migration drift after 049 is an authority outage. */
async function isPreOfferSchema(pool:QueryPort):Promise<boolean>{
  const catalog=(await pool.query(`SELECT to_regclass('public.sellable_offers') AS offer_table,
    to_regclass('public.schema_migrations') AS history_table`)).rows[0];
  if(!catalog||catalog.offer_table!==null)return false;
  if(catalog.history_table===null)return true;
  const history=await pool.query('SELECT 1 FROM public.schema_migrations WHERE version=$1 LIMIT 1',
    ['049_accepted_sellable_offers.sql']);
  return history.rowCount===0;
}

async function readCanonical(port:QueryPort,ids:number[]){
  const [roomResult,mediaResult]=await Promise.all([
    port.query('SELECT id, listing_id, name, type, icon, tag, currency, base_price, max_occupancy, features, amenities, description, specs FROM room_types WHERE listing_id = ANY($1::int[]) ORDER BY listing_id ASC, id ASC',[ids]),
    // Read statuses as well as approved rows, to distinguish absent authority
    // from an authoritative decision to withhold every asset.
    port.query(`SELECT entity_id, room_type_id, url, tier, category, title, description, is_hero, is_sleeping_area, moderation_status
      FROM media_assets WHERE entity_id = ANY($1::int[]) AND entity_type = $2 ORDER BY entity_id ASC, order_index ASC, id ASC`,[ids,'listing']),
  ]);
  const rooms=z.array(room).parse(roomResult.rows),assets=z.array(media).parse(mediaResult.rows);
  const roomById=new Map(rooms.map(row=>[row.id,row]));
  for(const asset of assets){
    if(asset.room_type_id!==null&&roomById.get(asset.room_type_id)?.listing_id!==asset.entity_id)
      throw new Error('Media room association does not belong to listing');
  }
  return {rooms,assets};
}

function projectRows(listings:Record<string,unknown>[],ids:number[],canonical:Awaited<ReturnType<typeof readCanonical>>,
  offers?:OfferAuthority):Record<string,unknown>[]{
  const {rooms,assets}=canonical;
  const roomsByListing=new Map<number,typeof rooms>();
  for(const row of rooms)roomsByListing.set(row.listing_id,[...(roomsByListing.get(row.listing_id)||[]),row]);
  const eligibleByRoom=new Map<number,EligiblePublicOffer>();
  const eligibleByListing=new Map<number,EligiblePublicOffer[]>();
  const statesByRoom=new Map<number,OfferStateRow[]>();
  const statesByListing=new Map<number,OfferStateRow[]>();
  if(offers){
    const requested=new Set(ids),roomById=new Map(rooms.map(row=>[row.id,row]));
    for(const offer of offers.eligibleOffers){
      if(!requested.has(offer.listingId)||roomById.get(offer.roomTypeId)?.listing_id!==offer.listingId)
        throw new Error('Accepted offer is not bound to a canonical room and property');
      const existing=eligibleByRoom.get(offer.roomTypeId);
      if(!existing||compareOffers(offer,existing)<0)eligibleByRoom.set(offer.roomTypeId,offer);
      eligibleByListing.set(offer.listingId,[...(eligibleByListing.get(offer.listingId)||[]),offer]);
    }
    for(const state of offers.states){
      if(!requested.has(state.listingId)||state.roomTypeId!==null&&
        roomById.get(state.roomTypeId)?.listing_id!==state.listingId)
        throw new Error('Offer state is not bound to a canonical room and property');
      if(state.roomTypeId!==null)
        statesByRoom.set(state.roomTypeId,[...(statesByRoom.get(state.roomTypeId)||[]),state]);
      statesByListing.set(state.listingId,[...(statesByListing.get(state.listingId)||[]),state]);
    }
  }
  return listings.map((listing,index)=>{
    const id=ids[index],listingRooms=roomsByListing.get(id)||[];
    const legacyRooms=typeof listing.rooms==='string'?JSON.parse(listing.rooms):listing.rooms;
    const listingOffers=eligibleByListing.get(id)||[];
    const from=listingOffers.length?[...listingOffers].sort(compareOffers)[0]:null;
    const roomState=listingRooms.length?'CANONICAL':Array.isArray(legacyRooms)&&legacyRooms.length
      ?'LEGACY_DATA_UNRECONCILED':'NO_ROOM';
    const result:Record<string,unknown>={...listing,
      room_state:roomState,
      price_state:from?'VERIFIED_OFFER_AVAILABLE':'VERIFIED_OFFER_UNAVAILABLE',
      public_offer_state:from?'VERIFIED_OFFER_AVAILABLE':roomState==='LEGACY_DATA_UNRECONCILED'
        ?'LEGACY_DATA_UNRECONCILED':selectedState(statesByListing.get(id)||[]),
      public_from_offer:from?publicOffer(from):null,
      price:null,public_media_authority:'APPROVED_RELATIONAL'};
    result.rooms=listingRooms.map(row=>{
      if(row.currency!==listing.currency)throw new Error('Room currency conflicts with listing');
      const accepted=eligibleByRoom.get(row.id);
      return {canonical_room_id:row.id,name:row.name,type:row.type||row.name.toLowerCase().replace(/\s+/g,'_'),
        icon:row.icon||'🛏️',tag:row.tag||'',price:null,capacity:row.max_occupancy,
        public_offer:accepted?publicOffer(accepted):null,
        public_offer_state:accepted?'VERIFIED_OFFER_AVAILABLE':selectedState(statesByRoom.get(row.id)||[]),
        description:row.description||'',specs:row.specs||'',features:row.features,amenities:row.amenities};
    });
    const approved=assets.filter(asset=>asset.entity_id===id&&asset.moderation_status==='approved');
    const urls=[...new Set(approved.map(asset=>asset.url))],allowed=new Set(urls);
    result.photos=approved.map(asset=>({url:asset.url,tier:asset.tier||'common',category:asset.category||'other',
      title:asset.title||'',description:asset.description||'',isHero:Boolean(asset.is_hero),
      room_type_id:asset.room_type_id===null?null:String(asset.room_type_id),
      is_sleeping_area:Boolean(asset.is_sleeping_area),moderation_status:'approved'}));
    result.image_urls=urls;
    result.image_url=approved.find(asset=>asset.is_hero)?.url||urls[0]||'';
    for(const field of ['hero_video_url','video_url','hero_fallback_url','seo_image_url']){
      result[field]=typeof listing[field]==='string'&&allowed.has(listing[field])?listing[field]:undefined;
    }
    if(offers)Object.defineProperty(result,ACCEPTED_PUBLIC_OFFER_EVIDENCE,{value:true});
    return result;
  });
}

/** One relational authority for catalogue, detail and refresh. W1 uses a
 * restricted, repeatable-read snapshot for listing, room, media and accepted
 * offer facts, so a concurrent source change cannot create a mixed price. */
export async function resolvePublicStayAuthorities(pool:QueryPort,listings:Record<string,unknown>[],
  offerAuthorityPool?:OfferAuthorityPool|null):Promise<Record<string,unknown>[]> {
  if(!listings.length)return [];
  let client:PoolClient|undefined;
  let transaction=false;
  let discard=false;
  try{
    const ids=listings.map(listing=>listingId.parse(listing.id));
    if(new Set(ids).size!==ids.length)throw new Error('Duplicate listing identity');
    if(!offerAuthorityPool){
      if(!await isPreOfferSchema(pool))throw new Error('W1 offer connection is unavailable');
      return projectRows(listings,ids,await readCanonical(pool,ids));
    }
    client=await offerAuthorityPool.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction=true;
    await client.query("SET LOCAL statement_timeout='5s'");
    const snapshot=(await client.query('SELECT * FROM listings WHERE id = ANY($1::int[]) ORDER BY id',[ids])).rows as Record<string,unknown>[];
    const current=new Map(snapshot.map(row=>[Number(row.id),row]));
    const currentListings=listings.map((incoming,index)=>{
      const row=current.get(ids[index]);
      if(!row||row.publication_status!=='published'||
        (incoming.publication_status!==undefined&&incoming.publication_status!==row.publication_status)||
        (incoming.user_id!==undefined&&Number(incoming.user_id)!==Number(row.user_id))||
        (incoming.slug!==undefined&&incoming.slug!==row.slug)||
        (incoming.currency!==undefined&&incoming.currency!==row.currency))
        throw new Error('Listing identity or publication changed during offer read');
      return row;
    });
    const canonical=await readCanonical(client,ids);
    const offers=await readPublicOfferAuthority(client,ids,new Date());
    const result=projectRows(currentListings,ids,canonical,offers);
    await client.query('COMMIT');
    transaction=false;
    return result;
  }catch(error){
    if(client&&transaction)try{await client.query('ROLLBACK');}catch{discard=true;}
    throw new PublicStayAuthorityError(error);
  }finally{client?.release(discard);}
}

export async function resolvePublicStayAuthority(pool:QueryPort,listing:Record<string,unknown>,
  offerAuthorityPool?:OfferAuthorityPool|null):Promise<Record<string,unknown>>{
  return (await resolvePublicStayAuthorities(pool,[listing],offerAuthorityPool))[0];
}
