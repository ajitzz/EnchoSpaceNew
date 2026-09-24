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
const room=z.object({name:z.string().min(1),type:optionalText,icon:optionalText,tag:optionalText,
  base_price:price,max_occupancy:z.number().int().positive(),features:strings,amenities:strings,
  description:optionalText,specs:optionalText}).strict();
const media=z.object({url:z.string().min(1),tier:optionalText,category:optionalText,title:optionalText,
  description:optionalText,is_hero:z.boolean().nullable(),is_sleeping_area:z.boolean().nullable(),
  moderation_status:z.string().nullable()}).strict();

export class PublicStayAuthorityError extends Error{
  readonly code='STAY_AUTHORITY_UNAVAILABLE';
  constructor(){super('Verified stay information is temporarily unavailable.');this.name='PublicStayAuthorityError';}
}

/** Read authority before applying the existing public privacy allowlist. Missing
 * relational rows are the only legacy fallback: a failed read or zero approved
 * assets must never resurrect previously rejected legacy photos or hero URLs.
 * This is a presentation read, not a priced offer, inventory hold or booking. */
export async function resolvePublicStayAuthority(pool:Pick<Pool,'query'>,listing:Record<string,unknown>):Promise<Record<string,unknown>>{
  try{
    const id=z.union([z.string().regex(/^[1-9]\d*$/),z.number().int().positive()]).parse(listing.id);
    const [roomResult,mediaResult]=await Promise.all([
      pool.query('SELECT name, type, icon, tag, base_price, max_occupancy, features, amenities, description, specs FROM room_types WHERE listing_id = $1 ORDER BY id ASC',[id]),
      // Read statuses as well as approved rows, to distinguish absent authority
      // from an authoritative decision to withhold every asset.
      pool.query(`SELECT url, tier, category, title, description, is_hero, is_sleeping_area, moderation_status
        FROM media_assets WHERE entity_id = $1 AND entity_type = $2 ORDER BY order_index ASC, id ASC`,[id,'listing']),
    ]);
    const rooms=z.array(room).parse(roomResult.rows),assets=z.array(media).parse(mediaResult.rows);
    const result={...listing};
    if(rooms.length)result.rooms=rooms.map(row=>({name:row.name,type:row.type||row.name.toLowerCase().replace(/\s+/g,'_'),
      icon:row.icon||'🛏️',tag:row.tag||'',price:row.base_price,capacity:row.max_occupancy,
      description:row.description||'',specs:row.specs||'',features:row.features,amenities:row.amenities}));
    if(assets.length){
      const approved=assets.filter(asset=>asset.moderation_status==='approved');
      const urls=[...new Set(approved.map(asset=>asset.url))],allowed=new Set(urls);
      result.photos=approved.map(asset=>({url:asset.url,tier:asset.tier||'common',category:asset.category||'other',
        title:asset.title||'',description:asset.description||'',isHero:Boolean(asset.is_hero),
        is_sleeping_area:Boolean(asset.is_sleeping_area),moderation_status:'approved'}));
      result.image_urls=urls;
      result.image_url=typeof listing.image_url==='string'&&allowed.has(listing.image_url)?listing.image_url:(approved.find(asset=>asset.is_hero)?.url||urls[0]||'');
      for(const field of ['hero_video_url','video_url','hero_fallback_url','seo_image_url']){
        result[field]=typeof listing[field]==='string'&&allowed.has(listing[field])?listing[field]:undefined;
      }
    }
    return result;
  }catch{throw new PublicStayAuthorityError();}
}
