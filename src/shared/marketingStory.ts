import {z} from 'zod';

export const spatialSections = ['vistas', 'suites', 'wellness', 'grounds'] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const selection = z.object({
  sourceAssetId: z.string().regex(/^[1-9]\d*$/),
  derivativeId: z.string().uuid(),
  manifestHash: digest,
}).strict();
export const storyCaptureSchema = z.object({
  listingId: z.number().int().positive().safe(),
  factHash: digest,
  cards: z.array(z.object({section:z.enum(spatialSections), factId:digest, image:selection}).strict()).length(4),
  landscapeImage: selection,
  rightsConfirmed: z.literal(true),
}).strict().superRefine((v,c) => {
  for (const [key, values] of [
    ['section', v.cards.map(card=>card.section)],
    ['factId', v.cards.map(card=>card.factId)],
    ['sourceAssetId', v.cards.map(card=>card.image.sourceAssetId)],
  ] as const) if (new Set(values).size !== 4) c.addIssue({code:'custom',path:['cards'],message:`Choose four distinct ${key} values`});
});
export const storyReviewSchema = z.object({
  manifestHash: digest,
  decision: z.enum(['APPROVE','REVOKE']),
  reason: z.string().trim().min(20).max(2000),
  spatialAccuracyConfirmed: z.literal(true),
}).strict();
export interface StoryImage {
  sourceAssetId:string; derivativeId:string; manifestHash:string;
  url:string; originalSourceUrl:string; outputHash:string;
  width:number; height:number; byteLength:number;
}
export interface SpatialStory {
  version:1; listingId:number; hostId:number; canonicalPath:string; factHash:string;
  cards:Array<{section:typeof spatialSections[number];factId:string;title:string;image:StoryImage}>;
  landscapeImage:StoryImage;
}
export interface StoryEvidence {id:string; manifestHash:string; manifest:SpatialStory;}

/** Neutral framing adds no amenity, price, availability, quality or outcome claim. */
export function spatialStoryCopy(provider:'GOOGLE'|'META'){
 const headline='Explore this stay on Encho';
 const description='Check photos, rooms and published stay details on Encho.';
 return {headline,description,...provider==='GOOGLE'?{googleSearch:{headlines:[headline,'View the property details','Plan your next stay'],descriptions:[description,'Explore the property and choose your preferred stay dates.']}}:{}};
}
