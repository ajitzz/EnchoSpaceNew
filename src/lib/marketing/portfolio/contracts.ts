import {z} from 'zod';
import {minorAmount} from '../domain.js';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.number().int().positive().safe();
export const productSchema=z.discriminatedUnion('kind',[
 z.object({version:z.literal(1),kind:z.literal('DEDICATED_STAY'),listingId:id,canonicalPath:z.string().regex(/^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/),factSnapshotId:z.string().uuid(),factHash:digest}).strict(),
 z.object({version:z.literal(1),kind:z.literal('DESTINATION_POOL'),poolId:z.string().uuid(),policyVersion:id,destinationPath:z.string().regex(/^\/explore\/[a-z0-9]+(?:-[a-z0-9]+)*$/)}).strict(),
]);
export type MarketingProduct=z.infer<typeof productSchema>;
export const poolMembershipStateSchema=z.enum(['INVITED','CONSENTED','ELIGIBLE','ACTIVE','PAUSED','WITHDRAWN','EXPIRED','INELIGIBLE']);
export const poolContributionSchema=z.object({
 version:z.literal(1),membershipId:z.string().uuid(),acceptedQuoteId:z.string().uuid(),reservationId:z.string().uuid(),
 hostId:id,currency:z.enum(['INR','USD']),authorizedMinor:minorAmount.refine(v=>BigInt(v)>0n),policyVersion:id,
 allocationUnit:z.literal('COLLECTION_EXPOSURE'),providerImpressionGuarantee:z.literal(false),transferable:z.literal(false),
}).strict();
// Service-side records only: neither product nor contribution schemas authorize a payment.
export const factCaptureSchema=z.object({listingId:id,expectedHash:digest,assets:z.array(z.object({sourceAssetId:z.string().regex(/^[1-9]\d*$/),derivativeId:z.string().uuid(),manifestHash:digest}).strict()).max(6).refine(a=>new Set(a.map(v=>v.derivativeId)).size===a.length,'Choose each prepared asset once')}).strict();
export interface CanonicalMarketingFact {
 id:string;
 source:'PUBLISHED_LISTING'|'CANONICAL_ROOM';
 sourceId:number;
 field:string;
 value:string;
 authority:'HOST_SUPPLIED_PUBLISHED';
}
export interface CanonicalMarketingFactProjection {
 version:1;
 listingId:number;
 hostId:number;
 canonicalPath:string;
 listingHash:string;
 factHash:string;
 facts:CanonicalMarketingFact[];
}
