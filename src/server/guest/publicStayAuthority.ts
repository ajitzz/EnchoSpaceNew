import type {Pool} from 'pg';
import {z} from 'zod';

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

export class PublicStayAuthorityError extends Error{
  readonly code='STAY_AUTHORITY_UNAVAILABLE';
  constructor(){super('Verified stay information is temporarily unavailable.');this.name='PublicStayAuthorityError';}
}

/** One relational authority for catalogue, detail and refresh. This read is not
 * an accepted sellable offer or booking quote. Every room/media link is keyed by
 * room_types.id; display names and old listing JSON are never join keys. */
export async function resolvePublicStayAuthorities(pool:Pick<Pool,'query'>,listings:Record<string,unknown>[]):Promise<Record<string,unknown>[]>{
  if(!listings.length)return [];
  try{
    const ids=listings.map(listing=>Number(z.union([z.string().regex(/^[1-9]\d*$/),z.number().int().positive()]).parse(listing.id)));
    if(new Set(ids).size!==ids.length)throw new Error('Duplicate listing identity');
    const [roomResult,mediaResult]=await Promise.all([
      pool.query('SELECT id, listing_id, name, type, icon, tag, currency, base_price, max_occupancy, features, amenities, description, specs FROM room_types WHERE listing_id = ANY($1::int[]) ORDER BY listing_id ASC, id ASC',[ids]),
      // Read statuses as well as approved rows, to distinguish absent authority
      // from an authoritative decision to withhold every asset.
      pool.query(`SELECT entity_id, room_type_id, url, tier, category, title, description, is_hero, is_sleeping_area, moderation_status
        FROM media_assets WHERE entity_id = ANY($1::int[]) AND entity_type = $2 ORDER BY entity_id ASC, order_index ASC, id ASC`,[ids,'listing']),
    ]);
    const rooms=z.array(room).parse(roomResult.rows),assets=z.array(media).parse(mediaResult.rows);
    const roomById=new Map(rooms.map(row=>[row.id,row]));
    for(const asset of assets){
      if(asset.room_type_id!==null && roomById.get(asset.room_type_id)?.listing_id!==asset.entity_id)
        throw new Error('Media room association does not belong to listing');
    }
    return listings.map((listing,index)=>{
    const id=ids[index],listingRooms=rooms.filter(row=>row.listing_id===id);
    const legacyRooms=typeof listing.rooms==='string'?JSON.parse(listing.rooms):listing.rooms;
    const result:Record<string,unknown>={...listing,
      room_state:listingRooms.length?'CANONICAL':Array.isArray(legacyRooms)&&legacyRooms.length?'LEGACY_DATA_UNRECONCILED':'NO_ROOM',
      price_state:'VERIFIED_OFFER_UNAVAILABLE',price:null,
      public_media_authority:'APPROVED_RELATIONAL'};
    result.rooms=listingRooms.map(row=>{
      if(row.currency!==listing.currency)throw new Error('Room currency conflicts with listing');
      return {canonical_room_id:row.id,name:row.name,type:row.type||row.name.toLowerCase().replace(/\s+/g,'_'),
        icon:row.icon||'🛏️',tag:row.tag||'',price:null,capacity:row.max_occupancy,
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
    return result;
    });
  }catch{throw new PublicStayAuthorityError();}
}

export async function resolvePublicStayAuthority(pool:Pick<Pool,'query'>,listing:Record<string,unknown>):Promise<Record<string,unknown>>{
  return (await resolvePublicStayAuthorities(pool,[listing]))[0];
}
