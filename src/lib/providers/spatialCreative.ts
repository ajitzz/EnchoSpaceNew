import {createHash} from 'node:crypto';
import {z} from 'zod';
import type pg from 'pg';
import type {ProviderPublishRequest} from './types.js';
import {spatialSections} from '../../shared/marketingStory.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const spatialCreativeSchema=z.object({
  version:z.literal(1),id:z.string().uuid(),manifestHash:hash,
  cards:z.array(z.object({section:z.enum(spatialSections),title:z.string().min(1).max(25),imageUrl:z.string().url().max(2048),imageHash:hash,landingUrl:z.string().url().max(2048)}).strict()).length(4),
  images:z.array(z.object({width:z.number().int().positive(),height:z.number().int().positive(),sha256:hash,data:z.string().max(200000)}).strict()).max(2),
}).strict();
export type SpatialCreative=z.infer<typeof spatialCreativeSchema>;
export type ProviderStoryVerifier=(request:ProviderPublishRequest,c:pg.PoolClient)=>Promise<void>;

export function parseSpatialCreative(input:unknown,landing:string,provider:'GOOGLE'|'META'):SpatialCreative {
  const story=spatialCreativeSchema.parse(input),canonical=new URL(landing);
  if(new Set(story.cards.map(c=>c.section)).size!==4||new Set(story.cards.map(c=>c.title)).size!==4||story.images.length!==(provider==='GOOGLE'?2:0))throw new Error('SPATIAL_CREATIVE_INVALID');
  for(const card of story.cards){
    const url=new URL(card.landingUrl),image=new URL(card.imageUrl);
    if(url.origin!==canonical.origin||url.pathname!==canonical.pathname||url.hash!==`#${card.section}`||image.protocol!=='https:'||image.username||image.password||image.hash)throw new Error('SPATIAL_CREATIVE_INVALID');
  }
  for(const [index,image] of story.images.entries()){
    const bytes=Buffer.from(image.data,'base64'),size=index===0?[1080,1080]:[1200,628];
    if(bytes.length<1||bytes.length>150000||bytes.toString('base64')!==image.data||image.width!==size[0]||image.height!==size[1]||createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('SPATIAL_IMAGE_INVALID');
  }
  return story;
}
